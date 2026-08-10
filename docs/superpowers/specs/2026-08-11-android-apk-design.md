# PlainList Android APK 发布设计规格

**日期：** 2026-08-11  
**状态：** 待实现（设计已确认）  
**范围：** Capacitor 正式签名 APK + 本地下载页 Android 区块 + 手机端功能裁剪与本地通知  
**非目标：** 本次不上架 Google Play / 国内商店；不做服务端推送；不做 Fish Time / Focus Bay；不重写原生 UI

---

## 1. 背景与目标

### 1.1 现状

- 产品栈：Vue 3 + Vite + Pinia 前端（`apps/web`）+ Express API（`apps/api`）+ Capacitor 8 + Electron macOS。
- 官网下载页：`http://175.24.134.228/`（源文件 `apps/web/scripts/download-page/index.html`），目前仅 macOS DMG + 一键 `install.sh`。
- Capacitor 已配置：`apps/web/capacitor.config.ts`，`appId: com.plainlist.app`，`webDir: dist`。
- 本地存在 `apps/web/android/`，但被根 `.gitignore` 忽略；无 release 签名；`versionName` 仍为 `1.0`，与产品 `2.0.0` 不一致。
- 移动端脚本已有：`npm run mobile:android`（构建 + sync + 打开 Android Studio），**没有**一键打 release APK / 上传服务器的流程。

### 1.2 目标（本次必须交付）

1. 产出可侧载的 **正式签名 release APK**（非 debug）。
2. 上传到服务器 ` /downloads/`，并在下载页增加 **Android 独立区块**（布局方案 A）。
3. 手机端可用：**核心业务**（登录、计划、打卡、复盘、AI 等）+ **主题色切换** + **本地到期提醒**。
4. **插件市场框架代码保留**；手机端隐藏市场入口与 widget（Fish Time / Focus Bay）入口。
5. 结构上为以后上架（AAB + 同一密钥）与推送（FCM 等）留扩展点，但本次不实现。

### 1.3 受众与分发策略

| 阶段 | 策略 |
|------|------|
| 现在 | 自己 + 朋友侧载（A+B）：官网下 APK，开启「未知来源 / 允许安装」 |
| 以后 | 应用商店（C）：同一 keystore 打 AAB；本次只保证密钥与 `applicationId` 不挡路 |

### 1.4 成功标准

- [ ] 真机从 `http://175.24.134.228/` 下载 APK 并能安装打开。
- [ ] 使用演示账号登录，核心列表/打卡可用，API 指向 `http://175.24.134.228`。
- [ ] 主题可在手机端切换且刷新后仍生效（服务端 `active_theme`）。
- [ ] 带 `scheduledDate` + `time` 的 todo 能在到点弹出本地通知（已授权前提下）。
- [ ] 手机端看不到插件市场入口，也看不到 Fish Time / Focus Bay 导航按钮。
- [ ] keystore **不进 git**；文档说明备份位置。
- [ ] `SHA256SUMS.txt` 包含 APK 校验和。

---

## 2. 决策摘要（已确认）

| 议题 | 决定 |
|------|------|
| 技术路线 | Capacitor 包装现有 Vue（不选 PWA / RN / Flutter） |
| 签名 | Release keystore 自建，密钥留本地，可复用于日后上架 |
| 功能裁剪 | 核心 + 主题 + 本地通知；市场/widget 隐藏但框架保留 |
| 通知 | 本地提醒先做；抽象接口预留推送 |
| 下载页 | 方案 A：macOS 区块下方独立 Android 区块 |
| API | 构建时烘焙 `VITE_API_BASE_URL=http://175.24.134.228` |

---

## 3. 系统架构

```text
┌─────────────────────────────┐
│  Android APK (Capacitor)    │
│  WebView ← dist (Vue SPA)   │
│  Local Notifications plugin │
│  Preferences (token)        │
└──────────────┬──────────────┘
               │ HTTPS/HTTP JSON
               │ Origin: https://localhost
               ▼
┌─────────────────────────────┐
│  175.24.134.228             │
│  nginx :80                  │
│   /          → 下载页        │
│   /downloads → DMG + APK    │
│   /api       → API :3001    │
│  Web 完整站 :8086（已有）    │
└─────────────────────────────┘
```

