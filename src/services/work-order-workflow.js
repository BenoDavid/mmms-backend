const HttpError = require("../errors/http-error");

// MMMS-NEW.MD section 12; legacy states remain available for existing records.
const transitions = Object.freeze({
  Draft: ["Submitted", "Cancelled"],
  Submitted: ["Approved", "Cancelled"],
  Approved: ["Assigned", "Cancelled"],
  Open: ["Assigned", "Cancelled"],
  Assigned: ["In Progress", "Approved", "Cancelled"],
  "In Progress": [
    "On Hold",
    "Pending Spare Parts",
    "Waiting Parts",
    "Completed",
    "Repair Completed",
  ],
  "On Hold": ["In Progress", "Cancelled"],
  "Pending Spare Parts": ["In Progress", "Cancelled"],
  "Waiting Parts": ["In Progress", "Cancelled"],
  "Repair Completed": ["Verification", "In Progress"],
  Verification: ["Verified", "In Progress"],
  Completed: ["Verified", "In Progress"],
  Verified: ["Closed", "In Progress"],
  Closed: [],
  Cancelled: [],
});

function workflowValues(order, input, actor, now = new Date()) {
  const status = input.status;
  const fail = (message) => {
    throw new HttpError(422, message);
  };
  const text = (value) => typeof value === "string" && value.trim().length > 0;
  if (!transitions[order.status]?.includes(status))
    fail(`Cannot move work order from ${order.status} to ${status}`);
  if (status === "Assigned" && !input.technicianId && !order.technicianId)
    fail("Select an active mechanic before assignment");
  if (["Completed", "Repair Completed"].includes(status)) {
    for (const key of ["diagnosis", "repairNotes", "completionNotes"]) {
      if (!text(input[key] ?? order[key]))
        fail(`${key} is required before completion`);
    }
    const checklist = order.details?.checklist || [];
    const results =
      input.details?.checklistResults || order.details?.checklistResults || {};
    if (
      !checklist.every((item) =>
        ["Pass", "Fail", "Not Applicable"].includes(results[item]),
      )
    )
      fail("Complete every maintenance checklist response before completion");
  }
  if (
    status === "Verified" &&
    !text(input.verificationNotes ?? order.verificationNotes)
  )
    fail("Verification notes are required");
  if (
    status === "In Progress" &&
    ["Completed", "Repair Completed", "Verification", "Verified"].includes(
      order.status,
    ) &&
    !text(input.rejectionReason)
  )
    fail("A rejection reason is required to return a repair");
  if (["On Hold", "Cancelled"].includes(status) && !text(input.rejectionReason))
    fail("A reason is required to hold or cancel an order");
  for (const key of ["laborMinutes", "partsCost", "contractorCost"]) {
    if (
      input[key] !== undefined &&
      (!Number.isFinite(Number(input[key])) || Number(input[key]) < 0)
    )
      fail(`${key} must be a nonnegative number`);
  }
  const values = {};
  for (const key of [
    "technicianId",
    "diagnosis",
    "repairNotes",
    "completionNotes",
    "verificationNotes",
    "rejectionReason",
    "laborMinutes",
    "partsCost",
    "contractorCost",
  ]) {
    if (input[key] !== undefined) values[key] = input[key];
  }
  values.status = status;
  if (input.details?.checklistResults)
    values.details = {
      ...order.details,
      checklistResults: input.details.checklistResults,
    };
  if (status === "Assigned")
    Object.assign(values, { assignedAt: now, assignedBy: actor });
  if (status === "In Progress") {
    values.startedAt = order.startedAt || now;
    values.pausedAt = null;
    if (
      ["Completed", "Repair Completed", "Verification", "Verified"].includes(
        order.status,
      )
    )
      Object.assign(values, {
        completedAt: null,
        verifiedAt: null,
        verifiedBy: null,
      });
  }
  if (["On Hold", "Pending Spare Parts", "Waiting Parts"].includes(status))
    values.pausedAt = now;
  if (["Completed", "Repair Completed"].includes(status))
    values.completedAt = now;
  if (status === "Verified")
    Object.assign(values, { verifiedAt: now, verifiedBy: actor });
  return values;
}

function assertWorkflowPermission(req, status) {
  const action =
    status === "Assigned"
      ? "ASSIGN"
      : status === "Approved"
        ? "APPROVE"
        : ["Verified", "Closed"].includes(status)
          ? "VERIFY"
          : null;
  if (!action) return;
  const permissions = req.auth?.permissions || [];
  const required = `MMMS-WORK-ORDERS-${action}`;
  if (
    req.auth?.development ||
    permissions.includes("*") ||
    permissions.includes(required)
  )
    return;
  throw new HttpError(403, `${required} permission required`);
}

module.exports = { transitions, workflowValues, assertWorkflowPermission };
