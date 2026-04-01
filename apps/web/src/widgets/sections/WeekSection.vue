<template>
  <section id="s5" class="section">
    <!-- Week header -->
    <div class="week-header">
      <span class="week-title">{{ t('week.prefix', 'Week') }} {{ pad(weekNumber) }}</span>
      <span class="week-range">{{ rangeLabel }}</span>
    </div>

    <!-- 7 day cards -->
    <div class="week-days-row">
      <div
        v-for="(day, i) in weekDays"
        :key="i"
        class="week-day-card"
        :class="{ 'today-card': day.isToday }"
      >
        <div class="wdc-label">{{ day.label }}</div>
        <div class="wdc-date-num">{{ pad(day.date.getDate()) }}</div>
        <div class="wdc-pct">{{ day.pct !== null ? day.pct + '%' : '—' }}</div>
        <div class="wdc-bar-track">
          <div class="wdc-bar-fill" :style="{ width: (day.pct || 0) + '%' }" />
        </div>
        <div class="wdc-tasks">
          {{ day.pct !== null
            ? Math.round(totalPlans * (day.pct / 100)) + '/' + totalPlans
            : 'upcoming' }}
        </div>
      </div>
    </div>

    <!-- Charts row -->
    <div class="charts-row">
      <div ref="radarEl"   class="chart chart-radar" />
      <div ref="barEl"     class="chart chart-bar" />
      <div ref="lineEl"    class="chart chart-line" />
    </div>

    <!-- Insight cards -->
    <div class="week-insight">
      <div class="insight-item">
        <div class="insight-val">{{ avg }}%</div>
        <div class="insight-label">{{ t('week.insight.avg', 'Avg Completion') }}</div>
        <div class="insight-delta up">this week</div>
      </div>
      <div class="insight-item">
        <div class="insight-val">{{ activeDays }}</div>
        <div class="insight-label">{{ t('week.insight.active', 'Active Days') }}</div>
        <div class="insight-delta">{{ activeDays }}/7 tracked</div>
      </div>
      <div class="insight-item">
        <div class="insight-val">{{ bestDay || '—' }}</div>
        <div class="insight-label">{{ t('week.insight.best_day', 'Best Day') }}</div>
        <div class="insight-delta up">peak: {{ maxPct }}%</div>
      </div>
      <div class="insight-item">
        <div class="insight-val">{{ streak }}d</div>
        <div class="insight-label">{{ t('week.insight.streak', 'Current Streak') }}</div>
        <div class="insight-delta">days in a row</div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import { usePlansStore } from '@/features/plans/model/usePlansStore'
import { useChecksStore } from '@/features/checks/model/useChecksStore'
import { usePluginsStore } from '@/features/plugins/model/usePluginsStore'
import { useI18nStore } from '@/shared/i18n/useI18nStore'

const plansStore   = usePlansStore()
const checksStore  = useChecksStore()
const pluginsStore = usePluginsStore()
const i18n         = useI18nStore()
function t(key, fallback) { return i18n.t(key, fallback) }

const radarEl = ref(null)
const barEl   = ref(null)
const lineEl  = ref(null)

let chartRadar = null
let chartBar   = null
let chartLine  = null

const DAYS_S   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MONTHS_S = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function pad(n) { return String(n).padStart(2, '0') }

const today = new Date()

// Monday of current week
const monday = computed(() => {
  const d = new Date(today)
  const dow = d.getDay()
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
  d.setHours(0, 0, 0, 0)
  return d
})

const weekNumber = computed(() => {
  const start = new Date(today.getFullYear(), 0, 0)
  const diff = today - start
  return Math.ceil(Math.floor(diff / 86400000) / 7)
})

const rangeLabel = computed(() => {
  const sun = new Date(monday.value)
  sun.setDate(monday.value.getDate() + 6)
  return `${MONTHS_S[monday.value.getMonth()]} ${monday.value.getDate()} – ${MONTHS_S[sun.getMonth()]} ${sun.getDate()}`
})

const totalPlans = computed(() => plansStore.plans.length)

function pctForDate(date) {
  const all = plansStore.plans
  if (!all.length) return null
  if (date > today) return null
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const key = `${date.getFullYear()}-${mm}-${dd}`
  const done = all.filter(p => checksStore.isChecked(p.id, key)).length
  return Math.round((done / all.length) * 100)
}

