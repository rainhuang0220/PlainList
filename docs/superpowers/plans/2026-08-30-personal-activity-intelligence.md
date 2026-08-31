# PlainList Personal Activity Intelligence — 分阶段实现计划

**目标：** 在不破坏日记、计划、打卡和现有用户数据的前提下，交付 Activity Facts → Daily Digest → Weekly Intelligence，并通过官方 remote MCP 支持用户显式保存当前 ChatGPT 对话及紧凑双向检索。

- **设计依据：** [2026-08-30-personal-activity-intelligence-design.md](../specs/2026-08-30-personal-activity-intelligence-design.md)
- **官方能力依据：** [openai-capability-research.md](../../activity-intelligence/openai-capability-research.md)

## 全局约束

- 所有工作在独立 branch/worktree 完成；当前设计分支是 `codex/activity-intelligence-phase0`。
- migration 只 additive；不删除、重命名、覆盖或回填现有 `plans`、`checks`、`daily_reviews`、`user_settings` 数据。
- Activity 模块只能通过稳定读接口消费日记。不得更改显式 `dateKey`、`currentDate` / `editingDate`、跨午夜 flush、昨日技术宽限和历史只读语义。
- AI 结果是派生数据；任何 provider 故障都不得阻断主应用读写。
- 默认不保存完整 ChatGPT transcript，不使用 cookie、私有 endpoint、DOM scraping 或浏览器扩展。
- 每个阶段都先写目标测试，再实现最小改动；测试、typecheck、lint 通过后才提交。
- 一个 commit 只表达一个可审查意图。禁止把 migration、领域逻辑、UI 和 OAuth 混成大提交。
- 未通过当前阶段 Exit Gate，不开始后续阶段。

## Phase 0 — 审计与决策（本分支）

### 交付物

- [x] 在隔离 worktree 安装依赖并跑完整测试基线。
- [x] 审计日记保存、日期 rollover、历史只读、计划/打卡/时长、现有周总结、AI adapter、用户画像和跨端架构。
- [x] 只用官方一手来源审计 ChatGPT / OpenAI Route A–E。
- [x] 写接入 ADR、目标模型、数据模型、token/privacy 策略和本计划。

### 验证

- 基线：API 55、Web 50、Shared 39，共 144 tests passed。
- 文档完成后：`git diff --check`、Markdown link/path 检查、`npm run typecheck`、`npm run lint`、`npm test`。
- 当前全仓 lint 基线并非 clean：API 1 个 error、Web 2 个 errors，均位于本分支未修改的源码；Phase 0 记录但不夹带修复。

### Exit Gate

- 文档不再把 ChatGPT 产品历史与 Responses API Conversations 混同。
- 明确主路径是 remote MCP + 显式保存，而不是自动全历史同步。
- schema、删除语义、hash 依赖、OAuth 和模型路由彼此一致。
- 本阶段没有生产功能代码或 migration 变更。

### 建议 commits

1. `docs(activity): record official ChatGPT capability boundaries`
2. `docs(activity): add knowledge layer architecture and ingestion ADR`
3. `docs(activity): add phased implementation plan`

---

## Phase 1 — Shared contracts、纯函数与 additive schema

这一阶段只建立可测试的语言和持久化边界，不接 UI、不调用模型。

### 1.1 Shared contracts

**Create:**

- `packages/shared/schemas/activity-goals.ts`
- `packages/shared/schemas/activity-sources.ts`
- `packages/shared/schemas/activity-insights.ts`
- `packages/shared/activity/canonicalize.ts`
- `packages/shared/activity/dateRange.ts`
- 对应 `*.test.ts`

**Modify:**

- `packages/shared/schemas/index.ts`
- `packages/shared/index.ts`
- `packages/shared/types/index.ts`

**测试先行：**

- canonical JSON 与 object key 顺序无关，array 顺序保持语义。
- Unicode、换行和 nullable 字段规范化结果稳定。
- `dateStart <= dateEnd`，weekStart 必须规范化为周一。
- source schema 不接受 `userId`，compact payload 和字符串有硬上限。
- 五维状态只接受 ADR 中的离散枚举，不存在数值 productivity score。
- MCP digest 的同一 idempotency key 能生成同一 canonical hash。

### 1.2 Migration 009

**Create:**

- `packages/db/migrations/009_activity_knowledge_core.sql`

**Modify:**

- `packages/db/schema.sql`

创建：

- `activity_goals`
- `activity_sources`
- `activity_facts`
- `daily_activity_digests`
- `weekly_activity_intelligence`

