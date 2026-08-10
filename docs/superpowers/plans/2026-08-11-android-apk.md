# Android APK Sideload Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a signed Capacitor release APK of PlainList to `http://175.24.134.228/`, with native auth persistence, independent theme switching, marketplace/widget entry hidden on phone, and local todo reminders.

**Architecture:** Reuse the Vue SPA inside Capacitor WebView. Bake `VITE_API_BASE_URL=http://175.24.134.228` at build time. Gate mobile-only UX with `Capacitor.isNativePlatform()`. Persist JWT via `@capacitor/preferences` on native. Schedule reminders through a `NotificationScheduler` interface (local impl now, push later). Host APK beside existing DMGs on the download page (platform section A).

**Tech Stack:** Vue 3 · Vite 7 · Pinia · Capacitor 8 · `@capacitor/local-notifications` · `@capacitor/preferences` · Android Gradle `assembleRelease` · bash deploy via `sshpass`

**Spec:** `docs/superpowers/specs/2026-08-11-android-apk-design.md`

---

## File structure (create / modify)

| Path | Responsibility |
|------|----------------|
| `apps/web/src/shared/platform.ts` | `isNativePlatform()` / `isAndroid()` wrappers |
| `apps/web/src/shared/auth/tokenStorage.ts` | Read/write/clear `pl_token` (sessionStorage vs Preferences) |
| `apps/web/src/features/auth/model/useAuthStore.ts` | Use async hydrate + tokenStorage |
| `apps/web/src/features/auth/model/useAuthStore.test.ts` | Update tests for storage abstraction |
| `apps/web/src/shared/notifications/types.ts` | `NotificationScheduler` + schedule item types |
| `apps/web/src/shared/notifications/planReminders.ts` | Pure: plans → schedule list (unit-tested) |
| `apps/web/src/shared/notifications/planReminders.test.ts` | Tests for reminder mapping |
| `apps/web/src/shared/notifications/localScheduler.ts` | Capacitor Local Notifications impl |
| `apps/web/src/shared/notifications/noopScheduler.ts` | Web / Electron noop |
| `apps/web/src/shared/notifications/index.ts` | Factory `getNotificationScheduler()` |
| `apps/web/src/components/settings/ThemeSettingsPanel.vue` | Theme swatch UI (click = save) |
| `apps/web/src/components/settings/UserSettingsPanel.vue` | Add「主题」nav section |
| `apps/web/src/app/App.vue` | Hide marketplace/widgets on native; ensureThemePack; sync notifications on load/logout |
| `apps/web/src/features/plans/model/usePlansStore.ts` | After mutations, call scheduler sync |
| `apps/web/src/app/main.ts` | Await auth hydrate before mount |
| `apps/web/capacitor.config.ts` | Local Notifications plugin config if needed |
| `apps/web/package.json` + root `package.json` | `mobile:android:release` scripts + local-notifications dep |
| `.gitignore` | Stop ignoring `apps/web/android/`; ignore keystores / release apk staging |
| `apps/web/android/.gitignore` | Standard Android ignores (build, local.properties, …) |
| `apps/web/android/app/build.gradle` | versionName/Code + signingConfigs |
| `apps/web/android-signing/keystore.properties.example` | Template |
| `apps/web/android-signing/README.md` | How to generate/backup keystore |
| `apps/web/scripts/build-android-release.sh` | Gate env → sync → gradlew → copy APK |
| `apps/web/scripts/deploy-android.sh` | Upload APK + sums + index.html |
| `apps/web/scripts/download-page/index.html` | Android section |
| `README.md` | Download + mobile release docs |

---

### Task 1: Track Android project + ignore secrets

**Files:**
- Modify: `.gitignore`
- Create: `apps/web/android/.gitignore`
- Create: `apps/web/android-signing/.gitignore`

- [ ] **Step 1: Update root `.gitignore`**

Replace the Capacitor block:

```gitignore
# Capacitor: track android/ for reproducible release signing; ios still local-only for now
apps/web/ios/

# Android signing secrets + local release staging
apps/web/android-signing/*.jks
apps/web/android-signing/*.keystore
apps/web/android-signing/keystore.properties
apps/web/.android-release/
```

Remove the line `apps/web/android/`.

- [ ] **Step 2: Add `apps/web/android/.gitignore`**

```gitignore
# Built application files
*.apk
*.ap_
*.aab

# Files for the ART/Dalvik VM
*.dex

# Java class files
*.class

# Generated files
bin/
gen/
out/

# Gradle
.gradle/
build/

# Local configuration
local.properties

# Android Studio
captures/
.idea/
*.iml
.cxx/

# Keystore (never commit)
*.jks
*.keystore

# Capacitor copies web assets here on sync — do not hand-edit
app/src/main/assets/public/
app/src/main/assets/capacitor.config.json
app/src/main/assets/capacitor.plugins.json
app/src/main/res/xml/config.xml
```

- [ ] **Step 3: Add `apps/web/android-signing/.gitignore`**

```gitignore
*
!.gitignore
!keystore.properties.example
!README.md
```

- [ ] **Step 4: Stage android sources (exclude build artifacts)**

```bash
cd /Users/rainhuang/Desktop/plainlist
# ensure android exists; if missing: (cd apps/web && npx cap add android)
git add .gitignore apps/web/android/.gitignore apps/web/android-signing/.gitignore
git add apps/web/android
git status
```

Expected: `apps/web/android/**` source/gradle files staged; no `build/`, no `local.properties`, no keystores.

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
chore(android): track Capacitor Android project for release builds