const weekDays = computed(() => {
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday.value)
    date.setDate(monday.value.getDate() + i)
    const isToday = date.toDateString() === today.toDateString()
    return {
      date,
      label: DAYS_S[date.getDay()].toUpperCase(),
      isToday,
      pct: pctForDate(date),
    }
  })
})

const pcts = computed(() => weekDays.value.map(d => d.pct))
const dayLabels = computed(() => weekDays.value.map(d => d.label.slice(0, 3)))

const validPcts = computed(() => pcts.value.filter(v => v !== null))
const avg        = computed(() => validPcts.value.length ? Math.round(validPcts.value.reduce((a, b) => a + b, 0) / validPcts.value.length) : 0)
const activeDays = computed(() => validPcts.value.length)
const maxPct     = computed(() => validPcts.value.length ? Math.max(...validPcts.value) : 0)
const bestDay    = computed(() => {
  const idx = pcts.value.indexOf(maxPct.value)
  return idx >= 0 ? dayLabels.value[idx] : '—'
})

const streak = computed(() => {
  let s = 0
  const d = new Date(today)
  while (s <= 365) {
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const key = `${d.getFullYear()}-${mm}-${dd}`
    const all = plansStore.plans
    if (!all.length) break
    const done = all.filter(p => checksStore.isChecked(p.id, key)).length
    if (done === 0) break
    s++
    d.setDate(d.getDate() - 1)
  }
  return s
})

const habits = computed(() => plansStore.plans.filter(p => p.type === 'habit'))

// Fake 3 prior weeks for line chart context
const priorWeeks = [
  [65, 72, 68, 55, 80, 75, 70],
  [70, 60, 85, 78, 66, 80, 77],
  [80, 75, 90, 82, 85, 78, 83],
]

function getCSSVar(name) {
  return pluginsStore.themeVars[name] ?? getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function buildRadarOption() {
  const indicators = habits.value.length
    ? habits.value.map(habit => ({ name: habit.name.split(' ').slice(0, 2).join(' '), max: 100 }))
    : [{ name: 'No habits', max: 100 }]
  const values = habits.value.map(() => {
    const done = validPcts.value.length ? avg.value : 0
    return done
  })
  const dark  = getCSSVar('--dark')
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
  const dark   = getCSSVar('--dark')
  const mid    = getCSSVar('--mid')
  const muted  = getCSSVar('--muted')
  const faint  = getCSSVar('--faint')
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
      data: pcts.value.map(v => ({
        value: v,
        itemStyle: {
          color: v === null ? faint2 : v >= 80 ? dark : v >= 60 ? mid : muted,
          borderRadius: [3, 3, 0, 0],
        },
      })),
    }],
  }
}

function buildLineOption() {
  const dark  = getCSSVar('--dark')
  const faint = getCSSVar('--faint')
  const muted = getCSSVar('--muted')
  const currentData = pcts.value.map(v => v ?? 0)
  const series = [...priorWeeks, currentData].map((d, i) => ({
    type: 'line',
    smooth: true,
    data: d,
    lineStyle: { color: i === 3 ? dark : faint, width: i === 3 ? 2 : 1 },
    itemStyle: { color: i === 3 ? dark : faint },
    symbol: i === 3 ? 'circle' : 'none',
    symbolSize: 4,
    showSymbol: i === 3,
  }))
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

onMounted(() => {
  initCharts()
  document.addEventListener('theme:changed', onThemeChanged)
})

function onThemeChanged() {
  chartRadar?.setOption(buildRadarOption(), true)
  chartBar?.setOption(buildBarOption(), true)
  chartLine?.setOption(buildLineOption(), true)
}

onBeforeUnmount(() => {
  document.removeEventListener('theme:changed', onThemeChanged)
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
}
.week-day-card.today-card {
  background: var(--dark);
  border-color: var(--dark);
  color: var(--bg);
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

.charts-row {
  display: grid;
  grid-template-columns: 1fr 1.5fr 1.5fr;
  gap: 1rem;
  margin-bottom: 1.5rem;
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
</style>
