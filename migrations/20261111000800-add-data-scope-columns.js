module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = ['mmms_machines', 'mmms_work_orders', 'mmms_preventive_maintenance', 'mmms_breakdowns', 'mmms_spare_parts', 'mmms_technicians', 'mmms_master_records'];
    for (const table of tables) {
      await queryInterface.addColumn(table, 'organization_id', { type: Sequelize.STRING(120), allowNull: true });
      await queryInterface.addColumn(table, 'factory_id', { type: Sequelize.STRING(120), allowNull: true });
    }
  },
  async down(queryInterface) {
    const tables = ['mmms_machines', 'mmms_work_orders', 'mmms_preventive_maintenance', 'mmms_breakdowns', 'mmms_spare_parts', 'mmms_technicians', 'mmms_master_records'];
    for (const table of tables) { await queryInterface.removeColumn(table, 'organization_id'); await queryInterface.removeColumn(table, 'factory_id'); }
  },
};
