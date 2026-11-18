"use strict";
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const table of [
        "mmms_work_orders",
        "mmms_preventive_maintenance",
        "mmms_breakdowns",
        "mmms_spare_parts",
        "mmms_technicians",
      ]) {
        await queryInterface.addColumn(
          table,
          "details",
          { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
          { transaction },
        );
      }
      await queryInterface.addColumn(
        "mmms_spare_parts",
        "reserved_quantity",
        { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        { transaction },
      );
      await queryInterface.addColumn(
        "mmms_machines",
        "operating_hours",
        { type: Sequelize.DECIMAL(14, 2), defaultValue: 0 },
        { transaction },
      );
      await queryInterface.addColumn(
        "mmms_machines",
        "production_quantity",
        { type: Sequelize.DECIMAL(14, 2), defaultValue: 0 },
        { transaction },
      );
      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX mmms_operation_idempotency ON mmms_master_records (module, code) WHERE module IN ('stock-transactions', 'pm-occurrences', 'offline-submissions')`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        "ALTER TABLE mmms_spare_parts ADD CONSTRAINT mmms_stock_nonnegative CHECK (stock_quantity >= 0 AND reserved_quantity >= 0 AND reserved_quantity <= stock_quantity)",
        { transaction },
      );
    });
  },
  async down() {
    throw new Error(
      "Operation history is retained; restore an approved backup to roll back",
    );
  },
};
