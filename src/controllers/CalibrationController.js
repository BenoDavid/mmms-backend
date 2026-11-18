const { sequelize, MasterRecord, Machine } = require("../models");
const {
  assertRecordAccess,
  filterRecords,
} = require("../middleware/data-scope");
const { recordEvent } = require("../services/maintenance-events");
const HttpError = require("../errors/http-error");
const present = (row) => ({
  ...row.data,
  id: row.id,
  status: row.status,
  code: row.code,
});
class CalibrationController {
  async list(req, res) {
    res.json({
      result: filterRecords(
        req,
        await MasterRecord.findAll({
          where: { module: "calibration" },
          order: [["createdAt", "DESC"]],
        }),
      ).map(present),
    });
  }
  async create(req, res) {
    const row = await sequelize.transaction(async (transaction) => {
      const machine = await Machine.findByPk(req.body.machineId, {
        transaction,
      });
      if (!machine || machine.archivedAt)
        throw new HttpError(422, "Select an active machine");
      assertRecordAccess(req, machine);
      const due = new Date(req.body.dueAt);
      if (
        !Number.isFinite(due.getTime()) ||
        !String(req.body.type || "").trim()
      )
        throw new HttpError(
          422,
          "Calibration type and valid due date are required",
        );
      const row = await MasterRecord.create(
        {
          module: "calibration",
          name: machine.name,
          status: "Scheduled",
          organizationId: machine.organizationId,
          factoryId: machine.factoryId,
          data: {
            machineId: machine.id,
            machine: machine.name,
            type: req.body.type,
            dueAt: due.toISOString(),
            agency: req.body.agency || "",
            vendorId: req.body.vendorId || null,
            responsiblePerson: req.body.responsiblePerson || "",
            remarks: req.body.remarks || "",
            attachments: [],
          },
        },
        { transaction },
      );
      await recordEvent({
        machine,
        type: "calibration",
        summary: "Calibration scheduled",
        details: { calibrationId: row.id, dueAt: due },
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
        where: { id: req.params.id, module: "calibration" },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!row) throw new HttpError(404, "Calibration not found");
      assertRecordAccess(req, row);
      if (row.status === "Completed")
        throw new HttpError(
          422,
          "Completed calibration history cannot be overwritten",
        );
      if (
        !["Pass", "Fail"].includes(req.body.result) ||
        !String(req.body.certificateNumber || "").trim()
      )
        throw new HttpError(422, "Result and certificate number are required");
      const date = new Date(req.body.calibratedAt || Date.now());
      if (!Number.isFinite(date.getTime()) || date > new Date())
        throw new HttpError(422, "A valid calibration date is required");
      await row.update(
        {
          status: "Completed",
          data: {
            ...row.data,
            result: req.body.result,
            certificateNumber: req.body.certificateNumber,
            attachments: req.body.attachments || [],
            calibratedAt: date.toISOString(),
            completedBy: String(req.auth?.sub || "system"),
            remarks: req.body.remarks || "",
          },
        },
        { transaction },
      );
      const machine = await Machine.findByPk(row.data.machineId, {
        transaction,
      });
      await recordEvent({
        machine,
        type: "calibration",
        summary: `Calibration ${req.body.result}`,
        details: {
          calibrationId: row.id,
          certificateNumber: req.body.certificateNumber,
        },
        req,
        transaction,
        notify: req.body.result === "Fail",
      });
      return row;
    });
    res.json({ result: present(row) });
  }
}
module.exports = new CalibrationController();
