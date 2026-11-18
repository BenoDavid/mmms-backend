const { MasterRecord, sequelize } = require("../models");
const { assertPayloadAccess } = require("../middleware/data-scope");
const HttpError = require("../errors/http-error");
const defaults = Object.freeze({
  machineCategories: [
    "Sewing",
    "Cutting",
    "Finishing",
    "Embroidery",
    "Utility and Support",
    "Overlock",
    "Lockstitch",
    "Single Needle Lockstitch Machine",
    "Double Needle Machine",
    "Flatlock Machine",
    "Feed of the Arm Machine",
    "Buttonhole Machine",
    "Button Attach Machine",
    "Bartack Machine",
    "Zigzag Machine",
    "Blind Stitch Machine",
    "Special Purpose Sewing Machines",
    "Fabric Cutting Machine",
    "Straight Knife Cutting Machine",
    "Round Knife Cutting Machine",
    "Band Knife Machine",
    "Automatic Cutting Machine",
    "Fabric Spreading Machine",
    "End Cutter",
    "Steam Iron",
    "Vacuum Ironing Table",
    "Fusing Machine",
    "Thread Trimming Machine",
    "Needle Detector",
    "Garment Pressing Machine",
    "Folding Machine",
    "Packing Machine",
    "Embroidery Machine",
    "Multi-Head Embroidery Machine",
    "Embroidery Frame Equipment",
    "Air Compressor",
    "Boiler",
    "Generator",
    "HVAC Equipment",
    "Electrical Panels",
    "Water Pumps",
    "Air Dryers",
    "Industrial Fans",
  ],
  machineSubcategories: ["General"],
  machineTypes: ["Machine", "Measuring Equipment", "Utility Equipment"],
  costCategories: [
    "Labour Cost",
    "Spare Parts Cost",
    "External Service Cost",
    "Transportation Cost",
    "Repair Cost",
    "Inspection Cost",
    "Calibration Cost",
    "Other Expenses",
  ],
  breakdownCategories: [
    "Electrical Failure",
    "Mechanical Failure",
    "Motor Failure",
    "Bearing Failure",
    "Belt Failure",
    "Pneumatic Failure",
    "Hydraulic Failure",
    "Sensor Failure",
    "Software or Control Failure",
    "Lubrication Issue",
    "Overheating",
    "Physical Damage",
    "Other",
  ],
  workOrderTypes: [
    "Breakdown Repair",
    "Preventive Maintenance",
    "Corrective Maintenance",
    "Inspection",
    "Installation",
    "Modification",
    "General Maintenance",
  ],
  maintenanceCategories: [
    "Lubrication",
    "Cleaning",
    "Belt Inspection",
    "Bearing Inspection",
    "Electrical Inspection",
    "Motor Inspection",
    "Sensor Inspection",
    "Safety Inspection",
    "Component Replacement",
    "Performance Testing",
  ],
  inspectionTypes: [
    "Daily Inspection",
    "Weekly Inspection",
    "Monthly Inspection",
    "Safety Inspection",
    "Electrical Inspection",
    "Mechanical Inspection",
    "Quality Inspection",
    "Pre-Operation Inspection",
  ],
  sparePartCategories: [
    "Mechanical",
    "Electrical",
    "Pneumatic",
    "Hydraulic",
    "Consumable",
  ],
  unitsOfMeasurement: ["Each", "Set", "Meter", "Liter", "Kilogram"],
  mechanicSpecializations: [
    "Electrical",
    "Mechanical",
    "Electronics",
    "Pneumatics",
    "Hydraulics",
    "Sewing Machine Maintenance",
    "Cutting Machine Maintenance",
    "Embroidery Machine Maintenance",
    "Boiler Maintenance",
    "General Maintenance",
  ],
  documentCategories: [
    "Machine Image",
    "Purchase Invoice",
    "Warranty Document",
    "User Manual",
    "Technical Drawing",
    "Maintenance Manual",
    "Inspection Certificate",
    "Calibration Certificate",
    "Other",
  ],
  inspectionChecklists: [
    {
      name: "Daily safety",
      items: [
        "Safety guards in place",
        "Emergency stop functional",
        "No visible leaks",
        "Work area clear",
      ],
    },
  ],
  maintenanceFrequencies: [
    { name: "Daily", unit: "Days", interval: 1 },
    { name: "Weekly", unit: "Days", interval: 7 },
    { name: "Monthly", unit: "Months", interval: 1 },
    { name: "Quarterly", unit: "Months", interval: 3 },
    { name: "Half-Yearly", unit: "Months", interval: 6 },
    { name: "Yearly", unit: "Months", interval: 12 },
    { name: "Operating Hours Based", unit: "Hours", interval: 500 },
    { name: "Production Quantity Based", unit: "Quantity", interval: 10000 },
  ],
  statusLabels: {},
  approvalWorkflows: {},
  customFields: {},
  notificationRules: {},
  laborRatePerHour: 0,
});

