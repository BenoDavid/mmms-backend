const express = require("express");
const { requireMmmsPermission } = require("../middleware/data-scope");
const { requireAction } = require("../services/movement-workflow");
const {
  catalog,
  dataset,
  reportRows,
} = require("../services/maintenance-reporting");
const router = express.Router();
const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res)).catch(next);
router.get(
  "/reports/catalog",
  requireMmmsPermission("MMMS-REPORTS"),
  (req, res) =>
    res.json({
      result: Object.entries(catalog).map(([id, title]) => ({ id, title })),
    }),
);
router.get(
  "/reports/data/:name",
  requireMmmsPermission("MMMS-REPORTS"),
  wrap(async (req, res) => {
    if (req.query.export === "true") requireAction(req, "reports", "EXPORT");
    const data = await dataset(req);
    res.json({
      result: {
        title: catalog[req.params.name],
        generatedAt: new Date().toISOString(),
        from: data.from,
        to: data.to,
        rows: reportRows(req.params.name, data),
        kpis: data.kpis,
      },
    });
  }),
);
router.get(
  "/analytics",
  requireMmmsPermission("MMMS-DASHBOARD"),
  wrap(async (req, res) => {
    const data = await dataset(req);
    const mechanic = data.technicians.find(
      (row) =>
        String(row.details?.userCode || row.details?.userId) ===
        String(req.auth?.sub),
    );
    const tasks = data.orders.filter(
      (row) =>
        !["Closed", "Cancelled"].includes(row.status) &&
        (req.query.view !== "mechanic" ||
          (mechanic &&
            (row.technicianId === mechanic.id ||
              (row.details.team || []).includes(mechanic.id)))),
    );
    const group = (field) =>
      [
        ...data.machines.reduce((map, row) => {
          const value = row[field] || "Unallocated";
          map.set(value, (map.get(value) || 0) + 1);
          return map;
        }, new Map()),
      ].map(([label, count]) => ({ label, count }));
    if (req.query.view === "mechanic") {
      data.kpis.openWorkOrders = tasks.length;
      data.kpis.pendingVerification = tasks.filter((row) =>
        ["Completed", "Verification", "Repair Completed"].includes(row.status),
      ).length;
    }
    data.kpis.overdueWorkOrders = tasks.filter(
      (row) => row.dueAt && new Date(row.dueAt) < new Date(),
    ).length;
    data.kpis.unassignedWorkOrders = tasks.filter(
      (row) => !row.technicianId,
    ).length;
    data.kpis.preventiveDue = tasks.filter(
      (row) => row.details?.type === "Preventive Maintenance",
    ).length;
    data.kpis.availableMechanics = data.technicians.filter(
      (row) =>
        row.active && !tasks.some((order) => order.technicianId === row.id),
    ).length;
    data.kpis.overdueInspections = data.records.filter(
      (row) =>
        row.module === "inspections" &&
        row.status === "Scheduled" &&
        new Date(row.dueAt) < new Date(),
    ).length;
    data.kpis.overdueCalibrations = data.records.filter(
      (row) =>
        row.module === "calibration" &&
        row.status === "Scheduled" &&
        new Date(row.dueAt) < new Date(),
    ).length;
    data.kpis.unallocatedMachines = data.machines.filter(
      (row) => !row.currentLocation,
    ).length;
    res.json({
      result: {
        generatedAt: new Date().toISOString(),
        from: data.from,
        to: data.to,
        kpis: data.kpis,
        tasks: tasks.map((row) => ({
          id: row.id,
          issue: row.issue,
          machineId: row.machineId,
          machine: data.machineMap.get(row.machineId)?.name,
          status: row.status,
          priority: row.priority,
          technician: row.technicianName,
          dueAt: row.dueAt,
        })),
        factoryDistribution: group("factory"),
        departmentDistribution: group("department"),
        floorDistribution: group("floor"),
        downtimeByDay: data.downtimeByDay,
      },
    });
  }),
);
module.exports = router;
