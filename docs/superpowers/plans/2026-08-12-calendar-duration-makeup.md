# Calendar Makeup Check-in & Plan Duration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship optional plan duration, calendar day makeup check-in (toggle + actual minutes), a persistent Day timeline, and week/month/year hour stats (bar/radar/pie + hide/merge) with separate habit check counts.

**Architecture:** Extend MySQL `plans` / `checks` plus a small per-user chart-prefs table. Shared Zod/types carry `durationMinutes` and `CheckDayState`. Vue stores stay the single client source of truth; Calendar popover gains long-press/right-click actions; Day reuses scheduleViz mapping for a plan timeline; Week/Month/Year consume a pure `durationStats` helper for hours + habit counts and chart prefs CRUD.

**Tech Stack:** Vue 3 · Pinia · Express · mysql2 · Zod · ECharts (existing) · Vitest · MySQL migrations under `packages/db/migrations`

**Spec:** `docs/superpowers/specs/2026-08-12-calendar-duration-makeup-design.md`

## Global Constraints

- Duration on plans is **optional** (`NULL` = reminder-only; no forced default minutes).
- Hour stats only for completed items with effective minutes: `actualMinutes` if set, else plan `durationMinutes`; reminders with neither never enter hour charts.
- Desktop makeup gesture: **contextmenu (right-click)**; mobile: **long-press ~500ms**.
- Chart default: **bar**; switchable bar / radar / pie. Hide/merge prefs persist per user + scope.
- Habit check **counts** are a separate panel from hour charts.
- Commits: author `rainhuang0220` only — **no** `Co-authored-by: Cursor` trailers.
- Do not rewrite AI intake protocol; only map parsed duration into `durationMinutes` on commit when available.

---

## File structure (create / modify)

| Path | Responsibility |
|------|----------------|
| `packages/db/migrations/007_plan_duration_check_actual.sql` | `plans.duration_minutes`, `checks.actual_minutes` |
| `packages/db/migrations/008_duration_chart_prefs.sql` | hide/merge prefs table |
| `packages/db/schema.sql` | Mirror new columns/table |
| `packages/shared/types/index.ts` | `durationMinutes` on `PlanRecord`; `CheckDayState`; prefs types |
| `packages/shared/schemas/plans.ts` | Optional `durationMinutes` on create/update |
| `packages/shared/schemas/checks.ts` | Optional `actualMinutes` on upsert; list shape |
| `packages/shared/schemas/duration-chart-prefs.ts` | Prefs GET/PUT schemas |
| `packages/shared/duration/effectiveMinutes.ts` | Pure: effective minutes for one plan×day |
| `packages/shared/duration/aggregateHours.ts` | Pure: build hour rows + habit counts for a range |
| `packages/shared/duration/*.test.ts` | Unit tests for the above |
| `apps/api/src/modules/plans/service.ts` | SELECT/INSERT/UPDATE/map duration |
| `apps/api/src/modules/checks/service.ts` | Read/write actual; default actual on done |
| `apps/api/src/modules/duration-prefs/` | Router + service for chart prefs |
| `apps/api/src/app.ts` | Mount `/api/duration-chart-prefs` |
| `apps/web/src/features/checks/model/useChecksStore.ts` | Store `CheckDayState`; `setCheck` / `toggle` with minutes |
| `apps/web/src/features/plans/model/usePlansStore.ts` | Pass `durationMinutes` on add/update |
| `apps/web/src/features/duration-stats/` | Prefs store + thin wrappers |
| `apps/web/src/components/calendar/DayTaskActionMenu.vue` | Shared menu UI |
| `apps/web/src/views/sections/CalendarSection.vue` | Popover position + gestures + menu |
| `apps/web/src/views/sections/PlansSection.vue` | Duration field + Day timeline |
| `apps/web/src/components/plans/DayScheduleAxis.vue` | Timeline for saved plans |
| `apps/web/src/components/plans/DurationMinutesField.vue` | Presets + custom + clear |
| `apps/web/src/components/stats/DurationHoursPanel.vue` | List + chart switch + hide/merge |
| `apps/web/src/views/sections/WeekSection.vue` | Embed hours panel + habit counts |
| `apps/web/src/views/sections/TrackerSection.vue` or month area | Month hours panel (place beside tracker summary) |
| `apps/web/src/views/sections/CalendarSection.vue` | Year-scope hours panel (below / beside year grid) |

