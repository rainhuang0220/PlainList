/// <reference types="D:/jisuanjisheji/PlainList/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="D:/jisuanjisheji/PlainList/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { DEMO_ACCOUNT } from '@plainlist/shared';
import { nextTick, onMounted, ref, watch } from 'vue';
import { useAuthStore } from '@/features/auth/model/useAuthStore';
import { useLocaleStore } from '@/features/locale/model/useLocaleStore';
import { useApi } from '@/shared/api/useApi';
import { useI18nStore } from '@/shared/i18n/useI18nStore';
const emit = defineEmits();
const auth = useAuthStore();
const localeStore = useLocaleStore();
const i18n = useI18nStore();
const { get, post } = useApi();
const inputEl = ref(null);
const lines = ref([]);
const inputValue = ref('');
const state = ref(null);
const pendingUser = ref(null);
const pendingName = ref(null);
const closing = ref(false);
const history = ref([]);
const historyIndex = ref(-1);
const isPasswordState = ref(false);
const helperCaption = ref('');
function t(key, fallback, params) {
    return i18n.t(key, fallback, params);
}
function setHelper(key, fallback, params) {
    helperCaption.value = t(key, fallback, params);
}
function print(text = '', type = '') {
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
function setPasswordMode(enabled) {
    isPasswordState.value = enabled;
}
function welcomeLines() {
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
    return get('/auth/accounts').catch(() => []);
}
function freezeInput(value) {
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
function startPasswordPrompt(nextState) {
    state.value = nextState;
    setPasswordMode(true);
    setHelper(nextState === 'passphrase' ? 'auth.helper.passphrase' : 'auth.helper.passphrase_new', nextState === 'passphrase'
        ? 'enter the passphrase and press Enter.'
        : 'choose a passphrase with at least 3 characters.');
}
function isValidUsername(value) {
    return /^[a-zA-Z0-9_.-]{2,20}$/.test(value);
}
async function completeAuth(response, username, messageLines) {
    auth.setAuth(response.token, username, response.isAdmin);
    messageLines.forEach((line) => print(line, 'ok'));
    print(t('auth.opening', '  opening dashboard...'), 'out');
    closing.value = true;
    resetState();
    emit('login');
}
async function handlePassphrase(value) {
    if (!pendingUser.value) {
        resetState();
        return;
    }
    try {
        const response = await post('/auth/login', {
            username: pendingUser.value,
            password: value,
        });
        await completeAuth(response, pendingUser.value, [
            t('auth.login_success', '  welcome back, {username}.', { username: pendingUser.value }),
        ]);
    }
    catch {
        print(t('auth.passphrase_wrong', '  incorrect passphrase.'), 'err');
        print(t('auth.passphrase_retry', '  try again or type pl cd <name>.'), 'out');
        resetState();
    }
}
async function handleNameEntry(value, onboard = false) {
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
        const response = await post('/auth/login', {
            username: DEMO_ACCOUNT.username,
            password: DEMO_ACCOUNT.password,
        });
        await completeAuth(response, DEMO_ACCOUNT.username, [
            t('auth.demo_success', '  demo account ready. explore the dashboard.'),
        ]);
    }
    catch {
        print(t('auth.demo_failed', '  demo login failed. run the demo seed and try again.'), 'err');
        print(t('auth.demo_failed_hint', '  expected demo account: {username} / {password}', {
            username: DEMO_ACCOUNT.username,
            password: DEMO_ACCOUNT.password,
        }), 'out');
        resetState();
    }
}
async function handleRegistration(value, onboard = false) {
    if (!pendingName.value) {
        resetState();
        return;
    }
    if (value.length < 3) {
        print(t('auth.passphrase_short', '  passphrase must be at least 3 characters.'), 'err');
        return;
    }
    try {
        const response = await post('/auth/register', {
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
    }
    catch (error) {
        print(`  ${error instanceof Error ? error.message : t('auth.registration_failed', 'registration failed.')}`, 'err');
        resetState();
    }
}
async function triggerShortcut(mode) {
    resetState();
    focusInput();
    if (mode === 'login') {
        const accounts = await listAccounts();
        inputValue.value = 'pl cd ';
        setHelper('auth.helper.login', 'type an existing username after pl cd, then press Enter.');
        print(t('auth.quick_login', '  quick login armed. finish the command after "pl cd".'), 'out');
        if (accounts.length > 0) {
            print(t('auth.quick_login_available', '  available: {accounts}', {
                accounts: accounts.map((account) => account.username).join(', '),
            }), 'out');
        }
        else {
            print(t('auth.quick_login_empty', '  no accounts found yet. you can switch to Register instead.'), 'out');
        }
    }
    else {
        inputValue.value = 'pl new ';
        setHelper('auth.helper.register', 'type a new username after pl new, then press Enter.');
        print(t('auth.quick_register', '  quick register armed. finish the command after "pl new".'), 'out');
        print(t('auth.quick_register_next', '  you will be guided to choose a passphrase next.'), 'out');
    }
    await nextTick();
    inputEl.value?.setSelectionRange(inputValue.value.length, inputValue.value.length);
}
async function executeCommand(value) {
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
            print(t('auth.accounts', '  accounts: {accounts}', {
                accounts: accounts.map((account) => account.username).join(', '),
            }), 'out');
        }
        else {
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
                print(t('auth.accounts', '  accounts: {accounts}', {
                    accounts: accounts.map((account) => account.username).join(', '),
                }), 'out');
            }
            else {
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
async function onKeyDown(event) {
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
        }
        else {
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
watch(() => localeStore.locale, () => {
    if (!history.value.length && state.value === null) {
        showWelcome();
        return;
    }
    setHelper('auth.helper.default', 'stay in the terminal, but start with a guided command.');
});
onMounted(() => {
    showWelcome();
});
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onClick: (__VLS_ctx.focusInput) },
    id: "auth-terminal",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onClick: () => { } },
    ...{ class: "term-shortcuts" },
});
/** @type {__VLS_StyleScopedClasses['term-shortcuts']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "term-shortcuts-top" },
});
/** @type {__VLS_StyleScopedClasses['term-shortcuts-top']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "term-shortcuts-label" },
});
/** @type {__VLS_StyleScopedClasses['term-shortcuts-label']} */ ;
(__VLS_ctx.t('auth.quick_access', '// quick access'));
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.localeStore.toggleLocale();
            // @ts-ignore
            [focusInput, t, localeStore,];
        } },
    ...{ class: "term-locale-btn" },
    type: "button",
    title: (__VLS_ctx.t('nav.language', 'Language')),
});
/** @type {__VLS_StyleScopedClasses['term-locale-btn']} */ ;
(__VLS_ctx.localeStore.switchLabel);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "term-shortcuts-actions" },
});
/** @type {__VLS_StyleScopedClasses['term-shortcuts-actions']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.triggerShortcut('login');
            // @ts-ignore
            [t, localeStore, triggerShortcut,];
        } },
    ...{ class: "term-shortcut-btn" },
    type: "button",
});
/** @type {__VLS_StyleScopedClasses['term-shortcut-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "term-shortcut-title" },
});
/** @type {__VLS_StyleScopedClasses['term-shortcut-title']} */ ;
(__VLS_ctx.t('auth.action.login', 'Login'));
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "term-shortcut-cmd" },
});
/** @type {__VLS_StyleScopedClasses['term-shortcut-cmd']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.triggerShortcut('register');
            // @ts-ignore
            [t, triggerShortcut,];
        } },
    ...{ class: "term-shortcut-btn" },
    type: "button",
});
/** @type {__VLS_StyleScopedClasses['term-shortcut-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "term-shortcut-title" },
});
/** @type {__VLS_StyleScopedClasses['term-shortcut-title']} */ ;
(__VLS_ctx.t('auth.action.register', 'Register'));
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "term-shortcut-cmd" },
});
/** @type {__VLS_StyleScopedClasses['term-shortcut-cmd']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.emit('demo');
            // @ts-ignore
            [t, emit,];
        } },
    ...{ class: "term-shortcut-btn" },
    type: "button",
});
/** @type {__VLS_StyleScopedClasses['term-shortcut-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "term-shortcut-title" },
});
/** @type {__VLS_StyleScopedClasses['term-shortcut-title']} */ ;
(__VLS_ctx.t('auth.action.demo', 'Demo'));
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "term-shortcut-cmd" },
});
/** @type {__VLS_StyleScopedClasses['term-shortcut-cmd']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "term-shortcuts-subtitle" },
});
/** @type {__VLS_StyleScopedClasses['term-shortcuts-subtitle']} */ ;
(__VLS_ctx.helperCaption);
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.emit('back');
            // @ts-ignore
            [t, emit, helperCaption,];
        } },
    ...{ class: "term-back-btn" },
    type: "button",
});
/** @type {__VLS_StyleScopedClasses['term-back-btn']} */ ;
(__VLS_ctx.t('auth.back_to_showcase', 'Back to showcase'));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    id: "term-body",
});
for (const [line, index] of __VLS_vFor((__VLS_ctx.lines))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        key: (index),
        ...{ class: (['term-line', line.type ? `term-${line.type}` : '']) },
    });
    /** @type {__VLS_StyleScopedClasses['term-line']} */ ;
    (line.text);
    // @ts-ignore
    [t, lines,];
}
if (!__VLS_ctx.closing) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "term-prompt-line" },
    });
    /** @type {__VLS_StyleScopedClasses['term-prompt-line']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "term-ps" },
    });
    /** @type {__VLS_StyleScopedClasses['term-ps']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input, __VLS_intrinsics.input)({
        ...{ onKeydown: (__VLS_ctx.onKeyDown) },
        ref: "inputEl",
        type: (__VLS_ctx.isPasswordState ? 'password' : 'text'),
        autocomplete: "off",
        spellcheck: (false),
    });
    (__VLS_ctx.inputValue);
}
// @ts-ignore
[closing, onKeyDown, isPasswordState, inputValue,];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
});
export default {};
