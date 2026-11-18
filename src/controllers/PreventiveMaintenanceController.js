const { randomUUID } = require("node:crypto");
const {
  sequelize,
  PreventiveMaintenance,
  Machine,
  WorkOrder,
  MasterRecord,
} = require("../models");
const BaseController = require("./BaseController");
const {
  assertRecordAccess,
  filterRecords,
} = require("../middleware/data-scope");
const {
  generatePlan,
  nextDate,
} = require("../services/maintenance-scheduling");
const { requireAction } = require("../services/movement-workflow");
const { recordEvent } = require("../services/maintenance-events");
const HttpError = require("../errors/http-error");
class PreventiveMaintenanceController extends BaseController {
  constructor() {
    super(PreventiveMaintenance, {
      include: [{ model: Machine, as: "machine" }],
    });
  }
  async create(req, res, next) {
    return this.save(req, res, next, true);
  }
  async update(req, res, next) {
    return this.save(req, res, next, false);
  }
  async save(req, res, next, creating) {
    try {
      const result = await sequelize.transaction(async (transaction) => {
        const current = creating
          ? null
          : await PreventiveMaintenance.findByPk(req.params.id, {
              transaction,
              lock: transaction.LOCK.UPDATE,
            });
        if (!creating && !current)
          throw new HttpError(404, "Maintenance plan not found");
        if (current) assertRecordAccess(req, current);
        const body = { ...(current?.toJSON() || {}), ...req.body };
        const machine = await Machine.findByPk(body.machineId, { transaction });
        if (!machine || machine.archivedAt)
          throw new HttpError(422, "Select an active machine");
        assertRecordAccess(req, machine);
        if (current && current.machineId !== machine.id)
          throw new HttpError(
            422,
            "A plan remains linked to its original machine",
          );
        if (!String(body.task || "").trim())
          throw new HttpError(422, "Maintenance task is required");
        const details = {
          ...(current?.details || {}),
          ...(body.details || {}),
        };
        const settings =
          await require("../services/maintenance-configuration").configuration(
            {
              ...req,
              query: {
                ...req.query,
                organizationId: machine.organizationId,
                factoryId: machine.factoryId,
              },
            },
            transaction,
          );
        const rule =
          settings.maintenanceFrequencies.find(
            (item) => item.name === body.frequency,
          ) ||
          (body.frequency === "Custom Frequency"
            ? {
                name: "Custom Frequency",
                unit: "Days",
                interval: Number(details.interval || 1),
              }
            : null);
        if (!rule)
          throw new HttpError(422, "Select a configured maintenance frequency");
        if (details.mechanicId) {
          const mechanic = await require("../models").Technician.findByPk(
            details.mechanicId,
            { transaction },
          );
          if (!mechanic?.active || mechanic.factoryId !== machine.factoryId)
            throw new HttpError(
              422,
              "Select an active mechanic in the machine factory",
            );
        }
        details.frequencyRule = {
          ...rule,
          interval: Number(details.interval || rule.interval),
        };
        if (
          details.nextMeter !== undefined &&
          (!Number.isFinite(Number(details.nextMeter)) ||
            Number(details.nextMeter) <= 0)
        )
          throw new HttpError(422, "Next meter target must be positive");
        if (
          !Array.isArray(details.checklist || []) ||
          !(details.checklist || []).every(
            (item) => typeof item === "string" && item.trim(),
          )
        )
          throw new HttpError(422, "Checklist must contain nonempty tasks");
        const due = new Date(body.nextDue);
        if (!Number.isFinite(due.getTime()))
          throw new HttpError(422, "A valid next due date is required");
        if (
          !Number.isFinite(details.frequencyRule.interval) ||
          details.frequencyRule.interval <= 0
        )
          throw new HttpError(422, "A positive frequency interval is required");
        if (
          ["Days", "Months"].includes(rule.unit) &&
          !Number.isSafeInteger(details.frequencyRule.interval)
        )
          throw new HttpError(
            422,
            "Calendar intervals must use whole days or months",
          );
        if (["Days", "Months"].includes(rule.unit))
          nextDate(
            due,
            rule.unit === "Months" ? "Custom Months" : "Custom Frequency",
            details.frequencyRule.interval,
          );
        const values = {
          machineId: machine.id,
          organizationId: machine.organizationId,
          factoryId: machine.factoryId,
          task: body.task.trim(),
          frequency: body.frequency,
          nextDue: due,
          ownerName: body.ownerName || null,
          details,
        };
        const plan = current
          ? await current.update(values, { transaction })
          : await PreventiveMaintenance.create(
              { ...values, id: randomUUID() },
              { transaction },
            );
        await recordEvent({
          machine,
          type: "maintenance-plan",
          summary: `${creating ? "Created" : "Updated"} plan: ${plan.task}`,
          details: { planId: plan.id },
          req,
          transaction,
        });
        return plan;
      });
      res.status(creating ? 201 : 200).json({ result });
    } catch (error) {
      next(error);
    }
  }
  async generate(req, res, next) {
    try {
      requireAction(req, "preventive-maintenance", "GENERATE");
      res.json({ result: await generatePlan(req, req.params.id) });
    } catch (error) {
      next(error);
    }
  }
  async occurrences(req, res, next) {
    try {
      const plan = await PreventiveMaintenance.findByPk(req.params.id);
      if (!plan) throw new HttpError(404, "Maintenance plan not found");
      assertRecordAccess(req, plan);
      const rows = await MasterRecord.findAll({
        where: { module: "pm-occurrences" },
        order: [["createdAt", "DESC"]],
      });
      res.json({
        result: filterRecords(req, rows)
          .filter((row) => row.data.planId === plan.id)
          .map((row) => ({ id: row.id, status: row.status, ...row.data })),
      });
    } catch (error) {
      next(error);
    }
  }
  async delete(req, res, next) {
    req.body = { details: { active: false } };
    return this.update(req, res, next);
  }
  rejectBulk(req, res) {
    res
      .status(405)
      .json({
        error: { message: "Use individual maintenance plan endpoints" },
      });
  }
  createBatch(req, res) {
    this.rejectBulk(req, res);
  }
  updateBatch(req, res) {
    this.rejectBulk(req, res);
  }
  updateWithFilter(req, res) {
    this.rejectBulk(req, res);
  }
  updateAllByCustomKey(req, res) {
    this.rejectBulk(req, res);
  }
}
module.exports = new PreventiveMaintenanceController();
