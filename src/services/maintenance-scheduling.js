const { randomUUID } = require("node:crypto");
const {
  sequelize,
  PreventiveMaintenance,
  Machine,
  WorkOrder,
  MasterRecord,
} = require("../models");
const { assertRecordAccess } = require("../middleware/data-scope");
const { recordEvent } = require("./maintenance-events");
const HttpError = require("../errors/http-error");

const months = { Monthly: 1, Quarterly: 3, "Half-Yearly": 6, Yearly: 12 };
function nextDate(value, frequency, interval = 1) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new HttpError(422, "A valid planned date is required");
  const monthInterval =
    months[frequency] || (frequency === "Custom Months" ? Number(interval) : 0);
  if (monthInterval) {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + monthInterval);
    const end = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate();
    date.setUTCDate(Math.min(day, end));
  } else {
    const days =
      frequency === "Daily"
        ? 1
        : frequency === "Weekly"
          ? 7
          : frequency === "Custom Frequency"
            ? Number(interval)
            : 0;
    if (!Number.isFinite(days) || days <= 0)
      throw new HttpError(
        422,
        "A supported frequency and positive interval are required",
      );
    date.setUTCDate(date.getUTCDate() + days);
  }
  return date;
}

async function generatePlan(req, id, now = new Date()) {
  return sequelize.transaction(async (transaction) => {
    const plan = await PreventiveMaintenance.findByPk(id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!plan) throw new HttpError(404, "Maintenance plan not found");
    assertRecordAccess(req, plan);
    if (plan.details.active === false) return [];
    const machine = await Machine.findByPk(plan.machineId, { transaction });
    if (!machine || machine.archivedAt) return [];
    const rule = plan.details.frequencyRule;
    const usage = rule
      ? ["Hours", "Quantity"].includes(rule.unit)
      : ["Operating Hours Based", "Production Quantity Based"].includes(
          plan.frequency,
        );
    const interval = Number(rule?.interval || plan.details.interval || 1);
    if (interval <= 0 || !Number.isFinite(interval))
      throw new HttpError(422, "A positive interval is required");
    let due = new Date(plan.nextDue);
    let meter = Number(plan.details.nextMeter || interval);
    const reading = Number(
      rule?.unit === "Hours" || plan.frequency === "Operating Hours Based"
        ? machine.operatingHours
        : machine.productionQuantity,
    );
    const generated = [];
    for (
      let count = 0;
      count < 100 && (usage ? reading >= meter : due <= now);
      count++
    ) {
      const code = `${plan.id}:${usage ? meter : due.toISOString()}`;
      const existing = await MasterRecord.findOne({
        where: { module: "pm-occurrences", code },
        transaction,
      });
      if (!existing) {
        const order = await WorkOrder.create(
          {
            id: randomUUID(),
            machineId: machine.id,
            organizationId: machine.organizationId,
            factoryId: machine.factoryId,
            issue: plan.task,
            status: "Submitted",
            priority: plan.details.priority || "Medium",
            dueAt: new Date(
              (usage ? now : due).getTime() +
                Number(plan.details.estimatedDuration || 60) * 60000,
            ),
            details: {
              type: "Preventive Maintenance",
              planId: plan.id,
              instructions: plan.details.instructions || "",
              plannedMechanicId: plan.details.mechanicId || null,
              checklist: plan.details.checklist || [],
              scheduledMeter: usage ? meter : null,
              scheduledAt: usage ? now.toISOString() : due.toISOString(),
            },
          },
          { transaction },
        );
        await MasterRecord.create(
          {
            module: "pm-occurrences",
            code,
            name: plan.task,
            organizationId: machine.organizationId,
            factoryId: machine.factoryId,
            status: "Scheduled",
            data: {
              planId: plan.id,
              machineId: machine.id,
              workOrderId: order.id,
              scheduledAt: usage ? now.toISOString() : due.toISOString(),
              dueAt: order.dueAt.toISOString(),
              scheduledMeter: usage ? meter : null,
            },
          },
          { transaction },
        );
        await recordEvent({
          machine,
          type: "preventive-maintenance",
          summary: `Scheduled: ${plan.task}`,
          details: { planId: plan.id, workOrderId: order.id },
          req,
          transaction,
          notify: true,
        });
        generated.push(order);
      }
      if (usage) meter += interval;
      else
        due = nextDate(
          due,
          rule
            ? rule.unit === "Months"
              ? "Custom Months"
              : "Custom Frequency"
            : plan.frequency,
          interval,
        );
    }
    await plan.update(
      {
        nextDue: due,
        details: {
          ...plan.details,
          nextMeter: usage ? meter : plan.details.nextMeter,
        },
      },
      { transaction },
    );
    return generated;
  });
}

module.exports = { nextDate, generatePlan };
