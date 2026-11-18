const {
  Machine,
  WorkOrder,
  Breakdown,
  SparePart,
  Technician,
  MachineHistory,
  PreventiveMaintenance,
  MasterRecord,
} = require("../models");
const { filterRecords } = require("../middleware/data-scope");
const HttpError = require("../errors/http-error");

const catalog = {
  "machine-master": "Machine master",
  allocations: "Machine allocations",
  transfers: "Machine transfers",
  "machine-status": "Machine status",
  lifecycle: "Machine lifecycle",
  utilization: "Machine utilization",
  "breakdown-summary": "Breakdown summary",
  "breakdowns-by-machine": "Breakdowns by machine",
  "breakdowns-by-department": "Breakdowns by department",
  "breakdown-category": "Breakdowns by category",
  "breakdown-severity": "Breakdowns by severity",
  "breakdown-resolution": "Breakdown resolution",
  "repeated-breakdowns": "Repeated breakdowns",
  downtime: "Downtime",
  "preventive-maintenance": "Preventive maintenance",
  "corrective-maintenance": "Corrective maintenance",
  history: "Maintenance history",
  "work-orders": "Work orders",
  inspections: "Inspections",
  "mechanic-performance": "Mechanic performance",
  "maintenance-costs": "Maintenance costs",
  "spare-parts-stock": "Spare-parts stock",
  "spare-parts-consumption": "Spare-parts consumption",
  "low-stock": "Low stock",
  "spare-parts-cost": "Spare-parts cost",
  calibration: "Calibration",
  "vendor-services": "Vendor services",
};
const plain = (row) => (row?.toJSON ? row.toJSON() : row);
const percent = (value, total) =>
  total ? Math.round((value / total) * 10000) / 100 : null;

function mergedHours(intervals) {
  const sorted = intervals
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let previous = null;
  for (const [start, end] of sorted) {
    if (!previous) previous = [start, end];
    else if (start <= previous[1]) previous[1] = Math.max(previous[1], end);
    else {
      total += previous[1] - previous[0];
      previous = [start, end];
    }
  }
  if (previous) total += previous[1] - previous[0];
  return total / 3600000;
}