### 3.1 构建时 vs 运行时

| 项 | 时机 | 说明 |
|----|------|------|
| API Base URL | **构建时** | Vite `define` → `__API_BASE_URL__`；APK 内写死公网地址 |
| 主题 | 运行时 | 登录后 `loadActiveTheme()`；切换走 `POST /api/marketplace/active-theme` |
| 本地通知排程 | 运行时 | 登录/计划变更后根据计划列表排程 |
| 平台裁剪 | 运行时 | `Capacitor.isNativePlatform()` / `getPlatform() === 'android'` |

### 3.2 与桌面端关系

- **共享：** 同一套 Vue 业务代码与同一后端。
- **不共享：** Electron 主进程、FishTime 本机监测、Focus Bay 摄像头 sidecar、macOS 公证/DMG 流程。
- **条件编译策略：** 不以构建拆两套 bundle 为主；以运行时平台开关隐藏入口。允许少量 `if (isNative)` 分支（鉴权存储、通知、导航可见性）。

---

## 4. 功能规格

### 4.1 核心功能（手机端必须可用）

与 Web / macOS 客户端一致，通过公网 API：

- 注册 / 登录 / 登出
- 多尺度视图：当下 / 今日 / 周 / 月 / 年（现有 `s1`–`s5`）
- 计划：`habit` | `todo`（`packages/shared`：`PlanType`，`time` 为 `HH:MM`，todo 的 `scheduledDate` 为 `YYYY-MM-DD`）
- 打卡、日回顾、AI 速记、用户画像等现有 Web 能力

不做手机端信息架构大改；首版以「可装可用」为准，不做专门移动导航重构（除非现有布局在窄屏严重不可用——实现阶段仅做最小 CSS/触控修复）。

### 4.2 主题色切换（必须保留）

**现状：**

- 主题定义在 `theme-pack` 插件 manifest（种子：`packages/db/seeds/002_marketplace.ts`）。
- ID：`default` | `dark` | `warm` | `cool` | `hc` | `solarized` | `nord` | `rose`。
- 应用：`useMarketplaceStore.applyVars()` 写 CSS 变量到 `document.documentElement`（`--bg`、`--surface`、`--dark`、`--mid`、`--muted`、`--faint`、`--faint2`）。
- 持久化：服务端 `user_settings.key_name = active_theme`（`USER_SETTING_KEYS.activeTheme`）。
- UI：目前主要在 `Marketplace.vue` 的主题色板（依赖 `themePackInstalled`）。

**手机端要求：**

1. **不依赖打开插件市场**也能切换主题。
2. 新增独立入口（推荐放在现有设置/个人区域；若无合适入口，在顶栏增加「主题」按钮，仅原生或全端均可——**优先全端可用**，避免两套逻辑）。
3. 复用 store API：`loadActiveTheme` / `previewTheme` / `saveTheme`（或等价封装），**不要**复制一套主题状态机。
4. 若用户未安装 `theme-pack`：登录后对原生端 **静默确保 theme-pack 已安装并启用**（调用现有 marketplace install/enable API），或服务端种子保证演示账号已装。实现时二选一，优先「登录后 ensureThemePack()」，保证任意新账号手机端也能选主题。
5. **插件市场框架与 `useMarketplaceStore` 保留**；不删除 marketplace 模块/API。

### 4.3 插件市场与 Widget（手机端隐藏）

| 入口 | 行为 |
|------|------|
| `#nav-marketplace`（`App.vue`） | `isNativePlatform()` 为 true 时 **不渲染** |
| `installedWidgets` 导航按钮 / `WidgetPanel` | 原生端 **不渲染**（即使账号在 Web 上已安装 fishtime / focus-bay） |
| `Marketplace.vue` / widget 相关代码 | **保留**，供桌面/Web 使用 |
| API `/api/marketplace/*` | **不变** |

桌面/Web 行为保持现状。

### 4.4 本地通知（必须）

#### 4.4.1 依赖

- 新增 `@capacitor/local-notifications`（与现有 Capacitor 8 对齐）。
- Android 权限：通知权限（Android 13+ `POST_NOTIFICATIONS`）；在适当时机请求（首次登录成功后或首次需要排程时）。

