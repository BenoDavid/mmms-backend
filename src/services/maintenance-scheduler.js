const { PreventiveMaintenance } = require("../models");
const { generatePlan } = require("./maintenance-scheduling");

function startMaintenanceScheduler() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const plans = await PreventiveMaintenance.findAll();
      for (const plan of plans) {
        if (plan.details.active === false) continue;
        try {
          await generatePlan(
            {
              auth: { sub: "maintenance-scheduler", permissions: ["*"] },
              query: {},
            },
            plan.id,
          );
        } catch (error) {
          console.error(
            `Maintenance plan ${plan.id} could not be generated:`,
            error.message,
          );
        }
      }
      await require("./maintenance-alerts").refreshAlerts();
      await require("./maintenance-alerts").deliverNotifications();
    } catch (error) {
      console.error("Maintenance scheduling failed:", error.message);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, 60000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
module.exports = { startMaintenanceScheduler };
