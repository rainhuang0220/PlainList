<template>
  <section class="plans-section">
    <div class="plan-list">
      <div v-if="!plans.plans.length" class="empty-state">
        <div class="empty-state-icon">○</div>
        <div class="empty-state-text">{{ t('plan.empty', 'No plans yet — add your first habit or task below') }}</div>
      </div>
      <template v-else>
        <template v-for="(group, gi) in groupedPlans" :key="gi">
          <div class="plan-group-label">{{ group.label }}</div>
          <div
            v-for="p in group.items"
            :key="p.id"
            class="plan-item"
            :class="{ 'done-item': checks.isChecked(p.id, todayKey()) }"
            @click="onRowClick(p)"
          >
            <div class="plan-check" :class="{ done: checks.isChecked(p.id, todayKey()) }"></div>
            <div class="plan-text">
              <div class="plan-name">{{ p.name }}</div>
              <div class="plan-meta">{{ p.type === 'habit' ? t('plan.type.habit', '↻ daily habit') : t('plan.type.todo', '⊡ task') }}</div>
            </div>
            <span class="plan-tag" :class="p.type">{{ p.type }}</span>
            <span class="plan-time">{{ p.time }}</span>
            <button v-if="!auth.isAdmin" class="plan-del" title="remove" @click.stop="plans.remove(p.id)">×</button>
          </div>
        </template>
      </template>
    </div>

    <div v-if="!auth.isAdmin" class="plan-controls">
      <div class="add-plan-bar">
        <button class="add-plan-btn" @click="openForm">
          <span class="apb-icon">+</span> {{ t('plan.add_btn', 'Add habit or task') }}
        </button>
      </div>
      <div class="add-plan-form" :class="{ open: formOpen }">
        <div class="apf-row">
          <input ref="nameInput" class="apf-input" v-model="newName" :placeholder="t('plan.add_name_ph', 'Name')" @keydown.enter="submitPlan" />
          <div class="apf-type">
            <button class="apf-type-btn" :class="{ active: newType === 'habit' }" @click="newType = 'habit'">{{ t('plan.add_habit', 'Habit') }}</button>
            <button class="apf-type-btn" :class="{ active: newType === 'todo' }" @click="newType = 'todo'">{{ t('plan.add_task', 'Task') }}</button>
          </div>
          <input class="apf-input apf-time" v-model="newTime" placeholder="08:00" maxlength="5" />
        </div>
        <div class="apf-actions">
          <button class="apf-cancel" @click="cancelForm">{{ t('plan.add_cancel', 'Cancel') }}</button>
          <button class="apf-save" @click="submitPlan">{{ t('plan.add_save', 'Add') }}</button>
        </div>
      </div>
    </div>

    <div class="month-strip">
      <div class="strip-header">
        <button class="strip-nav" @click="prevMonth">&#8249;</button>
        <span class="strip-month-label">{{ monthLabel }}</span>
        <button class="strip-nav" @click="nextMonth">&#8250;</button>
      </div>
      <div class="month-strip-rows">
        <div v-for="d in daysInStrip" :key="d.day" class="day-row">
          <div class="day-num" :class="{ today: d.isToday }">{{ d.day }}</div>
          <div class="day-dots">
            <div
              v-for="h in habitPlans"
              :key="h.id"
              class="day-cell"
              :class="{ done: !d.isFuture && checks.isChecked(h.id, d.key) }"
            ></div>
          </div>
          <div class="day-pct" :class="{ full: d.pct === 100 }">
            {{ d.isFuture || !plans.plans.length ? '—' : d.pct + '%' }}
          </div>
        </div>
      </div>
    </div>

    <div class="s2-stats">
      <div class="stat-item">
        <span class="stat-val">{{ doneCount }}</span>
        <span class="stat-lbl">{{ t('stat.done', 'done') }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-val">{{ remainCount }}</span>
        <span class="stat-lbl">{{ t('stat.remaining', 'remaining') }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-val">{{ pct }}%</span>
        <span class="stat-lbl">{{ t('stat.completion', 'complete') }}</span>
      </div>
      <div ref="chartEl" class="stat-chart"></div>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import { usePlansStore } from '@/features/plans/model/usePlansStore'
import { useChecksStore } from '@/features/checks/model/useChecksStore'
import { useAuthStore } from '@/features/auth/model/useAuthStore'
import { useI18nStore } from '@/shared/i18n/useI18nStore'

const plans  = usePlansStore()
const checks = useChecksStore()
const auth   = useAuthStore()
const i18n   = useI18nStore()
function t(key, fallback) { return i18n.t(key, fallback) }

// ── helpers ───────────────────────────────────────────────────────────────────

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function dateKey(y, m, d) {
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
]

// ── grouping ──────────────────────────────────────────────────────────────────

const GROUPS = [
  { key: 'group.morning_early', fallback: 'Morning · before 9:00',   test: h => h < 9  },
  { key: 'group.morning',       fallback: 'Morning · 9:00–13:00',    test: h => h < 13 },
  { key: 'group.afternoon',     fallback: 'Afternoon · 13:00–18:00', test: h => h < 18 },
  { key: 'group.evening',       fallback: 'Evening · after 18:00',   test: () => true  },
]

const groupedPlans = computed(() => {
  const result = []
  let lastKey = null
  for (const p of plans.plans) {
    const hour = parseInt(p.time.split(':')[0])
    const g = GROUPS.find(g => g.test(hour))
    if (g.key !== lastKey) {
      result.push({ label: t(g.key, g.fallback), items: [] })
      lastKey = g.key
    }
    result[result.length - 1].items.push(p)
  }
  return result
})

const habitPlans = computed(() => plans.plans.filter(p => p.type === 'habit'))

// ── toggle / delete ───────────────────────────────────────────────────────────

function onRowClick(p) {
  checks.toggle(p.id, todayKey())
}

// ── add form ──────────────────────────────────────────────────────────────────

const formOpen  = ref(false)
const newName   = ref('')
const newType   = ref('habit')
const newTime   = ref('')
const nameInput = ref(null)

function openForm() {
  formOpen.value = true
  nextTick(() => nameInput.value?.focus())
}

function cancelForm() {
  formOpen.value = false
  newName.value  = ''
  newTime.value  = ''
}

async function submitPlan() {
  const name = newName.value.trim()
  const time = newTime.value.trim() || '09:00'
  if (!name) { nameInput.value?.focus(); return }
  if (!/^\d{2}:\d{2}$/.test(time)) return
  await plans.add(name, newType.value, time)
  cancelForm()
}

// ── month strip ───────────────────────────────────────────────────────────────

const today = new Date()
const stripYear  = ref(today.getFullYear())
const stripMonth = ref(today.getMonth())

const monthLabel = computed(() => `${MONTH_NAMES[stripMonth.value]} ${stripYear.value}`)

function prevMonth() {
  if (stripMonth.value === 0) { stripMonth.value = 11; stripYear.value-- }
  else stripMonth.value--
  checks.fetchMonth(stripYear.value, stripMonth.value + 1)
}

function nextMonth() {
  if (stripMonth.value === 11) { stripMonth.value = 0; stripYear.value++ }
  else stripMonth.value++
  checks.fetchMonth(stripYear.value, stripMonth.value + 1)
}

const daysInStrip = computed(() => {
  const tNow   = new Date()
  const tY     = tNow.getFullYear()
  const tM     = tNow.getMonth()
  const tD     = tNow.getDate()
  const y      = stripYear.value
  const m      = stripMonth.value
  const count  = new Date(y, m + 1, 0).getDate()
  const result = []
  for (let d = 1; d <= count; d++) {
    const isToday  = y === tY && m === tM && d === tD
    const isFuture = new Date(y, m, d) > tNow
    const k        = dateKey(y, m, d)
    const doneN    = plans.plans.filter(p => checks.isChecked(p.id, k)).length
    const pct      = plans.plans.length ? Math.round(doneN / plans.plans.length * 100) : 0
    result.push({ day: d, isToday, isFuture, key: k, pct })
  }
  return result
})

// ── stats ─────────────────────────────────────────────────────────────────────

const doneCount   = computed(() => plans.plans.filter(p => checks.isChecked(p.id, todayKey())).length)
const remainCount = computed(() => plans.plans.length - doneCount.value)
const pct         = computed(() => plans.plans.length ? Math.round(doneCount.value / plans.plans.length * 100) : 0)

// ── echarts bar ───────────────────────────────────────────────────────────────

const chartEl = ref(null)
let chartInst = null

function renderChart() {
  if (!chartEl.value) return
  if (!chartInst) chartInst = echarts.init(chartEl.value, null, { renderer: 'svg' })
  const styles = getComputedStyle(document.documentElement)
  const dark = styles.getPropertyValue('--dark').trim() || '#111111'
  const faint = styles.getPropertyValue('--faint').trim() || '#E4E4E4'
  const done   = doneCount.value
  const remain = remainCount.value
  const total  = done + remain || 1
  chartInst.setOption({
    backgroundColor: 'transparent',
    grid: { top: 4, bottom: 4, left: 8, right: 8 },
    xAxis: { type: 'value', max: total, show: false },
    yAxis: { type: 'category', show: false, data: [''] },
    series: [
      { name: 'Done',   type: 'bar', stack: 't', data: [done],   itemStyle: { color: dark, borderRadius: [4,0,0,4] }, barMaxWidth: 12 },
      { name: 'Remain', type: 'bar', stack: 't', data: [remain], itemStyle: { color: faint, borderRadius: [0,4,4,0] } }
    ]
  })
}

watch([doneCount, remainCount], () => renderChart())

onMounted(() => {
  checks.fetchMonth(stripYear.value, stripMonth.value + 1)
  nextTick(renderChart)
})

onUnmounted(() => {
  chartInst?.dispose()
  chartInst = null
})
</script>
