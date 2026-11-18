# MMMS backend instructions

Read ../AGENTS.md and ../reqs/MMMS-NEW.MD. This service owns maintenance rules and its own database; AuthGuard owns identity and shared catalogs, storage-service owns files.

Keep resource controllers and models explicit. Put independently testable rules in small services next to the domain code. Reuse existing Express/Sequelize patterns; avoid generic workflow engines or unnecessary layers.

All authenticated reads and writes, including history, batch, filters and exports, must enforce permission and organization/factory scope. Derive related record scope from a validated machine rather than trusting client labels. Whitelist writable fields; actor identities and audit timestamps come from authentication and the server clock.

Use transactions and consistent lock ordering for state changes, stock consumption and transfers. Preserve completed records and append history in the same transaction. Do not allow generic CRUD routes to bypass a domain workflow.

Use additive migrations and explain rollback limitations. Do not reset or seed a production database. Run npm test, check changed JavaScript syntax, and document actual integration results. See ../docs/MMMS-REQUIREMENTS-COVERAGE.md for missing acceptance work.