---

### Task 1: Shared types, schemas, and pure duration helpers

**Files:**
- Modify: `packages/shared/types/index.ts`
- Modify: `packages/shared/schemas/plans.ts`
- Modify: `packages/shared/schemas/checks.ts`
- Create: `packages/shared/schemas/duration-chart-prefs.ts`
- Create: `packages/shared/duration/effectiveMinutes.ts`
- Create: `packages/shared/duration/aggregateHours.ts`
- Create: `packages/shared/duration/effectiveMinutes.test.ts`
- Create: `packages/shared/duration/aggregateHours.test.ts`
- Modify: `packages/shared/schemas/index.ts` (export prefs schema)
- Modify: `packages/shared/index.ts` (export `./duration`)

**Interfaces:**
- Produces:
  - `PlanRecord.durationMinutes?: number | null`
  - `CheckDayState { done: boolean; actualMinutes?: number | null }`
  - `ChecksByPlan = Record<string, Record<string, CheckDayState>>`
  - `effectiveMinutes(plan, cell): number | null`
  - `aggregateDurationStats({ plans, checks, from, to, prefs }): { hourRows; habitCounts; totalHours }`

- [ ] **Step 1: Write failing tests for effective minutes**

```ts
import { describe, expect, it } from 'vitest';
import { effectiveMinutes } from './effectiveMinutes';

describe('effectiveMinutes', () => {
  const plan = { id: 1, type: 'todo' as const, name: 'x', time: '09:00', sortOrder: 0, durationMinutes: 30 };

  it('returns null when not done', () => {
    expect(effectiveMinutes(plan, { done: false })).toBeNull();
  });

  it('prefers actualMinutes when done', () => {
    expect(effectiveMinutes(plan, { done: true, actualMinutes: 45 })).toBe(45);
  });

  it('falls back to plan duration when done and actual empty', () => {
    expect(effectiveMinutes(plan, { done: true })).toBe(30);
  });

  it('returns null for reminder-only completed item', () => {
    expect(effectiveMinutes({ ...plan, durationMinutes: null }, { done: true })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (module missing)**

Run: `npm test -w @plainlist/shared -- duration/effectiveMinutes`

- [ ] **Step 3: Implement types + `effectiveMinutes` + `aggregateHours` + schemas**

```ts
// types
export interface CheckDayState {
  done: boolean;
  actualMinutes?: number | null;
}
export type ChecksByPlan = Record<string, Record<string, CheckDayState>>;

// plans schema — add:
durationMinutes: z.number().int().positive().max(24 * 60).nullable().optional(),

// checks schema — add:
actualMinutes: z.number().int().positive().max(24 * 60).nullable().optional(),
```

`aggregateHours` must: skip hidden plan ids; apply merges (sum hours under label); build habitCounts for `type==='habit'` completed days in range (count days done, regardless of minutes).

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): duration types, check cells, and hour aggregation helpers"
```

---

### Task 2: DB migrations + API plans/checks

**Files:**
- Create: `packages/db/migrations/007_plan_duration_check_actual.sql`
- Modify: `packages/db/schema.sql`
- Modify: `apps/api/src/modules/plans/service.ts`
- Modify: `apps/api/src/modules/checks/service.ts`
- Test: API unit/integration if present; otherwise manual curl after local migrate

**Interfaces:**
- Consumes: shared schemas from Task 1
- Produces: plans JSON includes `durationMinutes`; checks list returns `{ done, actualMinutes }` per day; upsert applies default actual on done

- [ ] **Step 1: Write migration SQL**

```sql
ALTER TABLE plans
  ADD COLUMN duration_minutes INT NULL AFTER description;

ALTER TABLE checks
  ADD COLUMN actual_minutes INT NULL AFTER done;
```

- [ ] **Step 2: Update `PLAN_SELECT` / `mapPlan` / INSERT / UPDATE** to read/write `duration_minutes` → `durationMinutes`.

- [ ] **Step 3: Update `listChecks` reducer** to emit `CheckDayState`; update upsert:

```ts
// When done===true and actualMinutes==null: SELECT duration_minutes FROM plans; use it if present
// When done===false: force actual_minutes NULL
INSERT ... (plan_id, check_date, done, actual_minutes)
ON DUPLICATE KEY UPDATE done=VALUES(done), actual_minutes=VALUES(actual_minutes)
```

