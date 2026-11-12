const BaseRouter = require('./BaseRouter');
const controller = require('../controllers/WorkOrderController');
const router = new BaseRouter(controller);
router.addCustomRoute('patch', '/:id/workflow', controller.transition);
module.exports = router.getRouter();
