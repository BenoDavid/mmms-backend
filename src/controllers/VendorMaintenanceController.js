const { sequelize, MasterRecord, Machine, WorkOrder } = require("../models");
const {
  filterRecords,
  assertRecordAccess,
  assertPayloadAccess,
} = require("../middleware/data-scope");
const { requireAction } = require("../services/movement-workflow");
const { recordEvent } = require("../services/maintenance-events");
const HttpError = require("../errors/http-error");
const present = (row) => ({
  ...row.data,
  id: row.id,
  status: row.status,
  createdAt: row.createdAt,
});
const transitions = {
  Scheduled: ["In Progress", "Cancelled"],
  "In Progress": ["On Hold", "Completed"],
  "On Hold": ["In Progress", "Cancelled"],
  Submitted: ["Approved", "Rejected"],
  Approved: ["Resolved", "Cancelled"],
};

async function lookupVendor(req, id) {
  const endpoint =
    process.env.AUTHGUARD_VENDORS_URL ||
    "http://localhost:7001/v3/api/auth/vendors";
  let response;
  try {
    response = await fetch(endpoint, {
      headers: {
        authorization: req.get("authorization"),
        "x-application-name": "MMMS",
      },
      signal: AbortSignal.timeout(5000),
      redirect: "error",
    });
  } catch {
    throw new HttpError(503, "Shared vendor catalog is unavailable");
  }
  if (!response.ok)
    throw new HttpError(
      response.status === 401 ? 401 : 403,
      "Shared vendor access is required",
    );
  const body = await response.json();
  const vendor = (body.result || []).find((row) => row.id === id);
  if (!vendor)
    throw new HttpError(
      422,
      "Select a vendor from your accessible shared catalog",
    );
  return vendor;
}

