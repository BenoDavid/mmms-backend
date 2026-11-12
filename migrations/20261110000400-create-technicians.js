'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('mmms_technicians', {
      id: { type: Sequelize.STRING(40), primaryKey: true, allowNull: false },
      employee_number: { type: Sequelize.STRING(40), allowNull: false, unique: true },
      name: { type: Sequelize.STRING(160), allowNull: false },
      email: { type: Sequelize.STRING(160) },
      phone: { type: Sequelize.STRING(60) },
      skill_categories: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      shift: { type: Sequelize.STRING(80), allowNull: false, defaultValue: 'Day' },
      factory: { type: Sequelize.STRING(120), allowNull: false, defaultValue: 'Factory A' },
      active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      current_workload: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      availability: { type: Sequelize.ENUM('Available', 'Busy', 'Unavailable'), allowNull: false, defaultValue: 'Available' },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('mmms_technicians');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_mmms_technicians_availability";');
  },
};