async function dataset(req) {
  const to = req.query.to ? new Date(req.query.to) : new Date();
  if (req.query.to && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to))
    to.setUTCHours(23, 59, 59, 999);
  const from = req.query.from
    ? new Date(req.query.from)
    : new Date(to.getTime() - 30 * 86400000);
  if (
    !Number.isFinite(from.getTime()) ||
    !Number.isFinite(to.getTime()) ||
    from > to
  )
    throw new HttpError(422, "Choose a valid date range");
  const [
    allMachines,
    allOrders,
    allBreakdowns,
    allParts,
    allTechnicians,
    allPlans,
    allRecords,
    allHistory,
  ] = await Promise.all([
    Machine.findAll(),
    WorkOrder.findAll(),
    Breakdown.findAll(),
    SparePart.findAll(),
    Technician.findAll(),
    PreventiveMaintenance.findAll(),
    MasterRecord.findAll(),
    MachineHistory.findAll(),
  ]);
  const machines = filterRecords(req, allMachines)
    .filter(
      (row) =>
        (!req.query.machineId || row.id === req.query.machineId) &&
        ["department", "floor", "category"].every(
          (field) =>
            !req.query[field] ||
            String(row[field]) === String(req.query[field]),
        ),
    )
    .map(plain);
  const machineMap = new Map(allMachines.map((row) => [row.id, plain(row)]));
  const machineIds = new Set(machines.map((row) => row.id));
  const matchesMachine = (row) => {
    if (req.query.machineId && row.machineId !== req.query.machineId)
      return false;
    const snapshot =
      row.details?.location ||
      row.location ||
      machineMap.get(row.machineId) ||
      {};
    return ["department", "floor", "category"].every(
      (field) =>
        !req.query[field] ||
        String(snapshot[field] || "") === String(req.query[field]),
    );
  };
  const inRange = (value) => {
    const date = new Date(value);
    return date >= from && date <= to;
  };
  const orders = filterRecords(req, allOrders)
    .map(plain)
    .filter(matchesMachine);
  const breakdowns = filterRecords(req, allBreakdowns)
    .map(plain)
    .filter(matchesMachine)
    .filter(
      (row) =>
        new Date(row.startedAt) <= to &&
        (!row.endedAt || new Date(row.endedAt) >= from),
    );
  const records = filterRecords(req, allRecords)
    .map(plain)
    .map((row) => ({
      ...row.data,
      id: row.id,
      module: row.module,
      code: row.code,
      status: row.status,
      organizationId: row.organizationId,
      factoryId: row.factoryId,
      createdAt: row.createdAt,
      name: row.name,
    }))
    .filter((row) => !row.machineId || matchesMachine(row));
  const parts = filterRecords(req, allParts).map(plain);
  const history = allHistory
    .map(plain)
    .filter((row) => machineIds.has(row.machineId) && inRange(row.occurredAt));
  const plans = filterRecords(req, allPlans).map(plain).filter(matchesMachine);
  const technicians = filterRecords(req, allTechnicians).map(plain);
  let downtimeHours = 0;
  const byDay = new Map();
  for (const machine of machines) {
    const intervals = breakdowns
      .filter((row) => row.machineId === machine.id)
      .map((row) => [
        Math.max(
          from.getTime(),
          new Date(machine.createdAt).getTime(),
          new Date(row.startedAt).getTime(),
        ),
        Math.min(
          to.getTime(),
          machine.archivedAt
            ? new Date(machine.archivedAt).getTime()
            : Date.now(),
          row.endedAt ? new Date(row.endedAt).getTime() : Date.now(),
        ),
      ]);
    downtimeHours += mergedHours(intervals);
    for (
      let start = new Date(from);
      start <= to;
      start = new Date(start.getTime() + 86400000)
    ) {
      const dayStart = new Date(start);
      dayStart.setUTCHours(0, 0, 0, 0);
      const end = dayStart.getTime() + 86400000;
      const hours = mergedHours(
        intervals.map(([a, b]) => [
          Math.max(a, dayStart.getTime()),
          Math.min(b, end),
        ]),
      );
      const key = dayStart.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) || 0) + hours);
    }
  }
  const observedHours = machines.reduce(
    (sum, machine) =>
      sum +
      Math.max(
        0,
        Math.min(
          to.getTime(),
          machine.archivedAt
            ? new Date(machine.archivedAt).getTime()
            : Date.now(),
        ) - Math.max(from.getTime(), new Date(machine.createdAt).getTime()),
      ) /
        3600000,
    0,
  );
  const failures = breakdowns.filter((row) => inRange(row.startedAt));
  const repaired = breakdowns.filter(
    (row) => row.endedAt && inRange(row.endedAt),
  );
  const repairHours = repaired.reduce(
    (sum, row) =>
      sum +
      Math.max(0, new Date(row.endedAt) - new Date(row.startedAt)) / 3600000,
    0,
  );
  const dueOccurrences = records.filter(
    (row) => row.module === "pm-occurrences" && inRange(row.scheduledAt),
  );
  const completedOnTime = dueOccurrences.filter(
    (row) =>
      row.status === "Completed" &&
      row.completedAt &&
      new Date(row.completedAt) <= new Date(row.dueAt || row.scheduledAt),
  );
  const completedOrders = orders.filter(
    (row) =>
      ["Completed", "Verified", "Closed"].includes(row.status) &&
      inRange(row.completedAt),
  );
  const repeated = failures.filter(
    (row) =>
      failures.filter((other) => other.machineId === row.machineId).length > 1,
  );
  const expenses = records.filter(
    (row) =>
      row.module === "expenses" &&
      row.status === "Posted" &&
      inRange(row.occurredAt),
  );
  const expensesByCurrency = {};
  for (const row of expenses)
    expensesByCurrency[row.currency] =
      (expensesByCurrency[row.currency] || 0) + Number(row.amount);
  const kpis = {
    machineCount: machines.length,
    activeMachines: machines.filter((row) => row.status === "Running").length,
    idleMachines: machines.filter((row) => row.status === "Idle").length,
    underMaintenance: machines.filter(
      (row) => row.status === "Under Maintenance",
    ).length,
    openWorkOrders: orders.filter(
      (row) => !["Closed", "Cancelled"].includes(row.status),
    ).length,
    pendingVerification: orders.filter((row) =>
      ["Completed", "Repair Completed", "Verification"].includes(row.status),
    ).length,
    activeBreakdowns: breakdowns.filter((row) => row.status !== "Resolved")
      .length,
    criticalBreakdowns: breakdowns.filter(
      (row) =>
        row.status !== "Resolved" && row.details?.severity === "Critical",
    ).length,
    downtimeHours,
    availabilityPercent: observedHours
      ? Math.max(0, 100 - (downtimeHours / observedHours) * 100)
      : null,
    mttrHours: repaired.length ? repairHours / repaired.length : null,
    mtbfHours: failures.length
      ? Math.max(0, observedHours - downtimeHours) / failures.length
      : null,
    preventiveCompliancePercent: percent(
      completedOnTime.length,
      dueOccurrences.length,
    ),
    workOrderCompletionRate: percent(
      completedOrders.filter((row) => inRange(row.createdAt)).length,
      orders.filter(
        (row) => row.status !== "Cancelled" && inRange(row.createdAt),
      ).length,
    ),
    repeatedBreakdownRate: percent(repeated.length, failures.length),
    lowStockCount: parts.filter(
      (row) => row.stockQuantity - row.reservedQuantity <= row.reorderLevel,
    ).length,
    expensesByCurrency,
  };
  return {
    from,
    to,
    machines,
    orders,
    breakdowns,
    records,
    parts,
    history,
    plans,
    technicians,
    kpis,
    downtimeByDay: [...byDay].map(([day, hours]) => ({ day, hours })),
    inRange,
    machineMap,
  };
}

