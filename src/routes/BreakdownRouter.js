const BaseRouter = require('./BaseRouter');
const router = new BaseRouter(require('../controllers/BreakdownController'));
module.exports = router.getRouter();
