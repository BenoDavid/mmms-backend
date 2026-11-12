module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    const rows = [
      ['organization', 'MaintIQ Operations', 'MNT', { manager: 'Operations Director', email: 'ops@company.local' }],
      ['factories', 'Central Manufacturing Plant', 'FAC-01', { location: 'Amman', manager: 'M. Haddad' }],
      ['departments', 'Engineering Maintenance', 'ENG-MNT', { factory: 'Central Manufacturing Plant', costCenter: 'CC-410' }],
      ['production-lines', 'Assembly Line A', 'LINE-A', { factory: 'Central Manufacturing Plant', floor: 'Floor 1', supervisor: 'Omar Saleh' }],
      ['machine-categories', 'Production equipment', 'PROD', { criticality: 'Critical', description: 'Line-critical machinery' }],
      ['allocations', 'CNC-0871 allocation', 'ALLOC-001', { machine: 'CNC-0871', factory: 'Central Manufacturing Plant', line: 'Assembly Line A', effectiveDate: '2026-10-01' }],
      ['transfers', 'Press-204 transfer', 'TR-001', { machine: 'Press-204', fromSite: 'North Assembly Site', toSite: 'Central Manufacturing Plant', transferDate: '2026-11-05', reason: 'Capacity balancing' }],
      ['inspections', 'CNC-0871 safety inspection', 'INSP-001', { machine: 'CNC-0871', type: 'Safety inspection', inspector: 'Omar Saleh', dueDate: '2026-11-20' }],
      ['vendors', 'Precision Industrial Services', 'VND-001', { category: 'Mechanical', contact: 'Rami N.', phone: '+962 6 000 0000', email: 'service@precision.local' }],
      ['calibration', 'Gauge-44 calibration', 'CAL-2026-114', { instrument: 'Gauge-44', provider: 'Metrology Labs', dueDate: '2027-02-15' }],
      ['notifications', 'Critical breakdown alert', 'RULE-001', { event: 'Breakdown created', audience: 'Maintenance managers', channel: 'Email + In-app' }],
      ['configuration', 'Default work order priority', 'CFG-001', { value: 'Medium', scope: 'All factories', description: 'Applied when no priority is selected' }],
    ].map(([module, name, code, data]) => ({ id: Sequelize.literal('gen_random_uuid()'), module, name, code, status: 'Active', data: JSON.stringify(data), createdAt: now, updatedAt: now }));
    await queryInterface.bulkInsert('mmms_master_records', rows);
  },
  async down(queryInterface, Sequelize) { await queryInterface.bulkDelete('mmms_master_records', { module: { [Sequelize.Op.in]: ['organization', 'factories', 'departments', 'production-lines', 'machine-categories', 'allocations', 'transfers', 'inspections', 'vendors', 'calibration', 'notifications', 'configuration'] } }); },
};
