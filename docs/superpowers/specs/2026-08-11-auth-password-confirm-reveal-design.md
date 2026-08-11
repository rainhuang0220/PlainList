# Auth 注册二次确认与密码显隐设计规格

**日期：** 2026-08-11  
**状态：** 待实现（设计已确认）  
**范围：** 图形登录/注册 + 终端登录/注册的密码二次确认与明文预览  
**非目标：** 不改 `/auth/register` / `/auth/login` API；不改密码强度规则；不做生物识别 / 系统密码管理器深度集成

---

## 1. 背景与目标

### 1.1 现状

- 图形界面：`apps/web/src/components/auth/AuthGraphic.vue` — 登录/注册各一个密码框，`type="password"`，无确认、无显隐。
- 终端界面：`apps/web/src/components/auth/AuthTerminal.vue` — 登录 `passphrase`、注册 `new-pass` 各一步提交；`isPasswordState` 时用 `type="password"`，无确认、无显隐。
- 后端：`registerSchema` / `loginSchema` 仅 `username` + `password`（`packages/shared/schemas/auth.ts`）。

### 1.2 目标

1. **注册二次确认**：图形与终端（手机/桌面）注册时密码输入两遍；不一致则前端拦截，不发请求。
2. **密码显隐**：登录 + 注册都能临时查看已输入内容。
3. **交互分端**：
   - 图形：极简黑白「眼睛」切换按钮。
   - 桌面终端：`Tab` 切换明文/遮罩。
   - 手机终端：密码步骤旁的 `show` / `hide` 文字按钮（无 Tab 时可用）。

### 1.3 成功标准

- [ ] 图形注册：缺确认或不一致时无法提交，错误文案清晰。
- [ ] 终端注册：确认步比对失败后回到重设密码，不创建账号。
- [ ] 登录与注册均可显隐密码（图形眼睛；桌面 Tab；手机终端按钮）。
- [ ] 移动端图形仍可用（确认框 + 眼睛触控区域足够）。
- [ ] API / schema 无破坏性变更。

---

## 2. 锁定决策

| 项 | 决策 |
|----|------|
| 方案 | 前端仅校验确认密码 + 本地显隐（不改 API） |
| 二次确认范围 | 仅注册 |
| 显隐范围 | 登录 + 注册 |
| 图形显隐 | 密码框右侧极简线框眼睛，点击切换 |
| 桌面终端显隐 | `Tab`（`preventDefault`），切换型 |
| 手机终端显隐 | 输入行旁 `show`/`hide` 文字按钮，切换型 |
| 确认失败（终端） | 报错后回到重设密码（清空临时密码，重新 `new-pass`） |
| 确认失败（图形） | 提示不一致；保留用户名与第一遍密码，可改确认框 |

---

## 3. 图形界面

### 3.1 字段

- 登录：`username` + `password`（+ 眼睛）。
- 注册：`username` + `password` + `passwordConfirm`（两框各自眼睛）。
- 切到登录时：隐藏确认框，清空 `passwordConfirm`。

### 3.2 校验（注册 submit）

1. 用户名规则不变（2–20，`[a-zA-Z0-9_.-]`）。
2. `password.length >= 3`。
3. `password === passwordConfirm`；否则 `graphic.err_pass_mismatch`（或等价 key）。
4. 通过后再 `POST /auth/register`。

### 3.3 眼睛控件

- 放在对应密码输入行右侧（输入与按钮同一行），不引入彩色/阴影/圆角胶囊。
- 默认遮罩；点击切换该行 `type` 在 `password` / `text` 之间。
- `aria-label`：`Show passphrase` / `Hide passphrase`（中英随 locale）。
- 移动端：按钮触控高度建议 ≥ 44px，输入仍保持 ≥ 16px 字号避免 iOS 缩放。

---

## 4. 终端界面

### 4.1 注册状态机

现有：`new-name` → `new-pass` → register。

改为：

```
new-name → new-pass → (暂存 pendingPass) → new-pass-confirm → register
```

- `new-pass`：校验长度 ≥ 3；提示 `confirm passphrase:`；进入 `new-pass-confirm`。
- `new-pass-confirm`：与 `pendingPass` 比较。
  - 一致：调用 register，成功后清临时状态。
  - 不一致：打印错误；清空 `pendingPass`；回到 `new-pass`（重新 `set a passphrase`）。
- `freezeInput` 在密码态仍打码显示（`*`），与显隐无关（历史行不回显明文）。

### 4.2 显隐

- 仅当 `isPasswordState`（`passphrase` / `new-pass` / `new-pass-confirm`）时生效。
- **桌面**：`keydown` 捕获 `Tab` → `preventDefault` + 切换输入 `type`（或等价 `reveal` flag）。
- **手机**：`window.innerWidth < 640`（与现有终端窄屏判断一致）时，在 prompt 行旁渲染 `show`/`hide`；点击切换同一 `reveal` flag。
- 离开密码态时强制回到遮罩。
- welcome / help 增加 tip：`tab (desktop) toggles passphrase visibility`；手机可不提 Tab，或写 `use show/hide on mobile`。

### 4.3 登录

- 流程不变（`cd` → `passphrase`），仅增加显隐能力。

---

## 5. i18n

在 `packages/shared/constants/locales.ts`（及 graphic/terminal 所用 key）补充：

| Key（示例） | 用途 |
|-------------|------|
| `graphic.passphrase_confirm` | 确认字段标签 |
| `graphic.passphrase_confirm_ph` | 确认占位 |
| `graphic.err_pass_mismatch` | 两次不一致 |
| `graphic.show_pass` / `graphic.hide_pass` | 眼睛 a11y |
| 终端提示文案 | confirm 提示、mismatch、显隐 tip |

中英文都要有；终端主体仍可保持英文命令流，提示句与现有一致（英文为主亦可，但 mismatch / tip 需可读）。

---

## 6. 非改动项

- `apps/api` auth service / routes
- `registerSchema` / `loginSchema`
- 密码最小长度（仍为 3）
- 演示账号一键登录

---

## 7. 测试要点

1. 图形注册：两次密码不同 → 不发请求；相同 → 成功。
2. 图形登录/注册：眼睛切换明文，刷新/切 tab 后行为合理（切 mode 可重置为遮罩）。
3. 终端注册：确认错误 → 重设；确认正确 → 进 dashboard。
4. 桌面终端：密码步 Tab 切换且不丢焦点；非密码步 Tab 不劫持（或仅密码步处理）。
5. 窄屏终端：出现 show/hide；点按切换。
6. 回归：`demo`、`pl graphic`、已有账号登录。

---

## 8. 实现落点

| 文件 | 改动 |
|------|------|
| `apps/web/src/components/auth/AuthGraphic.vue` | 确认字段、眼睛、校验 |
| `apps/web/src/components/auth/AuthTerminal.vue` | `new-pass-confirm`、Tab、移动 show/hide、tip |
| `packages/shared/constants/locales.ts` | 文案 key |
| 可选：终端相关 CSS（若有全局 auth terminal 样式） | prompt 行按钮布局 |
