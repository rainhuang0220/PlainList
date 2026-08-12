<template>
  <div v-if="blocks.length" class="dsa" :class="{ open: expanded }">
    <button
      type="button"
      class="dsa-toggle"
      :aria-expanded="expanded ? 'true' : 'false'"
      @click="toggleExpanded"
    >
      <span class="dsa-toggle-main">
        <span class="dsa-chevron" aria-hidden="true">{{ expanded ? '▾' : '▸' }}</span>
        <span class="dsa-label">{{ t('plan.day.axis', '今日时间轴') }}</span>
      </span>
      <span class="dsa-summary">
        {{ t('plan.day.axis_summary', '{count} 项', { count: blocks.length }) }}
      </span>
    </button>
    <div v-show="expanded" class="dsa-body">
      <div ref="chartEl" class="dsa-canvas" :style="{ height: `${chartHeight}px` }" />
    </div>
  </div>
</template>

<script setup>
import { DAY_VIEW_END, DAY_VIEW_START, timeToMinutes } from '@plainlist/shared'
import * as echarts from 'echarts'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18nStore } from '@/shared/i18n/useI18nStore'

const props = defineProps({
  plans: { type: Array, default: () => [] },
  /** Record or Map-like: planId -> done */
  doneMap: { type: Object, default: () => ({}) },
})

const i18n = useI18nStore()
function t(key, fallback, params) {
  return i18n.t(key, fallback, params)
}

const chartEl = ref(null)
const expanded = ref(false)
let chart = null

async function toggleExpanded() {
  expanded.value = !expanded.value
  if (!expanded.value) {
    disposeChart()
    return
  }
  await nextTick()
  render()
}

const DAY_SPAN = DAY_VIEW_END - DAY_VIEW_START

function fmtMinutes(minutes) {
  const clamped = ((Math.round(minutes) % (24 * 60)) + (24 * 60)) % (24 * 60)
  const hour = Math.floor(clamped / 60)
  const minute = clamped % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function fmtTimeFromPlan(totalMinutes) {
  return fmtMinutes(totalMinutes)
}

const blocks = computed(() => {
  return props.plans
    .filter((plan) => plan?.time && /^\d{2}:\d{2}$/.test(plan.time))
    .map((plan) => {
      const startMin = timeToMinutes(plan.time)
      const duration = typeof plan.durationMinutes === 'number' && plan.durationMinutes > 0
        ? plan.durationMinutes
        : null
      const done = Boolean(props.doneMap?.[plan.id])
      if (duration != null) {
        const endMin = startMin + duration
        return {
          id: plan.id,
          kind: 'bar',
          label: plan.name,
          done,
          start: plan.time,
          end: fmtTimeFromPlan(endMin),
          startMin,
          endMin,
        }
      }
      return {
        id: plan.id,
        kind: 'point',
        label: plan.name,
        done,
        start: plan.time,
        end: fmtTimeFromPlan(startMin + 30),
        startMin,
        endMin: startMin + 30,
      }
    })
    .sort((a, b) => a.startMin - b.startMin || String(a.id).localeCompare(String(b.id)))
})

const chartHeight = computed(() => Math.max(120, blocks.value.length * 40 + 48))

function disposeChart() {
  chart?.dispose()
  chart = null
}

function render() {
  if (!chartEl.value || blocks.value.length === 0) {
    disposeChart()
    return
  }

  if (chart && chart.getDom() !== chartEl.value) {
    disposeChart()
  }
  if (!chart) {
    chart = echarts.init(chartEl.value, null, { renderer: 'svg' })
  }

  const styles = getComputedStyle(document.documentElement)
  const muted = styles.getPropertyValue('--muted').trim() || '#888888'

  const labels = blocks.value.map((block) => block.label)
  const offsets = blocks.value.map((block) => Math.max(0, block.startMin - DAY_VIEW_START))
  const durations = blocks.value.map((block) =>
    Math.max(8, block.endMin - block.startMin),
  )

  chart.setOption({
    backgroundColor: 'transparent',
    animation: true,
    animationDuration: 900,
    animationEasing: 'cubicOut',
    animationDelay: (idx) => idx * 140,
    grid: { left: 4, right: 8, top: 4, bottom: 4, containLabel: true },
    xAxis: {
      type: 'value',
      min: 0,
      max: DAY_SPAN,
      axisLabel: {
        color: muted,
        fontSize: 10,
        formatter: (value) => fmtMinutes(DAY_VIEW_START + value),
      },
      splitLine: { lineStyle: { color: 'rgba(0,0,0,0.05)' } },
    },
    yAxis: {
      type: 'category',
      data: labels,
      inverse: true,
      axisLabel: { color: muted, fontSize: 11, width: 88, overflow: 'truncate' },
      axisTick: { show: false },
      axisLine: { show: false },
    },
    tooltip: {
      trigger: 'item',
      formatter: (params) => {
        const block = blocks.value[params.dataIndex]
        if (!block) return ''
        if (block.kind === 'point') {
          return `${block.label}<br/>${block.start}`
        }
        return `${block.label}<br/>${block.start} – ${block.end}`
      },
    },
    series: [
      {
        name: 'offset',
        type: 'bar',
        stack: 'day',
        silent: true,
        itemStyle: { color: 'transparent' },
        data: offsets,
        animation: false,
      },
      {
        name: 'task',
        type: 'bar',
        stack: 'day',
        barMinHeight: 6,
        data: durations.map((value, index) => {
          const block = blocks.value[index]
          const base = block?.kind === 'point' ? '#1d3557' : '#2d6a4f'
          return {
            value,
            itemStyle: {
              color: base,
              opacity: block?.done ? 0.35 : 0.92,
              borderRadius: block?.kind === 'point' ? 999 : 6,
            },
          }
        }),
        animationDelay: (idx) => idx * 140,
      },
    ],
  }, true)
  chart.resize()
}

function onResize() {
  chart?.resize()
}

onMounted(() => {
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  disposeChart()
})

watch(
  () => [blocks.value, chartHeight.value, expanded.value],
  async () => {
    if (!expanded.value) {
      disposeChart()
      return
    }
    await nextTick()
    render()
  },
  { deep: true },
)
</script>

<style scoped>
.dsa {
  margin: 0 0 14px;
  padding: 10px 0 6px;
  border-bottom: 1px solid var(--faint);
}

.dsa-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: .75rem;
  border: 0;
  background: transparent;
  color: inherit;
  padding: .1rem 0;
  cursor: pointer;
  text-align: left;
}

.dsa-toggle-main {
  display: inline-flex;
  align-items: center;
  gap: .45rem;
  min-width: 0;
}

.dsa-chevron {
  font-size: .7rem;
  color: var(--muted);
  width: .7rem;
}

.dsa-label {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
}

.dsa-summary {
  font-family: var(--mono);
  font-size: .75rem;
  color: var(--muted);
  white-space: nowrap;
}

.dsa-body {
  margin-top: 6px;
}

.dsa-canvas {
  width: 100%;
  min-height: 120px;
}
</style>
