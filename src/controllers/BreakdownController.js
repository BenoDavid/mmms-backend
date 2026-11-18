const { randomUUID } = require("node:crypto");
const { sequelize, Breakdown, Machine, WorkOrder } = require("../models");
const BaseController = require("./BaseController");
const { assertRecordAccess } = require("../middleware/data-scope");
const { recordEvent } = require("../services/maintenance-events");
const HttpError = require("../errors/http-error");
const {
  beginSubmission,
  finishSubmission,
} = require("../services/submission-idempotency");
class BreakdownController extends BaseController {
  constructor() {
    super(Breakdown, { include: [{ model: Machine, as: "machine" }] });
  }
  async create(req, res, next) {
    try {
      const result = await sequelize.transaction(async (transaction) => {
        const machine = await Machine.findByPk(req.body.machineId, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!machine || machine.archivedAt)
          throw new HttpError(422, "Select an active machine");
        assertRecordAccess(req, machine);
        const submission = await beginSubmission(req, transaction);
        if (submission?.existing)
          return Breakdown.findByPk(submission.existing.data.resultId, {
            transaction,
          });
        if (!String(req.body.category || "").trim())
          throw new HttpError(422, "Breakdown category is required");
        const startedAt = req.body.startedAt
          ? new Date(req.body.startedAt)
          : new Date();
        if (!Number.isFinite(startedAt.getTime()) || startedAt > new Date())
          throw new HttpError(
            422,
            "Breakdown start time must be a valid past or current time",
          );
        const severity = req.body.details?.severity || "Medium";
        if (!["Critical", "High", "Medium", "Low"].includes(severity))
          throw new HttpError(422, "Select a valid severity");
        const details = {
          description: String(
            req.body.details?.description ||
              req.body.description ||
              req.body.category,
          ),
          severity,
          productionImpact: String(req.body.details?.productionImpact || ""),
          attachments: req.body.details?.attachments || [],
          reportedBy: String(req.auth?.sub || "system"),
          reportedAt: new Date().toISOString(),
          location: {
            department: machine.department,
            floor: machine.floor,
            productionLine: machine.productionLine,
            currentLocation: machine.currentLocation,
            category: machine.category,
            ...machine.locationIds,
          },
        };
        const breakdown = await Breakdown.create(
          {
            id: randomUUID(),
            machineId: machine.id,
            organizationId: machine.organizationId,
            factoryId: machine.factoryId,
            category: req.body.category,
            startedAt,
            status: "Open",
            details,
          },
          { transaction },
        );
        const order = await WorkOrder.create(
          {
            id: randomUUID(),
            machineId: machine.id,
            organizationId: machine.organizationId,
            factoryId: machine.factoryId,
            issue: details.description.slice(0, 255),
            priority: severity,
            status: "Submitted",
            details: { type: "Breakdown Repair", breakdownId: breakdown.id },
          },
          { transaction },
        );
        await breakdown.update(
          { details: { ...details, workOrderId: order.id } },
          { transaction },
        );
        await finishSubmission(submission, breakdown, machine, transaction);
        await machine.update({ status: "Breakdown" }, { transaction });
        await recordEvent({
          machine,
          type: "breakdown",
          summary: `${severity} breakdown: ${req.body.category}`,
          details: {
            breakdownId: breakdown.id,
            workOrderId: order.id,
            severity,
          },
          req,
          transaction,
          notify: true,
        });
        return breakdown;
      });
      res.status(201).json({ result });
    } catch (error) {
      next(error);
    }
  }
  async update(req, res, next) {
    try {
      const result = await sequelize.transaction(async (transaction) => {
        const row = await Breakdown.findByPk(req.params.id, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!row) throw new HttpError(404, "Breakdown not found");
        assertRecordAccess(req, row);
        if (row.status === "Resolved")
          throw new HttpError(
            422,
            "Resolved breakdown history cannot be rewritten",
          );
        if (req.body.machineId && req.body.machineId !== row.machineId)
          throw new HttpError(
            422,
            "A breakdown stays linked to its original machine",
          );
        if (req.body.status === "Resolved")
          throw new HttpError(
            422,
            "Verify and close the linked repair work order to resolve this breakdown",
          );
        const values = Object.fromEntries(
          ["rootCause", "resolutionActions"]
            .filter((key) => req.body[key] !== undefined)
            .map((key) => [key, req.body[key]]),
        );
        if (
          req.body.status &&
          !["Open", "Investigating"].includes(req.body.status)
        )
          throw new HttpError(422, "Invalid breakdown status");
        if (req.body.status) values.status = req.body.status;
        await row.update(values, { transaction });
        const machine = await Machine.findByPk(row.machineId, { transaction });
        await recordEvent({
          machine,
          type: "breakdown",
          summary: "Breakdown diagnosis updated",
          details: { breakdownId: row.id, ...values },
          req,
          transaction,
        });
        return row;
      });
      res.json({ result });
    } catch (error) {
      next(error);
    }
  }
  rejectBulk(req, res) {
    res
      .status(405)
      .json({
        error: {
          message:
            "Use individual breakdown and repair endpoints to retain history",
        },
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
  delete(req, res) {
    this.rejectBulk(req, res);
  }
}
module.exports = new BreakdownController();
