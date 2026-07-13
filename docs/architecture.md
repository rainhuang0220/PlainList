# Architecture

## Goals

- Frontend and backend stay separated.
- Single monorepo with shared TypeScript contracts.
- Database setup via explicit migrations and seeds.
- Plugins are manifest-driven — no arbitrary remote JS execution.
- Login terminal: English only. Dashboard: Chinese by default (locale switching TBD).

## Module Layout

- `apps/web/src/app` — shell, routing-by-scroll, loaders.
- `apps/web/src/features` — Pinia stores (auth, plans, checks, plugins, locale).
- `apps/web/src/widgets` — sections, auth, plugin store, AI settings.
- `apps/web/src/shared` — API client, i18n, styles.
- `apps/api/src/modules` — auth, plans, checks, plugins, ai-intake.
- `packages/shared` — types, Zod schemas, plugin catalog, locales.
- `packages/db` — schema, migrations, seeds.

## AI Configuration Resolution

```text
POST /api/ai-intake
  → load user_settings.ai_settings
  → if user has apiKey → use user config (BYOK)
  → else if apps/api/.env has key → use server default
  → else 503 with hint to open nav "AI" settings
```

User-facing settings: `GET/PUT/DELETE /api/ai-intake/settings`.

## Plugin Direction

| Type | Mechanism |
|------|-----------|
| Theme | `PLUGIN_CATALOG` → CSS variables |
| Widget | Cached git clone + `start.sh` + iframe |
| Language | Built into `LOCALE_TRANSLATIONS` (plugin path reserved) |

See [plugins.md](./plugins.md) for widget lifecycle and ecosystem roadmap.

## Day Review Visualizations

Preserved in `apps/web/src/widgets/sections/`:

- `DayReviewOverlay.vue` — modal shell + view switcher
- `ArchipelagoChart.vue`, `ArchipelagoAbstract.vue`, `ArchipelagoRelief3D.vue`
- `GalaxySystem.vue`, `PlanetTerrainViewer.vue`

Heavy 3D views use `defineAsyncComponent` for code splitting.

## Consolidation Notes (from PlainList-original)

**Kept from v2:** TypeScript, monorepo, AI intake, manifest plugins, migrations, day review viz.

**Kept spirit from v1:** Simple mental model (plans + checks + time views), demo account, terminal auth aesthetic.

**Dropped:** Root `index.html` legacy frontend, API serving `client/dist`, dynamic plugin JS execution.
