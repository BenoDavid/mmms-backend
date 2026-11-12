# Shared vendor catalog

Vendor master data is owned by AuthGuard v2 so Root v2 administrators can manage one catalog for all authorized applications.

## API

- `GET /v3/api/auth/vendors` — list vendors. Supports `?search=`.
- `POST /v3/api/auth/vendors` — create a vendor. Requires `vendors:manage`.
- `PUT /v3/api/auth/vendors/:id` — update a vendor. Requires `vendors:manage`.
- `DELETE /v3/api/auth/vendors/:id` — remove a vendor. Requires `vendors:manage`.

MMMS reads and writes this endpoint through its typed facade. The legacy MMMS `master-data/vendors` endpoint returns `410 Gone` so a second vendor catalog cannot be created accidentally.

## Administration

Root v2 administrators use `/adminv2/vendors`. The navigation item is protected by `vendors:manage`; read-only integrations use `vendors:read` or their application permission such as `MMMS-VENDORS`.

Organization and factory identifiers are stored on each vendor. AuthGuard access scopes filter the list and protect create, update, and delete operations, so users only see and manage vendors inside their assigned boundaries.