class VendorMaintenanceController {
  async list(req, res) {
    res.json({
      result: filterRecords(
        req,
        await MasterRecord.findAll({
          where: { module: "vendor-services" },
          order: [["createdAt", "DESC"]],
        }),
      ).map(present),
    });
  }
  async profiles(req, res) {
    res.json({
      result: filterRecords(
        req,
        await MasterRecord.findAll({ where: { module: "vendor-profiles" } }),
      ).map(present),
    });
  }
  async saveProfile(req, res) {
    requireAction(req, "vendors", "EDIT");
    const vendor = await lookupVendor(req, req.params.vendorId);
    const { organizationId, factoryId } = req.body;
    if (!organizationId || !factoryId)
      throw new HttpError(422, "Select an organization and factory");
    assertPayloadAccess(req, { organizationId, factoryId });
    const row = await sequelize.transaction(async (transaction) => {
      const key = `${vendor.id}:${factoryId}`;
      await sequelize.query("SELECT pg_advisory_xact_lock(hashtext(:key))", {
        replacements: { key },
        transaction,
      });
      const row = await MasterRecord.findOne({
        where: {
          module: "vendor-profiles",
          code: vendor.id,
          organizationId,
          factoryId,
        },
        transaction,
      });
      const data = {
        vendorId: vendor.id,
        vendor: vendor.name,
        address: String(req.body.address || ""),
        specializations: String(req.body.specializations || ""),
        productsSupplied: String(req.body.productsSupplied || ""),
        contractDetails: String(req.body.contractDetails || ""),
        warrantyDetails: String(req.body.warrantyDetails || ""),
        attachments: req.body.attachments || [],
        changes: [
          ...(row?.data.changes || []),
          {
            at: new Date().toISOString(),
            by: String(req.auth?.sub || "system"),
            previousContract: row?.data.contractDetails || null,
          },
        ],
      };
      const values = {
        module: "vendor-profiles",
        code: vendor.id,
        name: vendor.name,
        organizationId,
        factoryId,
        status: "Active",
        data,
      };
      return row
        ? row.update(values, { transaction })
        : MasterRecord.create(values, { transaction });
    });
    res.json({ result: present(row) });
  }
  async create(req, res) {
    requireAction(req, "vendors", "CREATE");
    const vendor = await lookupVendor(req, req.body.vendorId);
    if (vendor.status !== "Active")
      throw new HttpError(422, "Select an active vendor");
    const result = await sequelize.transaction(async (transaction) => {
      const machine = await Machine.findByPk(req.body.machineId, {
        transaction,
      });
      if (!machine) throw new HttpError(422, "Select a machine");
      assertRecordAccess(req, machine);
      if (!String(req.body.description || "").trim())
        throw new HttpError(422, "Service or claim description is required");
      if (req.body.workOrderId) {
        const order = await WorkOrder.findByPk(req.body.workOrderId, {
          transaction,
        });
        if (!order || order.machineId !== machine.id)
          throw new HttpError(
            422,
            "The work order must belong to the selected machine",
          );
        assertRecordAccess(req, order);
      }
      const amount = Number(req.body.amount || 0);
      if (!Number.isFinite(amount) || amount < 0)
        throw new HttpError(422, "Service amount must be nonnegative");
      const claim = req.body.type === "Warranty Claim";
      const data = {
        vendorId: vendor.id,
        vendor: vendor.name,
        machineId: machine.id,
        machine: machine.name,
        workOrderId: req.body.workOrderId || null,
        type: claim ? "Warranty Claim" : "External Service",
        description: req.body.description,
        amount,
        currency: String(req.body.currency || "USD").toUpperCase(),
        plannedAt: req.body.plannedAt || null,
        claimReference: String(req.body.claimReference || ""),
        requestedBy: String(req.auth?.sub || "system"),
        attachments: req.body.attachments || [],
        events: [],
      };
      if (!/^[A-Z]{3}$/.test(data.currency))
        throw new HttpError(422, "Use a three-letter currency code");
      const row = await MasterRecord.create(
        {
          module: "vendor-services",
          name: data.description.slice(0, 180),
          organizationId: machine.organizationId,
          factoryId: machine.factoryId,
          status: claim ? "Submitted" : "Scheduled",
          data,
        },
        { transaction },
      );
      await recordEvent({
        machine,
        type: "vendor-service",
        summary: `${data.type}: ${vendor.name}`,
        details: { vendorServiceId: row.id, vendorId: vendor.id },
        req,
        transaction,
        notify: true,
      });
      return row;
    });
    res.status(201).json({ result: present(result) });
  }
  async transition(req, res) {
    const result = await sequelize.transaction(async (transaction) => {
      const row = await MasterRecord.findOne({
        where: { id: req.params.id, module: "vendor-services" },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!row) throw new HttpError(404, "Vendor service not found");
      assertRecordAccess(req, row);
      const status = req.body.status;
      requireAction(
        req,
        "vendors",
        status === "Rejected"
          ? "REJECT"
          : status === "Approved"
            ? "APPROVE"
            : "EDIT",
      );
      if (!transitions[row.status]?.includes(status))
        throw new HttpError(
          422,
          `Cannot move vendor service from ${row.status} to ${status}`,
        );
      const finished = ["Completed", "Resolved"].includes(status);
      if (
        (finished || ["Rejected", "Cancelled"].includes(status)) &&
        !String(req.body.remarks || "").trim()
      )
        throw new HttpError(
          422,
          "Completion, rejection or cancellation remarks are required",
        );
      const amount = Number(req.body.amount ?? row.data.amount);
      const rating = req.body.rating ? Number(req.body.rating) : null;
      if (
        !Number.isFinite(amount) ||
        amount < 0 ||
        (rating !== null &&
          (!Number.isInteger(rating) || rating < 1 || rating > 5))
      )
        throw new HttpError(
          422,
          "Use a nonnegative amount and a rating from 1 to 5",
        );
      const event = {
        from: row.status,
        to: status,
        at: new Date().toISOString(),
        by: String(req.auth?.sub || "system"),
        remarks: String(req.body.remarks || ""),
      };
      await row.update(
        {
          status,
          data: {
            ...row.data,
            amount,
            rating,
            invoiceReference:
              req.body.invoiceReference || row.data.invoiceReference || "",
            remarks: event.remarks,
            attachments: req.body.attachments || row.data.attachments,
            events: [...row.data.events, event],
            ...(finished ? { completedAt: event.at } : {}),
          },
        },
        { transaction },
      );
      const machine = await Machine.findByPk(row.data.machineId, {
        transaction,
      });
      if (finished && amount > 0)
        await MasterRecord.create(
          {
            module: "expenses",
            name: `Vendor: ${row.data.vendor}`,
            organizationId: row.organizationId,
            factoryId: row.factoryId,
            status: "Posted",
            data: {
              machineId: machine.id,
              machine: machine.name,
              vendorId: row.data.vendorId,
              workOrderId: row.data.workOrderId,
              category: "External Service Cost",
              amount,
              currency: row.data.currency,
              description: row.data.description,
              invoiceReference: row.data.invoiceReference,
              occurredAt: event.at,
              sourceVendorServiceId: row.id,
              attachments: row.data.attachments,
            },
          },
          { transaction },
        );
      await recordEvent({
        machine,
        type: "vendor-service",
        summary: `Vendor service ${status}`,
        details: { vendorServiceId: row.id, ...event },
        req,
        transaction,
      });
      return row;
    });
    res.json({ result: present(result) });
  }
}
module.exports = new VendorMaintenanceController();
