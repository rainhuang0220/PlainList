# PlainList 2.4.0 Automatic ChatGPT Activity Journal — Handoff

Updated: 2026-09-02 (Asia/Shanghai)

This file replaces the previous 2.3.1 desktop-login handoff. The 2.3.1 constraints remain regression requirements, but that hotfix is complete and is no longer the active objective.

## Current objective

PlainList 2.4.0 changes ChatGPT Local Sync from a manual importer into an automatic activity source:

`local ChatGPT archive → Desktop background adapter → compact derived facts → server daily journal → Web/Desktop/Mobile + weekly review`

The hard boundary is unchanged: raw transcripts remain local. The PlainList API accepts only strict compact digests and reconciliation metadata.

## Workspace and Git

- Active worktree: `/Users/rainhuang/Desktop/plainlist/.worktrees/plainlist-2.4.0`
- Branch: `codex/plainlist-2.4.0`
- Baseline: `1ff3eadc0ce14565050c50d5b1ef091155c7db7e` (`v2.3.1`, `origin/main` at start)
- Version: `2.4.0`
- Android versionCode: `20025` (repository history maximum `20024` + 1)
- The original checkout `/Users/rainhuang/Desktop/plainlist` was already dirty and 56 commits behind. Its package-lock and image changes are user-owned and were not overwritten. Use this isolated worktree as the release source.

Before the 2.4.0 commit, `git fetch origin --prune` confirmed this branch had no upstream commits to rebase: its baseline and `origin/main` were both `1ff3ead`.

## Production weekly review root cause

The production snapshot was inspected read-only without outputting diary text, activity text, prompts, keys, tokens, or ChatGPT content.

- review_as_of_date: `2026-09-02`
- window: `2026-08-31` → `2026-09-01`
- status: `error`
- attempt_count: `2`
- generated_at: `null`
- updated_at: `2026-09-01T16:12:01Z`
- provider configured: yes
- source data count: `0`
- previous ready: no
- classification: `NO_SOURCE_DATA`

Cause: the old path called the model even when the evidence window was empty, then persisted a generic terminal error. The UI collapsed this into `本期回顾暂不可用`.

Fix:

- Deterministically preflight manual diary, completed checks, and ready/final ChatGPT journals.
- Empty evidence returns `NO_DATA` / `本期暂无足够记录` without an AI call.
- Missing provider returns `NO_PROVIDER` / `尚未配置回顾模型`.
- Missing or generating snapshots without a fallback return `本期回顾正在准备`.
- Generating/error snapshots with a previous-ready fallback continue to show it with `正在更新` / `暂未更新`.
- Real terminal failures remain generic and never expose provider, lease, HTTP, or model details.

## Implemented 2.4.0 behavior

### Desktop automatic sync

- One `syncChatgptActivity()` path handles startup, login, wake/resume, local midnight, debounced archive changes, and secondary `立即检查` recovery.
- Archive changes coalesce for 30 seconds.
- Each JSON file is checked before and after reading for stable size and mtime.
- Symlinks, deleted folders, partial JSON, oversized files, malformed archives, and unchanged canonical hashes are safely skipped.
- Local midnight is recalculated from local calendar time after each run; no fixed 24-hour interval or UTC-slice assumption.
- Startup and wake perform missed-day catch-up.
- Processing concurrency is bounded at 2.
- Each successful conversation is checkpointed immediately. App exit or pause leaves bootstrap incomplete and resumes on the next run.
- Retryable 429/timeout/5xx digest failures use bounded exponential backoff (three attempts) without discarding successful checkpoints.
- Existing 2.3 `bootstrap_skipped` hashes are re-entered once for full historical backfill; successful hashes remain idempotent.

### Daily journals and server data

Migration `012_chatgpt_daily_journals.sql` adds:

- `chatgpt_daily_journals`, unique by `(user_id, journal_date, source_type)`
- `chatgpt_activity_connections`, unique by `(user_id, source_type)`

Journals store only rendered Markdown and compact counts/status/version timestamps. Reconciliation regenerates affected dates, finalizes past local dates, supports controlled correction of old dates, and can backfill all historical fact dates on first bootstrap.

Weekly review reads at most seven daily journals and remains O(days). Existing Activity Facts and daily/weekly intelligence invalidation is reused.

### UI and cross-device consumption

- Settings is renamed to `ChatGPT 活动记录` and presented as an automatic source, not an importer.
- Desktop shows connection, archive, automatic status, last sync, bounded bootstrap progress, privacy text, pause/resume, reselect, and secondary `立即检查`.
- Web/Mobile show derived connection status and explain that local permission/sync requires Desktop; they do not show a folder picker.
- Daily/Diary shows ChatGPT activity beside, never over, the user-authored diary.
- Settings includes a date picker for current and previous daily journals.
- Markdown is rendered through a narrow escape-first allowlist for headings, lists, bold, code, and safe HTTP(S)/mailto links. Raw HTML and `javascript:` links are inert.

