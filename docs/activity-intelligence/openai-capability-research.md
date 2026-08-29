# OpenAI / ChatGPT 活动数据能力边界审计

> 审计日期：2026-08-30；用途：为 PlainList Activity Intelligence 的 Route A–E 选型提供事实边界。本文不是实现方案或 ADR。

## 审计口径

本文只采用 OpenAI 的公开一手文档，并按任务约束将来源限定为 `developers.openai.com`、`platform.openai.com` 和 `learn.chatgpt.com`。没有使用 `help.openai.com`、社区文章、博客、逆向得到的私有接口或浏览器网络请求。

文中的 **NOT AVAILABLE AS A SUPPORTED PUBLIC API** 表示：截至审计日，OpenAI 在上述公开文档目录和 API reference 中没有提供相应的受支持公共接口。它不表示 OpenAI 内部不存在私有实现，也不授权 PlainList 调用未公开接口。由于官方文档会变化，进入实现前应重新核查。

## 结论摘要

1. 面向普通个人用户或用户 OAuth 授权的第三方应用，**不存在文档化的公共 API，可以列出并逐日增量读取该用户在 ChatGPT Web、桌面端或移动端的历史 conversations**。**NOT AVAILABLE AS A SUPPORTED PUBLIC API**。
2. 当前 ChatGPT Plugins / Apps SDK 路径可以用远程 MCP 向 ChatGPT 暴露 PlainList 的读取和写入工具，并支持 OAuth 2.1、权限隔离和写操作确认。它适合“在当前任务中按需读写 PlainList”，不等于 ChatGPT 历史同步 API。
3. 官方文档没有给远程 MCP 工具提供“普通 ChatGPT 会话结束后自动调用”的回调。**NOT AVAILABLE AS A SUPPORTED PUBLIC API**。后台或周期执行属于单独配置的 scheduled task，而不是普通会话自然结束事件。
4. Responses API 的 Conversations 是开发者通过 API 创建、持有 ID 并传给 Responses API 的状态对象。它能管理 PlainList 自己发起的 API 会话，不能读取 ChatGPT 产品中的既有聊天历史。后者 **NOT AVAILABLE AS A SUPPORTED PUBLIC API**。
5. 在允许使用的官方文档范围内，ChatGPT data export 的归档内容、文件名、schema、完整性、申请频率和交付时延均无法核实。因此它只能作为待样本验证的手工导入候选，不能作为 daily sync。daily export API / webhook **NOT AVAILABLE AS A SUPPORTED PUBLIC API**。
6. GPT Actions 仍有当前官方文档，支持 Custom GPT 调用第三方 REST API、每用户 OAuth 和 consequential-action confirmation。它是受支持但较窄的 Custom GPT 集成面，不是 ChatGPT 历史读取接口。

## 1. ChatGPT 产品历史 conversations

### 普通用户边界

