<template>
  <section class="plans-section">
    <div class="day-primary">
      <div class="day-primary-head">
        <div class="day-primary-copy">
          <div class="day-primary-kicker">{{ t('section.day', 'Day') }}</div>
          <div class="day-primary-title">{{ t('plan.day.title', 'Today’s workspace') }}</div>
          <div class="day-primary-subtitle">{{ dayPrimarySubtitle }}</div>
        </div>
        <div class="day-primary-pulse">
          <div class="day-primary-pct">{{ pct }}%</div>
          <div class="day-primary-pulse-label">{{ t('plan.day.pulse', 'today complete') }}</div>
        </div>
      </div>

      <div class="day-primary-status">
        <span class="day-primary-status-chip strong">{{ t('stat.done', 'done') }} {{ doneCount }}</span>
        <span class="day-primary-status-chip">{{ t('stat.remaining', 'remaining') }} {{ remainCount }}</span>
        <span class="day-primary-status-copy">{{ dayStatusCopy }}</span>
      </div>

      <div class="plan-list">
        <div v-if="!plans.plans.length" class="empty-state">
          <div class="empty-state-icon">○</div>
          <div class="empty-state-text">{{ t('plan.empty', 'No plans yet - add your first habit or task below') }}</div>
        </div>
        <template v-else>
          <template v-for="(group, index) in groupedPlans" :key="index">
            <div class="plan-group-label">{{ group.label }}</div>
            <div
              v-for="plan in group.items"
              :key="plan.id"
              class="plan-item"
              :class="{ 'done-item': checks.isChecked(plan.id, todayKey()) }"
              @click="onRowClick(plan)"
            >
              <div class="plan-check" :class="{ done: checks.isChecked(plan.id, todayKey()) }"></div>
              <div class="plan-text">
                <div class="plan-name">{{ plan.name }}</div>
                <div class="plan-meta">
                  {{ plan.type === 'habit' ? t('plan.type.habit', 'daily habit') : t('plan.type.todo', 'task') }}
                </div>
              </div>
              <span class="plan-tag" :class="plan.type">{{ planTypeTag(plan.type) }}</span>
              <span class="plan-time">{{ plan.time }}</span>
              <button
                v-if="!auth.isAdmin"
                class="plan-del"
                :title="t('plan.remove', 'remove')"
                @click.stop="plans.remove(plan.id)"
              >×</button>
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
    </div>

    <aside class="day-secondary">
      <div class="day-secondary-head">
        <div class="day-secondary-copy">
          <div class="day-secondary-kicker">{{ t('plan.insights.kicker', 'Insights') }}</div>
          <div class="day-secondary-title">{{ t('plan.insights.title', 'Review without losing focus') }}</div>
          <div class="day-secondary-subtitle">{{ t('plan.insights.subtitle', 'Keep analytics close, but secondary to execution.') }}</div>
        </div>
        <div class="day-secondary-tabs">
          <button
            class="day-secondary-tab"
            :class="{ active: secondaryView === 'overview' }"
            @click="secondaryView = 'overview'"
          >
            {{ t('plan.insights.overview', 'Overview') }}
          </button>
          <button
            class="day-secondary-tab"
            :class="{ active: secondaryView === 'review' }"
            @click="secondaryView = 'review'"
          >
            {{ t('plan.insights.review', 'AI Review') }}
          </button>
        </div>
      </div>

      <div v-if="secondaryView === 'overview'" class="day-secondary-pane day-secondary-pane-overview">
        <template v-if="plans.plans.length">
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

          <div class="month-strip">
            <div class="strip-header">
              <button class="strip-nav" @click="prevMonth">&#8249;</button>
              <span class="strip-month-label">{{ monthLabel }}</span>
              <button class="strip-nav" @click="nextMonth">&#8250;</button>
            </div>
            <div class="month-strip-rows">
              <div v-for="day in daysInStrip" :key="day.day" class="day-row">
                <div class="day-num" :class="{ today: day.isToday }">{{ day.day }}</div>
                <div class="day-dots">
                  <div
                    v-for="habit in habitPlans"
                    :key="habit.id"
                    class="day-cell"
                    :class="{
                      done: !day.isFuture && checks.isChecked(habit.id, day.key),
                      future: day.isFuture,
                    }"
                  ></div>
                </div>
                <div class="day-pct" :class="{ full: day.pct === 100, future: day.isFuture }">
                  {{ day.isFuture || !plans.plans.length ? '—' : `${day.pct}%` }}
                </div>
              </div>
            </div>
          </div>
        </template>
        <div v-else class="day-secondary-empty">
          {{ t('plan.insights.empty', 'Create your first plan to unlock trend and review panels.') }}
        </div>
      </div>

      <div v-else class="day-secondary-pane">
        <div class="ai-review-panel">
          <div class="ai-review-head">
            <div class="ai-review-heading">
              <div class="ai-review-kicker">{{ t('plan.ai.title', 'AI Review') }}</div>
              <div class="ai-review-subtitle">{{ t('plan.ai.subtitle', 'Review your plan execution by day / week / month / year') }}</div>
            </div>
            <button
              class="ai-review-refresh"
              :disabled="aiReview.loading || !plans.plans.length"
              @click="generateReview(aiReview.activePeriod)"
            >
              {{ aiReview.current ? t('plan.ai.refresh', 'Refresh') : t('plan.ai.generate', 'Generate') }}
            </button>
          </div>

          <div class="ai-review-periods">
            <button
              v-for="period in REVIEW_PERIODS"
              :key="period"
              class="ai-review-period-btn"
              :class="{ active: aiReview.activePeriod === period }"
              :disabled="aiReview.loading || !plans.plans.length"
              @click="generateReview(period)"
            >
              {{ periodLabel(period) }}
            </button>
          </div>

          <div v-if="!plans.plans.length" class="ai-review-empty">
            {{ t('plan.ai.empty', 'Add some plans first, then let AI judge your execution.') }}
          </div>
          <div v-else-if="aiReview.loading" class="ai-review-loading">
            {{ t('plan.ai.loading', 'AI is generating a critique based on your completion data...') }}
          </div>
          <template v-else-if="aiReview.current">
            <div class="ai-review-meta">
              <span class="ai-review-chip">{{ periodLabel(aiReview.current.period, true) }}</span>
              <span class="ai-review-chip">{{ aiReview.current.summary.from }} ~ {{ aiReview.current.summary.to }}</span>
              <span class="ai-review-chip">{{ aiReview.current.summary.completionRate }}% {{ t('plan.ai.complete', 'completion') }}</span>
              <span v-if="aiReview.current.source === 'fallback'" class="ai-review-chip fallback">
                {{ t('plan.ai.fallback', 'fallback') }}
              </span>
            </div>

            <div class="ai-review-hero">
              <div class="ai-review-story">
                <div class="ai-review-story-kicker">{{ reviewToneLabel }}</div>
                <div class="ai-review-copy">{{ aiReview.current.review }}</div>
              </div>
              <div class="ai-review-action">
                <div class="ai-review-action-label">{{ t('plan.ai.next_step', 'Next move') }}</div>
                <div class="ai-review-action-copy">{{ reviewNextMove }}</div>
              </div>
            </div>

            <div class="ai-review-stats">
              <div class="ai-review-stat">
                <span class="ai-review-stat-label">{{ t('plan.ai.stats.checks', 'Checks done') }}</span>
                <strong class="ai-review-stat-value">
                  {{ aiReview.current.summary.completedChecks }}/{{ aiReview.current.summary.expectedChecks }}
                </strong>
              </div>
              <div class="ai-review-stat">
                <span class="ai-review-stat-label">{{ t('plan.ai.stats.perfect', 'Perfect days') }}</span>
                <strong class="ai-review-stat-value">
                  {{ aiReview.current.summary.perfectDays }}/{{ aiReview.current.summary.activeDays }}
                </strong>
              </div>
              <div class="ai-review-stat">
                <span class="ai-review-stat-label">{{ t('plan.ai.stats.streak', 'Current streak') }}</span>
                <strong class="ai-review-stat-value">{{ aiReview.current.summary.currentPerfectStreak }}</strong>
              </div>
              <div class="ai-review-stat">
                <span class="ai-review-stat-label">{{ t('plan.ai.stats.longest', 'Longest streak') }}</span>
                <strong class="ai-review-stat-value">{{ aiReview.current.summary.longestPerfectStreak }}</strong>
              </div>
            </div>

            <div class="ai-review-plan-groups">
              <div class="ai-review-plan-group">
                <div class="ai-review-group-title">{{ t('plan.ai.best', 'Best plans') }}</div>
                <div v-if="aiReview.current.summary.bestPlans.length" class="ai-review-plan-list">
                  <span
                    v-for="plan in aiReview.current.summary.bestPlans"
                    :key="`best-${plan.id}`"
                    class="ai-review-plan-pill good"
                  >
                    {{ plan.name }} · {{ plan.completedDays }}/{{ plan.expectedDays }} · {{ plan.completionRate }}%
                  </span>
                </div>
                <div v-else class="ai-review-plan-empty">
                  {{ t('plan.ai.empty_best', 'No standout plan yet') }}
                </div>
              </div>
              <div class="ai-review-plan-group">
                <div class="ai-review-group-title">{{ t('plan.ai.weakest', 'Needs work') }}</div>
                <div v-if="aiReview.current.summary.weakestPlans.length" class="ai-review-plan-list">
                  <span
                    v-for="plan in aiReview.current.summary.weakestPlans"
                    :key="`weak-${plan.id}`"
                    class="ai-review-plan-pill weak"
                  >
                    {{ plan.name }} · {{ plan.completedDays }}/{{ plan.expectedDays }} · {{ plan.completionRate }}%
                  </span>
                </div>
                <div v-else class="ai-review-plan-empty">
                  {{ t('plan.ai.empty_weakest', 'No obvious weak spot yet') }}
                </div>
              </div>
            </div>

            <div v-if="aiReview.current.summary.mostMissedDays.length" class="ai-review-missed">
              <span class="ai-review-missed-label">{{ t('plan.ai.missed', 'Worst days') }}</span>
              <span
                v-for="day in aiReview.current.summary.mostMissedDays"
                :key="day.date"
                class="ai-review-plan-pill neutral"
              >
                {{ day.date }} · {{ day.completedChecks }}/{{ day.expectedChecks }} · {{ day.completionRate }}%
              </span>
            </div>

            <div class="ai-review-foot">
              {{ t('plan.ai.model', 'Model') }} {{ aiReview.current.model }} · {{ formatGeneratedAt(aiReview.current.generatedAt) }}
            </div>
          </template>
          <div v-else-if="aiReview.error" class="ai-review-error">{{ aiReview.error }}</div>
          <div v-else class="ai-review-placeholder">
            {{ t('plan.ai.placeholder', 'Pick a period and let AI summarize how well you actually executed.') }}
          </div>
        </div>
      </div>
    </aside>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import { useAiReviewStore } from '@/features/ai-review/model/useAiReviewStore'
