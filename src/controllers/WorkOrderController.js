const { randomUUID } = require("node:crypto");
const { Op } = require("sequelize");
const {
  sequelize,
  WorkOrder,
  Machine,
  MachineHistory,
  Technician,
  Breakdown,
} = require("../models");
const BaseController = require("./BaseController");
const HttpError = require("../errors/http-error");
const {
  assertRecordAccess,
  filterRecords,
} = require("../middleware/data-scope");
const {
  workflowValues,
  assertWorkflowPermission,
} = require("../services/work-order-workflow");

const include = [
  { model: Machine, as: "machine", attributes: ["id", "name", "machineCode"] },
  { model: Technician, as: "technician" },
];
const editableFields = [
  "issue",
  "description",
  "priority",
  "dueAt",
  "diagnosis",
  "repairNotes",
  "completionNotes",
  "laborMinutes",
  "partsCost",
  "contractorCost",
];
const pick = (body, keys) =>
  Object.fromEntries(
    keys
      .filter((key) => body[key] !== undefined)
      .map((key) => [key, body[key]]),
  );
const actorId = (req) => String(req.auth?.sub || req.auth?.userId || "system");
const {
  validateCustomFields,
} = require("../services/maintenance-configuration");
const { recordEvent } = require("../services/maintenance-events");
async function validateTeam(req, team, factoryId, transaction) {
  if (team === undefined) return;
  require("../services/movement-workflow").requireAction(req, "work-orders", "ASSIGN");
  if (
    !Array.isArray(team) ||
    team.length > 30 ||
    new Set(team).size !== team.length
  )
    throw new HttpError(422, "Supporting mechanics must be a unique list");
  for (const id of team) {
    const mechanic = await Technician.findByPk(id, { transaction });
    if (!mechanic?.active || mechanic.factoryId !== factoryId)
      throw new HttpError(
        422,
        "Supporting mechanics must be active in the machine factory",
      );
    assertRecordAccess(req, mechanic);
  }
}
const detailValues = (body, current = {}) => ({
  ...current,
  ...pick(body || {}, [
    "type",
    "team",
    "instructions",
    "plannedStartDate",
    "plannedEndDate",
    "estimatedDuration",
    "checklistResults",
    "attachments",
    "requiredParts",
    "safetyChecks",
    "customFields",
  ]),
});

class WorkOrderController extends BaseController {
  constructor() {
    super(WorkOrder, { include });
  }

  async getAll(req, res, next) {
    if (req.query.personal !== "true") return super.getAll(req, res, next);
    try {
      const mechanics = filterRecords(req, await Technician.findAll());
      const mechanic = mechanics.find(
        (row) =>
          String(row.details?.userCode || row.details?.userId) ===
          String(req.auth?.sub),
      );
      const orders = mechanic
        ? filterRecords(
            req,
            await WorkOrder.findAll({
              include,
              order: [["updatedAt", "DESC"]],
            }),
          ).filter(
            (row) =>
              row.technicianId === mechanic.id ||
              (row.details.team || []).includes(mechanic.id),
          )
        : [];
      res.json({ result: orders, total: orders.length });
    } catch (error) {
      next(error);
    }
  }

  async create(req, res, next) {
    try {
      const result = await sequelize.transaction(async (transaction) => {
        const machine = await Machine.findByPk(req.body.machineId, {
          transaction,
        });
        if (!machine || machine.archivedAt) throw new HttpError(422, "Select an active machine");
        assertRecordAccess(req, machine);
        this.validateCosts(req.body);
        this.validatePartsCost(req.body);
        await validateCustomFields(
          {
            ...req,
            query: {
              organizationId: machine.organizationId,
              factoryId: machine.factoryId,
            },
          },
          "work-orders",
          req.body.details?.customFields,
          transaction,
        );
        await validateTeam(
          req,
          req.body.details?.team,
          machine.factoryId,
          transaction,
        );
        if (typeof req.body.issue !== "string" || !req.body.issue.trim())
          throw new HttpError(422, "A work description is required");
        if (req.body.status && !["Draft", "Open"].includes(req.body.status))
          throw new HttpError(
            422,
            "Create an order as Draft, then use the workflow actions",
          );
        const order = await WorkOrder.create(
          {
            ...pick(req.body, editableFields),
            details: {
              ...detailValues(req.body.details),
              requestedBy: actorId(req),
              location: {
                department: machine.department,
                floor: machine.floor,
                category: machine.category,
                ...machine.locationIds,
              },
            },
            id: randomUUID(),
            machineId: machine.id,
            organizationId: machine.organizationId,
            factoryId: machine.factoryId,
            status: req.body.status || "Draft",
          },
          { transaction },
        );
        await this.recordEvent(
          req,
          order,
          "Created",
          null,
          order.status,
          transaction,
        );
        return order;
      });
      res.status(201).json({ result });
    } catch (error) {
      next(error);
    }
  }

