const { SparePart, MasterRecord } = require("../models");
const BaseController = require("./BaseController");
const { randomUUID } = require("node:crypto");
const HttpError = require("../errors/http-error");
const {
  assertPayloadAccess,
  assertRecordAccess,
} = require("../middleware/data-scope");
class SparePartController extends BaseController {
  constructor() {
    super(SparePart);
  }

  async create(req, res, next) {
    try {
      const values = this.values(req.body);
      assertPayloadAccess(req, values);
      await this.validateFactory(values);
      const part = await SparePart.create({
        ...values,
        id: randomUUID(),
        stockQuantity: 0,
        reservedQuantity: 0,
      });
      res.status(201).json({ result: part });
    } catch (error) {
      next(error);
    }
  }

  async update(req, res, next) {
    try {
      const part = await SparePart.findByPk(req.params.id);
      if (!part) throw new HttpError(404, "Spare part not found");
      assertRecordAccess(req, part);
      if (
        (req.body.stockQuantity !== undefined &&
          Number(req.body.stockQuantity) !== part.stockQuantity) ||
        req.body.reservedQuantity !== undefined
      )
        throw new HttpError(
          422,
          "Use a stock transaction to change inventory quantities",
        );
      const values = this.values({ ...part.toJSON(), ...req.body });
      assertPayloadAccess(req, values);
      await part.update(values);
      res.json({ result: part });
    } catch (error) {
      next(error);
    }
  }

  async validateFactory(values) {
    const factory = await MasterRecord.findOne({
      where: { id: values.factoryId, module: "factories", status: "Active" },
    });
    if (!factory || factory.organizationId !== values.organizationId)
      throw new HttpError(
        422,
        "Select an active factory belonging to this company",
      );
  }
  values(body) {
    if (!String(body.name || "").trim() || !String(body.category || "").trim())
      throw new HttpError(422, "Part name and category are required");
    if (
      !Number.isSafeInteger(Number(body.reorderLevel || 0)) ||
      Number(body.reorderLevel || 0) < 0 ||
      !Number.isFinite(Number(body.unitCost || 0)) ||
      Number(body.unitCost || 0) < 0
    )
      throw new HttpError(
        422,
        "Reorder level and unit cost must be nonnegative",
      );
    return Object.fromEntries(
      [
        "name",
        "category",
        "reorderLevel",
        "unitCost",
        "supplier",
        "organizationId",
        "factoryId",
        "details",
      ]
        .filter((key) => body[key] !== undefined)
        .map((key) => [key, body[key]]),
    );
  }
  rejectBulk(req, res) {
    res
      .status(405)
      .json({
        error: {
          message: "Use individual part and stock transaction endpoints",
        },
      });
  }
  createBatch(req, res) {
    this.rejectBulk(req, res);
  }
  updateBatch(req, res) {
    this.rejectBulk(req, res);
  }
  updateWithFilter(req, res) {
    this.rejectBulk(req, res);
  }
  updateAllByCustomKey(req, res) {
    this.rejectBulk(req, res);
  }
  delete(req, res) {
    res
      .status(405)
      .json({
        error: {
          message: "Spare parts retain their stock transaction history",
        },
      });
  }
}
module.exports = new SparePartController();
