<template>
  <section class="plans-section">
    <div class="day-primary">
      <div class="day-primary-head">
        <div class="day-primary-copy">
          <div class="day-primary-kicker">{{ t('section.day', 'Day') }}</div>
          <div class="day-primary-title">{{ t('plan.day.title', "Today\u2019s workspace") }}</div>
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
        <div v-if="!todayPlans.length" class="empty-state">
          <div class="empty-state-icon">○</div>
          <div class="empty-state-text">{{ t('plan.empty', 'No plans yet - add your first habit or task below') }}</div>
        </div>
        <template v-else>
          <template v-for="(group, index) in groupedPlans" :key="index">
            <div class="plan-group-label">{{ group.label }}</div>
            <template v-for="plan in group.items" :key="plan.id">
              <!-- Edit form for this plan -->
              <div v-if="editingId === plan.id" class="plan-edit-form">
                <div class="pef-row">
                  <input
                    class="apf-input pef-name"
                    v-model="editName"
                    :placeholder="t('plan.add_name_ph', 'Name')"
                    @keydown.enter="saveEdit"
                    @keydown.escape="cancelEdit"
                  />
                  <div class="apf-type">
                    <button class="apf-type-btn" :class="{ active: editType === 'habit' }" @click="editType = 'habit'">{{ t('plan.add_habit', 'Habit') }}</button>
                    <button class="apf-type-btn" :class="{ active: editType === 'todo' }" @click="editType = 'todo'">{{ t('plan.add_task', 'Task') }}</button>
                  </div>
                  <input class="apf-input apf-time" v-model="editTime" placeholder="09:00" maxlength="5" />
                </div>
                <textarea
                  class="apf-desc"
                  v-model="editDesc"
                  :placeholder="t('plan.add_desc_ph', 'Description (optional)')"
                  rows="2"
                ></textarea>
                <div class="apf-actions">
                  <button class="apf-cancel" @click="cancelEdit">{{ t('plan.add_cancel', 'Cancel') }}</button>
                  <button class="apf-save" @click="saveEdit">{{ t('plan.edit_save', 'Save') }}</button>
                </div>
              </div>
              <!-- Normal plan row -->
              <div
                v-else
                class="plan-item"
                :class="{ 'done-item': checks.isChecked(plan.id, todayKey()) }"
                @click="onRowClick(plan)"
              >
                <div class="plan-check" :class="{ done: checks.isChecked(plan.id, todayKey()) }"></div>
                <div class="plan-text">
                  <div class="plan-name">{{ plan.name }}</div>
                  <div v-if="plan.description" class="plan-desc">{{ plan.description }}</div>
                  <div class="plan-meta">
                    {{ plan.type === 'habit' ? t('plan.type.habit', 'daily habit') : t('plan.type.todo', 'task') }}
                  </div>
                </div>
                <span class="plan-tag" :class="plan.type">{{ planTypeTag(plan.type) }}</span>
                <span class="plan-time">{{ plan.time }}</span>
                <button
                  v-if="!auth.isAdmin"
                  class="plan-edit-btn"
                  :title="t('plan.edit', 'edit')"
                  @click.stop="startEdit(plan)"
                >✎</button>
                <button
                  v-if="!auth.isAdmin"
                  class="plan-del"
                  :title="t('plan.remove', 'remove')"
                  @click.stop="plans.remove(plan.id)"
                >×</button>
              </div>
            </template>
          </template>
        </template>
      </div>

      <div v-if="!auth.isAdmin" class="plan-controls">
        <div class="add-plan-bar">
          <button class="add-plan-btn" @click="openForm">
            <span class="apb-icon">+</span> {{ t('plan.add_btn', 'Add habit or task') }}
          </button>
          <AiIntakeDock class="add-plan-intake" />
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
          <textarea
            class="apf-desc"
            v-model="newDesc"
            :placeholder="t('plan.add_desc_ph', 'Description (optional)')"
            rows="2"
          ></textarea>
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
          <div class="day-secondary-kicker">{{ t('plan.insights.kicker', 'Overview & Review') }}</div>
          <div class="day-secondary-title">{{ t('plan.insights.title', 'Today') }}</div>
        </div>
        <div class="day-secondary-tabs">
          <button
            class="day-secondary-tab"
            :class="{ active: secondaryView === 'overview' }"
            @click="secondaryView = 'overview'"
          >
            {{ t('plan.insights.overview', '概览') }}
          </button>
          <button
            class="day-secondary-tab"
            :class="{ active: secondaryView === 'review' }"
            @click="secondaryView = 'review'"
          >
            {{ t('plan.insights.review', '复盘') }}
          </button>
        </div>
      </div>

      <!-- Overview tab: stats + chart -->
      <div v-if="secondaryView === 'overview'" class="day-secondary-pane day-secondary-pane-overview">
        <template v-if="todayPlans.length">
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
        </template>
        <div v-else class="day-secondary-empty">
          {{ t('plan.insights.empty', 'Create your first plan to unlock trend and review panels.') }}
        </div>
      </div>

      <!-- Review tab: manual diary -->
      <div v-if="secondaryView === 'review'" class="day-secondary-pane day-secondary-pane-review">
        <div class="review-date-label">{{ reviewDateLabel }}</div>
        <textarea
          class="review-textarea"
          v-model="reviewText"
          :placeholder="t('review.placeholder', '记录今日复盘、思考或感想...')"
          @input="onReviewInput"
        ></textarea>
        <div class="review-save-row">
          <span class="review-manual-hint">{{ t('review.hint', '手写记录，自动保存') }}</span>
          <span class="review-save-hint" :class="{ saved: reviewSaved }">
            {{ reviewSaved ? t('review.saved', '已保存') : '' }}
          </span>
        </div>
      </div>
    </aside>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import { isPlanVisibleOnDate, sortPlansByTime, dedupeHabitPlans } from '@plainlist/shared'
