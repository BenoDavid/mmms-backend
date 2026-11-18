const { createHash } = require("node:crypto");
const { sequelize, MasterRecord } = require("../models");
const HttpError = require("../errors/http-error");
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
async function beginSubmission(req, transaction) {
  if (!req.body.requestId) return null;
  if (!/^[a-zA-Z0-9-]{8,100}$/.test(req.body.requestId))
    throw new HttpError(422, "A stable requestId is required");
  const code = createHash("sha256")
    .update(`${req.auth?.sub || "system"}:${req.body.requestId}`)
    .digest("hex");
  const hash = createHash("sha256")
    .update(JSON.stringify(canonical(req.body)))
    .digest("hex");
  await sequelize.query("SELECT pg_advisory_xact_lock(hashtext(:code))", {
    replacements: { code },
    transaction,
  });
  const existing = await MasterRecord.findOne({
    where: { module: "offline-submissions", code },
    transaction,
  });
  if (existing && existing.data.hash !== hash)
    throw new HttpError(
      409,
      "This submission ID was already used for different data",
    );
  return { code, hash, existing };
}
async function finishSubmission(submission, result, machine, transaction) {
  if (!submission || submission.existing) return;
  await MasterRecord.create(
    {
      module: "offline-submissions",
      code: submission.code,
      name: "Offline maintenance submission",
      status: "Applied",
      organizationId: machine.organizationId,
      factoryId: machine.factoryId,
      data: { hash: submission.hash, resultId: result.id },
    },
    { transaction },
  );
}
module.exports = { beginSubmission, finishSubmission };
