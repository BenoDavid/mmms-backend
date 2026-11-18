"use strict";
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("mmms_machines", "location_ids", {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: {},
    });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn("mmms_machines", "location_ids");
  },
};
