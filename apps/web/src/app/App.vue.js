/// <reference types="D:/jisuanjisheji/PlainList/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="D:/jisuanjisheji/PlainList/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useAuthStore } from '@/features/auth/model/useAuthStore';
import { useChecksStore } from '@/features/checks/model/useChecksStore';
import { useLocaleStore } from '@/features/locale/model/useLocaleStore';
import { usePlansStore } from '@/features/plans/model/usePlansStore';
import { usePluginsStore } from '@/features/plugins/model/usePluginsStore';
import { useApi } from '@/shared/api/useApi';
import { useI18nStore } from '@/shared/i18n/useI18nStore';
import AuthTerminal from '@/widgets/auth/AuthTerminal.vue';
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
const { get } = useApi();
const pluginStoreOpen = ref(false);
const activeSection = ref('s1');
const isDashboardLoading = ref(false);
const dashboardReady = ref(false);
watch(() => localeStore.locale, (locale) => {
    i18n.setLocale(locale);
}, { immediate: true });
const sections = computed(() => [
    { id: 's1', label: i18n.t('nav.now', 'Now') },
    { id: 's2', label: i18n.t('nav.day', 'Day') },
    { id: 's3', label: i18n.t('nav.month', 'Month') },
    { id: 's4', label: i18n.t('nav.year', 'Year') },
    { id: 's5', label: i18n.t('nav.week', 'Week') },
]);
const loaderText = computed(() => i18n.t('app.loader', 'Loading your dashboard...'));
function t(key, fallback) {
    return i18n.t(key, fallback);
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
    const __VLS_0 = AuthTerminal;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        ...{ 'onLogin': {} },
    }));
    const __VLS_2 = __VLS_1({
        ...{ 'onLogin': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    let __VLS_5;
    const __VLS_6 = ({ login: {} },
        { onLogin: (__VLS_ctx.onLogin) });
    var __VLS_3;
    var __VLS_4;
}
else {
    let __VLS_7;
    /** @ts-ignore @type {typeof __VLS_components.Transition | typeof __VLS_components.Transition} */
    Transition;
    // @ts-ignore
    const __VLS_8 = __VLS_asFunctionalComponent1(__VLS_7, new __VLS_7({
        name: "loader-fade",
    }));
    const __VLS_9 = __VLS_8({
        name: "loader-fade",
    }, ...__VLS_functionalComponentArgsRest(__VLS_8));
    const { default: __VLS_12 } = __VLS_10.slots;
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
    [dashboardReady, auth, onLogin, isDashboardLoading, loaderText,];
    var __VLS_10;
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
    const __VLS_13 = ClockSection;
    // @ts-ignore
    const __VLS_14 = __VLS_asFunctionalComponent1(__VLS_13, new __VLS_13({
        id: "s1",
        ...{ class: "app-section" },
        ...{ style: {} },
    }));
    const __VLS_15 = __VLS_14({
        id: "s1",
        ...{ class: "app-section" },
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_14));
    /** @type {__VLS_StyleScopedClasses['app-section']} */ ;
    const __VLS_18 = PlansSection;
    // @ts-ignore
    const __VLS_19 = __VLS_asFunctionalComponent1(__VLS_18, new __VLS_18({
        id: "s2",
        ...{ class: "app-section" },
        ...{ style: {} },
    }));
    const __VLS_20 = __VLS_19({
        id: "s2",
        ...{ class: "app-section" },
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_19));
    /** @type {__VLS_StyleScopedClasses['app-section']} */ ;
    const __VLS_23 = TrackerSection;
    // @ts-ignore
    const __VLS_24 = __VLS_asFunctionalComponent1(__VLS_23, new __VLS_23({
        id: "s3",
        ...{ class: "app-section" },
        ...{ style: {} },
    }));
    const __VLS_25 = __VLS_24({
        id: "s3",
        ...{ class: "app-section" },
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_24));
    /** @type {__VLS_StyleScopedClasses['app-section']} */ ;
    const __VLS_28 = CalendarSection;
    // @ts-ignore
    const __VLS_29 = __VLS_asFunctionalComponent1(__VLS_28, new __VLS_28({
        id: "s4",
        ...{ class: "app-section" },
        ...{ style: {} },
    }));
    const __VLS_30 = __VLS_29({
        id: "s4",
        ...{ class: "app-section" },
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_29));
    /** @type {__VLS_StyleScopedClasses['app-section']} */ ;
    const __VLS_33 = WeekSection;
    // @ts-ignore
    const __VLS_34 = __VLS_asFunctionalComponent1(__VLS_33, new __VLS_33({
        id: "s5",
        ...{ class: "app-section" },
        ...{ style: {} },
    }));
    const __VLS_35 = __VLS_34({
        id: "s5",
        ...{ class: "app-section" },
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_34));
    /** @type {__VLS_StyleScopedClasses['app-section']} */ ;
    if (__VLS_ctx.pluginStoreOpen) {
        const __VLS_38 = PluginStore;
        // @ts-ignore
        const __VLS_39 = __VLS_asFunctionalComponent1(__VLS_38, new __VLS_38({
            ...{ 'onClose': {} },
        }));
        const __VLS_40 = __VLS_39({
            ...{ 'onClose': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_39));
        let __VLS_43;
        const __VLS_44 = ({ close: {} },
            { onClose: (__VLS_ctx.onPluginStoreClose) });
        var __VLS_41;
        var __VLS_42;
    }
}
// @ts-ignore
[t, t, pluginStoreOpen, logout, onPluginStoreClose,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
