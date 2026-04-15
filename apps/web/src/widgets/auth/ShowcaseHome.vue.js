/// <reference types="D:/jisuanjisheji/PlainList/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="D:/jisuanjisheji/PlainList/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { DEMO_ACCOUNT } from '@plainlist/shared';
import { computed } from 'vue';
import { useLocaleStore } from '@/features/locale/model/useLocaleStore';
import { useI18nStore } from '@/shared/i18n/useI18nStore';
const emit = defineEmits();
void emit;
const localeStore = useLocaleStore();
const i18n = useI18nStore();
const demoParams = computed(() => ({
    username: DEMO_ACCOUNT.username,
    password: DEMO_ACCOUNT.password,
}));
function t(key, fallback, params) {
    return i18n.t(key, fallback, params);
}
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
/** @type {__VLS_StyleScopedClasses['showcase-locale']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-kicker']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-label']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-problem']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-problem']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-feature-card']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-feature-card']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-preview-head']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-preview-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-preview-line']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-preview-line']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-preview-line']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-preview-dots']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-preview-dots']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-preview-dots']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-home']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-title']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
    ...{ class: "showcase-home" },
});
/** @type {__VLS_StyleScopedClasses['showcase-home']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "showcase-topbar" },
});
/** @type {__VLS_StyleScopedClasses['showcase-topbar']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "showcase-mark" },
});
/** @type {__VLS_StyleScopedClasses['showcase-mark']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.localeStore.toggleLocale();
            // @ts-ignore
            [localeStore,];
        } },
    ...{ class: "showcase-locale" },
    type: "button",
    title: (__VLS_ctx.t('nav.language', 'Language')),
});
/** @type {__VLS_StyleScopedClasses['showcase-locale']} */ ;
(__VLS_ctx.localeStore.switchLabel);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "showcase-grid" },
});
/** @type {__VLS_StyleScopedClasses['showcase-grid']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "showcase-copy" },
});
/** @type {__VLS_StyleScopedClasses['showcase-copy']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "showcase-kicker" },
});
/** @type {__VLS_StyleScopedClasses['showcase-kicker']} */ ;
(__VLS_ctx.t('showcase.kicker', 'PlainList showcase'));
__VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({
    ...{ class: "showcase-title" },
});
/** @type {__VLS_StyleScopedClasses['showcase-title']} */ ;
(__VLS_ctx.t('showcase.title', 'PlainList helps you see time across multiple scales.'));
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
    ...{ class: "showcase-summary" },
});
/** @type {__VLS_StyleScopedClasses['showcase-summary']} */ ;
(__VLS_ctx.t('showcase.summary', 'A personal habit tracker and planning workspace for daily execution, monthly patterns, yearly context, and reflective weekly review.'));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "showcase-problem" },
});
/** @type {__VLS_StyleScopedClasses['showcase-problem']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "showcase-label" },
});
/** @type {__VLS_StyleScopedClasses['showcase-label']} */ ;
(__VLS_ctx.t('showcase.problem_label', 'Why it exists'));
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
(__VLS_ctx.t('showcase.problem', 'Most todo lists only show the next item. PlainList connects your current actions with longer-term rhythm, consistency, and review.'));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "showcase-actions" },
});
/** @type {__VLS_StyleScopedClasses['showcase-actions']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.$emit('demo');
            // @ts-ignore
            [localeStore, t, t, t, t, t, t, $emit,];
        } },
    ...{ class: "showcase-btn primary" },
    type: "button",
});
/** @type {__VLS_StyleScopedClasses['showcase-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
(__VLS_ctx.t('showcase.try_demo', 'Try demo account'));
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.$emit('login');
            // @ts-ignore
            [t, $emit,];
        } },
    ...{ class: "showcase-btn" },
    type: "button",
});
/** @type {__VLS_StyleScopedClasses['showcase-btn']} */ ;
(__VLS_ctx.t('showcase.enter_terminal', 'Open terminal login'));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "showcase-demo-note" },
});
/** @type {__VLS_StyleScopedClasses['showcase-demo-note']} */ ;
(__VLS_ctx.t('showcase.demo_note', 'Demo account: {username} / {password}', __VLS_ctx.demoParams));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "showcase-panel" },
});
/** @type {__VLS_StyleScopedClasses['showcase-panel']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "showcase-label" },
});
/** @type {__VLS_StyleScopedClasses['showcase-label']} */ ;
(__VLS_ctx.t('showcase.features_label', 'Core strengths'));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "showcase-feature-list" },
});
/** @type {__VLS_StyleScopedClasses['showcase-feature-list']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.article, __VLS_intrinsics.article)({
    ...{ class: "showcase-feature-card" },
});
/** @type {__VLS_StyleScopedClasses['showcase-feature-card']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "showcase-feature-title" },
});
/** @type {__VLS_StyleScopedClasses['showcase-feature-title']} */ ;
(__VLS_ctx.t('showcase.feature.time_title', 'Multi-scale time views'));
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
(__VLS_ctx.t('showcase.feature.time_body', 'Move between Now, Day, Month, Year, and Week to understand both execution and trend.'));
__VLS_asFunctionalElement1(__VLS_intrinsics.article, __VLS_intrinsics.article)({
    ...{ class: "showcase-feature-card" },
});
/** @type {__VLS_StyleScopedClasses['showcase-feature-card']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "showcase-feature-title" },
});
/** @type {__VLS_StyleScopedClasses['showcase-feature-title']} */ ;
(__VLS_ctx.t('showcase.feature.ai_title', 'AI reviews'));
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
(__VLS_ctx.t('showcase.feature.ai_body', 'Review completion rate, streaks, best plans, and weak spots from your actual check history.'));
__VLS_asFunctionalElement1(__VLS_intrinsics.article, __VLS_intrinsics.article)({
    ...{ class: "showcase-feature-card" },
});
/** @type {__VLS_StyleScopedClasses['showcase-feature-card']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "showcase-feature-title" },
});
/** @type {__VLS_StyleScopedClasses['showcase-feature-title']} */ ;
(__VLS_ctx.t('showcase.feature.plugin_title', 'Plugin themes'));
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
(__VLS_ctx.t('showcase.feature.plugin_body', 'Adjust language and theme through manifest-driven plugins without runtime script execution.'));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "showcase-preview" },
});
/** @type {__VLS_StyleScopedClasses['showcase-preview']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "showcase-preview-head" },
});
/** @type {__VLS_StyleScopedClasses['showcase-preview-head']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
(__VLS_ctx.t('showcase.preview_label', 'preview flow'));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "showcase-preview-body" },
});
/** @type {__VLS_StyleScopedClasses['showcase-preview-body']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "showcase-preview-section" },
});
/** @type {__VLS_StyleScopedClasses['showcase-preview-section']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "showcase-preview-tag" },
});
/** @type {__VLS_StyleScopedClasses['showcase-preview-tag']} */ ;
(__VLS_ctx.t('nav.day', 'Day'));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "showcase-preview-line long" },
});
/** @type {__VLS_StyleScopedClasses['showcase-preview-line']} */ ;
/** @type {__VLS_StyleScopedClasses['long']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "showcase-preview-line short" },
});
/** @type {__VLS_StyleScopedClasses['showcase-preview-line']} */ ;
/** @type {__VLS_StyleScopedClasses['short']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "showcase-preview-section" },
});
/** @type {__VLS_StyleScopedClasses['showcase-preview-section']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "showcase-preview-tag" },
});
/** @type {__VLS_StyleScopedClasses['showcase-preview-tag']} */ ;
(__VLS_ctx.t('nav.month', 'Month'));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "showcase-preview-dots" },
});
/** @type {__VLS_StyleScopedClasses['showcase-preview-dots']} */ ;
for (const [index] of __VLS_vFor((8))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        key: (index),
    });
    // @ts-ignore
    [t, t, t, t, t, t, t, t, t, t, t, t, demoParams,];
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "showcase-preview-section" },
});
/** @type {__VLS_StyleScopedClasses['showcase-preview-section']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "showcase-preview-tag" },
});
/** @type {__VLS_StyleScopedClasses['showcase-preview-tag']} */ ;
(__VLS_ctx.t('plan.ai.title', 'AI Review'));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "showcase-preview-line long" },
});
/** @type {__VLS_StyleScopedClasses['showcase-preview-line']} */ ;
/** @type {__VLS_StyleScopedClasses['long']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "showcase-preview-line medium" },
});
/** @type {__VLS_StyleScopedClasses['showcase-preview-line']} */ ;
/** @type {__VLS_StyleScopedClasses['medium']} */ ;
// @ts-ignore
[t,];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
});
export default {};
