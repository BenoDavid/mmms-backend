if (
  process.env.DB_NAME !== "mmms_auth_workflow_test" ||
  process.env.DB_PORT !== "55432"
)
  throw new Error("Disposable test database required");
const app = require("../../authguardv2-node/src/app");
const { sequelize } = require("../../authguardv2-node/src/models");
const server = app.listen(0, "127.0.0.1", () =>
  process.send?.({ port: server.address().port }),
);
process.on("message", (message) => {
  if (message === "shutdown")
    server.close(async () => {
      await sequelize.close();
      process.exit(0);
    });
});
process.on("disconnect", () =>
  server.close(async () => {
    await sequelize.close();
    process.exit(0);
  }),
);
