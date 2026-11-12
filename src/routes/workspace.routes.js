const express = require('express');
const { Breakdown, Machine, WorkOrder } = require('../models');
const { filterRecords } = require('../middleware/data-scope');
const { requireMmmsPermission } = require('../middleware/data-scope');

const router = express.Router();
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const openStatuses = ['Open', 'Assigned', 'In Progress', 'Waiting Parts', 'Repair Completed', 'Verification'];
const money = (value) => `$${Number(value || 0).toFixed(2)}`;

router.get('/costs', requireMmmsPermission('MMMS-COSTS'), asyncRoute(async (req, res) => {
  const orders = filterRecords(req, await WorkOrder.findAll({ include: [{ model: Machine, as: 'machine' }] }));
  const byMachine = new Map();
  for (const order of orders) {
    const key = order.machineId;
    const current = byMachine.get(key) || { machine: `${key} · ${order.machine?.name || 'Unknown machine'}`, labor: 0, spareParts: 0, contractors: 0 };
    current.labor += Number(order.laborMinutes || 0) * 0.5;
    current.spareParts += Number(order.partsCost || 0);
    current.contractors += Number(order.contractorCost || 0);
    byMachine.set(key, current);
  }
  const result = [...byMachine.values()].map((row) => ({ ...row, labor: money(row.labor), spareParts: money(row.spareParts), contractors: money(row.contractors), total: money(row.labor + row.spareParts + row.contractors), trend: 'down' }));
  res.json({ result });
}));

router.get('/mobile', requireMmmsPermission('MMMS-MOBILE'), asyncRoute(async (req, res) => {
  const orders = filterRecords(req, await WorkOrder.findAll({ where: { status: openStatuses }, include: [{ model: Machine, as: 'machine' }], order: [['updatedAt', 'DESC']] }));
  res.json({ result: orders.map((order) => ({ id: order.id, machine: `${order.machineId} · ${order.machine?.name || 'Unknown machine'}`, task: order.issue, priority: order.priority, assignee: order.technicianName || 'Unassigned', sync: 'Synced' })) });
}));

router.get('/qr-management', requireMmmsPermission('MMMS-QR-MANAGEMENT'), asyncRoute(async (req, res) => {
  const [machines, orders, breakdowns] = await Promise.all([Machine.findAll(), WorkOrder.findAll(), Breakdown.findAll()]);
  const visibleMachines = filterRecords(req, machines);
  const visibleOrders = filterRecords(req, orders);
  const visibleBreakdowns = filterRecords(req, breakdowns);
  const result = visibleMachines.map((machine) => ({ machine: machine.name, assetNumber: machine.assetNumber, lastScan: machine.updatedAt ? new Date(machine.updatedAt).toLocaleString() : 'Never', openOrders: visibleOrders.filter((order) => order.machineId === machine.id && openStatuses.includes(order.status)).length, breakdowns: visibleBreakdowns.filter((breakdown) => breakdown.machineId === machine.id).length, status: machine.status }));
  res.json({ result });
}));

router.get('/production-integration', requireMmmsPermission('MMMS-PRODUCTION-INTEGRATION'), asyncRoute(async (req, res) => {
  const breakdowns = filterRecords(req, await Breakdown.findAll({ include: [{ model: Machine, as: 'machine' }], order: [['startedAt', 'DESC']] }));
  res.json({ result: breakdowns.map((breakdown) => ({ order: `BREAKDOWN-${breakdown.id}`, line: breakdown.machine?.productionLine || 'Unassigned line', machine: breakdown.machineId, downtime: breakdown.endedAt ? 'Resolved' : 'Active', unitsAtRisk: breakdown.endedAt ? 0 : 100, recovery: breakdown.status === 'Resolved' ? 'On track' : 'At risk' })) });
}));

module.exports = router;
