# MMMS data access scopes

MMMS authorization has two independent layers:

1. The AuthGuard role grants the application/page permission, such as `MMMS-MACHINES`.
2. A Root v2 user scope limits the records returned by MMMS to an organization or factory.

An organization assignment can see records carrying the matching `organizationId` or organization name. A factory-only assignment can see only records carrying the matching `factoryId` or factory name. Multiple assignments are combined with OR semantics, so a user can work across selected factories.

## Administration

Run the AuthGuard migration and seed after deploying the new code:

```text
cd authguardv2-node
npm run db:migrate
npm run db:seed:auth
```

In Root v2, open Users, edit a user, choose **Data scope**, and add an assignment. `MMMS` is the application name for this service. Use a factory-only assignment when the user must not inherit the rest of the organization.

The API is also available to Root v2 administrators with `access-scopes:manage`:

```text
GET /v3/api/auth/users/:id/scopes
PUT /v3/api/auth/users/:id/scopes
```

The PUT body is `{ "scopes": [{ "applicationName": "MMMS", "organizationId": "ORG-01", "factoryId": "FACTORY-02" }] }`.

Users must sign in again after a scope change so the refreshed JWT contains the latest assignments. MMMS also verifies the application permissions in the same token. A role with the enabled wildcard permission remains a global administrator and bypasses data filtering.

## Data requirements

MMMS records should populate `organizationId` and/or `factoryId`. The same fields are present on machines, technicians, work orders, preventive maintenance, breakdowns, spare parts, and master records. Related records are evaluated through their machine relationship where available.

Records without an organization or factory boundary are intentionally hidden from scoped users. This fail-closed behavior prevents a newly created unclassified record from leaking across tenants.
