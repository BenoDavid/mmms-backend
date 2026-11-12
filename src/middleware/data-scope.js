const HttpError = require('../errors/http-error');

function values(record, keys) {
  return keys.map((key) => record?.[key]).filter((value) => value !== undefined && value !== null && String(value).trim()).map((value) => String(value).trim().toLowerCase());
}

function permissions(req) { return Array.isArray(req.auth?.permissions) ? req.auth.permissions : []; }
function isGlobal(req) { return req.auth?.development === true || permissions(req).includes('*'); }
function assignments(req, applicationName = 'MMMS') {
  if (isGlobal(req)) return null;
  return (Array.isArray(req.auth?.accessScopes) ? req.auth.accessScopes : []).filter((scope) => {
    if (scope.enabled === false) return false;
    const app = String(scope.applicationName || '').trim().toUpperCase();
    return app === String(applicationName).toUpperCase() || app === '*';
  });
}

function recordScope(record) {
  const raw = record?.toJSON ? record.toJSON() : record || {};
  const data = raw.data && typeof raw.data === 'object' ? raw.data : {};
  const nestedMachine = raw.machine?.toJSON ? raw.machine.toJSON() : raw.machine || {};
  const module = String(raw.module || '').toLowerCase();
  const entity = { ...data, ...raw, ...nestedMachine };
  return {
    organization: values(entity, ['organizationId', 'organizationUnit', 'organization', 'organizationName', ...(module === 'organization' ? ['id', 'code', 'name'] : [])]),
    factory: values(entity, ['factoryId', 'factory', 'factoryName', 'factoryLocation', ...(module === 'factories' ? ['id', 'code', 'name'] : [])]),
  };
}

function requestedContext(req) {
  return {
    organization: String(req.query?.organizationId || '').trim().toLowerCase(),
    factory: String(req.query?.factoryId || '').trim().toLowerCase(),
  };
}

function matchesRequestedContext(record, req) {
  const requested = requestedContext(req);
  const scope = recordScope(record);
  const raw = record?.toJSON ? record.toJSON() : record || {};
  const module = String(raw.module || '').toLowerCase();
  if (requested.organization && !scope.organization.includes(requested.organization)) return false;
  // Organization records are parents of factories and remain visible while a factory is selected.
  if (requested.factory && module !== 'organization' && !scope.factory.includes(requested.factory)) return false;
  return true;
}

function matchesScope(record, scopeList) {
  if (scopeList === null) return true;
  if (!scopeList.length) return false;
  const scope = recordScope(record);
  return scopeList.some((assignment) => {
    const organizations = values(assignment, ['organizationId', 'organizationName']);
    const factories = values(assignment, ['factoryId', 'factoryName']);
    const organizationMatch = !organizations.length || organizations.some((item) => scope.organization.includes(item));
    const factoryMatch = !factories.length || factories.some((item) => scope.factory.includes(item));
    return organizationMatch && factoryMatch;
  });
}

function filterRecords(req, records, applicationName = 'MMMS') {
  const scopeList = assignments(req, applicationName);
  return records.filter((record) => matchesRequestedContext(record, req) && matchesScope(record, scopeList));
}

function assertRecordAccess(req, record, applicationName = 'MMMS') {
  if (!matchesRequestedContext(record, req) || !matchesScope(record, assignments(req, applicationName))) throw new HttpError(403, 'The selected record is outside your assigned organization or factory scope');
}

function assertPayloadAccess(req, payload, applicationName = 'MMMS') {
  if (!matchesScope(payload, assignments(req, applicationName))) throw new HttpError(403, 'A valid organization or factory scope is required for this operation');
  const requested = requestedContext(req);
  const scope = recordScope(payload);
  if ((requested.organization && !scope.organization.includes(requested.organization)) || (requested.factory && !scope.factory.includes(requested.factory))) {
    throw new HttpError(403, 'The selected organization or factory does not match this operation');
  }
}

function requireMmmsPermission(permission) {
  return (req, res, next) => {
    const granted = permissions(req);
    if (isGlobal(req) || granted.includes(permission) || granted.includes('MMMS-APP')) return next();
    return next(new HttpError(403, 'MMMS permission required'));
  };
}

module.exports = { assignments, filterRecords, assertRecordAccess, assertPayloadAccess, requireMmmsPermission, recordScope };