import { usePlansStore } from '@/features/plans/model/usePlansStore'
import { useChecksStore } from '@/features/checks/model/useChecksStore'
import { useAuthStore } from '@/features/auth/model/useAuthStore'
import { useI18nStore } from '@/shared/i18n/useI18nStore'

const aiReview = useAiReviewStore()
const plans = usePlansStore()
const checks = useChecksStore()
const auth = useAuthStore()
const i18n = useI18nStore()
function t(key, fallback, params) { return i18n.t(key, fallback, params) }

const REVIEW_PERIODS = ['day', 'week', 'month', 'year']
const MONTHS_DEFAULT = ['January','February','March','April','May','June','July','August','September','October','November','December']
const secondaryView = ref('overview')

function todayKey() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function dateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const monthNames = computed(() => i18n.L('MONTHS', MONTHS_DEFAULT))

const GROUPS = [
  { key: 'group.morning_early', fallback: 'Morning · before 9:00', test: (hour) => hour < 9 },
  { key: 'group.morning', fallback: 'Morning · 9:00-13:00', test: (hour) => hour < 13 },
  { key: 'group.afternoon', fallback: 'Afternoon · 13:00-18:00', test: (hour) => hour < 18 },
  { key: 'group.evening', fallback: 'Evening · after 18:00', test: () => true },
]