#### 4.4.2 排程规则（v1）

- **仅** `type === 'todo'` 且同时具备合法 `scheduledDate` + `time` 的计划。
- 触发时刻：`scheduledDate` + `time`（按 **设备本地时区** 解释）。
- 若触发时刻已过去：不排程（或取消对应通知）。
- 标题：应用名或「PlainList」；正文：计划 `name`（过长截断）。
- `habit`：v1 **不**做每日循环本地通知（避免复杂 RRULE）；可在接口注释标明后续扩展。

#### 4.4.3 同步时机

在以下时机调用 `NotificationScheduler.syncFromPlans(plans)`：

1. 登录并成功加载计划列表后
2. 计划增删改成功后
3. 登出：取消全部由本 App 排程的本地通知

#### 4.4.4 点击通知

- 打开 App（冷启动或热启动）。
- 尽力：滚动/打开今日视图；若可解析 planId 则高亮或定位（做得到就做，允许 v1 仅打开 App）。

#### 4.4.5 架构预留（推送）

```ts
// 示意：apps/web/src/shared/notifications/types.ts
interface NotificationScheduler {
  requestPermission(): Promise<boolean>;
  syncFromPlans(plans: PlanLike[]): Promise<void>;
  clearAll(): Promise<void>;
}
```

- v1 实现：`LocalNotificationScheduler`（Capacitor Local Notifications）。
- 未来：`PushNotificationScheduler` 或组合实现；业务层只依赖接口。
- **禁止**在业务 store 里直接散落 `LocalNotifications.schedule` 调用。

#### 4.4.6 已知限制（写入 README / 下载页一句即可）

- 系统省电策略、强制停止 App 可能导致提醒不准或丢失。
- 侧载阶段可接受；上架后再评估厂商推送。

### 4.5 鉴权存储（原生必须改）

**现状：** JWT 存 `sessionStorage` 键 `pl_token`（`useAuthStore.ts`）。WebView 进程被杀后会话丢失，手机体验差。

**要求：**

| 平台 | Token 存储 |
|------|------------|
| Web / 默认 | 保持 `sessionStorage`（或与现行为一致） |
| Native（Android/iOS） | `@capacitor/preferences`（已有依赖）读写 `pl_token` |

- `setAuth` / `logout` / 启动初始化统一走薄封装 `tokenStorage`。
- JWT 仍 7 天有效（服务端现状）；过期走现有 `/auth/me` 失败 → 登录页逻辑。

### 4.6 CORS / Origin

Capacitor Android `androidScheme: 'https'` → WebView Origin 为 `https://localhost`。

现有 API CORS（`apps/api/src/app.ts`）已包含 `/^https?:\/\/localhost(:\d+)?$/` 与 `/^capacitor:\/\/localhost$/`。

**实现阶段验证：** 真机登录一次；若被拒，将实际 Origin 记入 `CORS_ORIGINS` 或补充正则——**以真机抓包/日志为准**，不预加无关通配。

### 4.7 明确不做（本次）

- Fish Time、Focus Bay、任意 widget 在手机上的运行
- 插件市场手机入口与安装流
- FCM / 厂商推送 / 后台常驻服务
- Google Play / 应用宝上架材料与审核
- iOS IPA（可后续对称扩展，本次不交付）
- 更换 `applicationId`（保持 `com.plainlist.app`）

---

## 5. Android 工程与签名

### 5.1 标识与版本

| 字段 | 值 |
|------|-----|
| `applicationId` / namespace | `com.plainlist.app` |
| `appName` | `PlainList` |
| `versionName` | 与 npm 包版本对齐，当前 **`2.0.0`** |
| `versionCode` | 整数单调递增；首次 release 建议 **`20000`**（语义：2.0.0 → 20000），之后每次发版 +1 或按约定表递增 |

产物文件名：

```text
PlainList-2.0.0.apk
```

（与 DMG 命名风格一致：`PlainList-<version>[-<arch>].ext`；APK 为通用包，无 arch 后缀。）

### 5.2 Keystore

- 使用 `keytool` 生成 PKCS12/JKS release keystore（算法与有效期满足日后 Play 要求即可，例如 RSA 2048，有效期 ≥ 25 年）。
- 建议路径（**gitignored**）：

