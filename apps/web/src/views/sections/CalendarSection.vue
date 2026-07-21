<template>
  <section class="section">
    <div class="section-header">
      <h2 class="section-title">{{ year }}</h2>
      <div class="year-nav">
        <button class="nav-btn" @click="year--">&#8592;</button>
        <button class="nav-btn" @click="year++">&#8594;</button>
      </div>
    </div>

    <div class="cal-grid">
      <div v-for="monthIndex in 12" :key="monthIndex" class="cal-month">
        <div class="cal-month-name">{{ MONTHS_S[monthIndex - 1] }}</div>
        <div class="cal-weekdays">
          <div v-for="weekday in WDAYS_S" :key="weekday" class="cal-wd">{{ weekday }}</div>
        </div>
        <div class="cal-days-grid">
          <div
            v-for="emptyDay in firstDay(monthIndex - 1)"
            :key="`empty-${monthIndex}-${emptyDay}`"
            class="cal-day empty"
          />
          <button
            v-for="day in daysInMonth(monthIndex - 1)"
            :key="day"
            class="cal-day clickable"
            :class="dayClass(monthIndex - 1, day)"
            :title="dayTitle(monthIndex - 1, day)"
            type="button"
            @click="openDayPopover(monthIndex - 1, day, $event)"
          />
        </div>
      </div>
    </div>

    <div class="heatmap-section">
      <div v-for="habit in habits" :key="habit.id" class="heatmap-row">
        <div class="heatmap-row-label">
          {{ habit.name.length > 14 ? `${habit.name.slice(0, 13)}…` : habit.name }}
        </div>
        <div class="heatmap-cells">
          <div
            v-for="week in 52"
            :key="week"
            class="hm-cell"
            :class="heatmapLevel(habit.id, week - 1)"
          />
        </div>
      </div>
    </div>

    <div class="year-journal-section">
      <div class="year-journal-head">
        <div class="year-journal-copy">
          <div class="year-journal-kicker">{{ t('year.journal.kicker', '年度回顾') }}</div>
          <div class="year-journal-title">{{ t('year.journal.title', '日记与总结') }}</div>
        </div>
      </div>

      <div class="year-journal-toolbar">
        <input
          v-model="journalQuery"
          class="year-journal-search"
          type="search"
          :placeholder="t('year.journal.search_ph', '搜索日记内容...')"
        />
        <div class="year-journal-filters">
          <button
            v-for="option in journalQuarterOptions"
            :key="option.value"
            class="year-journal-filter-btn"
            :class="{ active: journalQuarter === option.value }"
            type="button"
            @click="journalQuarter = option.value"
          >
            {{ option.label }}
          </button>
          <select v-model="journalMonth" class="year-journal-month-select">
            <option value="all">{{ t('year.journal.month_all', '全部月份') }}</option>
            <option v-for="monthIndex in 12" :key="monthIndex" :value="String(monthIndex)">
              {{ monthLabelFor(monthIndex) }}
            </option>
          </select>
        </div>
      </div>

      <div v-if="filteredJournalEntries.length" class="year-journal-timeline">
        <article
          v-for="entry in filteredJournalEntries"
          :key="entry.dateKey"
          class="year-journal-card"
          :class="{ active: selectedJournalKey === entry.dateKey }"
        >
          <button class="year-journal-card-head" type="button" @click="selectJournalDate(entry.dateKey)">
            <span class="year-journal-card-date">{{ entry.label }}</span>
            <span v-if="selectedJournalKey !== entry.dateKey" class="year-journal-card-preview">{{ entry.preview }}</span>
          </button>
          <div v-if="selectedJournalKey === entry.dateKey" class="year-journal-card-body">
            <div class="year-journal-card-content">{{ entry.content }}</div>
            <div class="review-save-row">
              <span class="review-manual-hint">{{ t('year.journal.readonly_hint', '历史日记不可修改，请前往今日计划编辑') }}</span>
            </div>
          </div>
        </article>
      </div>
      <div v-else class="year-journal-empty">
        {{ journalEmptyMessage }}
      </div>
    </div>

    <Teleport to="body">
      <Transition name="day-popover-fade">
        <div
          v-if="dayPopoverOpen && dayPopover"
          class="day-popover-overlay"
          @click="closeDayPopover"
        >
          <div
            class="day-popover"
            :style="popoverStyle"
            @click.stop
          >
            <div class="day-popover-head">
              <div>
                <div class="day-popover-date">{{ dayPopover.title }}</div>
                <div class="day-popover-meta">
                  {{ dayPopover.completed }} / {{ dayPopover.total }} {{ t('tracker.done_col', 'Done') }}
                </div>
              </div>
              <div class="day-popover-actions">
                <button
                  class="day-popover-expand"
                  type="button"
                  :title="t('calendar.expand_day', 'Expand day review')"
                  @click="openDayReview"
                >
                  ↗
                </button>
                <button class="day-popover-close" type="button" @click="closeDayPopover">x</button>
              </div>
            </div>

            <div v-if="dayPopover.tasks.length" class="day-popover-list">
              <div
                v-for="task in dayPopover.tasks"
                :key="task.id"
                class="day-popover-item"
                :class="{ done: task.done }"
              >
                <span class="day-popover-bullet" :class="task.type"></span>
                <div class="day-popover-copy">
                  <div class="day-popover-name">{{ task.name }}</div>
                  <div class="day-popover-type">
                    {{ task.type === 'habit' ? t('plan.type.habit', 'daily habit') : t('plan.type.todo', 'task') }}
                  </div>
                </div>
                <div class="day-popover-time">{{ task.time }}</div>
              </div>
            </div>
            <div v-else class="day-popover-empty">
              {{ t('calendar.empty_day', 'No completed items for this day') }}
            </div>
            <div v-if="dayPopover.review" class="day-popover-review">
              <div class="day-popover-review-label">{{ t('review.label', '日记') }}</div>
              <div class="day-popover-review-text">{{ dayPopover.review }}</div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
    <DayReviewOverlay
      v-if="dayReviewOpen && dayPopover"
      :review="dayPopover"
      @close="dayReviewOpen = false"
    />
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { isPlanVisibleOnDate } from '@plainlist/shared'
import { usePlansStore } from '@/features/plans/model/usePlansStore'
import { useChecksStore } from '@/features/checks/model/useChecksStore'
import { useReviewsStore } from '@/features/reviews/model/useReviewsStore'
import { useI18nStore } from '@/shared/i18n/useI18nStore'
import DayReviewOverlay from '@/widgets/sections/DayReviewOverlay.vue'

