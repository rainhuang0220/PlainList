<template>
  <div class="auth-graphic">
    <div class="ag-shell">
      <header class="ag-head">
        <div class="ag-brand">PlainList</div>
        <p class="ag-tagline">
          {{ t('graphic.tagline', 'Habits, reminders, todos and calendar notes — one plain page. Finish today first.') }}
        </p>
      </header>

      <div class="ag-card">
        <div class="ag-tabs" role="tablist">
          <button
            class="ag-tab"
            :class="{ active: mode === 'login' }"
            type="button"
            @click="switchMode('login')"
          >
            {{ t('graphic.login', 'Log in') }}
          </button>
          <button
            class="ag-tab"
            :class="{ active: mode === 'register' }"
            type="button"
            @click="switchMode('register')"
          >
            {{ t('graphic.register', 'Create account') }}
          </button>
        </div>

        <form class="ag-form" @submit.prevent="submit">
          <label class="ag-field">
            <span class="ag-label">{{ t('graphic.username', 'username') }}</span>
            <input
              ref="userInput"
              v-model="username"
              class="ag-input"
              type="text"
              autocomplete="username"
              spellcheck="false"
              :placeholder="t('graphic.username_ph', 'your name')"
              @input="error = ''"
            />
          </label>

          <label class="ag-field">
            <span class="ag-label">{{ t('graphic.passphrase', 'passphrase') }}</span>
            <input
              v-model="password"
              class="ag-input"
              type="password"
              :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
              :placeholder="mode === 'login' ? '••••••' : t('graphic.passphrase_new_ph', 'at least 3 chars')"
              @input="error = ''"
            />
          </label>

          <div class="ag-status" :class="{ err: !!error }">
            {{ error || hint }}
          </div>

          <button class="ag-submit" type="submit" :disabled="busy">
            <span class="ag-submit-dot"></span>
            {{ submitLabel }}
          </button>
        </form>

        <div v-if="mode === 'login' && accounts.length" class="ag-accounts">
          <span class="ag-accounts-label">{{ t('graphic.accounts', 'accounts') }}</span>
          <button
            v-for="account in accounts"
            :key="account.username"
            type="button"
            class="ag-chip"
            @click="pickAccount(account.username)"
          >
            {{ account.username }}
          </button>
        </div>
      </div>

      <div class="ag-foot">
        <button type="button" class="ag-link" @click="loginDemo">{{ t('graphic.demo', 'demo account') }}</button>
        <span class="ag-sep">·</span>
        <button type="button" class="ag-link" @click="openGuide">{{ t('graphic.guide', 'guide') }}</button>
        <span class="ag-sep">·</span>
        <button type="button" class="ag-link" @click="emit('terminal')">{{ t('graphic.terminal', '› terminal') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AuthAccount, AuthSuccessResponse } from '@plainlist/shared';
import { DEMO_ACCOUNT } from '@plainlist/shared';
import { computed, nextTick, onMounted, ref } from 'vue';
import { useAuthStore } from '@/features/auth/model/useAuthStore';
import { useApi } from '@/shared/api/useApi';
import { useI18nStore } from '@/shared/i18n/useI18nStore';

const emit = defineEmits<{
  login: [];
  terminal: [];
}>();

const auth = useAuthStore();
const { get, post } = useApi();
const i18n = useI18nStore();
function t(key: string, fallback: string) {
  return i18n.t(key, fallback);
}

type Mode = 'login' | 'register';
const mode = ref<Mode>('login');
const username = ref('');
const password = ref('');
const error = ref('');
const busy = ref(false);
const accounts = ref<AuthAccount[]>([]);
const userInput = ref<HTMLInputElement | null>(null);

const hint = computed(() =>
  mode.value === 'login'
    ? t('graphic.hint_login', 'Enter an existing account.')
    : t('graphic.hint_register', '2-20 chars · letters, digits, _ . -')
);

const submitLabel = computed(() => {
  if (busy.value) return t('graphic.working', 'working…');
  return mode.value === 'login' ? t('graphic.login', 'Log in') : t('graphic.register', 'Create account');
});

function switchMode(next: Mode) {
  mode.value = next;
  error.value = '';
  nextTick(() => userInput.value?.focus());
}

function pickAccount(name: string) {
  username.value = name;
  error.value = '';
}

function isValidUsername(value: string) {
  return /^[a-zA-Z0-9_.-]{2,20}$/.test(value);
}

async function loadAccounts() {
  accounts.value = await get<AuthAccount[]>('/auth/accounts').catch(() => []);
}

async function finish(response: AuthSuccessResponse, name: string) {
  auth.setAuth(response.token, name, response.isAdmin);
  emit('login');
}

async function doLogin() {
  const name = username.value.trim().toLowerCase();
  if (!name) {
    error.value = t('graphic.err_no_user', 'Enter a username first.');
    return;
  }
  try {
    const response = await post<AuthSuccessResponse>('/auth/login', {
      username: name,
      password: password.value,
    });
    await finish(response, name);
  } catch {
    error.value = t('graphic.err_login', 'Wrong username or passphrase.');
  }
}

async function doRegister() {
  const name = username.value.trim().toLowerCase();
  if (!isValidUsername(name)) {
    error.value = t('graphic.err_username', 'Usernames must be 2-20 chars: letters, digits, _ . or -.');
    return;
  }
  if (password.value.length < 3) {
    error.value = t('graphic.err_pass', 'Passphrase must be at least 3 characters.');
    return;
  }
  if (accounts.value.some((account) => account.username === name)) {
    error.value = t('graphic.err_taken', 'That name is already taken.');
    return;
  }
  try {
    const response = await post<AuthSuccessResponse>('/auth/register', {
      username: name,
      password: password.value,
    });
    await finish(response, name);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : t('graphic.err_register', 'Registration failed.');
  }
}

async function submit() {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    if (mode.value === 'login') await doLogin();
    else await doRegister();
  } finally {
    busy.value = false;
  }
}

