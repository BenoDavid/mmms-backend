const express = require('express');
const { Machine, WorkOrder, PreventiveMaintenance, Breakdown, SparePart } = require('../models');
const MachineRouter = require('./MachineRouter');
const WorkOrderRouter = require('./WorkOrderRouter');
const PreventiveMaintenanceRouter = require('./PreventiveMaintenanceRouter');
const BreakdownRouter = require('./BreakdownRouter');
const SparePartRouter = require('./SparePartRouter');
const TechnicianRouter = require('./TechnicianRouter');
const MasterRecordRouter = require('./MasterRecordRouter');
const workspaceRoutes = require('./workspace.routes');
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const { filterRecords, requireMmmsPermission } = require('../middleware/data-scope');

const router = express.Router();
router.use('/machines', requireMmmsPermission('MMMS-MACHINES'), MachineRouter);
router.use('/work-orders', requireMmmsPermission('MMMS-WORK-ORDERS'), WorkOrderRouter);
router.use('/preventive-maintenance', requireMmmsPermission('MMMS-PREVENTIVE-MAINTENANCE'), PreventiveMaintenanceRouter);
router.use('/breakdowns', requireMmmsPermission('MMMS-BREAKDOWNS'), BreakdownRouter);
router.use('/spare-parts', requireMmmsPermission('MMMS-SPARE-PARTS'), SparePartRouter);
router.use('/technicians', requireMmmsPermission('MMMS-TECHNICIANS'), TechnicianRouter);
router.use('/master-data/:module', requireMmmsPermission('MMMS-DASHBOARD'), MasterRecordRouter);
router.use('/', workspaceRoutes);
router.get('/dashboard', requireMmmsPermission('MMMS-DASHBOARD'), asyncRoute(async (req, res) => {
  const [machines, openWorkOrders, activeBreakdowns, spareParts] = await Promise.all([
    Machine.findAll(), WorkOrder.findAll({ where: { status: ['Open', 'Assigned', 'In Progress', 'Waiting Parts'] }, include: [{ model: Machine, as: 'machine' }] }),
    Breakdown.findAll({ where: { status: ['Open', 'Investigating'] }, include: [{ model: Machine, as: 'machine' }] }), SparePart.findAll(),
  ].map((query) => Promise.resolve(query)));
  res.json({ result: { machines: filterRecords(req, machines).length, openWorkOrders: filterRecords(req, openWorkOrders).length, activeBreakdowns: filterRecords(req, activeBreakdowns).length, spareParts: filterRecords(req, spareParts).length } });
}));
router.get('/reports/maintenance', requireMmmsPermission('MMMS-REPORTS'), asyncRoute(async (req, res) => {
  const [machines, workOrders, breakdowns, spareParts] = await Promise.all([Machine.findAll(), WorkOrder.findAll({ include: [{ model: Machine, as: 'machine' }] }), Breakdown.findAll({ include: [{ model: Machine, as: 'machine' }] }), SparePart.findAll()]);
  res.json({ result: { generatedAt: new Date().toISOString(), metrics: { machineCount: filterRecords(req, machines).length, workOrderCount: filterRecords(req, workOrders).length, breakdownCount: filterRecords(req, breakdowns).length, sparePartCount: filterRecords(req, spareParts).length } } });
}));

module.exports = router;
