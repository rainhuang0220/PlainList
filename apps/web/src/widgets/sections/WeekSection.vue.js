/// <reference types="D:/jisuanjisheji/PlainList/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="D:/jisuanjisheji/PlainList/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts';
import { usePlansStore } from '@/features/plans/model/usePlansStore';
import { useChecksStore } from '@/features/checks/model/useChecksStore';
import { usePluginsStore } from '@/features/plugins/model/usePluginsStore';
import { useI18nStore } from '@/shared/i18n/useI18nStore';
const plansStore = usePlansStore();
const checksStore = useChecksStore();
const pluginsStore = usePluginsStore();
const i18n = useI18nStore();
function t(key, fallback) { return i18n.t(key, fallback); }
const radarEl = ref(null);
const barEl = ref(null);
const lineEl = ref(null);
let chartRadar = null;
let chartBar = null;
let chartLine = null;
const DAYS_S = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_S = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function pad(n) { return String(n).padStart(2, '0'); }
const today = new Date();
// Monday of current week
const monday = computed(() => {
    const d = new Date(today);
    const dow = d.getDay();
    d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
    d.setHours(0, 0, 0, 0);
    return d;
});
const weekNumber = computed(() => {
    const start = new Date(today.getFullYear(), 0, 0);
    const diff = today - start;
    return Math.ceil(Math.floor(diff / 86400000) / 7);
});
const rangeLabel = computed(() => {
    const sun = new Date(monday.value);
    sun.setDate(monday.value.getDate() + 6);
    return `${MONTHS_S[monday.value.getMonth()]} ${monday.value.getDate()} – ${MONTHS_S[sun.getMonth()]} ${sun.getDate()}`;
});
const totalPlans = computed(() => plansStore.plans.length);
function pctForDate(date) {
    const all = plansStore.plans;
    if (!all.length)
        return null;
    if (date > today)
        return null;
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const key = `${date.getFullYear()}-${mm}-${dd}`;
    const done = all.filter(p => checksStore.isChecked(p.id, key)).length;
    return Math.round((done / all.length) * 100);
}
const weekDays = computed(() => {
    return Array.from({ length: 7 }, (_, i) => {
        const date = new Date(monday.value);
        date.setDate(monday.value.getDate() + i);
        const isToday = date.toDateString() === today.toDateString();
        return {
            date,
            label: DAYS_S[date.getDay()].toUpperCase(),
            isToday,
            pct: pctForDate(date),
        };
    });
});
const pcts = computed(() => weekDays.value.map(d => d.pct));
const dayLabels = computed(() => weekDays.value.map(d => d.label.slice(0, 3)));
const validPcts = computed(() => pcts.value.filter(v => v !== null));
const avg = computed(() => validPcts.value.length ? Math.round(validPcts.value.reduce((a, b) => a + b, 0) / validPcts.value.length) : 0);
const activeDays = computed(() => validPcts.value.length);
const maxPct = computed(() => validPcts.value.length ? Math.max(...validPcts.value) : 0);
const bestDay = computed(() => {
    const idx = pcts.value.indexOf(maxPct.value);
    return idx >= 0 ? dayLabels.value[idx] : '—';
});
const streak = computed(() => {
    let s = 0;
    const d = new Date(today);
    while (s <= 365) {
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const key = `${d.getFullYear()}-${mm}-${dd}`;
        const all = plansStore.plans;
        if (!all.length)
            break;
        const done = all.filter(p => checksStore.isChecked(p.id, key)).length;
        if (done === 0)
            break;
        s++;
        d.setDate(d.getDate() - 1);
    }
    return s;
});
const habits = computed(() => plansStore.plans.filter(p => p.type === 'habit'));
// Fake 3 prior weeks for line chart context
const priorWeeks = [
    [65, 72, 68, 55, 80, 75, 70],
    [70, 60, 85, 78, 66, 80, 77],
    [80, 75, 90, 82, 85, 78, 83],
];
function getCSSVar(name) {
    return pluginsStore.themeVars[name] ?? getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function buildRadarOption() {
    const indicators = habits.value.length
        ? habits.value.map(habit => ({ name: habit.name.split(' ').slice(0, 2).join(' '), max: 100 }))
        : [{ name: 'No habits', max: 100 }];
    const values = habits.value.map(() => {
        const done = validPcts.value.length ? avg.value : 0;
        return done;
    });
    const dark = getCSSVar('--dark');
    const faint = getCSSVar('--faint');
    const muted = getCSSVar('--muted');
    return {
        backgroundColor: 'transparent',
        radar: {
            indicator: indicators,
            shape: 'polygon',
            splitNumber: 3,
            axisName: { color: muted, fontSize: 9 },
            splitLine: { lineStyle: { color: faint } },
            splitArea: { areaStyle: { color: ['transparent'] } },
            axisLine: { lineStyle: { color: faint } },
        },
        series: [{
                type: 'radar',
                data: [{
                        value: values,
                        lineStyle: { color: dark, width: 1.5 },
                        areaStyle: { color: faint },
                        itemStyle: { color: dark },
                    }],
            }],
    };
}
function buildBarOption() {
    const dark = getCSSVar('--dark');
    const mid = getCSSVar('--mid');
    const muted = getCSSVar('--muted');
    const faint = getCSSVar('--faint');
    const faint2 = getCSSVar('--faint2');
    return {
        backgroundColor: 'transparent',
        grid: { top: 8, bottom: 24, left: 24, right: 8 },
        xAxis: {
            type: 'category',
            data: dayLabels.value,
            axisLabel: { fontFamily: 'monospace', fontSize: 9, color: muted },
            axisLine: { show: false },
            axisTick: { show: false },
        },
        yAxis: {
            type: 'value',
            max: 100,
            axisLabel: { fontFamily: 'monospace', fontSize: 9, color: faint, formatter: '{value}%' },
            splitLine: { lineStyle: { color: faint } },
            axisLine: { show: false },
            axisTick: { show: false },
        },
        series: [{
                type: 'bar',
                barMaxWidth: 20,
                data: pcts.value.map(v => ({
                    value: v,
                    itemStyle: {
                        color: v === null ? faint2 : v >= 80 ? dark : v >= 60 ? mid : muted,
                        borderRadius: [3, 3, 0, 0],
                    },
                })),
            }],
    };
}
function buildLineOption() {
    const dark = getCSSVar('--dark');
    const faint = getCSSVar('--faint');
    const muted = getCSSVar('--muted');
    const currentData = pcts.value.map(v => v ?? 0);
    const series = [...priorWeeks, currentData].map((d, i) => ({
        type: 'line',
        smooth: true,
        data: d,
        lineStyle: { color: i === 3 ? dark : faint, width: i === 3 ? 2 : 1 },
        itemStyle: { color: i === 3 ? dark : faint },
        symbol: i === 3 ? 'circle' : 'none',
        symbolSize: 4,
        showSymbol: i === 3,
    }));
    return {
        backgroundColor: 'transparent',
        grid: { top: 8, bottom: 24, left: 24, right: 8 },
        xAxis: {
            type: 'category',
            data: dayLabels.value,
            axisLabel: { fontFamily: 'monospace', fontSize: 9, color: muted },
            axisLine: { show: false },
            axisTick: { show: false },
        },
        yAxis: {
            type: 'value',
            max: 100,
            axisLabel: { fontFamily: 'monospace', fontSize: 9, color: faint, formatter: '{value}' },
            splitLine: { lineStyle: { color: faint } },
            axisLine: { show: false },
            axisTick: { show: false },
        },
        series,
    };
}
function initCharts() {
    if (radarEl.value && !chartRadar) {
        chartRadar = echarts.init(radarEl.value, null, { renderer: 'svg' });
    }
    if (barEl.value && !chartBar) {
        chartBar = echarts.init(barEl.value, null, { renderer: 'svg' });
    }
    if (lineEl.value && !chartLine) {
        chartLine = echarts.init(lineEl.value, null, { renderer: 'svg' });
    }
    chartRadar?.setOption(buildRadarOption());
    chartBar?.setOption(buildBarOption());
    chartLine?.setOption(buildLineOption());
}
watch([pcts, habits], () => {
    chartRadar?.setOption(buildRadarOption(), true);
    chartBar?.setOption(buildBarOption(), true);
    chartLine?.setOption(buildLineOption(), true);
}, { deep: true });
watch(() => ({ ...pluginsStore.themeVars }), () => {
    chartRadar?.setOption(buildRadarOption(), true);
    chartBar?.setOption(buildBarOption(), true);
    chartLine?.setOption(buildLineOption(), true);
}, { deep: true });
onMounted(() => {
    initCharts();
    document.addEventListener('theme:changed', onThemeChanged);
});
function onThemeChanged() {
    chartRadar?.setOption(buildRadarOption(), true);
    chartBar?.setOption(buildBarOption(), true);
    chartLine?.setOption(buildLineOption(), true);
}
onBeforeUnmount(() => {
    document.removeEventListener('theme:changed', onThemeChanged);
    chartRadar?.dispose();
    chartBar?.dispose();
    chartLine?.dispose();
});
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['week-day-card']} */ ;
/** @type {__VLS_StyleScopedClasses['today-card']} */ ;
/** @type {__VLS_StyleScopedClasses['wdc-bar-track']} */ ;
/** @type {__VLS_StyleScopedClasses['insight-delta']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
    id: "s5",
    ...{ class: "section" },
});
/** @type {__VLS_StyleScopedClasses['section']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "week-header" },
});
/** @type {__VLS_StyleScopedClasses['week-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "week-title" },
});
/** @type {__VLS_StyleScopedClasses['week-title']} */ ;
(__VLS_ctx.t('week.prefix', 'Week'));
(__VLS_ctx.pad(__VLS_ctx.weekNumber));
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "week-range" },
});
/** @type {__VLS_StyleScopedClasses['week-range']} */ ;
(__VLS_ctx.rangeLabel);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "week-days-row" },
});
/** @type {__VLS_StyleScopedClasses['week-days-row']} */ ;
for (const [day, i] of __VLS_vFor((__VLS_ctx.weekDays))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        key: (i),
        ...{ class: "week-day-card" },
        ...{ class: ({ 'today-card': day.isToday }) },
    });
    /** @type {__VLS_StyleScopedClasses['week-day-card']} */ ;
    /** @type {__VLS_StyleScopedClasses['today-card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "wdc-label" },
    });
    /** @type {__VLS_StyleScopedClasses['wdc-label']} */ ;
    (day.label);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "wdc-date-num" },
    });
    /** @type {__VLS_StyleScopedClasses['wdc-date-num']} */ ;
    (__VLS_ctx.pad(day.date.getDate()));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "wdc-pct" },
    });
    /** @type {__VLS_StyleScopedClasses['wdc-pct']} */ ;
    (day.pct !== null ? day.pct + '%' : '—');
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "wdc-bar-track" },
    });
    /** @type {__VLS_StyleScopedClasses['wdc-bar-track']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
        ...{ class: "wdc-bar-fill" },
        ...{ style: ({ width: (day.pct || 0) + '%' }) },
    });
    /** @type {__VLS_StyleScopedClasses['wdc-bar-fill']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "wdc-tasks" },
    });
    /** @type {__VLS_StyleScopedClasses['wdc-tasks']} */ ;
    (day.pct !== null
        ? Math.round(__VLS_ctx.totalPlans * (day.pct / 100)) + '/' + __VLS_ctx.totalPlans
        : 'upcoming');
    // @ts-ignore
    [t, pad, pad, weekNumber, rangeLabel, weekDays, totalPlans, totalPlans,];
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "charts-row" },
});
/** @type {__VLS_StyleScopedClasses['charts-row']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div)({
    ref: "radarEl",
    ...{ class: "chart chart-radar" },
});
/** @type {__VLS_StyleScopedClasses['chart']} */ ;
/** @type {__VLS_StyleScopedClasses['chart-radar']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div)({
    ref: "barEl",
    ...{ class: "chart chart-bar" },
});
/** @type {__VLS_StyleScopedClasses['chart']} */ ;
/** @type {__VLS_StyleScopedClasses['chart-bar']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div)({
    ref: "lineEl",
    ...{ class: "chart chart-line" },
});
/** @type {__VLS_StyleScopedClasses['chart']} */ ;
/** @type {__VLS_StyleScopedClasses['chart-line']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "week-insight" },
});
/** @type {__VLS_StyleScopedClasses['week-insight']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "insight-item" },
});
/** @type {__VLS_StyleScopedClasses['insight-item']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "insight-val" },
});
/** @type {__VLS_StyleScopedClasses['insight-val']} */ ;
(__VLS_ctx.avg);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "insight-label" },
});
/** @type {__VLS_StyleScopedClasses['insight-label']} */ ;
(__VLS_ctx.t('week.insight.avg', 'Avg Completion'));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "insight-delta up" },
});
/** @type {__VLS_StyleScopedClasses['insight-delta']} */ ;
/** @type {__VLS_StyleScopedClasses['up']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "insight-item" },
});
/** @type {__VLS_StyleScopedClasses['insight-item']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "insight-val" },
});
/** @type {__VLS_StyleScopedClasses['insight-val']} */ ;
(__VLS_ctx.activeDays);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "insight-label" },
});
/** @type {__VLS_StyleScopedClasses['insight-label']} */ ;
(__VLS_ctx.t('week.insight.active', 'Active Days'));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "insight-delta" },
});
/** @type {__VLS_StyleScopedClasses['insight-delta']} */ ;
(__VLS_ctx.activeDays);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "insight-item" },
});
/** @type {__VLS_StyleScopedClasses['insight-item']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "insight-val" },
});
/** @type {__VLS_StyleScopedClasses['insight-val']} */ ;
(__VLS_ctx.bestDay || '—');
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "insight-label" },
});
/** @type {__VLS_StyleScopedClasses['insight-label']} */ ;
(__VLS_ctx.t('week.insight.best_day', 'Best Day'));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "insight-delta up" },
});
/** @type {__VLS_StyleScopedClasses['insight-delta']} */ ;
/** @type {__VLS_StyleScopedClasses['up']} */ ;
(__VLS_ctx.maxPct);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "insight-item" },
});
/** @type {__VLS_StyleScopedClasses['insight-item']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "insight-val" },
});
/** @type {__VLS_StyleScopedClasses['insight-val']} */ ;
(__VLS_ctx.streak);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "insight-label" },
});
/** @type {__VLS_StyleScopedClasses['insight-label']} */ ;
(__VLS_ctx.t('week.insight.streak', 'Current Streak'));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "insight-delta" },
});
/** @type {__VLS_StyleScopedClasses['insight-delta']} */ ;
// @ts-ignore
[t, t, t, t, avg, activeDays, activeDays, bestDay, maxPct, streak,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
