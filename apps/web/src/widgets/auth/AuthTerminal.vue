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
        >
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AuthAccount, AuthSuccessResponse } from '@plainlist/shared';
import { DEMO_ACCOUNT } from '@plainlist/shared';
import { nextTick, onMounted, ref } from 'vue';
import { useAuthStore } from '@/features/auth/model/useAuthStore';
import { useApi } from '@/shared/api/useApi';

type TerminalState = null | 'passphrase' | 'new-name' | 'new-pass';
type LineType = '' | 'out' | 'ok' | 'err';

interface TerminalLine {
  text: string;
  type: LineType;
}

const emit = defineEmits<{
  login: [];
  graphic: [];
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

const BANNER: string[] = [
  '  ____  _       _       _     _     _   ',
  ' |  _ \\| | __ _(_)_ __ | |   (_)___| |_ ',
  " | |_) | |/ _` | | '_ \\| |   | / __| __|",
  ' |  __/| | (_| | | | | | |___| \\__ \\ |_ ',
  ' |_|   |_|\\__,_|_|_| |_|_____|_|___/\\__|',
];

const WELCOME_BODY: string[] = [
  'welcome to PlainList.',
  '',
  'a radically minimal tool site that integrates',
  'habit tracking, event reminders, todo lists,',
  'and even simple calendar annotations -- all in',
  'one plain page.',
  '',
  "it may feel unfamiliar at first, but once you",
  "get the hang of it, you'll discover the",
  'efficiency and intent behind every design choice.',
];

// 用纯字符把欢迎语裱进一个方框里，宽度按最长内容自动撑开，避免手工对齐错位。
function framedBox(content: string[], pad = 2, indent = ' '): string[] {
  const width = content.reduce((max, line) => Math.max(max, line.length), 0);
  const bar = '─'.repeat(width + pad * 2);
  const lines = [`${indent}┌${bar}┐`];
  for (const line of content) {
    const right = ' '.repeat(width - line.length);
    lines.push(`${indent}│${' '.repeat(pad)}${line}${right}${' '.repeat(pad)}│`);
  }
  lines.push(`${indent}└${bar}┘`);
  return lines;
}

function welcomeLines(): TerminalLine[] {
  const lines: TerminalLine[] = [{ text: '', type: '' }];
  BANNER.forEach((text) => lines.push({ text, type: '' }));
  lines.push({ text: '', type: '' });
  framedBox(WELCOME_BODY).forEach((text) => lines.push({ text, type: 'out' }));
  lines.push({ text: '', type: '' });
  lines.push({ text: '  quick start:', type: 'out' });
  lines.push({ text: '    pl cd <name>     log in', type: 'out' });
  lines.push({ text: '    pl new <name>    create account', type: 'out' });
  lines.push({ text: '    pl onboard       guided setup', type: 'out' });
  lines.push({ text: '    pl guide         open the visual guide', type: 'out' });
  lines.push({ text: '  type /help to see all available commands.', type: 'out' });
  lines.push({ text: '', type: '' });
  return lines;
}

function helpLines(): TerminalLine[] {
  return [
    { text: '', type: '' },
    { text: '  commands:', type: 'out' },
    { text: '    cd <name>      log in to an existing account', type: 'out' },
    { text: '    ls             list all accounts', type: 'out' },
    { text: '    new <name>     create a new account', type: 'out' },
    { text: '    pl onboard      guided account setup', type: 'out' },
    { text: '    pl guide        open the visual product guide', type: 'out' },
    { text: '    pl graphic      switch to the graphical interface', type: 'out' },
    { text: '    pl contr        show contributors', type: 'out' },
    { text: '    demo           enter the seeded demo account', type: 'out' },
    { text: '    clear          clear the terminal', type: 'out' },
    { text: '    /help          show this help', type: 'out' },
    { text: '  tip: every command also works with a leading "pl " prefix.', type: 'out' },
    { text: '', type: '' },
  ];
}

function showWelcome() {
  lines.value = [];
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
}

function startPasswordPrompt(nextState: Extract<TerminalState, 'passphrase' | 'new-pass'>) {
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
    await completeAuth(response, pendingUser.value, [
      `  welcome back, ${pendingUser.value}.`,
    ]);
  } catch {
    print('  incorrect passphrase.', 'err');
    print('  try again or type cd <name>.', 'out');
    resetState();
  }
}

