# Auth Password Confirm + Reveal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On register, require password confirmation in both graphic and terminal UIs; on login and register, allow revealing the passphrase (graphic eye toggle; desktop terminal Tab; mobile terminal `show`/`hide` button).

**Architecture:** Keep API unchanged. Extract pure helpers for confirm validation and terminal register-step transitions so they can be unit-tested. Wire helpers into `AuthGraphic.vue` and `AuthTerminal.vue`; add i18n keys and minimal CSS for eye / mobile reveal controls.

**Tech Stack:** Vue 3 · TypeScript · Vitest · existing `useI18nStore` + `packages/shared/constants/locales.ts`

**Spec:** `docs/superpowers/specs/2026-08-11-auth-password-confirm-reveal-design.md`

## Global Constraints

- Do **not** change `/auth/register`, `/auth/login`, or `registerSchema` / `loginSchema`.
- Password minimum length remains **3**.
- Confirm mismatch is **frontend-only**; never send a second password field to the API.
- Reveal applies to **login + register**; confirm applies to **register only**.
- Graphic eye: minimal black/white line icon, no color/shadow/pill.
- Desktop terminal: `Tab` toggles reveal while in password state (`preventDefault`).
- Mobile terminal (`innerWidth < 640`): `show`/`hide` text button beside the prompt; no reliance on Tab.
- Terminal confirm mismatch: clear `pendingPass`, return to `new-pass`.
- Graphic confirm mismatch: keep username + first password; show error.

---

## File structure (create / modify)

| Path | Responsibility |
|------|----------------|
| `apps/web/src/features/auth/lib/passwordConfirm.ts` | Pure: `passwordsMatch`, min-length check helpers |
| `apps/web/src/features/auth/lib/passwordConfirm.test.ts` | Unit tests for helpers |
| `apps/web/src/features/auth/lib/terminalRegisterFlow.ts` | Pure state transitions for `new-pass` / `new-pass-confirm` |
| `apps/web/src/features/auth/lib/terminalRegisterFlow.test.ts` | Unit tests for terminal register flow |
| `packages/shared/constants/locales.ts` | Graphic (+ optional auth) copy keys ZH (and EN defaults via fallbacks in components if EN bundle empty) |
| `apps/web/src/components/auth/AuthGraphic.vue` | Confirm field, eye toggles, register validation |
| `apps/web/src/components/auth/AuthTerminal.vue` | Confirm step, Tab reveal, mobile show/hide, tips |
| `apps/web/src/shared/styles/main.css` | `.term-reveal` button layout on prompt line |

---

### Task 1: Pure password-confirm helpers + tests

**Files:**
- Create: `apps/web/src/features/auth/lib/passwordConfirm.ts`
- Create: `apps/web/src/features/auth/lib/passwordConfirm.test.ts`

**Interfaces:**
- Produces:
  - `export const MIN_PASSPHRASE_LENGTH = 3`
  - `export function isPassphraseLongEnough(value: string): boolean`
  - `export function passwordsMatch(password: string, confirm: string): boolean`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import {
  MIN_PASSPHRASE_LENGTH,
  isPassphraseLongEnough,
  passwordsMatch,
} from './passwordConfirm';

