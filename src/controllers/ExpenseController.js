const { randomUUID } = require("node:crypto");
const {
  sequelize,
  MasterRecord,
  Machine,
  WorkOrder,
  Breakdown,
} = require("../models");
const {
  filterRecords,
  assertRecordAccess,
} = require("../middleware/data-scope");
const { requireAction } = require("../services/movement-workflow");
const { recordEvent } = require("../services/maintenance-events");
const HttpError = require("../errors/http-error");
const categories = [
  "Labour Cost",
  "Spare Parts Cost",
  "External Service Cost",
  "Transportation Cost",
  "Repair Cost",
  "Inspection Cost",
  "Calibration Cost",
  "Other Expenses",
];
const present = (row) => ({
  ...row.data,
  id: row.id,
  status: row.status,
  organizationId: row.organizationId,
  factoryId: row.factoryId,
});
class ExpenseController {
  async list(req, res) {
    res.json({
      result: filterRecords(
        req,
        await MasterRecord.findAll({
          where: { module: "expenses" },
          order: [["createdAt", "DESC"]],
        }),
      ).map(present),
    });
  }
  async create(req, res) {
    requireAction(req, "costs", "CREATE");
    const row = await sequelize.transaction(async (transaction) => {
      const machine = await Machine.findByPk(req.body.machineId, {
        transaction,
      });
      if (!machine) throw new HttpError(422, "Select a machine");
      assertRecordAccess(req, machine);
      const settings =
        await require("../services/maintenance-configuration").configuration(
          {
            ...req,
            query: {
              organizationId: machine.organizationId,
              factoryId: machine.factoryId,
            },
          },
          transaction,
        );
      const amount = Number(req.body.amount);
      if (
        !Number.isFinite(amount) ||
        amount <= 0 ||
        !settings.costCategories.includes(req.body.category)
      )
        throw new HttpError(
          422,
          "A valid cost category and positive amount are required",
        );
      if (!String(req.body.description || "").trim())
        throw new HttpError(422, "Expense description is required");
      for (const [field, model] of [
        ["workOrderId", WorkOrder],
        ["breakdownId", Breakdown],
      ]) {
        if (!req.body[field]) continue;
        const record = await model.findByPk(req.body[field], { transaction });
        if (!record || record.machineId !== machine.id)
          throw new HttpError(422, `${field} must belong to this machine`);
        assertRecordAccess(req, record);
      }
      const occurredAt = new Date(req.body.occurredAt || Date.now());
      if (!Number.isFinite(occurredAt.getTime()))
        throw new HttpError(422, "A valid expense date is required");
      const data = {
        machineId: machine.id,
        machine: machine.name,
        category: req.body.category,
        amount,
        currency: String(req.body.currency || "USD").toUpperCase(),
        description: req.body.description,
        workOrderId: req.body.workOrderId || null,
        breakdownId: req.body.breakdownId || null,
        vendorId: req.body.vendorId || null,
        invoiceReference: String(req.body.invoiceReference || ""),
        occurredAt: occurredAt.toISOString(),
        attachments: req.body.attachments || [],
        recordedBy: String(req.auth?.sub || "system"),
      };
      if (!/^[A-Z]{3}$/.test(data.currency))
        throw new HttpError(422, "Use a three-letter currency code");
      const row = await MasterRecord.create(
        {
          id: randomUUID(),
          module: "expenses",
          name: data.description.slice(0, 180),
          status: "Posted",
          organizationId: machine.organizationId,
          factoryId: machine.factoryId,
          data,
        },
        { transaction },
      );
      await recordEvent({
        machine,
        type: "expense",
        summary: `${data.category}: ${amount} ${data.currency}`,
        details: { expenseId: row.id, ...data },
        req,
        transaction,
      });
      return row;
    });
    res.status(201).json({ result: present(row) });
  }
  async void(req, res) {
    requireAction(req, "costs", "VOID");
    const row = await sequelize.transaction(async (transaction) => {
      const row = await MasterRecord.findOne({
        where: { id: req.params.id, module: "expenses" },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!row) throw new HttpError(404, "Expense not found");
      assertRecordAccess(req, row);
      if (
        row.data.sourceStockTransactionId ||
        row.data.sourceWorkOrderId ||
        row.data.sourceVendorServiceId
      )
        throw new HttpError(
          422,
          "Correct inventory costs with a stock return rather than voiding the generated expense",
        );
      if (!String(req.body.reason || "").trim())
        throw new HttpError(422, "A void reason is required");
      await row.update(
        {
          status: "Void",
          data: {
            ...row.data,
            voidReason: req.body.reason,
            voidedBy: String(req.auth?.sub || "system"),
            voidedAt: new Date().toISOString(),
          },
        },
        { transaction },
      );
      const machine = await Machine.findByPk(row.data.machineId, {
        transaction,
      });
      await recordEvent({
        machine,
        type: "expense",
        summary: "Expense voided",
        details: { expenseId: row.id, reason: req.body.reason },
        req,
        transaction,
      });
      return row;
    });
    res.json({ result: present(row) });
  }
}
module.exports = new ExpenseController();
