const { randomUUID } = require("node:crypto");
const { sequelize, MasterRecord, Machine, WorkOrder } = require("../models");
const {
  assertRecordAccess,
  filterRecords,
} = require("../middleware/data-scope");
const { recordEvent } = require("../services/maintenance-events");
const HttpError = require("../errors/http-error");
const present = (row) => ({
  ...row.data,
  id: row.id,
  code: row.code,
  status: row.status,
  organizationId: row.organizationId,
  factoryId: row.factoryId,
});

class InspectionController {
  async list(req, res) {
    const rows = await MasterRecord.findAll({
      where: { module: "inspections" },
      order: [["createdAt", "DESC"]],
    });
    res.json({ result: filterRecords(req, rows).map(present) });
  }
  async create(req, res) {
    const row = await sequelize.transaction(async (transaction) => {
      const machine = await Machine.findByPk(req.body.machineId, {
        transaction,
      });
      if (!machine || machine.archivedAt)
        throw new HttpError(422, "Select an active machine");
      assertRecordAccess(req, machine);
      const checklist = req.body.checklist;
      if (
        !Array.isArray(checklist) ||
        !checklist.length ||
        !checklist.every((item) => typeof item === "string" && item.trim()) ||
        new Set(checklist).size !== checklist.length
      )
        throw new HttpError(
          422,
          "Provide a checklist of unique, nonempty inspection items",
        );
      const dueAt = new Date(req.body.dueAt);
      if (!Number.isFinite(dueAt.getTime()))
        throw new HttpError(422, "A valid inspection due date is required");
      const row = await MasterRecord.create(
        {
          id: randomUUID(),
          module: "inspections",
          name: `${req.body.type || "Safety Inspection"}: ${machine.name}`,
          code: `IN-${randomUUID().slice(0, 8).toUpperCase()}`,
          organizationId: machine.organizationId,
          factoryId: machine.factoryId,
          status: "Scheduled",
          data: {
            machineId: machine.id,
            machine: machine.name,
            type: req.body.type || "Safety Inspection",
            inspector: String(req.body.inspector || ""),
            dueAt: dueAt.toISOString(),
            checklist,
            results: {},
            observations: "",
            attachments: [],
          },
        },
        { transaction },
      );
      await recordEvent({
        machine,
        type: "inspection",
        summary: "Inspection scheduled",
        details: { inspectionId: row.id },
        req,
        transaction,
      });
      return row;
    });
    res.status(201).json({ result: present(row) });
  }
  async complete(req, res) {
    const row = await sequelize.transaction(async (transaction) => {
      const row = await MasterRecord.findOne({
        where: { id: req.params.id, module: "inspections" },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!row) throw new HttpError(404, "Inspection not found");
      assertRecordAccess(req, row);
      if (row.status === "Completed") {
        if (
          (row.data.checklist || []).some(
            (item) => row.data.results[item] !== req.body.results?.[item],
          ) ||
          row.data.observations !== String(req.body.observations || "")
        )
          throw new HttpError(
            409,
            "This inspection was already completed with different results",
          );
        return row;
      }
      if (!Array.isArray(row.data.checklist))
        throw new HttpError(
          422,
          "Legacy inspection has no checklist; create a scheduled inspection",
        );
      const results = req.body.results || {};
      if (
        !row.data.checklist.every((item) =>
          ["Pass", "Fail", "Not Applicable"].includes(results[item]),
        )
      )
        throw new HttpError(422, "Respond to every checklist item");
      const machine = await Machine.findByPk(row.data.machineId, {
        transaction,
      });
      const failed = row.data.checklist.filter(
        (item) => results[item] === "Fail",
      );
      let workOrderId = null;
      if (failed.length) {
        if (!String(req.body.observations || "").trim())
          throw new HttpError(
            422,
            "Record observations for failed inspection items",
          );
        const order = await WorkOrder.create(
          {
            id: randomUUID(),
            machineId: machine.id,
            organizationId: machine.organizationId,
            factoryId: machine.factoryId,
            issue: `Inspection failure: ${failed.join(", ")}`.slice(0, 255),
            status: "Submitted",
            priority: req.body.priority || "High",
            details: {
              type: "Corrective Maintenance",
              inspectionId: row.id,
              failedItems: failed,
              observations: req.body.observations,
            },
          },
          { transaction },
        );
        workOrderId = order.id;
      }
      await row.update(
        {
          status: "Completed",
          data: {
            ...row.data,
            results: Object.fromEntries(
              row.data.checklist.map((item) => [item, results[item]]),
            ),
            observations: String(req.body.observations || ""),
            attachments: req.body.attachments || [],
            completedAt: new Date().toISOString(),
            completedBy: String(req.auth?.sub || "system"),
            workOrderId,
            result: failed.length ? "Fail" : "Pass",
          },
        },
        { transaction },
      );
      await recordEvent({
        machine,
        type: "inspection",
        summary: `Inspection ${failed.length ? "failed" : "passed"}`,
        details: { inspectionId: row.id, workOrderId, failedItems: failed },
        req,
        transaction,
        notify: failed.length > 0,
      });
      return row;
    });
    res.json({ result: present(row) });
  }
}
module.exports = new InspectionController();
