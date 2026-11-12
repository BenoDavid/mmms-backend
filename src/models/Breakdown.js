module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    "Breakdown",
    {
      id: { type: DataTypes.STRING(40), primaryKey: true },
      machineId: {
        type: DataTypes.STRING(40),
        allowNull: false,
        field: "machine_id",
      },
      organizationId: { type: DataTypes.STRING(120), field: "organization_id" },
      factoryId: { type: DataTypes.STRING(120), field: "factory_id" },
      category: { type: DataTypes.STRING(120), allowNull: false },
      startedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: "started_at",
      },
      endedAt: { type: DataTypes.DATE, field: "ended_at" },
      rootCause: { type: DataTypes.TEXT, field: "root_cause" },
      resolutionActions: { type: DataTypes.TEXT, field: "resolution_actions" },
      status: {
        type: DataTypes.ENUM("Open", "Investigating", "Resolved"),
        defaultValue: "Open",
      },
    },
    { tableName: "mmms_breakdowns", underscored: true },
  );
