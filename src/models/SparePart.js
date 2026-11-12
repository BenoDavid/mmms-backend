module.exports = (sequelize, DataTypes) => sequelize.define('SparePart', {
  id: { type: DataTypes.STRING(40), primaryKey: true },
  organizationId: { type: DataTypes.STRING(120), field: 'organization_id' },
  factoryId: { type: DataTypes.STRING(120), field: 'factory_id' },
  name: { type: DataTypes.STRING(255), allowNull: false },
  category: { type: DataTypes.STRING(120), allowNull: false },
  stockQuantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'stock_quantity' },
  reorderLevel: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'reorder_level' },
  supplier: { type: DataTypes.STRING(255) },
  unitCost: { type: DataTypes.DECIMAL(12, 2), field: 'unit_cost' },
}, { tableName: 'mmms_spare_parts', underscored: true });
