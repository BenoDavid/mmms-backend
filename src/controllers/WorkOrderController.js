const { WorkOrder, Machine, Technician } = require('../models');
const BaseController = require('./BaseController');
const { assertRecordAccess, assertPayloadAccess } = require('../middleware/data-scope');
class WorkOrderController extends BaseController {
  constructor() { super(WorkOrder, { include: [{ model: Machine, as: 'machine' }, { model: Technician, as: 'technician' }] }); }

  async update(req, res, next) {
    try {
      const current = await WorkOrder.findByPk(req.params.id);
      if (!current) return res.status(404).json({ error: { message: 'Work order not found' } });
      assertRecordAccess(req, current);
      if (req.body.status && req.body.status !== current.status) return this.transition(req, res, next);
      return super.update(req, res, next);
    } catch (error) { return next(error); }
  }

  async transition(req, res, next) {
    try {
      const order = await WorkOrder.findByPk(req.params.id);
      if (!order) return res.status(404).json({ error: { message: 'Work order not found' } });
      assertRecordAccess(req, order);
      assertPayloadAccess(req, { ...order.toJSON(), ...req.body });
      const nextStatus = req.body.status;
      const transitions = {
        Open: ['Assigned'], Assigned: ['In Progress', 'Open'], 'In Progress': ['Waiting Parts', 'Repair Completed'], 'Waiting Parts': ['In Progress'], 'Repair Completed': ['Verification', 'In Progress'], Verification: ['Closed', 'In Progress'], Completed: ['Closed'], Closed: [],
      };
      if (!transitions[order.status]?.includes(nextStatus)) return res.status(422).json({ error: { message: `Cannot move work order from ${order.status} to ${nextStatus}` } });
      const technicianId = req.body.technicianId || order.technicianId;
      if (nextStatus === 'Assigned' && !req.body.technicianName && !order.technicianName && !technicianId) return res.status(422).json({ error: { message: 'A mechanic must be assigned before the order is assigned' } });
      if (technicianId) {
        const technician = await Technician.findByPk(technicianId);
        if (!technician) return res.status(422).json({ error: { message: 'Selected technician was not found' } });
        if (!technician.active) return res.status(422).json({ error: { message: 'Inactive technicians cannot be assigned' } });
        req.body.technicianName = technician.name;
      }
      if (nextStatus === 'Repair Completed' && !req.body.completionNotes) return res.status(422).json({ error: { message: 'Completion notes are required before repair completion' } });
      if (nextStatus === 'Closed' && !req.body.verificationNotes) return res.status(422).json({ error: { message: 'Verification notes are required before closure' } });
      const now = new Date();
      const actor = req.auth?.sub || req.auth?.userId || 'system';
      const values = { ...req.body, status: nextStatus };
      if (nextStatus === 'Assigned') { values.assignedAt = now; values.assignedBy = actor; }
      if (nextStatus === 'In Progress' && !order.startedAt) values.startedAt = now;
      if (nextStatus === 'Repair Completed') values.completedAt = now;
      if (nextStatus === 'Closed') { values.verifiedAt = now; values.verifiedBy = actor; }
      await order.update(values);
      return res.json({ result: await WorkOrder.findByPk(order.id, { include: [{ model: Machine, as: 'machine' }, { model: Technician, as: 'technician' }] }) });
    } catch (error) { return next(error); }
  }
}
module.exports = new WorkOrderController();
