const BaseRouter = require('./BaseRouter');
const router = new BaseRouter(require('../controllers/PreventiveMaintenanceController'));
module.exports = router.getRouter();
