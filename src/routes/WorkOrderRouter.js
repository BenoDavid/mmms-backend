const BaseRouter = require("./BaseRouter");
const controller = require("../controllers/WorkOrderController");
const router = new BaseRouter(controller);
router.addCustomRoute("patch", "/:id/workflow", controller.transition);
router.addCustomRoute("get", "/:id/history", controller.history);
module.exports = router.getRouter();
