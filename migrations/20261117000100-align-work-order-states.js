"use strict";

module.exports = {
  async up(queryInterface) {
    for (const status of [
      "Draft",
      "Submitted",
      "Approved",
      "On Hold",
      "Pending Spare Parts",
      "Verified",
      "Cancelled",
    ]) {
      // Initial installations use varchar; some installations created an enum via sync.
      await queryInterface.sequelize.query(`DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_mmms_work_orders_status') THEN
          ALTER TYPE "enum_mmms_work_orders_status" ADD VALUE IF NOT EXISTS '${status}';
        END IF;
      END $$;`);
    }
    await queryInterface.sequelize.query(
      `ALTER TABLE mmms_work_orders ALTER COLUMN status SET DEFAULT 'Draft'`,
    );
  },
  async down() {
    throw new Error(
      "Work-order state additions preserve history and cannot be removed safely; restore a backup to roll back",
    );
  },
};