async function handleNameEntry(value: string) {
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
  startPasswordPrompt('new-pass');
  print('  set a passphrase (at least 3 chars):', 'out');
}

async function loginDemoAccount() {
  try {
    const response = await post<AuthSuccessResponse>('/auth/login', {
      username: DEMO_ACCOUNT.username,
      password: DEMO_ACCOUNT.password,
    });
    await completeAuth(response, DEMO_ACCOUNT.username, [
      '  demo account ready. explore the dashboard.',
    ]);
  } catch {
    print('  demo login failed. run the demo seed and try again.', 'err');
    print(`  expected demo account: ${DEMO_ACCOUNT.username} / ${DEMO_ACCOUNT.password}`, 'out');
    resetState();
  }
}

async function handleRegistration(value: string) {
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

    const successLines = [
      `  account created. welcome, ${pendingName.value}.`,
    ];

    await completeAuth(response, pendingName.value, successLines);
  } catch (error) {
    print(
      `  ${error instanceof Error ? error.message : 'registration failed.'}`,
      'err',
    );
    resetState();
  }
}

async function executeCommand(rawValue: string) {
  const value = rawValue.startsWith('pl ') ? rawValue.slice(3).trim() : rawValue;

  if (state.value === 'passphrase') {
    await handlePassphrase(value);
    return;
  }

  if (state.value === 'new-name') {
    await handleNameEntry(value);
    return;
  }

  if (state.value === 'new-pass') {
    await handleRegistration(value);
    return;
  }

  if (value === 'help' || value === '/help') {
    helpLines().forEach((line) => print(line.text, line.type));
    return;
  }

  if (value === 'clear' || value === '/clear') {
    lines.value = [];
    return;
  }

  if (value === 'ls') {
    const accounts = await listAccounts();
    if (accounts.length > 0) {
      print(
        `  accounts: ${accounts.map((account) => account.username).join(', ')}`,
        'out',
      );
    } else {
      print('  no accounts yet.', 'out');
    }
    return;
  }

  if (value === 'demo') {
    await loginDemoAccount();
    return;
  }

  if (value === 'onboard') {
    state.value = 'new-name';
    print("  let's get you set up.", 'out');
    print('  choose a username:', 'out');
    return;
  }

  if (value === 'guide' || value === '/guide') {
    print('  opening visual guide...', 'out');
    window.open('/guide.html', '_blank');
    return;
  }

  if (value === 'graphic') {
    print('  switching to graphical interface...', 'out');
    emit('graphic');
    return;
  }

  if (value === 'contr') {
    print('', 'out');
    print('  contributors:', 'out');
    print('    rainhuang', 'out');
    print('    HuRong Wang', 'out');
    print('', 'out');
    return;
  }

  // Handle "cd <name>" command
  if (value.startsWith('cd ')) {
    const arg = value.slice(3).trim();
    if (!arg) {
      print('  usage: cd <name>', 'out');
      return;
    }

    const accounts = await listAccounts();
    if (!accounts.some((account) => account.username === arg)) {
      print(`  account "${arg}" not found.`, 'err');
      return;
    }

    pendingUser.value = arg;
    startPasswordPrompt('passphrase');
    print(`  passphrase for ${arg}:`, 'out');
    return;
  }

  if (value === 'cd') {
    const accounts = await listAccounts();
    if (accounts.length > 0) {
      print(`  accounts: ${accounts.map((account) => account.username).join(', ')}`, 'out');
    } else {
      print('  no accounts yet.', 'out');
    }
    print('  usage: cd <name>', 'out');
    return;
  }

  // Handle "new <name>" command
  if (value.startsWith('new ')) {
    const arg = value.slice(4).trim();
    if (arg) {
      await handleNameEntry(arg);
      return;
    }
  }

  if (value === 'new') {
    state.value = 'new-name';
    print('  choose a username:', 'out');
    return;
  }

  print(`  unknown command: ${value}`, 'err');
  print('  type help for available commands.', 'out');
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