```text
apps/web/android-signing/plainlist-release.jks
apps/web/android-signing/keystore.properties
```

`keystore.properties` 示例字段（文件本身不进仓库）：

```properties
storeFile=plainlist-release.jks
storePassword=***
keyAlias=plainlist
keyPassword=***
```

- 提供 `apps/web/android-signing/keystore.properties.example`（无真实密码）进仓库。
- README 或本目录 `README.md` 写明：密钥丢失则无法更新同一 `applicationId` 的已装应用——**必须备份**。

### 5.3 Gradle 签名配置

在 `apps/web/android/app/build.gradle`：

- 若存在 `keystore.properties`，配置 `signingConfigs.release`，`buildTypes.release.signingConfig` 指向它。
- `minifyEnabled` 可保持 `false`（首版）；不强制 R8 混淆。
- Debug 构建仍用默认 debug 签名，供开发。

### 5.4 `android/` 目录是否入库

**决定：开始跟踪 `apps/web/android/`（从根 `.gitignore` 移除对应行）。**

理由：release 签名、权限清单、`versionCode` 需要可复现；仅靠 `cap add` 每次重生会导致签名补丁易丢。

配套：

- 继续 gitignore：`*.jks`、`keystore.properties`、`local.properties`、build 产物（`android/app/build/` 等——沿用 Android 模板 gitignore）。
- `npx cap sync` 仍是日常流程；不把 `dist/` 提交进 android 资产的长期拷贝策略以外的内容（遵循 Capacitor 默认：sync 从 `webDir` 复制）。

若首次提交 android 工程体积过大，实现阶段可用 `.gitattributes` / 标准 Android gitignore 收敛；**不得**提交 keystore。

### 5.5 权限（AndroidManifest）

最低要求：

- 已有：`INTERNET`
- 新增：通知相关（按 Local Notifications 插件文档合并；Android 13+ 运行时请求）
- **不**新增 `CAMERA`（Focus Bay 不做）

### 5.6 构建命令（新增）

根目录 / `apps/web` 增加脚本（名称可微调，语义固定）：

```bash
# 1) 设置 API 地址并构建 Web + cap sync
VITE_API_BASE_URL=http://175.24.134.228 npm run mobile:build

# 2) 打 release APK
npm run mobile:android:release
# 内部：cd apps/web/android && ./gradlew assembleRelease
# 将 APK 复制到可部署目录，例如：
#   apps/web/.android-release/PlainList-2.0.0.apk
```

可选环境变量：

- `VITE_API_BASE_URL`（必填于 release；缺省应失败或明确警告并拒绝打「空 base」的 release）
- `PLAINLIST_ANDROID_VERSION_NAME` / `VERSION_CODE`（可选覆盖）

**Release 门禁：** 若 `VITE_API_BASE_URL` 为空，`mobile:android:release` 必须以非零退出，防止打出只能请求相对 `/api` 的废包。

### 5.7 本机前置依赖

- JDK 17+（与 Android Gradle Plugin 匹配）
- Android SDK + Build-Tools；`ANDROID_HOME` 已配置
- 不必每次打开 Android Studio；CI/本机命令行 `gradlew` 即可（Studio 仍可用于调试）

---

## 6. 部署与下载页

### 6.1 服务器布局（扩展现有）

```text
/www/wwwroot/175.24.134.228/
  index.html
  favicon.ico
  downloads/
    PlainList-2.0.0-arm64.dmg
    PlainList-2.0.0-x64.dmg
    PlainList-2.0.0.apk          # 新增
    install.sh
    SHA256SUMS.txt               # 含 dmg + apk
```

Nginx：现有静态 `/downloads/` 即可，**无需**为 APK 改 MIME 以外的特殊配置；若下载变成在线预览，再显式 `application/vnd.android.package-archive`（实现时用浏览器实测一次）。

### 6.2 部署脚本

扩展现有 `apps/web/scripts/deploy-dmg.sh` **或** 新增 `deploy-android.sh` + 薄封装 `deploy-downloads.sh`：

推荐：

