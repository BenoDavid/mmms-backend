const { Op } = require("sequelize");
const {
  sequelize,
  Machine,
  MachineHistory,
  MasterRecord,
} = require("../models");
const BaseController = require("./BaseController");
const { randomUUID } = require("node:crypto");
const {
  filterRecords,
  assertRecordAccess,
  assertPayloadAccess,
} = require("../middleware/data-scope");
const HttpError = require("../errors/http-error");
const { recordEvent } = require("../services/maintenance-events");
const fields = [
  "assetNumber",
  "name",
  "category",
  "description",
  "subcategory",
  "machineType",
  "manufacturingYear",
  "brand",
  "manufacturer",
  "modelNumber",
  "serialNumber",
  "factoryLocation",
  "productionLine",
  "installationDate",
  "purchaseDate",
  "purchaseCost",
  "purchasePrice",
  "supplier",
  "warrantyStartDate",
  "warrantyExpiryDate",
  "commissioningDate",
  "imageUrl",
  "technicalSpecifications",
  "powerConsumption",
  "machineCapacity",
  "organizationId",
  "factoryId",
  "factory",
  "department",
  "floor",
  "currentLocation",
  "responsiblePerson",
  "documents",
  "lifecycleStatus",
  "criticality",
  "lifecycleCondition",
  "status",
  "uptimePercent",
  "operatingHours",
  "productionQuantity",
];
const locationFields = [
  "organizationId",
  "factoryId",
  "factory",
  "factoryLocation",
  "department",
  "floor",
  "productionLine",
  "currentLocation",
];
const statuses = [
  "Running",
  "Idle",
  "Under Maintenance",
  "Breakdown",
  "Decommissioned",
  "Reserved",
  "Scrapped",
];
const lifecycle = [
  "Requested",
  "Purchased",
  "Received",
  "Under Installation",
  "Active",
  "Under Maintenance",
  "Under Repair",
  "Idle",
  "Temporarily Stopped",
  "Decommissioned",
  "Scrapped",
];
class MachineController extends BaseController {
  constructor() {
    super(Machine);
  }
  async values(req, body, transaction, current) {
    const values = Object.fromEntries(
      fields
        .filter((key) => body[key] !== undefined)
        .map((key) => [key, body[key]]),
    );
    for (const key of ['manufacturingYear', 'purchaseDate', 'purchaseCost', 'purchasePrice', 'installationDate', 'commissioningDate', 'warrantyStartDate', 'warrantyExpiryDate']) if (values[key] === '') values[key] = null;
    for (const key of ["name", "category"])
      if (!String(values[key] ?? current?.[key] ?? "").trim())
        throw new HttpError(422, `${key} is required`);
    if (values.status && !statuses.includes(values.status))
      throw new HttpError(422, "Invalid operational status");
    if (values.lifecycleStatus && !lifecycle.includes(values.lifecycleStatus))
      throw new HttpError(422, "Invalid lifecycle status");
    for (const key of [
      "purchaseCost",
      "purchasePrice",
      "operatingHours",
      "productionQuantity",
    ])
      if (
        values[key] != null &&
        (!Number.isFinite(Number(values[key])) || Number(values[key]) < 0)
      )
        throw new HttpError(422, `${key} must be nonnegative`);
    for (const key of ["operatingHours", "productionQuantity"])
      if (
        current &&
        values[key] !== undefined &&
        Number(values[key]) < Number(current[key])
      )
        throw new HttpError(422, "Meter readings cannot decrease");
    if (current) {
      for (const key of locationFields)
        if (
          values[key] !== undefined &&
          String(values[key] || "") !== String(current[key] || "")
        )
          throw new HttpError(
            422,
            "Use an allocation or approved transfer to change machine location",
          );
      if (body.qrReference && body.qrReference !== current.qrReference)
        throw new HttpError(422, "QR identity is permanent");
    }
    const factoryId = values.factoryId || current?.factoryId;
    const organizationId = values.organizationId || current?.organizationId;
    if (!factoryId || !organizationId)
      throw new HttpError(422, "Organization and factory are required");
    const factory = await MasterRecord.findOne({
      where: { id: factoryId, module: "factories" },
      transaction,
    });
    if (
      !factory ||
      String(factory.organizationId || factory.data.organizationId) !==
        String(organizationId)
    )
      throw new HttpError(
        422,
        "Select a factory belonging to the selected organization",
      );
    assertPayloadAccess(req, { organizationId, factoryId });
    await require("../services/maintenance-configuration").validateCustomFields(
      { ...req, query: { ...req.query, organizationId, factoryId } },
      "machines",
      values.technicalSpecifications?.customFields ||
        current?.technicalSpecifications?.customFields,
      transaction,
    );
    if (!current) {
      values.factory = factory.name;
      values.factoryLocation = factory.name;
    }
    if (
      values.documents !== undefined &&
      (!Array.isArray(values.documents) ||
        values.documents.some((item) => !item || typeof item.url !== "string"))
    )
      throw new HttpError(422, "Documents require a stored file URL");
    return values;
  }
  async register(req, body, transaction) {
    const values = await this.values(req, body, transaction);
    const id = randomUUID();
    const machineCode = String(
      body.machineCode || `M-${id.slice(0, 8).toUpperCase()}`,
    );
    const machine = await Machine.create(
      {
        ...values,
        id,
        machineCode,
        assetNumber: values.assetNumber || machineCode,
        qrReference: `MMMS-${id}`,
      },
      { transaction },
    );
    await recordEvent({
      machine,
      type: "registered",
      summary: "Machine registered",
      details: { machineCode },
      req,
      transaction,
    });
    return machine;
  }
  async create(req, res, next) {
    try {
      const result = await sequelize.transaction((transaction) =>
        this.register(req, req.body, transaction),
      );
      res.status(201).json({ result });
    } catch (error) {
      next(error);
    }
  }
  async createBatch(req, res, next) {
    try {
      if (
        !Array.isArray(req.body) ||
        !req.body.length ||
        req.body.length > 1000
      )
        throw new HttpError(422, "Import between 1 and 1000 machines");
      const result = await sequelize.transaction(async (transaction) => {
        const rows = [];
        for (const body of req.body)
          rows.push(await this.register(req, body, transaction));
        return rows;
      });
      res.status(201).json({ result });
    } catch (error) {
      next(error);
    }
  }
  async update(req, res, next) {
    try {
      const result = await sequelize.transaction(async (transaction) => {
        const machine = await Machine.findByPk(req.params.id, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!machine) throw new HttpError(404, "Machine not found");
        assertRecordAccess(req, machine);
        if (machine.archivedAt)
          throw new HttpError(
            422,
            "Archived machine history cannot be rewritten",
          );
        const before = machine.toJSON();
        await machine.update(
          await this.values(req, req.body, transaction, machine),
          { transaction },
        );
        await recordEvent({
          machine,
          type: "updated",
          summary: "Machine master updated",
          details: { before, after: machine.toJSON() },
          req,
          transaction,
        });
        return machine;
      });
      res.json({ result });
    } catch (error) {
      next(error);
    }
  }
  async delete(req, res, next) {
    try {
      await sequelize.transaction(async (transaction) => {
        const machine = await Machine.findByPk(req.params.id, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!machine) throw new HttpError(404, "Machine not found");
        assertRecordAccess(req, machine);
        await machine.update(
          {
            archivedAt: new Date(),
            status: "Decommissioned",
            lifecycleStatus: "Decommissioned",
          },
          { transaction },
        );
        await recordEvent({
          machine,
          type: "archived",
          summary: "Machine archived",
          req,
          transaction,
        });
      });
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
  async getHistory(req, res, next) {
    try {
      const machine = await Machine.findByPk(req.params.id);
      if (!machine) throw new HttpError(404, "Machine not found");
      assertRecordAccess(req, machine);
      res.json({
        result: await MachineHistory.findAll({
          where: { machineId: machine.id },
          order: [["occurredAt", "DESC"]],
        }),
      });
    } catch (error) {
      next(error);
    }
  }
  async resolveQr(req, res, next) {
    try {
      const machine = await Machine.findOne({
        where: { qrReference: req.params.reference },
      });
      if (!machine) throw new HttpError(404, "Machine QR code not found");
      assertRecordAccess({ ...req, query: {} }, machine);
      res.json({ result: machine });
    } catch (error) {
      next(error);
    }
  }
  async getAll(req, res, next) {
    try {
      const where =
        req.query.includeArchived === "true" ? {} : { archivedAt: null };
      if (req.query.status) where.status = req.query.status;
      if (req.query.category) where.category = req.query.category;
      if (req.query.search)
        where[Op.or] = [
          "id",
          "assetNumber",
          "name",
          "machineCode",
          "serialNumber",
        ].map((key) => ({ [key]: { [Op.iLike]: `%${req.query.search}%` } }));
      res.json({
        result: filterRecords(
          req,
          await Machine.findAll({ where, order: [["name", "ASC"]] }),
        ),
      });
    } catch (error) {
      next(error);
    }
  }
  setStatus(req, res, next) {
    req.body = { status: req.body.status };
    return this.update(req, res, next);
  }
  rejectBulk(req, res) {
    res
      .status(405)
      .json({
        error: {
          message:
            "Use individual machine operations to retain validated history",
        },
      });
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
}
module.exports = new MachineController();
