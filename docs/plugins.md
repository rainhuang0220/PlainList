# Plugin Ecosystem

## Current State

PlainList v2 uses a **manifest catalog** in `packages/shared/constants/plugins.ts`. Plugins are not arbitrary JavaScript downloaded at runtime (unlike PlainList-original).

| Category | Runtime | Examples |
|----------|---------|----------|
| `theme` | CSS variables from manifest | `theme-pack` |
| `widget` | External app in iframe + optional local process | `fishtime` (only widget today) |
| `language` | Translation bundle in manifest | reserved — not shipped yet |

## How Fishtime Works

1. User clicks **Install** in Plugin Store.
2. API `installPlugin()` records plugin in `user_settings.installed_plugins`.
3. For `category === 'widget'`, `widgetRunner.installWidget()`:
   - Ensures `data/widgets/fishtime/` exists (clone once on first install).
   - Runs `data/widgets/fishtime/start.sh` as a detached process.
4. Fishtime listens on `http://localhost:5174` (defined in manifest `widgetUrl`).
5. After login / API restart, `startInstalledWidgets()` starts cached widgets without re-cloning.
6. Web app shows a nav button; `WidgetPanel.vue` opens an iframe to `widgetUrl`.

## Clone Behavior

| Scenario | Behavior |
|----------|----------|
| First install | `git clone` into `data/widgets/<id>/` |
| Re-install / API restart | Reuse cache, run `start.sh` only |
| Force update | `WIDGET_UPDATE=1 npm run dev:api` runs `git pull` |

`data/widgets/` is gitignored — each machine keeps its own cache.

## Better Approaches (Recommended Roadmap)

### Short term (pragmatic)

- **Vendor critical widgets** in-repo under `widgets/vendor/fishtime/` for offline / reproducible installs.
- **Whitelist `repoUrl`** in API — reject unknown URLs.
- **Health gate**: don't show nav button until `widgetUrl` responds.

### Medium term (scalable)

- **npm package widgets**: `npm pack` + extract to `data/widgets/` — versioned, no git at runtime.
- **Release archives**: manifest field `archiveUrl` + `sha256` — download once, verify, extract.
- **Web-only widgets**: static bundles in `apps/web/public/widgets/<id>/index.html` — zero subprocess.

### Long term (platform)

- **Signed manifest registry** (JSON Schema + publisher signature).
- **Capability tokens**: widget declares `needs: ['network', 'storage']`, user approves.
- **Sandboxed iframe** with strict CSP and `sandbox` attribute (already partially true).

## vs PlainList-original

| | original | current |
|---|----------|---------|
| Theme/lang | Execute `.js` from server | Manifest data |
| Extensibility | High, risky | Controlled |
| Third-party widgets | N/A | iframe + sidecar process |

Original's `PluginRuntime.register()` was great for demos; manifest-driven is better for production security.

## Adding a New Widget

1. Add entry to `PLUGIN_CATALOG` with `category: 'widget'`, `widgetUrl`, optional `repoUrl`.
2. Widget repo must ship `start.sh` that binds a known port.
3. User installs from Plugin Store — no code changes elsewhere.

For static-only widgets, skip `repoUrl` and point `widgetUrl` to a path under `apps/web/public/`.