const groupedPlans = computed(() => {
  const result = []
  let lastKey = null

  for (const plan of plans.plans) {
    const hour = Number.parseInt(plan.time.split(':')[0], 10)
    const group = GROUPS.find((item) => item.test(hour))
    if (!group) continue
    if (group.key !== lastKey) {
      result.push({ label: t(group.key, group.fallback), items: [] })
      lastKey = group.key
    }
    result[result.length - 1].items.push(plan)
  }

  return result
})

const habitPlans = computed(() => plans.plans.filter((plan) => plan.type === 'habit'))

function onRowClick(plan) {
  checks.toggle(plan.id, todayKey())
}

function planTypeTag(type) {
  return type === 'habit'
    ? t('plan.type_tag.habit', 'habit')
    : t('plan.type_tag.todo', 'task')
}

function periodLabel(period, full = false) {
  const short = {
    day: t('plan.ai.period.day', 'Day'),
    week: t('plan.ai.period.week', 'Week'),
    month: t('plan.ai.period.month', 'Month'),
    year: t('plan.ai.period.year', 'Year'),
  }
  const long = {
    day: t('plan.ai.period.day_full', 'Daily'),
    week: t('plan.ai.period.week_full', 'Weekly'),
    month: t('plan.ai.period.month_full', 'Monthly'),
    year: t('plan.ai.period.year_full', 'Yearly'),
  }

  return full ? long[period] : short[period]
}

