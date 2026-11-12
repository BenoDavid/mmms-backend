const BaseRouter = require('./BaseRouter');
const TechnicianController = require('../controllers/TechnicianController');
const { Technician } = require('../models');

module.exports = new BaseRouter(new TechnicianController(Technician)).getRouter();
