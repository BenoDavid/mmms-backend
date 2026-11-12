"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("mmms_machines", {
      id: { type: Sequelize.STRING(40), primaryKey: true },
      asset_number: {
        type: Sequelize.STRING(80),
        allowNull: false,
        unique: true,
      },
      name: { type: Sequelize.STRING(255), allowNull: false },
      category: { type: Sequelize.STRING(120), allowNull: false },
      manufacturer: Sequelize.STRING(120),
      model_number: Sequelize.STRING(120),
      serial_number: Sequelize.STRING(120),
      factory_location: Sequelize.STRING(160),
      production_line: Sequelize.STRING(120),
      installation_date: Sequelize.DATEONLY,
      status: { type: Sequelize.STRING(40), defaultValue: "Idle" },
      uptime_percent: { type: Sequelize.DECIMAL(5, 2), defaultValue: 0 },
      created_at: Sequelize.DATE,
      updated_at: Sequelize.DATE,
    });
    await queryInterface.createTable("mmms_work_orders", {
      id: { type: Sequelize.STRING(40), primaryKey: true },
      machine_id: {
        type: Sequelize.STRING(40),
        allowNull: false,
        references: { model: "mmms_machines", key: "id" },
        onDelete: "CASCADE",
      },
      issue: { type: Sequelize.STRING(255), allowNull: false },
      description: Sequelize.TEXT,
      technician_name: Sequelize.STRING(160),
      priority: { type: Sequelize.STRING(20), defaultValue: "Medium" },
      status: { type: Sequelize.STRING(30), defaultValue: "Open" },
      due_at: Sequelize.DATE,
      completed_at: Sequelize.DATE,
      created_at: Sequelize.DATE,
      updated_at: Sequelize.DATE,
    });
    await queryInterface.createTable("mmms_preventive_maintenance", {
      id: { type: Sequelize.STRING(40), primaryKey: true },
      machine_id: {
        type: Sequelize.STRING(40),
        allowNull: false,
        references: { model: "mmms_machines", key: "id" },
        onDelete: "CASCADE",
      },
      task: { type: Sequelize.STRING(255), allowNull: false },
      frequency: { type: Sequelize.STRING(120), allowNull: false },
      next_due: { type: Sequelize.DATE, allowNull: false },
      compliance_percent: { type: Sequelize.DECIMAL(5, 2), defaultValue: 0 },
      owner_name: Sequelize.STRING(160),
      created_at: Sequelize.DATE,
      updated_at: Sequelize.DATE,
    });
    await queryInterface.createTable("mmms_breakdowns", {
      id: { type: Sequelize.STRING(40), primaryKey: true },
      machine_id: {
        type: Sequelize.STRING(40),
        allowNull: false,
        references: { model: "mmms_machines", key: "id" },
        onDelete: "CASCADE",
      },
      category: { type: Sequelize.STRING(120), allowNull: false },
      started_at: { type: Sequelize.DATE, allowNull: false },
      ended_at: Sequelize.DATE,
      root_cause: Sequelize.TEXT,
      resolution_actions: Sequelize.TEXT,
      status: { type: Sequelize.STRING(30), defaultValue: "Open" },
      created_at: Sequelize.DATE,
      updated_at: Sequelize.DATE,
    });
    await queryInterface.createTable("mmms_spare_parts", {
      id: { type: Sequelize.STRING(40), primaryKey: true },
      name: { type: Sequelize.STRING(255), allowNull: false },
      category: { type: Sequelize.STRING(120), allowNull: false },
      stock_quantity: { type: Sequelize.INTEGER, defaultValue: 0 },
      reorder_level: { type: Sequelize.INTEGER, defaultValue: 0 },
      supplier: Sequelize.STRING(255),
      unit_cost: Sequelize.DECIMAL(12, 2),
      created_at: Sequelize.DATE,
      updated_at: Sequelize.DATE,
    });
  },
  async down(queryInterface) {
    for (const table of [
      "mmms_spare_parts",
      "mmms_breakdowns",
      "mmms_preventive_maintenance",
      "mmms_work_orders",
      "mmms_machines",
    ])
      await queryInterface.dropTable(table);
  },
};
