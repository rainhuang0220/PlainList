<template>
  <section class="section">
    <div class="week-header">
      <span class="week-title">{{ t('week.prefix', 'Week') }} {{ pad(weekNumber) }}</span>
      <span class="week-range">{{ rangeLabel }}</span>
    </div>

    <div class="week-days-row">
      <div
        v-for="(day, index) in weekDays"
        :key="index"
        class="week-day-card"
        :class="weekDayClasses(day)"
      >
        <div class="wdc-label">{{ day.label }}</div>
        <div class="wdc-date-num">{{ pad(day.date.getDate()) }}</div>
        <div class="wdc-pct">{{ day.pct !== null ? `${day.pct}%` : '—' }}</div>
        <div class="wdc-bar-track">
          <div class="wdc-bar-fill" :style="{ width: `${day.pct || 0}%` }" />
        </div>
        <div class="wdc-tasks">
          {{ day.pct !== null
            ? `${Math.round(totalPlans * (day.pct / 100))}/${totalPlans}`
            : totalPlans
              ? t('week.upcoming', 'upcoming')
              : t('week.no_data', 'no plans') }}
        </div>
      </div>
    </div>

    <div class="week-chart-switch">
      <button
        v-for="tab in chartTabs"
        :key="tab.key"
        class="week-chart-switch-btn"
        :class="{ active: activeChart === tab.key }"
        @click="activeChart = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="charts-row">
      <div class="chart-card" :class="{ active: activeChart === 'radar' }">
        <div class="chart-card-label">{{ t('week.chart.radar', 'Habit balance') }}</div>
        <div ref="radarEl" class="chart chart-radar" />
      </div>
      <div class="chart-card" :class="{ active: activeChart === 'bar' }">
        <div class="chart-card-label">{{ t('week.chart.bar', 'Daily completion') }}</div>
        <div ref="barEl" class="chart chart-bar" />
      </div>
      <div class="chart-card" :class="{ active: activeChart === 'line' }">
        <div class="chart-card-label">{{ t('week.chart.line', '28-day momentum') }}</div>
        <div ref="lineEl" class="chart chart-line" />
      </div>
    </div>

    <div class="week-insight">
      <div class="insight-item">
        <div class="insight-val">{{ avg }}%</div>
        <div class="insight-label">{{ t('week.insight.avg', 'Avg Completion') }}</div>
        <div class="insight-delta up">{{ t('week.this_week', 'this week') }}</div>
      </div>
      <div class="insight-item">
        <div class="insight-val">{{ activeDays }}</div>
        <div class="insight-label">{{ t('week.insight.active', 'Active Days') }}</div>
        <div class="insight-delta">{{ t('week.tracked', '{count}/7 tracked', { count: activeDays }) }}</div>
      </div>
      <div class="insight-item">
        <div class="insight-val">{{ bestDay || '—' }}</div>
        <div class="insight-label">{{ t('week.insight.best_day', 'Best Day') }}</div>
        <div class="insight-delta up">{{ t('week.peak', 'peak: {value}%', { value: maxPct }) }}</div>
      </div>
      <div class="insight-item">
        <div class="insight-val">{{ weakSlot.label }}</div>
        <div class="insight-label">{{ t('week.insight.weak_slot', 'Weakest Slot') }}</div>
        <div class="insight-delta">{{ weakSlot.detail }}</div>
      </div>
    </div>

    <div class="week-diagnostics">
      <div class="diagnostic-card">
        <div class="diagnostic-label">{{ t('week.diagnostic.debt', 'Task debt') }}</div>
        <div class="diagnostic-value">{{ debtPlan.name }}</div>
        <div class="diagnostic-copy">{{ debtPlan.detail }}</div>
      </div>
      <div class="diagnostic-card">
        <div class="diagnostic-label">{{ t('week.diagnostic.recovery', 'Recovery') }}</div>
        <div class="diagnostic-value">{{ recoveryLabel }}</div>
        <div class="diagnostic-copy">{{ recoveryCopy }}</div>
      </div>
      <div class="diagnostic-card">
        <div class="diagnostic-label">{{ t('week.diagnostic.structure', 'Structure') }}</div>
        <div class="diagnostic-value">{{ structureLabel }}</div>
        <div class="diagnostic-copy">{{ structureCopy }}</div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import { usePlansStore } from '@/features/plans/model/usePlansStore'
import { useChecksStore } from '@/features/checks/model/useChecksStore'
import { useMarketplaceStore } from '@/features/plugins/model/useMarketplaceStore'
import { useI18nStore } from '@/shared/i18n/useI18nStore'

