const { Breakdown, Machine } = require('../models');
const BaseController = require('./BaseController');
class BreakdownController extends BaseController {
  constructor() { super(Breakdown, { include: [{ model: Machine, as: 'machine' }] }); }
}
module.exports = new BreakdownController();
