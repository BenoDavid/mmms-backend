const test = require("node:test");
const assert = require("node:assert/strict");
const {
  assertRecordAccess,
  assertPayloadAccess,
  filterRecords,
} = require("../src/middleware/data-scope");
const req = {
  auth: {
    accessScopes: [
      { applicationName: "MMMS", organizationId: "o1", factoryId: "f1" },
    ],
  },
  query: {},
};
test("factory boundaries reject reads and writes outside assigned scope", () => {
  const own = { organizationId: "o1", factoryId: "f1" };
  const other = { organizationId: "o1", factoryId: "f2" };
  assert.doesNotThrow(() => assertRecordAccess(req, own));
  assert.throws(() => assertRecordAccess(req, other), { status: 403 });
  assert.throws(() => assertPayloadAccess(req, other), { status: 403 });
  assert.deepEqual(filterRecords(req, [own, other]), [own]);
});
test("missing access assignments fail closed", () => {
  assert.throws(
    () => assertRecordAccess({ auth: {}, query: {} }, { organizationId: "o1" }),
    { status: 403 },
  );
});
