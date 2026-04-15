<template>
  <div id="auth-terminal" @click="focusInput">
    <div class="term-shortcuts" @click.stop>
      <div class="term-shortcuts-top">
        <div class="term-shortcuts-label">{{ t('auth.quick_access', '// quick access') }}</div>
        <button
          class="term-locale-btn"
          type="button"
          :title="t('nav.language', 'Language')"
          @click="localeStore.toggleLocale()"
        >
          {{ localeStore.switchLabel }}
        </button>
      </div>
      <div class="term-shortcuts-actions">
        <button class="term-shortcut-btn" type="button" @click="triggerShortcut('login')">
          <span class="term-shortcut-title">{{ t('auth.action.login', 'Login') }}</span>
          <span class="term-shortcut-cmd">pl cd</span>
        </button>
        <button class="term-shortcut-btn" type="button" @click="triggerShortcut('register')">
          <span class="term-shortcut-title">{{ t('auth.action.register', 'Register') }}</span>
          <span class="term-shortcut-cmd">pl new</span>
        </button>
        <button class="term-shortcut-btn" type="button" @click="emit('demo')">
          <span class="term-shortcut-title">{{ t('auth.action.demo', 'Demo') }}</span>
          <span class="term-shortcut-cmd">pl demo</span>
        </button>
      </div>
      <div class="term-shortcuts-subtitle">
        {{ helperCaption }}
      </div>
      <button class="term-back-btn" type="button" @click="emit('back')">
        {{ t('auth.back_to_showcase', 'Back to showcase') }}
      </button>
    </div>
    <div id="term-body">
      <div
        v-for="(line, index) in lines"
        :key="index"
        :class="['term-line', line.type ? `term-${line.type}` : '']"
      >
        {{ line.text }}
      </div>
      <div v-if="!closing" class="term-prompt-line">
        <span class="term-ps">pl/</span>
        <input
          ref="inputEl"
          v-model="inputValue"
          :type="isPasswordState ? 'password' : 'text'"
          autocomplete="off"
          :spellcheck="false"
          @keydown="onKeyDown"
        >
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AuthAccount, AuthSuccessResponse } from '@plainlist/shared';
import { DEMO_ACCOUNT } from '@plainlist/shared';
import { nextTick, onMounted, ref, watch } from 'vue';
import { useAuthStore } from '@/features/auth/model/useAuthStore';
import { useLocaleStore } from '@/features/locale/model/useLocaleStore';
import { useApi } from '@/shared/api/useApi';
import { useI18nStore } from '@/shared/i18n/useI18nStore';

type TerminalState = null | 'passphrase' | 'new-name' | 'new-pass' | 'onboard-name' | 'onboard-pass';
type LineType = '' | 'out' | 'ok' | 'err';

interface TerminalLine {
  text: string;
  type: LineType;
}

const emit = defineEmits<{
  login: [];
  demo: [];
  back: [];
}>();

const auth = useAuthStore();
const localeStore = useLocaleStore();
const i18n = useI18nStore();
const { get, post } = useApi();

const inputEl = ref<HTMLInputElement | null>(null);
const lines = ref<TerminalLine[]>([]);
const inputValue = ref('');
const state = ref<TerminalState>(null);
const pendingUser = ref<string | null>(null);
const pendingName = ref<string | null>(null);
const closing = ref(false);
const history = ref<string[]>([]);
const historyIndex = ref(-1);
const isPasswordState = ref(false);
const helperCaption = ref('');

function t(key: string, fallback: string, params?: Record<string, string | number>) {
  return i18n.t(key, fallback, params);
}

function setHelper(key: string, fallback: string, params?: Record<string, string | number>) {
  helperCaption.value = t(key, fallback, params);
}

function print(text = '', type: LineType = '') {
  lines.value.push({ text, type });
  nextTick(scrollToBottom);
}

function scrollToBottom() {
  const container = document.getElementById('auth-terminal');
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}

function focusInput() {
  inputEl.value?.focus();
}

function setPasswordMode(enabled: boolean) {
  isPasswordState.value = enabled;
}

