<template>
  <div class="dhp" :class="{ open: expanded }">
    <button
      type="button"
      class="dhp-toggle"
      :aria-expanded="expanded ? 'true' : 'false'"
      @click="toggleExpanded"
    >
      <span class="dhp-toggle-main">
        <span class="dhp-chevron" aria-hidden="true">{{ expanded ? '▾' : '▸' }}</span>
        <span class="dhp-title">{{ t('stats.hours.title', '投入小时') }}</span>
      </span>
      <span class="dhp-total">
        {{ stats.totalHours > 0
          ? t('stats.hours.total', '{hours} h', { hours: formatHours(stats.totalHours) })
          : t('stats.hours.summary_empty', '暂无') }}
      </span>
    </button>

    <div v-show="expanded" class="dhp-body">
      <div v-if="!stats.hourRows.length" class="dhp-empty">
        {{ t('stats.hours.empty', '完成且带时长的事项才会计入') }}
      </div>

      <template v-else>
        <ul class="dhp-list">
          <li
            v-for="(row, index) in stats.hourRows"
            :key="rowKey(row, index)"
            class="dhp-row"
            :class="{ selected: isSelected(row) }"
          >
            <button type="button" class="dhp-row-main" @click="toggleSelect(row)">
              <span class="dhp-row-name">{{ row.label }}</span>
              <span class="dhp-row-hours">{{ formatHours(row.hours) }} h</span>
            </button>
            <div class="dhp-row-actions">
              <button
                v-if="row.planIds.length === 1"
                type="button"
                class="dhp-action"
                :title="t('stats.hours.hide', '移出')"
                @click="onHide(row.planIds[0])"
              >
                {{ t('stats.hours.hide_short', '隐') }}
              </button>
              <button
                v-else
                type="button"
                class="dhp-action"
                :title="t('stats.hours.unmerge', '拆分')"
                @click="onUnmergeRow(row)"
              >
                {{ t('stats.hours.unmerge_short', '拆') }}
              </button>
            </div>
          </li>
        </ul>

        <div class="dhp-merge-bar" v-if="selectedRows.length > 0">
          <span class="dhp-merge-hint">
            {{ selectedRows.length === 1
              ? t('stats.hours.pick_second', '再选一项合并')
              : t('stats.hours.ready_merge', '可合并两项') }}
          </span>
          <input
            v-if="selectedRows.length === 2"
            v-model="mergeLabel"
            class="dhp-merge-input"
            type="text"
            maxlength="100"
            :placeholder="t('stats.hours.merge_ph', '合并名称')"
            @keydown.enter.prevent="onMerge"
          />
          <button
            v-if="selectedRows.length === 2"
            type="button"
            class="dhp-merge-btn"
            :disabled="!mergeLabel.trim()"
            @click="onMerge"
          >
            {{ t('stats.hours.merge', '合并') }}
          </button>
          <button type="button" class="dhp-action" @click="clearSelection">
            {{ t('stats.hours.cancel', '取消') }}
          </button>
        </div>

        <div class="dhp-chart-switch">
          <button
            v-for="tab in chartTabs"
            :key="tab.key"
            type="button"
            class="dhp-chart-btn"
            :class="{ active: chartMode === tab.key }"
            :disabled="tab.key === 'radar' && !radarEnabled"
            :title="tab.key === 'radar' && !radarEnabled
              ? t('stats.hours.radar_need', '至少 3 项才可用雷达图')
              : undefined"
            @click="setChartMode(tab.key)"
          >
            {{ tab.label }}
          </button>
        </div>

        <div ref="chartEl" class="dhp-chart" />
      </template>

      <div v-if="hiddenPlans.length" class="dhp-hidden">
        <div class="dhp-subhead">{{ t('stats.hours.hidden', '已隐藏') }}</div>
        <div class="dhp-chips">
          <button
            v-for="plan in hiddenPlans"
            :key="plan.id"
            type="button"
            class="dhp-chip"
            @click="onRestore(plan.id)"
          >
            {{ plan.name }}
            <span class="dhp-chip-x">×</span>
          </button>
        </div>
      </div>

      <div v-if="prefs.merges.length" class="dhp-merges">
        <div class="dhp-subhead">{{ t('stats.hours.merges', '合并组') }}</div>
        <div class="dhp-chips">
          <button
            v-for="(merge, index) in prefs.merges"
            :key="`${merge.label}-${index}`"
            type="button"
            class="dhp-chip merge"
            @click="onUnmerge(index)"
          >
            {{ merge.label }}
            <span class="dhp-chip-x">×</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { aggregateDurationStats } from '@plainlist/shared'
