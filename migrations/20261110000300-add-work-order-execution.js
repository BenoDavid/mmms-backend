'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('mmms_work_orders', 'technician_id', { type: Sequelize.STRING(40) });
    await queryInterface.addColumn('mmms_work_orders', 'assigned_by', { type: Sequelize.STRING(160) });
    await queryInterface.addColumn('mmms_work_orders', 'assigned_at', { type: Sequelize.DATE });
    await queryInterface.addColumn('mmms_work_orders', 'started_at', { type: Sequelize.DATE });
    await queryInterface.addColumn('mmms_work_orders', 'paused_at', { type: Sequelize.DATE });
    await queryInterface.addColumn('mmms_work_orders', 'repair_notes', { type: Sequelize.TEXT });
    await queryInterface.addColumn('mmms_work_orders', 'diagnosis', { type: Sequelize.TEXT });
    await queryInterface.addColumn('mmms_work_orders', 'completion_notes', { type: Sequelize.TEXT });
    await queryInterface.addColumn('mmms_work_orders', 'verification_notes', { type: Sequelize.TEXT });
    await queryInterface.addColumn('mmms_work_orders', 'rejection_reason', { type: Sequelize.TEXT });
    await queryInterface.addColumn('mmms_work_orders', 'verified_by', { type: Sequelize.STRING(160) });
    await queryInterface.addColumn('mmms_work_orders', 'verified_at', { type: Sequelize.DATE });
    await queryInterface.addColumn('mmms_work_orders', 'labor_minutes', { type: Sequelize.INTEGER });
    await queryInterface.addColumn('mmms_work_orders', 'parts_cost', { type: Sequelize.DECIMAL(12, 2) });
    await queryInterface.addColumn('mmms_work_orders', 'contractor_cost', { type: Sequelize.DECIMAL(12, 2) });
  },

  async down(queryInterface) {
    for (const column of ['contractor_cost', 'parts_cost', 'labor_minutes', 'verified_at', 'verified_by', 'rejection_reason', 'verification_notes', 'completion_notes', 'diagnosis', 'repair_notes', 'paused_at', 'started_at', 'assigned_at', 'assigned_by', 'technician_id']) {
      await queryInterface.removeColumn('mmms_work_orders', column);
    }
  },
};
