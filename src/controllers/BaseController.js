const {
  filterRecords,
  assertRecordAccess,
  assertPayloadAccess,
} = require("../middleware/data-scope");

class BaseController {
  constructor(model, { include = [] } = {}) {
    this.model = model;
    this.include = include;
  }

  async getAll(req, res, next) {
    try {
      const options = { include: this.include, order: [["createdAt", "DESC"]] };
      const result = await this.model.findAll(options);
      const visible = filterRecords(req, result);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const limit = req.query.limit
        ? Math.min(Math.max(Number(req.query.limit) || 50, 1), 500)
        : visible.length;
      res.json({
        result: visible.slice(offset, offset + limit),
        total: visible.length,
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req, res, next) {
    try {
      const result = await this.model.findByPk(req.params.id, {
        include: this.include,
      });
      if (!result)
        return res
          .status(404)
          .json({ error: { message: `${this.model.name} not found` } });
      assertRecordAccess(req, result);
      res.json({ result });
    } catch (error) {
      next(error);
    }
  }

  async create(req, res, next) {
    try {
      assertPayloadAccess(req, req.body);
      res.status(201).json({ result: await this.model.create(req.body) });
    } catch (error) {
      next(error);
    }
  }

  async createBatch(req, res, next) {
    try {
      if (!Array.isArray(req.body))
        return res
          .status(400)
          .json({ error: { message: "Request body must be an array" } });
      req.body.forEach((item) => assertPayloadAccess(req, item));
      res.status(201).json({ result: await this.model.bulkCreate(req.body) });
    } catch (error) {
      next(error);
    }
  }

  async getOneByCustomKey(req, res, next) {
    try {
      const result = await this.model.findOne({
        where: req.body,
        include: this.include,
      });
      if (result) assertRecordAccess(req, result);
      res.json({ result });
    } catch (error) {
      next(error);
    }
  }

  async getAllByCustomKey(req, res, next) {
    try {
      res.json({
        result: filterRecords(
          req,
          await this.model.findAll({ where: req.body, include: this.include }),
        ),
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req, res, next) {
    try {
      const result = await this.model.findByPk(req.params.id);
      if (!result)
        return res
          .status(404)
          .json({ error: { message: `${this.model.name} not found` } });
      assertRecordAccess(req, result);
      assertPayloadAccess(req, { ...result.toJSON(), ...req.body });
      await result.update(req.body);
      res.json({ result });
    } catch (error) {
      next(error);
    }
  }

  async updateBatch(req, res, next) {
    try {
      if (!Array.isArray(req.body))
        return res
          .status(400)
          .json({ error: { message: "Request body must be an array" } });
      if (req.body.some((item) => !item.id))
        return res
          .status(400)
          .json({ error: { message: "Each item must include id" } });
      const result = await this.model.sequelize.transaction(
        async (transaction) => {
          const records = [];
          for (const item of req.body) {
            const record = await this.model.findByPk(item.id, {
              transaction,
              lock: transaction.LOCK.UPDATE,
            });
            if (record) {
              assertRecordAccess(req, record);
              assertPayloadAccess(req, { ...record.toJSON(), ...item });
              records.push({ record, item });
            }
          }
          for (const { record, item } of records)
            await record.update(item, { transaction });
          return records.map(({ record }) => record);
        },
      );
      res.json({ result });
    } catch (error) {
      next(error);
    }
  }

  async updateWithFilter(req, res, next) {
    try {
      const { where, values } = req.body || {};
      if (!where || !values)
        return res
          .status(400)
          .json({ error: { message: "where and values are required" } });
      const records = await this.model.findAll({ where });
      records.forEach((record) => {
        assertRecordAccess(req, record);
        assertPayloadAccess(req, { ...record.toJSON(), ...values });
      });
      const affected = await this.model.sequelize.transaction(
        async (transaction) => {
          for (const record of records)
            await record.update(values, { transaction });
          return records.length;
        },
      );
      res.json({ result: { affected } });
    } catch (error) {
      next(error);
    }
  }

  async updateAllByCustomKey(req, res, next) {
    try {
      return this.updateWithFilter(req, res, next);
    } catch (error) {
      next(error);
    }
  }

  async delete(req, res, next) {
    try {
      const result = await this.model.findByPk(req.params.id);
      if (!result)
        return res
          .status(404)
          .json({ error: { message: `${this.model.name} not found` } });
      assertRecordAccess(req, result);
      await result.destroy();
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}

module.exports = BaseController;
