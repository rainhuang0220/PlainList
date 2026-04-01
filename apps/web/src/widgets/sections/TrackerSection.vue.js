/// <reference types="D:/jisuanjisheji/PlainList/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="D:/jisuanjisheji/PlainList/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, onMounted, ref, watch } from 'vue';
import { usePlansStore } from '@/features/plans/model/usePlansStore';
import { useChecksStore } from '@/features/checks/model/useChecksStore';
import { useI18nStore } from '@/shared/i18n/useI18nStore';
const plans = usePlansStore();
const checks = useChecksStore();
const i18n = useI18nStore();
function t(key, fallback) { return i18n.t(key, fallback); }
// ── state ─────────────────────────────────────────────────────────────────────
const now = new Date();
const trackerYear = ref(now.getFullYear());
const trackerMonth = ref(now.getMonth());
// ── constants ─────────────────────────────────────────────────────────────────
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_S = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WDAYS_M = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
// ── helpers ───────────────────────────────────────────────────────────────────
function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dateKey(year, month, day) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
function isFuture(cell) {
    const cellDate = new Date(cell.year, cell.month, cell.day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return cellDate > today;
}
function getMonthWeeks(year, month) {
    const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMon = new Date(year, month + 1, 0).getDate();
    const weeks = [];
    let day = 1 - firstDow;
    while (day <= daysInMon) {
        const week = [];
        for (let wd = 0; wd < 7; wd++) {
            week.push((day >= 1 && day <= daysInMon) ? { year, month, day } : null);
            day++;
        }
        weeks.push(week);
    }
    return weeks;
}
// ── computed ──────────────────────────────────────────────────────────────────
const tKey = computed(() => todayKey());
const weeks = computed(() => getMonthWeeks(trackerYear.value, trackerMonth.value));
const monthLabel = computed(() => `${MONTHS[trackerMonth.value]} ${trackerYear.value}`);
const shortMonthLabel = computed(() => `${MONTHS_S[trackerMonth.value]} ${trackerYear.value}`);
const groups = computed(() => [
    { label: t('tracker.group.habits', 'Habits · daily recurring'), items: plans.plans.filter(p => p.type === 'habit') },
    { label: t('tracker.group.tasks', 'Tasks · one-time items'), items: plans.plans.filter(p => p.type === 'todo') },
]);
function weekHasToday(wk) {
    const tk = tKey.value;
    return wk.some(c => c && dateKey(c.year, c.month, c.day) === tk);
}
function daysElapsed() {
    const t = new Date();
    const y = trackerYear.value;
    const m = trackerMonth.value;
    if (t.getFullYear() === y && t.getMonth() === m)
        return t.getDate();
    return new Date(y, m + 1, 0).getDate();
}
function planPct(plan) {
    const elapsed = daysElapsed();
    let done = 0;
    for (let d = 1; d <= elapsed; d++) {
        if (checks.isChecked(plan.id, dateKey(trackerYear.value, trackerMonth.value, d)))
            done++;
    }
    return elapsed ? Math.round(done / elapsed * 100) + '%' : '—';
}
const summary = computed(() => {
    const y = trackerYear.value;
    const m = trackerMonth.value;
    const elapsed = daysElapsed();
    const allPlans = plans.plans;
    let tot = 0, don = 0, perf = 0;
    for (let d = 1; d <= elapsed; d++) {
        const k = dateKey(y, m, d);
        let allDone = allPlans.length > 0;
        allPlans.forEach(p => {
            if (checks.isChecked(p.id, k))
                don++;
            else
                allDone = false;
            tot++;
        });
        if (allDone)
            perf++;
    }
    let bestHabit = allPlans[0] || null;
    let bestPct = 0;
    allPlans.forEach(p => {
        let c = 0;
        for (let d = 1; d <= elapsed; d++) {
            if (checks.isChecked(p.id, dateKey(y, m, d)))
                c++;
        }
        const pp = elapsed ? Math.round(c / elapsed * 100) : 0;
        if (pp > bestPct) {
            bestPct = pp;
            bestHabit = p;
        }
    });
    return [
        { val: tot ? Math.round(don / tot * 100) + '%' : '—', lbl: t('year.summary.completion', 'Month Completion') },
        { val: `${don}/${tot}`, lbl: t('year.summary.total', 'Checks Done') },
        { val: perf, lbl: t('year.summary.perfect', 'Perfect Days') },
        {
            val: bestHabit ? bestPct + '%' : '—',
            lbl: bestHabit ? bestHabit.name.split(' ').slice(0, 2).join(' ') + ' · best' : t('year.summary.best', 'Best Habit')
        },
    ];
});
// ── navigation ────────────────────────────────────────────────────────────────
function prevMonth() {
    trackerMonth.value--;
    if (trackerMonth.value < 0) {
        trackerMonth.value = 11;
        trackerYear.value--;
    }
}
function nextMonth() {
    trackerMonth.value++;
    if (trackerMonth.value > 11) {
        trackerMonth.value = 0;
        trackerYear.value++;
    }
}
function goToday() {
    const d = new Date();
    trackerYear.value = d.getFullYear();
    trackerMonth.value = d.getMonth();
}
// ── data loading ──────────────────────────────────────────────────────────────
async function loadMonth() {
    await checks.fetchMonth(trackerYear.value, trackerMonth.value);
}
watch([trackerYear, trackerMonth], loadMonth);
onMounted(async () => {
    if (!plans.plans.length)
        await plans.fetch();
    await loadMonth();
});
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
__VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
    ...{ class: "tracker-section" },
});
/** @type {__VLS_StyleScopedClasses['tracker-section']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "s3-nav" },
});
/** @type {__VLS_StyleScopedClasses['s3-nav']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.prevMonth) },
    ...{ class: "s3-btn" },
});
/** @type {__VLS_StyleScopedClasses['s3-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "s3-month-label" },
});
/** @type {__VLS_StyleScopedClasses['s3-month-label']} */ ;
(__VLS_ctx.monthLabel);
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.nextMonth) },
    ...{ class: "s3-btn" },
});
/** @type {__VLS_StyleScopedClasses['s3-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.goToday) },
    ...{ class: "s3-btn s3-today-btn" },
});
/** @type {__VLS_StyleScopedClasses['s3-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['s3-today-btn']} */ ;
(__VLS_ctx.t('tracker.today', 'Today'));
if (!__VLS_ctx.plans.plans.length) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "empty-state" },
    });
    /** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "empty-state-text" },
    });
    /** @type {__VLS_StyleScopedClasses['empty-state-text']} */ ;
    (__VLS_ctx.t('tracker.empty', 'Add plans in the Day section to start tracking'));
}
else {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "tracker-table-wrap" },
    });
    /** @type {__VLS_StyleScopedClasses['tracker-table-wrap']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
        ...{ class: "tracker-table" },
    });
    /** @type {__VLS_StyleScopedClasses['tracker-table']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
        ...{ class: "tr-week" },
    });
    /** @type {__VLS_StyleScopedClasses['tr-week']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
        ...{ class: "th-name col-name" },
    });
    /** @type {__VLS_StyleScopedClasses['th-name']} */ ;
    /** @type {__VLS_StyleScopedClasses['col-name']} */ ;
    (__VLS_ctx.t('tracker.task_habit', 'Task / Habit'));
    for (const [wk, wi] of __VLS_vFor((__VLS_ctx.weeks))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            key: ('wk' + wi),
            colspan: (7),
            ...{ class: (__VLS_ctx.weekHasToday(wk) ? 'th-week-today' : '') },
        });
        (__VLS_ctx.t('tracker.week_prefix', 'Week'));
        (wi + 1);
        // @ts-ignore
        [prevMonth, monthLabel, nextMonth, goToday, t, t, t, t, plans, weeks, weekHasToday,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
        ...{ class: "th-pct col-pct" },
    });
    /** @type {__VLS_StyleScopedClasses['th-pct']} */ ;
    /** @type {__VLS_StyleScopedClasses['col-pct']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
        ...{ class: "tr-day" },
    });
    /** @type {__VLS_StyleScopedClasses['tr-day']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
        ...{ class: "th-name col-name" },
    });
    /** @type {__VLS_StyleScopedClasses['th-name']} */ ;
    /** @type {__VLS_StyleScopedClasses['col-name']} */ ;
    (__VLS_ctx.shortMonthLabel);
    for (const [wk, wi] of __VLS_vFor((__VLS_ctx.weeks))) {
        ('wkd' + wi);
        for (const [cell, wd] of __VLS_vFor((wk))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                key: ('d' + wi + '-' + wd),
                ...{ class: "col-day" },
                ...{ class: (cell && __VLS_ctx.dateKey(cell.year, cell.month, cell.day) === __VLS_ctx.tKey ? 'th-today-day' : '') },
            });
            /** @type {__VLS_StyleScopedClasses['col-day']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "col-day-wd" },
            });
            /** @type {__VLS_StyleScopedClasses['col-day-wd']} */ ;
            (__VLS_ctx.WDAYS_M[wd]);
            if (cell) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.br)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "col-day-num" },
                    ...{ style: ({ color: __VLS_ctx.dateKey(cell.year, cell.month, cell.day) === __VLS_ctx.tKey ? 'var(--dark)' : 'var(--muted)', fontSize: '8px' }) },
                });
                /** @type {__VLS_StyleScopedClasses['col-day-num']} */ ;
                (cell.day);
            }
            // @ts-ignore
            [weeks, shortMonthLabel, dateKey, dateKey, tKey, tKey, WDAYS_M,];
        }
        // @ts-ignore
        [];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
        ...{ class: "th-pct col-pct" },
    });
    /** @type {__VLS_StyleScopedClasses['th-pct']} */ ;
    /** @type {__VLS_StyleScopedClasses['col-pct']} */ ;
    (__VLS_ctx.t('tracker.done_col', 'Done'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
    for (const [group] of __VLS_vFor((__VLS_ctx.groups))) {
        (group.label);
        if (group.items.length) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                ...{ class: "tr-group-sep" },
            });
            /** @type {__VLS_StyleScopedClasses['tr-group-sep']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "td-name-group" },
                colspan: (1 + __VLS_ctx.weeks.length * 7 + 1),
            });
            /** @type {__VLS_StyleScopedClasses['td-name-group']} */ ;
            (group.label);
            for (const [plan] of __VLS_vFor((group.items))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                    key: (plan.id),
                    ...{ class: "tr-habit-row" },
                });
                /** @type {__VLS_StyleScopedClasses['tr-habit-row']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    ...{ class: "td-name col-name" },
                });
                /** @type {__VLS_StyleScopedClasses['td-name']} */ ;
                /** @type {__VLS_StyleScopedClasses['col-name']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "td-name-inner" },
                });
                /** @type {__VLS_StyleScopedClasses['td-name-inner']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: (['td-type-dot', plan.type]) },
                });
                /** @type {__VLS_StyleScopedClasses['td-type-dot']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "td-plan-name" },
                    title: (plan.name),
                });
                /** @type {__VLS_StyleScopedClasses['td-plan-name']} */ ;
                (plan.name);
                for (const [wk, wi] of __VLS_vFor((__VLS_ctx.weeks))) {
                    ('row' + plan.id + 'wk' + wi);
                    for (const [cell, wd] of __VLS_vFor((wk))) {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                            key: ('row' + plan.id + 'd' + wi + '-' + wd),
                            ...{ class: "td-check col-day" },
                            ...{ class: ([
                                    wd === 6 && wi !== __VLS_ctx.weeks.length - 1 ? 'tc-week-sep' : '',
                                    !cell ? 'tc-empty' : '',
                                    cell && __VLS_ctx.dateKey(cell.year, cell.month, cell.day) === __VLS_ctx.tKey ? 'tc-today-col' : ''
                                ]) },
                        });
                        /** @type {__VLS_StyleScopedClasses['td-check']} */ ;
                        /** @type {__VLS_StyleScopedClasses['col-day']} */ ;
                        if (!cell) {
                            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                                ...{ class: "chk-box chk-empty" },
                            });
                            /** @type {__VLS_StyleScopedClasses['chk-box']} */ ;
                            /** @type {__VLS_StyleScopedClasses['chk-empty']} */ ;
                        }
                        else if (__VLS_ctx.isFuture(cell)) {
                            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                                ...{ class: "chk-box chk-future" },
                            });
                            /** @type {__VLS_StyleScopedClasses['chk-box']} */ ;
                            /** @type {__VLS_StyleScopedClasses['chk-future']} */ ;
                        }
                        else {
                            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                                ...{ onClick: (...[$event]) => {
                                        if (!!(!__VLS_ctx.plans.plans.length))
                                            return;
                                        if (!(group.items.length))
                                            return;
                                        if (!!(!cell))
                                            return;
                                        if (!!(__VLS_ctx.isFuture(cell)))
                                            return;
                                        __VLS_ctx.checks.toggle(plan.id, __VLS_ctx.dateKey(cell.year, cell.month, cell.day));
                                        // @ts-ignore
                                        [t, weeks, weeks, weeks, dateKey, dateKey, tKey, groups, isFuture, checks,];
                                    } },
                                ...{ class: "chk-box" },
                                ...{ class: (__VLS_ctx.checks.isChecked(plan.id, __VLS_ctx.dateKey(cell.year, cell.month, cell.day)) ? 'chk-done' : '') },
                            });
                            /** @type {__VLS_StyleScopedClasses['chk-box']} */ ;
                        }
                        // @ts-ignore
                        [dateKey, checks,];
                    }
                    // @ts-ignore
                    [];
                }
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    ...{ class: "td-pct col-pct" },
                });
                /** @type {__VLS_StyleScopedClasses['td-pct']} */ ;
                /** @type {__VLS_StyleScopedClasses['col-pct']} */ ;
                (__VLS_ctx.planPct(plan));
                // @ts-ignore
                [planPct,];
            }
        }
        // @ts-ignore
        [];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "tracker-summary" },
    });
    /** @type {__VLS_StyleScopedClasses['tracker-summary']} */ ;
    for (const [item] of __VLS_vFor((__VLS_ctx.summary))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (item.lbl),
            ...{ class: "tsumm-item" },
        });
        /** @type {__VLS_StyleScopedClasses['tsumm-item']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "tsumm-val" },
        });
        /** @type {__VLS_StyleScopedClasses['tsumm-val']} */ ;
        (item.val);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "tsumm-lbl" },
        });
        /** @type {__VLS_StyleScopedClasses['tsumm-lbl']} */ ;
        (item.lbl);
        // @ts-ignore
        [summary,];
    }
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