function welcomeLines(): TerminalLine[] {
  return [
    { text: '', type: '' },
    { text: '  ____  _       _       _     _     _   ', type: '' },
    { text: ' |  _ \\| | __ _(_)_ __ | |   (_)___| |_ ', type: '' },
    { text: " | |_) | |/ _` | | '_ \\| |   | / __| __|", type: '' },
    { text: ' |  __/| | (_| | | | | | |___| \\__ \\ |_ ', type: '' },
    { text: ' |_|   |_|\\__,_|_|_| |_|_____|_|___/\\__|', type: '' },
    { text: '', type: '' },
    { text: t('auth.welcome', '  welcome to PlainList.'), type: 'out' },
    { text: t('auth.commands', '  commands:'), type: 'out' },
    { text: t('auth.command.login', '    pl cd <name>    log in to an account'), type: 'out' },
    { text: t('auth.command.register', '    pl new <name>   create an account'), type: 'out' },
    { text: t('auth.command.list', '    pl ls           list accounts'), type: 'out' },
    { text: t('auth.command.demo', '    pl demo         enter the prepared showcase account'), type: 'out' },
    { text: t('auth.command.onboard', '    pl onboard      guided setup'), type: 'out' },
    { text: t('auth.command.help', '    /help           show help'), type: 'out' },
    { text: t('auth.command.clear', '    /clear          clear terminal'), type: 'out' },
    { text: '', type: '' },
  ];
}

function showWelcome() {
  lines.value = [];
  setHelper('auth.helper.default', 'stay in the terminal, but start with a guided command.');
  const nextLines = welcomeLines();
  nextLines.forEach((line, index) => {
    window.setTimeout(() => {
      print(line.text, line.type);
      if (index === nextLines.length - 1) {
        nextTick(() => focusInput());
      }
    }, index * 20);
  });
}

async function listAccounts() {
  return get<AuthAccount[]>('/auth/accounts').catch(() => []);
}

function freezeInput(value: string) {
  const promptValue = isPasswordState.value ? '*'.repeat(Math.min(value.length, 20)) : value;
  lines.value.push({ text: `pl/ ${promptValue}`, type: '' });
}

function resetState() {
  state.value = null;
  pendingUser.value = null;
  pendingName.value = null;
  setPasswordMode(false);
  setHelper('auth.helper.default', 'stay in the terminal, but start with a guided command.');
}

function startPasswordPrompt(nextState: Extract<TerminalState, 'passphrase' | 'new-pass' | 'onboard-pass'>) {
  state.value = nextState;
  setPasswordMode(true);
  setHelper(
    nextState === 'passphrase' ? 'auth.helper.passphrase' : 'auth.helper.passphrase_new',
    nextState === 'passphrase'
      ? 'enter the passphrase and press Enter.'
      : 'choose a passphrase with at least 3 characters.',
  );
}

function isValidUsername(value: string) {
  return /^[a-zA-Z0-9_.-]{2,20}$/.test(value);
}

async function completeAuth(response: AuthSuccessResponse, username: string, messageLines: string[]) {
  auth.setAuth(response.token, username, response.isAdmin);
  messageLines.forEach((line) => print(line, 'ok'));
  print(t('auth.opening', '  opening dashboard...'), 'out');
  closing.value = true;
  resetState();
  emit('login');
}

async function handlePassphrase(value: string) {
  if (!pendingUser.value) {
    resetState();
    return;
  }

  try {
    const response = await post<AuthSuccessResponse>('/auth/login', {
      username: pendingUser.value,
      password: value,
    });
    await completeAuth(response, pendingUser.value, [
      t('auth.login_success', '  welcome back, {username}.', { username: pendingUser.value }),
    ]);
  } catch {
    print(t('auth.passphrase_wrong', '  incorrect passphrase.'), 'err');
    print(t('auth.passphrase_retry', '  try again or type pl cd <name>.'), 'out');
    resetState();
  }
}

