# MMMS Backend

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

The next backend slice should add update/status transitions, role/permission checks, audit events, pagination, validation, and seeded development fixtures before enabling live MMMS data in the frontend.
# mmms-backend
