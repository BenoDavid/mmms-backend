// Repeatable list fixtures for browser pagination checks. This never targets an application DB.
if (process.env.MMMS_DB_NAME !== 'mmms_workflow_test' || process.env.DB_HOST !== '127.0.0.1' || process.env.DB_PORT !== '55432') throw new Error('Browser fixtures require the isolated MMMS workflow database');
const { randomUUID } = require('node:crypto');
const { sequelize, MasterRecord, Machine, MachineHistory, WorkOrder, Technician } = require('../src/models');
async function main() {
  await sequelize.transaction(async (transaction) => {
    let company = await MasterRecord.findOne({ where: { module: 'organization', code: 'MMMS-AUDIT' }, transaction });
    if (!company) { const id = randomUUID(); company = await MasterRecord.create({ id, module: 'organization', code: 'MMMS-AUDIT', name: 'MMMS Audit Company', organizationId: id, status: 'Active', data: { unitType: 'Company' } }, { transaction }); }
    let factory = await MasterRecord.findOne({ where: { module: 'factories', code: 'MMMS-AUDIT-FACTORY', organizationId: company.id }, transaction });
    if (!factory) { const id = randomUUID(); factory = await MasterRecord.create({ id, module: 'factories', code: 'MMMS-AUDIT-FACTORY', name: 'MMMS Audit Factory', organizationId: company.id, factoryId: id, status: 'Active', data: { unitType: 'Factory', parentId: company.id } }, { transaction }); }
    const scope = { organizationId: company.id, factoryId: factory.id };
    for (let i = 1; i <= 31; i++) {
      const code = String(i).padStart(3, '0');
      const [machine, created] = await Machine.findOrCreate({ where: { assetNumber: 'MMMS-AUDIT-' + code }, defaults: { id: randomUUID(), ...scope, machineCode: 'AUDIT-' + code, qrReference: 'MMMS-' + randomUUID(), name: 'Audit Sewing Machine ' + code, category: 'Sewing', factory: factory.name, status: 'Idle', lifecycleStatus: 'Active' }, transaction });
      if (created) await MachineHistory.create({ id: randomUUID(), machineId: machine.id, eventType: 'registered', summary: 'Isolated browser audit fixture', actorId: 'test-fixture', occurredAt: new Date() }, { transaction });
      await MasterRecord.findOrCreate({ where: { module: 'departments', organizationId: company.id, code: 'AUDIT-DEPT-' + code }, defaults: { id: randomUUID(), ...scope, name: 'Audit Department ' + code, status: 'Active', data: { unitType: 'Department', parentId: factory.id, manager: 'Audit manager' } }, transaction });
      await WorkOrder.findOrCreate({ where: { machineId: machine.id, issue: 'Audit planning task ' + code }, defaults: { id: randomUUID(), ...scope, status: 'Draft', details: { type: 'General Maintenance', requestedBy: 'MMMS-TEST' } }, transaction });
    }
    await Technician.findOrCreate({ where: { employeeNumber: 'MMMS-AUDIT-MECH' }, defaults: { id: randomUUID(), ...scope, name: 'Audit Mechanic', active: true, skillCategories: ['Mechanical'], factory: factory.name, details: { userCode: 'MMMS-TEST' } }, transaction });
    console.log('Browser audit fixtures ready: MMMS Audit Company / MMMS Audit Factory (31 machines, departments and draft tasks).');
  });
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => sequelize.close());
