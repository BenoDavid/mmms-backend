module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = {
      machine_type: Sequelize.STRING(120), manufacturing_year: Sequelize.INTEGER, purchase_price: Sequelize.DECIMAL(12, 2), supplier: Sequelize.STRING(180), commissioning_date: Sequelize.DATEONLY, image_url: Sequelize.STRING(500), technical_specifications: Sequelize.JSONB, power_consumption: Sequelize.STRING(80), machine_capacity: Sequelize.STRING(120), organization_unit: Sequelize.STRING(160), factory: Sequelize.STRING(160), department: Sequelize.STRING(160), floor: Sequelize.STRING(120), current_location: Sequelize.STRING(180), responsible_person: Sequelize.STRING(160), documents: { type: Sequelize.JSONB, defaultValue: [] }, lifecycle_status: { type: Sequelize.STRING(60), allowNull: false, defaultValue: 'Active' },
    };
    for (const [name, definition] of Object.entries(columns)) await queryInterface.addColumn('mmms_machines', name, typeof definition === 'object' && definition.type ? definition : { type: definition });
  },
  async down(queryInterface) { for (const name of ['machine_type', 'manufacturing_year', 'purchase_price', 'supplier', 'commissioning_date', 'image_url', 'technical_specifications', 'power_consumption', 'machine_capacity', 'organization_unit', 'factory', 'department', 'floor', 'current_location', 'responsible_person', 'documents', 'lifecycle_status']) await queryInterface.removeColumn('mmms_machines', name); },
};
