# MMMS Backend

Authoritative scope: [MMMS-NEW.MD](../reqs/MMMS-NEW.MD). See [architecture](../docs/ARCHITECTURE.md) and [coverage and remaining acceptance work](../docs/MMMS-REQUIREMENTS-COVERAGE.md).

New developer setup and deployment instructions are available in [`docs/MMMS-GETTING-STARTED.md`](../docs/MMMS-GETTING-STARTED.md) and [`docs/MMMS-DEPLOYMENT.md`](../docs/MMMS-DEPLOYMENT.md).

Separate API service for the Smart Machine Maintenance Management System. It follows the AuthGuard v2 service conventions while keeping maintenance data in its own database and schema.

The HTTP layout follows the WMS backend pattern: reusable base CRUD controller/router classes, one thin controller/router per resource, and domain-specific overrides only where needed.

## Start locally

1. Create PostgreSQL database `mmms`.
2. Copy `.env.example` to `.env` and align the database values.
3. Install dependencies with `npm install`.
4. Run `npm run db:create` to create the separate `mmms` database.
5. Run `npm run db:migrate`.
6. Start the API with `npm run dev`.

The API listens on `http://localhost:7010`. `GET /health` is public. All domain routes under `/v1` require an AuthGuard-compatible bearer token. Development tokens in the form `development:<userId>:<sessionVersion>:<issuedAt>` are accepted when `NODE_ENV=development`.

When `mmms-backend/.env` is absent, the service reads connection credentials from the sibling `authguardv2-node/.env` and forces `DB_NAME=mmms` (or `MMMS_DB_NAME` when explicitly provided). This shares credentials but never shares the AuthGuard database or tables.

## Resources

- `GET/POST /v1/machines`
- `GET/PATCH/DELETE /v1/machines/:id`
- `PATCH /v1/machines/:id/status`

Machine listing accepts `search`, `status`, and `category` query parameters. Machine writes validate required asset identity fields and constrain uptime to 0–100 percent.

- `GET/POST /v1/work-orders`
- `PATCH /v1/work-orders/:id/workflow` for assignment, repair execution, verification, and closure transitions
- `GET/POST /v1/preventive-maintenance`
- `GET/POST /v1/breakdowns`
- `GET/POST /v1/spare-parts`
- `GET /v1/dashboard`
- `GET /v1/reports/maintenance`

Live data is already enabled. Run all migrations before starting the updated UI. The November 17 work-order migration adds the required statuses without rewriting historical records. Workflow transitions append machine history in the same transaction. Use Verified before Closed; completion requires diagnosis, repair notes and completion notes. Hold, cancellation and rejected verification require a reason. Cancel work orders instead of deleting them. Bulk work-order mutation endpoints return 405 to prevent bypassing these rules.

Run `npm test` for domain-rule and scope regression tests. Database and browser acceptance are separate checks; see the coverage checklist before treating the application as functionally complete.

## Workflow implementation and verification

Maintenance workflows use explicit controllers and transactional rule services. Use the validated hierarchy, movement workflow, inspection/calibration completion, inventory transaction, expense and configuration endpoints; finalized records retain their evidence. The old generic CRUD editor is no longer the frontend workflow implementation.

Run `npm run test:integration` using the guarded disposable setup in [MMMS-TESTING.md](../docs/MMMS-TESTING.md). See [customization](../docs/MMMS-CUSTOMIZATION.md) for categories, recurrence rules, required fields, approval restrictions, notification events and feature ownership. Production databases and IAM role grants require your deployment configuration.
