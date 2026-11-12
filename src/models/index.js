const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const models = {
  Machine: require('./Machine')(sequelize, DataTypes),
  MachineHistory: require('./MachineHistory')(sequelize, DataTypes),
  WorkOrder: require('./WorkOrder')(sequelize, DataTypes),
  PreventiveMaintenance: require('./PreventiveMaintenance')(sequelize, DataTypes),
  Breakdown: require('./Breakdown')(sequelize, DataTypes),
  SparePart: require('./SparePart')(sequelize, DataTypes),
  Technician: require('./Technician')(sequelize, DataTypes),
  MasterRecord: require('./MasterRecord')(sequelize, DataTypes),
};

models.WorkOrder.belongsTo(models.Machine, { foreignKey: 'machineId', as: 'machine' });
models.WorkOrder.belongsTo(models.Technician, { foreignKey: 'technicianId', as: 'technician' });
models.Machine.hasMany(models.WorkOrder, { foreignKey: 'machineId', as: 'workOrders' });
models.Machine.hasMany(models.MachineHistory, { foreignKey: 'machineId', as: 'history' });
models.MachineHistory.belongsTo(models.Machine, { foreignKey: 'machineId', as: 'machine' });
models.Technician.hasMany(models.WorkOrder, { foreignKey: 'technicianId', as: 'workOrders' });
models.PreventiveMaintenance.belongsTo(models.Machine, { foreignKey: 'machineId', as: 'machine' });
models.Breakdown.belongsTo(models.Machine, { foreignKey: 'machineId', as: 'machine' });

module.exports = { sequelize, ...models };
