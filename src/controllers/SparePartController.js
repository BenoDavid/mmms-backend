const { SparePart } = require('../models');
const BaseController = require('./BaseController');
class SparePartController extends BaseController {
  constructor() { super(SparePart); }
}
module.exports = new SparePartController();
