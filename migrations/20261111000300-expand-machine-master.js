"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = [
      ["machine_code", { type: Sequelize.STRING(80), allowNull: true, unique: true }],
      ["description", { type: Sequelize.TEXT }],
      ["subcategory", { type: Sequelize.STRING(120) }],
      ["brand", { type: Sequelize.STRING(120) }],
      ["purchase_date", { type: Sequelize.DATEONLY }],
      ["purchase_cost", { type: Sequelize.DECIMAL(12, 2) }],
      ["warranty_start_date", { type: Sequelize.DATEONLY }],
      ["warranty_expiry_date", { type: Sequelize.DATEONLY }],
      ["criticality", { type: Sequelize.STRING(30), defaultValue: "Medium" }],
      ["lifecycle_condition", { type: Sequelize.STRING(40), defaultValue: "Operational" }],
      ["qr_reference", { type: Sequelize.STRING(120), allowNull: true, unique: true }],
      ["archived_at", { type: Sequelize.DATE }],
    ];
    for (const [name, definition] of columns) await queryInterface.addColumn("mmms_machines", name, definition);

    await queryInterface.sequelize.query(
      "UPDATE mmms_machines SET machine_code = id WHERE machine_code IS NULL",
    );
    await queryInterface.sequelize.query(
      "UPDATE mmms_machines SET qr_reference = 'MMMS-' || id WHERE qr_reference IS NULL",
    );
    await queryInterface.changeColumn("mmms_machines", "machine_code", { type: Sequelize.STRING(80), allowNull: false, unique: true });
    await queryInterface.changeColumn("mmms_machines", "qr_reference", { type: Sequelize.STRING(120), allowNull: false, unique: true });

    await queryInterface.createTable("mmms_machine_history", {
      id: { type: Sequelize.STRING(40), primaryKey: true },
      machine_id: { type: Sequelize.STRING(40), allowNull: false, references: { model: "mmms_machines", key: "id" }, onDelete: "CASCADE" },
      event_type: { type: Sequelize.STRING(50), allowNull: false },
      summary: { type: Sequelize.STRING(255), allowNull: false },
      details: { type: Sequelize.JSONB, defaultValue: {} },
      actor_id: Sequelize.STRING(120),
      occurred_at: { type: Sequelize.DATE, allowNull: false },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("mmms_machine_history");
    for (const column of ["archived_at", "qr_reference", "lifecycle_condition", "criticality", "warranty_expiry_date", "warranty_start_date", "purchase_cost", "purchase_date", "brand", "subcategory", "description", "machine_code"]) {
      await queryInterface.removeColumn("mmms_machines", column);
    }
  },
};
