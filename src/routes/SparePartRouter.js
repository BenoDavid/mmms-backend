const BaseRouter = require("./BaseRouter");
const router = new BaseRouter(require("../controllers/SparePartController"));
const inventory = require("../controllers/InventoryController");
router
  .getRouter()
  .get("/:id/transactions", (req, res, next) =>
    inventory.list(req, res).catch(next),
  );
router
  .getRouter()
  .post("/:id/transactions", (req, res, next) =>
    inventory.transact(req, res).catch(next),
  );
module.exports = router.getRouter();