Stop gitignoring apps/web/android so signing and version metadata stay reproducible; keep keystores and build outputs out of git.
EOF
)"
```

---

### Task 2: Align version + release signing in Gradle

**Files:**
- Modify: `apps/web/android/app/build.gradle`
- Create: `apps/web/android-signing/keystore.properties.example`
- Create: `apps/web/android-signing/README.md`

- [ ] **Step 1: Replace `apps/web/android/app/build.gradle` android block with signing-aware config**

Keep existing plugins/dependencies; change the `android { ... }` section to:

```gradle
android {
    namespace = "com.plainlist.app"
    compileSdk = rootProject.ext.compileSdkVersion
    defaultConfig {
        applicationId "com.plainlist.app"
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 20000
        versionName "2.0.0"
        testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"
        aaptOptions {
            ignoreAssetsPattern = '!.svn:!.git:!.ds_store:!*.scc:.*:!CVS:!thumbs.db:!picasa.ini:!*~'
        }
    }
    signingConfigs {
        release {
            def propsFile = rootProject.file("../android-signing/keystore.properties")
            if (propsFile.exists()) {
                def props = new Properties()
                props.load(new FileInputStream(propsFile))
                storeFile file("${propsFile.parentFile}/${props['storeFile']}")
                storePassword props['storePassword']
                keyAlias props['keyAlias']
                keyPassword props['keyPassword']
            }
        }
    }
    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
            if (rootProject.file("../android-signing/keystore.properties").exists()) {
                signingConfig signingConfigs.release
            }
        }
    }
}
```

Note: `rootProject.file(...)` is resolved from `apps/web/android/` (the Gradle root), so `../android-signing` = `apps/web/android-signing`.

- [ ] **Step 2: Write `keystore.properties.example`**

```properties
storeFile=plainlist-release.jks
storePassword=CHANGE_ME
keyAlias=plainlist
keyPassword=CHANGE_ME
```

- [ ] **Step 3: Write `apps/web/android-signing/README.md`**

```markdown
# Android release signing

## Generate (once)

```bash
cd apps/web/android-signing
keytool -genkeypair -v \
  -keystore plainlist-release.jks \
  -alias plainlist \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storetype JKS
cp keystore.properties.example keystore.properties
# edit passwords to match what you typed
```

## Backup

Copy `plainlist-release.jks` + `keystore.properties` to a password manager / encrypted drive.
Losing them means you cannot update the same `com.plainlist.app` install later.

## Never commit

`*.jks` and `keystore.properties` are gitignored.
```

- [ ] **Step 4: Generate keystore on this machine (interactive passwords — operator runs once)**

```bash
cd /Users/rainhuang/Desktop/plainlist/apps/web/android-signing
keytool -genkeypair -v \
  -keystore plainlist-release.jks \
  -alias plainlist \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storetype JKS
cp keystore.properties.example keystore.properties
# fill storePassword / keyPassword
```

Expected: `plainlist-release.jks` and `keystore.properties` exist locally; `git status` does **not** list them.

- [ ] **Step 5: Commit tracked files only**

```bash
git add apps/web/android/app/build.gradle \
  apps/web/android-signing/keystore.properties.example \
  apps/web/android-signing/README.md
git commit -m "$(cat <<'EOF'
chore(android): set 2.0.0 versionCode and release signingConfig

Wire optional keystore.properties from android-signing/ so assembleRelease can produce a sideloadable APK.
EOF
)"
```

---

### Task 3: Release build script + npm scripts

**Files:**
- Create: `apps/web/scripts/build-android-release.sh`
- Modify: `apps/web/package.json`
- Modify: `package.json` (root)

- [ ] **Step 1: Create `apps/web/scripts/build-android-release.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ROOT_DIR="$(cd "${WEB_DIR}/../.." && pwd)"
VERSION="${PLAINLIST_VERSION:-2.0.0}"
API_BASE="${VITE_API_BASE_URL:-}"
OUT_DIR="${WEB_DIR}/.android-release"
KEYPROPS="${WEB_DIR}/android-signing/keystore.properties"

if [[ -z "$API_BASE" ]]; then
  echo "error: VITE_API_BASE_URL is required for release APK (refusing empty API base)" >&2
  exit 1
fi

if [[ ! -f "$KEYPROPS" ]]; then
  echo "error: missing $KEYPROPS — see apps/web/android-signing/README.md" >&2
  exit 1
fi

if [[ ! -d "${WEB_DIR}/android" ]]; then
  echo "error: apps/web/android missing — run: (cd apps/web && npx cap add android)" >&2
  exit 1
fi

echo "[android-release] API_BASE=$API_BASE VERSION=$VERSION"
cd "$ROOT_DIR"
npm run build:shared
cd "$WEB_DIR"
VITE_API_BASE_URL="$API_BASE" npm run build
npx cap sync android

cd "${WEB_DIR}/android"
./gradlew assembleRelease

