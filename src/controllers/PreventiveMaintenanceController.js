const { PreventiveMaintenance, Machine } = require('../models');
const BaseController = require('./BaseController');
class PreventiveMaintenanceController extends BaseController {
  constructor() { super(PreventiveMaintenance, { include: [{ model: Machine, as: 'machine' }] }); }
}
module.exports = new PreventiveMaintenanceController();
