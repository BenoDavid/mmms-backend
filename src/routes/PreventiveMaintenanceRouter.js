const BaseRouter = require("./BaseRouter");
const router = new BaseRouter(
  require("../controllers/PreventiveMaintenanceController"),
);
const controller = require("../controllers/PreventiveMaintenanceController");
router.addCustomRoute("post", "/:id/generate", controller.generate);
router.addCustomRoute("get", "/:id/occurrences", controller.occurrences);
module.exports = router.getRouter();
