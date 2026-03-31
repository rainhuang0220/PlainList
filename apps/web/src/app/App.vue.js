/// <reference types="D:/jisuanjisheji/PlainList/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="D:/jisuanjisheji/PlainList/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useAuthStore } from '@/features/auth/model/useAuthStore';
import { usePlansStore } from '@/features/plans/model/usePlansStore';
import { useChecksStore } from '@/features/checks/model/useChecksStore';
import { usePluginsStore } from '@/features/plugins/model/usePluginsStore';
import { useI18nStore } from '@/shared/i18n/useI18nStore';
import { useApi } from '@/shared/api/useApi';
import AuthTerminal from '@/widgets/auth/AuthTerminal.vue';
import ClockSection from '@/widgets/sections/ClockSection.vue';
import PlansSection from '@/widgets/sections/PlansSection.vue';
import TrackerSection from '@/widgets/sections/TrackerSection.vue';
import CalendarSection from '@/widgets/sections/CalendarSection.vue';
import WeekSection from '@/widgets/sections/WeekSection.vue';
import PluginStore from '@/widgets/plugins/PluginStore.vue';
const auth = useAuthStore();
const plans = usePlansStore();
const checks = useChecksStore();
const pluginsStore = usePluginsStore();
const i18n = useI18nStore();
const { get } = useApi();
const pluginStoreOpen = ref(false);
const activeSection = ref('s1');
const sections = computed(() => [
    { id: 's1', label: i18n.t('nav.now', 'Now') },
    { id: 's2', label: i18n.t('nav.day', 'Day') },
    { id: 's3', label: i18n.t('nav.month', 'Month') },
    { id: 's4', label: i18n.t('nav.year', 'Year') },
    { id: 's5', label: i18n.t('nav.week', 'Week') },
]);
function t(key, fallback) { return i18n.t(key, fallback); }
function scrollTo(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    activeSection.value = id;
}
// Track active section on scroll
let scrollTimer = null;
function onScroll() {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
        for (const s of [...sections.value].reverse()) {
            const el = document.getElementById(s.id);
            if (el && el.getBoundingClientRect().top <= 80) {
                activeSection.value = s.id;
                return;
            }
        }
        activeSection.value = 's1';
    }, 50);
}
async function loadDashboard() {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth() + 1;
    await pluginsStore.loadAvailable();
    await Promise.all([
        plans.fetch(),
        checks.fetchMonth(y, m),
        checks.fetchMonth(m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1),
        pluginsStore.loadInstalled(),
    ]);
    await pluginsStore.loadActiveTheme();
}
async function onLogin() {
    await loadDashboard();
}
async function logout() {
    plans.clear();
    checks.clear();
    pluginsStore.clear();
    auth.logout();
}
function onPluginStoreClose() {
    pluginStoreOpen.value = false;
    if (pluginsStore.previewing)
        pluginsStore.revertTheme();
}
// Auto-login if token exists
onMounted(async () => {
    window.addEventListener('scroll', onScroll);
    if (auth.token) {
        try {
            const me = await get('/auth/me');
            auth.setAuth(auth.token, me.username, me.isAdmin);
            await loadDashboard();
        }
        catch {
            auth.logout();
        }
    }
});
onUnmounted(() => window.removeEventListener('scroll', onScroll));
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    id: "app-root",
});
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
    __VLS_asFunctionalElement1(__VLS_intrinsics.nav, __VLS_intrinsics.nav)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "nav-logo" },
    });
    /** @type {__VLS_StyleScopedClasses['nav-logo']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "nav-links" },
    });
    /** @type {__VLS_StyleScopedClasses['nav-links']} */ ;
    for (const [s] of __VLS_vFor((__VLS_ctx.sections))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.a, __VLS_intrinsics.a)({
            ...{ onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.auth.isLoggedIn))
                        return;
                    __VLS_ctx.scrollTo(s.id);
                    // @ts-ignore
                    [auth, onLogin, sections, scrollTo,];
                } },
            key: (s.id),
            href: ('#' + s.id),
            ...{ class: ({ active: __VLS_ctx.activeSection === s.id }) },
        });
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        (s.label);
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
                __VLS_ctx.pluginStoreOpen = true;
                // @ts-ignore
                [auth, pluginStoreOpen,];
            } },
        id: "nav-plugins",
        title: "Plugins",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.logout) },
        id: "nav-logout",
    });
    (__VLS_ctx.t('nav.lock', 'lock'));
    const __VLS_7 = ClockSection;
    // @ts-ignore
    const __VLS_8 = __VLS_asFunctionalComponent1(__VLS_7, new __VLS_7({
        id: "s1",
    }));
    const __VLS_9 = __VLS_8({
        id: "s1",
    }, ...__VLS_functionalComponentArgsRest(__VLS_8));
    const __VLS_12 = PlansSection;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent1(__VLS_12, new __VLS_12({
        id: "s2",
    }));
    const __VLS_14 = __VLS_13({
        id: "s2",
    }, ...__VLS_functionalComponentArgsRest(__VLS_13));
    const __VLS_17 = TrackerSection;
    // @ts-ignore
    const __VLS_18 = __VLS_asFunctionalComponent1(__VLS_17, new __VLS_17({
        id: "s3",
    }));
    const __VLS_19 = __VLS_18({
        id: "s3",
    }, ...__VLS_functionalComponentArgsRest(__VLS_18));
    const __VLS_22 = CalendarSection;
    // @ts-ignore
    const __VLS_23 = __VLS_asFunctionalComponent1(__VLS_22, new __VLS_22({
        id: "s4",
    }));
    const __VLS_24 = __VLS_23({
        id: "s4",
    }, ...__VLS_functionalComponentArgsRest(__VLS_23));
    const __VLS_27 = WeekSection;
    // @ts-ignore
    const __VLS_28 = __VLS_asFunctionalComponent1(__VLS_27, new __VLS_27({
        id: "s5",
    }));
    const __VLS_29 = __VLS_28({
        id: "s5",
    }, ...__VLS_functionalComponentArgsRest(__VLS_28));
    if (__VLS_ctx.pluginStoreOpen) {
        const __VLS_32 = PluginStore;
        // @ts-ignore
        const __VLS_33 = __VLS_asFunctionalComponent1(__VLS_32, new __VLS_32({
            ...{ 'onClose': {} },
        }));
        const __VLS_34 = __VLS_33({
            ...{ 'onClose': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_33));
        let __VLS_37;
        const __VLS_38 = ({ close: {} },
            { onClose: (__VLS_ctx.onPluginStoreClose) });
        var __VLS_35;
        var __VLS_36;
    }
}
// @ts-ignore
[pluginStoreOpen, logout, t, onPluginStoreClose,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