APK_SRC="${WEB_DIR}/android/app/build/outputs/apk/release/app-release.apk"
mkdir -p "$OUT_DIR"
APK_DST="${OUT_DIR}/PlainList-${VERSION}.apk"
cp "$APK_SRC" "$APK_DST"
shasum -a 256 "$APK_DST" | tee "${OUT_DIR}/PlainList-${VERSION}.apk.sha256"
echo "[android-release] wrote $APK_DST"
```

- [ ] **Step 2: chmod + wire package.json scripts**

```bash
chmod +x /Users/rainhuang/Desktop/plainlist/apps/web/scripts/build-android-release.sh
```

In `apps/web/package.json` scripts, add:

```json
"mobile:android:release": "bash scripts/build-android-release.sh"
```

In root `package.json` scripts, add:

```json
"mobile:android:release": "npm run mobile:android:release -w @plainlist/web"
```

- [ ] **Step 3: Dry-run gate (expect failure without env)**

```bash
cd /Users/rainhuang/Desktop/plainlist
npm run mobile:android:release
```

Expected: exit 1, message contains `VITE_API_BASE_URL is required`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/scripts/build-android-release.sh apps/web/package.json package.json
git commit -m "$(cat <<'EOF'
build(android): add release APK script with API base gate

Refuse unsigned empty-base packages; sync Capacitor and assembleRelease into .android-release/.
EOF
)"
```

---

### Task 4: Platform helper

**Files:**
- Create: `apps/web/src/shared/platform.ts`
- Test: `apps/web/src/shared/platform.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
    getPlatform: vi.fn(),
  },
}));

import { Capacitor } from '@capacitor/core';
import { isAndroid, isNativePlatform } from './platform';

describe('platform', () => {
  beforeEach(() => {
    vi.mocked(Capacitor.isNativePlatform).mockReset();
    vi.mocked(Capacitor.getPlatform).mockReset();
  });

  it('mirrors Capacitor.isNativePlatform', () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    expect(isNativePlatform()).toBe(true);
  });

  it('detects android only when native + platform android', () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
    expect(isAndroid()).toBe(true);

    vi.mocked(Capacitor.getPlatform).mockReturnValue('ios');
    expect(isAndroid()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test — expect fail (module missing)**

```bash
cd /Users/rainhuang/Desktop/plainlist && npm run test -w @plainlist/web -- src/shared/platform.test.ts
```

Expected: FAIL cannot find `./platform` or export.

- [ ] **Step 3: Implement**

```ts
import { Capacitor } from '@capacitor/core';

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export function isAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}
```

- [ ] **Step 4: Re-run tests — expect PASS**

```bash
cd /Users/rainhuang/Desktop/plainlist && npm run test -w @plainlist/web -- src/shared/platform.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/shared/platform.ts apps/web/src/shared/platform.test.ts
git commit -m "feat(web): add Capacitor platform helpers"
```

---

### Task 5: Token storage + auth hydrate

**Files:**
- Create: `apps/web/src/shared/auth/tokenStorage.ts`
- Modify: `apps/web/src/features/auth/model/useAuthStore.ts`
- Modify: `apps/web/src/features/auth/model/useAuthStore.test.ts`
- Modify: `apps/web/src/app/main.ts`

- [ ] **Step 1: Update auth tests for async storage API**

Replace `useAuthStore.test.ts` with:

```ts
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const memory = new Map<string, string>();

vi.mock('@/shared/auth/tokenStorage', () => ({
  TOKEN_KEY: 'pl_token',
  getToken: vi.fn(async () => memory.get('pl_token') ?? null),
  setToken: vi.fn(async (token: string) => {
    memory.set('pl_token', token);
  }),
  clearToken: vi.fn(async () => {
    memory.delete('pl_token');
  }),
}));

import { clearToken, getToken, setToken } from '@/shared/auth/tokenStorage';
import { useAuthStore } from './useAuthStore';