function reportRows(name, data) {
  const {
    machines,
    orders,
    breakdowns,
    records,
    parts,
    history,
    plans,
    technicians,
    inRange,
    machineMap,
  } = data;
  const master = (module) =>
    records.filter((row) => row.module === module && inRange(row.createdAt));
  const group = (rows, key) =>
    [
      ...rows.reduce((map, row) => {
        const value = key(row) || "Unassigned";
        map.set(value, (map.get(value) || 0) + 1);
        return map;
      }, new Map()),
    ].map(([group, count]) => ({ group, count }));
  if (["machine-master", "machine-status"].includes(name)) return machines;
  if (name === "allocations" || name === "transfers") return master(name);
  if (["lifecycle", "history"].includes(name)) return history;
  if (name === "utilization")
    return machines.map((row) => ({
      machineId: row.id,
      machine: row.name,
      operatingHours: row.operatingHours,
      productionQuantity: row.productionQuantity,
      status: row.status,
    }));
  if (["breakdown-summary", "breakdown-resolution", "downtime"].includes(name))
    return breakdowns.map((row) => ({
      ...row,
      downtimeHours:
        Math.max(
          0,
          new Date(row.endedAt || data.to) - new Date(row.startedAt),
        ) / 3600000,
    }));
  if (name === "breakdowns-by-machine")
    return group(breakdowns, (row) => row.machineId);
  if (name === "breakdowns-by-department")
    return group(
      breakdowns,
      (row) =>
        row.details?.location?.department ||
        machineMap.get(row.machineId)?.department,
    );
  if (name === "breakdown-category")
    return group(breakdowns, (row) => row.category);
  if (name === "breakdown-severity")
    return group(breakdowns, (row) => row.details?.severity);
  if (name === "repeated-breakdowns")
    return group(breakdowns, (row) => row.machineId).filter(
      (row) => row.count > 1,
    );
  if (name === "preventive-maintenance")
    return records.filter(
      (row) => row.module === "pm-occurrences" && inRange(row.scheduledAt),
    );
  if (name === "corrective-maintenance")
    return orders.filter(
      (row) =>
        row.details?.type === "Corrective Maintenance" &&
        inRange(row.createdAt),
    );
  if (name === "work-orders")
    return orders.filter((row) => inRange(row.createdAt));
  if (
    name === "inspections" ||
    name === "calibration" ||
    name === "vendor-services"
  )
    return master(name);
  if (name === "mechanic-performance")
    return technicians.map((row) => ({
      id: row.id,
      mechanic: row.name,
      active: row.active,
      openJobs: orders.filter(
        (order) =>
          order.technicianId === row.id &&
          !["Closed", "Cancelled"].includes(order.status),
      ).length,
      completedJobs: orders.filter(
        (order) =>
          order.technicianId === row.id &&
          ["Completed", "Verified", "Closed"].includes(order.status) &&
          inRange(order.completedAt),
      ).length,
      laborMinutes: orders
        .filter(
          (order) =>
            order.technicianId === row.id && inRange(order.completedAt),
        )
        .reduce((sum, order) => sum + Number(order.laborMinutes || 0), 0),
    }));
  if (name === "maintenance-costs")
    return records.filter(
      (row) =>
        row.module === "expenses" &&
        row.status === "Posted" &&
        inRange(row.occurredAt),
    );
  if (name === "spare-parts-stock") return parts;
  if (name === "low-stock")
    return parts.filter(
      (row) => row.stockQuantity - row.reservedQuantity <= row.reorderLevel,
    );
  if (name === "spare-parts-consumption" || name === "spare-parts-cost")
    return master("stock-transactions")
      .filter(
        (row) =>
          row.type === "Consumption" ||
          (row.type === "Return" &&
            records.some(
              (source) =>
                source.module === "stock-transactions" &&
                source.id === row.sourceTransactionId &&
                source.type === "Consumption",
            )),
      )
      .map((row) => ({
        ...row,
        signedQuantity: row.type === "Return" ? -row.quantity : row.quantity,
        signedCost:
          (row.type === "Return" ? -1 : 1) *
          Number(row.quantity) *
          Number(row.unitCost || 0),
      }));
  throw new HttpError(404, "Unknown report");
}
module.exports = { catalog, dataset, reportRows, mergedHours };