describe('passwordConfirm', () => {
  it('exposes min length 3', () => {
    expect(MIN_PASSPHRASE_LENGTH).toBe(3);
  });

  it('rejects short passphrases', () => {
    expect(isPassphraseLongEnough('')).toBe(false);
    expect(isPassphraseLongEnough('ab')).toBe(false);
    expect(isPassphraseLongEnough('abc')).toBe(true);
  });

  it('requires exact match including whitespace', () => {
    expect(passwordsMatch('secret', 'secret')).toBe(true);
    expect(passwordsMatch('secret', 'Secret')).toBe(false);
    expect(passwordsMatch('secret', 'secret ')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npm test -- src/features/auth/lib/passwordConfirm.test.ts`  
Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

```ts
export const MIN_PASSPHRASE_LENGTH = 3;

export function isPassphraseLongEnough(value: string): boolean {
  return value.length >= MIN_PASSPHRASE_LENGTH;
}

export function passwordsMatch(password: string, confirm: string): boolean {
  return password === confirm;
}
```

- [ ] **Step 4: Run tests and make sure they pass**

Run: `cd apps/web && npm test -- src/features/auth/lib/passwordConfirm.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/auth/lib/passwordConfirm.ts apps/web/src/features/auth/lib/passwordConfirm.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): add password confirm helpers

EOF
)"
```

---

### Task 2: Pure terminal register-flow helpers + tests

**Files:**
- Create: `apps/web/src/features/auth/lib/terminalRegisterFlow.ts`
- Create: `apps/web/src/features/auth/lib/terminalRegisterFlow.test.ts`

**Interfaces:**
- Consumes: `isPassphraseLongEnough` from `./passwordConfirm`
- Produces:
  - `export type TerminalRegisterPhase = 'new-pass' | 'new-pass-confirm'`
  - `export type TerminalRegisterResult =`
    - `{ ok: true; next: 'new-pass-confirm'; pendingPass: string }`
    - `{ ok: true; next: 'register'; password: string }`
    - `{ ok: false; error: 'too_short' | 'mismatch'; next: 'new-pass'; pendingPass: null }`

```ts
export function advanceRegisterPass(
  phase: TerminalRegisterPhase,
  value: string,
  pendingPass: string | null,
): TerminalRegisterResult
```

Behavior (locked):
- `new-pass` + too short → `{ ok: false, error: 'too_short', next: 'new-pass', pendingPass: null }`
- `new-pass` + long enough → `{ ok: true, next: 'new-pass-confirm', pendingPass: value }`
- `new-pass-confirm` + match `pendingPass` → `{ ok: true, next: 'register', password: value }`
- `new-pass-confirm` + mismatch / missing pending → `{ ok: false, error: 'mismatch', next: 'new-pass', pendingPass: null }`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { advanceRegisterPass } from './terminalRegisterFlow';

describe('advanceRegisterPass', () => {
  it('rejects short new-pass', () => {
    expect(advanceRegisterPass('new-pass', 'ab', null)).toEqual({
      ok: false,
      error: 'too_short',
      next: 'new-pass',
      pendingPass: null,
    });
  });

  it('moves to confirm after valid new-pass', () => {
    expect(advanceRegisterPass('new-pass', 'abc', null)).toEqual({
      ok: true,
      next: 'new-pass-confirm',
      pendingPass: 'abc',
    });
  });

  it('registers when confirm matches', () => {
    expect(advanceRegisterPass('new-pass-confirm', 'abc', 'abc')).toEqual({
      ok: true,
      next: 'register',
      password: 'abc',
    });
  });

  it('returns to new-pass on mismatch', () => {
    expect(advanceRegisterPass('new-pass-confirm', 'abd', 'abc')).toEqual({
      ok: false,
      error: 'mismatch',
      next: 'new-pass',
      pendingPass: null,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npm test -- src/features/auth/lib/terminalRegisterFlow.test.ts`  
Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

Implement `advanceRegisterPass` exactly to the behavior above using `isPassphraseLongEnough`.

- [ ] **Step 4: Run tests and make sure they pass**

Run: `cd apps/web && npm test -- src/features/auth/lib/terminalRegisterFlow.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/auth/lib/terminalRegisterFlow.ts apps/web/src/features/auth/lib/terminalRegisterFlow.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): add terminal register passphrase confirm flow

EOF
)"
```

---

### Task 3: i18n keys for graphic (+ terminal tips if wired to i18n later)

**Files:**
- Modify: `packages/shared/constants/locales.ts` (zh-CN `messages` block near existing `graphic.*` keys)

**Interfaces:**
- Produces keys (Chinese values):

| Key | Value |
|-----|-------|
| `graphic.passphrase_confirm` | `确认密码` |
| `graphic.passphrase_confirm_ph` | `再输入一遍` |
| `graphic.err_pass_mismatch` | `两次密码不一致。` |
| `graphic.show_pass` | `显示密码` |
| `graphic.hide_pass` | `隐藏密码` |

English fallbacks stay in `AuthGraphic.vue` `t(key, fallback)` second args (existing pattern; EN bundle is empty).

- [ ] **Step 1: Add the five keys** next to `graphic.passphrase` / `graphic.err_pass` in `locales.ts`.

- [ ] **Step 2: Commit**

```bash
git add packages/shared/constants/locales.ts
git commit -m "$(cat <<'EOF'
i18n: add passphrase confirm and reveal copy

EOF
)"
```

---

### Task 4: AuthGraphic — confirm field + eye toggles

**Files:**
- Modify: `apps/web/src/components/auth/AuthGraphic.vue`

**Interfaces:**
- Consumes: `isPassphraseLongEnough`, `passwordsMatch` from `@/features/auth/lib/passwordConfirm`

- [ ] **Step 1: State**

Add:
- `passwordConfirm = ref('')`
- `showPassword = ref(false)`
- `showPasswordConfirm = ref(false)`

In `switchMode`:
- clear `passwordConfirm`
- reset `showPassword` / `showPasswordConfirm` to `false`

- [ ] **Step 2: Template — password row with eye**

Replace the single passphrase `<label>` with a row structure (both login + register password field):

```vue
<label class="ag-field">
  <span class="ag-label">{{ t('graphic.passphrase', 'passphrase') }}</span>
  <div class="ag-pass-row">
    <input
      v-model="password"
      class="ag-input"
      :type="showPassword ? 'text' : 'password'"
      :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
      :placeholder="mode === 'login' ? '••••••' : t('graphic.passphrase_new_ph', 'at least 3 chars')"
      @input="error = ''"
    />
    <button
      type="button"
      class="ag-eye"
      :aria-label="showPassword ? t('graphic.hide_pass', 'Hide passphrase') : t('graphic.show_pass', 'Show passphrase')"
      @click="showPassword = !showPassword"
    >
      <!-- inline SVG: open eye when hidden, eye-off when shown; stroke currentColor, 18x18, no fill color -->
    </button>
  </div>
</label>
```

Add confirm field only when `mode === 'register'`, same row pattern bound to `passwordConfirm` / `showPasswordConfirm`, autocomplete `new-password`, label `graphic.passphrase_confirm`, placeholder `graphic.passphrase_confirm_ph`.

SVG guidance (minimal B/W):
- Hidden state: simple eye outline (ellipse + pupil circle), `stroke="currentColor"`, `fill="none"`, `stroke-width="1.5"`.
- Shown state: same + one diagonal slash line.

- [ ] **Step 3: Register validation**

In `doRegister`, replace raw `password.value.length < 3` with `!isPassphraseLongEnough(password.value)`.  
Before API call:

```ts
if (!passwordsMatch(password.value, passwordConfirm.value)) {
  error.value = t('graphic.err_pass_mismatch', 'Passphrases do not match.');
  return;
}
```

Still `POST` only `{ username, password: password.value }`.

- [ ] **Step 4: Styles**

Scoped CSS:

```css
.ag-pass-row {
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--faint, #e2e2e2);
}
.ag-pass-row .ag-input {
  flex: 1;
  border-bottom: 0;
  min-width: 0;
}
.ag-pass-row:focus-within {
  border-bottom-color: var(--dark, #111);
}
.ag-eye {
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  border: 0;
  background: transparent;
  color: var(--muted, #777);
  padding: 0;
  cursor: pointer;
  display: grid;
  place-items: center;
}
.ag-eye:hover { color: var(--dark, #111); }
@media (max-width: 640px) {
  .ag-eye { width: 44px; height: 44px; }
}
```

Move bottom border from `.ag-input` onto `.ag-pass-row` for password fields only (username field keeps existing `.ag-input` border).

- [ ] **Step 5: Manual smoke (dev)**

Run: `cd apps/web && npm run dev`  
Check: register mismatch blocks; match succeeds; eye toggles; login still works; demo still works.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/auth/AuthGraphic.vue
git commit -m "$(cat <<'EOF'
feat(web): confirm passphrase and eye toggle on graphic auth

EOF
)"
```

---

### Task 5: AuthTerminal — confirm step + Tab / mobile reveal

**Files:**
- Modify: `apps/web/src/components/auth/AuthTerminal.vue`
- Modify: `apps/web/src/shared/styles/main.css` (`.term-prompt-line` / `.term-reveal`)

**Interfaces:**
- Consumes: `advanceRegisterPass` from `@/features/auth/lib/terminalRegisterFlow`

- [ ] **Step 1: Extend state**

```ts
type TerminalState = null | 'passphrase' | 'new-name' | 'new-pass' | 'new-pass-confirm';
const pendingPass = ref<string | null>(null);
const revealPassphrase = ref(false);
const isNarrow = ref(typeof window !== 'undefined' && window.innerWidth < 640);
```

- Input `:type` becomes: `(isPasswordState && !revealPassphrase) ? 'password' : 'text'`
- `setPasswordMode(false)` / `resetState` must also `revealPassphrase = false` and `pendingPass = null`
- On mount (and optional resize listener): keep `isNarrow` in sync with `window.innerWidth < 640`

- [ ] **Step 2: Template — mobile reveal button**

Inside `.term-prompt-line`, after the input:

```vue
<button
  v-if="isPasswordState && isNarrow"
  type="button"
  class="term-reveal"
  @click.stop="revealPassphrase = !revealPassphrase"
>
  {{ revealPassphrase ? 'hide' : 'show' }}
</button>
```

- [ ] **Step 3: Tab handler in `onKeyDown`**

Before Enter handling:

```ts
if (event.key === 'Tab' && isPasswordState.value) {
  event.preventDefault();
  revealPassphrase.value = !revealPassphrase.value;
  return;
}
```

Do **not** intercept Tab when not in password state.

- [ ] **Step 4: Wire register flow**

Replace direct `handleRegistration` on `new-pass` with:

```ts
if (state.value === 'new-pass' || state.value === 'new-pass-confirm') {
  const result = advanceRegisterPass(state.value, value, pendingPass.value);
  if (!result.ok) {
    if (result.error === 'too_short') {
      print('  passphrase must be at least 3 characters.', 'err');
    } else {
      print('  passphrases do not match.', 'err');
      print('  set a passphrase (at least 3 chars):', 'out');
    }
    pendingPass.value = null;
    state.value = 'new-pass';
    setPasswordMode(true);
    revealPassphrase.value = false;
    return;
  }
  if (result.next === 'new-pass-confirm') {
    pendingPass.value = result.pendingPass;
    state.value = 'new-pass-confirm';
    setPasswordMode(true);
    revealPassphrase.value = false;
    print('  confirm passphrase:', 'out');
    return;
  }
  // result.next === 'register'
  await handleRegistration(result.password);
  return;
}
```

Keep `handleRegistration` as the API call (length already validated by helper). On success, `resetState` clears `pendingPass`.

- [ ] **Step 5: Tips in welcome + help**

Add after quick-start / commands lists:

```
  tip: tab toggles passphrase visibility (desktop); use show/hide on mobile.
```

- [ ] **Step 6: CSS in `main.css`**

```css
.term-prompt-line { display: flex; align-items: baseline; gap: 8px; }
.term-reveal {
  flex: 0 0 auto;
  border: 0;
  background: transparent;
  color: #777;
  font-family: var(--mono);
  font-size: 12px;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
  padding: 0;
  min-height: 44px;
}
.term-reveal:hover { color: #111; }
```

- [ ] **Step 7: Manual smoke**

Desktop: `new alice` → passphrase → confirm mismatch → re-prompt; match → dashboard; Tab toggles while typing password.  
Narrow / mobile emulator: `show`/`hide` appears only in password steps.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/auth/AuthTerminal.vue apps/web/src/shared/styles/main.css
git commit -m "$(cat <<'EOF'
feat(web): terminal passphrase confirm and reveal controls

EOF
)"
```

---

### Task 6: Verification

**Files:** none new

- [ ] **Step 1: Run unit tests**

Run: `cd apps/web && npm test -- src/features/auth/lib/`  
Expected: all PASS

- [ ] **Step 2: Spec checklist**

Confirm against spec §1.3:
- Graphic register mismatch blocks without API call
- Terminal mismatch returns to `new-pass`
- Login + register reveal works (eye / Tab / mobile button)
- Mobile graphic touch targets OK
- No API/schema changes (`git diff packages/shared/schemas apps/api` empty for auth)

- [ ] **Step 3: Final commit only if leftover fixes** (otherwise skip)

---

## Spec coverage (self-review)

| Spec item | Task |
|-----------|------|
| Register confirm (graphic) | Task 4 |
| Register confirm (terminal) | Task 2 + 5 |
| Reveal login+register graphic | Task 4 |
| Reveal desktop Tab | Task 5 |
| Reveal mobile show/hide | Task 5 |
| i18n keys | Task 3 |
| No API change | Global + Task 6 |
| Confirm mismatch behaviors | Task 2/4/5 |
| freezeInput still masks history | unchanged path in Task 5 |
| welcome/help tip | Task 5 |

No placeholders left; helper APIs named consistently across tasks.
