const express = require("express");
const {
  Machine,
  WorkOrder,
  PreventiveMaintenance,
  Breakdown,
  SparePart,
} = require("../models");
const MachineRouter = require("./MachineRouter");
const WorkOrderRouter = require("./WorkOrderRouter");
const PreventiveMaintenanceRouter = require("./PreventiveMaintenanceRouter");
const BreakdownRouter = require("./BreakdownRouter");
const SparePartRouter = require("./SparePartRouter");
const TechnicianRouter = require("./TechnicianRouter");
const MasterRecordRouter = require("./MasterRecordRouter");
const workspaceRoutes = require("./workspace.routes");
const asyncRoute = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);
const {
  filterRecords,
  requireMmmsPermission,
} = require("../middleware/data-scope");

const router = express.Router();
const vendorMaintenance = require("../controllers/VendorMaintenanceController");
router.get(
  "/vendor-services",
  requireMmmsPermission("MMMS-VENDORS"),
  asyncRoute(vendorMaintenance.list.bind(vendorMaintenance)),
);
router.post(
  "/vendor-services",
  requireMmmsPermission("MMMS-VENDORS"),
  asyncRoute(vendorMaintenance.create.bind(vendorMaintenance)),
);
router.post(
  "/vendor-services/:id/status",
  requireMmmsPermission("MMMS-VENDORS"),
  asyncRoute(vendorMaintenance.transition.bind(vendorMaintenance)),
);
router.get(
  "/vendor-profiles",
  requireMmmsPermission("MMMS-VENDORS"),
  asyncRoute(vendorMaintenance.profiles.bind(vendorMaintenance)),
);
router.put(
  "/vendor-profiles/:vendorId",
  requireMmmsPermission("MMMS-VENDORS"),
  asyncRoute(vendorMaintenance.saveProfile.bind(vendorMaintenance)),
);
const authorizeAction = require("../middleware/authorize-action");
const configurationService = require("../services/maintenance-configuration");
router.get(
  "/movement-options",
  asyncRoute(async (req, res) => {
    const permissions = req.auth?.permissions || [];
    if (
      !req.auth?.development &&
      !permissions.includes("*") &&
      !["MMMS-ALLOCATIONS", "MMMS-TRANSFERS"].some((name) =>
        permissions.includes(name),
      )
    )
      return res
        .status(403)
        .json({ error: { message: "Movement access required" } });
    const { MasterRecord } = require("../models");
    const rows = filterRecords(
      { ...req, query: {} },
      await MasterRecord.findAll({
        where: {
          module: [
            "factories",
            "departments",
            "production-lines",
            "organization-units",
          ],
          status: "Active",
        },
        order: [["name", "ASC"]],
      }),
    );
    res.json({
      result: rows.map((row) => ({
        id: row.id,
        name: row.name,
        factoryId: row.factoryId,
        organizationId: row.organizationId,
        unitType:
          row.data.unitType ||
          {
            factories: "Factory",
            departments: "Department",
            "production-lines": "Production Line",
          }[row.module],
      })),
    });
  }),
);
router.get(
  "/workspace-context",
  asyncRoute(async (req, res) => {
    const permissions = req.auth?.permissions || [];
    if (
      !req.auth?.development &&
      !permissions.includes("*") &&
      !permissions.some((name) => name.startsWith("MMMS-"))
    )
      return res
        .status(403)
        .json({ error: { message: "MMMS access required" } });
    const { MasterRecord } = require("../models");
    const rows = filterRecords(
      { ...req, query: {} },
      await MasterRecord.findAll({
        where: { module: ["organization", "factories"], status: "Active" },
        order: [["name", "ASC"]],
      }),
    );
    const organizations = rows
      .filter(
        (row) =>
          row.module === "organization" &&
          (!row.data.unitType || row.data.unitType === "Company"),
      )
      .map((row) => ({ id: row.id, name: row.name, code: row.code }));
    const factories = rows
      .filter((row) => row.module === "factories")
      .map((row) => ({
        id: row.id,
        name: row.name,
        code: row.code,
        organizationId: row.organizationId || row.data.organizationId,
        organizationName: organizations.find(
          (item) => item.id === (row.organizationId || row.data.organizationId),
        )?.name,
      }));
    res.json({ result: { organizations, factories } });
  }),
);
router.get(
  "/configuration/effective",
  asyncRoute(async (req, res) => {
    const permissions = req.auth?.permissions || [];
    if (
      !req.auth?.development &&
      !permissions.includes("*") &&
      !permissions.some((name) => name.startsWith("MMMS-"))
    )
      return res
        .status(403)
        .json({ error: { message: "MMMS access required" } });
    res.json({ result: await configurationService.configuration(req) });
  }),
);
router.put(
  "/configuration/:key",
  requireMmmsPermission("MMMS-CONFIGURATION"),
  asyncRoute(async (req, res) => {
    require("../services/movement-workflow").requireAction(
      req,
      "configuration",
      "EDIT",
    );
    const row = await configurationService.saveSetting(req);
    res.json({ result: { key: row.code, value: row.data.value } });
  }),
);
for (const module of [
  "machines",
  "work-orders",
  "preventive-maintenance",
  "breakdowns",
  "spare-parts",
  "technicians",
])
  router.use(`/${module}`, authorizeAction(module));
