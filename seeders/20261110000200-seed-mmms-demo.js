'use strict';

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    await queryInterface.bulkInsert('mmms_technicians', [
      { id: 'TECH-001', employee_number: 'EMP-1048', name: 'Omar Haddad', email: 'omar.haddad@example.com', phone: '+962 7 9000 1048', skill_categories: JSON.stringify(['Electrical', 'Sensors']), shift: 'Day', factory: 'Factory A', active: true, current_workload: 2, availability: 'Busy', created_at: now, updated_at: now },
      { id: 'TECH-002', employee_number: 'EMP-1126', name: 'Lina Saleh', email: 'lina.saleh@example.com', phone: '+962 7 9000 1126', skill_categories: JSON.stringify(['Mechanical', 'Preventive maintenance']), shift: 'Day', factory: 'Factory A', active: true, current_workload: 1, availability: 'Available', created_at: now, updated_at: now },
      { id: 'TECH-003', employee_number: 'EMP-1189', name: 'Yousef Nasser', email: 'yousef.nasser@example.com', phone: '+962 7 9000 1189', skill_categories: JSON.stringify(['Cutting', 'Hydraulics']), shift: 'Night', factory: 'Factory A', active: true, current_workload: 0, availability: 'Available', created_at: now, updated_at: now },
      { id: 'TECH-004', employee_number: 'EMP-0977', name: 'Maya Khalil', email: 'maya.khalil@example.com', phone: '+962 7 9000 0977', skill_categories: JSON.stringify(['Electrical', 'PLC']), shift: 'Day', factory: 'Factory B', active: false, current_workload: 0, availability: 'Unavailable', created_at: now, updated_at: now },
    ], { ignoreDuplicates: true });
    await queryInterface.bulkInsert('mmms_machines', [
      { id: 'M-1042', asset_number: 'AST-1042', name: 'Juki DDL-9000C', category: 'Lockstitch', manufacturer: 'Juki', model_number: 'DDL-9000C', serial_number: 'JUKI-1042', factory_location: 'Factory A', production_line: 'Sewing · Line 04', installation_date: '2024-01-15', status: 'Running', uptime_percent: 98, created_at: now, updated_at: now },
      { id: 'M-0871', asset_number: 'AST-0871', name: 'Brother BAS-326H', category: 'Buttonhole', manufacturer: 'Brother', model_number: 'BAS-326H', serial_number: 'BRO-0871', factory_location: 'Factory A', production_line: 'Sewing · Line 02', installation_date: '2023-06-12', status: 'Under Maintenance', uptime_percent: 88, created_at: now, updated_at: now },
      { id: 'M-1138', asset_number: 'AST-1138', name: 'Gerber Paragon HX', category: 'Cutting', manufacturer: 'Gerber', model_number: 'Paragon HX', serial_number: 'GER-1138', factory_location: 'Factory A', production_line: 'Cutting · Bay 01', installation_date: '2022-11-03', status: 'Idle', uptime_percent: 94, created_at: now, updated_at: now },
      { id: 'M-0914', asset_number: 'AST-0914', name: 'Kansai Special FX', category: 'Overlock', manufacturer: 'Kansai', model_number: 'Special FX', serial_number: 'KAN-0914', factory_location: 'Factory A', production_line: 'Sewing · Line 07', installation_date: '2023-03-20', status: 'Breakdown', uptime_percent: 71, created_at: now, updated_at: now },
    ], { ignoreDuplicates: true });

    await queryInterface.bulkInsert('mmms_work_orders', [
      { id: 'WO-24081', machine_id: 'M-0914', issue: 'Thread tension sensor fault', description: 'Investigate intermittent sensor readings.', technician_name: 'Omar Haddad', priority: 'Critical', status: 'In Progress', due_at: new Date(Date.now() + 42 * 60000), created_at: now, updated_at: now },
      { id: 'WO-24079', machine_id: 'M-0871', issue: 'Preventive service · 500h', description: 'Complete scheduled 500-hour service.', technician_name: 'Lina Saleh', priority: 'High', status: 'Waiting Parts', due_at: new Date(Date.now() + 4 * 3600000), created_at: now, updated_at: now },
      { id: 'WO-24076', machine_id: 'M-1042', issue: 'Oil level inspection', description: 'Inspect and document oil level.', technician_name: null, priority: 'Medium', status: 'Open', due_at: new Date(Date.now() + 24 * 3600000), created_at: now, updated_at: now },
    ], { ignoreDuplicates: true });

    await queryInterface.bulkInsert('mmms_preventive_maintenance', [
      { id: 'PM-0184', machine_id: 'M-1042', task: 'Lubrication and needle bar inspection', frequency: 'Every 250h', next_due: new Date(), compliance_percent: 100, owner_name: 'Sewing Engineering', created_at: now, updated_at: now },
      { id: 'PM-0179', machine_id: 'M-0871', task: '500-hour preventive service', frequency: 'Every 500h', next_due: new Date(), compliance_percent: 82, owner_name: 'Lina Saleh', created_at: now, updated_at: now },
      { id: 'PM-0174', machine_id: 'M-1138', task: 'Blade alignment and calibration', frequency: 'Monthly', next_due: new Date(Date.now() + 86400000), compliance_percent: 96, owner_name: 'Cutting Engineering', created_at: now, updated_at: now },
    ], { ignoreDuplicates: true });

    await queryInterface.bulkInsert('mmms_breakdowns', [
      { id: 'BD-0062', machine_id: 'M-0914', category: 'Electrical', started_at: new Date(Date.now() - 162 * 60000), root_cause: 'Thread tension sensor fault', resolution_actions: null, status: 'Investigating', created_at: now, updated_at: now },
      { id: 'BD-0061', machine_id: 'M-0871', category: 'Mechanical', started_at: new Date(Date.now() - 24 * 3600000), ended_at: new Date(Date.now() - 22 * 3600000), root_cause: 'Needle bar wear', resolution_actions: 'Replaced worn needle bar.', status: 'Resolved', created_at: now, updated_at: now },
    ], { ignoreDuplicates: true });

    await queryInterface.bulkInsert('mmms_spare_parts', [
      { id: 'SP-2048', name: 'Thread tension sensor', category: 'Electrical', stock_quantity: 2, reorder_level: 5, supplier: 'SewTech Supplies', unit_cost: 42, created_at: now, updated_at: now },
      { id: 'SP-1182', name: 'Needle bar assembly', category: 'Mechanical', stock_quantity: 8, reorder_level: 4, supplier: 'Classic Parts Hub', unit_cost: 68.5, created_at: now, updated_at: now },
      { id: 'SP-3021', name: 'Timing belt 900mm', category: 'Drive system', stock_quantity: 3, reorder_level: 3, supplier: 'Motion Works', unit_cost: 19.8, created_at: now, updated_at: now },
    ], { ignoreDuplicates: true });
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('mmms_technicians', { id: ['TECH-001', 'TECH-002', 'TECH-003', 'TECH-004'] });
    await queryInterface.bulkDelete('mmms_spare_parts', { id: ['SP-2048', 'SP-1182', 'SP-3021'] });
    await queryInterface.bulkDelete('mmms_breakdowns', { id: ['BD-0062', 'BD-0061'] });
    await queryInterface.bulkDelete('mmms_preventive_maintenance', { id: ['PM-0184', 'PM-0179', 'PM-0174'] });
    await queryInterface.bulkDelete('mmms_work_orders', { id: ['WO-24081', 'WO-24079', 'WO-24076'] });
    await queryInterface.bulkDelete('mmms_machines', { id: ['M-1042', 'M-0871', 'M-1138', 'M-0914'] });
  },
};