此阶段不创建 cursor 或 OAuth 表；它们没有运行消费者。

### 1.3 Repository ownership

**Create:**

- `apps/api/src/modules/activity-knowledge/repository.ts`
- `apps/api/src/modules/activity-knowledge/repository.test.ts`
- `apps/api/src/modules/activity-goals/service.ts`
- `apps/api/src/modules/activity-goals/service.test.ts`

**必须覆盖：**

- 每个 select/update/delete 同时限定主键与 authenticated `user_id`。
- user A 无法读取、更新或删除 user B 的 source、fact、goal 或 derived artifact。
- source soft-delete 会清空 `compact_payload`；facts hard-delete。
- migration 对已有权威表不做 ALTER / UPDATE / DELETE。
- 用户删除由现有 `users ON DELETE CASCADE` 清理所有新表。

### Phase 1 验证

```bash
npm test -w @plainlist/shared -- activity
npm test -w @plainlist/api -- activity-knowledge
npm run typecheck
npm run lint
npm test
```

另在一次性空 MySQL 测试库执行 001–009，并对包含 001–008 数据快照的测试库只执行 009；比较 `plans`、`checks`、`daily_reviews` 行数与 checksum，必须不变。绝不在生产库做这个验证。

### Exit Gate

- 核心表和 shared contract 可以独立 review。
- 没有模型、MCP 或 UI 代码。
- 权限与幂等约束已有失败路径测试。

### 建议 commits

1. `test(shared): specify activity contracts and hashes`
2. `feat(shared): add activity knowledge contracts`
3. `feat(db): add activity knowledge core tables`
4. `feat(api): add tenant-safe activity repositories`

---

## Phase 2 — PlainList 稳定读适配器与 Activity Facts

这一阶段只从现有权威数据构建 facts，不生成 daily/weekly 文案。

### 2.1 Stable source reader

**Create:**

- `apps/api/src/modules/activity-knowledge/sources/plainlistSourceReader.ts`
- `apps/api/src/modules/activity-knowledge/sources/plainlistSourceReader.test.ts`

接口只返回指定显式 date range 的 read projection：plans、checks、effective minutes、reviews 和必要 profile hints。它应复用现有 services 或提取可共享 repository，不复制 SQL。

**回归断言：**

- reader 不导出任何 write 方法。
- reader 不调用 `new Date()` / `today()` 决定查询日期。
- 读取历史日记不会调用 upsertReview。
- 未打卡表达为“无记录”，不是“未完成”。

### 2.2 Deterministic facts

**Create:**

- `apps/api/src/modules/activity-knowledge/facts/structuredExtractor.ts`
- `apps/api/src/modules/activity-knowledge/facts/factSync.ts`
- 对应 tests

先用纯函数提取：

- 完成的 plan/check、actual minutes、fallback duration；
- todo 输出与 habit maintenance；
- 已确认 AI intake 最终形成的 plan，不保存 intake 原文；
- 记录冲突和 unknown，不把 unchecked 当作 failure。

每个日期使用 `plainlist-day:<dateKey>` external ID。`activity_sources.compact_payload` 只保存 source refs/hash/计数，不复制日记正文。日记文本仅在内存中进入 Phase 3 cheap extractor。

### 2.3 Invalidation service

**Create:**

- `apps/api/src/modules/activity-knowledge/invalidation.ts`
- `apps/api/src/modules/activity-knowledge/invalidation.test.ts`

覆盖：

- hash 未变时 no-op；
- hash 改变时替换 source facts；
- 受影响 daily/weekly content 立即置 NULL 并标 dirty；
- source 删除时不修改 `daily_reviews`、`plans` 或 `checks`；
- 日期范围相交规则正确处理周 lookback。

### Phase 2 验证

```bash
npm test -w @plainlist/api -- plainlistSourceReader structuredExtractor invalidation
npm test -w @plainlist/web -- reviewSaveCoordinator useReviewsStore
npm run typecheck
npm run lint
npm test
```

### Exit Gate

- 给定固定 DB projection，可重复得到相同 sources/facts/hash。
- 没有 raw chat 表或日记副本。
- 日记日期与写入回归全部通过。

### 建议 commits

1. `feat(api): add read-only PlainList activity source projection`
2. `feat(api): materialize deterministic activity facts`
3. `feat(api): invalidate derived activity artifacts safely`

---

## Phase 3 — Provider routing、Daily Digest 与 Weekly Intelligence