describe('useAuthStore', () => {
  beforeEach(() => {
    memory.clear();
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('persists login state and clears it on logout', async () => {
    const auth = useAuthStore();
    await auth.setAuth('token-123', 'alice', true);

    expect(auth.token).toBe('token-123');
    expect(auth.currentUser).toBe('alice');
    expect(auth.isAdmin).toBe(true);
    expect(auth.isLoggedIn).toBe(true);
    expect(setToken).toHaveBeenCalledWith('token-123');

    await auth.logout();

    expect(auth.token).toBeNull();
    expect(auth.currentUser).toBeNull();
    expect(auth.isAdmin).toBe(false);
    expect(auth.isLoggedIn).toBe(false);
    expect(clearToken).toHaveBeenCalled();
  });

  it('hydrates token from storage before user hydration', async () => {
    memory.set('pl_token', 'demo-token');
    const auth = useAuthStore();
    await auth.hydrateFromStorage();

    expect(getToken).toHaveBeenCalled();
    expect(auth.token).toBe('demo-token');
    expect(auth.currentUser).toBeNull();
    expect(auth.isLoggedIn).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL (hydrate/setAuth API mismatch)**

```bash
cd /Users/rainhuang/Desktop/plainlist && npm run test -w @plainlist/web -- src/features/auth/model/useAuthStore.test.ts
```

- [ ] **Step 3: Implement `tokenStorage.ts`**

```ts
import { Preferences } from '@capacitor/preferences';
import { isNativePlatform } from '@/shared/platform';

export const TOKEN_KEY = 'pl_token';

export async function getToken(): Promise<string | null> {
  if (isNativePlatform()) {
    const { value } = await Preferences.get({ key: TOKEN_KEY });
    return value;
  }
  return sessionStorage.getItem(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  if (isNativePlatform()) {
    await Preferences.set({ key: TOKEN_KEY, value: token });
    return;
  }
  sessionStorage.setItem(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  if (isNativePlatform()) {
    await Preferences.remove({ key: TOKEN_KEY });
    return;
  }
  sessionStorage.removeItem(TOKEN_KEY);
}
```

- [ ] **Step 4: Rewrite `useAuthStore.ts`**

```ts
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { clearToken, getToken, setToken } from '@/shared/auth/tokenStorage';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(null);
  const currentUser = ref<string | null>(null);
  const isAdmin = ref(false);

  const isLoggedIn = computed(() => Boolean(token.value && currentUser.value));

  async function hydrateFromStorage() {
    token.value = await getToken();
  }

  async function setAuth(nextToken: string, user: string, admin: boolean) {
    token.value = nextToken;
    currentUser.value = user;
    isAdmin.value = admin;
    await setToken(nextToken);
  }

  async function logout() {
    token.value = null;
    currentUser.value = null;
    isAdmin.value = false;
    await clearToken();
  }

  return {
    token,
    currentUser,
    isAdmin,
    isLoggedIn,
    hydrateFromStorage,
    setAuth,
    logout,
  };
});
```

- [ ] **Step 5: Update callers of `setAuth` / `logout` to await**

Search and fix (at least):

- `apps/web/src/app/App.vue` — `await auth.logout()`, `await auth.setAuth(...)`
- Auth login components that call `auth.setAuth` — add `await`
- Any other `auth.logout()` / `auth.setAuth` call sites

```bash
rg -n "auth\.(setAuth|logout)\(" apps/web/src
```

- [ ] **Step 6: Hydrate before mount in `main.ts`**

Read current `main.ts` and wrap mount:

```ts
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { useAuthStore } from '@/features/auth/model/useAuthStore';
// ... existing Capacitor splash/status imports ...

async function bootstrap() {
  const app = createApp(App);
  const pinia = createPinia();
  app.use(pinia);

  const auth = useAuthStore(pinia);
  await auth.hydrateFromStorage();

  // existing native SplashScreen / StatusBar / Keyboard setup stays here
  app.mount('#app');
}

bootstrap();
```

Keep existing native plugin setup behavior from the current file; only insert hydrate before mount.

- [ ] **Step 7: Run auth tests — expect PASS**

```bash
cd /Users/rainhuang/Desktop/plainlist && npm run test -w @plainlist/web -- src/features/auth/model/useAuthStore.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/shared/auth/tokenStorage.ts \
  apps/web/src/features/auth/model/useAuthStore.ts \
  apps/web/src/features/auth/model/useAuthStore.test.ts \
  apps/web/src/app/main.ts \
  $(rg -l "auth\.(setAuth|logout)\(" apps/web/src || true)
git commit -m "$(cat <<'EOF'
feat(auth): persist JWT with Capacitor Preferences on native

Hydrate token before app mount so Android WebView survives process death better than sessionStorage alone.
EOF
)"
```

---

### Task 6: Hide marketplace + widgets on native

**Files:**
- Modify: `apps/web/src/app/App.vue`

- [ ] **Step 1: Import platform helper and gate UI**

In script:

```ts
import { isNativePlatform } from '@/shared/platform';

const showPluginChrome = computed(() => !isNativePlatform());
const installedWidgets = computed(() =>
  showPluginChrome.value ? marketplace.installedWidgets : [],
);
```

In template, wrap marketplace button:

```vue
<button
  v-if="showPluginChrome"
  id="nav-marketplace"
  :title="t('marketplace.title', 'Marketplace')"
  @click="marketplaceOpen = true"
>
  ⊞
</button>
```

Keep widget `v-for` as-is (empty array on native). Also gate Marketplace overlay:

```vue
<Marketplace v-if="showPluginChrome && marketplaceOpen" @close="marketplaceOpen = false" />
```

- [ ] **Step 2: Manual sanity (dev)**

```bash
cd /Users/rainhuang/Desktop/plainlist && npm run dev
```

Expected: Web still shows ⊞ marketplace. Native behavior verified later on device/emulator.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/App.vue
git commit -m "$(cat <<'EOF'
feat(mobile): hide marketplace and widget nav on native

Keep plugin framework code; only remove phone entry points for Fish Time / Focus Bay / store UI.
EOF
)"
```

---

### Task 7: Theme settings section + ensureThemePack

**Files:**
- Create: `apps/web/src/components/settings/ThemeSettingsPanel.vue`
- Modify: `apps/web/src/components/settings/UserSettingsPanel.vue`
- Modify: `apps/web/src/app/App.vue`
- Modify: `apps/web/src/features/plugins/model/useMarketplaceStore.ts` (add `ensureThemePack` + `listThemePackThemes`)

- [ ] **Step 1: Add store helpers**

In `useMarketplaceStore.ts`, add:

```ts
async function ensureThemePack() {
  if (!isInstalled('theme-pack')) {
    await install('theme-pack');
  }
  if (!isEnabled('theme-pack')) {
    await toggle('theme-pack', true);
  }
}

async function listThemePackThemes(): Promise<ThemeDefinition[]> {
  const manifest = await get<PluginVersionManifest>('/marketplace/detail/theme-pack/manifest');
  return manifest.themes ?? [];
}
```

Export both from the store return object. Ensure `ThemeDefinition` / `PluginVersionManifest` imports already exist in that file.

- [ ] **Step 2: Create `ThemeSettingsPanel.vue`**

```vue
<template>
  <div class="theme-settings">
    <p class="theme-hint">{{ t('settings.theme_hint', '选择一套主题色，立即应用到界面。') }}</p>
    <div v-if="loading" class="theme-loading">{{ t('settings.theme_loading', '加载主题…') }}</div>
    <div v-else class="theme-grid">
      <button
        v-for="theme in themes"
        :key="theme.id"
        type="button"
        class="theme-card"
        :class="{ active: marketplace.activeThemeId === theme.id }"
        @click="onSelect(theme.id)"
      >
        <div class="theme-swatches">
          <span
            v-for="key in swatchKeys"
            :key="key"
            class="swatch"
            :style="{ background: theme.vars[key] }"
          />
        </div>
        <div class="theme-name">{{ theme.name }}</div>
      </button>
    </div>
    <p v-if="error" class="theme-error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import type { ThemeDefinition, ThemeVars } from '@plainlist/shared';
import { onMounted, ref } from 'vue';
import { useMarketplaceStore } from '@/features/plugins/model/useMarketplaceStore';
import { useI18nStore } from '@/shared/i18n/useI18nStore';

const marketplace = useMarketplaceStore();
const i18n = useI18nStore();
const themes = ref<ThemeDefinition[]>([]);
const loading = ref(true);
const error = ref('');
const swatchKeys: (keyof ThemeVars)[] = ['bg', 'surface', 'dark', 'mid', 'muted'];

function t(key: string, fallback: string) {
  return i18n.t(key, fallback);
}

async function onSelect(themeId: string) {
  error.value = '';
  try {
    await marketplace.saveTheme(themeId);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'save failed';
  }
}

onMounted(async () => {
  loading.value = true;
  try {
    await marketplace.ensureThemePack();
    themes.value = await marketplace.listThemePackThemes();
    await marketplace.loadActiveTheme();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'load failed';
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.theme-hint { font-size: 13px; color: var(--muted, #5a5a60); margin: 0 0 16px; }
.theme-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }
.theme-card {
  border: 1px solid rgba(28,28,32,0.12);
  background: var(--surface, #fff);
  border-radius: 12px;
  padding: 12px;
  text-align: left;
  cursor: pointer;
}
.theme-card.active { outline: 2px solid var(--dark, #1c1c20); }
.theme-swatches { display: flex; gap: 4px; margin-bottom: 8px; }
.swatch { width: 16px; height: 16px; border-radius: 4px; border: 1px solid rgba(0,0,0,0.08); }
.theme-name { font-size: 13px; font-weight: 500; }
.theme-error { color: #b42318; font-size: 13px; }
.theme-loading { font-size: 13px; color: var(--muted, #5a5a60); }
</style>
```

If `ThemeVars` is not exported as a type with those keys, import the type that `DEFAULT_THEME_VARS` uses from `@plainlist/shared` / `packages/shared/constants/plugins.ts` and adjust `swatchKeys` accordingly.

- [ ] **Step 3: Wire into `UserSettingsPanel.vue`**

- Extend section union to `'account' | 'ai' | 'profile' | 'theme'`
- Add nav item `{ id: 'theme', label: t('settings.nav_theme', '主题') }`
- Render `<ThemeSettingsPanel v-else-if="activeSection === 'theme'" :key="formKey" />`
- Update `activeTitle` for theme
- Update props `initialSection` type and `App.vue` `userSettingsSection` / `openUserSettings` types to include `'theme'`

- [ ] **Step 4: Call `ensureThemePack` during `loadDashboard` in `App.vue`**

After `loadMyPlugins` / manifests (or as part of Promise chain):

```ts
await marketplace.ensureThemePack();
await marketplace.loadActiveTheme();
```

- [ ] **Step 5: Smoke in browser**

Open settings → 主题 → click a theme → CSS vars change; reload still applied after login.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/settings/ThemeSettingsPanel.vue \
  apps/web/src/components/settings/UserSettingsPanel.vue \
  apps/web/src/app/App.vue \
  apps/web/src/features/plugins/model/useMarketplaceStore.ts
git commit -m "$(cat <<'EOF'
feat(settings): add theme picker independent of marketplace UI

Ensure theme-pack is installed so native users can switch colors without opening the plugin store.
EOF
)"
```

---

### Task 8: Pure plan → reminder mapping (TDD)

**Files:**
- Create: `apps/web/src/shared/notifications/types.ts`
- Create: `apps/web/src/shared/notifications/planReminders.ts`
- Create: `apps/web/src/shared/notifications/planReminders.test.ts`

- [ ] **Step 1: Write types**

```ts
export interface ReminderPlanLike {
  id: number;
  type: 'habit' | 'todo';
  name: string;
  time: string; // HH:MM
  scheduledDate?: string | null; // YYYY-MM-DD
}

export interface ReminderScheduleItem {
  /** Stable id for Capacitor notification id (must fit JS number / int32 safely) */
  id: number;
  planId: number;
  title: string;
  body: string;
  at: Date;
}

export interface NotificationScheduler {
  requestPermission(): Promise<boolean>;
  syncFromPlans(plans: ReminderPlanLike[]): Promise<void>;
  clearAll(): Promise<void>;
}
```

- [ ] **Step 2: Write failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { buildReminderSchedules } from './planReminders';

describe('buildReminderSchedules', () => {
  const now = new Date('2026-08-11T10:00:00');

  it('schedules future todos with date+time', () => {
    const items = buildReminderSchedules(
      [
        {
          id: 42,
          type: 'todo',
          name: 'Submit report',
          time: '15:30',
          scheduledDate: '2026-08-11',
        },
      ],
      now,
    );
    expect(items).toHaveLength(1);
    expect(items[0].planId).toBe(42);
    expect(items[0].body).toBe('Submit report');
    expect(items[0].at.toISOString()).toBe(new Date('2026-08-11T15:30:00').toISOString());
  });

  it('skips past todos, habits, and incomplete todos', () => {
    const items = buildReminderSchedules(
      [
        { id: 1, type: 'todo', name: 'Past', time: '09:00', scheduledDate: '2026-08-11' },
        { id: 2, type: 'habit', name: 'Run', time: '18:00' },
        { id: 3, type: 'todo', name: 'No date', time: '18:00' },
      ],
      now,
    );
    expect(items).toEqual([]);
  });

  it('uses deterministic notification ids derived from plan id', () => {
    const [item] = buildReminderSchedules(
      [{ id: 7, type: 'todo', name: 'X', time: '20:00', scheduledDate: '2026-08-12' }],
      now,
    );
    expect(item.id).toBe(100000 + 7);
  });
});
```

- [ ] **Step 3: Run — expect FAIL**

```bash
cd /Users/rainhuang/Desktop/plainlist && npm run test -w @plainlist/web -- src/shared/notifications/planReminders.test.ts
```

- [ ] **Step 4: Implement `planReminders.ts`**

```ts
import type { ReminderPlanLike, ReminderScheduleItem } from './types';

const NOTIFICATION_ID_OFFSET = 100_000;

export function buildReminderSchedules(
  plans: ReminderPlanLike[],
  now: Date = new Date(),
): ReminderScheduleItem[] {
  const items: ReminderScheduleItem[] = [];

  for (const plan of plans) {
    if (plan.type !== 'todo' || !plan.scheduledDate) continue;
    const match = /^(\d{2}):(\d{2})$/.exec(plan.time);
    if (!match) continue;

    const [year, month, day] = plan.scheduledDate.split('-').map(Number);
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (!year || !month || !day) continue;

    const at = new Date(year, month - 1, day, hour, minute, 0, 0);
    if (at.getTime() <= now.getTime()) continue;

    items.push({
      id: NOTIFICATION_ID_OFFSET + plan.id,
      planId: plan.id,
      title: 'PlainList',
      body: plan.name,
      at,
    });
  }

  return items;
}
```

- [ ] **Step 5: Run — expect PASS**

```bash
cd /Users/rainhuang/Desktop/plainlist && npm run test -w @plainlist/web -- src/shared/notifications/planReminders.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/shared/notifications/types.ts \
  apps/web/src/shared/notifications/planReminders.ts \
  apps/web/src/shared/notifications/planReminders.test.ts
git commit -m "feat(notifications): map todo plans to local reminder schedules"
```

---

### Task 9: Scheduler implementations + wire-up

**Files:**
- Create: `apps/web/src/shared/notifications/noopScheduler.ts`
- Create: `apps/web/src/shared/notifications/localScheduler.ts`
- Create: `apps/web/src/shared/notifications/index.ts`
- Modify: `apps/web/package.json` (dependency)
- Modify: `apps/web/src/app/App.vue`
- Modify: `apps/web/src/features/plans/model/usePlansStore.ts`
- Modify: `apps/web/capacitor.config.ts` (optional channel config)
- Modify: AndroidManifest if plugin docs require extra permissions (via `npx cap sync`)

- [ ] **Step 1: Install dependency**

```bash
cd /Users/rainhuang/Desktop/plainlist/apps/web
npm install @capacitor/local-notifications@^8
```

- [ ] **Step 2: Implement noop + local + factory**

`noopScheduler.ts`:

```ts
import type { NotificationScheduler, ReminderPlanLike } from './types';

export const noopScheduler: NotificationScheduler = {
  async requestPermission() {
    return false;
  },
  async syncFromPlans(_plans: ReminderPlanLike[]) {},
  async clearAll() {},
};
```

`localScheduler.ts`:

```ts
import { LocalNotifications } from '@capacitor/local-notifications';
import { buildReminderSchedules } from './planReminders';
import type { NotificationScheduler, ReminderPlanLike } from './types';

async function cancelTracked() {
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) {
    await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  }
}

export const localScheduler: NotificationScheduler = {
  async requestPermission() {
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') return true;
    const requested = await LocalNotifications.requestPermissions();
    return requested.display === 'granted';
  },

  async syncFromPlans(plans: ReminderPlanLike[]) {
    const granted = await this.requestPermission();
    if (!granted) return;

    await cancelTracked();
    const items = buildReminderSchedules(plans);
    if (!items.length) return;

    await LocalNotifications.schedule({
      notifications: items.map((item) => ({
        id: item.id,
        title: item.title,
        body: item.body,
        schedule: { at: item.at },
        extra: { planId: item.planId },
      })),
    });
  },

  async clearAll() {
    await cancelTracked();
  },
};
```

`index.ts`:

```ts
import { isNativePlatform } from '@/shared/platform';
import { localScheduler } from './localScheduler';
import { noopScheduler } from './noopScheduler';
import type { NotificationScheduler } from './types';

export type { NotificationScheduler, ReminderPlanLike } from './types';
export { buildReminderSchedules } from './planReminders';

export function getNotificationScheduler(): NotificationScheduler {
  return isNativePlatform() ? localScheduler : noopScheduler;
}
```

- [ ] **Step 3: Wire plans store**

At end of `fetch` / `add` / `update` / `remove` / `removeMany` / `clear`:

```ts
import { getNotificationScheduler } from '@/shared/notifications';

async function syncReminders() {
  await getNotificationScheduler().syncFromPlans(plans.value);
}

// after successful fetch/add/update/remove/removeMany:
await syncReminders();

// clear():
void getNotificationScheduler().clearAll();
plans.value = [];
```

For `clear()`, keep sync fire-and-forget or await from logout path in App.

- [ ] **Step 4: Wire App logout + post-load**

In `loadDashboard` after plans fetched (plans.fetch already syncs), optionally:

```ts
await getNotificationScheduler().requestPermission();
```

In `logout`:

```ts
await getNotificationScheduler().clearAll();
await auth.logout();
```

- [ ] **Step 5: Sync native project**

```bash
cd /Users/rainhuang/Desktop/plainlist/apps/web
npx cap sync android
```

Verify `AndroidManifest.xml` gained notification-related permissions if the plugin merges them. If Android 13+ needs `POST_NOTIFICATIONS` and it was not merged, add:

```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

under the existing INTERNET permission.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json package-lock.json \
  apps/web/src/shared/notifications \
  apps/web/src/features/plans/model/usePlansStore.ts \
  apps/web/src/app/App.vue \
  apps/web/capacitor.config.ts \
  apps/web/android/app/src/main/AndroidManifest.xml
git commit -m "$(cat <<'EOF'
feat(notifications): local todo reminders on Capacitor native

Add NotificationScheduler with noop web impl and Local Notifications on Android; resync when plans change.
EOF
)"
```

---

### Task 10: Download page Android section

**Files:**
- Modify: `apps/web/scripts/download-page/index.html`

- [ ] **Step 1: Update title + H2**

- `<title>PlainList 平原 · 下载</title>`
- Change main H2 from「下载 macOS 客户端」to「下载客户端」
- Keep macOS lede, but scope it under a subsection heading「macOS」

Suggested structure after brand:

```html
<h2>下载客户端</h2>
<p class="lede">macOS 与 Android 侧载包。Web 版也可在线使用。</p>

<h3 style="font-size:22px;margin:36px 0 12px;">macOS</h3>
<!-- existing macOS lede (Apple-specific), install curl, grid, steps, apple note -->

<h3 style="font-size:22px;margin:48px 0 12px;">Android</h3>
<p class="lede" style="margin-bottom:20px;">下载 APK 直接安装（需允许未知来源）。当前为自签名侧载包，非正式应用商店分发。</p>

<div class="card" style="max-width:420px;">
  <span class="arch">Android</span>
  <h3>通用 APK</h3>
  <p class="meta">版本 <strong>2.0.0</strong> · 大小 <strong id="size-apk">—</strong> · arm64/x86_64</p>
  <a class="btn" href="/downloads/PlainList-2.0.0.apk">
    <!-- reuse download svg -->
    下载 APK
  </a>
</div>

<div class="steps">
  <div class="step"><div class="num">1</div>
    <p>在系统设置中允许「安装未知应用」/「未知来源」（路径因品牌而异：设置 → 安全 / 应用 → 特殊权限）。</p>
  </div>
  <div class="step"><div class="num">2</div>
    <p>用手机浏览器打开本页，点「下载 APK」，下载完成后打开文件安装。</p>
  </div>
  <div class="step"><div class="num">3</div>
    <p>若被拦截：回到设置里对该浏览器/文件管理器开启安装许可，再点一次 APK。</p>
  </div>
</div>
```

- [ ] **Step 2: Extend size HEAD fetch script**

```js
fetch('/downloads/PlainList-2.0.0.apk', { method: 'HEAD' })
  .then((r) => {
    const len = r.headers.get('content-length');
    if (len) document.getElementById('size-apk').textContent = fmtSize(parseInt(len, 10));
  })
  .catch(() => {});
```

- [ ] **Step 3: Footer line**

Change to mention Capacitor / Android, e.g. `Vue 3 + Express + Electron + Capacitor`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/scripts/download-page/index.html
git commit -m "$(cat <<'EOF'
feat(download-page): add Android APK section under macOS downloads

Platform-section layout with install steps for unknown-source sideload.
EOF
)"
```

---

### Task 11: Deploy Android script

**Files:**
- Create: `apps/web/scripts/deploy-android.sh`

- [ ] **Step 1: Write script**

Mirror `deploy-dmg.sh` patterns (env `PLAINLIST_SERVER`, `SSHPASS`) but:

- Source APK from `apps/web/.android-release/PlainList-2.0.0.apk`
- Upload to `/www/wwwroot/175.24.134.228/downloads/`
- Regenerate SHA256 for **all** `PlainList-2.0.0-*.dmg` + `PlainList-2.0.0.apk` present locally if DMGs available; otherwise at least hash the APK and on server append/merge carefully.

Practical approach for v1:

```bash
#!/usr/bin/env bash
set -euo pipefail

SERVER="${PLAINLIST_SERVER:-ubuntu@175.24.134.228}"
PASSWORD="${SSHPASS:?SSHPASS is required}"
REMOTE_ROOT="/www/wwwroot/175.24.134.228"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PAGE_DIR="${SCRIPT_DIR}/download-page"
VERSION="2.0.0"
APK="${WEB_DIR}/.android-release/PlainList-${VERSION}.apk"

SSHPASS_OPTS=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=20)
export SSHPASS="$PASSWORD"

[[ -f "$APK" ]] || { echo "missing $APK — run mobile:android:release first"; exit 1; }

sshpass -e ssh "${SSHPASS_OPTS[@]}" "$SERVER" \
  "echo '${SSHPASS}' | sudo -S mkdir -p '${REMOTE_ROOT}/downloads' && \
   echo '${SSHPASS}' | sudo -S chown -R www:www '${REMOTE_ROOT}'"

DST_NAME="PlainList-${VERSION}.apk"
sshpass -e scp "${SSHPASS_OPTS[@]}" "$APK" "$SERVER:/tmp/$DST_NAME"
sshpass -e ssh "${SSHPASS_OPTS[@]}" "$SERVER" \
  "echo '${SSHPASS}' | sudo -S mv '/tmp/$DST_NAME' '${REMOTE_ROOT}/downloads/$DST_NAME' && \
   echo '${SSHPASS}' | sudo -S chown www:www '${REMOTE_ROOT}/downloads/$DST_NAME'"

# Rebuild SUMS on server for all PlainList artifacts
sshpass -e ssh "${SSHPASS_OPTS[@]}" "$SERVER" \
  "cd '${REMOTE_ROOT}/downloads' && echo '${SSHPASS}' | sudo -S bash -lc 'shasum -a 256 PlainList-*.dmg PlainList-*.apk > SHA256SUMS.txt && chown www:www SHA256SUMS.txt'"

sshpass -e scp "${SSHPASS_OPTS[@]}" "${PAGE_DIR}/index.html" "$SERVER:/tmp/plainlist-index.html"
sshpass -e ssh "${SSHPASS_OPTS[@]}" "$SERVER" \
  "echo '${SSHPASS}' | sudo -S mv /tmp/plainlist-index.html '${REMOTE_ROOT}/index.html' && \
   echo '${SSHPASS}' | sudo -S chown www:www '${REMOTE_ROOT}/index.html'"

echo "[deploy-android] done → http://175.24.134.228/"
```

Do **not** hardcode passwords in the new script; require `SSHPASS`.

- [ ] **Step 2: chmod + optional npm script**

```bash
chmod +x apps/web/scripts/deploy-android.sh
```

Add to `apps/web/package.json`:

```json
"deploy:android": "bash scripts/deploy-android.sh"
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/scripts/deploy-android.sh apps/web/package.json
git commit -m "$(cat <<'EOF'
chore(deploy): upload Android APK and refresh download page

Require SSHPASS; rebuild SHA256SUMS for DMG+APK on the server.
EOF
)"
```

---

### Task 12: README updates

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Extend download section**

Add Android row to the download table:

| Android APK | [PlainList-2.0.0.apk](http://175.24.134.228/downloads/PlainList-2.0.0.apk) |

Note sideload / unknown sources; point to `apps/web/android-signing/README.md` for keystore backup.

- [ ] **Step 2: Extend「移动端」section**

Document:

```bash
VITE_API_BASE_URL=http://175.24.134.228 npm run mobile:android:release
SSHPASS=… npm run deploy:android -w @plainlist/web
```

Call out: native hides marketplace/widgets; themes in 设置 → 主题; local notifications for dated todos; push not included.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document Android APK release and sideload install"
```

---

### Task 13: Build, deploy, device verification

**Files:** none new (execution)

- [ ] **Step 1: Build release APK**

```bash
cd /Users/rainhuang/Desktop/plainlist
VITE_API_BASE_URL=http://175.24.134.228 npm run mobile:android:release
ls -lh apps/web/.android-release/PlainList-2.0.0.apk
```

Expected: APK exists; sha256 file written.

- [ ] **Step 2: Deploy**

```bash
SSHPASS='…' npm run deploy:android -w @plainlist/web
```

Expected: `http://175.24.134.228/` shows Android block; APK URL returns 200.

- [ ] **Step 3: Phone checklist (manual)**

1. Download + install APK (allow unknown sources).
2. Login `rainhuang` / `rainhuang`.
3. Kill app from recents → reopen → still logged in.
4. 设置 → 主题 → switch → reopen → theme persists.
5. Confirm no marketplace ⊞ / no FishTime / Focus Bay buttons.
6. Create todo scheduled ~2 minutes ahead → allow notifications → receive alert.
7. Delete todo → notification should not fire.
8. Logout → must login again; pending notifications cleared.

- [ ] **Step 4: CORS fallback if login fails**

If API rejects Origin, log the Origin from Android WebView and add to `CORS_ORIGINS` or `apps/api/src/app.ts` allowlist, then restart API. Commit that fix if needed:

```bash
git add apps/api/src/app.ts
git commit -m "fix(api): allow Capacitor Android webview origin for CORS"
```

- [ ] **Step 5: Final commit only if verification produced code fixes; otherwise stop**

Mark spec success criteria complete in a follow-up note if desired (optional doc commit — skip unless asked).

---

## Spec coverage self-check

| Spec requirement | Task |
|------------------|------|
| Signed release APK | 2, 3, 13 |
| Upload + download page Android section A | 10, 11, 13 |
| Core features via public API | 3 (`VITE_API_BASE_URL`), 13 |
| Theme switch without marketplace UI | 7 |
| Hide marketplace / Fish Time / Focus Bay on native | 6 |
| Local notifications for dated todos | 8, 9, 13 |
| Push reserved via interface | 8–9 (`NotificationScheduler`) |
| Keystore not in git | 1, 2 |
| SHA256 includes APK | 11 |
| Preferences token on native | 5 |
| Track `android/` | 1 |
| versionName 2.0.0 / versionCode 20000 | 2 |
| README | 12 |
| ensureThemePack | 7 |
| Release refuses empty API base | 3 |

## Placeholder / consistency scan

- Scheduler method names: `requestPermission` / `syncFromPlans` / `clearAll` — consistent across tasks 8–9.
- Auth methods: `hydrateFromStorage` / `setAuth` / `logout` — all async after task 5.
- Artifact name: `PlainList-2.0.0.apk` everywhere.
- No Play Store / FCM / iOS tasks included (YAGNI per spec).