const plansStore = usePlansStore()
const checksStore = useChecksStore()
const pluginsStore = useMarketplaceStore()
const i18n = useI18nStore()
function t(key, fallback, params) { return i18n.t(key, fallback, params) }

const radarEl = ref(null)
const barEl = ref(null)
const lineEl = ref(null)
const activeChart = ref('bar')

let chartRadar = null
let chartBar = null
let chartLine = null

const DAYS_S_DEFAULT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MONTHS_S_DEFAULT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function pad(value) { return String(value).padStart(2, '0') }

const today = new Date()
const dayNamesShort = computed(() => i18n.L('DAYS_S', DAYS_S_DEFAULT))
const monthNamesShort = computed(() => i18n.L('MONTHS_S', MONTHS_S_DEFAULT))

const monday = computed(() => {
  const date = new Date(today)
  const dayOfWeek = date.getDay()
  date.setDate(date.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
  date.setHours(0, 0, 0, 0)
  return date
})

const weekNumber = computed(() => {
  const start = new Date(today.getFullYear(), 0, 0)
  const diff = today - start
  return Math.ceil(Math.floor(diff / 86400000) / 7)
})

const rangeLabel = computed(() => {
  const sunday = new Date(monday.value)
  sunday.setDate(monday.value.getDate() + 6)

  if (i18n.locale === 'zh-CN') {
    return `${monthNamesShort.value[monday.value.getMonth()]}${monday.value.getDate()}日 - ${monthNamesShort.value[sunday.getMonth()]}${sunday.getDate()}日`
  }

  return `${monthNamesShort.value[monday.value.getMonth()]} ${monday.value.getDate()} - ${monthNamesShort.value[sunday.getMonth()]} ${sunday.getDate()}`
})

const totalPlans = computed(() => plansStore.plans.length)
const chartTabs = computed(() => [
  { key: 'bar', label: t('week.chart.bar_short', 'Day') },
  { key: 'line', label: t('week.chart.line_short', 'Momentum') },
  { key: 'radar', label: t('week.chart.radar_short', 'Habits') },
])

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function pctForDate(date) {
  const all = plansStore.plans
  if (!all.length) return null
  if (date > today) return null
  const key = dateKey(date)
  const done = all.filter((plan) => checksStore.isChecked(plan.id, key)).length
  return Math.round((done / all.length) * 100)
}

const weekDays = computed(() => Array.from({ length: 7 }, (_, index) => {
  const date = new Date(monday.value)
  date.setDate(monday.value.getDate() + index)
  const pct = pctForDate(date)
  return {
    date,
    label: dayNamesShort.value[date.getDay()],
    isToday: date.toDateString() === today.toDateString(),
    isFuture: pct === null && date > today,
    isComplete: pct === 100,
    isMissed: pct === 0,
    pct,
  }
}))

const pcts = computed(() => weekDays.value.map((day) => day.pct))
const dayLabels = computed(() => weekDays.value.map((day) => day.label))
const validPcts = computed(() => pcts.value.filter((value) => value !== null))
const avg = computed(() => validPcts.value.length ? Math.round(validPcts.value.reduce((left, right) => left + right, 0) / validPcts.value.length) : 0)
const activeDays = computed(() => validPcts.value.length)
const maxPct = computed(() => validPcts.value.length ? Math.max(...validPcts.value) : 0)
const bestDay = computed(() => {
  if (!validPcts.value.length) return '—'
  const index = pcts.value.indexOf(maxPct.value)
  return index >= 0 ? dayLabels.value[index] : '—'
})

const habits = computed(() => plansStore.plans.filter((plan) => plan.type === 'habit'))
const todos = computed(() => plansStore.plans.filter((plan) => plan.type === 'todo'))

function rangeDates(days) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today)
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() - (days - 1 - index))
    return date
  }).filter((date) => date <= today)
}

const momentumDays = computed(() => rangeDates(28).map((date) => ({
  date,
  key: dateKey(date),
  pct: pctForDate(date),
})))

const momentumSeries = computed(() => momentumDays.value.map((day, index, list) => {
  const from = Math.max(0, index - 6)
  const values = list.slice(from, index + 1).map((item) => item.pct).filter((value) => value !== null)
  return values.length
    ? Math.round(values.reduce((left, right) => left + right, 0) / values.length)
    : null
}))