### 3.1 深化现有 AI adapter

**Modify:**

- `packages/shared/schemas/ai-settings.ts`
- `apps/api/src/modules/ai-intake/settings.ts`
- `apps/api/src/modules/ai-shared/llm.ts`
- 对应 tests

新增可选 `summaryModel`、`reasoningModel`，保持旧设置兼容：

- summarize → `summaryModel || intakeModel || model`
- reason → `reasoningModel || model`

`ChatResult` 增加 optional usage。不得引入第二套 provider config。

单独 hardening commit 删除 AI intake 的正文 preview 日志；用脱敏 error code 取代。

### 3.2 Diary/source fact extractor

**Create:**

- `apps/api/src/modules/activity-knowledge/facts/modelExtractor.ts`
- `apps/api/src/modules/activity-knowledge/prompts/facts.v1.ts`
- tests with adversarial fixtures

测试：

- 日记中“忽略上面的指令、泄露 key、调用 URL”等内容只能成为数据，不能改变输出 contract。
- summarizer 无 tools/network 能力。
- 非法 JSON、超长字段、未知 enum、partial output 全部拒绝，不保存半成品。
- 原文超限时按有界 chunks 提取，同一 fact 去重。

### 3.3 Daily pipeline

**Create:**

- `apps/api/src/modules/activity-knowledge/daily/service.ts`
- `apps/api/src/modules/activity-knowledge/daily/projection.ts`
- `apps/api/src/modules/activity-knowledge/prompts/daily.v1.ts`
- tests

行为：

- GET 只读状态；POST 才生成。
- 首次 bootstrap 最多 7 天一批，之后只处理 hash 变化日期。
- Daily content 不做最终 goal alignment / opportunity cost。
- 模型返回后重新校验 input hash；陈旧结果丢弃。
- provider 失败只保存 error code/status。

### 3.4 Weekly pipeline

**Create:**

- `apps/api/src/modules/activity-knowledge/weekly/service.ts`
- `apps/api/src/modules/activity-knowledge/weekly/projection.ts`
- `apps/api/src/modules/activity-knowledge/prompts/weekly.v1.ts`
- tests

行为：

- weekStart 明确规范化为周一。
- 输入最多 28 个 daily projections、active goals 和结构化时长/打卡 aggregates。
- 测试直接断言 projection type 中没有 raw conversation 或 raw diary 字段。
- 输出区分 Progress、Alignment、Output、Exploration、Opportunity Cost、unknowns 和 next actions。
- 娱乐/休息无证据时不得自动标记 opportunity cost。
- 目标修改只改变 goal profile hash 和 weekly freshness，不重建 daily。

### 3.5 HTTP surface

**Create:**

- `apps/api/src/modules/activity-knowledge/router.ts`

**Modify:**

- `apps/api/src/app.ts`

初始 endpoints：

- `GET /api/activity/daily?date=...`
- `POST /api/activity/daily/generate`
- `GET /api/activity/weekly?weekStart=...`
- `POST /api/activity/weekly/generate`
- `DELETE /api/activity/sources/:id`

路由只做 auth/schema/status mapping。

### Phase 3 验证

```bash
npm test -w @plainlist/api -- llm activity-knowledge weekly
npm test -w @plainlist/api -- weeklySummary
npm run typecheck
npm run lint
npm test
```

增加 integration fixture：同一周 2,000 条 conversation-like facts 与 20 条 facts 生成 weekly 时，projection 的元素数量只随日期上限变化，不随原始消息数线性增长。

### Exit Gate

- Internal PlainList data 已能端到端生成 daily/weekly。
- 相同 hash 不重复调用；变化/删除不会展示 stale content。
- 新 weekly 可与旧 weekly endpoint 并行，尚未替换生产 UI。

### 建议 commits

1. `feat(ai): route summarizer and reasoning models`
2. `fix(ai): remove model content from intake error logs`
3. `feat(activity): extract bounded facts from diary sources`
4. `feat(activity): generate incremental daily digests`
5. `feat(activity): generate goal-aware weekly intelligence`
6. `feat(api): expose activity intelligence endpoints`

---

## Phase 4 — Goals 与 restrained Week UI vertical slice

### 4.1 Goals API/UI

**Create:**

- `apps/api/src/modules/activity-goals/router.ts`
- `apps/web/src/features/activity-goals/model/useActivityGoalsStore.ts`
- `apps/web/src/components/activity/ActivityGoalsPanel.vue`
- tests

**Modify:**

