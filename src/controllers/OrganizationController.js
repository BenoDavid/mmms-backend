const { randomUUID } = require("node:crypto");
const { sequelize, MasterRecord, Machine } = require("../models");
const {
  assertRecordAccess,
  assertPayloadAccess,
  filterRecords,
} = require("../middleware/data-scope");
const { requireAction } = require("../services/movement-workflow");
const HttpError = require("../errors/http-error");
const parents = {
  Company: [],
  "Business Unit": ["Company"],
  Factory: ["Company", "Business Unit"],
  Building: ["Factory"],
  Floor: ["Building", "Factory"],
  Department: ["Floor", "Factory"],
  "Production Section": ["Department"],
  "Production Line": ["Production Section", "Department", "Floor"],
  "Machine Location": ["Production Line", "Department", "Floor"],
};
const moduleFor = (type) =>
  type === "Factory"
    ? "factories"
    : type === "Department"
      ? "departments"
      : type === "Production Line"
        ? "production-lines"
        : ["Company", "Business Unit"].includes(type)
          ? "organization"
          : "organization-units";
const typeOf = (row) =>
  row.data.unitType ||
  {
    organization: "Company",
    factories: "Factory",
    departments: "Department",
    "production-lines": "Production Line",
  }[row.module];
const present = (row) => ({
  ...row.data,
  id: row.id,
  name: row.name,
  code: row.code,
  status: row.status,
  unitType: typeOf(row),
  organizationId: row.organizationId,
  factoryId: row.factoryId,
});
class OrganizationController {
  async list(req, res) {
    const rows = await MasterRecord.findAll({
      where: {
        module: [
          "organization",
          "factories",
          "departments",
          "production-lines",
          "organization-units",
        ],
      },
      order: [["name", "ASC"]],
    });
    res.json({
      result: filterRecords({ ...req, query: {} }, rows).map(present),
    });
  }
  async save(req, res) {
    const creating = !req.params.id;
    const result = await sequelize.transaction(async (transaction) => {
      const current = creating
        ? null
        : await MasterRecord.findByPk(req.params.id, {
            transaction,
            lock: transaction.LOCK.UPDATE,
          });
      if (!creating && !current)
        throw new HttpError(404, "Organization unit not found");
      if (current) assertRecordAccess({ ...req, query: {} }, current);
      const body = { ...(current ? present(current) : {}), ...req.body };
      if (
        !Object.hasOwn(parents, body.unitType) ||
        !String(body.name || "").trim() ||
        !String(body.code || "").trim()
      )
        throw new HttpError(422, "Unit type, name and code are required");
      const module = moduleFor(body.unitType);
      if (current && typeOf(current) !== body.unitType)
        throw new HttpError(
          422,
          "An existing organization unit retains its hierarchy type",
        );
      requireAction(
        req,
        module === "organization-units" ? "organization" : module,
        creating ? "CREATE" : "EDIT",
      );
      const id = current?.id || randomUUID();
      let organizationId = id;
      let factoryId = null;
      if (body.unitType !== "Company") {
        const parent = await MasterRecord.findByPk(body.parentId, {
          transaction,
        });
        if (
          !parent ||
          parent.status !== "Active" ||
          !parents[body.unitType].includes(typeOf(parent))
        )
          throw new HttpError(
            422,
            "Select an active parent at the correct hierarchy level",
          );
        assertRecordAccess({ ...req, query: {} }, parent);
        organizationId = parent.organizationId || parent.id;
        factoryId = body.unitType === "Factory" ? id : parent.factoryId || null;
        let ancestor = parent;
        for (let depth = 0; ancestor; depth++) {
          if (ancestor.id === id || depth > 20)
            throw new HttpError(
              422,
              "Organization hierarchy cannot contain cycles",
            );
          ancestor = ancestor.data.parentId
            ? await MasterRecord.findByPk(ancestor.data.parentId, {
                transaction,
              })
            : null;
        }
      }
      if (
        current &&
        (current.organizationId !== organizationId ||
          current.factoryId !== factoryId)
      )
        throw new HttpError(
          422,
          "Existing organization units cannot move between company/factory scopes",
        );
      assertPayloadAccess({ ...req, query: {} }, { organizationId, factoryId });
      const duplicate = await MasterRecord.findOne({
        where: { module, organizationId, code: body.code.trim() },
        transaction,
      });
      if (duplicate && duplicate.id !== id)
        throw new HttpError(
          409,
          "This unit code is already used in the company",
        );
      if (body.status === "Inactive") {
        const children = await MasterRecord.findAll({
          where: { organizationId },
          transaction,
        });
        const machines = await Machine.count({
          where: { organizationId, ...(factoryId ? { factoryId } : {}) },
          transaction,
        });
        if (
          children.some(
            (row) => row.data.parentId === id && row.status === "Active",
          ) ||
          (["Company", "Factory"].includes(body.unitType) && machines)
        )
          throw new HttpError(
            422,
            "Reassign active child units and machines before deactivating this unit",
          );
      }
      const data = {
        unitType: body.unitType,
        parentId: body.parentId || null,
        manager: String(body.manager || ""),
        email: String(body.email || ""),
        description: String(body.description || ""),
        organizationId,
        factoryId,
        changes: [
          ...(current?.data.changes || []),
          {
            at: new Date().toISOString(),
            by: String(req.auth?.sub || "system"),
            previousName: current?.name || null,
            name: body.name,
            parentId: body.parentId || null,
          },
        ],
      };
      const values = {
        module,
        organizationId,
        factoryId,
        name: body.name.trim(),
        code: body.code.trim(),
        status: body.status === "Inactive" ? "Inactive" : "Active",
        data,
      };
      return current
        ? current.update(values, { transaction })
        : MasterRecord.create({ id, ...values }, { transaction });
    });
    res.status(creating ? 201 : 200).json({ result: present(result) });
  }
}
module.exports = new OrganizationController();