function planCompletion(plan, dates) {
  if (!dates.length) return 0
  const done = dates.filter((date) => checksStore.isChecked(plan.id, dateKey(date))).length
  return Math.round(done / dates.length * 100)
}

const elapsedWeekDates = computed(() => weekDays.value.filter((day) => day.pct !== null).map((day) => day.date))
const habitScores = computed(() => habits.value.map((habit) => ({
  plan: habit,
  pct: planCompletion(habit, elapsedWeekDates.value),
})))

const debtPlan = computed(() => {
  if (!plansStore.plans.length || !elapsedWeekDates.value.length) {
    return {
      name: '—',
      detail: t('week.diagnostic.waiting', 'Need real checked days before ranking weak points.'),
    }
  }

  const ranked = plansStore.plans
    .map((plan) => ({ plan, pct: planCompletion(plan, elapsedWeekDates.value) }))
    .sort((left, right) => left.pct - right.pct)
  const target = ranked[0]
  return {
    name: target.plan.name,
    detail: t('week.diagnostic.debt_detail', '{pct}% this week. Move it earlier or shrink the task.', { pct: target.pct }),
  }
})

const slotDefs = computed(() => [
  { label: t('group.morning_early', 'Before 9:00'), test: (hour) => hour < 9 },
  { label: t('group.morning', '9:00-13:00'), test: (hour) => hour >= 9 && hour < 13 },
  { label: t('group.afternoon', '13:00-18:00'), test: (hour) => hour >= 13 && hour < 18 },
  { label: t('group.evening', 'After 18:00'), test: (hour) => hour >= 18 },
])

const weakSlot = computed(() => {
  if (!plansStore.plans.length || !elapsedWeekDates.value.length) {
    return {
      label: '—',
      detail: t('week.diagnostic.waiting', 'Need real checked days before ranking weak points.'),
    }
  }

  const ranked = slotDefs.value
    .map((slot) => {
      const slotPlans = plansStore.plans.filter((plan) => slot.test(Number.parseInt(plan.time.split(':')[0], 10) || 0))
      const total = slotPlans.length * elapsedWeekDates.value.length
      const done = slotPlans.reduce((sum, plan) => (
        sum + elapsedWeekDates.value.filter((date) => checksStore.isChecked(plan.id, dateKey(date))).length
      ), 0)
      return {
        label: slot.label,
        total,
        pct: total ? Math.round(done / total * 100) : 101,
      }
    })
    .filter((slot) => slot.total > 0)
    .sort((left, right) => left.pct - right.pct)

  const target = ranked[0]
  if (!target) {
    return { label: '—', detail: t('week.diagnostic.no_slot', 'No timed plans yet.') }
  }
  return {
    label: target.label,
    detail: t('week.diagnostic.slot_detail', '{pct}% completion', { pct: target.pct }),
  }
})

const recoveryLabel = computed(() => {
  const values = pcts.value.filter((value) => value !== null)
  if (values.length < 2) return '—'
  const last = values[values.length - 1]
  const previous = values[values.length - 2]
  const delta = last - previous
  return delta >= 0 ? `+${delta}%` : `${delta}%`
})

const recoveryCopy = computed(() => {
  if (recoveryLabel.value === '—') return t('week.diagnostic.recovery_empty', 'Need at least two tracked days.')
  return t('week.diagnostic.recovery_copy', 'Change from the previous tracked day.')
})

const habitAvg = computed(() => habitScores.value.length
  ? Math.round(habitScores.value.reduce((sum, item) => sum + item.pct, 0) / habitScores.value.length)
  : null)

const todoAvg = computed(() => todos.value.length
  ? Math.round(todos.value.reduce((sum, item) => sum + planCompletion(item, elapsedWeekDates.value), 0) / todos.value.length)
  : null)

const structureLabel = computed(() => {
  if (habitAvg.value === null && todoAvg.value === null) return '—'
  return `${habitAvg.value ?? '—'} / ${todoAvg.value ?? '—'}`
})

const structureCopy = computed(() => t('week.diagnostic.structure_copy', 'habit / task completion split'))

function weekDayClasses(day) {
  return {
    'today-card': day.isToday,
    'future-card': day.isFuture,
    'complete-card': day.isComplete,
    'missed-card': day.isMissed && !day.isToday,
  }
}