async function handleNameEntry(value: string, onboard = false) {
  const normalized = value.toLowerCase();
  if (!isValidUsername(normalized)) {
    print(t('auth.username_invalid', '  usernames must be 2-20 chars using letters, numbers, _, ., or -.'), 'err');
    return;
  }

  const accounts = await listAccounts();
  if (accounts.some((account) => account.username === normalized)) {
    print(t('auth.username_taken', '  "{username}" is already taken.', { username: normalized }), 'err');
    return;
  }

  pendingName.value = normalized;
  startPasswordPrompt(onboard ? 'onboard-pass' : 'new-pass');
  print(t('auth.set_passphrase', '  set a passphrase (at least 3 chars):'), 'out');
}

async function loginDemoAccount() {
  try {
    const response = await post<AuthSuccessResponse>('/auth/login', {
      username: DEMO_ACCOUNT.username,
      password: DEMO_ACCOUNT.password,
    });
    await completeAuth(response, DEMO_ACCOUNT.username, [
      t('auth.demo_success', '  demo account ready. explore the dashboard.'),
    ]);
  } catch {
    print(t('auth.demo_failed', '  demo login failed. run the demo seed and try again.'), 'err');
    print(t('auth.demo_failed_hint', '  expected demo account: {username} / {password}', {
      username: DEMO_ACCOUNT.username,
      password: DEMO_ACCOUNT.password,
    }), 'out');
    resetState();
  }
}

async function handleRegistration(value: string, onboard = false) {
  if (!pendingName.value) {
    resetState();
    return;
  }

  if (value.length < 3) {
    print(t('auth.passphrase_short', '  passphrase must be at least 3 characters.'), 'err');
    return;
  }

  try {
    const response = await post<AuthSuccessResponse>('/auth/register', {
      username: pendingName.value,
      password: value,
    });

    const successLines = onboard
      ? [
          t('auth.onboard_success', '  all set, {username}.', { username: pendingName.value }),
          t('auth.onboard_next', '  head to the Day section to add your first habit or task.'),
        ]
      : [t('auth.register_success', '  account created. welcome, {username}.', { username: pendingName.value })];

    await completeAuth(response, pendingName.value, successLines);
  } catch (error) {
    print(
      `  ${error instanceof Error ? error.message : t('auth.registration_failed', 'registration failed.')}`,
      'err',
    );
    resetState();
  }
}

async function triggerShortcut(mode: 'login' | 'register') {
  resetState();
  focusInput();

  if (mode === 'login') {
    const accounts = await listAccounts();
    inputValue.value = 'pl cd ';
    setHelper('auth.helper.login', 'type an existing username after pl cd, then press Enter.');
    print(t('auth.quick_login', '  quick login armed. finish the command after "pl cd".'), 'out');
    if (accounts.length > 0) {
      print(
        t('auth.quick_login_available', '  available: {accounts}', {
          accounts: accounts.map((account) => account.username).join(', '),
        }),
        'out',
      );
    } else {
      print(t('auth.quick_login_empty', '  no accounts found yet. you can switch to Register instead.'), 'out');
    }
  } else {
    inputValue.value = 'pl new ';
    setHelper('auth.helper.register', 'type a new username after pl new, then press Enter.');
    print(t('auth.quick_register', '  quick register armed. finish the command after "pl new".'), 'out');
    print(t('auth.quick_register_next', '  you will be guided to choose a passphrase next.'), 'out');
  }

  await nextTick();
  inputEl.value?.setSelectionRange(inputValue.value.length, inputValue.value.length);
}