async function loginDemo() {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const response = await post<AuthSuccessResponse>('/auth/login', {
      username: DEMO_ACCOUNT.username,
      password: DEMO_ACCOUNT.password,
    });
    await finish(response, DEMO_ACCOUNT.username);
  } catch {
    error.value = t('graphic.err_demo', 'Demo login failed. Run the demo seed and retry.');
  } finally {
    busy.value = false;
  }
}

function openGuide() {
  window.open('/guide.html', '_blank');
}

onMounted(() => {
  loadAccounts();
  nextTick(() => userInput.value?.focus());
});
</script>

<style scoped>
.auth-graphic {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: grid;
  place-items: center;
  padding: 32px 20px;
  overflow-y: auto;
  background: var(--bg, #fff);
  color: var(--dark, #111);
  font-family: var(--mono, ui-monospace, Menlo, Consolas, monospace);
}

.ag-shell {
  width: min(440px, 100%);
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.ag-head { border-bottom: 2px solid var(--dark, #111); padding-bottom: 16px; }
.ag-brand { font-size: 30px; font-weight: 700; letter-spacing: -0.01em; }
.ag-tagline { margin: 8px 0 0; color: var(--muted, #777); font-size: 13px; line-height: 1.6; }

.ag-card { border: 1px solid var(--dark, #111); background: var(--surface, #fff); }

.ag-tabs { display: grid; grid-template-columns: 1fr 1fr; }
.ag-tab {
  border: 0;
  border-bottom: 1px solid var(--faint, #e2e2e2);
  background: transparent;
  color: var(--muted, #777);
  font-family: inherit;
  font-size: 12px;
  letter-spacing: 0.04em;
  padding: 13px 0;
  cursor: pointer;
}
.ag-tab + .ag-tab { border-left: 1px solid var(--faint, #e2e2e2); }
.ag-tab.active { background: var(--dark, #111); color: var(--bg, #fff); border-bottom-color: var(--dark, #111); }

.ag-form { display: flex; flex-direction: column; gap: 14px; padding: 20px; }
.ag-field { display: flex; flex-direction: column; gap: 6px; }
.ag-label { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted, #777); }
.ag-input {
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--faint, #e2e2e2);
  background: transparent;
  font-family: inherit;
  font-size: 15px;
  color: var(--dark, #111);
  padding: 6px 0;
  outline: none;
}
.ag-input:focus { border-bottom-color: var(--dark, #111); }

.ag-status { min-height: 16px; font-size: 11px; line-height: 1.5; color: var(--muted, #777); }
.ag-status.err { color: #c0392b; }

.ag-submit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid var(--dark, #111);
  background: var(--dark, #111);
  color: var(--bg, #fff);
  font-family: inherit;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 12px 0;
  cursor: pointer;
  transition: opacity .15s;
}
.ag-submit:disabled { opacity: 0.5; cursor: not-allowed; }
.ag-submit-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

.ag-accounts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 0 20px 18px;
}
.ag-accounts-label { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted, #777); }
.ag-chip {
  border: 1px solid var(--faint, #e2e2e2);
  background: transparent;
  color: var(--mid, #555);
  font-family: inherit;
  font-size: 12px;
  padding: 4px 10px;
  cursor: pointer;
}
.ag-chip:hover { border-color: var(--dark, #111); color: var(--dark, #111); }

.ag-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--muted, #777);
}
.ag-link {
  border: 0;
  background: transparent;
  color: var(--muted, #777);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.ag-link:hover { color: var(--dark, #111); }
.ag-sep { opacity: 0.5; }
</style>
