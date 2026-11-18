const { randomUUID } = require("node:crypto");
const {
  sequelize,
  MasterRecord,
  Machine,
  MachineHistory,
} = require("../models");
const {
  assertRecordAccess,
  filterRecords,
} = require("../middleware/data-scope");
const {
  validateTransition,
  requireAction,
  locationOf,
} = require("../services/movement-workflow");
const HttpError = require("../errors/http-error");

const actor = (req) =>
  String(req.auth?.sub || req.auth?.userId || "development");
const present = (row) => ({
  ...row.data,
  id: row.id,
  status: row.status,
  organizationId: row.organizationId,
  factoryId: row.factoryId,
  createdAt: row.createdAt,
});
const sourceScope = (row) => ({
  organizationId: row.organizationId,
  factoryId: row.factoryId,
});
const destinationScope = (row) => ({
  organizationId: row.data.destination.organizationId,
  factoryId: row.data.destination.factoryId,
});

class MovementController {
  async getAll(req, res) {
    const rows = await MasterRecord.findAll({
      where: { module: req.params.module },
      order: [["createdAt", "DESC"]],
    });
    res.json({
      result: rows
        .filter(
          (row) =>
            filterRecords(req, [
              sourceScope(row),
              ...(row.data.destination ? [destinationScope(row)] : []),
            ]).length,
        )
        .map(present),
    });
  }

  async create(req, res) {
    const module = req.params.module;
    const row = await sequelize.transaction(async (transaction) => {
      const machine = await Machine.findByPk(req.body.machineId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!machine || machine.archivedAt)
        throw new HttpError(422, "Select an active machine");
      assertRecordAccess(req, machine);
      if (!machine.organizationId || !machine.factoryId)
        throw new HttpError(
          422,
          "The machine must belong to an organization and factory",
        );
      if (!String(req.body.reason || "").trim())
        throw new HttpError(422, "A reason is required");
      const destination = await this.destination(req, machine, transaction);
      if (
        module === "allocations" &&
        destination.factoryId !== machine.factoryId
      )
        throw new HttpError(
          422,
          "Use a transfer to move machines between factories",
        );
      const source = locationOf(machine);
      if (JSON.stringify(source) === JSON.stringify(destination))
        throw new HttpError(422, "Select a different destination");
      const pending = await MasterRecord.findAll({
        where: { module: ["allocations", "transfers"] },
        transaction,
      });
      if (
        pending.some(
          (item) =>
            item.data.machineId === machine.id &&
            ([
              "Draft",
              "Submitted",
              "Pending Approval",
              "In Transit",
              "Received",
            ].includes(item.status) ||
              (item.module === "transfers" && item.status === "Approved")),
        )
      )
        throw new HttpError(409, "This machine already has a pending movement");
      const id = randomUUID();
      const data = {
        machineId: machine.id,
        machine: machine.name,
        machineCode: machine.machineCode,
        source,
        destination,
        reason: req.body.reason.trim(),
        expectedDate: req.body.expectedDate || null,
        allocationType:
          req.body.allocationType === "Temporary" ? "Temporary" : "Permanent",
        responsiblePerson: destination.responsiblePerson,
        requestedBy: actor(req),
        requestedAt: new Date().toISOString(),
        events: [],
      };
      const movement = await MasterRecord.create(
        {
          id,
          module,
          organizationId: machine.organizationId,
          factoryId: machine.factoryId,
          name: machine.name,
          code: `${module === "transfers" ? "TR" : "AL"}-${id.slice(0, 8).toUpperCase()}`,
          status: "Draft",
          data,
        },
        { transaction },
      );
      await this.event(req, movement, machine, null, "Draft", transaction);
      return movement;
    });
    res.status(201).json({ result: present(row) });
  }

  async destination(req, machine, transaction) {
    const input = req.body.destination || {};
    const factoryId = String(input.factoryId || machine.factoryId);
    const factory = await MasterRecord.findOne({
      where: { id: factoryId, module: "factories" },
      transaction,
    });
    if (!factory || factory.status !== "Active")
      throw new HttpError(422, "Select an active destination factory");
    const organizationId =
      factory.organizationId || factory.data.organizationId;
    if (!organizationId)
      throw new HttpError(
        422,
        "The destination factory must belong to an organization",
      );
    // Creating a request does not grant the sender access to destination operations.
    // Limit selectable destinations to factories the sender may already access.
    assertRecordAccess({ ...req, query: {} }, { organizationId, factoryId });
    const destination = {
      organizationId,
      factoryId,
      factory: factory.name,
      factoryLocation: factory.name,
      department: null,
      floor: String(input.floor || "") || null,
      productionLine: null,
      currentLocation: String(input.currentLocation || "").trim() || null,
      responsiblePerson: String(input.responsiblePerson || "").trim() || null,
    };
    for (const [idField, module, field] of [
      ["departmentId", "departments", "department"],
      ["productionLineId", "production-lines", "productionLine"],
      ["floorId", "organization-units", "floor"],
      ["locationId", "organization-units", "currentLocation"],
    ]) {
      if (!input[idField]) continue;
      const unit = await MasterRecord.findOne({
        where: { id: input[idField], module },
        transaction,
      });
      if (
        !unit ||
        String(unit.factoryId || unit.data.factoryId) !== factoryId ||
        unit.status !== "Active"
      )
        throw new HttpError(
          422,
          `Select an active ${field} in the destination factory`,
        );
      if (
        (idField === "floorId" && unit.data.unitType !== "Floor") ||
        (idField === "locationId" && unit.data.unitType !== "Machine Location")
      )
        throw new HttpError(422, "Select the correct organization unit type");
      destination[field] = unit.name;
      destination[idField] = unit.id;
    }
    if (!destination.currentLocation)
      throw new HttpError(422, "Destination location is required");
    return destination;
  }

