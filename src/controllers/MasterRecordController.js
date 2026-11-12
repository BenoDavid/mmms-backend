const { MasterRecord } = require('../models');
const { filterRecords, assertRecordAccess, assertPayloadAccess } = require('../middleware/data-scope');
class MasterRecordController {
    rejectSharedVendors(req, res) { if (req.params.module === 'vendors') { res.status(410).json({ message: 'Vendors are managed by AuthGuard v2 shared catalog' }); return true; } return false; }
    async getAll(req, res) { if (this.rejectSharedVendors(req, res)) return; const rows = await MasterRecord.findAll({ where: { module: req.params.module }, order: [['createdAt', 'DESC']] }); res.json({ result: filterRecords(req, rows).map((row) => this.present(row)) }); }
    async create(req, res) { if (this.rejectSharedVendors(req, res)) return; const body = req.body || {}; assertPayloadAccess(req, body); const row = await MasterRecord.create({ module: req.params.module, organizationId: body.organizationId, factoryId: body.factoryId, name: body.name || body.machine || body.instrument || 'Untitled', code: body.code || null, status: body.status || 'Active', data: body }); res.status(201).json({ result: this.present(row) }); }
    async update(req, res) { if (this.rejectSharedVendors(req, res)) return; const row = await MasterRecord.findOne({ where: { id: req.params.id, module: req.params.module } }); if (!row) return res.status(404).json({ message: 'Master record not found' }); assertRecordAccess(req, row); const body = req.body || {}; assertPayloadAccess(req, { ...row.toJSON(), ...body, ...body.data }); await row.update({ organizationId: body.organizationId ?? row.organizationId, factoryId: body.factoryId ?? row.factoryId, name: body.name || body.machine || body.instrument || row.name, code: body.code ?? row.code, status: body.status || row.status, data: body }); return res.json({ result: this.present(row) }); }
    async delete(req, res) { if (this.rejectSharedVendors(req, res)) return; const row = await MasterRecord.findOne({ where: { id: req.params.id, module: req.params.module } }); if (!row) return res.status(404).json({ message: 'Master record not found' }); assertRecordAccess(req, row); await row.destroy(); return res.status(204).send(); }
    present(row) {
        // Canonical database fields must win over draft fields stored inside data.
        // New forms use a temporary id of "0"; returning it here breaks scope selection.
        return {
            ...row.data,
            id: row.id,
            module: row.module,
            name: row.name,
            code: row.code,
            organizationId: row.organizationId,
            factoryId: row.factoryId,
            status: row.status,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        };
    }
}
module.exports = MasterRecordController;
