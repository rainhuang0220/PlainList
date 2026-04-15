/// <reference types="D:/jisuanjisheji/PlainList/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="D:/jisuanjisheji/PlainList/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { DEMO_ACCOUNT } from '@plainlist/shared';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useAuthStore } from '@/features/auth/model/useAuthStore';
import { useChecksStore } from '@/features/checks/model/useChecksStore';
import { useLocaleStore } from '@/features/locale/model/useLocaleStore';
import { usePlansStore } from '@/features/plans/model/usePlansStore';
import { usePluginsStore } from '@/features/plugins/model/usePluginsStore';
import { useApi } from '@/shared/api/useApi';
import { useI18nStore } from '@/shared/i18n/useI18nStore';
import AuthTerminal from '@/widgets/auth/AuthTerminal.vue';
import ShowcaseHome from '@/widgets/auth/ShowcaseHome.vue';
import PluginStore from '@/widgets/plugins/PluginStore.vue';
import CalendarSection from '@/widgets/sections/CalendarSection.vue';
import ClockSection from '@/widgets/sections/ClockSection.vue';
import PlansSection from '@/widgets/sections/PlansSection.vue';
import TrackerSection from '@/widgets/sections/TrackerSection.vue';
import WeekSection from '@/widgets/sections/WeekSection.vue';
const auth = useAuthStore();
const plans = usePlansStore();
const checks = useChecksStore();
const localeStore = useLocaleStore();
const pluginsStore = usePluginsStore();
const i18n = useI18nStore();
const { get, post } = useApi();
const pluginStoreOpen = ref(false);
const entryMode = ref('showcase');
const activeSection = ref('s1');
const isDashboardLoading = ref(false);
const dashboardReady = ref(false);
watch(() => localeStore.locale, (locale) => {
    i18n.setLocale(locale);
}, { immediate: true });
const sections = computed(() => [
    { id: 's1', label: i18n.t('nav.now', 'Now') },
    { id: 's2', label: i18n.t('nav.day', 'Day') },
    { id: 's3', label: i18n.t('nav.week', 'Week') },
    { id: 's4', label: i18n.t('nav.month', 'Month') },
    { id: 's5', label: i18n.t('nav.year', 'Year') },
]);
const loaderText = computed(() => i18n.t('app.loader', 'Loading your dashboard...'));
function t(key, fallback) {
    return i18n.t(key, fallback);
}
function openTerminal() {
    entryMode.value = 'terminal';
}
function openShowcase() {
    entryMode.value = 'showcase';
}
async function loginDemo() {
    try {
        const response = await post('/auth/login', {
            username: DEMO_ACCOUNT.username,
            password: DEMO_ACCOUNT.password,
        });
        auth.setAuth(response.token, response.username, response.isAdmin);
        await loadDashboard();
    }
    catch {
        entryMode.value = 'terminal';
    }
}
function scrollTo(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    activeSection.value = id;
}
let scrollTimer = null;
function onScroll() {
    if (scrollTimer !== null) {
        window.clearTimeout(scrollTimer);
    }
    scrollTimer = window.setTimeout(() => {
        for (const section of [...sections.value].reverse()) {
            const element = document.getElementById(section.id);
            if (element && element.getBoundingClientRect().top <= 80) {
                activeSection.value = section.id;
                return;
            }
        }
        activeSection.value = 's1';
    }, 50);
}
async function loadDashboard() {
    isDashboardLoading.value = true;
    dashboardReady.value = false;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    try {
        await pluginsStore.loadAvailable();
        await Promise.all([
            plans.fetch(),
            checks.fetchMonth(year, month),
            checks.fetchMonth(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1),
            pluginsStore.loadInstalled(),
        ]);
        await pluginsStore.loadActiveTheme();
    }
    finally {
        window.setTimeout(() => {
            isDashboardLoading.value = false;
            window.requestAnimationFrame(() => {
                dashboardReady.value = true;
            });
        }, 220);
    }
}
async function onLogin() {
    await loadDashboard();
}
async function logout() {
    dashboardReady.value = false;
    isDashboardLoading.value = false;
    plans.clear();
    checks.clear();
    pluginsStore.clear();
    auth.logout();
    entryMode.value = 'showcase';
}
function onPluginStoreClose() {
    pluginStoreOpen.value = false;
    if (pluginsStore.previewing) {
        pluginsStore.revertTheme();
    }
}
onMounted(async () => {
    window.addEventListener('scroll', onScroll);
    if (auth.token) {
        try {
            const me = await get('/auth/me');
            auth.setAuth(auth.token, me.username, me.isAdmin);
            await loadDashboard();
        }
        catch {
            dashboardReady.value = false;
            isDashboardLoading.value = false;
            auth.logout();
            entryMode.value = 'showcase';
        }
    }
});
onUnmounted(() => {
    window.removeEventListener('scroll', onScroll);
});
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    id: "app-root",
    ...{ class: ({ 'dashboard-ready': __VLS_ctx.dashboardReady }) },
});
/** @type {__VLS_StyleScopedClasses['dashboard-ready']} */ ;
if (!__VLS_ctx.auth.isLoggedIn) {
    if (__VLS_ctx.entryMode === 'showcase') {
        const __VLS_0 = ShowcaseHome;
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
            ...{ 'onLogin': {} },
            ...{ 'onDemo': {} },
        }));
        const __VLS_2 = __VLS_1({
            ...{ 'onLogin': {} },
            ...{ 'onDemo': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
        let __VLS_5;
        const __VLS_6 = ({ login: {} },
            { onLogin: (__VLS_ctx.openTerminal) });
        const __VLS_7 = ({ demo: {} },
            { onDemo: (__VLS_ctx.loginDemo) });
        var __VLS_3;
        var __VLS_4;
    }
    else {
        const __VLS_8 = AuthTerminal;
        // @ts-ignore
        const __VLS_9 = __VLS_asFunctionalComponent1(__VLS_8, new __VLS_8({
            ...{ 'onLogin': {} },
            ...{ 'onDemo': {} },
            ...{ 'onBack': {} },
        }));
        const __VLS_10 = __VLS_9({
            ...{ 'onLogin': {} },
            ...{ 'onDemo': {} },
            ...{ 'onBack': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_9));
        let __VLS_13;
        const __VLS_14 = ({ login: {} },
            { onLogin: (__VLS_ctx.onLogin) });
        const __VLS_15 = ({ demo: {} },
            { onDemo: (__VLS_ctx.loginDemo) });
        const __VLS_16 = ({ back: {} },
            { onBack: (__VLS_ctx.openShowcase) });
        var __VLS_11;
        var __VLS_12;
    }
}
else {
    let __VLS_17;
    /** @ts-ignore @type {typeof __VLS_components.Transition | typeof __VLS_components.Transition} */
    Transition;
    // @ts-ignore
    const __VLS_18 = __VLS_asFunctionalComponent1(__VLS_17, new __VLS_17({
        name: "loader-fade",
    }));
    const __VLS_19 = __VLS_18({
        name: "loader-fade",
    }, ...__VLS_functionalComponentArgsRest(__VLS_18));
    const { default: __VLS_22 } = __VLS_20.slots;
    if (__VLS_ctx.isDashboardLoading) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "app-loader" },
        });
        /** @type {__VLS_StyleScopedClasses['app-loader']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "app-loader-panel" },
        });
        /** @type {__VLS_StyleScopedClasses['app-loader-panel']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "app-loader-label" },
        });
        /** @type {__VLS_StyleScopedClasses['app-loader-label']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "app-loader-track" },
        });
        /** @type {__VLS_StyleScopedClasses['app-loader-track']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "app-loader-fill" },
        });
        /** @type {__VLS_StyleScopedClasses['app-loader-fill']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "app-loader-text" },
        });
        /** @type {__VLS_StyleScopedClasses['app-loader-text']} */ ;
        (__VLS_ctx.loaderText);
    }
    // @ts-ignore
    [dashboardReady, auth, entryMode, openTerminal, loginDemo, loginDemo, onLogin, openShowcase, isDashboardLoading, loaderText,];
    var __VLS_20;
    __VLS_asFunctionalElement1(__VLS_intrinsics.nav, __VLS_intrinsics.nav)({
        ...{ class: "app-nav" },
    });
    /** @type {__VLS_StyleScopedClasses['app-nav']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "nav-logo" },
    });
    /** @type {__VLS_StyleScopedClasses['nav-logo']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "nav-links" },
    });
    /** @type {__VLS_StyleScopedClasses['nav-links']} */ ;
    for (const [section] of __VLS_vFor((__VLS_ctx.sections))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.a, __VLS_intrinsics.a)({
            ...{ onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.auth.isLoggedIn))
                        return;
                    __VLS_ctx.scrollTo(section.id);
                    // @ts-ignore
                    [sections, scrollTo,];
                } },
            key: (section.id),
            href: (`#${section.id}`),
            ...{ class: ({ active: __VLS_ctx.activeSection === section.id }) },
        });
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        (section.label);
        // @ts-ignore
        [activeSection,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "nav-right" },
    });
    /** @type {__VLS_StyleScopedClasses['nav-right']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        id: "nav-user",
    });
    (__VLS_ctx.auth.currentUser);
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(!__VLS_ctx.auth.isLoggedIn))
                    return;
                __VLS_ctx.localeStore.toggleLocale();
                // @ts-ignore
                [auth, localeStore,];
            } },
        id: "nav-locale",
        title: (__VLS_ctx.t('nav.language', 'Language')),
    });
    (__VLS_ctx.localeStore.switchLabel);
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(!__VLS_ctx.auth.isLoggedIn))
                    return;
                __VLS_ctx.pluginStoreOpen = true;
                // @ts-ignore
                [localeStore, t, pluginStoreOpen,];
            } },
        id: "nav-plugins",
        title: (__VLS_ctx.t('plugins.title', 'Plugins')),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.logout) },
        id: "nav-logout",
    });
    (__VLS_ctx.t('nav.lock', 'lock'));
    const __VLS_23 = ClockSection;
    // @ts-ignore
    const __VLS_24 = __VLS_asFunctionalComponent1(__VLS_23, new __VLS_23({
        id: "s1",
        ...{ class: "app-section" },
        ...{ style: {} },
    }));
    const __VLS_25 = __VLS_24({
        id: "s1",
        ...{ class: "app-section" },
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_24));
    /** @type {__VLS_StyleScopedClasses['app-section']} */ ;
    const __VLS_28 = PlansSection;
    // @ts-ignore
    const __VLS_29 = __VLS_asFunctionalComponent1(__VLS_28, new __VLS_28({
        id: "s2",
        ...{ class: "app-section" },
        ...{ style: {} },
    }));
    const __VLS_30 = __VLS_29({
        id: "s2",
        ...{ class: "app-section" },
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_29));
    /** @type {__VLS_StyleScopedClasses['app-section']} */ ;
    const __VLS_33 = WeekSection;
    // @ts-ignore
    const __VLS_34 = __VLS_asFunctionalComponent1(__VLS_33, new __VLS_33({
        id: "s3",
        ...{ class: "app-section" },
        ...{ style: {} },
    }));
    const __VLS_35 = __VLS_34({
        id: "s3",
        ...{ class: "app-section" },
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_34));
    /** @type {__VLS_StyleScopedClasses['app-section']} */ ;
    const __VLS_38 = TrackerSection;
    // @ts-ignore
    const __VLS_39 = __VLS_asFunctionalComponent1(__VLS_38, new __VLS_38({
        id: "s4",
        ...{ class: "app-section" },
        ...{ style: {} },
    }));
    const __VLS_40 = __VLS_39({
        id: "s4",
        ...{ class: "app-section" },
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_39));
    /** @type {__VLS_StyleScopedClasses['app-section']} */ ;
    const __VLS_43 = CalendarSection;
    // @ts-ignore
    const __VLS_44 = __VLS_asFunctionalComponent1(__VLS_43, new __VLS_43({
        id: "s5",
        ...{ class: "app-section" },
        ...{ style: {} },
    }));
    const __VLS_45 = __VLS_44({
        id: "s5",
        ...{ class: "app-section" },
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_44));
    /** @type {__VLS_StyleScopedClasses['app-section']} */ ;
    if (__VLS_ctx.pluginStoreOpen) {
        const __VLS_48 = PluginStore;
        // @ts-ignore
        const __VLS_49 = __VLS_asFunctionalComponent1(__VLS_48, new __VLS_48({
            ...{ 'onClose': {} },
        }));
        const __VLS_50 = __VLS_49({
            ...{ 'onClose': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_49));
        let __VLS_53;
        const __VLS_54 = ({ close: {} },
            { onClose: (__VLS_ctx.onPluginStoreClose) });
        var __VLS_51;
        var __VLS_52;
    }
}
// @ts-ignore
[t, t, pluginStoreOpen, logout, onPluginStoreClose,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
