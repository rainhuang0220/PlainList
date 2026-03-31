<template>
  <div id="auth-terminal" @click="focusInput">
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
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AuthAccount, AuthSuccessResponse } from '@plainlist/shared';
import { nextTick, onMounted, ref } from 'vue';
import { useAuthStore } from '@/features/auth/model/useAuthStore';
import { useApi } from '@/shared/api/useApi';

type TerminalState = null | 'passphrase' | 'new-name' | 'new-pass' | 'onboard-name' | 'onboard-pass';
type LineType = '' | 'out' | 'ok' | 'err';

interface TerminalLine {
  text: string;
  type: LineType;
}

const emit = defineEmits<{
  login: [];
}>();

const auth = useAuthStore();
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
    { text: '  welcome to PlainList.', type: 'out' },
    { text: '  commands:', type: 'out' },
    { text: '    pl cd <name>    log in to an account', type: 'out' },
    { text: '    pl new <name>   create an account', type: 'out' },
    { text: '    pl ls           list accounts', type: 'out' },
    { text: '    pl onboard      guided setup', type: 'out' },
    { text: '    /help           show help', type: 'out' },
    { text: '    /clear          clear terminal', type: 'out' },
    { text: '', type: '' },
  ];
}

function showWelcome() {
  lines.value = [];
  welcomeLines().forEach((line, index) => {
    window.setTimeout(() => {
      print(line.text, line.type);
      if (index === welcomeLines().length - 1) {
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
}

function startPasswordPrompt(nextState: Extract<TerminalState, 'passphrase' | 'new-pass' | 'onboard-pass'>) {
  state.value = nextState;
  setPasswordMode(true);
}

function isValidUsername(value: string) {
  return /^[a-zA-Z0-9_.-]{2,20}$/.test(value);
}

async function completeAuth(response: AuthSuccessResponse, username: string, messageLines: string[]) {
  auth.setAuth(response.token, username, response.isAdmin);
  messageLines.forEach((line) => print(line, 'ok'));
  print('  opening dashboard...', 'out');
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
    await completeAuth(response, pendingUser.value, [`  welcome back, ${pendingUser.value}.`]);
  } catch {
    print('  incorrect passphrase.', 'err');
    print('  try again or type pl cd <name>.', 'out');
    resetState();
  }
}

async function handleNameEntry(value: string, onboard = false) {
  const normalized = value.toLowerCase();
  if (!isValidUsername(normalized)) {
    print('  usernames must be 2-20 chars using letters, numbers, _, ., or -.', 'err');
    return;
  }

  const accounts = await listAccounts();
  if (accounts.some((account) => account.username === normalized)) {
    print(`  "${normalized}" is already taken.`, 'err');
    return;
  }

  pendingName.value = normalized;
  startPasswordPrompt(onboard ? 'onboard-pass' : 'new-pass');
  print('  set a passphrase (at least 3 chars):', 'out');
}

async function handleRegistration(value: string, onboard = false) {
  if (!pendingName.value) {
    resetState();
    return;
  }

  if (value.length < 3) {
    print('  passphrase must be at least 3 characters.', 'err');
    return;
  }

  try {
    const response = await post<AuthSuccessResponse>('/auth/register', {
      username: pendingName.value,
      password: value,
    });
    const successLines = onboard
      ? [`  all set, ${pendingName.value}.`, '  head to the Day section to add your first habit or task.']
      : [`  account created. welcome, ${pendingName.value}.`];
    await completeAuth(response, pendingName.value, successLines);
  } catch (error) {
    print(`  ${error instanceof Error ? error.message : 'registration failed.'}`, 'err');
    resetState();
  }
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
    print('  commands: pl cd, pl new, pl ls, pl onboard, /clear', 'out');
    return;
  }

  if (value === '/clear' || value === 'clear') {
    lines.value = [];
    return;
  }

  if (!value.startsWith('pl ') && value !== 'pl') {
    print(`  unknown command: ${value}`, 'err');
    print('  type /help for available commands.', 'out');
    return;
  }

  const [, sub = '', arg = ''] = value.match(/^pl(?:\s+([^\s]+))?(?:\s+(.+))?$/) ?? [];

  if (sub === 'ls') {
    const accounts = await listAccounts();
    print(accounts.length ? `  accounts: ${accounts.map((account) => account.username).join(', ')}` : '  no accounts yet.', 'out');
    return;
  }

  if (sub === 'onboard') {
    state.value = 'onboard-name';
    print("  let's get you set up. choose a username:", 'out');
    return;
  }

  if (sub === 'cd') {
    const accounts = await listAccounts();
    if (!arg) {
      print(accounts.length ? `  accounts: ${accounts.map((account) => account.username).join(', ')}` : '  no accounts yet.', 'out');
      print('  usage: pl cd <name>', 'out');
      return;
    }

    if (!accounts.some((account) => account.username === arg)) {
      print(`  account "${arg}" not found. try pl ls.`, 'err');
      return;
    }

    pendingUser.value = arg;
    startPasswordPrompt('passphrase');
    print(`  passphrase for ${arg}:`, 'out');
    return;
  }

  if (sub === 'new') {
    if (arg) {
      await handleNameEntry(arg, false);
      return;
    }

    state.value = 'new-name';
    print('  choose a username:', 'out');
    return;
  }

  if (sub === 'graphic') {
    print('  graphical mode is not available in this build.', 'out');
    return;
  }

  print(`  unknown subcommand: pl ${sub}`, 'err');
  print('  type /help for available commands.', 'out');
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

onMounted(() => {
  showWelcome();
});
</script>