import * as echarts from 'echarts'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useChecksStore } from '@/features/checks/model/useChecksStore'
import { useDurationChartPrefsStore } from '@/features/duration-stats/useDurationChartPrefsStore'
import { useMarketplaceStore } from '@/features/plugins/model/useMarketplaceStore'
import { usePlansStore } from '@/features/plans/model/usePlansStore'
import { useI18nStore } from '@/shared/i18n/useI18nStore'

const props = defineProps({
  scope: { type: String, required: true },
  scopeKey: { type: String, required: true },
  from: { type: String, required: true },
  to: { type: String, required: true },
})

const plansStore = usePlansStore()
const checksStore = useChecksStore()
const prefsStore = useDurationChartPrefsStore()
const pluginsStore = useMarketplaceStore()
const i18n = useI18nStore()
function t(key, fallback, params) {
  return i18n.t(key, fallback, params)
}

const chartEl = ref(null)
const chartMode = ref('bar')
const selectedRows = ref([])
const mergeLabel = ref('')
const expanded = ref(false)
let chartInst = null

async function toggleExpanded() {
  expanded.value = !expanded.value
  if (!expanded.value) {
    clearSelection()
    disposeChart()
    return
  }
  await nextTick()
  ensureChart()
}

const prefs = computed(() => prefsStore.getPrefs(props.scope, props.scopeKey))

const stats = computed(() =>
  aggregateDurationStats({
    plans: plansStore.plans,
    checks: checksStore.checks,
    from: props.from,
    to: props.to,
    prefs: prefs.value,
  }),
)

const radarEnabled = computed(() => stats.value.hourRows.length >= 3)

const chartTabs = computed(() => [
  { key: 'bar', label: t('stats.hours.chart.bar', '柱状') },
  { key: 'radar', label: t('stats.hours.chart.radar', '雷达') },
  { key: 'pie', label: t('stats.hours.chart.pie', '饼图') },
])

const hiddenPlans = computed(() =>
  prefs.value.hiddenPlanIds
    .map((id) => plansStore.plans.find((plan) => plan.id === id))
    .filter(Boolean),
)

function formatHours(value) {
  return Number(value).toFixed(1)
}

function rowKey(row, index) {
  return `${row.label}:${row.planIds.join(',')}:${index}`
}

function samePlanIds(a, b) {
  if (a.length !== b.length) return false
  const left = [...a].sort((x, y) => x - y)
  const right = [...b].sort((x, y) => x - y)
  return left.every((id, i) => id === right[i])
}

function isSelected(row) {
  return selectedRows.value.some((item) => samePlanIds(item.planIds, row.planIds))
}

function toggleSelect(row) {
  if (isSelected(row)) {
    selectedRows.value = selectedRows.value.filter((item) => !samePlanIds(item.planIds, row.planIds))
    return
  }
  if (selectedRows.value.length >= 2) {
    selectedRows.value = [selectedRows.value[1], row]
    return
  }
  selectedRows.value = [...selectedRows.value, row]
}

function clearSelection() {
  selectedRows.value = []
  mergeLabel.value = ''
}

function setChartMode(mode) {
  if (mode === 'radar' && !radarEnabled.value) return
  chartMode.value = mode
}

async function ensurePrefs() {
  await prefsStore.load(props.scope, props.scopeKey)
}

async function onHide(planId) {
  clearSelection()
  await prefsStore.hidePlan(props.scope, props.scopeKey, planId)
}

async function onRestore(planId) {
  await prefsStore.restorePlan(props.scope, props.scopeKey, planId)
}