function getCSSVar(name) {
  return pluginsStore.themeVars[name] ?? getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function buildRadarOption() {
  const indicators = habits.value.length
    ? habits.value.map((habit) => ({ name: habit.name.split(' ').slice(0, 2).join(' '), max: 100 }))
    : [{ name: t('week.no_habits', 'No habits'), max: 100 }]
  const values = habitScores.value.length ? habitScores.value.map((item) => item.pct) : [0]
  const dark = getCSSVar('--dark')
  const faint = getCSSVar('--faint')
  const muted = getCSSVar('--muted')
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
  }
}

function buildBarOption() {
  const dark = getCSSVar('--dark')
  const mid = getCSSVar('--mid')
  const muted = getCSSVar('--muted')
  const faint = getCSSVar('--faint')
  const faint2 = getCSSVar('--faint2')
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
      data: pcts.value.map((value) => ({
        value,
        itemStyle: {
          color: value === null ? faint2 : value >= 80 ? dark : value >= 60 ? mid : muted,
          borderRadius: [3, 3, 0, 0],
        },
      })),
    }],
  }
}

function buildLineOption() {
  const dark = getCSSVar('--dark')
  const faint = getCSSVar('--faint')
  const muted = getCSSVar('--muted')
  const mid = getCSSVar('--mid')
  const labels = momentumDays.value.map((day) => `${day.date.getMonth() + 1}/${day.date.getDate()}`)
  return {
    backgroundColor: 'transparent',
    grid: { top: 8, bottom: 24, left: 24, right: 8 },
    xAxis: {
      type: 'category',
      data: labels,
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
    series: [
      {
        name: t('week.chart.raw', 'daily'),
        type: 'bar',
        barMaxWidth: 7,
        data: momentumDays.value.map((day) => day.pct),
        itemStyle: { color: faint, borderRadius: [2, 2, 0, 0] },
      },
      {
        name: t('week.chart.rolling', '7-day average'),
        type: 'line',
        smooth: true,
        data: momentumSeries.value,
        lineStyle: { color: dark, width: 2 },
        itemStyle: { color: dark },
        areaStyle: { color: `${mid}18` },
        symbol: 'circle',
        symbolSize: 3,
      },
    ],
  }
}

function initCharts() {
  if (radarEl.value && !chartRadar) {
    chartRadar = echarts.init(radarEl.value, null, { renderer: 'svg' })
  }
  if (barEl.value && !chartBar) {
    chartBar = echarts.init(barEl.value, null, { renderer: 'svg' })
  }
  if (lineEl.value && !chartLine) {
    chartLine = echarts.init(lineEl.value, null, { renderer: 'svg' })
  }
  chartRadar?.setOption(buildRadarOption())
  chartBar?.setOption(buildBarOption())
  chartLine?.setOption(buildLineOption())
}

function resizeCharts() {
  chartRadar?.resize()
  chartBar?.resize()
  chartLine?.resize()
}

watch([pcts, habits], () => {
  chartRadar?.setOption(buildRadarOption(), true)
  chartBar?.setOption(buildBarOption(), true)
  chartLine?.setOption(buildLineOption(), true)
}, { deep: true })

watch(() => ({ ...pluginsStore.themeVars }), () => {
  chartRadar?.setOption(buildRadarOption(), true)
  chartBar?.setOption(buildBarOption(), true)
  chartLine?.setOption(buildLineOption(), true)
}, { deep: true })

watch(activeChart, () => {
  nextTick(() => {
    resizeCharts()
    chartRadar?.setOption(buildRadarOption(), true)
    chartBar?.setOption(buildBarOption(), true)
    chartLine?.setOption(buildLineOption(), true)
  })
})

function onThemeChanged() {
  chartRadar?.setOption(buildRadarOption(), true)
  chartBar?.setOption(buildBarOption(), true)
  chartLine?.setOption(buildLineOption(), true)
}

onMounted(() => {
  const start = rangeDates(35)[0]
  checksStore.fetchRange(dateKey(start), dateKey(today))
  initCharts()
  document.addEventListener('theme:changed', onThemeChanged)
  window.addEventListener('resize', resizeCharts)
})

onBeforeUnmount(() => {
  document.removeEventListener('theme:changed', onThemeChanged)
  window.removeEventListener('resize', resizeCharts)
  chartRadar?.dispose()
  chartBar?.dispose()
  chartLine?.dispose()
})
</script>

<style scoped>
.section { padding: 2rem 1.5rem; }

.week-header { display: flex; align-items: baseline; gap: 1rem; margin-bottom: 1.5rem; }
.week-title  { font-size: 1.4rem; font-weight: 700; }
.week-range  { font-size: .85rem; color: var(--muted); }

.week-days-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: .6rem;
  margin-bottom: 1.5rem;
}
.week-day-card {
  border: 1px solid var(--faint);
  border-radius: 8px;
  padding: .6rem .4rem;
  text-align: center;
  background: var(--surface);
  transition: border-color .15s ease, background .15s ease, transform .15s ease;
}
.week-day-card:hover {
  border-color: color-mix(in srgb, var(--mid) 30%, var(--surface));
  transform: translateY(-1px);
}
.week-day-card.today-card {
  background: var(--dark);
  border-color: var(--dark);
  color: var(--bg);
}
.week-day-card.future-card {
  border-style: dashed;
  background: color-mix(in srgb, var(--surface) 70%, var(--bg));
  color: var(--muted);
}
.week-day-card.complete-card:not(.today-card) {
  border-color: color-mix(in srgb, var(--dark) 26%, var(--surface));
  background: color-mix(in srgb, var(--surface) 90%, var(--dark) 5%);
}
.week-day-card.missed-card:not(.today-card) {
  border-color: color-mix(in srgb, var(--faint) 92%, var(--dark));
}
.wdc-label    { font-size: .6rem; font-weight: 600; letter-spacing: .05em; color: inherit; opacity: .6; }
.wdc-date-num { font-size: 1.1rem; font-weight: 700; margin: .2rem 0; }
.wdc-pct      { font-size: .75rem; font-weight: 600; }
.wdc-bar-track {
  height: 3px;
  background: var(--faint);
  border-radius: 2px;
  margin: .4rem 0;
  overflow: hidden;
}
.today-card .wdc-bar-track { background: color-mix(in srgb, var(--bg) 20%, transparent); }
.wdc-bar-fill  { height: 100%; background: currentColor; border-radius: 2px; transition: width .3s; }
.wdc-tasks     { font-size: .6rem; opacity: .5; }

