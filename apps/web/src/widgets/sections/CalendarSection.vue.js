/// <reference types="D:/jisuanjisheji/PlainList/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="D:/jisuanjisheji/PlainList/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, ref } from 'vue';
import { usePlansStore } from '@/features/plans/model/usePlansStore';
import { useChecksStore } from '@/features/checks/model/useChecksStore';
import { useI18nStore } from '@/shared/i18n/useI18nStore';
const plansStore = usePlansStore();
const checksStore = useChecksStore();
const i18n = useI18nStore();
const year = ref(new Date().getFullYear());
const today = new Date();
const dayPopoverOpen = ref(false);
const dayPopover = ref(null);
const popoverStyle = ref({});
const MONTHS_S_DEFAULT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_DEFAULT = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WDAYS_S_DEFAULT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS_S = computed(() => i18n.L('MONTHS_S', MONTHS_S_DEFAULT));
const MONTHS = computed(() => i18n.L('MONTHS', MONTHS_DEFAULT));
const WDAYS_S = computed(() => i18n.L('WDAYS_S', WDAYS_S_DEFAULT));
const habits = computed(() => plansStore.plans.filter(p => p.type === 'habit'));
function t(key, fallback, params) {
    return i18n.t(key, fallback, params);
}
function firstDay(month) {
    return new Date(year.value, month, 1).getDay();
}
function daysInMonth(month) {
    return new Date(year.value, month + 1, 0).getDate();
}
function dateKey(month, day) {
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${year.value}-${mm}-${dd}`;
}
function completedTasksForDay(month, day) {
    const key = dateKey(month, day);
    return plansStore.plans.filter((plan) => checksStore.isChecked(plan.id, key));
}
function pctForDay(month, day) {
    const all = plansStore.plans;
    if (!all.length)
        return null;
    const done = completedTasksForDay(month, day).length;
    return Math.round((done / all.length) * 100);
}
function isFutureDay(month, day) {
    return new Date(year.value, month, day) > today;
}
function pctClass(pct) {
    if (pct === null)
        return 'pct-0';
    if (pct >= 100)
        return 'pct-100';
    if (pct >= 75)
        return 'pct-75';
    if (pct >= 50)
        return 'pct-50';
    if (pct >= 25)
        return 'pct-25';
    return 'pct-0';
}
function dayClass(month, day) {
    const date = new Date(year.value, month, day);
    const isToday = today.getFullYear() === year.value &&
        today.getMonth() === month &&
        today.getDate() === day;
    const isFuture = date > today;
    const pct = isFuture ? null : pctForDay(month, day);
    return [
        pctClass(pct),
        isToday ? 'today' : '',
        isFuture ? 'future' : '',
    ];
}
function dayTitle(month, day) {
    const isFuture = isFutureDay(month, day);
    const pct = isFuture ? null : pctForDay(month, day);
    return `${MONTHS_S.value[month]} ${day}: ${pct === null ? 'upcoming' : `${pct}%`}`;
}
function buildPopoverStyle(event) {
    const target = event.currentTarget;
    if (!target)
        return {};
    const rect = target.getBoundingClientRect();
    const width = Math.min(360, window.innerWidth - 24);
    const left = Math.min(Math.max(12, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 12);
    const top = Math.min(rect.bottom + 14, window.innerHeight - 260);
    return {
        left: `${left}px`,
        top: `${Math.max(16, top)}px`,
        width: `${width}px`,
    };
}
function openDayPopover(month, day, event) {
    const tasks = completedTasksForDay(month, day);
    dayPopover.value = {
        title: `${MONTHS.value[month]} ${day}, ${year.value}`,
        completed: tasks.length,
        total: plansStore.plans.length,
        tasks: tasks.map((task) => ({
            id: task.id,
            name: task.name,
            type: task.type,
            time: task.time,
        })),
    };
    popoverStyle.value = buildPopoverStyle(event);
    dayPopoverOpen.value = true;
}
function closeDayPopover() {
    dayPopoverOpen.value = false;
}
function weekMonday(week) {
    const jan1 = new Date(year.value, 0, 1);
    const date = new Date(jan1);
    date.setDate(jan1.getDate() + week * 7);
    return date;
}
function heatmapLevel(habitId, week) {
    const monday = weekMonday(week);
    let done = 0;
    let total = 0;
    for (let offset = 0; offset < 7; offset += 1) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + offset);
        if (date > today)
            continue;
        if (date.getFullYear() !== year.value)
            continue;
        total += 1;
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        if (checksStore.isChecked(habitId, `${year.value}-${mm}-${dd}`))
            done += 1;
    }
    if (!total)
        return '';
    const ratio = done / total;
    if (ratio >= 0.8)
        return 'lvl4';
    if (ratio >= 0.6)
        return 'lvl3';
    if (ratio >= 0.4)
        return 'lvl2';
    if (ratio > 0)
        return 'lvl1';
    return '';
}
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['nav-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['cal-day']} */ ;
/** @type {__VLS_StyleScopedClasses['cal-day']} */ ;
/** @type {__VLS_StyleScopedClasses['clickable']} */ ;
/** @type {__VLS_StyleScopedClasses['cal-day']} */ ;
/** @type {__VLS_StyleScopedClasses['cal-day']} */ ;
/** @type {__VLS_StyleScopedClasses['cal-day']} */ ;
/** @type {__VLS_StyleScopedClasses['cal-day']} */ ;
/** @type {__VLS_StyleScopedClasses['cal-day']} */ ;
/** @type {__VLS_StyleScopedClasses['cal-day']} */ ;
/** @type {__VLS_StyleScopedClasses['cal-day']} */ ;
/** @type {__VLS_StyleScopedClasses['cal-day']} */ ;
/** @type {__VLS_StyleScopedClasses['hm-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['hm-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['hm-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['hm-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['day-popover-close']} */ ;
/** @type {__VLS_StyleScopedClasses['day-popover-bullet']} */ ;
/** @type {__VLS_StyleScopedClasses['day-popover-bullet']} */ ;
/** @type {__VLS_StyleScopedClasses['cal-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['day-popover']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
    id: "s4",
    ...{ class: "section" },
});
/** @type {__VLS_StyleScopedClasses['section']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "section-header" },
});
/** @type {__VLS_StyleScopedClasses['section-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({
    ...{ class: "section-title" },
});
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
(__VLS_ctx.year);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "year-nav" },
});
/** @type {__VLS_StyleScopedClasses['year-nav']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.year--;
            // @ts-ignore
            [year, year,];
        } },
    ...{ class: "nav-btn" },
});
/** @type {__VLS_StyleScopedClasses['nav-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.year++;
            // @ts-ignore
            [year,];
        } },
    ...{ class: "nav-btn" },
});
/** @type {__VLS_StyleScopedClasses['nav-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "cal-grid" },
});
/** @type {__VLS_StyleScopedClasses['cal-grid']} */ ;
for (const [monthIndex] of __VLS_vFor((12))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        key: (monthIndex),
        ...{ class: "cal-month" },
    });
    /** @type {__VLS_StyleScopedClasses['cal-month']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "cal-month-name" },
    });
    /** @type {__VLS_StyleScopedClasses['cal-month-name']} */ ;
    (__VLS_ctx.MONTHS_S[monthIndex - 1]);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "cal-weekdays" },
    });
    /** @type {__VLS_StyleScopedClasses['cal-weekdays']} */ ;
    for (const [weekday] of __VLS_vFor((__VLS_ctx.WDAYS_S))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (weekday),
            ...{ class: "cal-wd" },
        });
        /** @type {__VLS_StyleScopedClasses['cal-wd']} */ ;
        (weekday);
        // @ts-ignore
        [MONTHS_S, WDAYS_S,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "cal-days-grid" },
    });
    /** @type {__VLS_StyleScopedClasses['cal-days-grid']} */ ;
    for (const [emptyDay] of __VLS_vFor((__VLS_ctx.firstDay(monthIndex - 1)))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
            key: (`empty-${monthIndex}-${emptyDay}`),
            ...{ class: "cal-day empty" },
        });
        /** @type {__VLS_StyleScopedClasses['cal-day']} */ ;
        /** @type {__VLS_StyleScopedClasses['empty']} */ ;
        // @ts-ignore
        [firstDay,];
    }
    for (const [day] of __VLS_vFor((__VLS_ctx.daysInMonth(monthIndex - 1)))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    __VLS_ctx.openDayPopover(monthIndex - 1, day, $event);
                    // @ts-ignore
                    [daysInMonth, openDayPopover,];
                } },
            key: (day),
            ...{ class: "cal-day clickable" },
            ...{ class: (__VLS_ctx.dayClass(monthIndex - 1, day)) },
            title: (__VLS_ctx.dayTitle(monthIndex - 1, day)),
            type: "button",
        });
        /** @type {__VLS_StyleScopedClasses['cal-day']} */ ;
        /** @type {__VLS_StyleScopedClasses['clickable']} */ ;
        // @ts-ignore
        [dayClass, dayTitle,];
    }
    // @ts-ignore
    [];
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "heatmap-section" },
});
/** @type {__VLS_StyleScopedClasses['heatmap-section']} */ ;
for (const [habit] of __VLS_vFor((__VLS_ctx.habits))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        key: (habit.id),
        ...{ class: "heatmap-row" },
    });
    /** @type {__VLS_StyleScopedClasses['heatmap-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "heatmap-row-label" },
    });
    /** @type {__VLS_StyleScopedClasses['heatmap-row-label']} */ ;
    (habit.name.length > 14 ? `${habit.name.slice(0, 13)}…` : habit.name);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "heatmap-cells" },
    });
    /** @type {__VLS_StyleScopedClasses['heatmap-cells']} */ ;
    for (const [week] of __VLS_vFor((52))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
            key: (week),
            ...{ class: "hm-cell" },
            ...{ class: (__VLS_ctx.heatmapLevel(habit.id, week - 1)) },
        });
        /** @type {__VLS_StyleScopedClasses['hm-cell']} */ ;
        // @ts-ignore
        [habits, heatmapLevel,];
    }
    // @ts-ignore
    [];
}
let __VLS_0;
/** @ts-ignore @type {typeof __VLS_components.Teleport | typeof __VLS_components.Teleport} */
Teleport;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    to: "body",
}));
const __VLS_2 = __VLS_1({
    to: "body",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
const { default: __VLS_5 } = __VLS_3.slots;
let __VLS_6;
/** @ts-ignore @type {typeof __VLS_components.Transition | typeof __VLS_components.Transition} */
Transition;
// @ts-ignore
const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
    name: "day-popover-fade",
}));
const __VLS_8 = __VLS_7({
    name: "day-popover-fade",
}, ...__VLS_functionalComponentArgsRest(__VLS_7));
const { default: __VLS_11 } = __VLS_9.slots;
if (__VLS_ctx.dayPopoverOpen && __VLS_ctx.dayPopover) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (__VLS_ctx.closeDayPopover) },
        ...{ class: "day-popover-overlay" },
    });
    /** @type {__VLS_StyleScopedClasses['day-popover-overlay']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: () => { } },
        ...{ class: "day-popover" },
        ...{ style: (__VLS_ctx.popoverStyle) },
    });
    /** @type {__VLS_StyleScopedClasses['day-popover']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "day-popover-head" },
    });
    /** @type {__VLS_StyleScopedClasses['day-popover-head']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "day-popover-date" },
    });
    /** @type {__VLS_StyleScopedClasses['day-popover-date']} */ ;
    (__VLS_ctx.dayPopover.title);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "day-popover-meta" },
    });
    /** @type {__VLS_StyleScopedClasses['day-popover-meta']} */ ;
    (__VLS_ctx.dayPopover.completed);
    (__VLS_ctx.dayPopover.total);
    (__VLS_ctx.t('tracker.done_col', 'Done'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.closeDayPopover) },
        ...{ class: "day-popover-close" },
        type: "button",
    });
    /** @type {__VLS_StyleScopedClasses['day-popover-close']} */ ;
    if (__VLS_ctx.dayPopover.tasks.length) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "day-popover-list" },
        });
        /** @type {__VLS_StyleScopedClasses['day-popover-list']} */ ;
        for (const [task] of __VLS_vFor((__VLS_ctx.dayPopover.tasks))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                key: (task.id),
                ...{ class: "day-popover-item" },
            });
            /** @type {__VLS_StyleScopedClasses['day-popover-item']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "day-popover-bullet" },
                ...{ class: (task.type) },
            });
            /** @type {__VLS_StyleScopedClasses['day-popover-bullet']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "day-popover-copy" },
            });
            /** @type {__VLS_StyleScopedClasses['day-popover-copy']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "day-popover-name" },
            });
            /** @type {__VLS_StyleScopedClasses['day-popover-name']} */ ;
            (task.name);
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "day-popover-type" },
            });
            /** @type {__VLS_StyleScopedClasses['day-popover-type']} */ ;
            (task.type === 'habit' ? __VLS_ctx.t('plan.type.habit', 'daily habit') : __VLS_ctx.t('plan.type.todo', 'task'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "day-popover-time" },
            });
            /** @type {__VLS_StyleScopedClasses['day-popover-time']} */ ;
            (task.time);
            // @ts-ignore
            [dayPopoverOpen, dayPopover, dayPopover, dayPopover, dayPopover, dayPopover, dayPopover, closeDayPopover, closeDayPopover, popoverStyle, t, t, t,];
        }
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "day-popover-empty" },
        });
        /** @type {__VLS_StyleScopedClasses['day-popover-empty']} */ ;
        (__VLS_ctx.t('tracker.empty', 'No completed items for this day'));
    }
}
// @ts-ignore
[t,];
var __VLS_9;
// @ts-ignore
[];
var __VLS_3;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
