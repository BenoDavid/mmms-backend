const test = require("node:test");
const assert = require("node:assert/strict");
const { reportRows } = require("../src/services/maintenance-reporting");
test("consumption excludes issue returns and recognizes returns of older consumption", () => {
  const records = [
    {
      module: "stock-transactions",
      id: "old",
      type: "Consumption",
      quantity: 5,
      unitCost: 4,
      createdAt: "old",
    },
    {
      module: "stock-transactions",
      id: "issue",
      type: "Issue",
      quantity: 3,
      createdAt: "old",
    },
    {
      module: "stock-transactions",
      id: "return-issue",
      type: "Return",
      sourceTransactionId: "issue",
      quantity: 2,
      unitCost: 4,
      createdAt: "now",
    },
    {
      module: "stock-transactions",
      id: "return-consumed",
      type: "Return",
      sourceTransactionId: "old",
      quantity: 1,
      unitCost: 4,
      createdAt: "now",
    },
  ];
  const rows = reportRows("spare-parts-consumption", {
    records,
    inRange: (value) => value === "now",
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].signedQuantity, -1);
  assert.equal(rows[0].signedCost, -4);
});
