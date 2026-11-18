const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
test(
  "shared appearance: real login, account isolation, membership, mode and validation",
  { skip: process.env.MMMS_INTEGRATION_TEST !== "true" },
  async () => {
    assert.equal(process.env.DB_HOST, "127.0.0.1");
    assert.equal(process.env.DB_PORT, "55432");
    process.env.DB_NAME = "mmms_auth_workflow_test";
    const {
      sequelize,
      User,
      BrandingAccount,
      UserAppearance,
    } = require("../../authguardv2-node/src/models");
    const bcrypt = require("../../authguardv2-node/node_modules/bcryptjs");
    const {
      defaultTheme,
    } = require("../../authguardv2-node/src/services/appearance-validation");
    const base = process.env.MMMS_TEST_AUTH_URL;
    const request = async (path, method, body, token) => {
      const response = await fetch(base + path, {
        method,
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: "Bearer " + token } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: response.status, body: await response.json() };
    };
    const login = async (employeeCode) => {
      const response = await request("/users/login", "POST", {
        employeeCode,
        authCode: "mmms-local-browser-test",
      });
      assert.equal(response.status, 200, JSON.stringify(response));
      const data = response.body.data || response.body;
      return data.accessToken || data.token;
    };
    const suffix = randomUUID().slice(0, 8);
    const users = [];
    let account;
    try {
      for (let i = 0; i < 3; i++)
        users.push(
          await User.create({
            employeeCode: "THEME-" + suffix + "-" + i,
            employeeName: "Theme isolation " + suffix + " " + i,
            authCode: await bcrypt.hash("mmms-local-browser-test", 10),
          }),
        );
      const admin = await login("MMMS-TEST"),
        a = await login(users[0].employeeCode),
        b = await login(users[1].employeeCode),
        c = await login(users[2].employeeCode);
      assert.equal((await request("/appearance", "GET")).status, 401);
      assert.equal(
        (await request("/appearance/management", "GET", null, a)).status,
        403,
      );
      const theme = structuredClone(defaultTheme);
      theme.font = "arial";
      theme.cardRadius = 22;
      theme.defaultMode = "dark";
      theme.light.primary = "#7046a0";
      theme.dark.primary = "#c3a1ed";
      let result = await request(
        "/appearance/accounts",
        "POST",
        { name: "Vendor " + suffix, code: "THEME-" + suffix, theme },
        admin,
      );
      assert.equal(result.status, 201, JSON.stringify(result));
      account = result.body.result;
      assert.equal(
        (
          await request(
            "/appearance/accounts/" + account.id + "/members",
            "PUT",
            { userIds: users.slice(0, 2).map((user) => String(user.id)) },
            a,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await request(
            "/appearance/accounts/" + account.id + "/members",
            "PUT",
            { userIds: users.slice(0, 2).map((user) => String(user.id)) },
            admin,
          )
        ).status,
        200,
      );
      for (const token of [a, b]) {
        result = await request("/appearance", "GET", null, token);
        assert.equal(result.body.result.account.id, account.id);
        assert.deepEqual(result.body.result.theme, theme);
      }
      assert.equal(
        (await request("/appearance", "GET", null, c)).body.result.account,
        null,
      );
      for (const mode of ["light", "dark", "system", "inherit"]) {
        result = await request(
          "/appearance/mode",
          "PUT",
          { mode, userId: users[1].id },
          a,
        );
        assert.equal(result.status, 200);
        assert.equal(result.body.result.mode, mode);
        assert.equal(
          (await request("/appearance", "GET", null, b)).body.result.mode,
          "inherit",
        );
      }
      assert.equal(
        (await request("/appearance/mode", "PUT", { mode: "injected" }, a))
          .status,
        422,
      );
      assert.equal(
        (
          await request(
            "/appearance/accounts/" + account.id,
            "PUT",
            { ...account, revision: 0 },
            admin,
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await request(
            "/appearance/accounts/" + account.id,
            "PUT",
            { ...account, theme: { ...theme, font: "unsafe" } },
            admin,
          )
        ).status,
        422,
      );
      assert.equal(
        (
          await request(
            "/appearance/accounts/" + account.id + "/members",
            "PUT",
            { userIds: [users[0].id, users[0].id] },
            admin,
          )
        ).status,
        422,
      );
      assert.equal(
        (
          await request(
            "/appearance/accounts/" + account.id + "/members",
            "PUT",
            { userIds: [String(users[0].id)] },
            admin,
          )
        ).status,
        200,
      );
      assert.equal(
        (await request("/appearance", "GET", null, b)).body.result.account,
        null,
      );
      assert.equal(
        (await request("/appearance", "GET", null, a)).body.result.account.id,
        account.id,
      );
    } finally {
      if (account) await BrandingAccount.destroy({ where: { id: account.id } });
      for (const user of users) {
        await UserAppearance.destroy({ where: { userId: user.id } });
        await user.destroy();
      }
      await sequelize.close();
    }
  },
);