- [ ] **Step 4: Apply migration on server/dev DB** (`mysql ... < 007_...sql`) and smoke:

```bash
curl -sS -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3001/api/plans | head
curl -sS -X PUT -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"planId":1,"date":"2026-08-12","done":true}' http://127.0.0.1:3001/api/checks
```

- [ ] **Step 5: Commit**

```bash
git add packages/db apps/api/src/modules/plans apps/api/src/modules/checks
git commit -m "feat(api): persist plan duration and check actual minutes"
```

---

### Task 3: Chart prefs API

**Files:**
- Create: `packages/db/migrations/008_duration_chart_prefs.sql`
- Create: `apps/api/src/modules/duration-prefs/service.ts`
- Create: `apps/api/src/modules/duration-prefs/router.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Produces: `GET/PUT /api/duration-chart-prefs?scope=week&scopeKey=2026-W33` body `{ hiddenPlanIds: number[]; merges: Array<{ label: string; planIds: number[] }> }`

- [ ] **Step 1: Migration**

```sql
CREATE TABLE IF NOT EXISTS duration_chart_prefs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  scope ENUM('week','month','year') NOT NULL,
  scope_key VARCHAR(32) NOT NULL,
  hidden_plan_ids JSON NOT NULL,
  merges JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_scope (user_id, scope, scope_key),
  CONSTRAINT fk_dcp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

- [ ] **Step 2: Implement get (default empty) + put upsert**

- [ ] **Step 3: Mount router in `app.ts`**

- [ ] **Step 4: Smoke curl GET/PUT**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(api): duration chart hide/merge prefs"
```

---

### Task 4: Web stores adapt to CheckDayState + duration on plans

**Files:**
- Modify: `apps/web/src/features/checks/model/useChecksStore.ts`
- Modify: `apps/web/src/features/plans/model/usePlansStore.ts`
- Grep-fix all `isChecked` / `checks.value[...]` boolean assumptions in web (PlansSection, TrackerSection, CalendarSection, WeekSection, DayReviewOverlay, notifications)

**Interfaces:**
- Produces: `isChecked` reads `.done`; `getActualMinutes(planId, date)`; `setCheck(planId, date, { done, actualMinutes? })`; `toggle` keeps working (done flip; on become-done omit actual so API defaults)

- [ ] **Step 1: Update checks store**

```ts
function isChecked(planId: number | string, dateKey: string) {
  return Boolean(checks.value[String(planId)]?.[dateKey]?.done);
}

async function setCheck(planId: number, dateKey: string, next: { done: boolean; actualMinutes?: number | null }) {
  // optimistic CheckDayState; PUT { planId, date, done, actualMinutes }
}
```

- [ ] **Step 2: Fix every consumer that treated cell as boolean** (assign `{ done: true }` when writing locally; read `.done`)

- [ ] **Step 3: Plans store `add`/`update` accept optional `durationMinutes`**

- [ ] **Step 4: Run web unit tests + typecheck**

Run: `npm run test -w @plainlist/web` and `npm run typecheck -w @plainlist/web`

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(web): checks store carries actual minutes; plans carry duration"
```

---

### Task 5: Calendar popover position + makeup menu

**Files:**
- Create: `apps/web/src/components/calendar/DayTaskActionMenu.vue`
- Modify: `apps/web/src/views/sections/CalendarSection.vue` (`buildPopoverStyle`, mobile CSS, task rows)

**Interfaces:**
- Consumes: `checks.setCheck`, plan `durationMinutes`
- Produces: menu actions `toggle-done`, `edit-minutes`

- [ ] **Step 1: Fix mobile popover vertical position**

In `@media (max-width: 768px)` for `.day-popover`, set something like:

```css
top: max(12px, 10vh) !important;
bottom: auto !important;
max-height: min(70vh, 520px);
overflow: auto;
```

Also clamp desktop `buildPopoverStyle` so `top` prefers upper third when space below is tight.

- [ ] **Step 2: Add long-press (500ms) + `contextmenu.prevent` handlers on each task row in the day popover**

