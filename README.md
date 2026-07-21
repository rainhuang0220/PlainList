# PlainList 平原

> 面向个人习惯养成与任务规划的多尺度时间管理平台 —— 当下 · 日 · 周 · 月 · 年，一站式追踪你的每一秒。
PlainList 是一个前后端分离的单仓库 TypeScript 项目。围绕「时间序列」组织信息，覆盖**当下、今日、周回顾、月度、年度**五个尺度；集成**终端式登录**、**AI 速记**（口语化输入 → 结构化今日清单）、**用户画像**（AI 从日回顾中提炼特质与证据）、以及 **3D / 星系 / 群岛式日回顾可视化**，并通过**插件市场**扩展主题与 widget。
## 核心特性
- **多尺度时间视图**：当下时钟 · 今日计划 · 周回顾 · 月度追踪 · 年度日历，滚动切换
- **计划与打卡**：习惯（每日重复）+ 任务（带 scheduledDate 的待办）；按时间段（清晨/上午/下午/晚上）自动分组
- **AI 速记（BYOK）**：口语化一句话 → 结构化今日清单；支持 OpenAI / Anthropic 兼容协议，用户自带 Key
- **日回顾可视化**：`ArchipelagoChart` / `ArchipelagoAbstract` / `ArchipelagoRelief3D` / `GalaxySystem` / `PlanetTerrainViewer`，重型 3D 视图按需异步加载
- **用户画像**：AI 周期性分析日回顾，提炼特质（trait）+ 证据（evidence）+ 影响比与置信度
- **插件市场**：manifest 驱动，不执行任意远程 JS；支持 theme / widget / language 三类
  - 内置 `theme-pack`（8 套主题：Default / Dark / Warm / Cool / High Contrast / Solarized / Nord / Rose）
  - widget 插件：`fishtime`（应用使用时长追踪）、`focus-bay`（YOLO26 手机监测）
