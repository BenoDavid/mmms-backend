module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    "MachineHistory",
    {
      id: { type: DataTypes.STRING(40), primaryKey: true },
      machineId: { type: DataTypes.STRING(40), allowNull: false, field: "machine_id" },
      eventType: { type: DataTypes.STRING(50), allowNull: false, field: "event_type" },
      summary: { type: DataTypes.STRING(255), allowNull: false },
      details: { type: DataTypes.JSONB, defaultValue: {} },
      actorId: { type: DataTypes.STRING(120), field: "actor_id" },
      occurredAt: { type: DataTypes.DATE, allowNull: false, field: "occurred_at" },
    },
    { tableName: "mmms_machine_history", underscored: true, timestamps: false },
  );