async function onMerge() {
  if (selectedRows.value.length !== 2) return
  const label = mergeLabel.value.trim()
  if (!label) return
  const planIds = [...new Set(selectedRows.value.flatMap((row) => row.planIds))]
  const current = await prefsStore.ensureLoaded(props.scope, props.scopeKey)
  const nextMerges = current.merges.filter(
    (merge) => !merge.planIds.some((id) => planIds.includes(id)),
  )
  nextMerges.push({ label, planIds })
  clearSelection()
  await prefsStore.save(props.scope, props.scopeKey, {
    hiddenPlanIds: current.hiddenPlanIds,
    merges: nextMerges,
  })
}

async function onUnmerge(index) {
  await prefsStore.unmerge(props.scope, props.scopeKey, index)
}

async function onUnmergeRow(row) {
  const index = prefs.value.merges.findIndex((merge) => samePlanIds(merge.planIds, row.planIds))
  if (index >= 0) await onUnmerge(index)
}

function getCSSVar(name) {
  return pluginsStore.themeVars[name] ?? getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function buildChartOption() {
  const rows = stats.value.hourRows
  const dark = getCSSVar('--dark')
  const mid = getCSSVar('--mid')
  const muted = getCSSVar('--muted')
  const faint = getCSSVar('--faint')
  const labels = rows.map((row) => row.label)
  const values = rows.map((row) => row.hours)
  const mode = chartMode.value === 'radar' && rows.length < 3 ? 'bar' : chartMode.value

  if (mode === 'pie') {
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item' },
      series: [{
        type: 'pie',
        radius: ['34%', '68%'],
        center: ['50%', '52%'],
        label: { color: muted, fontSize: 10, formatter: '{b}\n{c}h' },
        data: rows.map((row, index) => ({
          name: row.label,
          value: row.hours,
          itemStyle: {
            color: index === 0 ? dark : index === 1 ? mid : muted,
          },
        })),
      }],
    }
  }

  if (mode === 'radar') {
    const max = Math.max(...values, 1)
    return {
      backgroundColor: 'transparent',
      radar: {
        indicator: labels.map((name) => ({ name, max })),
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

  return {
    backgroundColor: 'transparent',
    grid: { top: 12, bottom: 28, left: 36, right: 8 },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: {
        fontFamily: 'monospace',
        fontSize: 9,
        color: muted,
        interval: 0,
        hideOverlap: true,
      },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        fontFamily: 'monospace',
        fontSize: 9,
        color: faint,
        formatter: '{value}h',
      },
      splitLine: { lineStyle: { color: faint } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [{
      type: 'bar',
      barMaxWidth: 28,
      data: values.map((value, index) => ({
        value,
        itemStyle: {
          color: index === 0 ? dark : index === 1 ? mid : muted,
          borderRadius: [3, 3, 0, 0],
        },
      })),
    }],
  }
}

function disposeChart() {
  chartInst?.dispose()
  chartInst = null
}

function ensureChart() {
  if (!chartEl.value) {
    disposeChart()
    return
  }
  // v-if remounts the chart DOM after empty→rows; old instance is bound to a dead node
  if (chartInst && chartInst.getDom() !== chartEl.value) {
    disposeChart()
  }
  if (!chartInst) {
    chartInst = echarts.init(chartEl.value, null, { renderer: 'svg' })
  }
  chartInst.setOption(buildChartOption(), true)
  chartInst.resize()
}

function resizeChart() {
  chartInst?.resize()
}

function onThemeChanged() {
  if (!chartInst) return
  chartInst.setOption(buildChartOption(), true)
}

watch(
  () => [props.scope, props.scopeKey],
  async () => {
    clearSelection()
    chartMode.value = 'bar'
    await ensurePrefs()
  },
)

watch(
  () => [stats.value.hourRows, chartMode.value, prefs.value, expanded.value],
  async () => {
    if (!expanded.value) {
      disposeChart()
      return
    }
    if (chartMode.value === 'radar' && !radarEnabled.value) {
      chartMode.value = 'bar'
    }
    await nextTick()
    if (!stats.value.hourRows.length) {
      disposeChart()
      return
    }
    ensureChart()
  },
  { deep: true },
)

onMounted(async () => {
  await ensurePrefs()
  window.addEventListener('resize', resizeChart)
  document.addEventListener('theme:changed', onThemeChanged)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeChart)
  document.removeEventListener('theme:changed', onThemeChanged)
  disposeChart()
})
</script>

<style scoped>
.dhp {
  margin-top: 1.1rem;
  border-top: 1px solid var(--faint);
  padding-top: .85rem;
}
.dhp-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: .75rem;
  border: 0;
  background: transparent;
  color: inherit;
  padding: .15rem 0;
  cursor: pointer;
  text-align: left;
}
.dhp-toggle-main {
  display: inline-flex;
  align-items: center;
  gap: .45rem;
  min-width: 0;
}
.dhp-chevron {
  font-size: .7rem;
  color: var(--muted);
  width: .7rem;
}
.dhp-title {
  font-size: .95rem;
  font-weight: 700;
}
.dhp-total {
  font-family: var(--mono);
  font-size: .75rem;
  color: var(--muted);
  white-space: nowrap;
}
.dhp-body {
  margin-top: .75rem;
}
.dhp-empty {
  font-size: .8rem;
  color: var(--muted);
  padding: .4rem 0 .2rem;
}
.dhp-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: .35rem;
}
.dhp-row {
  display: flex;
  align-items: stretch;
  gap: .35rem;
  border: 1px solid var(--faint);
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface) 88%, var(--bg));
}
.dhp-row.selected {
  border-color: color-mix(in srgb, var(--dark) 35%, var(--faint));
  background: color-mix(in srgb, var(--surface) 82%, var(--dark) 6%);
}
.dhp-row-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: .75rem;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  padding: .55rem .7rem;
  cursor: pointer;
}
.dhp-row-name {
  font-size: .82rem;
  font-weight: 600;
}
.dhp-row-hours {
  font-family: var(--mono);
  font-size: .75rem;
  color: var(--mid);
  white-space: nowrap;
}
.dhp-row-actions {
  display: flex;
  align-items: center;
  padding-right: .35rem;
}
.dhp-action,
.dhp-merge-btn,
.dhp-chart-btn {
  border: 1px solid var(--faint);
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface) 84%, var(--bg));
  color: var(--mid);
  font-family: var(--mono);
  font-size: .65rem;
  padding: .3rem .55rem;
  cursor: pointer;
}
.dhp-action:hover,
.dhp-merge-btn:hover,
.dhp-chart-btn:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--mid) 30%, var(--faint));
  color: var(--dark);
}
.dhp-merge-btn:disabled,
.dhp-chart-btn:disabled {
  opacity: .4;
  cursor: not-allowed;
}
.dhp-merge-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: .45rem;
  margin-top: .65rem;
}
.dhp-merge-hint {
  font-size: .72rem;
  color: var(--muted);
}
.dhp-merge-input {
  flex: 1;
  min-width: 8rem;
  border: 1px solid var(--faint);
  border-radius: 6px;
  background: var(--bg);
  color: var(--dark);
  font-size: .78rem;
  padding: .35rem .55rem;
}
.dhp-chart-switch {
  display: flex;
  gap: .45rem;
  margin: .9rem 0 .55rem;
}
.dhp-chart-btn.active {
  background: var(--dark);
  border-color: var(--dark);
  color: var(--bg);
}
.dhp-chart {
  width: 100%;
  height: 220px;
}
.dhp-hidden,
.dhp-merges {
  margin-top: .9rem;
}
.dhp-subhead {
  font-size: .72rem;
  font-weight: 600;
  letter-spacing: .04em;
  color: var(--muted);
  margin-bottom: .4rem;
}
.dhp-chips {
  display: flex;
  flex-wrap: wrap;
  gap: .4rem;
}
.dhp-chip {
  display: inline-flex;
  align-items: center;
  gap: .3rem;
  border: 1px dashed var(--faint);
  border-radius: 999px;
  background: transparent;
  color: var(--mid);
  font-size: .72rem;
  padding: .28rem .55rem;
  cursor: pointer;
}
.dhp-chip.merge {
  border-style: solid;
}
.dhp-chip-x {
  opacity: .55;
}
</style>