1. `deploy-android.sh`：只上传 APK + 更新 SHA256（合并进现有 sums）+ 上传 `index.html`。
2. 或把脚本改名为更中性的 `deploy-downloads.sh`，同时支持 DMG/APK（实现时二选一；**不得**在文档/仓库新增强制明文密码——沿用 `SSHPASS` / `PLAINLIST_SERVER` 环境变量）。

SHA256 生成应包含目录内所有 `PlainList-*.{dmg,apk}`。

### 6.3 下载页 UI（方案 A · 分平台区块）

文件：`apps/web/scripts/download-page/index.html`

结构：

1. Brand 区保留。
2. 主标题改为偏中性：**「下载客户端」**（或「下载 PlainList」），不再写死「仅 macOS」。
3. **区块 1 — macOS**：保留现有一键安装、双 DMG 卡、安装步骤、Apple 验证说明。
4. **区块 2 — Android**（新建，视觉与 macOS 卡一致）：
   - 标签：`Android`
   - 标题：如「安卓 APK」
   - meta：版本 **2.0.0** · 大小（`HEAD` Content-Length，同 DMG 逻辑，`id="size-apk"`）· 通用包
   - 主按钮：`下载 APK` → `/downloads/PlainList-2.0.0.apk`
   - 步骤（3 条）：
     1. 允许安装未知应用（浏览器/文件管理对应开关，文案兼顾国内 OEM 常见路径：「设置 → 安全 → 未知来源 / 安装未知应用」）。
     2. 下载并打开 APK 安装。
     3. 若被拦：到系统设置里对该安装来源点「允许」。
   - 短注：当前为自签名侧载包，非正式商店分发；以后上架后可改为商店链接。
5. 原有账号提示可保留（全页共用）。
6. 页脚技术栈可改为包含 Capacitor/Android。
7. `<title>` 改为「PlainList 平原 · 下载」之类，去掉「仅 macOS」。

**不做：** macOS/Android Tab；不把 Android 塞进三列卡片。

### 6.4 README

更新根 `README.md`：

- 下载表增加 Android APK 行与官网链接。
- 「移动端」章节补充：release 构建命令、keystore 备份提醒、功能裁剪说明（无插件市场入口、无 FishTime/Focus Bay、有本地通知与主题）。

---

## 7. 前端模块设计（实现边界）

### 7.1 新增 / 调整文件（建议路径）

| 路径 | 职责 |
|------|------|
| `apps/web/src/shared/platform.ts` | `isNative` / `isAndroid` 封装 |
| `apps/web/src/shared/auth/tokenStorage.ts` | sessionStorage vs Preferences |
| `apps/web/src/shared/notifications/types.ts` | `NotificationScheduler` 接口 |
| `apps/web/src/shared/notifications/localScheduler.ts` | Capacitor 本地实现 |
| `apps/web/src/shared/notifications/index.ts` | 工厂：native → local，web → noop |
| `apps/web/src/features/plugins/...` 或 settings 小组件 | 主题选择 UI（不打开 Marketplace） |
| `apps/web/src/app/App.vue` | 隐藏市场/widget；接入主题入口；登录后 ensureThemePack + sync 通知 |
| `apps/web/src/features/auth/model/useAuthStore.ts` | 改用 tokenStorage |
| `apps/web/src/features/plans/model/usePlansStore.ts`（或 App 层） | 变更后触发通知 sync |
| `apps/web/capacitor.config.ts` | 如需 Local Notifications 配置则补充 |
| `apps/web/scripts/deploy-android.sh`（或扩展 deploy） | 上传 APK |
| `apps/web/android-signing/*` | example + gitignore 实体密钥 |
| `apps/web/package.json` / 根 `package.json` | `mobile:android:release` 等脚本 |

### 7.2 Web 端通知

浏览器环境使用 **noop** 实现（`requestPermission` → false / `syncFromPlans` 空操作），避免桌面 Web 弹无意义通知；Electron 是否启用本地通知：**本次不启用**（noop），除非实现极低成本——默认 noop。

### 7.3 主题 UI 最低交互

- 展示 8 色主题色板（名称 + 色点）。
- 点击：预览；提供「应用」或点击即保存（二选一，优先 **点击即保存** 降低步骤）。
- 当前主题有选中态。
- 文案走现有 i18n key 或新增 `theme.*` keys（中英与现网一致风格）。

---

## 8. 测试计划

### 8.1 构建与安装

