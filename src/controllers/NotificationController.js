const { MasterRecord, sequelize } = require("../models");
const {
  filterRecords,
  assertRecordAccess,
} = require("../middleware/data-scope");
const HttpError = require("../errors/http-error");
class NotificationController {
  async list(req, res) {
    const actorId = String(req.auth?.sub || "system");
    const rows = filterRecords(
      req,
      await MasterRecord.findAll({
        where: { module: "notifications" },
        order: [["createdAt", "DESC"]],
      }),
    );
    res.json({
      result: rows.map((row) => ({
        ...row.data,
        id: row.id,
        title: row.name,
        createdAt: row.createdAt,
        read: (row.data.readBy || []).includes(actorId),
      })),
    });
  }
  async read(req, res) {
    const row = await sequelize.transaction(async (transaction) => {
      const row = await MasterRecord.findOne({
        where: { id: req.params.id, module: "notifications" },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!row) throw new HttpError(404, "Notification not found");
      assertRecordAccess(req, row);
      await row.update(
        {
          data: {
            ...row.data,
            readBy: [
              ...new Set([
                ...(row.data.readBy || []),
                String(req.auth?.sub || "system"),
              ]),
            ],
          },
        },
        { transaction },
      );
      return row;
    });
    res.json({ result: { id: row.id, read: true } });
  }
}
module.exports = new NotificationController();
