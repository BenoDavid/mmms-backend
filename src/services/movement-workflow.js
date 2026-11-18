const HttpError = require("../errors/http-error");

const transferTransitions = Object.freeze({
  Draft: ["Submitted", "Cancelled"],
  Submitted: ["Pending Approval", "Cancelled"],
  "Pending Approval": ["Approved", "Rejected", "Cancelled"],
  Approved: ["In Transit", "Cancelled"],
  "In Transit": ["Received"],
  Received: ["Completed"],
  Completed: [],
  Rejected: [],
  Cancelled: [],
});
const allocationTransitions = Object.freeze({
  Draft: ["Pending Approval", "Cancelled"],
  "Pending Approval": ["Approved", "Rejected", "Cancelled"],
  Approved: ["Released"],
  Released: [],
  Rejected: [],
  Cancelled: [],
  Superseded: [],
});

function validateTransition(module, from, to, reason) {
  const transitions =
    module === "transfers" ? transferTransitions : allocationTransitions;
  if (!transitions[from]?.includes(to))
    throw new HttpError(422, `Cannot move ${module} from ${from} to ${to}`);
  if (["Rejected", "Cancelled"].includes(to) && !String(reason || "").trim())
    throw new HttpError(422, "A reason is required");
}

function requireAction(req, module, action) {
  const permission = `MMMS-${module.toUpperCase()}-${action}`;
  const permissions = req.auth?.permissions || [];
  if (
    req.auth?.development ||
    permissions.includes("*") ||
    permissions.includes(permission)
  )
    return;
  throw new HttpError(403, `${permission} permission required`);
}

function locationOf(machine) {
  return {
    ...Object.fromEntries(
      [
        "organizationId",
        "factoryId",
        "factory",
        "factoryLocation",
        "department",
        "floor",
        "productionLine",
        "currentLocation",
        "responsiblePerson",
      ].map((key) => [key, machine[key] || null]),
    ),
    ...(machine.locationIds || {}),
  };
}

module.exports = {
  transferTransitions,
  allocationTransitions,
  validateTransition,
  requireAction,
  locationOf,
};
