const { randomUUID } = require("node:crypto");
const { MasterRecord, MachineHistory } = require("../models");

async function recordEvent({
  machine,
  type,
  summary,
  details = {},
  req,
  transaction,
  notify = false,
}) {
  const actorId = String(req.auth?.sub || req.auth?.userId || "system");
  const occurredAt = new Date();
  if (machine)
    await MachineHistory.create(
      {
        id: randomUUID(),
        machineId: machine.id,
        eventType: type,
        summary: summary.slice(0, 255),
        details,
        actorId,
        occurredAt,
      },
      { transaction },
    );
  const settings = notify
    ? await require("./maintenance-configuration").configuration(
        {
          auth: { development: true },
          query: {
            organizationId: machine?.organizationId || details.organizationId,
            factoryId: machine?.factoryId || details.factoryId,
          },
        },
        transaction,
      )
    : null;
  if (notify && settings.notificationRules[type]?.enabled !== false)
    await MasterRecord.create(
      {
        module: "notifications",
        name: summary.slice(0, 180),
        status: "Unread",
        organizationId: machine?.organizationId || details.organizationId,
        factoryId: machine?.factoryId || details.factoryId,
        data: {
          event: type,
          machineId: machine?.id,
          ...details,
          actorId,
          occurredAt,
        },
      },
      { transaction },
    );
}

module.exports = { recordEvent };