  async update(req, res, next) {
    try {
      const order = await WorkOrder.findByPk(req.params.id);
      if (!order) throw new HttpError(404, "Work order not found");
      assertRecordAccess(req, order);
      if (req.body.machineId && req.body.machineId !== order.machineId)
        throw new HttpError(
          422,
          "A work order remains linked to its original machine",
        );
      if (req.body.status && req.body.status !== order.status)
        return this.transition(req, res, next);
      await sequelize.transaction(async (transaction) => {
        const current = await WorkOrder.findByPk(req.params.id, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (["Verified", "Closed", "Cancelled"].includes(current.status))
          throw new HttpError(
            422,
            "Finalized work orders retain their historical details",
          );
        const values = pick(req.body, editableFields);
        values.details = detailValues(req.body.details, current.details);
        await validateCustomFields(
          {
            ...req,
            query: {
              organizationId: current.organizationId,
              factoryId: current.factoryId,
            },
          },
          "work-orders",
          values.details.customFields,
          transaction,
        );
        if (
          JSON.stringify(values.details.team) !==
          JSON.stringify(current.details.team)
        )
          await validateTeam(
            req,
            values.details.team,
            current.factoryId,
            transaction,
          );
        if (
          req.body.technicianId &&
          req.body.technicianId !== current.technicianId
        ) {
          require("../services/movement-workflow").requireAction(req, "work-orders", "ASSIGN");
          if (current.status !== "Assigned")
            throw new HttpError(
              422,
              "Reassignment requires an assigned work order",
            );
          if (!String(req.body.rejectionReason || "").trim())
            throw new HttpError(422, "Record the reason for reassignment");
          const technician = await Technician.findByPk(req.body.technicianId, {
            transaction,
          });
          if (!technician?.active || technician.factoryId !== current.factoryId)
            throw new HttpError(
              422,
              "Select an active mechanic in the machine factory",
            );
          assertRecordAccess(req, technician);
          values.details.assignmentHistory = [
            ...(current.details.assignmentHistory || []),
            {
              from: current.technicianId,
              to: technician.id,
              reason: req.body.rejectionReason,
              at: new Date().toISOString(),
              by: actorId(req),
            },
          ];
          Object.assign(values, {
            technicianId: technician.id,
            technicianName: technician.name,
            assignedAt: new Date(),
            assignedBy: actorId(req),
          });
        }
        if (
          values.issue !== undefined &&
          (typeof values.issue !== "string" || !values.issue.trim())
        )
          throw new HttpError(422, "A work description is required");
        this.validateCosts(values);
        this.validatePartsCost(req.body, current.partsCost);
        await current.update(values, { transaction });
        await this.recordEvent(
          req,
          current,
          "Edited",
          current.status,
          current.status,
          transaction,
        );
      });
      res.json({
        result: await WorkOrder.findByPk(req.params.id, { include }),
      });
    } catch (error) {
      next(error);
    }
  }

  async transition(req, res, next) {
    try {
      await sequelize.transaction(async (transaction) => {
        // Lock the machine before its orders to serialize closures for the same asset.
        const reference = await WorkOrder.findByPk(req.params.id, {
          transaction,
        });
        if (!reference) throw new HttpError(404, "Work order not found");
        assertRecordAccess(req, reference);
        const machine = await Machine.findByPk(reference.machineId, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        const order = await WorkOrder.findByPk(req.params.id, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        assertWorkflowPermission(req, req.body.status);
        if (
          req.body.status === "In Progress" &&
          [
            "Completed",
            "Repair Completed",
            "Verification",
            "Verified",
          ].includes(order.status)
        )
          require("../services/movement-workflow").requireAction(
            req,
            "work-orders",
            "REJECT",
          );
        if (req.body.status === "Approved")
          await require("../services/approval-policy").assertApprovalPolicy(
            req,
            "work-orders",
            order,
            order.details.requestedBy,
            transaction,
          );
        this.validatePartsCost(req.body, order.partsCost);
        const values = workflowValues(order, req.body, actorId(req));
        values.details = detailValues(
          req.body.details,
          values.details || order.details,
        );
        if (values.status === "In Progress" && !order.startedAt) {
          const settings =
            await require("../services/maintenance-configuration").configuration(
              {
                ...req,
                query: {
                  ...req.query,
                  organizationId: order.organizationId,
                  factoryId: order.factoryId,
                },
              },
              transaction,
            );
          values.details.laborRatePerHour = settings.laborRatePerHour;
        }
        if (
          JSON.stringify(values.details.team) !==
          JSON.stringify(order.details.team)
        )
          await validateTeam(
            req,
            values.details.team,
            order.factoryId,
            transaction,
          );
        const mechanicId = values.technicianId || order.technicianId;
        if (mechanicId) {
          const technician = await Technician.findByPk(mechanicId, {
            transaction,
          });
          if (
            !technician ||
            (!technician.active &&
              (values.status === "Assigned" ||
                (values.technicianId &&
                  values.technicianId !== order.technicianId)))
          )
            throw new HttpError(422, "Select an active mechanic");
          assertRecordAccess(req, technician);
          if (
            technician.factoryId &&
            order.factoryId &&
            technician.factoryId !== order.factoryId
          )
            throw new HttpError(
              422,
              "The mechanic must belong to the machine factory",
            );
          values.technicianName = technician.name;
        }
        const previous = order.status;
        await order.update(values, { transaction });
        await this.recordEvent(
          req,
          order,
          "Workflow",
          previous,
          values.status,
          transaction,
        );
        if (
          values.status === "In Progress" &&
          machine &&
          !["Decommissioned", "Scrapped"].includes(machine.status)
        )
          await machine.update(
            { status: "Under Maintenance" },
            { transaction },
          );
        if (values.status === "Closed" && machine) {
          const { MasterRecord } = require("../models");
          const postedExpenses = await MasterRecord.findAll({
            where: { module: "expenses", status: "Posted" },
            transaction,
          });
          for (const [category, amount] of [
            [
              "Labour Cost",
              (Number(order.laborMinutes || 0) / 60) *
                Number(order.details.laborRatePerHour || 0),
            ],
            ["External Service Cost", Number(order.contractorCost || 0)],
          ]) {
            if (
              amount > 0 &&
              !postedExpenses.some(
                (row) =>
                  row.data.workOrderId === order.id &&
                  row.data.category === category,
              )
            )
              await MasterRecord.create(
                {
                  module: "expenses",
                  name: `${category}: ${order.issue}`.slice(0, 180),
                  organizationId: order.organizationId,
                  factoryId: order.factoryId,
                  status: "Posted",
                  data: {
                    machineId: machine.id,
                    machine: machine.name,
                    workOrderId: order.id,
                    category,
                    amount,
                    currency: order.details.currency || "USD",
                    description: `${category}: ${order.issue}`,
                    occurredAt: new Date().toISOString(),
                    sourceWorkOrderId: order.id,
                    attachments: [],
                  },
                },
                { transaction },
              );
          }
          if (order.details.breakdownId) {
            const breakdown = await Breakdown.findByPk(
              order.details.breakdownId,
              { transaction, lock: transaction.LOCK.UPDATE },
            );
            if (breakdown)
              await breakdown.update(
                {
                  status: "Resolved",
                  endedAt: new Date(),
                  rootCause: order.diagnosis,
                  resolutionActions: order.repairNotes,
                },
                { transaction },
              );
          }
          if (order.details.planId) {
            const { MasterRecord } = require("../models");
            const occurrences = await MasterRecord.findAll({
              where: { module: "pm-occurrences" },
              transaction,
            });
            for (const occurrence of occurrences.filter(
              (row) => row.data.workOrderId === order.id,
            ))
              await occurrence.update(
                {
                  status: "Completed",
                  data: {
                    ...occurrence.data,
                    completedAt: new Date().toISOString(),
                    completedBy: actorId(req),
                  },
                },
                { transaction },
              );
          }
          const otherOrders = await WorkOrder.count({
            where: {
              machineId: order.machineId,
              id: { [Op.ne]: order.id },
              status: { [Op.notIn]: ["Closed", "Cancelled", "Draft"] },
            },
            transaction,
          });
          const breakdowns = await Breakdown.count({
            where: {
              machineId: order.machineId,
              status: { [Op.ne]: "Resolved" },
            },
            transaction,
          });
          if (
            !otherOrders &&
            !breakdowns &&
            machine.status === "Under Maintenance"
          )
            await machine.update({ status: "Running" }, { transaction });
        }
      });
      res.json({
        result: await WorkOrder.findByPk(req.params.id, { include }),
      });
    } catch (error) {
      next(error);
    }
  }

  validateCosts(values) {
    for (const key of ["laborMinutes", "partsCost", "contractorCost"]) {
      if (
        values[key] !== undefined &&
        (!Number.isFinite(Number(values[key])) || Number(values[key]) < 0)
      )
        throw new HttpError(422, `${key} must be a nonnegative number`);
    }
  }

  validatePartsCost(input, current = 0) {
    if (input.partsCost !== undefined && Number(input.partsCost) !== Number(current || 0)) throw new HttpError(409, 'Parts cost is maintained by inventory consumption and returns. Refresh this order after posting stock transactions.');
  }



  async recordEvent(req, order, action, from, to, transaction) {
    if (
      ["Assigned", "Completed", "Verification", "Repair Completed"].includes(
        to,
      ) &&
      from !== to
    )
      await recordEvent({
        type:
          to === "Assigned"
            ? "work-order-assignment"
            : "repair-verification-due",
        summary: `${to}: ${order.issue}`,
        details: {
          organizationId: order.organizationId,
          factoryId: order.factoryId,
          workOrderId: order.id,
          mechanicId: order.technicianId,
        },
        req,
        transaction,
        notify: true,
      });
    return MachineHistory.create(
      {
        id: randomUUID(),
        machineId: order.machineId,
        eventType: "work-order",
        summary: `${action}: ${order.issue}`.slice(0, 255),
        actorId: actorId(req),
        occurredAt: new Date(),
        details: {
          workOrderId: order.id,
          from,
          to,
          technicianId: order.technicianId,
          reason: req.body.rejectionReason || null,
          diagnosis: order.diagnosis,
          repairNotes: order.repairNotes,
          completionNotes: order.completionNotes,
          verificationNotes: order.verificationNotes,
        },
      },
      { transaction },
    );
  }

  // Bulk writes bypass workflow validation; use the individual domain endpoints.
  rejectBulk(req, res) {
    return res
      .status(405)
      .json({
        error: {
          message:
            "Use individual work-order and workflow endpoints to preserve validation and history",
        },
      });
  }
  async history(req, res, next) {
    try {
      const order = await WorkOrder.findByPk(req.params.id);
      if (!order) throw new HttpError(404, "Work order not found");
      assertRecordAccess(req, order);
      const rows = await MachineHistory.findAll({
        where: { machineId: order.machineId },
        order: [["occurredAt", "DESC"]],
      });
      res.json({
        result: rows.filter((row) => row.details.workOrderId === order.id),
      });
    } catch (error) {
      next(error);
    }
  }
  createBatch(req, res) {
    return this.rejectBulk(req, res);
  }
  updateBatch(req, res) {
    return this.rejectBulk(req, res);
  }
  updateWithFilter(req, res) {
    return this.rejectBulk(req, res);
  }
  updateAllByCustomKey(req, res) {
    return this.rejectBulk(req, res);
  }
  delete(req, res) {
    return res
      .status(405)
      .json({
        error: {
          message:
            "Cancel work orders through the workflow to preserve maintenance history",
        },
      });
  }
}

module.exports = new WorkOrderController();
