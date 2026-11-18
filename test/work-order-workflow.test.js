const test = require("node:test");
const assert = require("node:assert/strict");
const {
  workflowValues,
  assertWorkflowPermission,
} = require("../src/services/work-order-workflow");

const now = new Date("2026-11-17T08:00:00Z");
const step = (order, input) =>
  workflowValues(order, input, "supervisor-1", now);
test("page permission alone cannot approve, verify or close a repair", () => {
  const req = { auth: { permissions: ["MMMS-APP", "MMMS-WORK-ORDERS"] } };
  for (const status of ["Approved", "Verified", "Closed"])
    assert.throws(() => assertWorkflowPermission(req, status), { status: 403 });
  assert.doesNotThrow(() =>
    assertWorkflowPermission(
      { auth: { permissions: ["MMMS-WORK-ORDERS-VERIFY"] } },
      "Verified",
    ),
  );
  assert.doesNotThrow(() =>
    assertWorkflowPermission({ auth: { permissions: ["*"] } }, "Approved"),
  );
});
test("required lifecycle runs from draft through verified closure", () => {
  let order = { status: "Draft" };
  for (const status of [
    "Submitted",
    "Approved",
    "Assigned",
    "In Progress",
    "Completed",
    "Verified",
    "Closed",
  ]) {
    order = {
      ...order,
      ...step(order, {
        status,
        technicianId: "mechanic-1",
        diagnosis: "Belt worn",
        repairNotes: "Replaced belt",
        completionNotes: "Test passed",
        verificationNotes: "Operation confirmed",
      }),
    };
  }
  assert.equal(order.status, "Closed");
  assert.equal(order.verifiedBy, "supervisor-1");
  assert.equal(order.startedAt, now);
});
test("completion cannot skip verification", () => {
  assert.throws(
    () =>
      step(
        { status: "Completed" },
        { status: "Closed", verificationNotes: "skip" },
      ),
    /Cannot move/,
  );
  assert.throws(
    () => step({ status: "Verification" }, { status: "Closed" }),
    /Cannot move/,
  );
});
test("repair completion requires diagnosis, actions and notes", () => {
  for (const key of ["diagnosis", "repairNotes", "completionNotes"]) {
    const input = {
      status: "Completed",
      diagnosis: "fault",
      repairNotes: "repaired",
      completionNotes: "tested",
    };
    input[key] = "  ";
    assert.throws(
      () => step({ status: "In Progress" }, input),
      new RegExp(key),
    );
  }
});
test("verification rejection requires a reason and clears approval", () => {
  assert.throws(
    () => step({ status: "Verified" }, { status: "In Progress" }),
    /rejection reason/,
  );
  const result = step(
    { status: "Verified", startedAt: now },
    { status: "In Progress", rejectionReason: "Vibration persists" },
  );
  assert.equal(result.verifiedBy, null);
  assert.equal(result.verifiedAt, null);
  assert.equal(result.completedAt, null);
  assert.equal(result.startedAt, now);
});
test("holds and cancellation need a reason; closed history is immutable", () => {
  assert.throws(
    () => step({ status: "In Progress" }, { status: "On Hold" }),
    /reason/,
  );
  assert.throws(
    () => step({ status: "Draft" }, { status: "Cancelled" }),
    /reason/,
  );
  assert.throws(
    () => step({ status: "Closed" }, { status: "In Progress" }),
    /Cannot move/,
  );
});
test("assignment needs a mechanic ID, not just an unverified name", () => {
  assert.throws(
    () =>
      step(
        { status: "Approved" },
        { status: "Assigned", technicianName: "Someone" },
      ),
    /mechanic/,
  );
});
test("costs cannot be negative or nonfinite; clients cannot forge audit identities", () => {
  for (const value of [-1, "NaN", Infinity])
    assert.throws(
      () =>
        step(
          { status: "Assigned" },
          { status: "In Progress", partsCost: value },
        ),
      /nonnegative/,
    );
  const result = step(
    { status: "Approved" },
    {
      status: "Assigned",
      technicianId: "m1",
      assignedBy: "forged",
      verifiedBy: "forged",
    },
  );
  assert.equal(result.assignedBy, "supervisor-1");
  assert.equal(result.verifiedBy, undefined);
});