import { usePlansStore } from '@/features/plans/model/usePlansStore'
import { useChecksStore } from '@/features/checks/model/useChecksStore'
import { useAuthStore } from '@/features/auth/model/useAuthStore'
import { useReviewsStore } from '@/features/reviews/model/useReviewsStore'
import { useI18nStore } from '@/shared/i18n/useI18nStore'
import AiIntakeDock from '@/widgets/sections/AiIntakeDock.vue'

const plans = usePlansStore()
const checks = useChecksStore()
const auth = useAuthStore()
const reviews = useReviewsStore()
const i18n = useI18nStore()
function t(key, fallback, params) { return i18n.t(key, fallback, params) }

const MONTHS_DEFAULT = ['January','February','March','April','May','June','July','August','September','October','November','December']
const secondaryView = ref('overview')

function todayKey() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const todayPlans = computed(() =>
  dedupeHabitPlans(
    sortPlansByTime(plans.plans.filter((plan) => isPlanVisibleOnDate(plan, todayKey()))),
  ),
)

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

  for (const plan of todayPlans.value) {
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

function onRowClick(plan) {
  checks.toggle(plan.id, todayKey())
}

function planTypeTag(type) {
  return type === 'habit'
    ? t('plan.type_tag.habit', 'habit')
    : t('plan.type_tag.todo', 'task')
}

// ─── Add form ────────────────────────────────────────────────────────────────
const formOpen = ref(false)
const newName = ref('')
const newType = ref('habit')
const newTime = ref('')
const newDesc = ref('')
const nameInput = ref(null)

function openForm() {
  formOpen.value = true
  nextTick(() => nameInput.value?.focus())
}

function cancelForm() {
  formOpen.value = false
  newName.value = ''
  newTime.value = ''
  newDesc.value = ''
}

async function submitPlan() {
  const name = newName.value.trim()
  const time = newTime.value.trim() || '09:00'
  if (!name) {
    nameInput.value?.focus()
    return
  }
  if (!/^\d{2}:\d{2}$/.test(time)) return
  await plans.add(name, newType.value, time, undefined, newDesc.value.trim() || undefined)
  cancelForm()
}

// ─── Edit form ───────────────────────────────────────────────────────────────
const editingId = ref(null)
const editName = ref('')
const editType = ref('habit')
const editTime = ref('')
const editDesc = ref('')

function startEdit(plan) {
  editingId.value = plan.id
  editName.value = plan.name
  editType.value = plan.type
  editTime.value = plan.time
  editDesc.value = plan.description ?? ''
}

function cancelEdit() {
  editingId.value = null
}

async function saveEdit() {
  const name = editName.value.trim()
  const time = editTime.value.trim()
  if (!name || !/^\d{2}:\d{2}$/.test(time)) return
  await plans.update(editingId.value, {
    name,
    description: editDesc.value.trim() || null,
    type: editType.value,
    time,
  })
  editingId.value = null
}

// ─── Stats ───────────────────────────────────────────────────────────────────
const doneCount = computed(() => todayPlans.value.filter((plan) => checks.isChecked(plan.id, todayKey())).length)
const remainCount = computed(() => todayPlans.value.length - doneCount.value)
const pct = computed(() => todayPlans.value.length ? Math.round(doneCount.value / todayPlans.value.length * 100) : 0)
const dayPrimarySubtitle = computed(() => {
  if (!todayPlans.value.length) {
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
  if (!todayPlans.value.length) {
    return t('plan.day.status.empty', 'Add the first plan to unlock tracking, review, and trend panels.')
  }

  if (pct.value === 100) {
    return t('plan.day.status.complete', 'Everything on today\'s list is closed out.')
  }

  if (pct.value >= 60) {
    return t('plan.day.status.steady', 'Momentum is decent. Keep the next unchecked item in the same time slot.')
  }

  return t('plan.day.status.recover', 'Execution is still lagging. Clear the weakest item before opening longer-horizon review.')
})

// ─── Chart ───────────────────────────────────────────────────────────────────
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
  if (view === 'review') {
    loadReview()
  }
})

// ─── Daily review ─────────────────────────────────────────────────────────────
const reviewText = ref('')
const reviewSaved = ref(false)
let reviewDebounce = null
let reviewSavedTimer = null

const reviewDateLabel = computed(() => {
  const d = new Date()
  return i18n.locale === 'zh-CN'
    ? `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
    : `${monthNames.value[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
})

function loadReview() {
  reviewText.value = reviews.getReview(todayKey())
}

function onReviewInput() {
  reviewSaved.value = false
  clearTimeout(reviewDebounce)
  reviewDebounce = setTimeout(async () => {
    await reviews.upsert(todayKey(), reviewText.value)
    reviewSaved.value = true
    clearTimeout(reviewSavedTimer)
    reviewSavedTimer = setTimeout(() => { reviewSaved.value = false }, 2000)
  }, 800)
}

onMounted(() => {
  reviews.fetchRange(todayKey(), todayKey())
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
  clearTimeout(reviewDebounce)
  clearTimeout(reviewSavedTimer)
})
</script>
