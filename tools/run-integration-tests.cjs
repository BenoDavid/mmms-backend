const { spawnSync, fork } = require("node:child_process");
const path = require("node:path");
const { Client } = require("pg");
const root = path.resolve(__dirname, "..");
const authRoot = path.resolve(root, "../authguardv2-node");
const env = {
  ...process.env,
  DB_SSL: "false",
  DB_HOST: "127.0.0.1",
  DB_PORT: "55432",
  DB_USER: process.env.MMMS_TEST_DB_USER || "mmms_test",
  DB_PASSWORD: process.env.MMMS_TEST_DB_PASSWORD || "mmms_test_local",
  MMMS_DB_NAME: "mmms_workflow_test",
  NODE_ENV: "test",
  MMMS_INTEGRATION_TEST: "true",
  JWT_SECRET: "mmms-isolated-integration-test-secret-only",
  MMMS_EMAIL_WEBHOOK_URL: "",
  MMMS_PUSH_WEBHOOK_URL: "",
};
function run(file, args, cwd, childEnv) {
  const result = spawnSync(process.execPath, [file, ...args], {
    cwd,
    env: childEnv,
    stdio: "inherit",
  });
  if (result.status !== 0)
    throw new Error(
      `Test prerequisite failed (${result.status}): ${path.basename(file)}`,
    );
}
async function main() {
  const client = new Client({
    host: env.DB_HOST,
    port: Number(env.DB_PORT),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.MMMS_DB_NAME,
  });
  await client.connect();
  if (
    !(
      await client.query(
        "SELECT 1 FROM pg_database WHERE datname = 'mmms_auth_workflow_test'",
      )
    ).rowCount
  )
    await client.query("CREATE DATABASE mmms_auth_workflow_test");
  await client.end();
  run(
    path.join(root, "node_modules/sequelize-cli/lib/sequelize"),
    ["db:migrate"],
    root,
    env,
  );
  const authEnv = {
    ...env,
    DB_NAME: "mmms_auth_workflow_test",
    CORS_ORIGIN: "http://localhost:4200",
  };
  run(
    path.join(authRoot, "node_modules/sequelize-cli/lib/sequelize"),
    ["db:migrate"],
    authRoot,
    authEnv,
  );
  run(
    path.join(authRoot, "scripts/create-mmms-test-user.js"),
    [],
    authRoot,
    authEnv,
  );
  const auth = fork(path.join(__dirname, "auth-test-server.cjs"), [], {
    cwd: authRoot,
    env: authEnv,
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  });
  try {
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Test identity server did not start")),
        10000,
      );
      auth.once("message", (message) => {
        clearTimeout(timer);
        resolve(message.port);
      });
      auth.once("error", reject);
    });
    const testEnv = {
      ...env,
      MMMS_TEST_AUTH_URL: `http://127.0.0.1:${port}/v3/api/auth`,
      AUTHGUARD_VENDORS_URL: `http://127.0.0.1:${port}/v3/api/auth/vendors`,
    };
    run("--test", ["test/workflows.integration.test.js"], root, testEnv);
    run("--test", ["test/appearance.integration.test.js"], root, testEnv);
  } finally {
    auth.send("shutdown");
  }
}
main().catch((error) => {
  console.error(error.message);
  console.error(
    "Start the disposable PostgreSQL container documented in docs/MMMS-TESTING.md. No application database was changed.",
  );
  process.exitCode = 1;
});