const plansStore = usePlansStore()
const checksStore = useChecksStore()
const reviewsStore = useReviewsStore()
const i18n = useI18nStore()

const year = ref(new Date().getFullYear())
const today = new Date()

const dayPopoverOpen = ref(false)
const dayPopover = ref(null)
const dayReviewOpen = ref(false)
const popoverStyle = ref({})

const selectedJournalKey = ref('')
const journalQuery = ref('')
const journalQuarter = ref('all')
const journalMonth = ref('all')

const MONTHS_S_DEFAULT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTHS_DEFAULT = ['January','February','March','April','May','June','July','August','September','October','November','December']
const WDAYS_S_DEFAULT  = ['Su','Mo','Tu','We','Th','Fr','Sa']

const MONTHS_S = computed(() => i18n.L('MONTHS_S', MONTHS_S_DEFAULT))
const MONTHS = computed(() => i18n.L('MONTHS', MONTHS_DEFAULT))
const WDAYS_S  = computed(() => i18n.L('WDAYS_S', WDAYS_S_DEFAULT))

const habits = computed(() => plansStore.plans.filter(p => p.type === 'habit'))

function t(key, fallback, params) {
  return i18n.t(key, fallback, params)
}

function formatJournalLabel(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number)
  if (i18n.locale === 'zh-CN') {
    return `${y}年${m}月${d}日`
  }
  return `${MONTHS.value[m - 1]} ${d}, ${y}`
}