const organization = require("../controllers/OrganizationController");
const hierarchyAccess = (req, res, next) => {
  const granted = req.auth?.permissions || [];
  if (
    req.auth?.development ||
    granted.includes("*") ||
    [
      "MMMS-ORGANIZATION",
      "MMMS-FACTORIES",
      "MMMS-DEPARTMENTS",
      "MMMS-PRODUCTION-LINES",
    ].some((name) => granted.includes(name))
  )
    return next();
  res
    .status(403)
    .json({ error: { message: "Organization directory permission required" } });
};
router.get(
  "/hierarchy",
  hierarchyAccess,
  asyncRoute(organization.list.bind(organization)),
);
router.post(
  "/hierarchy",
  hierarchyAccess,
  asyncRoute(organization.save.bind(organization)),
);
router.put(
  "/hierarchy/:id",
  hierarchyAccess,
  asyncRoute(organization.save.bind(organization)),
);
const expenses = require("../controllers/ExpenseController");
router.get(
  "/expenses",
  requireMmmsPermission("MMMS-COSTS"),
  asyncRoute(expenses.list.bind(expenses)),
);
router.post(
  "/expenses",
  requireMmmsPermission("MMMS-COSTS"),
  asyncRoute(expenses.create.bind(expenses)),
);
router.post(
  "/expenses/:id/void",
  requireMmmsPermission("MMMS-COSTS"),
  asyncRoute(expenses.void.bind(expenses)),
);
const masterDataPermissions = {
  organization: "MMMS-ORGANIZATION",
  factories: "MMMS-FACTORIES",
  departments: "MMMS-DEPARTMENTS",
  "production-lines": "MMMS-PRODUCTION-LINES",
  "machine-categories": "MMMS-MACHINE-CATEGORIES",
  allocations: "MMMS-ALLOCATIONS",
  transfers: "MMMS-TRANSFERS",
  inspections: "MMMS-INSPECTIONS",
  calibration: "MMMS-CALIBRATION",
  notifications: "MMMS-NOTIFICATIONS",
  configuration: "MMMS-CONFIGURATION",
};

const requireMasterDataPermission = (req, res, next) => {
  const permission =
    masterDataPermissions[String(req.params.module || "").toLowerCase()];
  if (!permission)
    return res
      .status(404)
      .json({ error: { message: "Unknown master-data module" } });
  return requireMmmsPermission(permission)(req, res, (error) => {
    if (error) return next(error);
    if (req.params.module === "notifications") return next();
    return authorizeAction(req.params.module)(req, res, next);
  });
};

router.use("/machines", requireMmmsPermission("MMMS-MACHINES"), MachineRouter);
router.use(
  "/work-orders",
  requireMmmsPermission("MMMS-WORK-ORDERS"),
  WorkOrderRouter,
);
router.use(
  "/preventive-maintenance",
  requireMmmsPermission("MMMS-PREVENTIVE-MAINTENANCE"),
  PreventiveMaintenanceRouter,
);
router.use(
  "/breakdowns",
  requireMmmsPermission("MMMS-BREAKDOWNS"),
  BreakdownRouter,
);
router.use(
  "/spare-parts",
  requireMmmsPermission("MMMS-SPARE-PARTS"),
  SparePartRouter,
);
router.use(
  "/technicians",
  requireMmmsPermission("MMMS-TECHNICIANS"),
  TechnicianRouter,
);
router.use(
  "/master-data/:module",
  requireMasterDataPermission,
  MasterRecordRouter,
);
router.use("/", workspaceRoutes);
router.use("/", require("./reporting.routes"));
router.get(
  "/dashboard",
  requireMmmsPermission("MMMS-DASHBOARD"),
  asyncRoute(async (req, res) => {
    const [machines, openWorkOrders, activeBreakdowns, spareParts] =
      await Promise.all(
        [
          Machine.findAll(),
          WorkOrder.findAll({
            where: {
              status: ["Open", "Assigned", "In Progress", "Waiting Parts"],
            },
            include: [{ model: Machine, as: "machine" }],
          }),
          Breakdown.findAll({
            where: { status: ["Open", "Investigating"] },
            include: [{ model: Machine, as: "machine" }],
          }),
          SparePart.findAll(),
        ].map((query) => Promise.resolve(query)),
      );
    res.json({
      result: {
        machines: filterRecords(req, machines).length,
        openWorkOrders: filterRecords(req, openWorkOrders).length,
        activeBreakdowns: filterRecords(req, activeBreakdowns).length,
        spareParts: filterRecords(req, spareParts).length,
      },
    });
  }),
);
router.get(
  "/reports/maintenance",
  requireMmmsPermission("MMMS-REPORTS"),
  asyncRoute(async (req, res) => {
    const [machines, workOrders, breakdowns, spareParts] = await Promise.all([
      Machine.findAll(),
      WorkOrder.findAll({ include: [{ model: Machine, as: "machine" }] }),
      Breakdown.findAll({ include: [{ model: Machine, as: "machine" }] }),
      SparePart.findAll(),
    ]);
    res.json({
      result: {
        generatedAt: new Date().toISOString(),
        metrics: {
          machineCount: filterRecords(req, machines).length,
          workOrderCount: filterRecords(req, workOrders).length,
          breakdownCount: filterRecords(req, breakdowns).length,
          sparePartCount: filterRecords(req, spareParts).length,
        },
      },
    });
  }),
);

module.exports = router;