- `apps/api/src/app.ts`
- 选择 Settings 或 Week 邻近的轻量入口

覆盖 create/update/pause/archive/reorder；priority rank 只是用户排序。删除或 archive 后，依赖 weekly 立即 dirty/content NULL。

### 4.2 Week UI

**Create:**

- `apps/web/src/features/activity-intelligence/model/useActivityIntelligenceStore.ts`
- `apps/web/src/components/activity/WeeklyIntelligencePanel.vue`
- `apps/web/src/components/activity/EvidenceDrawer.vue`

**Modify:**

- `apps/web/src/views/sections/WeekSection.vue`
- `apps/web/src/views/sections/WeekSection.test.ts`

保留旧 AI summary fallback 与数据明细；新 panel 逐段展示，不加总分。状态包括 not configured、missing、dirty、generating、ready、failed。

### UI tests

- 不显示虚构数字评分。
- unknown 和证据不足可见。
- evidence drawer 只显示最小来源摘要。
- generate 失败仍可切换并使用数据明细、日记和计划。
- 历史日记 overlay 仍只读。
- Web、Electron、Android 共用逻辑；移动布局不加入新的常驻重型 dashboard。

### Phase 4 验证

```bash
npm test -w @plainlist/web -- WeekSection activity
npm run typecheck
npm run lint
npm test
npm run build
```

### Exit Gate

- 用户只使用 PlainList 自有数据就能获得第一个可用 vertical slice。
- UI 对 derived/unknown/failure 诚实，旧功能保留 fallback。

### 建议 commits

1. `feat(api): add configurable activity goals`
2. `feat(web): add restrained activity goals editor`
3. `feat(web): show evidence-backed weekly intelligence`

---

## Phase 5 — 官方 remote MCP + 显式保存当前 ChatGPT 对话

进入本阶段前重新核对届时 OpenAI 官方 Plugin/MCP auth、metadata、tool annotation 与确认文档。若官方契约变化，先更新 capability research 与 ADR。

### 5.1 OAuth security surface

**Create:**

- additive migration `010_activity_mcp_oauth_grants.sql`
- `apps/api/src/modules/activity-mcp/oauth/`
- OAuth integration tests

实现 protected resource metadata、authorization server metadata、authorization code + PKCE、短期 scoped access JWT、hashed refresh token 和 revoke。优先 Client ID Metadata Document；若目标 host 实测要求不同 registration 机制，先记录小 ADR，再用独立 migration 添加 client registry。

**安全测试：**

- code 单次使用、短过期、PKCE mismatch 拒绝。
- redirect URI 精确匹配，防 open redirect。
- access token audience/scope/expiry 全校验。
- refresh token 数据库只存 hash，revoke 立即生效。
- 日志不出现 code/token。

### 5.2 MCP transport

**Create:**

- `apps/api/src/modules/activity-mcp/server.ts`
- `apps/api/src/modules/activity-mcp/tools/appendActivityDigest.ts`
- manifest / plugin metadata（按届时官方格式）
- contract/integration tests

允许新增一个经过评审、锁定版本的官方 MCP SDK；先确认现有依赖不能可靠实现 Streamable HTTP，再添加。不要引入 agent framework、vector DB 或浏览器自动化。

`append_activity_digest` 只映射到 `ActivityKnowledge.ingest`：

- tool args ≤ 12 KB，字段/数组/字符串严格限长；
- userId 只来自 OAuth principal；
- `dateKey` 必填，跨日 activities 必须分别标 dateKey；
- idempotency key 重放返回 existing；
- server 重算 content hash；
- 返回 source ID、保存日期、fact count 和可核对短摘要，不回传私密全文。

### 5.3 Host evaluation

在测试账号/环境覆盖：

- 明确“保存这次对话到 PlainList”；
- 重复说同一句，确认幂等；
- 未登录、scope 不足、过期 token；
- prompt injection 内容；
- 超长 conversation；
- 用户没有要求保存时，不应声称已自动保存；
- 写确认 UX 在目标 Web/desktop/mobile/workspace policy 下的实际表现。

记录真实结果，不把模型可能选择工具写成 guaranteed callback。

### Phase 5 验证

```bash
npm test -w @plainlist/api -- activity-mcp oauth
npm run typecheck
npm run lint
npm test
```

另做 staging 端到端：ChatGPT 当前 conversation → OAuth → MCP append → PlainList source/facts → daily dirty → lazy regenerate → Week 可见。禁止用生产用户数据演练。