## Privacy and security

- Server raw transcript persistence: **NO**.
- Reconcile and digest schemas are strict and reject `messages`, `transcript`, `rawMarkdown`, `cookie`, `session`, caller user IDs, and extra fields.
- Local state contains hashes, timestamps, counts, and processing status only.
- Prompt-injection text is not copied into the compact local digest.
- No new raw-content logs or telemetry were added.
- 2.3.1 desktop transport remains: renderer → context-isolated preload IPC → Electron main `net.fetch` → `https://plainlist.space/api/*`.
- No raw IP API routing, direct proxy override, `Origin:null` exception, wildcard CORS, or disabled web security was introduced.

## Verification completed

Latest completed checks before this handoff:

- Full workspace tests passed: API 164, Web 70, DB 2, Shared 58, plus Electron and production-bundle contract tests.
- New focused tests passed for weekly review state mapping, historical reconciliation, same-day/multi-conversation journal rendering, cross-day facts, regeneration/finalization, strict privacy payloads, safe Markdown, canonical hash skip, malformed/partial archive handling, symlink blocking, stable-file reads, checkpoint/resume, bounded retries, pause/resume, startup/wake/midnight/debounce, and canonical desktop API routing.
- Full workspace typecheck passed.
- Production build passed for shared, API, and Web.
- Targeted lint for all new ChatGPT journal/API/UI files passed. Repository-wide lint still reports pre-existing errors in `App.vue` (`no-unsafe-finally`) and `Marketplace.vue` (single-word component name), plus older warnings; do not claim repository-wide lint is clean.

Run again before any artifact/tag claim:

```bash
cd /Users/rainhuang/Desktop/plainlist/.worktrees/plainlist-2.4.0
npm run typecheck
npm test
npm run build
git diff --check
```

## Production topology observed before 2.4.0 cutover

- API PM2 process: `plainlist-api`
- API release cwd: `/home/ubuntu/plainlist/releases/1ff3eadc0ce14565050c50d5b1ef091155c7db7e/apps/api`
- Public Web Nginx root: `/www/wwwroot/plainlist-releases/8b7e2a78feb21128511b51662e9820d47dea15dc`
- Therefore the pre-cutover API was at `v2.3.1` while the public Web root was still the older `v2.3.0` merge. This mismatch must not remain after the requested convergence deployment.

## Release/convergence checklist

The handoff is not permission to skip verification. Complete in this order:

1. Commit and push `codex/plainlist-2.4.0`.
2. Open and merge a PR into `main`; fetch and verify the merged SHA.
3. Build from that exact merged SHA.
4. Apply migration 012 once using the production environment. It is additive and uses `CREATE TABLE IF NOT EXISTS`.
5. Start an isolated API smoke with `BACKGROUND_JOBS_ENABLED=false`; verify health and authenticated derived-journal endpoints.
6. Create a fresh immutable API release directory named by the merged SHA; preserve the production `.env`; switch PM2 only after smoke.
7. Create a fresh immutable Web root named by the same merged SHA; atomically change Nginx roots and reload.
8. Verify public health, login, Week empty-state behavior, journal read, and that API cwd/Web root/GitHub `main` all identify the same merged SHA.
9. Build arm64/x64 DMGs from merged `main` and run packaged desktop smoke.
10. Audit Android signing. Publish APK only if the existing signer is available and valid; otherwise record the artifact blocker without blocking API/Web/Desktop.
11. Only after final regression: tag `v2.4.0` and create the GitHub Release with verified artifacts and SHA-256 values.

## Known unfinished items at handoff creation

- Production 2.4.0 cutover and post-cutover verification were not yet completed when this file was created.
- Visual browser QA of the redesigned settings/daily viewer was planned but not completed.
- arm64/x64 DMGs and Android APK were not yet built for 2.4.0.
- `v2.4.0` tag and GitHub Release were not yet created.
- The settings UI has bounded bootstrap progress but not a separate date-list index with summary previews; previous dates are accessible with the date picker.
- Local extraction is deterministic and intentionally conservative; it distinguishes produced vs partial facts but does not send raw conversations to a model for richer prose.

## Stop conditions

Stop and report only for a real blocker: unsafe DB migration, forced raw transcript upload, incompatible external archive format, failed production cutover/rollback, or unrecoverable artifact signing/build failure. Never expose production secrets or real user content in diagnostics.
