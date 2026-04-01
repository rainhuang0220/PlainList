/// <reference types="D:/jisuanjisheji/PlainList/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="D:/jisuanjisheji/PlainList/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import * as echarts from 'echarts';
import { usePlansStore } from '@/features/plans/model/usePlansStore';
import { useChecksStore } from '@/features/checks/model/useChecksStore';
import { useAuthStore } from '@/features/auth/model/useAuthStore';
import { useI18nStore } from '@/shared/i18n/useI18nStore';
const plans = usePlansStore();
const checks = useChecksStore();
const auth = useAuthStore();
const i18n = useI18nStore();
function t(key, fallback) { return i18n.t(key, fallback); }
// ── helpers ───────────────────────────────────────────────────────────────────
function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dateKey(y, m, d) {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];
// ── grouping ──────────────────────────────────────────────────────────────────
const GROUPS = [
    { key: 'group.morning_early', fallback: 'Morning · before 9:00', test: h => h < 9 },
    { key: 'group.morning', fallback: 'Morning · 9:00–13:00', test: h => h < 13 },
    { key: 'group.afternoon', fallback: 'Afternoon · 13:00–18:00', test: h => h < 18 },
    { key: 'group.evening', fallback: 'Evening · after 18:00', test: () => true },
];
const groupedPlans = computed(() => {
    const result = [];
    let lastKey = null;
    for (const p of plans.plans) {
        const hour = parseInt(p.time.split(':')[0]);
        const g = GROUPS.find(g => g.test(hour));
        if (g.key !== lastKey) {
            result.push({ label: t(g.key, g.fallback), items: [] });
            lastKey = g.key;
        }
        result[result.length - 1].items.push(p);
    }
    return result;
});
const habitPlans = computed(() => plans.plans.filter(p => p.type === 'habit'));
// ── toggle / delete ───────────────────────────────────────────────────────────
function onRowClick(p) {
    checks.toggle(p.id, todayKey());
}
// ── add form ──────────────────────────────────────────────────────────────────
const formOpen = ref(false);
const newName = ref('');
const newType = ref('habit');
const newTime = ref('');
const nameInput = ref(null);
function openForm() {
    formOpen.value = true;
    nextTick(() => nameInput.value?.focus());
}
function cancelForm() {
    formOpen.value = false;
    newName.value = '';
    newTime.value = '';
}
async function submitPlan() {
    const name = newName.value.trim();
    const time = newTime.value.trim() || '09:00';
    if (!name) {
        nameInput.value?.focus();
        return;
    }
    if (!/^\d{2}:\d{2}$/.test(time))
        return;
    await plans.add(name, newType.value, time);
    cancelForm();
}
// ── month strip ───────────────────────────────────────────────────────────────
const today = new Date();
const stripYear = ref(today.getFullYear());
const stripMonth = ref(today.getMonth());
const monthLabel = computed(() => `${MONTH_NAMES[stripMonth.value]} ${stripYear.value}`);
function prevMonth() {
    if (stripMonth.value === 0) {
        stripMonth.value = 11;
        stripYear.value--;
    }
    else
        stripMonth.value--;
    checks.fetchMonth(stripYear.value, stripMonth.value + 1);
}
function nextMonth() {
    if (stripMonth.value === 11) {
        stripMonth.value = 0;
        stripYear.value++;
    }
    else
        stripMonth.value++;
    checks.fetchMonth(stripYear.value, stripMonth.value + 1);
}
const daysInStrip = computed(() => {
    const tNow = new Date();
    const tY = tNow.getFullYear();
    const tM = tNow.getMonth();
    const tD = tNow.getDate();
    const y = stripYear.value;
    const m = stripMonth.value;
    const count = new Date(y, m + 1, 0).getDate();
    const result = [];
    for (let d = 1; d <= count; d++) {
        const isToday = y === tY && m === tM && d === tD;
        const isFuture = new Date(y, m, d) > tNow;
        const k = dateKey(y, m, d);
        const doneN = plans.plans.filter(p => checks.isChecked(p.id, k)).length;
        const pct = plans.plans.length ? Math.round(doneN / plans.plans.length * 100) : 0;
        result.push({ day: d, isToday, isFuture, key: k, pct });
    }
    return result;
});
// ── stats ─────────────────────────────────────────────────────────────────────
const doneCount = computed(() => plans.plans.filter(p => checks.isChecked(p.id, todayKey())).length);
const remainCount = computed(() => plans.plans.length - doneCount.value);
const pct = computed(() => plans.plans.length ? Math.round(doneCount.value / plans.plans.length * 100) : 0);
// ── echarts bar ───────────────────────────────────────────────────────────────
const chartEl = ref(null);
let chartInst = null;
function renderChart() {
    if (!chartEl.value)
        return;
    if (!chartInst)
        chartInst = echarts.init(chartEl.value, null, { renderer: 'svg' });
    const styles = getComputedStyle(document.documentElement);
    const dark = styles.getPropertyValue('--dark').trim() || '#111111';
    const faint = styles.getPropertyValue('--faint').trim() || '#E4E4E4';
    const done = doneCount.value;
    const remain = remainCount.value;
    const total = done + remain || 1;
    chartInst.setOption({
        backgroundColor: 'transparent',
        grid: { top: 4, bottom: 4, left: 8, right: 8 },
        xAxis: { type: 'value', max: total, show: false },
        yAxis: { type: 'category', show: false, data: [''] },
        series: [
            { name: 'Done', type: 'bar', stack: 't', data: [done], itemStyle: { color: dark, borderRadius: [4, 0, 0, 4] }, barMaxWidth: 12 },
            { name: 'Remain', type: 'bar', stack: 't', data: [remain], itemStyle: { color: faint, borderRadius: [0, 4, 4, 0] } }
        ]
    });
}
watch([doneCount, remainCount], () => renderChart());
onMounted(() => {
    checks.fetchMonth(stripYear.value, stripMonth.value + 1);
    nextTick(renderChart);
});
onUnmounted(() => {
    chartInst?.dispose();
    chartInst = null;
});
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
__VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
    ...{ class: "plans-section" },
});
/** @type {__VLS_StyleScopedClasses['plans-section']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "plan-list" },
});
/** @type {__VLS_StyleScopedClasses['plan-list']} */ ;
if (!__VLS_ctx.plans.plans.length) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "empty-state" },
    });
    /** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "empty-state-icon" },
    });
    /** @type {__VLS_StyleScopedClasses['empty-state-icon']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "empty-state-text" },
    });
    /** @type {__VLS_StyleScopedClasses['empty-state-text']} */ ;
    (__VLS_ctx.t('plan.empty', 'No plans yet — add your first habit or task below'));
}
else {
    for (const [group, gi] of __VLS_vFor((__VLS_ctx.groupedPlans))) {
        (gi);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "plan-group-label" },
        });
        /** @type {__VLS_StyleScopedClasses['plan-group-label']} */ ;
        (group.label);
        for (const [p] of __VLS_vFor((group.items))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ onClick: (...[$event]) => {
                        if (!!(!__VLS_ctx.plans.plans.length))
                            return;
                        __VLS_ctx.onRowClick(p);
                        // @ts-ignore
                        [plans, t, groupedPlans, onRowClick,];
                    } },
                key: (p.id),
                ...{ class: "plan-item" },
                ...{ class: ({ 'done-item': __VLS_ctx.checks.isChecked(p.id, __VLS_ctx.todayKey()) }) },
            });
            /** @type {__VLS_StyleScopedClasses['plan-item']} */ ;
            /** @type {__VLS_StyleScopedClasses['done-item']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "plan-check" },
                ...{ class: ({ done: __VLS_ctx.checks.isChecked(p.id, __VLS_ctx.todayKey()) }) },
            });
            /** @type {__VLS_StyleScopedClasses['plan-check']} */ ;
            /** @type {__VLS_StyleScopedClasses['done']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "plan-text" },
            });
            /** @type {__VLS_StyleScopedClasses['plan-text']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "plan-name" },
            });
            /** @type {__VLS_StyleScopedClasses['plan-name']} */ ;
            (p.name);
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "plan-meta" },
            });
            /** @type {__VLS_StyleScopedClasses['plan-meta']} */ ;
            (p.type === 'habit' ? __VLS_ctx.t('plan.type.habit', '↻ daily habit') : __VLS_ctx.t('plan.type.todo', '⊡ task'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "plan-tag" },
                ...{ class: (p.type) },
            });
            /** @type {__VLS_StyleScopedClasses['plan-tag']} */ ;
            (p.type);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "plan-time" },
            });
            /** @type {__VLS_StyleScopedClasses['plan-time']} */ ;
            (p.time);
            if (!__VLS_ctx.auth.isAdmin) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!!(!__VLS_ctx.plans.plans.length))
                                return;
                            if (!(!__VLS_ctx.auth.isAdmin))
                                return;
                            __VLS_ctx.plans.remove(p.id);
                            // @ts-ignore
                            [plans, t, t, checks, checks, todayKey, todayKey, auth,];
                        } },
                    ...{ class: "plan-del" },
                    title: "remove",
                });
                /** @type {__VLS_StyleScopedClasses['plan-del']} */ ;
            }
            // @ts-ignore
            [];
        }
        // @ts-ignore
        [];
    }
}
if (!__VLS_ctx.auth.isAdmin) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "plan-controls" },
    });
    /** @type {__VLS_StyleScopedClasses['plan-controls']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "add-plan-bar" },
    });
    /** @type {__VLS_StyleScopedClasses['add-plan-bar']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.openForm) },
        ...{ class: "add-plan-btn" },
    });
    /** @type {__VLS_StyleScopedClasses['add-plan-btn']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "apb-icon" },
    });
    /** @type {__VLS_StyleScopedClasses['apb-icon']} */ ;
    (__VLS_ctx.t('plan.add_btn', 'Add habit or task'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "add-plan-form" },
        ...{ class: ({ open: __VLS_ctx.formOpen }) },
    });
    /** @type {__VLS_StyleScopedClasses['add-plan-form']} */ ;
    /** @type {__VLS_StyleScopedClasses['open']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "apf-row" },
    });
    /** @type {__VLS_StyleScopedClasses['apf-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onKeydown: (__VLS_ctx.submitPlan) },
        ref: "nameInput",
        ...{ class: "apf-input" },
        placeholder: (__VLS_ctx.t('plan.add_name_ph', 'Name')),
    });
    (__VLS_ctx.newName);
    /** @type {__VLS_StyleScopedClasses['apf-input']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "apf-type" },
    });
    /** @type {__VLS_StyleScopedClasses['apf-type']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(!__VLS_ctx.auth.isAdmin))
                    return;
                __VLS_ctx.newType = 'habit';
                // @ts-ignore
                [t, t, auth, openForm, formOpen, submitPlan, newName, newType,];
            } },
        ...{ class: "apf-type-btn" },
        ...{ class: ({ active: __VLS_ctx.newType === 'habit' }) },
    });
    /** @type {__VLS_StyleScopedClasses['apf-type-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    (__VLS_ctx.t('plan.add_habit', 'Habit'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(!__VLS_ctx.auth.isAdmin))
                    return;
                __VLS_ctx.newType = 'todo';
                // @ts-ignore
                [t, newType, newType,];
            } },
        ...{ class: "apf-type-btn" },
        ...{ class: ({ active: __VLS_ctx.newType === 'todo' }) },
    });
    /** @type {__VLS_StyleScopedClasses['apf-type-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    (__VLS_ctx.t('plan.add_task', 'Task'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ class: "apf-input apf-time" },
        placeholder: "08:00",
        maxlength: "5",
    });
    (__VLS_ctx.newTime);
    /** @type {__VLS_StyleScopedClasses['apf-input']} */ ;
    /** @type {__VLS_StyleScopedClasses['apf-time']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "apf-actions" },
    });
    /** @type {__VLS_StyleScopedClasses['apf-actions']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.cancelForm) },
        ...{ class: "apf-cancel" },
    });
    /** @type {__VLS_StyleScopedClasses['apf-cancel']} */ ;
    (__VLS_ctx.t('plan.add_cancel', 'Cancel'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.submitPlan) },
        ...{ class: "apf-save" },
    });
    /** @type {__VLS_StyleScopedClasses['apf-save']} */ ;
    (__VLS_ctx.t('plan.add_save', 'Add'));
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "month-strip" },
});
/** @type {__VLS_StyleScopedClasses['month-strip']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "strip-header" },
});
/** @type {__VLS_StyleScopedClasses['strip-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.prevMonth) },
    ...{ class: "strip-nav" },
});
/** @type {__VLS_StyleScopedClasses['strip-nav']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "strip-month-label" },
});
/** @type {__VLS_StyleScopedClasses['strip-month-label']} */ ;
(__VLS_ctx.monthLabel);
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.nextMonth) },
    ...{ class: "strip-nav" },
});
/** @type {__VLS_StyleScopedClasses['strip-nav']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "month-strip-rows" },
});
/** @type {__VLS_StyleScopedClasses['month-strip-rows']} */ ;
for (const [d] of __VLS_vFor((__VLS_ctx.daysInStrip))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        key: (d.day),
        ...{ class: "day-row" },
    });
    /** @type {__VLS_StyleScopedClasses['day-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "day-num" },
        ...{ class: ({ today: d.isToday }) },
    });
    /** @type {__VLS_StyleScopedClasses['day-num']} */ ;
    /** @type {__VLS_StyleScopedClasses['today']} */ ;
    (d.day);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "day-dots" },
    });
    /** @type {__VLS_StyleScopedClasses['day-dots']} */ ;
    for (const [h] of __VLS_vFor((__VLS_ctx.habitPlans))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (h.id),
            ...{ class: "day-cell" },
            ...{ class: ({ done: !d.isFuture && __VLS_ctx.checks.isChecked(h.id, d.key) }) },
        });
        /** @type {__VLS_StyleScopedClasses['day-cell']} */ ;
        /** @type {__VLS_StyleScopedClasses['done']} */ ;
        // @ts-ignore
        [t, t, t, checks, submitPlan, newType, newTime, cancelForm, prevMonth, monthLabel, nextMonth, daysInStrip, habitPlans,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "day-pct" },
        ...{ class: ({ full: d.pct === 100 }) },
    });
    /** @type {__VLS_StyleScopedClasses['day-pct']} */ ;
    /** @type {__VLS_StyleScopedClasses['full']} */ ;
    (d.isFuture || !__VLS_ctx.plans.plans.length ? '—' : d.pct + '%');
    // @ts-ignore
    [plans,];
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "s2-stats" },
});
/** @type {__VLS_StyleScopedClasses['s2-stats']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "stat-item" },
});
/** @type {__VLS_StyleScopedClasses['stat-item']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "stat-val" },
});
/** @type {__VLS_StyleScopedClasses['stat-val']} */ ;
(__VLS_ctx.doneCount);
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "stat-lbl" },
});
/** @type {__VLS_StyleScopedClasses['stat-lbl']} */ ;
(__VLS_ctx.t('stat.done', 'done'));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "stat-item" },
});
/** @type {__VLS_StyleScopedClasses['stat-item']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "stat-val" },
});
/** @type {__VLS_StyleScopedClasses['stat-val']} */ ;
(__VLS_ctx.remainCount);
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "stat-lbl" },
});
/** @type {__VLS_StyleScopedClasses['stat-lbl']} */ ;
(__VLS_ctx.t('stat.remaining', 'remaining'));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "stat-item" },
});
/** @type {__VLS_StyleScopedClasses['stat-item']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "stat-val" },
});
/** @type {__VLS_StyleScopedClasses['stat-val']} */ ;
(__VLS_ctx.pct);
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "stat-lbl" },
});
/** @type {__VLS_StyleScopedClasses['stat-lbl']} */ ;
(__VLS_ctx.t('stat.completion', 'complete'));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ref: "chartEl",
    ...{ class: "stat-chart" },
});
/** @type {__VLS_StyleScopedClasses['stat-chart']} */ ;
// @ts-ignore
[t, t, t, doneCount, remainCount, pct,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
