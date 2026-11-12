const BaseController = require('./BaseController');
const { assertPayloadAccess, assertRecordAccess } = require('../middleware/data-scope');

class TechnicianController extends BaseController {
  async create(req, res, next) {
    try {
      const payload = this.normalise(req.body);
      assertPayloadAccess(req, payload);
      if (!payload.employeeNumber || !payload.name) return res.status(400).json({ error: { message: 'Employee number and name are required' } });
      res.status(201).json({ result: await this.model.create(payload) });
    } catch (error) { next(error); }
  }

  async update(req, res, next) {
    try {
      const record = await this.model.findByPk(req.params.id);
      if (!record) return res.status(404).json({ error: { message: 'Technician not found' } });
      assertRecordAccess(req, record);
      assertPayloadAccess(req, { ...record.toJSON(), ...req.body });
      await record.update(this.normalise(req.body));
      res.json({ result: record });
    } catch (error) { next(error); }
  }

  normalise(body = {}) {
    return {
      ...body,
      skillCategories: Array.isArray(body.skillCategories)
        ? body.skillCategories
        : String(body.skillCategories || '').split(',').map((item) => item.trim()).filter(Boolean),
    };
  }
}

module.exports = TechnicianController;