async function executeCommand(value: string) {
  if (state.value === 'passphrase') {
    await handlePassphrase(value);
    return;
  }

  if (state.value === 'new-name') {
    await handleNameEntry(value, false);
    return;
  }

  if (state.value === 'onboard-name') {
    await handleNameEntry(value, true);
    return;
  }

  if (state.value === 'new-pass') {
    await handleRegistration(value, false);
    return;
  }

  if (state.value === 'onboard-pass') {
    await handleRegistration(value, true);
    return;
  }

  if (value === '/help' || value === 'help') {
    print(t('auth.help_short', '  commands: pl cd, pl new, pl ls, pl onboard, /clear'), 'out');
    return;
  }

  if (value === '/clear' || value === 'clear') {
    lines.value = [];
    return;
  }

  if (!value.startsWith('pl ') && value !== 'pl') {
    print(t('auth.unknown_command', '  unknown command: {value}', { value }), 'err');
    print(t('auth.help_hint', '  type /help for available commands.'), 'out');
    return;
  }

  const [, sub = '', arg = ''] = value.match(/^pl(?:\s+([^\s]+))?(?:\s+(.+))?$/) ?? [];

  if (sub === 'ls') {
    const accounts = await listAccounts();
    if (accounts.length > 0) {
      print(
        t('auth.accounts', '  accounts: {accounts}', {
          accounts: accounts.map((account) => account.username).join(', '),
        }),
        'out',
      );
    } else {
      print(t('auth.no_accounts', '  no accounts yet.'), 'out');
    }
    return;
  }

  if (sub === 'demo') {
    await loginDemoAccount();
    return;
  }

  if (sub === 'onboard') {
    state.value = 'onboard-name';
    setHelper('auth.helper.onboard', 'choose a username to begin onboarding.');
    print(t('auth.username_onboard', "  let's get you set up. choose a username:"), 'out');
    return;
  }

  if (sub === 'cd') {
    const accounts = await listAccounts();
    if (!arg) {
      setHelper('auth.helper.login', 'type an existing username after pl cd, then press Enter.');
      if (accounts.length > 0) {
        print(
          t('auth.accounts', '  accounts: {accounts}', {
            accounts: accounts.map((account) => account.username).join(', '),
          }),
          'out',
        );
      } else {
        print(t('auth.no_accounts', '  no accounts yet.'), 'out');
      }
      print(t('auth.usage_login', '  usage: pl cd <name>'), 'out');
      return;
    }

    if (!accounts.some((account) => account.username === arg)) {
      print(t('auth.account_not_found', '  account "{username}" not found.', { username: arg }), 'err');
      return;
    }

    pendingUser.value = arg;
    startPasswordPrompt('passphrase');
    print(t('auth.passphrase_prompt', '  passphrase for {username}:', { username: arg }), 'out');
    return;
  }

  if (sub === 'new') {
    if (arg) {
      await handleNameEntry(arg, false);
      return;
    }

    state.value = 'new-name';
    setHelper('auth.helper.register', 'type a new username after pl new, then press Enter.');
    print(t('auth.username_prompt', '  choose a username:'), 'out');
    return;
  }

  if (sub === 'graphic') {
    print(t('auth.graphic_unavailable', '  graphical mode is not available in this build.'), 'out');
    return;
  }

  print(t('auth.unknown_subcommand', '  unknown subcommand: pl {value}', { value: sub }), 'err');
  print(t('auth.help_hint', '  type /help for available commands.'), 'out');
}

async function onKeyDown(event: KeyboardEvent) {
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    if (historyIndex.value < history.value.length - 1) {
      historyIndex.value += 1;
      inputValue.value = history.value[historyIndex.value];
    }
    return;
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    if (historyIndex.value > 0) {
      historyIndex.value -= 1;
      inputValue.value = history.value[historyIndex.value];
    } else {
      historyIndex.value = -1;
      inputValue.value = '';
    }
    return;
  }

  if (event.key !== 'Enter') {
    return;
  }

  const value = inputValue.value.trim();
  if (!value) {
    return;
  }

  freezeInput(value);
  if (!isPasswordState.value) {
    history.value.unshift(value);
    historyIndex.value = -1;
  }

  inputValue.value = '';
  await executeCommand(value);
  nextTick(scrollToBottom);
}

watch(
  () => localeStore.locale,
  () => {
    if (!history.value.length && state.value === null) {
      showWelcome();
      return;
    }
    setHelper('auth.helper.default', 'stay in the terminal, but start with a guided command.');
  },
);

onMounted(() => {
  showWelcome();
});
</script>