function validateSetting(key, value) {
  if (!Object.hasOwn(defaults, key))
    throw new HttpError(422, "Unknown configuration key");
  const reference = defaults[key];
  if (typeof reference === "number" && (!Number.isFinite(value) || value < 0))
    throw new HttpError(422, "Rate must be a nonnegative number");
  if (Array.isArray(reference)) {
    if (!Array.isArray(value) || !value.length || value.length > 500)
      throw new HttpError(422, "Provide between 1 and 500 options");
    if (
      typeof reference[0] === "string" &&
      (!value.every((item) => typeof item === "string" && item.trim()) ||
        new Set(value).size !== value.length)
    )
      throw new HttpError(422, "Options must be unique, nonempty strings");
    if (
      key === "maintenanceFrequencies" &&
      !value.every(
        (item) =>
          typeof item.name === "string" &&
          ["Days", "Months", "Hours", "Quantity"].includes(item.unit) &&
          Number.isSafeInteger(item.interval) &&
          item.interval > 0,
      )
    )
      throw new HttpError(
        422,
        "Frequencies require a name, unit and positive whole-number interval",
      );
    if (
      key === "inspectionChecklists" &&
      !value.every(
        (item) =>
          typeof item.name === "string" &&
          Array.isArray(item.items) &&
          item.items.length &&
          item.items.every((item) => typeof item === "string" && item.trim()),
      )
    )
      throw new HttpError(
        422,
        "Checklists require a name and nonempty item list",
      );
  } else if (
    typeof reference === "object" &&
    (!value || typeof value !== "object" || Array.isArray(value))
  )
    throw new HttpError(422, "Provide a JSON object");
  if (
    key === "notificationRules" &&
    !Object.values(value).every(
      (rule) =>
        rule &&
        typeof rule === "object" &&
        (rule.enabled === undefined || typeof rule.enabled === "boolean") &&
        (rule.channels === undefined ||
          (Array.isArray(rule.channels) &&
            rule.channels.every((channel) =>
              ["EMAIL", "PUSH", "IN_APP"].includes(channel),
            ))),
    )
  )
    throw new HttpError(
      422,
      "Notification rules require enabled and channels (IN_APP, EMAIL, PUSH)",
    );
  if (
    key === "statusLabels" &&
    !Object.values(value).every(
      (label) =>
        typeof label === "string" && label.trim() && label.length <= 80,
    )
  )
    throw new HttpError(
      422,
      "Status labels must be nonempty strings up to 80 characters",
    );
  if (
    key === "approvalWorkflows" &&
    !Object.entries(value).every(
      ([module, rule]) =>
        ["allocations", "transfers", "work-orders"].includes(module) &&
        rule &&
        (rule.separateRequester === undefined ||
          typeof rule.separateRequester === "boolean") &&
        (rule.approverEmployeeCodes === undefined ||
          (Array.isArray(rule.approverEmployeeCodes) &&
            rule.approverEmployeeCodes.every(
              (code) => typeof code === "string" && code.trim(),
            ))),
    )
  )
    throw new HttpError(
      422,
      "Approval workflows require a supported module, separateRequester and approverEmployeeCodes",
    );
  if (key === "customFields")
    for (const fields of Object.values(value))
      if (
        !Array.isArray(fields) ||
        !fields.every(
          (field) =>
            /^[a-zA-Z][a-zA-Z0-9_]{0,59}$/.test(field.key) &&
            typeof field.label === "string" &&
            ["text", "number", "date"].includes(field.type),
        )
      )
        throw new HttpError(
          422,
          "Custom fields require key, label and type (text, number or date)",
        );
}