  async transition(req, res) {
    const row = await sequelize.transaction(async (transaction) => {
      const reference = await MasterRecord.findOne({
        where: { id: req.params.id, module: req.params.module },
        transaction,
      });
      if (!reference?.data.machineId)
        throw new HttpError(404, "Movement not found");
      const machine = await Machine.findByPk(reference.data.machineId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      const movement = await MasterRecord.findByPk(reference.id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      const status = req.body.status;
      validateTransition(
        movement.module,
        movement.status,
        status,
        req.body.reason,
      );
      const receiving = ["Received", "Completed"].includes(status);
      assertRecordAccess(
        req,
        receiving ? destinationScope(movement) : sourceScope(movement),
      );
      if (["Approved", "Rejected"].includes(status))
        requireAction(
          req,
          movement.module,
          status === "Rejected" ? "REJECT" : "APPROVE",
        );
      if (status === "Received") requireAction(req, movement.module, "RECEIVE");
      if (status === "Approved")
        await require("../services/approval-policy").assertApprovalPolicy(
          req,
          movement.module,
          movement,
          movement.data.requestedBy,
          transaction,
        );
      const before = movement.status;
      if (status === "Approved" || status === "In Transit") {
        if (
          machine.factoryId !== movement.data.source.factoryId ||
          machine.currentLocation !== movement.data.source.currentLocation
        )
          throw new HttpError(
            409,
            "Machine location changed; cancel this request and create a new one",
          );
      }
      if (
        (movement.module === "allocations" && status === "Approved") ||
        (movement.module === "transfers" && status === "Received")
      ) {
        if (machine.archivedAt)
          throw new HttpError(422, "Archived machines cannot be moved");
        const active = await MasterRecord.findAll({
          where: { module: "allocations", status: "Approved" },
          transaction,
        });
        for (const item of active.filter(
          (item) => item.data.machineId === machine.id,
        ))
          await item.update({ status: "Superseded" }, { transaction });
        const {
          departmentId,
          productionLineId,
          floorId,
          locationId,
          ...location
        } = movement.data.destination;
        await machine.update(
          {
            ...location,
            locationIds: {
              departmentId,
              productionLineId,
              floorId,
              locationId,
            },
          },
          { transaction },
        );
      }
      if (movement.module === "allocations" && status === "Released")
        await machine.update(
          {
            department: null,
            productionLine: null,
            currentLocation: null,
            responsiblePerson: null,
            locationIds: {},
          },
          { transaction },
        );
      await movement.update(
        {
          status,
          data: {
            ...movement.data,
            ...(status === "Approved"
              ? { approvedBy: actor(req), approvedAt: new Date().toISOString() }
              : {}),
            ...(status === "Received"
              ? { receivedBy: actor(req), receivedAt: new Date().toISOString() }
              : {}),
          },
        },
        { transaction },
      );
      await this.event(req, movement, machine, before, status, transaction);
      return movement;
    });
    res.json({ result: present(row) });
  }

  async event(req, row, machine, from, to, transaction) {
    const event = {
      from,
      to,
      actorId: actor(req),
      occurredAt: new Date().toISOString(),
      reason: req.body.reason || row.data.reason,
    };
    await row.update(
      { data: { ...row.data, events: [...(row.data.events || []), event] } },
      { transaction },
    );
    if (
      [
        "Submitted",
        "Pending Approval",
        "Approved",
        "Rejected",
        "Received",
      ].includes(to)
    )
      await require("../services/maintenance-events").recordEvent({
        type:
          row.module === "transfers"
            ? to === "Approved"
              ? "transfer-approval"
              : "transfer-request"
            : "allocation",
        summary: row.code + ": " + to,
        details: {
          organizationId: row.organizationId,
          factoryId: row.factoryId,
          movementId: row.id,
          destination: row.data.destination,
        },
        req,
        transaction,
        notify: true,
      });
    await MachineHistory.create(
      {
        id: randomUUID(),
        machineId: machine.id,
        eventType: row.module,
        summary: `${row.code}: ${to}`,
        actorId: event.actorId,
        occurredAt: event.occurredAt,
        details: {
          movementId: row.id,
          ...event,
          source: row.data.source,
          destination: row.data.destination,
        },
      },
      { transaction },
    );
  }
}

module.exports = new MovementController();