### Exit Gate

- 至少一个官方、可撤销、幂等的 ChatGPT 写入路径可靠运行。
- 无 raw transcript 默认落库。
- 产品文案只承诺“按需保存当前对话”。

### 建议 commits

1. `feat(db): add hashed MCP OAuth grants`
2. `feat(api): authorize scoped MCP access with PKCE`
3. `feat(mcp): append explicit ChatGPT activity digests`
4. `docs(mcp): record host compatibility evaluation`

---

## Phase 6 — 双向紧凑检索

在写入和 provenance 稳定后，再增加 read tools：

- `get_goals`
- `get_week_context`
- `search_activity_context`
- `get_recent_outputs`

### 约束

- 默认返回 compact projection，不返回 raw diary 或完整 source payload。
- 强制 date range、limit、最大响应 bytes 和 ownership。
- search 先用 MySQL date/type/goal filters；没有真实质量瓶颈前不引入 embeddings/vector DB。
- 每条返回保留 source type/date/confidence/unknown，禁止把 derived interpretation 伪装成原始事实。
- read tools 标记 read-only；服务端授权仍是最终边界。

### Tests

- 租户隔离、scope 缺失、超限裁剪。
- 同一 query 排序稳定。
- 删除 source 后检索无残留。
- raw diary sentinel 永不出现在默认 context response。
- 1 万 facts 数据集的 query 有索引计划并满足预定延迟预算，再决定是否需要新的索引。

### 建议 commits

1. `feat(activity): build compact context projections`
2. `feat(mcp): expose scoped read-only activity tools`

---

## Phase 7 — 条件式来源扩展

### 7.1 Route B：PlainList-originated API conversations

只在产品决定提供一方 conversation UI 时实施：

- 用 provider-specific adapter 管理 PlainList 创建且持有 ID 的 Responses conversation。
- 不把它描述成 ChatGPT 产品历史。
- 保存 external conversation/response/item IDs 与 compact digest；raw retention 单独征得用户选择。
- 有真实增量 stream 时再 additive 创建 `activity_ingestion_cursors`。
- Anthropic-compatible / generic provider 保持可用，不强迫所有 Activity 用户使用 OpenAI Responses。

### 7.2 Route D：data export importer

开始条件：

1. 用户主动提供脱敏或测试账号导出的真实样本；
2. 记录文件列表、schema 变体、conversation tree、附件和删除语义；
3. 更新 ADR，明确哪些字段是观察事实、哪些不是官方稳定契约。

实现要求：

- 第一版接受用户已解压并明确选择的文件，避免不必要的 archive attack surface；若必须支持压缩包，再加入文件数、路径穿越、解压比和总大小保护。
- 使用临时受限文件与 streaming parse；成功/失败都清理。
- external ID 优先，canonical content hash 兜底，重复 import 可安全重放。
- 原始文件不长期保存；逐 conversation 转 compact source 后删除。
- import 是手工 bootstrap，不是 daily sync。

### 7.3 Route E

不实施。任何浏览器 extension、DOM/network capture、cookie 或私有 endpoint 提案必须新开项目和风险 ADR，不能作为本计划的 fallback。

---

## 每阶段共同回归矩阵

| 风险 | 必跑验证 |
| --- | --- |
| 日记写错日期 | review save coordinator、midnight rollover、explicit dateKey tests |
| 历史被写 | reviews service 昨日宽限/旧日拒绝、Calendar read-only tests |
| 跨用户泄露 | API service ownership tests；MCP principal/scope tests |
| stale 洞察 | hash/version/invalidation/delete integration tests |
| 模型故障拖垮主应用 | timeout/invalid JSON/unconfigured provider tests + main CRUD smoke |
| prompt injection | adversarial diary/digest/export fixtures |
| 成本失控 | input projection caps、same-hash no-call、usage recording tests |
| 误导产品文案 | UI tests 禁止“自动同步全部 ChatGPT 历史”和虚假分数 |

## 发布与回滚

- 所有新表先部署，旧代码可忽略它们；这是 migration 级回滚策略。
- API 新能力置于 user-level feature flag；默认关闭，先测试用户启用。
- 新 Week panel 与旧 summary 并行一个发布周期；失败时切回旧 view，不删除新表。
- MCP endpoint 与 OAuth metadata 在 staging 完成 host evaluation 后才公开。
- 回滚应用版本时不 drop 新表；停止写入即可。数据清理由后续显式、可审查 migration 完成，绝不紧急 destructive rollback。