- **移动端**：基于 Capacitor 打包 Android / iOS，复用同一套 Web 代码
- **安全**：JWT + bcrypt 密码加密；登录失败写入 fail2ban 兼容审计日志；CORS 白名单
## 技术栈
| 层 | 技术 |
|---|---|
| 前端 | Vue 3.5 · Vite 7 · TypeScript 5.9 · Pinia 3 · ECharts 6 · Three.js · matter-js · Capacitor 8 |
| 后端 | Express 5 · MySQL2 · Zod 4 · bcryptjs · jsonwebtoken · cors · dotenv |
| 共享 | TypeScript · Zod schemas（前后端复用类型与校验） |
| 数据库 | MySQL（显式 migrations 001–006 + seeds） |
| 工程化 | vitest · eslint · vue-tsc · tsx · concurrently |
## 仓库结构
```text
plainlist/
├─ apps/
│  ├─ web/                    # Vue 3 + Vite + TypeScript（前端 + Capacitor 移动端）
│  │  ├─ src/app/             # 应用壳、入口
│  │  ├─ src/features/        # Pinia stores：auth / plans / checks / reviews / plugins / locale / user-profile
│  │  ├─ src/widgets/         # sections（时钟/计划/周/月/年/日回顾 3D）/ auth / plugins / settings
│  │  ├─ src/shared/          # API client / i18n / 样式
│  │  ├─ android/ ios/        # Capacitor 原生工程
│  │  └─ capacitor.config.ts
│  └─ api/                    # Express + MySQL + TypeScript（后端 + AI 网关）
│     └─ src/modules/         # auth / plans / checks / reviews / ai-intake / ai-shared / user-profile / plugins(marketplace)
├─ packages/
│  ├─ shared/                 # 共享 types / constants / schemas / date helpers / intake 解析
│  ├─ db/                     # migrations / seeds / schema snapshot
│  └─ config/                 # 共享 tsconfig / eslint config
├─ plugins/                   # widget 插件源码（focus-bay）
├─ data/widgets/              # widget 运行缓存（gitignored，每机独立）
├─ deploy/                    # fail2ban 配置（filter / jail）
└─ docs/                      # architecture / plugins / health-check / fail2ban / 参赛说明
```
## 快速启动
> 所有 npm 命令都在仓库根目录执行，不要 `cd apps/api` 后再 `npm run dev`。
### 前置条件
- Node.js `^20.19.0` 或 `>=22.12.0`
- 本机 MySQL（账号、密码、端口准备好）
### 第一次启动
```bash
cd plainlist
npm install
cp apps/api/.env.example apps/api/.env
# 编辑 DB_* 与可选的 AI_* 默认配置
npm run db:migrate
npm run db:seed
```
### 日常启动
```bash
npm run dev
```
浏览器打开 `http://localhost:5173`。
- 终端登录界面**固定英文**（终端美学）
- 登录后工作台界面**默认全中文**（`zh-CN`）
- 展示账号：`rainhuang` / `rainhuang`（详见下方[展示用预设配置](#展示用预设配置)）
## 展示用预设配置
本项目用于演示，已预设好账号与 AI 模型配置，直接使用即可。
### 登录
在终端登录界面输入：
```text
pl cd rainhuang
rainhuang        # 下一行提示 passphrase 时输入密码
```
> 也可直接输入 `cd rainhuang`（`pl ` 前缀可省略）。账号信息：用户名 `rainhuang`，密码 `rainhuang`。
### AI 速记默认 Key（推荐部署方配置）
为避免评委在演示时手动填 API Key，服务端可在 `apps/api/.env` 集中配置一组默认 Key，**注册时自动写入该用户的 `user_settings.ai_settings`**：
| 变量 | 作用 |
|---|---|
| `AI_USER_DEFAULT_API_KEY` | DashScope / SiliconFlow 等的 API Key（**唯一必填项**） |
| `AI_USER_DEFAULT_BASE_URL` | OpenAI 兼容接口地址，如 `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| `AI_USER_DEFAULT_MODEL` | 速记 + 画像共用模型，如 `qwen3.7-plus` |
| `AI_USER_DEFAULT_INTAKE_MODEL` | 仅速记用更快模型；留空则与上面一致 |
| `AI_USER_DEFAULT_PROVIDER` | `openai` 或 `anthropic`（默认 `openai`） |
> 留空 = 不预置，仍走 `AI_REVIEW_API_KEY` 服务端兜底（已有逻辑）。
> Demo 用户（`admin/admin`）会在 `npm run db:seed` 时被一并写入。
## 常用命令
```bash
# 开发
npm run dev              # 并行启动 shared / api / web
npm run dev:web
npm run dev:api
npm run dev:shared
# 构建 / 校验
npm run build            # 顺序构建 shared → api → web
npm run lint
npm run test
npm run typecheck
# 数据库
npm run db:migrate
npm run db:seed
# 移动端
npm run mobile:android   # 构建 web + cap sync + 打开 Android Studio
npm run mobile:ios       # 构建 web + cap sync + 打开 Xcode
```
## AI 速记与模型配置
### BYOK（Bring Your Own Key）
多用户效率工具的推荐做法：
1. **用户级设置（推荐）**：每人填自己的 `provider / baseUrl / model / apiKey`，存 `user_settings.ai_settings`，服务端按用户解析。
2. **服务端默认（可选）**：管理员在 `apps/api/.env` 配一组默认 Key，用户未填个人 Key 时回退使用。
3. **安全惯例**：GET 接口只返回 Key 是否已配置 + 脱敏预览，**从不**把完整 Key 发回前端。
在工作台右上角点击**用户名** → **用户设置** → 「AI 速记」页签配置个人模型。不配个人 Key 时使用 `.env` 里的服务端默认（若已填写）。
### AI 配置解析流程
```text
POST /api/ai-intake
  → 读取 user_settings.ai_settings
  → 用户有 apiKey → 用用户配置（BYOK）
  → 否则若 .env 有 key → 用服务端默认
  → 否则 503，提示前往导航「AI」设置
```
### 支持的模型示例
- SiliconFlow + DeepSeek-V3.1-Terminus（`.env` 默认示例）
- MiniMax M3（OpenAI 兼容 / Anthropic 兼容两种写法，见 `.env.example` 注释；建议超时调至 180000ms）
`.env` 示例见 [apps/api/.env.example](apps/api/.env.example)。
## API 概览
| 路由 | 模块 | 说明 |
|---|---|---|
| `GET /api/health` | — | 存活探针，返回 `{ "ok": true }` |
| `/api/auth` | auth | 登录、`/me`、注册（管理员） |
| `/api/plans` | plans | 习惯 / 任务 CRUD |
| `/api/checks` | checks | 打卡记录（按月查询） |
| `/api/reviews` | reviews | 日回顾内容 |
| `/api/marketplace` | plugins | 插件搜索 / 详情 / 安装 / 卸载 / 发布；主题激活 |
| `/api/ai-intake` | ai-intake | 速记生成；`/settings` GET/PUT/DELETE；`/settings/test` 连通性测试 |
| `/api/user-profile` | user-profile | 画像列表 / `/analyze` 触发分析 / trait 更新 / 证据查询 |
## 插件生态
### 目前有哪些插件？
| 插件 | 类型 | 说明 |
|---|---|---|
| `theme-pack` | theme | 8 套主题，manifest 驱动 |
| `fishtime` | widget | 应用使用时长追踪（实时监控活动窗口、图表、XLSX/CSV/PDF 导出） |
| `focus-bay` | widget | YOLO26n 手机监测：摄像头对准桌面，检测到手机即计为分心，统计专注时长与连击 |
### widget 如何运行？
```text
用户在插件市场点击安装
  → API installWidget() 确保本地有代码
      · focus-bay：从仓库内 plugins/focus-bay 复制（manifest.sourcePath，无需 git）
      · fishtime：首次 git clone 到 data/widgets/fishtime/（manifest.repoUrl）
  → 执行 start.sh 在独立端口启动 sidecar 进程
  → 前端导航栏出现 widget 按钮
  → 点击后用 iframe 加载 manifest.widgetUrl
```
**缓存复用**：代码缓存在 `data/widgets/<id>/`，再次安装或 API 重启时**复用缓存**，只执行 `start.sh`。需要更新 git 类 widget 代码时：
```bash
WIDGET_UPDATE=1 npm run dev:api
```
### 不用 git clone 的办法
按优先级：
1. **manifest `sourcePath`**：widget 源码直接放在仓库 `plugins/<id>/`，安装时复制（focus-bay 已采用此方式）
2. **手动 vendoring**：把 widget 仓库解压到 `data/widgets/<id>/`，确保有 `start.sh`
3. **Release 包**：manifest 增加 `archiveUrl` + `archiveSha256`，下载校验解压（适合生产，待实现）
4. **纯前端 widget**：静态页放进 `apps/web/public/widgets/`，用相对 URL，无子进程
更完整的插件生态方向见 [docs/plugins.md](docs/plugins.md)。
## 健康检查
`GET /api/health` 返回 `{ "ok": true }`。
用途：确认 API 进程已启动、端口可达；Docker / K8s / 负载均衡的**存活探针（liveness）**；部署脚本在拉起前端前探测后端是否 ready。
它**不**检查数据库或 AI 上游——那些属于更深的 readiness 检查（可按需扩展）。详见 [docs/health-check.md](docs/health-check.md)。
## Fail2ban（可选，部署时用）
API 会把登录失败写入 `logs/auth-audit.log`（格式兼容 fail2ban）。本地开发可忽略；上 Linux 服务器后按 [docs/fail2ban.md](docs/fail2ban.md) 复制 `deploy/fail2ban/` 配置即可。
```bash
# 关键环境变量（apps/api/.env）
AUDIT_LOG_ENABLED=true
AUDIT_LOG_PATH=/var/log/plainlist/auth-audit.log
TRUST_PROXY=true   # 在 Nginx 后取真实客户端 IP
```
## 移动端
基于 [Capacitor](https://capacitorjs.com/) 将 Web 端打包为 Android / iOS 原生应用：
```bash
npm run mobile:android   # 构建并打开 Android Studio
npm run mobile:ios       # 构建并打开 Xcode
```
`apps/web/src/app/main.ts` 在原生平台会异步加载 SplashScreen / StatusBar / Keyboard 插件；CORS 已自动放行 `capacitor://localhost` 与 `localhost` 来源。详见 [apps/web/capacitor.config.ts](apps/web/capacitor.config.ts)。
## 数据库
显式 migrations 位于 [packages/db/migrations/](packages/db/migrations/)：
| 文件 | 内容 |
|---|---|
| `001_init.sql` | users / plans / checks / user_settings |
| `002_plan_scheduled_date.sql` | plans.scheduled_date（任务日期） |
| `003_plugin_registry.sql` | plugins / plugin_versions（插件市场） |
| `004_plan_description.sql` | plans.description |
| `005_daily_reviews.sql` | daily_reviews（日回顾） |
| `006_user_profile.sql` | user_profile_traits / evidence / runs（用户画像） |
种子数据：`001_demo.ts`（demo 账号 admin/admin）、`002_marketplace.ts`（内置插件清单）。
## 从旧目录迁移
若你之前用 `PlainList/` 或 `PlainList-original/`：
1. 确认 MySQL 数据可复用（表结构兼容，可直接连同一库）
2. 把 `apps/api/.env` 复制到本目录对应位置
3. 若有 widget 缓存，可复制 `data/widgets/` 过来
4. 删除旧的 `PlainList/`、`PlainList-original/` 子目录即可
## 设计取舍
- 前后端分别构建与部署；API **不再**托管前端静态文件（比 original 更清晰）
- 插件走 manifest + config，**不**执行任意远程 JS（比 original 更安全）
- 日回顾可视化（Galaxy / Archipelago / 3D Relief）保留在 [apps/web/src/widgets/sections/](apps/web/src/widgets/sections/)，重型 3D 视图用 `defineAsyncComponent` 做代码分割
- 终端登录固定英文，工作台默认 `zh-CN`（语言切换方案见下方 TODO）
## TODO
- [ ] **语言切换方案待确认**：是否在导航恢复 EN/中文切换、是否恢复 `lang-zh` 类语言插件、还是账号级 locale 偏好，尚未定案。
## 同系列项目
来自「个人效率工具箱」系列：
- [Flow](https://github.com/rainhuang0220/Flow) — 视频会议，基于 WebRTC + SFU 的学习/原型项目
## 相关文档
- [架构说明](docs/architecture.md)
- [插件生态](docs/plugins.md)
- [健康检查](docs/health-check.md)
- [Fail2ban](docs/fail2ban.md)
- [参赛名称与开源组件说明](docs/competition-name-and-oss-usage.md)