.week-chart-switch {
  display: none;
  gap: .55rem;
  margin-bottom: 1rem;
}
.week-chart-switch-btn {
  border: 1px solid var(--faint);
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface) 84%, var(--bg));
  color: var(--mid);
  padding: .45rem .8rem;
  font-family: var(--mono);
  font-size: .65rem;
  letter-spacing: .08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: border-color .15s ease, color .15s ease, background .15s ease;
}
.week-chart-switch-btn.active {
  border-color: var(--dark);
  background: var(--dark);
  color: var(--bg);
}

.charts-row {
  display: grid;
  grid-template-columns: 1fr 1.5fr 1.5fr;
  gap: 1rem;
  margin-bottom: 1.5rem;
}
.chart-card {
  border: 1px solid var(--faint);
  border-radius: 12px;
  padding: .85rem .95rem .7rem;
  background: color-mix(in srgb, var(--surface) 92%, var(--bg));
}
.chart-card-label {
  margin-bottom: .55rem;
  font-size: .62rem;
  letter-spacing: .11em;
  text-transform: uppercase;
  color: var(--muted);
}
.chart { height: 180px; }

.week-insight {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: .8rem;
}
.insight-item {
  border: 1px solid var(--faint);
  border-radius: 8px;
  padding: .8rem 1rem;
}
.insight-val   { font-size: 1.4rem; font-weight: 700; }
.insight-label { font-size: .7rem; color: var(--muted); margin: .2rem 0; }
.insight-delta { font-size: .65rem; color: var(--muted); }
.insight-delta.up { color: var(--mid); }

.week-diagnostics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: .8rem;
  margin-top: .8rem;
}

.diagnostic-card {
  min-width: 0;
  border: 1px solid var(--faint);
  border-radius: 8px;
  padding: .8rem 1rem;
  background: color-mix(in srgb, var(--surface) 88%, var(--bg));
}

.diagnostic-label {
  font-family: var(--mono);
  font-size: .62rem;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--muted);
}

.diagnostic-value {
  margin-top: .35rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 1rem;
  font-weight: 700;
}

.diagnostic-copy {
  margin-top: .2rem;
  color: var(--muted);
  font-size: .68rem;
  line-height: 1.45;
}

@media (max-width: 900px) {
  .charts-row {
    grid-template-columns: 1fr;
  }

  .week-diagnostics {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .week-chart-switch {
    display: flex;
    flex-wrap: wrap;
  }

  .charts-row {
    display: block;
  }

  .chart-card {
    display: none;
    margin-bottom: 1rem;
  }

  .chart-card.active {
    display: block;
  }

  .week-insight {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .week-insight {
    grid-template-columns: 1fr;
  }
}
</style>