OpenAI 的 API reference 为 Responses API 的 Conversations 列出以下操作：创建、按 ID 获取、更新、删除，以及在已知 conversation 内创建、获取、删除和列出 items；它没有“列出某个 ChatGPT 用户的产品 conversations”端点，也没有 ChatGPT Web/客户端历史的增量游标、更新时间过滤器或 webhook。[Conversations API reference](https://developers.openai.com/api/reference/typescript/resources/conversations)

ChatGPT 的公开文档总目录列出了 chats、projects、plugins、scheduled tasks、Enterprise Analytics API 和 Compliance API 等产品能力，但没有面向普通用户的 ChatGPT 历史 conversations API。[ChatGPT documentation index](https://learn.chatgpt.com/llms.txt)

据此，本次官方文档审计的结论是：

> 对普通个人用户或用户 OAuth 授权的第三方应用，列出并逐日增量读取 ChatGPT Web、桌面端或移动端历史 conversations：**NOT AVAILABLE AS A SUPPORTED PUBLIC API**。

因此，PlainList 不应使用 ChatGPT cookie、未公开 endpoint、HAR 逆向或 DOM scraping 来伪装成受支持同步方案。

### Enterprise Compliance API 不是普通用户路径

ChatGPT Enterprise 另有管理员治理用途的 Compliance API。公开文档描述了基于 Enterprise Compliance API key 和 workspace / organization ID 的 append-only 日志获取，可按时间点继续列出和下载 JSONL 日志文件。该接口服务于安全、法律、审计、留存和调查，不是用户 OAuth 授权的个人历史接口。[Compliance API and audit events](https://learn.chatgpt.com/docs/enterprise/compliance-api)

该页面把精确的事件覆盖范围和 schema 指向本次来源策略不允许使用的另一官方域名。由允许来源无法确认它是否包含完整 conversation 正文、所有 ChatGPT 客户端聊天或足以恢复对话树。因此：

- “Enterprise 管理员存在持续审计日志接口”是已证实能力；
- “它能完整同步用户 ChatGPT conversation 历史”在本次审计中为 **未知**；
- 它不能作为 PlainList 面向普通用户的默认 Route。

## 2. Plugins / Apps SDK / 远程 MCP

OpenAI 当前文档把 Apps SDK 能力收敛在 Plugins 文档下。远程 MCP server 定义工具、实施认证、返回结构化数据并对外部系统执行动作；ChatGPT 可以在 Web、桌面端和移动端的受支持 Chat / Work 表面使用这些插件。[Plugins overview](https://learn.chatgpt.com/docs/plugins)

### PlainList read / write tools

官方工具设计文档明确要求先把用户任务映射为读取、写入和外部动作，再按权限、安全性和确认要求拆分工具。示例包括 `list`、`get`、`create`、`update`、`archive`；工具可以用 `readOnlyHint`、`destructiveHint` 和 `openWorldHint` 表达风险，但这些 annotations 不能代替服务端授权、校验和确认。[Define tools](https://developers.openai.com/plugins/plan/tools)

因此 Route A 可以公开形如以下 MCP tools：

- 读取：`get_goals`、`get_week_context`、`search_context`；
- 写入：`append_digest`、`append_fact`；
- 对覆盖、删除、批量修改等高风险动作另设窄工具，并要求确认。

这是受支持的工具形态。PlainList 仍须在服务端执行租户隔离、最小权限、输入校验、幂等和审计。

### OAuth

官方认证指南要求：凡工具暴露客户专属数据或写操作，就应认证用户。远程 MCP 使用 OAuth 2.1；OpenAI host client 支持受保护资源元数据发现、授权服务器发现、PKCE，以及 CIMD、DCR 或预注册 OAuth client 等接入方式。[Authenticate users](https://developers.openai.com/plugins/build/auth)

所以 PlainList 的每用户 OAuth 是 **受支持** 路径。用户使用 “Sign in with ChatGPT” 也不会自动授予插件数据权限或批准操作；连接仍需单独请求和批准权限。[Plugins: Sign in with ChatGPT boundary](https://learn.chatgpt.com/docs/plugins)

### 写操作确认

官方安全指南要求对不可逆动作保留 human confirmation，并说明 host 会对 destructive actions 显示确认提示。开发者仍需在服务端校验授权和参数；不能把 host confirmation 当作唯一安全层。[Security & Privacy](https://developers.openai.com/plugins/guides/security-privacy)

连接测试也要求覆盖读操作、后续问题、写入授权和确认行为。[Connect and test your plugin](https://developers.openai.com/plugins/deploy/connect-chatgpt)

结论：普通追加类操作可以设计为低风险、幂等写入；删除、覆盖、外部传播或不可逆动作应保持逐次确认。最终是否提示及其表现仍受 host、用户权限和 workspace policy 控制。

### 自动调用边界

安装插件后，官方使用路径是“开始新 chat 并要求 ChatGPT 使用插件”；也可以直接描述任务，让 ChatGPT 在该任务中选择合适工具，或用 `@` 显式指定插件。[Install and use a plugin](https://learn.chatgpt.com/docs/plugins)

插件包可以另带 hooks 或 scheduled task templates，但文档只把 hooks 描述为“在已配置 lifecycle points 运行的命令”，没有把“普通 ChatGPT chat 结束”定义为远程 MCP 工具的生命周期事件。Scheduled tasks 则是用户另行创建、按 schedule 或 app event 在后台运行的工作流。[Scheduled tasks](https://learn.chatgpt.com/docs/automations)

因此：

> 远程 MCP 在每个普通 ChatGPT conversation 结束后自动调用 PlainList：**NOT AVAILABLE AS A SUPPORTED PUBLIC API**。

Route A 可以依赖当前消息中的模型工具选择、用户显式调用，或另行配置的 scheduled task；不能承诺“所有普通会话结束即自动归档”。

## 3. Responses API 的 conversation / state 对象

Responses API 本身支持有状态交互。官方指南要求先用 `conversations.create()` 创建 durable conversation object，再把该 ID 传给 `responses.create()`；后续 input 和 output items 会加入该对象。Conversation 可以跨 API session、device 或 job 使用。[Conversation state guide](https://developers.openai.com/api/docs/guides/conversation-state) [Create a model response](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)

API reference 只提供按已知 conversation ID 的 CRUD 和该 conversation 内的 items list，没有跨 conversation 的 list endpoint，更没有把 ChatGPT 产品账号或 ChatGPT chat ID 映射到该对象的接口。[Conversations API reference](https://developers.openai.com/api/reference/typescript/resources/conversations)

所以应把两类数据严格分开：

- **PlainList / API-originated conversation**：由 PlainList 创建 API conversation，保存其 ID，并通过 Responses API 继续；Route B 可完整记录输入、输出和派生摘要。
- **ChatGPT product conversation**：用户在 ChatGPT Web、桌面端或移动端形成的产品聊天；Responses Conversations 文档不提供读取或导入它们的能力。

> 用 Responses API Conversations 读取 ChatGPT 产品历史：**NOT AVAILABLE AS A SUPPORTED PUBLIC API**。

该结论不否定 API conversation 的持久化价值；它只禁止把 API 状态对象误当成 ChatGPT 产品历史接口。

## 4. ChatGPT data export

在本次允许的官方来源中，ChatGPT 文档索引没有 data export 页面，也没有公开 export endpoint、增量参数、webhook、归档 schema 或稳定文件契约。[ChatGPT documentation index](https://learn.chatgpt.com/llms.txt)

因此，本次审计无法用允许来源确认以下信息：

- 导出包是否必然包含 `conversations.json`；
- conversation 数据的字段、树结构、附件、删除记录和完整性；
- schema 是否有版本标识或兼容承诺；
- 用户可请求导出的频率与交付 SLA；
- 是否存在适合机器 daily sync 的增量导出。

这些项均标记为 **未知**。项目需求中提到的 `conversations.json` 应视为待真实、获授权样本验证的假设，而不是本文已证实的官方契约。

> 通过官方 data export API / webhook 执行 daily sync：**NOT AVAILABLE AS A SUPPORTED PUBLIC API**。

Route D 只能作为条件式的 historical bootstrap、手工导入或灾难恢复路径。实现前必须先取得用户主动提供的真实导出样本，记录 schema 版本，编写容错解析和幂等去重，并允许重复导入。它不应承担每日自动同步。

## 5. GPT Actions 与 OAuth 的当前地位

GPT Actions 仍在当前官方开发者文档中。它存放在 Custom GPT 内，通过 OpenAPI schema 连接第三方 REST API；ChatGPT 根据用户问题判断并执行适合的 API call。[GPT Actions introduction](https://developers.openai.com/api/docs/actions/introduction)

Actions 支持 None、API key 和 OAuth 三种认证。OAuth 是每用户路径：用户在消息中触发 action 后完成 sign-in，ChatGPT 随后在请求中携带 token。[GPT Actions authentication](https://developers.openai.com/api/docs/actions/authentication)

Actions 还支持 `x-openai-isConsequential`。标记为 consequential 的操作总是要求用户确认，不能设为 always allow；未标记时，GET 默认为非 consequential，其他方法默认为 consequential。官方也要求 action 描述不要诱导模型执行用户未请求的动作。[GPT Actions production notes](https://developers.openai.com/api/docs/actions/production)

由此得出：

- GPT Actions 是 **当前受支持** 的 Custom GPT → PlainList REST 集成路径；没有证据可把它标为 deprecated。
- 它可以承载显式“保存这段对话到 PlainList”或读取目标的动作，并使用每用户 OAuth。
- 它依赖 Custom GPT 内的用户消息、模型选择和确认，不提供对账户历史 conversation 的列表或增量读取，也不提供普通 chat 结束回调。
- 对新集成，Plugins / remote MCP 提供更通用的工具、认证和可选 UI 组合；Actions 可保留为 Custom GPT 专用兼容路径。

## 6. Route A–E 支持等级

等级定义：

- **受支持**：官方文档直接支持核心机制。
- **部分受支持**：核心机制可用，但不能满足被动、全量或自动同步承诺。
- **条件式 / 手工**：缺少可依赖的自动接口或稳定契约，需用户动作和样本验证。
- **非官方实验**：不是 OpenAI 支持的集成面，只能在明确批准后隔离试验。

| Route | 支持等级 | 官方能力与硬边界 | Phase 0 定位 |
| --- | --- | --- | --- |
| **A — ChatGPT Plugin / Apps SDK / remote MCP 双向集成** | **部分受支持，推荐** | read/write tools、OAuth 2.1、权限和写确认受支持；全历史读取与普通 chat 结束后自动调用不受支持。 | 实现最小只读工具和幂等 `append_digest`；文案明确“按需保存”，不得宣称自动捕获所有聊天。 |
| **B — PlainList 内使用 Responses API 产生一方会话** | **受支持，推荐** | API 创建的 conversation state 和 items 可管理；无法读取 ChatGPT 产品历史。 | 对 PlainList 自己发起的新对话保存稳定 ID、原始事件和派生摘要，作为可靠的自动采集主路径。 |
| **C — 显式 `save this conversation to PlainList`** | **受支持，推荐兜底** | 可由 remote MCP tool 或 GPT Action 执行；用户意图、OAuth、参数校验和必要确认均有官方路径。工具接收当前任务生成的 digest，不应尝试再读取账户历史。 | 作为 ChatGPT 产品侧最可靠的低摩擦入口；写入须幂等并返回可核对结果。 |
| **D — ChatGPT Data Export importer** | **条件式 / 手工** | 允许来源未提供稳定归档 schema 或增量 export API；daily sync 不受支持。 | 仅做历史 bootstrap / 手工恢复候选；先以真实授权样本验证，再决定是否实现。 |
| **E — 浏览器扩展 / DOM 或网络层采集** | **非官方实验，不进入默认方案** | 它不是受支持的 OpenAI conversation API；易受 UI、权限、隐私和维护变化影响。 | Phase 0 不实现。只有在单独风险评审、用户明确授权和可撤回机制完成后，才可做隔离实验；禁止 cookie/私有 endpoint 方案。 |

Enterprise Compliance API 不纳入 A–E 的普通用户主线。若未来服务 Enterprise workspace，应单独立项，先核实 entitlement、管理员授权、事件覆盖范围、留存和 schema，再决定是否新增企业专用 Route。

## 对 Phase 0 的约束

1. 把“ChatGPT 产品历史同步”和“PlainList 自己的 API 会话记录”建模为不同来源，禁止共享未经区分的 cursor 或外部 ID 语义。
2. Route A / C 只接受用户当前任务中主动产生的结构化摘要或事实；不要设计后台 ChatGPT history poller。
3. Route B 保存 PlainList 创建的 conversation ID，并以 API item / response ID 做幂等边界。
4. Route D 在获得真实导出样本前只保留 importer seam 和风险记录，不承诺 `conversations.json` schema。
5. Route E 保持关闭；不得把私有 endpoint、cookie 或 DOM scraping 当作生产 fallback。
6. UI 和文档必须区分“自动记录 PlainList 内对话”“按需保存 ChatGPT 当前内容”和“手工导入历史”，避免误导用户。

## 仍不确定、需后续验证的事项

- ChatGPT data export 的现行归档文件、schema、完整性、频率和交付 SLA：允许来源中没有文档。
- Enterprise Compliance API 是否提供完整 conversation 正文、对话树和附件：允许页面把精确覆盖范围指向本次来源策略之外，故未知。
- 各 ChatGPT plan、workspace policy 和地域对自建 plugin / remote MCP 的具体可用性：发布前需按目标账号和官方 feature-maturity 文档实测。
- Host 对低风险追加写入的实际确认 UX、是否允许 chat 级持久授权：官方给出安全原则，但最终表现受 host 和 workspace policy 影响，需在测试环境验证。
- Plugin bundle 的 hooks 可用 lifecycle points：公开概览没有定义普通 ChatGPT chat-end hook；不得在获得明确官方契约前依赖它。
