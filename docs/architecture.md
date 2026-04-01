# Architecture

## Goals

- Frontend and backend stay separated.
- The repository remains a single monorepo.
- Both apps move to TypeScript.
- Database setup is explicit through migration and seed scripts.
- Plugins are constrained toward manifest and configuration driven behavior.

## Module Layout

- `apps/web/src/app`: application entry and shell.
- `apps/web/src/features`: stateful business modules.
- `apps/web/src/widgets`: page-level UI sections and panels.
- `apps/web/src/shared`: reusable API, i18n, styles.
- `apps/api/src/modules`: auth, plans, checks, plugins.
- `packages/shared`: contracts shared by both apps.
- `packages/db`: schema snapshot, migrations, seeds.

## Plugin Direction

The previous plugin runtime executed arbitrary JavaScript served by the backend.
The new direction keeps plugin metadata, translations, and theme definitions in manifests so the frontend can render and apply them without evaluating remote code.
