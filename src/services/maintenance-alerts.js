const { createHash } = require("node:crypto");
const {
  sequelize,
  Machine,
  WorkOrder,
  SparePart,
  MasterRecord,
} = require("../models");

async function ensureAlert({
  event,
  referenceId,
  due,
  title,
  organizationId,
  factoryId,
  machineId,
}) {
  const settings = await require("./maintenance-configuration").configuration({
    auth: { development: true },
    query: { organizationId, factoryId },
  });
  if (settings.notificationRules[event]?.enabled === false) return;
  const code = `alert-${createHash("sha256")
    .update(`${event}:${referenceId}:${due || ""}`)
    .digest("hex")}`;
  return sequelize.transaction(async (transaction) => {
    await sequelize.query("SELECT pg_advisory_xact_lock(hashtext(:code))", {
      replacements: { code },
      transaction,
    });
    if (
      await MasterRecord.findOne({
        where: { module: "notifications", code },
        transaction,
      })
    )
      return;
    await MasterRecord.create(
      {
        module: "notifications",
        code,
        name: title.slice(0, 180),
        status: "Unread",
        organizationId,
        factoryId,
        data: {
          event,
          referenceId,
          machineId,
          dueAt: due,
          readBy: [],
          delivery: {},
          occurredAt: new Date().toISOString(),
        },
      },
      { transaction },
    );
  });
}

async function refreshAlerts(now = new Date()) {
  const [orders, machines, parts, records] = await Promise.all([
    WorkOrder.findAll(),
    Machine.findAll(),
    SparePart.findAll(),
    MasterRecord.findAll({ where: { module: ["inspections", "calibration", "pm-occurrences"] } }),
  ]);
  for (const order of orders)
    if (
      ![
        "Completed",
        "Repair Completed",
        "Verification",
        "Verified",
        "Closed",
        "Cancelled",
      ].includes(order.status) &&
      order.dueAt &&
      new Date(order.dueAt) < now
    )
      await ensureAlert({
        event: "work-order-overdue",
        referenceId: order.id,
        due: order.dueAt.toISOString(),
        title: `Overdue work order: ${order.issue}`,
        organizationId: order.organizationId,
        factoryId: order.factoryId,
        machineId: order.machineId,
      });
  for (const machine of machines)
    if (
      !machine.archivedAt &&
      machine.warrantyExpiryDate &&
      new Date(machine.warrantyExpiryDate) <=
        new Date(now.getTime() + 30 * 86400000)
    )
      await ensureAlert({
        event: "warranty-expiry",
        referenceId: machine.id,
        due: machine.warrantyExpiryDate,
        title: `Warranty expiry: ${machine.name}`,
        organizationId: machine.organizationId,
        factoryId: machine.factoryId,
        machineId: machine.id,
      });
  for (const part of parts)
    if (part.stockQuantity - part.reservedQuantity <= part.reorderLevel)
      await ensureAlert({
        event: "low-stock",
        referenceId: part.id,
        due: `${part.stockQuantity}:${part.reservedQuantity}`,
        title: `Low stock: ${part.name}`,
        organizationId: part.organizationId,
        factoryId: part.factoryId,
      });
  for (const row of records) {
    if (row.status !== 'Scheduled' || !row.data.dueAt) continue;
    const dueAt = new Date(row.data.dueAt);
    if (!Number.isFinite(dueAt.getTime()) || dueAt > new Date(now.getTime() + 24 * 3600000)) continue;
    const kind = row.module === 'inspections' ? 'inspection' : row.module === 'calibration' ? 'calibration' : 'preventive-maintenance';
    const overdue = dueAt < now;
    await ensureAlert({ event: kind + (overdue ? '-overdue' : '-due'), referenceId: row.id, due: row.data.dueAt, title: (overdue ? 'Overdue ' : 'Upcoming ') + kind + ': ' + row.name, organizationId: row.organizationId, factoryId: row.factoryId, machineId: row.data.machineId });
  }
}

async function deliverNotifications() {
  if (process.env.NODE_ENV === "test") return;
  const channels = ["EMAIL", "PUSH"].filter(
    (channel) => process.env[`MMMS_${channel}_WEBHOOK_URL`],
  );
  if (!channels.length) return;
  const records = await MasterRecord.findAll({
    where: { module: "notifications" },
    order: [["createdAt", "ASC"]],
  });
  for (const row of records)
    for (const channel of channels) {
      const settings =
        await require("./maintenance-configuration").configuration({
          auth: { development: true },
          query: {
            organizationId: row.organizationId,
            factoryId: row.factoryId,
          },
        });
      const rule = settings.notificationRules[row.data.event];
      if (
        rule?.enabled === false ||
        (rule?.channels && !rule.channels.includes(channel))
      )
        continue;
      const delivery = row.data.delivery || {};
      if (
        delivery[channel]?.status === "Delivered" ||
        Number(delivery[channel]?.attempts || 0) >= 5
      )
        continue;
      const endpoint = process.env[`MMMS_${channel}_WEBHOOK_URL`];
      if (!endpoint.startsWith("https://")) continue;
      let status = "Failed";
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": `${row.id}:${channel}`,
            ...(process.env.MMMS_NOTIFICATION_WEBHOOK_TOKEN
              ? {
                  authorization: `Bearer ${process.env.MMMS_NOTIFICATION_WEBHOOK_TOKEN}`,
                }
              : {}),
          },
          body: JSON.stringify({
            id: row.id,
            title: row.name,
            organizationId: row.organizationId,
            factoryId: row.factoryId,
            ...row.data,
          }),
          signal: AbortSignal.timeout(5000),
          redirect: "error",
        });
        if (response.ok) status = "Delivered";
      } catch {
        /* Failed deliveries remain visible for operator review. */
      }
      await sequelize.transaction(async (transaction) => {
        const current = await MasterRecord.findByPk(row.id, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        await current.update(
          {
            data: {
              ...current.data,
              delivery: {
                ...current.data.delivery,
                [channel]: {
                  status,
                  attempts: Number(delivery[channel]?.attempts || 0) + 1,
                  attemptedAt: new Date().toISOString(),
                },
              },
            },
          },
          { transaction },
        );
      });
    }
}
module.exports = { refreshAlerts, deliverNotifications };