function journalPreview(content) {
  const trimmed = content.trim()
  if (!trimmed) {
    return t('year.journal.preview_empty', '（空白）')
  }
  const line = trimmed.split('\n').find((item) => item.trim()) ?? trimmed
  return line.length > 48 ? `${line.slice(0, 47)}…` : line
}


const monthNamesShort = computed(() => i18n.L('MONTHS_S', MONTHS_S_DEFAULT))

const journalQuarterOptions = computed(() => [
  { value: 'all', label: t('year.journal.quarter_all', '全年') },
  { value: '1', label: t('year.journal.quarter_1', '1-3月') },
  { value: '2', label: t('year.journal.quarter_2', '4-6月') },
  { value: '3', label: t('year.journal.quarter_3', '7-9月') },
  { value: '4', label: t('year.journal.quarter_4', '10-12月') },
])

function monthLabelFor(monthIndex) {
  if (i18n.locale === 'zh-CN') {
    return `${monthIndex}月`
  }
  return monthNamesShort.value[monthIndex - 1]
}

const yearJournalEntries = computed(() => {
  const prefix = `${year.value}-`
  return Object.entries(reviewsStore.reviews)
    .filter(([key, content]) => key.startsWith(prefix) && content.trim())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, content]) => ({
      dateKey: key,
      label: formatJournalLabel(key),
      preview: journalPreview(content),
      content,
    }))
})

const filteredJournalEntries = computed(() => {
  const query = journalQuery.value.trim().toLowerCase()
  const quarter = journalQuarter.value
  const month = journalMonth.value

  return yearJournalEntries.value.filter((entry) => {
    const [, monthStr] = entry.dateKey.split('-')
    const monthNum = Number.parseInt(monthStr, 10)

    if (quarter !== 'all') {
      const quarterNum = Number.parseInt(quarter, 10)
      const startMonth = (quarterNum - 1) * 3 + 1
      const endMonth = quarterNum * 3
      if (monthNum < startMonth || monthNum > endMonth) return false
    }

    if (month !== 'all' && monthNum !== Number.parseInt(month, 10)) return false

    if (!query) return true
    return (
      entry.content.toLowerCase().includes(query)
      || entry.label.toLowerCase().includes(query)
      || entry.dateKey.includes(query)
    )
  })
})

const journalEmptyMessage = computed(() => {
  if (yearJournalEntries.value.length === 0) {
    return t('year.journal.empty', '这一年还没有日记。')
  }
  return t('year.journal.no_match', '没有符合筛选条件的日记。')
})

function selectJournalDate(key) {
  selectedJournalKey.value = selectedJournalKey.value === key ? '' : key
}

function firstDay(month) {
  return new Date(year.value, month, 1).getDay()
}

function daysInMonth(month) {
  return new Date(year.value, month + 1, 0).getDate()
}