async function generateReview(period) {
  secondaryView.value = 'review'
  try {
    await aiReview.generate(period, todayKey())
  } catch {}
}

function formatGeneratedAt(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(i18n.locale === 'zh-CN' ? 'zh-CN' : 'en-US')
}

const formOpen = ref(false)
const newName = ref('')
const newType = ref('habit')
const newTime = ref('')
const nameInput = ref(null)

function openForm() {
  formOpen.value = true
  nextTick(() => nameInput.value?.focus())
}

function cancelForm() {
  formOpen.value = false
  newName.value = ''
  newTime.value = ''
}

async function submitPlan() {
  const name = newName.value.trim()
  const time = newTime.value.trim() || '09:00'
  if (!name) {
    nameInput.value?.focus()
    return
  }
  if (!/^\d{2}:\d{2}$/.test(time)) return
  await plans.add(name, newType.value, time)
  cancelForm()
}

const today = new Date()
const stripYear = ref(today.getFullYear())
const stripMonth = ref(today.getMonth())

const monthLabel = computed(() => (
  i18n.locale === 'zh-CN'
    ? `${stripYear.value}年${stripMonth.value + 1}月`
    : `${monthNames.value[stripMonth.value]} ${stripYear.value}`
))

function prevMonth() {
  if (stripMonth.value === 0) {
    stripMonth.value = 11
    stripYear.value -= 1
  } else {
    stripMonth.value -= 1
  }
  checks.fetchMonth(stripYear.value, stripMonth.value + 1)
}

function nextMonth() {
  if (stripMonth.value === 11) {
    stripMonth.value = 0
    stripYear.value += 1
  } else {
    stripMonth.value += 1
  }
  checks.fetchMonth(stripYear.value, stripMonth.value + 1)
}

const daysInStrip = computed(() => {
  const nowDate = new Date()
  const currentYear = nowDate.getFullYear()
  const currentMonth = nowDate.getMonth()
  const currentDay = nowDate.getDate()
  const year = stripYear.value
  const month = stripMonth.value
  const count = new Date(year, month + 1, 0).getDate()
  const result = []

  for (let day = 1; day <= count; day += 1) {
    const isToday = year === currentYear && month === currentMonth && day === currentDay
    const isFuture = new Date(year, month, day) > nowDate
    const key = dateKey(year, month, day)
    const doneCountForDay = plans.plans.filter((plan) => checks.isChecked(plan.id, key)).length
    const completionPct = plans.plans.length ? Math.round(doneCountForDay / plans.plans.length * 100) : 0
    result.push({ day, isToday, isFuture, key, pct: completionPct })
  }

  return result
})

