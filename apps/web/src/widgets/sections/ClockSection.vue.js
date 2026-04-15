/// <reference types="D:/jisuanjisheji/PlainList/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="D:/jisuanjisheji/PlainList/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18nStore } from '@/shared/i18n/useI18nStore';
const i18n = useI18nStore();
function t(key, fallback, params) { return i18n.t(key, fallback, params); }
const DAYS_DEFAULT = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_DEFAULT = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function pad(n) { return String(n).padStart(2, '0'); }
function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
const now = ref(new Date());
let timer = null;
const hm = computed(() => pad(now.value.getHours()) + ':' + pad(now.value.getMinutes()));
const sec = computed(() => ':' + pad(now.value.getSeconds()));
const dayOfYear = computed(() => Math.floor((now.value - new Date(now.value.getFullYear(), 0, 0)) / 86400000));
const daysInYear = computed(() => {
    const y = now.value.getFullYear();
    return y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 366 : 365;
});
const weekNum = computed(() => pad(Math.ceil(dayOfYear.value / 7)));
const yearPct = computed(() => Math.round(dayOfYear.value / daysInYear.value * 100));
const dayOfMonth = computed(() => now.value.getDate());
const daysInMonth = computed(() => new Date(now.value.getFullYear(), now.value.getMonth() + 1, 0).getDate());
const monthPct = computed(() => Math.round(dayOfMonth.value / daysInMonth.value * 100));
const dayPct = computed(() => {
    const seconds = now.value.getHours() * 3600 + now.value.getMinutes() * 60 + now.value.getSeconds();
    return Math.round(seconds / 86400 * 100);
});
const days = computed(() => i18n.L('DAYS', DAYS_DEFAULT));
const months = computed(() => i18n.L('MONTHS', MONTHS_DEFAULT));
const dateStr = computed(() => {
    if (i18n.locale === 'zh-CN') {
        return `${now.value.getFullYear()}年${now.value.getMonth() + 1}月${now.value.getDate()}日 ${days.value[now.value.getDay()]}`;
    }
    return `${days.value[now.value.getDay()]}, ${months.value[now.value.getMonth()]} ${ordinal(now.value.getDate())}, ${now.value.getFullYear()}`;
});
const weekDayLabel = computed(() => t('clock.week_day', 'Week {week} · Day {day}', {
    week: weekNum.value,
    day: dayOfYear.value,
}));
const yearProgressLabel = computed(() => t('prog.days_elapsed', '{current} / {total} days', {
    current: dayOfYear.value,
    total: daysInYear.value,
}));
const monthProgressLabel = computed(() => t('prog.days_elapsed', '{current} / {total} days', {
    current: dayOfMonth.value,
    total: daysInMonth.value,
}));
const dayProgressLabel = computed(() => t('prog.time_elapsed', '{time} / 24:00', {
    time: `${pad(now.value.getHours())}:${pad(now.value.getMinutes())}`,
}));
onMounted(() => {
    timer = setInterval(() => { now.value = new Date(); }, 1000);
});
onUnmounted(() => clearInterval(timer));
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
__VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
    id: "s1",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "s1-grid" },
});
/** @type {__VLS_StyleScopedClasses['s1-grid']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "clock-panel" },
});
/** @type {__VLS_StyleScopedClasses['clock-panel']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "sec-tag" },
});
/** @type {__VLS_StyleScopedClasses['sec-tag']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
(__VLS_ctx.t('section.now', 'Now'));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    id: "clock-time",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    id: "ct-hm",
});
(__VLS_ctx.hm);
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    id: "ct-sec",
    ...{ style: {} },
});
(__VLS_ctx.sec);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    id: "clock-date",
});
(__VLS_ctx.dateStr);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    id: "clock-week",
});
(__VLS_ctx.weekDayLabel);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "clock-motto" },
});
/** @type {__VLS_StyleScopedClasses['clock-motto']} */ ;
(__VLS_ctx.t('clock.motto', 'Every second is irreversible.'));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "progress-panel" },
});
/** @type {__VLS_StyleScopedClasses['progress-panel']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "sec-tag" },
});
/** @type {__VLS_StyleScopedClasses['sec-tag']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
(__VLS_ctx.t('section.progress', 'Progress'));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "prog-item" },
});
/** @type {__VLS_StyleScopedClasses['prog-item']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "prog-header" },
});
/** @type {__VLS_StyleScopedClasses['prog-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "prog-label" },
});
/** @type {__VLS_StyleScopedClasses['prog-label']} */ ;
(__VLS_ctx.t('prog.year', 'Year'));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "prog-pct" },
});
/** @type {__VLS_StyleScopedClasses['prog-pct']} */ ;
(__VLS_ctx.yearPct);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "prog-sub" },
});
/** @type {__VLS_StyleScopedClasses['prog-sub']} */ ;
(__VLS_ctx.yearProgressLabel);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "prog-track" },
});
/** @type {__VLS_StyleScopedClasses['prog-track']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "prog-fill" },
    ...{ style: ({ width: __VLS_ctx.yearPct + '%' }) },
});
/** @type {__VLS_StyleScopedClasses['prog-fill']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "prog-dots" },
});
/** @type {__VLS_StyleScopedClasses['prog-dots']} */ ;
for (const [i] of __VLS_vFor((10))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        key: (i),
        ...{ class: (['prog-dot', i <= Math.round(__VLS_ctx.yearPct / 10) ? 'on' : '']) },
    });
    /** @type {__VLS_StyleScopedClasses['prog-dot']} */ ;
    // @ts-ignore
    [t, t, t, t, hm, sec, dateStr, weekDayLabel, yearPct, yearPct, yearPct, yearProgressLabel,];
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "prog-item" },
});
/** @type {__VLS_StyleScopedClasses['prog-item']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "prog-header" },
});
/** @type {__VLS_StyleScopedClasses['prog-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "prog-label" },
});
/** @type {__VLS_StyleScopedClasses['prog-label']} */ ;
(__VLS_ctx.t('prog.month', 'Month'));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "prog-pct" },
});
/** @type {__VLS_StyleScopedClasses['prog-pct']} */ ;
(__VLS_ctx.monthPct);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "prog-sub" },
});
/** @type {__VLS_StyleScopedClasses['prog-sub']} */ ;
(__VLS_ctx.monthProgressLabel);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "prog-track" },
});
/** @type {__VLS_StyleScopedClasses['prog-track']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "prog-fill" },
    ...{ style: ({ width: __VLS_ctx.monthPct + '%' }) },
});
/** @type {__VLS_StyleScopedClasses['prog-fill']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "prog-dots" },
});
/** @type {__VLS_StyleScopedClasses['prog-dots']} */ ;
for (const [i] of __VLS_vFor((__VLS_ctx.daysInMonth))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        key: (i),
        ...{ class: (['prog-dot', i <= __VLS_ctx.dayOfMonth ? 'on' : '']) },
    });
    /** @type {__VLS_StyleScopedClasses['prog-dot']} */ ;
    // @ts-ignore
    [t, monthPct, monthPct, monthProgressLabel, daysInMonth, dayOfMonth,];
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "prog-item" },
});
/** @type {__VLS_StyleScopedClasses['prog-item']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "prog-header" },
});
/** @type {__VLS_StyleScopedClasses['prog-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "prog-label" },
});
/** @type {__VLS_StyleScopedClasses['prog-label']} */ ;
(__VLS_ctx.t('prog.today', 'Today'));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "prog-pct" },
});
/** @type {__VLS_StyleScopedClasses['prog-pct']} */ ;
(__VLS_ctx.dayPct);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "prog-sub" },
});
/** @type {__VLS_StyleScopedClasses['prog-sub']} */ ;
(__VLS_ctx.dayProgressLabel);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "prog-track" },
});
/** @type {__VLS_StyleScopedClasses['prog-track']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "prog-fill" },
    ...{ style: ({ width: __VLS_ctx.dayPct + '%' }) },
});
/** @type {__VLS_StyleScopedClasses['prog-fill']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "prog-dots" },
});
/** @type {__VLS_StyleScopedClasses['prog-dots']} */ ;
for (const [i] of __VLS_vFor((24))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        key: (i),
        ...{ class: (['prog-dot', i <= Math.round(__VLS_ctx.dayPct / 100 * 24) ? 'on' : '']) },
    });
    /** @type {__VLS_StyleScopedClasses['prog-dot']} */ ;
    // @ts-ignore
    [t, dayPct, dayPct, dayPct, dayProgressLabel,];
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