function dateKey(month, day) {
  const mm = String(month + 1).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year.value}-${mm}-${dd}`
}

function visiblePlansForDay(month, day) {
  const key = dateKey(month, day)
  return plansStore.plans.filter((plan) => isPlanVisibleOnDate(plan, key))
}

function completedTasksForDay(month, day) {
  const key = dateKey(month, day)
  return visiblePlansForDay(month, day).filter((plan) => checksStore.isChecked(plan.id, key))
}

function allTasksForDay(month, day) {
  const key = dateKey(month, day)
  return visiblePlansForDay(month, day).map((task) => ({
    id: task.id,
    name: task.name,
    type: task.type,
    time: task.time,
    done: checksStore.isChecked(task.id, key),
  }))
}

function pctForDay(month, day) {
  const visible = visiblePlansForDay(month, day)
  if (!visible.length) return null
  const key = dateKey(month, day)
  const done = visible.filter((plan) => checksStore.isChecked(plan.id, key)).length
  return Math.round((done / visible.length) * 100)
}

function isFutureDay(month, day) {
  return new Date(year.value, month, day) > today
}

function pctClass(pct) {
  if (pct === null) return 'pct-0'
  if (pct >= 100) return 'pct-100'
  if (pct >= 75)  return 'pct-75'
  if (pct >= 50)  return 'pct-50'
  if (pct >= 25)  return 'pct-25'
  return 'pct-0'
}

function dayClass(month, day) {
  const date = new Date(year.value, month, day)
  const isToday =
    today.getFullYear() === year.value &&
    today.getMonth() === month &&
    today.getDate() === day
  const isFuture = date > today
  const pct = isFuture ? null : pctForDay(month, day)
  return [
    pctClass(pct),
    isToday ? 'today' : '',
    isFuture ? 'future' : '',
  ]
}

function dayTitle(month, day) {
  const isFuture = isFutureDay(month, day)
  const pct = isFuture ? null : pctForDay(month, day)
  return t('calendar.day_title', '{month} {day}: {value}', {
    month: MONTHS_S.value[month],
    day,
    value: pct === null ? t('calendar.upcoming', 'upcoming') : `${pct}%`,
  })
}

function buildPopoverStyle(event) {
  const target = event.currentTarget
  if (!target) return {}
  const rect = target.getBoundingClientRect()
  const width = Math.min(360, window.innerWidth - 24)
  const left = Math.min(Math.max(12, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 12)
  const top = Math.min(rect.bottom + 14, window.innerHeight - 260)
  return {
    left: `${left}px`,
    top: `${Math.max(16, top)}px`,
    width: `${width}px`,
  }
}

function openDayPopover(month, day, event) {
  const key = dateKey(month, day)
  const visible = visiblePlansForDay(month, day)
  const tasks = completedTasksForDay(month, day)
  dayPopover.value = {
    title: t('calendar.popover_title', '{month} {day}, {year}', {
      month: MONTHS.value[month],
      day,
      year: year.value,
    }),
    dateKey: key,
    completed: tasks.length,
    total: visible.length,
    tasks: allTasksForDay(month, day),
    review: reviewsStore.getReview(key),
  }
  popoverStyle.value = buildPopoverStyle(event)
  dayPopoverOpen.value = true
}

function closeDayPopover() {
  dayPopoverOpen.value = false
}

function openDayReview() {
  dayReviewOpen.value = true
}

async function fetchVisibleYear() {
  const from = `${year.value}-01-01`
  const end = new Date(year.value, 11, 31)
  const cappedEnd = end > today ? today : end
  const to = `${cappedEnd.getFullYear()}-${String(cappedEnd.getMonth() + 1).padStart(2, '0')}-${String(cappedEnd.getDate()).padStart(2, '0')}`
  await Promise.all([
    checksStore.fetchRange(from, to),
    reviewsStore.fetchRange(from, to),
  ])
}

function weekMonday(week) {
  const jan1 = new Date(year.value, 0, 1)
  const date = new Date(jan1)
  date.setDate(jan1.getDate() + week * 7)
  return date
}

function heatmapLevel(habitId, week) {
  const monday = weekMonday(week)
  let done = 0
  let total = 0
  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(monday)
    date.setDate(monday.getDate() + offset)
    if (date > today) continue
    if (date.getFullYear() !== year.value) continue
    total += 1
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    if (checksStore.isChecked(habitId, `${year.value}-${mm}-${dd}`)) done += 1
  }

  if (!total) return ''
  const ratio = done / total
  if (ratio >= 0.8) return 'lvl4'
  if (ratio >= 0.6) return 'lvl3'
  if (ratio >= 0.4) return 'lvl2'
  if (ratio > 0) return 'lvl1'
  return ''
}

watch(year, async () => {
  journalQuery.value = ''
  journalQuarter.value = 'all'
  journalMonth.value = 'all'
  selectedJournalKey.value = ''
  journalText.value = ''
  await fetchVisibleYear()
})

onMounted(() => {
  fetchVisibleYear()
})
</script>

<style scoped>
.section { padding: 2rem 1.5rem; }
.section-header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; }
.section-title { font-size: 1.4rem; font-weight: 700; margin: 0; }
.year-nav { display: flex; gap: .4rem; }
.nav-btn { background: none; border: 1px solid var(--faint); border-radius: 4px; padding: .2rem .6rem; cursor: pointer; font-size: .9rem; color: var(--mid); }
.nav-btn:hover { background: var(--faint); }

.cal-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.2rem; }
.cal-month-name { font-size: .75rem; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; margin-bottom: .4rem; color: var(--muted); }
.cal-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; margin-bottom: 2px; }
.cal-wd { font-size: .6rem; text-align: center; color: var(--faint); }
.cal-days-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.cal-day {
  aspect-ratio: 1;
  border-radius: 2px;
  background: var(--faint);
  border: 1px solid color-mix(in srgb, var(--faint) 65%, var(--dark));
}
.cal-day.clickable { cursor: pointer; transition: transform .1s, box-shadow .15s, outline-color .15s; }
.cal-day.clickable:hover { transform: scale(1.14); z-index: 1; box-shadow: 0 10px 22px rgba(17,17,17,.14); }
.cal-day.empty { background: transparent; border-color: transparent; }
.cal-day.future {
  background: color-mix(in srgb, var(--faint2) 72%, transparent);
  border: 1px dashed color-mix(in srgb, var(--faint) 58%, var(--dark));
}
.cal-day.today { outline: 2px solid var(--dark); outline-offset: 1px; }
.cal-day.pct-0   {
  background: color-mix(in srgb, var(--faint2) 82%, transparent);
  border-color: color-mix(in srgb, var(--faint) 52%, var(--dark));
}
.cal-day.pct-25  { background: var(--faint); }
.cal-day.pct-50  { background: var(--muted); }
.cal-day.pct-75  { background: var(--mid); }
.cal-day.pct-100 { background: var(--dark); }

.heatmap-section { margin-top: 2rem; display: flex; flex-direction: column; gap: .6rem; }
.heatmap-row { display: flex; align-items: center; gap: .8rem; }
.heatmap-row-label { font-size: .7rem; color: var(--muted); width: 90px; flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.heatmap-cells { display: flex; gap: 2px; flex-wrap: nowrap; }
.hm-cell { width: 10px; height: 10px; border-radius: 2px; background: var(--faint2); flex-shrink: 0; }
.hm-cell.lvl1 { background: var(--faint); }
.hm-cell.lvl2 { background: var(--muted); }
.hm-cell.lvl3 { background: var(--mid); }
.hm-cell.lvl4 { background: var(--dark); }

.year-journal-section {
  margin-top: 2.5rem;
  padding-top: 2rem;
  border-top: 1px solid var(--faint2);
}
.year-journal-head {
  margin-bottom: 1rem;
}
.year-journal-kicker {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 6px;
}
.year-journal-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--dark);
  letter-spacing: -.02em;
}
.year-journal-toolbar {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 1rem;
}
.year-journal-search {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--faint);
  border-radius: 10px;
  background: color-mix(in srgb, var(--surface) 96%, var(--bg));
  font-family: var(--font);
  font-size: 13px;
  color: var(--dark);
  outline: none;
  transition: border-color .15s;
}
.year-journal-search:focus {
  border-color: color-mix(in srgb, var(--mid) 40%, var(--surface));
}
.year-journal-search::placeholder { color: var(--muted); }
.year-journal-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.year-journal-filter-btn {
  padding: 6px 12px;
  border: 1px solid var(--faint);
  border-radius: 999px;
  background: var(--surface);
  color: var(--mid);
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: .06em;
  cursor: pointer;
  transition: all .12s;
}
.year-journal-filter-btn:hover {
  border-color: color-mix(in srgb, var(--mid) 40%, var(--surface));
  color: var(--dark);
}
.year-journal-filter-btn.active {
  background: var(--dark);
  border-color: var(--dark);
  color: var(--bg);
}
.year-journal-month-select {
  margin-left: auto;
  padding: 6px 10px;
  border: 1px solid var(--faint);
  border-radius: 8px;
  background: var(--surface);
  color: var(--mid);
  font-family: var(--mono);
  font-size: 10px;
  cursor: pointer;
}
.year-journal-timeline {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.year-journal-card {
  border: 1px solid var(--faint);
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface) 96%, var(--bg));
  overflow: hidden;
  transition: border-color .12s;
}
.year-journal-card.active {
  border-color: color-mix(in srgb, var(--dark) 24%, var(--faint));
}
.year-journal-card-head {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  padding: 14px 16px;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background .12s;
}
.year-journal-card-head:hover {
  background: var(--faint2);
}
.year-journal-card-date {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: .04em;
  color: var(--dark);
  font-weight: 600;
}
.year-journal-card-preview {
  font-size: 13px;
  color: var(--mid);
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}
.year-journal-card-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 16px 16px;
  border-top: 1px solid var(--faint2);
}
.year-journal-card-content {
  margin-top: 12px;
  font-size: 13px;
  color: var(--text);
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}
.year-journal-empty {
  padding: 28px 18px;
  border: 1px dashed var(--faint);
  border-radius: 14px;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.7;
  text-align: center;
}
.review-save-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 14px;
}
.review-manual-hint {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: .08em;
  color: var(--muted);
  text-transform: uppercase;
}

.day-popover-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
}

.day-popover {
  position: fixed;
  max-height: min(320px, calc(100vh - 32px));
  padding: 16px;
  border: 1px solid var(--faint);
  border-radius: 16px;
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  box-shadow: 0 20px 54px rgba(17,17,17,.12);
  backdrop-filter: blur(14px);
  overflow: hidden;
}

.day-popover-fade-enter-active,
.day-popover-fade-leave-active {
  transition: opacity .18s ease, transform .18s ease;
}

.day-popover-fade-enter-from,
.day-popover-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.day-popover-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.day-popover-actions {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}

.day-popover-date {
  font-family: var(--mono);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -.02em;
  color: var(--dark);
}

.day-popover-meta {
  margin-top: 4px;
  font-size: 10px;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--muted);
}

.day-popover-close,
.day-popover-expand {
  width: 28px;
  height: 28px;
  border: 1px solid var(--faint);
  border-radius: 50%;
  background: var(--surface);
  color: var(--mid);
  cursor: pointer;
  font-family: var(--mono);
}

.day-popover-close:hover,
.day-popover-expand:hover {
  background: var(--dark);
  color: var(--bg);
}

.day-popover-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 230px;
  overflow: auto;
  padding-right: 2px;
}

.day-popover-item {
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--faint2);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface) 94%, var(--bg));
}

.day-popover-item.done {
  border-color: color-mix(in srgb, var(--dark) 24%, var(--faint));
  background: color-mix(in srgb, var(--surface) 84%, var(--dark) 5%);
}

.day-popover-bullet {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--muted);
}

.day-popover-bullet.habit { background: var(--dark); }
.day-popover-bullet.todo { background: var(--mid); }

.day-popover-copy {
  min-width: 0;
}

.day-popover-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--dark);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.day-popover-type {
  margin-top: 3px;
  font-size: 10px;
  color: var(--muted);
  font-family: var(--mono);
  letter-spacing: .05em;
}

.day-popover-time {
  font-size: 10px;
  color: var(--muted);
  font-family: var(--mono);
  letter-spacing: .05em;
}

.day-popover-empty {
  padding: 18px 4px 4px;
  font-size: 12px;
  color: var(--muted);
}

.day-popover-review {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--faint2);
}

.day-popover-review-label {
  font-size: 10px;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 6px;
  font-family: var(--mono);
}

.day-popover-review-text {
  font-size: 12px;
  color: var(--mid);
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 768px) {
  .cal-grid { grid-template-columns: repeat(2, 1fr); }
  .year-journal-filters {
    flex-direction: column;
    align-items: stretch;
  }
  .year-journal-month-select {
    margin-left: 0;
    width: 100%;
  }
  .day-popover {
    left: 12px !important;
    right: 12px !important;
    width: auto !important;
  }
}

@media (max-width: 520px) {
  .cal-grid { grid-template-columns: 1fr; }
  .heatmap-row {
    align-items: flex-start;
    flex-direction: column;
    gap: .4rem;
  }
  .heatmap-row-label {
    width: auto;
  }
  .heatmap-cells {
    width: 100%;
    overflow-x: auto;
    padding-bottom: 2px;
  }
}
</style>
