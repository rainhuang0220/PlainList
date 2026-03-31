/// <reference types="D:/jisuanjisheji/PlainList/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="D:/jisuanjisheji/PlainList/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, nextTick, ref, watch } from 'vue';
import { usePlansStore } from '@/features/plans/model/usePlansStore';
import { useChecksStore } from '@/features/checks/model/useChecksStore';
import { useI18nStore } from '@/shared/i18n/useI18nStore';
const plansStore = usePlansStore();
const checksStore = useChecksStore();
const i18n = useI18nStore();
const year = ref(new Date().getFullYear());
const today = new Date();
const monthDetailOpen = ref(false);
const selectedMonth = ref(0);
const MONTHS_S_DEFAULT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_DEFAULT = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WDAYS_S_DEFAULT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS_S = computed(() => i18n.L('MONTHS_S', MONTHS_S_DEFAULT));
const MONTHS = computed(() => i18n.L('MONTHS', MONTHS_DEFAULT));
const WDAYS_S = computed(() => i18n.L('WDAYS_S', WDAYS_S_DEFAULT));
const habits = computed(() => plansStore.plans.filter(p => p.type === 'habit'));
function firstDay(m) {
    return new Date(year.value, m, 1).getDay();
}
function daysInMonth(m) {
    return new Date(year.value, m + 1, 0).getDate();
}
function dateKey(m, d) {
    const mm = String(m + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    return `${year.value}-${mm}-${dd}`;
}
function pctForDay(m, d) {
    const key = dateKey(m, d);
    const all = plansStore.plans;
    if (!all.length)
        return null;
    const done = all.filter(p => checksStore.isChecked(p.id, key)).length;
    return Math.round((done / all.length) * 100);
}
function completedCount(m, d) {
    const key = dateKey(m, d);
    return plansStore.plans.filter(p => checksStore.isChecked(p.id, key)).length;
}
function isFutureDay(m, d) {
    const date = new Date(year.value, m, d);
    return date > today;
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
function dayClass(m, d) {
    const date = new Date(year.value, m, d);
    const isToday = today.getFullYear() === year.value &&
        today.getMonth() === m &&
        today.getDate() === d;
    const isFuture = date > today;
    const pct = isFuture ? null : pctForDay(m, d);
    return [
        pctClass(pct),
        isToday ? 'today' : '',
        isFuture ? 'future' : '',
        'clickable'
    ];
}
function dayTitle(m, d) {
    const date = new Date(year.value, m, d);
    const isFuture = date > today;
    const pct = isFuture ? null : pctForDay(m, d);
    return `${MONTHS_S.value[m]} ${d}: ${pct === null ? 'upcoming' : pct + '%'}`;
}
function openMonthDetail(m) {
    selectedMonth.value = m;
    monthDetailOpen.value = true;
}
function closeMonthDetail() {
    monthDetailOpen.value = false;
}
// Auto-fit text: measure each span and scale to fill its tile
function fitAllTaskTexts() {
    nextTick(() => {
        // Small delay to ensure layout is complete after animation
        requestAnimationFrame(() => {
            const spans = document.querySelectorAll('.mdv-task-text[data-fit]');
            spans.forEach(span => {
                // Reset any previous transform
                span.style.transform = '';
                span.style.fontSize = '14px';
                span.style.whiteSpace = 'nowrap';
                const tile = span.parentElement;
                if (!tile)
                    return;
                const tileW = tile.clientWidth - 6; // minus padding
                const tileH = tile.clientHeight - 6;
                if (tileW <= 0 || tileH <= 0)
                    return;
                // Measure natural text size at base font
                const textW = span.scrollWidth;
                const textH = span.scrollHeight;
                if (textW <= 0 || textH <= 0)
                    return;
                // Scale to fill — allow both X and Y stretch independently
                const scaleX = tileW / textW;
                const scaleY = tileH / textH;
                // Use the smaller scale to fit without overflow, then stretch the other axis
                // But cap individual axis stretch to avoid extreme distortion (max 2.5x ratio)
                let sx = scaleX;
                let sy = scaleY;
                const ratio = Math.max(sx, sy) / Math.min(sx, sy);
                if (ratio > 2.5) {
                    // Limit distortion: use uniform scale + mild stretch
                    const uniform = Math.min(sx, sy);
                    sx = sx > sy ? uniform * 2.5 : uniform;
                    sy = sy > sx ? uniform * 2.5 : uniform;
                }
                span.style.transform = `scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
                span.style.transformOrigin = 'center center';
            });
        });
    });
}
// Trigger fit when month detail opens
watch(monthDetailOpen, (open) => {
    if (open)
        fitAllTaskTexts();
});
// Get only days with completed tasks for artistic view
function activeDaysInMonth(m) {
    const days = [];
    const totalDays = daysInMonth(m);
    for (let d = 1; d <= totalDays; d++) {
        if (isFutureDay(m, d))
            continue;
        const completed = completedCount(m, d);
        if (completed === 0)
            continue; // Skip days with no completed tasks
        const key = dateKey(m, d);
        const tasks = plansStore.plans
            .filter(p => checksStore.isChecked(p.id, key))
            .map(p => ({ id: p.id, name: p.name }));
        const _date = new Date(year.value, m, d);
        const isToday = today.getFullYear() === year.value &&
            today.getMonth() === m &&
            today.getDate() === d;
        days.push({
            date: d,
            completed,
            tasks,
            isToday
        });
    }
    return days;
}
// Seeded pseudo-random for stable "randomness" per day
function seededRand(seed) {
    let x = Math.sin(seed * 9301 + 49297) * 49297;
    return x - Math.floor(x);
}
// Recursive binary-split treemap for day boxes in the month (七巧板 style)
// Computes all day rects at once, then caches
const _dayTileCache = { month: -1, year: -1, tiles: [] };
function computeDayTiles(month) {
    const allDays = activeDaysInMonth(month);
    const n = allDays.length;
    if (n === 0)
        return [];
    if (n === 1)
        return [{ left: 0, top: 0, width: 100, height: 100 }];
    // Weight per day: flatten the range so small days don't get crushed
    const maxCompleted = Math.max(...allDays.map(d => d.completed));
    const weights = allDays.map((d, i) => {
        // Compress range: min 60% of max weight, so small days stay readable
        const normalized = 0.6 + 0.4 * (d.completed / Math.max(maxCompleted, 1));
        const jitter = 0.85 + seededRand(d.date * 41 + i * 17 + month * 7) * 0.3; // 0.85–1.15
        return normalized * jitter;
    });
    function splitRect(indices, x, y, w, h, depth) {
        if (indices.length === 0)
            return [];
        if (indices.length === 1) {
            return [{ idx: indices[0], left: x, top: y, width: w, height: h }];
        }
        const totalW = indices.reduce((s, i) => s + weights[i], 0);
        // Alternate direction with randomness
        const horizontal = (depth % 2 === 0) !== (seededRand(month * 5 + depth * 11 + indices.length) > 0.6);
        // Split target: 35–65% of total weight
        const splitTarget = totalW * (0.35 + seededRand(month * 19 + depth * 23 + indices[0] * 3) * 0.3);
        let cumulative = 0;
        let splitAt = 1;
        for (let i = 0; i < indices.length - 1; i++) {
            cumulative += weights[indices[i]];
            if (cumulative >= splitTarget) {
                splitAt = i + 1;
                break;
            }
        }
        const ratio = cumulative / totalW;
        const groupA = indices.slice(0, splitAt);
        const groupB = indices.slice(splitAt);
        if (horizontal) {
            const wA = w * ratio;
            return [
                ...splitRect(groupA, x, y, wA, h, depth + 1),
                ...splitRect(groupB, x + wA, y, w - wA, h, depth + 1)
            ];
        }
        else {
            const hA = h * ratio;
            return [
                ...splitRect(groupA, x, y, w, hA, depth + 1),
                ...splitRect(groupB, x, y + hA, w, h - hA, depth + 1)
            ];
        }
    }
    const indices = allDays.map((_, i) => i);
    const rects = splitRect(indices, 0, 0, 100, 100, 0);
    rects.sort((a, b) => a.idx - b.idx);
    return rects.map(r => ({ left: r.left, top: r.top, width: r.width, height: r.height }));
}
function getDayTiles(month) {
    if (_dayTileCache.month !== month || _dayTileCache.year !== year.value) {
        _dayTileCache.month = month;
        _dayTileCache.year = year.value;
        _dayTileCache.tiles = computeDayTiles(month);
    }
    return _dayTileCache.tiles;
}
function treemapDayStyle(day, index) {
    const tiles = getDayTiles(selectedMonth.value);
    const tile = tiles[index];
    if (!tile)
        return {};
    const gap = 3;
    const r1 = seededRand(day.date * 11 + 5);
    const r2 = seededRand(day.date * 23 + 9);
    const borderRadius = `${2 + Math.floor(r1 * 8)}px`;
    const bgOpacity = 3 + Math.floor(r2 * 5);
    return {
        position: 'absolute',
        left: `calc(${tile.left}% + ${gap}px)`,
        top: `calc(${tile.top}% + ${gap}px)`,
        width: `calc(${tile.width}% - ${gap * 2}px)`,
        height: `calc(${tile.height}% - ${gap * 2}px)`,
        animationDelay: `${index * 50}ms`,
        borderRadius,
        background: `color-mix(in srgb, var(--dark) ${bgOpacity}%, var(--surface))`
    };
}
// Slice-and-dice treemap for tasks inside a day box (七巧板 style)
// Returns an array of { left, top, width, height } rects in % for all tasks
function computeTaskTiles(day) {
    const tasks = day.tasks;
    const n = tasks.length;
    if (n === 0)
        return [];
    if (n === 1)
        return [{ left: 0, top: 0, width: 100, height: 100 }];
    // Give each task a weight with seeded jitter so sizes vary
    const weights = tasks.map((t, i) => {
        const base = 1;
        const jitter = 0.5 + seededRand(day.date * 37 + i * 11) * 1.5; // 0.5–2.0
        return base * jitter;
    });
    // Recursive binary split
    function splitRect(indices, x, y, w, h, depth) {
        if (indices.length === 0)
            return [];
        if (indices.length === 1) {
            return [{ idx: indices[0], left: x, top: y, width: w, height: h }];
        }
        const totalW = indices.reduce((s, i) => s + weights[i], 0);
        // Alternate split direction, with jitter on the split point
        const horizontal = (depth % 2 === 0) !== (seededRand(day.date * 3 + depth * 7) > 0.65);
        // Find split point: roughly half the weight, with some randomness
        let splitTarget = totalW * (0.35 + seededRand(day.date * 13 + depth * 19) * 0.3); // 35–65%
        let cumulative = 0;
        let splitAt = 1;
        for (let i = 0; i < indices.length - 1; i++) {
            cumulative += weights[indices[i]];
            if (cumulative >= splitTarget) {
                splitAt = i + 1;
                break;
            }
        }
        const ratio = cumulative / totalW;
        const groupA = indices.slice(0, splitAt);
        const groupB = indices.slice(splitAt);
        if (horizontal) {
            // Split horizontally (left | right)
            const wA = w * ratio;
            const wB = w - wA;
            return [
                ...splitRect(groupA, x, y, wA, h, depth + 1),
                ...splitRect(groupB, x + wA, y, wB, h, depth + 1)
            ];
        }
        else {
            // Split vertically (top / bottom)
            const hA = h * ratio;
            const hB = h - hA;
            return [
                ...splitRect(groupA, x, y, w, hA, depth + 1),
                ...splitRect(groupB, x, y + hA, w, hB, depth + 1)
            ];
        }
    }
    const indices = tasks.map((_, i) => i);
    const rects = splitRect(indices, 0, 0, 100, 100, 0);
    // Sort by idx to match task order
    rects.sort((a, b) => a.idx - b.idx);
    return rects.map(r => ({ left: r.left, top: r.top, width: r.width, height: r.height }));
}
// Cache computed tiles per day to avoid recalc per task
const _tileCache = new Map();
function getTilesForDay(day) {
    const key = `${day.date}-${day.tasks.length}`;
    if (!_tileCache.has(key)) {
        _tileCache.set(key, computeTaskTiles(day));
    }
    return _tileCache.get(key);
}
// Style for each task tile — absolute positioned, font fills the box
function taskTileStyle(day, taskIndex) {
    const tiles = getTilesForDay(day);
    const tile = tiles[taskIndex];
    if (!tile)
        return {};
    const seed = day.date * 31 + taskIndex * 7;
    const gap = 2;
    const _textLen = day.tasks[taskIndex]?.name?.length || 1;
    // Aspect ratio of this tile
    const aspect = tile.width / Math.max(tile.height, 0.1);
    // Vertical text for tall narrow tiles (aspect < 0.6)
    const isVertical = aspect < 0.55;
    // Font weight: heavier for bigger tiles
    const area = tile.width * tile.height / 10000;
    const weightIdx = Math.min(4, Math.floor(Math.sqrt(area) * 4.5));
    const weightOptions = [400, 500, 600, 700, 800];
    const fontWeight = weightOptions[weightIdx];
    const style = {
        position: 'absolute',
        left: `calc(${tile.left}% + ${gap}px)`,
        top: `calc(${tile.top}% + ${gap}px)`,
        width: `calc(${tile.width}% - ${gap * 2}px)`,
        height: `calc(${tile.height}% - ${gap * 2}px)`,
        fontWeight,
        lineHeight: 1.05,
        padding: '3px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        overflow: 'hidden',
        borderRadius: `${2 + Math.floor(seededRand(seed + 3) * 6)}px`
    };
    if (isVertical) {
        style.writingMode = 'vertical-rl';
        style.textOrientation = 'mixed';
    }
    return style;
}
function _monthDayClass(m, d) {
    const date = new Date(year.value, m, d);
    const isToday = today.getFullYear() === year.value &&
        today.getMonth() === m &&
        today.getDate() === d;
    const isFuture = date > today;
    return [
        isToday ? 'today' : '',
        isFuture ? 'future' : '',
    ];
}
function _monthDayStyle(m, d) {
    if (isFutureDay(m, d))
        return {};
    const count = completedCount(m, d);
    const allCounts = [];
    for (let day = 1; day <= daysInMonth(m); day++) {
        if (!isFutureDay(m, day)) {
            allCounts.push(completedCount(m, day));
        }
    }
    const avgCount = allCounts.reduce((a, b) => a + b, 0) / allCounts.length;
    if (count >= avgCount * 1.5 && count >= 3) {
        return { gridRow: 'span 2' };
    }
    return {};
}
// Heatmap: map week index → Mon date of that week in `year`
function weekMonday(w) {
    const jan1 = new Date(year.value, 0, 1);
    const d = new Date(jan1);
    d.setDate(jan1.getDate() + w * 7);
    return d;
}
function heatmapLevel(habitId, w) {
    const mon = weekMonday(w);
    let done = 0, total = 0;
    for (let i = 0; i < 7; i++) {
        const d = new Date(mon);
        d.setDate(mon.getDate() + i);
        if (d > today)
            continue;
        if (d.getFullYear() !== year.value)
            continue;
        total++;
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        if (checksStore.isChecked(habitId, `${year.value}-${mm}-${dd}`))
            done++;
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
/** @type {__VLS_StyleScopedClasses['mdv-close']} */ ;
/** @type {__VLS_StyleScopedClasses['mdv-tree-day']} */ ;
/** @type {__VLS_StyleScopedClasses['mdv-tree-day']} */ ;
/** @type {__VLS_StyleScopedClasses['today']} */ ;
/** @type {__VLS_StyleScopedClasses['mdv-tree-day']} */ ;
/** @type {__VLS_StyleScopedClasses['today']} */ ;
/** @type {__VLS_StyleScopedClasses['mdv-tree-day']} */ ;
/** @type {__VLS_StyleScopedClasses['today']} */ ;
/** @type {__VLS_StyleScopedClasses['mdv-tree-date-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['mdv-tree-task']} */ ;
/** @type {__VLS_StyleScopedClasses['mdv-tree-task']} */ ;
/** @type {__VLS_StyleScopedClasses['mdv-header']} */ ;
/** @type {__VLS_StyleScopedClasses['mdv-title']} */ ;
/** @type {__VLS_StyleScopedClasses['mdv-tree-day']} */ ;
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
for (const [m] of __VLS_vFor((12))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        key: (m),
        ...{ class: "cal-month" },
    });
    /** @type {__VLS_StyleScopedClasses['cal-month']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "cal-month-name" },
    });
    /** @type {__VLS_StyleScopedClasses['cal-month-name']} */ ;
    (__VLS_ctx.MONTHS_S[m - 1]);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "cal-weekdays" },
    });
    /** @type {__VLS_StyleScopedClasses['cal-weekdays']} */ ;
    for (const [wd] of __VLS_vFor((__VLS_ctx.WDAYS_S))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (wd),
            ...{ class: "cal-wd" },
        });
        /** @type {__VLS_StyleScopedClasses['cal-wd']} */ ;
        (wd);
        // @ts-ignore
        [MONTHS_S, WDAYS_S,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "cal-days-grid" },
    });
    /** @type {__VLS_StyleScopedClasses['cal-days-grid']} */ ;
    for (const [_] of __VLS_vFor((__VLS_ctx.firstDay(m - 1)))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
            key: ('e' + _),
            ...{ class: "cal-day empty" },
        });
        /** @type {__VLS_StyleScopedClasses['cal-day']} */ ;
        /** @type {__VLS_StyleScopedClasses['empty']} */ ;
        // @ts-ignore
        [firstDay,];
    }
    for (const [d] of __VLS_vFor((__VLS_ctx.daysInMonth(m - 1)))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
            ...{ onClick: (...[$event]) => {
                    __VLS_ctx.openMonthDetail(m - 1);
                    // @ts-ignore
                    [daysInMonth, openMonthDetail,];
                } },
            key: (d),
            ...{ class: "cal-day" },
            ...{ class: (__VLS_ctx.dayClass(m - 1, d)) },
            title: (__VLS_ctx.dayTitle(m - 1, d)),
        });
        /** @type {__VLS_StyleScopedClasses['cal-day']} */ ;
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
    (habit.name.length > 14 ? habit.name.slice(0, 13) + '…' : habit.name);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "heatmap-cells" },
    });
    /** @type {__VLS_StyleScopedClasses['heatmap-cells']} */ ;
    for (const [w] of __VLS_vFor((52))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
            key: (w),
            ...{ class: "hm-cell" },
            ...{ class: (__VLS_ctx.heatmapLevel(habit.id, w - 1)) },
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
if (__VLS_ctx.monthDetailOpen) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (__VLS_ctx.closeMonthDetail) },
        ...{ class: "month-detail-overlay" },
    });
    /** @type {__VLS_StyleScopedClasses['month-detail-overlay']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "month-detail-container" },
    });
    /** @type {__VLS_StyleScopedClasses['month-detail-container']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "mdv-header" },
    });
    /** @type {__VLS_StyleScopedClasses['mdv-header']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({
        ...{ class: "mdv-title" },
    });
    /** @type {__VLS_StyleScopedClasses['mdv-title']} */ ;
    (__VLS_ctx.MONTHS[__VLS_ctx.selectedMonth]);
    (__VLS_ctx.year);
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.closeMonthDetail) },
        ...{ class: "mdv-close" },
    });
    /** @type {__VLS_StyleScopedClasses['mdv-close']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "mdv-treemap" },
        ref: "treemapContainer",
    });
    /** @type {__VLS_StyleScopedClasses['mdv-treemap']} */ ;
    for (const [day, index] of __VLS_vFor((__VLS_ctx.activeDaysInMonth(__VLS_ctx.selectedMonth)))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (day.date),
            ...{ class: "mdv-tree-day" },
            ...{ class: ({ today: day.isToday }) },
            ...{ style: (__VLS_ctx.treemapDayStyle(day, index)) },
        });
        /** @type {__VLS_StyleScopedClasses['mdv-tree-day']} */ ;
        /** @type {__VLS_StyleScopedClasses['today']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "mdv-tree-date-badge" },
        });
        /** @type {__VLS_StyleScopedClasses['mdv-tree-date-badge']} */ ;
        (day.date);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "mdv-tree-tasks-area" },
        });
        /** @type {__VLS_StyleScopedClasses['mdv-tree-tasks-area']} */ ;
        for (const [task, taskIndex] of __VLS_vFor((day.tasks))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                key: (task.id),
                ...{ class: "mdv-tree-task" },
                ...{ style: (__VLS_ctx.taskTileStyle(day, taskIndex)) },
            });
            /** @type {__VLS_StyleScopedClasses['mdv-tree-task']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "mdv-task-text" },
                'data-fit': (`${day.date}-${taskIndex}`),
            });
            /** @type {__VLS_StyleScopedClasses['mdv-task-text']} */ ;
            (task.name);
            // @ts-ignore
            [year, monthDetailOpen, closeMonthDetail, closeMonthDetail, MONTHS, selectedMonth, selectedMonth, activeDaysInMonth, treemapDayStyle, taskTileStyle,];
        }
        // @ts-ignore
        [];
    }
}
// @ts-ignore
[];
var __VLS_3;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