- [ ] **Step 3: Implement `DayTaskActionMenu`** with:
  - 「切换完成状态」
  - 「设置/修改时长」→ small minutes input (presets + number); on confirm call `setCheck(..., { done: true, actualMinutes })` or update minutes while staying done

- [ ] **Step 4: Manual verify on narrow viewport + desktop right-click**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(web): calendar day makeup check-in and popover position"
```

---

### Task 6: Duration field + Day schedule axis

**Files:**
- Create: `apps/web/src/components/plans/DurationMinutesField.vue`
- Create: `apps/web/src/components/plans/DayScheduleAxis.vue`
- Modify: `apps/web/src/views/sections/PlansSection.vue`
- Optionally map AI intake commit → `durationMinutes` in intake commit path

**Interfaces:**
- Consumes: `PlanRecord.time`, `durationMinutes`; `timeToMinutes` / `minutesToPercent` from `@plainlist/shared`
- Produces: axis blocks for today's visible plans

- [ ] **Step 1: `DurationMinutesField`** — buttons 15 / 30 / 60 / 120, custom number, clear (null)

- [ ] **Step 2: Wire into add + edit forms in `PlansSection`**

- [ ] **Step 3: `DayScheduleAxis`** — for each today plan: if duration → bar from start to start+duration; else point at `time`

- [ ] **Step 4: Mount axis in Day section (always visible when there are plans)**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(web): optional plan duration and day schedule axis"
```

---

### Task 7: Duration hours panel (chart switch + hide/merge) + embed week/month/year

**Files:**
- Create: `apps/web/src/features/duration-stats/useDurationChartPrefsStore.ts`
- Create: `apps/web/src/components/stats/DurationHoursPanel.vue`
- Create: `apps/web/src/components/stats/HabitCheckCountsPanel.vue`
- Modify: `WeekSection.vue`, month summary (`TrackerSection.vue` or Calendar year footer), `CalendarSection.vue` year area

**Interfaces:**
- Consumes: `aggregateDurationStats`, prefs API
- Produces: scope `week|month|year` + `scopeKey` string helpers

- [ ] **Step 1: Prefs store** load/save hidden + merges for current scope

- [ ] **Step 2: `DurationHoursPanel`**
  - Hour list (name — X.X h)
  - Chart mode toggle: `bar` | `radar` | `pie` (default bar); disable radar when &lt; 3 categories
  - Per-row actions: hide; pick two → merge with label
  - Hidden list with restore; merge chips with unmerge

- [ ] **Step 3: `HabitCheckCountsPanel`** — habit name + done-day count in range

- [ ] **Step 4: Embed panels in Week, Month, Year views with correct `from`/`to` and scopeKey (`2026-W33`, `2026-08`, `2026`)

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(web): week/month/year hour stats with chart prefs and habit counts"
```

---

### Task 8: Deploy migration + ship web (and clients if needed)

**Files:** deploy scripts / server migrate only

- [ ] **Step 1: Apply `007` + `008` on production MySQL**

- [ ] **Step 2: Deploy API (`pm2 restart` after pull/build) and Web (`VITE_API_BASE_URL=` build → rsync `:8086`)

- [ ] **Step 3: Smoke production: create plan with duration, complete via calendar menu, see hours on week panel

- [ ] **Step 4: If Electron/Android must pick up UI, bump to next patch and ship DMG/APK (same pipeline as 2.0.16)**

- [ ] **Step 5: Commit any version bumps + push; optional `gh release`

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| `plans.duration_minutes` | 1–2, 6 |
| `checks.actual_minutes` + default on done | 1–2, 4–5 |
| Mobile popover up | 5 |
| Long-press / right-click makeup | 5 |
| Optional duration UI | 6 |
| Day timeline bars/points | 6 |
| Hour list + bar/radar/pie | 7 |
| Hide / merge prefs | 3, 7 |
| Habit check counts | 7 |
| AI duration map on commit | 6 (optional step inside task) |
| Production migrate + deploy | 8 |

## Placeholder / consistency notes

- `ChecksByPlan` **must** become `CheckDayState` cells everywhere — Task 4 is the choke point; do not leave boolean cells.
- Property naming: API/JSON camelCase `durationMinutes` / `actualMinutes`; DB snake_case.
- Scope keys: use ISO week `YYYY-Www` via existing date helpers if present; otherwise small local helper in duration-stats feature.
