module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    "PreventiveMaintenance",
    {
      id: { type: DataTypes.STRING(40), primaryKey: true },
      machineId: {
        type: DataTypes.STRING(40),
        allowNull: false,
        field: "machine_id",
      },
      organizationId: { type: DataTypes.STRING(120), field: "organization_id" },
      factoryId: { type: DataTypes.STRING(120), field: "factory_id" },
      task: { type: DataTypes.STRING(255), allowNull: false },
      frequency: { type: DataTypes.STRING(120), allowNull: false },
      nextDue: { type: DataTypes.DATE, allowNull: false, field: "next_due" },
      compliancePercent: {
        type: DataTypes.DECIMAL(5, 2),
        defaultValue: 0,
        field: "compliance_percent",
      },
      ownerName: { type: DataTypes.STRING(160), field: "owner_name" },
    },
    { tableName: "mmms_preventive_maintenance", underscored: true },
  );