1. 无 `VITE_API_BASE_URL` 时 release 脚本失败。
2. 有 keystore 时 `assembleRelease` 成功，APK 可 `apksigner verify`。
3. 真机安装；应用名 PlainList；图标可用现有资源。

### 8.2 功能

1. 登录演示账号 → 计划列表加载。
2. 杀进程重开 → **仍保持登录**（Preferences）。
3. 切换主题 → 杀进程重开 → 主题仍在（服务端 + `loadActiveTheme`）。
4. 原生端无市场按钮、无 Fishtime/Focus Bay 按钮；桌面 Web 仍有。
5. 创建一个 2 分钟后的 todo → 授权通知 → 到点收到通知。
6. 删除该 todo → 通知取消（不再弹出）。
7. 登出 → 本地通知清空 + 需重新登录。

### 8.3 发布页

1. `http://175.24.134.228/` 可见 Android 区块。
2. APK 链接 200；大小显示非「—」。
3. `SHA256SUMS.txt` 含 apk 行且校验匹配。

### 8.4 回归

1. macOS 下载与一键安装文案未误删。
2. Web `:8086` 与 API 登录不受影响。

---

## 9. 安全与运维注意

- **禁止**将 keystore、密码、`keystore.properties` 提交到 git。
- 部署脚本中的服务器凭证仅通过环境变量传入；实现时若发现仓库内硬编码密码，应改为环境变量（可作为顺手清理，但不阻塞 APK 主线）。
- 侧载 APK 无 Play Protect 官方签名信誉；下载页需诚实说明「自签名 / 未知来源」。
- API 仍为 HTTP 明文主机时，注意明文传输风险（现状如此；本次不强制上 HTTPS，但文档标注为已知债）。

---

## 10. 里程碑建议（实现顺序）

1. **工程地基：** 去掉 android gitignore（收敛 ignore 规则）、对齐 versionName/versionCode、keystore + signingConfigs、`mobile:android:release`。
2. **运行时必备：** token Preferences、`VITE_API_BASE_URL` 门禁、CORS 真机验证。
3. **UX 裁剪：** 隐藏市场/widget；独立主题选择 + ensureThemePack。
4. **本地通知：** 插件依赖、权限、Scheduler、与 plans 同步。
5. **发布：** 打 APK → 部署脚本 → 下载页 Android 区块 → README → 真机验收。

---

## 11. 以后上架（本次只预留，不实现）

- 同一 `com.plainlist.app` + 同一 keystore 打 `bundleRelease` → AAB。
- 补充隐私政策、商店截图、通知权限说明。
- 将 `LocalNotificationScheduler` 旁路或组合 Push。
- 下载页 Android 主按钮可改为商店徽章，APK 降为「备用」。

---

## 12. 开放问题（实现期可定，不阻设计）

1. 主题入口具体放在顶栏还是设置面板——实现时按现有 UI 密度选成本最低者。
2. `versionCode` 步进表是否改为 `major*10000+minor*100+patch`——与首次 `20000` 兼容即可。
3. 是否在 Electron 启用本地通知——默认否。

---

## 13. 参考路径速查

| 项 | 路径 |
|----|------|
| Capacitor 配置 | `apps/web/capacitor.config.ts` |
| 下载页 | `apps/web/scripts/download-page/index.html` |
| DMG 部署脚本 | `apps/web/scripts/deploy-dmg.sh` |
| Auth store | `apps/web/src/features/auth/model/useAuthStore.ts` |
| Marketplace store | `apps/web/src/features/plugins/model/useMarketplaceStore.ts` |
| App 壳 / 导航 | `apps/web/src/app/App.vue` |
| API base | `apps/web/src/shared/api/useApi.ts`、`apps/web/vite.config.ts` |
| CORS | `apps/api/src/app.ts` |
| 计划类型 | `packages/shared/types/index.ts`、`packages/shared/schemas/plans.ts` |
| 主题常量 | `packages/shared/constants/plugins.ts` |

---

## 14. 变更记录

| 日期 | 说明 |
|------|------|
| 2026-08-11 | 初稿：Capacitor 签名 APK + 下载页 Android 区块 + 主题独立入口 + 本地通知 + 市场/widget 隐藏 |
