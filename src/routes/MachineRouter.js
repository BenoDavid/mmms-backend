const MachineController = require('../controllers/MachineController');
const BaseRouter = require('./BaseRouter');
const router = new BaseRouter(MachineController);
router.addCustomRoute('get', '/:id/history', MachineController.getHistory);
router.addCustomRoute('patch', '/:id/status', MachineController.setStatus);
module.exports = router.getRouter();