async function configuration(req, transaction) {
  const organizationId = req.query.organizationId || req.body?.organizationId;
  const factoryId = req.query.factoryId || req.body?.factoryId;
  if (organizationId || factoryId)
    assertPayloadAccess({ ...req, query: {} }, { organizationId, factoryId });
  const rows = await MasterRecord.findAll({
    where: { module: "configuration", status: "Active" },
    transaction,
  });
  const applicable = rows
    .filter(
      (row) =>
        (!row.organizationId || row.organizationId === organizationId) &&
        (!row.factoryId || row.factoryId === factoryId),
    )
    .sort(
      (a, b) =>
        Number(Boolean(a.factoryId)) * 2 +
        Number(Boolean(a.organizationId)) -
        (Number(Boolean(b.factoryId)) * 2 + Number(Boolean(b.organizationId))),
    );
  const result = structuredClone(defaults);
  for (const row of applicable)
    if (Object.hasOwn(defaults, row.code) && row.data.value !== undefined)
      result[row.code] = row.data.value;
  const categories = await MasterRecord.findAll({
    where: { module: "machine-categories", status: "Active" },
    transaction,
  });
  const extra = categories
    .filter(
      (row) =>
        (!row.organizationId || row.organizationId === organizationId) &&
        (!row.factoryId || row.factoryId === factoryId),
    )
    .map((row) => row.name);
  result.machineCategories = [
    ...new Set([...result.machineCategories, ...extra]),
  ];
  return result;
}

async function saveSetting(req) {
  validateSetting(req.params.key, req.body.value);
  const { organizationId, factoryId } = req.body;
  if (!organizationId || !factoryId)
    throw new HttpError(
      422,
      "Select a company and factory for this configuration override",
    );
  assertPayloadAccess(req, { organizationId, factoryId });
  return sequelize.transaction(async (transaction) => {
    const code = req.params.key;
    await sequelize.query("SELECT pg_advisory_xact_lock(hashtext(:code))", {
      replacements: { code: `${organizationId}:${factoryId}:${code}` },
      transaction,
    });
    const row = await MasterRecord.findOne({
      where: { module: "configuration", code, organizationId, factoryId },
      transaction,
    });
    const data = {
      value: req.body.value,
      changes: [
        ...(row?.data.changes || []),
        {
          at: new Date().toISOString(),
          by: String(req.auth?.sub || "system"),
          previousValue: row?.data.value ?? defaults[code],
        },
      ],
    };
    const values = {
      module: "configuration",
      code,
      name: code,
      organizationId,
      factoryId,
      status: "Active",
      data,
    };
    return row
      ? row.update(values, { transaction })
      : MasterRecord.create(values, { transaction });
  });
}

async function validateCustomFields(req, resource, values, transaction) {
  const settings = await configuration(req, transaction);
  for (const field of settings.customFields[resource] || []) {
    const value = values?.[field.key];
    if (
      field.required &&
      (value === undefined || value === null || String(value).trim() === "")
    )
      throw new HttpError(422, `${field.label} is required`);
    if (
      value !== undefined &&
      value !== "" &&
      field.type === "number" &&
      !Number.isFinite(Number(value))
    )
      throw new HttpError(422, `${field.label} must be numeric`);
    if (
      value &&
      field.type === "date" &&
      !Number.isFinite(new Date(value).getTime())
    )
      throw new HttpError(422, `${field.label} must be a date`);
  }
}
module.exports = {
  defaults,
  configuration,
  saveSetting,
  validateSetting,
  validateCustomFields,
};
