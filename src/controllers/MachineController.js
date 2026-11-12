const { Op } = require('sequelize');
const { Machine, MachineHistory } = require('../models');
const BaseController = require('./BaseController');
const { randomUUID } = require('node:crypto');
const { filterRecords, assertRecordAccess, assertPayloadAccess } = require('../middleware/data-scope');

class MachineController extends BaseController {
  constructor() { super(Machine); }

  async create(req, res, next) {
    try {
      const values = { ...req.body };
      assertPayloadAccess(req, values);
      values.machineCode = values.machineCode || values.assetNumber || values.id;
      values.qrReference = values.qrReference || `MMMS-${values.machineCode}`;
      const machine = await Machine.create(values);
      await this.recordHistory(machine, 'registered', 'Machine registered', req);
      res.status(201).json({ result: machine });
    } catch (error) { next(error); }
  }

  async update(req, res, next) {
    try {
      const machine = await Machine.findByPk(req.params.id);
      if (!machine) return res.status(404).json({ error: { message: 'Machine not found' } });
      assertRecordAccess(req, machine);
      assertPayloadAccess(req, { ...machine.toJSON(), ...req.body });
      const before = machine.toJSON();
      await machine.update(req.body);
      await this.recordHistory(machine, 'updated', 'Machine master data updated', req, { before, after: machine.toJSON() });
      res.json({ result: machine });
    } catch (error) { next(error); }
  }

  async delete(req, res, next) {
    try {
      const machine = await Machine.findByPk(req.params.id);
      if (!machine) return res.status(404).json({ error: { message: 'Machine not found' } });
      assertRecordAccess(req, machine);
      await machine.update({ status: 'Decommissioned', archivedAt: new Date() });
      await this.recordHistory(machine, 'archived', 'Machine archived instead of permanently deleted', req);
      res.status(204).send();
    } catch (error) { next(error); }
  }

  async getHistory(req, res, next) {
    try {
      const machine = await Machine.findByPk(req.params.id);
      if (!machine) return res.status(404).json({ error: { message: 'Machine not found' } });
      const result = await MachineHistory.findAll({ where: { machineId: machine.id }, order: [['occurredAt', 'DESC']] });
      res.json({ result });
    } catch (error) { next(error); }
  }

  async recordHistory(machine, eventType, summary, req, details = {}) {
    await MachineHistory.create({ id: `MH-${randomUUID()}`, machineId: machine.id, eventType, summary, details, actorId: req.user?.id || req.user?.sub || null, occurredAt: new Date() });
  }

  async getAll(req, res, next) {
    try {
      const where = {};
      if (req.query.status) where.status = req.query.status;
      if (req.query.category) where.category = req.query.category;
      if (req.query.includeArchived !== 'true') where.archivedAt = null;
      if (req.query.search) where[Op.or] = [
        { id: { [Op.iLike]: `%${req.query.search}%` } },
        { assetNumber: { [Op.iLike]: `%${req.query.search}%` } },
        { name: { [Op.iLike]: `%${req.query.search}%` } },
      ];
      res.json({ result: filterRecords(req, await Machine.findAll({ where, order: [['name', 'ASC']] })) });
    } catch (error) { next(error); }
  }

  async setStatus(req, res, next) {
    try {
      const allowed = ['Running', 'Idle', 'Under Maintenance', 'Breakdown', 'Decommissioned', 'Reserved', 'Scrapped'];
      if (!allowed.includes(req.body.status)) return res.status(400).json({ error: { message: 'Unsupported machine status' } });
      const machine = await Machine.findByPk(req.params.id);
      if (!machine) return res.status(404).json({ error: { message: 'Machine not found' } });
      assertRecordAccess(req, machine);
      const previousStatus = machine.status;
      await machine.update({ status: req.body.status });
      await this.recordHistory(machine, 'status_changed', `Status changed from ${previousStatus} to ${machine.status}`, req, { previousStatus, status: machine.status });
      res.json({ result: machine });
    } catch (error) { next(error); }
  }
}

module.exports = new MachineController();
