const { randomUUID } = require("node:crypto");
const { Op } = require("sequelize");
const { Machine } = require("../models");

class MachineError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function text(value, field, { required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new MachineError(400, `${field} is required`);
    return value;
  }
  if (typeof value !== "string" || !value.trim()) {
    throw new MachineError(400, `${field} must be a non-empty string`);
  }
  return value.trim();
}

function normalize(values, { creating = false } = {}) {
  const result = { ...values };
  if (creating)
    result.id =
      text(values.id, "id") || `M-${randomUUID().slice(0, 8).toUpperCase()}`;
  for (const field of [
    "assetNumber",
    "name",
    "category",
    "manufacturer",
    "modelNumber",
    "serialNumber",
    "factoryLocation",
    "productionLine",
  ]) {
    if (field in values)
      result[field] = text(values[field], field, {
        required:
          creating && ["assetNumber", "name", "category"].includes(field),
      });
  }
  if (values.uptimePercent !== undefined) {
    const uptime = Number(values.uptimePercent);
    if (!Number.isFinite(uptime) || uptime < 0 || uptime > 100)
      throw new MachineError(400, "uptimePercent must be between 0 and 100");
    result.uptimePercent = uptime;
  }
  return result;
}

async function list({ search, status, category }) {
  const where = {};
  if (status) where.status = status;
  if (category) where.category = category;
  if (search)
    where[Op.or] = [
      { id: { [Op.iLike]: `%${search}%` } },
      { assetNumber: { [Op.iLike]: `%${search}%` } },
      { name: { [Op.iLike]: `%${search}%` } },
    ];
  return Machine.findAll({ where, order: [["name", "ASC"]] });
}

async function get(id) {
  const machine = await Machine.findByPk(id);
  if (!machine) throw new MachineError(404, "Machine not found");
  return machine;
}

async function create(values) {
  return Machine.create(normalize(values, { creating: true }));
}

async function update(id, values) {
  const machine = await get(id);
  await machine.update(normalize(values));
  return machine;
}

async function setStatus(id, status) {
  const machine = await get(id);
  const allowed = [
    "Running",
    "Idle",
    "Under Maintenance",
    "Breakdown",
    "Decommissioned",
  ];
  if (!allowed.includes(status))
    throw new MachineError(400, "Unsupported machine status");
  await machine.update({ status });
  return machine;
}

async function remove(id) {
  const machine = await get(id);
  await machine.destroy();
}

module.exports = { list, get, create, update, setStatus, remove };
