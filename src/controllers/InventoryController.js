const { randomUUID } = require("node:crypto");
const {
  sequelize,
  SparePart,
  WorkOrder,
  Machine,
  MasterRecord,
} = require("../models");
const {
  assertRecordAccess,
  filterRecords,
} = require("../middleware/data-scope");
const { requireAction } = require("../services/movement-workflow");
const { recordEvent } = require("../services/maintenance-events");
const HttpError = require("../errors/http-error");

class InventoryController {
  async list(req, res) {
    const rows = await MasterRecord.findAll({
      where: { module: "stock-transactions" },
      order: [["createdAt", "DESC"]],
    });
    res.json({
      result: filterRecords(req, rows)
        .filter((row) => !req.params.id || row.data.partId === req.params.id)
        .map((row) => ({ ...row.data, id: row.id, createdAt: row.createdAt })),
    });
  }

  async transact(req, res) {
    requireAction(req, "spare-parts", "TRANSACT");
    const body = req.body;
    if (body.type === "Transfer" && !body.destinationPartId)
      throw new HttpError(422, "A destination stock record is required");
    const quantity = Number(body.quantity);
    if (!Number.isSafeInteger(quantity) || quantity <= 0)
      throw new HttpError(422, "Quantity must be a positive whole number");
    if (!String(body.reason || "").trim())
      throw new HttpError(422, "A stock transaction reason is required");
    if (!String(body.requestId || "").match(/^[a-zA-Z0-9-]{8,100}$/))
      throw new HttpError(
        422,
        "A stable requestId is required to prevent duplicate stock changes",
      );
    const result = await sequelize.transaction(async (transaction) => {
      // Stable lock order also covers two concurrent transfers in opposite directions.
      const ids = [
        ...new Set([
          req.params.id,
          ...(body.type === "Transfer" ? [body.destinationPartId] : []),
        ]),
      ].sort();
      const parts = [];
      for (const id of ids) {
        const part = await SparePart.findByPk(id, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!part) throw new HttpError(404, "Spare part not found");
        assertRecordAccess({ ...req, query: {} }, part);
        parts.push(part);
      }
      const part = parts.find((part) => part.id === req.params.id);
      assertRecordAccess(req, part);
      await sequelize.query("SELECT pg_advisory_xact_lock(hashtext(:code))", {
        replacements: { code: body.requestId },
        transaction,
      });
      const requestFingerprint = require("node:crypto")
        .createHash("sha256")
        .update(
          JSON.stringify([
            part.id,
            body.type,
            quantity,
            body.workOrderId || null,
            body.reservationId || null,
            body.sourceTransactionId || null,
            body.destinationPartId || null,
            body.direction || null,
            body.reason.trim(),
          ]),
        )
        .digest("hex");
      const existing = await MasterRecord.findOne({
        where: { module: "stock-transactions", code: body.requestId },
        transaction,
      });
      if (existing) {
        assertRecordAccess(req, existing);
        if (
          existing.data.partId !== part.id ||
          existing.data.type !== body.type ||
          existing.data.quantity !== quantity ||
          (existing.data.requestFingerprint &&
            existing.data.requestFingerprint !== requestFingerprint)
        )
          throw new HttpError(
            409,
            "This requestId was used for a different transaction",
          );
        return existing;
      }
      let order = null;
      let machine = null;
      if (body.workOrderId) {
        order = await WorkOrder.findByPk(body.workOrderId, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (
          !order ||
          ["Verified", "Closed", "Cancelled"].includes(order.status)
        )
          throw new HttpError(422, "Select an open work order");
        assertRecordAccess(req, order);
        if (
          part.factoryId !== order.factoryId ||
          part.organizationId !== order.organizationId
        )
          throw new HttpError(
            422,
            "The work order and part must share a factory",
          );
        machine = await Machine.findByPk(order.machineId, { transaction });
      }
      const available = part.stockQuantity - part.reservedQuantity;
      let stock = part.stockQuantity;
      let reserved = part.reservedQuantity;
      let unitCost = Number(part.unitCost || 0);
      if (["Receipt", "Return"].includes(body.type)) {
        if (body.type === "Return") {
          const source = await MasterRecord.findOne({
            where: {
              id: body.sourceTransactionId,
              module: "stock-transactions",
            },
            transaction,
            lock: transaction.LOCK.UPDATE,
          });
          if (
            !source ||
            source.data.partId !== part.id ||
            !["Issue", "Consumption"].includes(source.data.type)
          )
            throw new HttpError(
              422,
              "A matching issue or consumption transaction is required",
            );
          const returned = Number(source.data.returnedQuantity || 0);
          if (returned + quantity > source.data.quantity)
            throw new HttpError(
              422,
              "Return quantity exceeds the original issue",
            );
          await source.update(
            { data: { ...source.data, returnedQuantity: returned + quantity } },
            { transaction },
          );
          unitCost = Number(source.data.unitCost || 0);
          if (source.data.type === "Consumption" && source.data.workOrderId) {
            const originalOrder = await WorkOrder.findByPk(
              source.data.workOrderId,
              { transaction, lock: transaction.LOCK.UPDATE },
            );
            if (originalOrder) {
              assertRecordAccess(req, originalOrder);
              await originalOrder.update(
                {
                  partsCost: Math.max(
                    0,
                    Number(originalOrder.partsCost || 0) - quantity * unitCost,
                  ),
                },
                { transaction },
              );
              order = originalOrder;
              machine = await Machine.findByPk(originalOrder.machineId, {
                transaction,
              });
            }
          }
        }
        stock += quantity;
      } else if (body.type === "Reservation") {
        if (!order)
          throw new HttpError(
            422,
            "A work order is required for a reservation",
          );
        if (quantity > available)
          throw new HttpError(409, "Insufficient available stock");
        reserved += quantity;
      } else if (
        ["Consumption", "Release"].includes(body.type) &&
        body.reservationId
      ) {
        const reservation = await MasterRecord.findOne({
          where: { id: body.reservationId, module: "stock-transactions" },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (
          !reservation ||
          reservation.data.type !== "Reservation" ||
          reservation.data.partId !== part.id ||
          reservation.data.workOrderId !== order?.id
        )
          throw new HttpError(
            422,
            "Select a reservation for this part and work order",
          );
        const used = Number(reservation.data.usedQuantity || 0);
        if (used + quantity > reservation.data.quantity)
          throw new HttpError(
            409,
            "Quantity exceeds the remaining reservation",
          );
        await reservation.update(
          { data: { ...reservation.data, usedQuantity: used + quantity } },
          { transaction },
        );
        reserved -= quantity;
        if (body.type === "Consumption") stock -= quantity;
      } else if (["Issue", "Consumption", "Transfer"].includes(body.type)) {
        if (quantity > available)
          throw new HttpError(409, "Insufficient available stock");
        stock -= quantity;
      } else if (body.type === "Adjustment") {
        requireAction(req, "spare-parts", "ADJUST");
        if (!["Increase", "Decrease"].includes(body.direction))
          throw new HttpError(
            422,
            "Choose Increase or Decrease for an adjustment",
          );
        stock += body.direction === "Decrease" ? -quantity : quantity;
        if (stock < reserved)
          throw new HttpError(409, "Adjustment would consume reserved stock");
      } else throw new HttpError(422, "Unsupported stock transaction");
      if (body.type === "Consumption" && !order)
        throw new HttpError(422, "A work order is required for consumption");
      if (body.type === "Transfer") {
        const destination = parts.find(
          (item) => item.id === body.destinationPartId,
        );
        if (
          !destination ||
          destination.id === part.id ||
          !part.details.partCode ||
          destination.details.partCode !== part.details.partCode
        )
          throw new HttpError(
            422,
            "Select a different stock record with the same part code",
          );
        await destination.update(
          { stockQuantity: destination.stockQuantity + quantity },
          { transaction },
        );
      }
      await part.update(
        { stockQuantity: stock, reservedQuantity: reserved },
        { transaction },
      );
      if (order && body.type === "Consumption")
        await order.update(
          { partsCost: Number(order.partsCost || 0) + quantity * unitCost },
          { transaction },
        );
      const data = {
        requestFingerprint,
        reservationId: body.reservationId || null,
        direction: body.direction || null,
        partId: part.id,
        partName: part.name,
        type: body.type,
        quantity,
        unitCost,
        totalCost: quantity * unitCost,
        stockAfter: stock,
        reservedAfter: reserved,
        workOrderId: order?.id || null,
        machineId: machine?.id || null,
        destinationPartId: body.destinationPartId || null,
        sourceTransactionId: body.sourceTransactionId || null,
        reason: body.reason.trim(),
        actorId: String(req.auth?.sub || "system"),
      };
      const row = await MasterRecord.create(
        {
          id: randomUUID(),
          module: "stock-transactions",
          code: body.requestId,
          name: `${body.type}: ${part.name}`,
          organizationId: part.organizationId,
          factoryId: part.factoryId,
          status: "Posted",
          data,
        },
        { transaction },
      );
      if (machine && order && ["Consumption", "Return"].includes(body.type))
        await MasterRecord.create(
          {
            module: "expenses",
            name: `${body.type}: ${part.name}`,
            organizationId: part.organizationId,
            factoryId: part.factoryId,
            status: "Posted",
            data: {
              machineId: machine.id,
              machine: machine.name,
              workOrderId: order.id,
              category: "Spare Parts Cost",
              amount: quantity * unitCost * (body.type === "Return" ? -1 : 1),
              currency: part.details.currency || "USD",
              description: `${body.type}: ${quantity} × ${part.name}`,
              occurredAt: new Date().toISOString(),
              sourceStockTransactionId: row.id,
              attachments: [],
            },
          },
          { transaction },
        );
      await recordEvent({
        machine,
        type: "spare-parts",
        summary: `${body.type}: ${quantity} × ${part.name}`,
        details: {
          ...data,
          organizationId: part.organizationId,
          factoryId: part.factoryId,
        },
        req,
        transaction,
        notify: stock - reserved <= part.reorderLevel,
      });
      return row;
    });
    res.status(201).json({ result: { ...result.data, id: result.id } });
  }
}

module.exports = new InventoryController();
