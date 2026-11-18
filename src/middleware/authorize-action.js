const { requireAction } = require("../services/movement-workflow");
module.exports = function authorizeAction(module) {
  return (req, res, next) => {
    if (
      req.method === "GET" ||
      ["/customGet", "/customGetAll"].includes(req.path)
    )
      return next();
    if (module === "spare-parts" && req.path.endsWith("/transactions"))
      return next();
    const action = req.path.endsWith("/workflow")
      ? {
          Approved: "APPROVE",
          Rejected: "REJECT",
          Verified: "VERIFY",
          Closed: "VERIFY",
          Assigned: "ASSIGN",
          Received: "RECEIVE",
        }[req.body?.status] || "EDIT"
      : req.method === "DELETE"
        ? "DELETE"
        : req.method === "POST" && ["/", "/createBatch"].includes(req.path)
          ? "CREATE"
          : "EDIT";
    try {
      requireAction(req, module, action);
      next();
    } catch (error) {
      next(error);
    }
  };
};
