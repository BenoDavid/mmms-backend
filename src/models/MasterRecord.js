module.exports = (sequelize, DataTypes) => sequelize.define('MasterRecord', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    module: { type: DataTypes.STRING(80), allowNull: false }, name: { type: DataTypes.STRING(180), allowNull: false }, code: { type: DataTypes.STRING(100) },
    organizationId: { type: DataTypes.STRING(120), field: 'organization_id' }, factoryId: { type: DataTypes.STRING(120), field: 'factory_id' },
  status: { type: DataTypes.STRING(60), allowNull: false, defaultValue: 'Active' }, data: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
}, { tableName: 'mmms_master_records', timestamps: true });
