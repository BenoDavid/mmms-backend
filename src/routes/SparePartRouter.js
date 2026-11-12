const BaseRouter = require('./BaseRouter');
const router = new BaseRouter(require('../controllers/SparePartController'));
module.exports = router.getRouter();