const doneCount = computed(() => plans.plans.filter((plan) => checks.isChecked(plan.id, todayKey())).length)
const remainCount = computed(() => plans.plans.length - doneCount.value)
const pct = computed(() => plans.plans.length ? Math.round(doneCount.value / plans.plans.length * 100) : 0)
const dayPrimarySubtitle = computed(() => {
  if (!plans.plans.length) {
    return t('plan.day.subtitle.empty', 'Start with one habit or task, then let deeper review grow around real execution.')
  }

  if (remainCount.value <= 0) {
    return t('plan.day.subtitle.complete', 'Today is cleared. Use the side panel to review what made the streak hold.')
  }

  return t('plan.day.subtitle.active', '{done} done · {remaining} left. Finish the list first, then open the review lane.', {
    done: doneCount.value,
    remaining: remainCount.value,
  })
})
const dayStatusCopy = computed(() => {
  if (!plans.plans.length) {
    return t('plan.day.status.empty', 'Add the first plan to unlock tracking, review, and trend panels.')
  }

  if (pct.value === 100) {
    return t('plan.day.status.complete', 'Everything on today’s list is closed out.')
  }

  if (pct.value >= 60) {
    return t('plan.day.status.steady', 'Momentum is decent. Keep the next unchecked item in the same time slot.')
  }

  return t('plan.day.status.recover', 'Execution is still lagging. Clear the weakest item before opening longer-horizon review.')
})
const reviewToneLabel = computed(() => {
  const summary = aiReview.current?.summary
  if (!summary) {
    return t('plan.ai.summary_label', 'Execution snapshot')
  }

  if (summary.completionRate >= 85) {
    return t('plan.ai.summary_label_strong', 'Locked-in cycle')
  }

  if (summary.completionRate >= 65) {
    return t('plan.ai.summary_label_mid', 'Mixed but recoverable')
  }

  return t('plan.ai.summary_label_low', 'Needs a reset')
})
const reviewNextMove = computed(() => {
  const summary = aiReview.current?.summary
  if (!summary) {
    return t('plan.ai.next_step_empty', 'Generate a review to surface the next adjustment worth making.')
  }

  const weakest = summary.weakestPlans[0]
  if (weakest) {
    return t('plan.ai.next_step_weakest', 'Stabilize "{name}" first. It only reached {rate}%, so fixing its time slot should create the clearest gain.', {
      name: weakest.name,
      rate: weakest.completionRate,
    })
  }

  const worstDay = summary.mostMissedDays[0]
  if (worstDay) {
    return t('plan.ai.next_step_day', 'Watch {day}. It fell to {rate}%, which makes it the best pattern-break point for the next cycle.', {
      day: worstDay.date,
      rate: worstDay.completionRate,
    })
  }

  return t('plan.ai.next_step_stable', 'The baseline is steady. Protect the routines that already work before adding anything new.')
})

const chartEl = ref(null)
let chartInst = null

function resizeChart() {
  chartInst?.resize()
}

function renderChart() {
  if (!chartEl.value) return
  if (!chartInst) chartInst = echarts.init(chartEl.value, null, { renderer: 'svg' })
  const styles = getComputedStyle(document.documentElement)
  const dark = styles.getPropertyValue('--dark').trim() || '#111111'
  const faint = styles.getPropertyValue('--faint').trim() || '#E4E4E4'
  const done = doneCount.value
  const remain = remainCount.value
  const total = done + remain || 1
  chartInst.setOption({
    backgroundColor: 'transparent',
    animation: false,
    grid: { top: 10, bottom: 10, left: 10, right: 10 },
    xAxis: { type: 'value', max: total, show: false },
    yAxis: { type: 'category', show: false, data: [''] },
    series: [
      {
        name: 'Done',
        type: 'bar',
        stack: 't',
        data: [done],
        itemStyle: { color: dark, borderRadius: remain === 0 ? [8, 8, 8, 8] : [8, 0, 0, 8] },
        barWidth: 16,
      },
      {
        name: 'Remain',
        type: 'bar',
        stack: 't',
        data: [remain],
        itemStyle: { color: faint, borderRadius: [0, 8, 8, 0] },
        barWidth: 16,
      },
    ],
  })
}

watch([doneCount, remainCount], () => renderChart())
watch(secondaryView, (view) => {
  if (view === 'overview') {
    nextTick(() => {
      renderChart()
      resizeChart()
    })
  }
})

onMounted(() => {
  checks.fetchMonth(stripYear.value, stripMonth.value + 1)
  nextTick(() => {
    renderChart()
    resizeChart()
  })
  window.addEventListener('resize', resizeChart)
})

onUnmounted(() => {
  window.removeEventListener('resize', resizeChart)
  chartInst?.dispose()
  chartInst = null
})
</script>
