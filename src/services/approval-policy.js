const { configuration } = require("./maintenance-configuration");
const HttpError = require("../errors/http-error");

// Configuration can narrow approvers; it cannot bypass the mandatory permission or audit states.
async function assertApprovalPolicy(
  req,
  module,
  record,
  requester,
  transaction,
) {
  const settings = await configuration(
    {
      ...req,
      query: {
        organizationId: record.organizationId,
        factoryId: record.factoryId,
      },
    },
    transaction,
  );
  const policy = settings.approvalWorkflows[module];
  if (!policy) return;
  const actor = String(req.auth?.sub || "system");
  if (policy.separateRequester && requester === actor)
    throw new HttpError(403, "Approval requires another authorized person");
  if (
    policy.approverEmployeeCodes?.length &&
    !policy.approverEmployeeCodes.includes(actor)
  )
    throw new HttpError(
      403,
      "This factory approval policy requires a designated approver",
    );
}
module.exports = { assertApprovalPolicy };
