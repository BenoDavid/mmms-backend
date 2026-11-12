module.exports = {
  async up(queryInterface) {
    const [organizationRows] = await queryInterface.sequelize.query(
      `SELECT id FROM mmms_master_records WHERE module = 'organization' ORDER BY "createdAt" ASC LIMIT 1`,
    );
    const [factoryRows] = await queryInterface.sequelize.query(
      `SELECT id FROM mmms_master_records WHERE module = 'factories' ORDER BY "createdAt" ASC LIMIT 1`,
    );
    const organizationId = organizationRows[0]?.id;
    const factoryId = factoryRows[0]?.id;
    if (!organizationId || !factoryId) return;

    await queryInterface.sequelize.query(
      `UPDATE mmms_master_records
       SET organization_id = :organizationId,
           data = data || jsonb_build_object('organizationId', :organizationId)
       WHERE module = 'factories' AND organization_id IS NULL`,
      { replacements: { organizationId } },
    );
    await queryInterface.sequelize.query(
      `UPDATE mmms_master_records
       SET organization_id = :organizationId,
           factory_id = :factoryId,
           data = data || jsonb_build_object('organizationId', :organizationId, 'factoryId', :factoryId)
       WHERE module NOT IN ('organization', 'factories')
         AND (organization_id IS NULL OR factory_id IS NULL)`,
      { replacements: { organizationId, factoryId } },
    );

    for (const table of ['mmms_machines', 'mmms_work_orders', 'mmms_preventive_maintenance', 'mmms_breakdowns', 'mmms_spare_parts', 'mmms_technicians']) {
      await queryInterface.sequelize.query(
        `UPDATE ${table} SET organization_id = :organizationId, factory_id = :factoryId WHERE organization_id IS NULL OR factory_id IS NULL`,
        { replacements: { organizationId, factoryId } },
      );
    }
  },

  async down() {
    // Scope backfill is intentionally retained on rollback; clearing access boundaries would be unsafe.
  },
};
