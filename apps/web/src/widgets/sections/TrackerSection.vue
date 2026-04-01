<template>
  <section class="tracker-section">
    <!-- Navigation -->
    <div class="s3-nav">
      <button class="s3-btn" @click="prevMonth">&#8249;</button>
      <span class="s3-month-label">{{ monthLabel }}</span>
      <button class="s3-btn" @click="nextMonth">&#8250;</button>
      <button class="s3-btn s3-today-btn" @click="goToday">{{ t('tracker.today', 'Today') }}</button>
    </div>

    <!-- Empty state -->
    <div v-if="!plans.plans.length" class="empty-state">
      <div class="empty-state-text">{{ t('tracker.empty', 'Add plans in the Day section to start tracking') }}</div>
    </div>

    <template v-else>
      <!-- Table -->
      <div class="tracker-table-wrap">
        <table class="tracker-table">
          <thead>
            <!-- Row 1: week numbers -->
            <tr class="tr-week">
              <th class="th-name col-name">{{ t('tracker.task_habit', 'Task / Habit') }}</th>
              <th
                v-for="(wk, wi) in weeks"
                :key="'wk' + wi"
                :colspan="7"
                :class="weekHasToday(wk) ? 'th-week-today' : ''"
              >{{ t('tracker.week_prefix', 'Week') }} {{ wi + 1 }}</th>
              <th class="th-pct col-pct">%</th>
            </tr>
            <!-- Row 2: day headers -->
            <tr class="tr-day">
              <th class="th-name col-name">{{ shortMonthLabel }}</th>
              <template v-for="(wk, wi) in weeks" :key="'wkd' + wi">
                <th
                  v-for="(cell, wd) in wk"
                  :key="'d' + wi + '-' + wd"
                  class="col-day"
                  :class="cell && dateKey(cell.year, cell.month, cell.day) === tKey ? 'th-today-day' : ''"
                >
                  <span class="col-day-wd">{{ WDAYS_M[wd] }}</span>
                  <template v-if="cell">
                    <br />
                    <span
                      class="col-day-num"
                      :style="{ color: dateKey(cell.year, cell.month, cell.day) === tKey ? 'var(--dark)' : 'var(--muted)', fontSize: '8px' }"
                    >{{ cell.day }}</span>
                  </template>
                </th>
              </template>
              <th class="th-pct col-pct">{{ t('tracker.done_col', 'Done') }}</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="group in groups" :key="group.label">
              <template v-if="group.items.length">
                <tr class="tr-group-sep">
                  <td class="td-name-group" :colspan="1 + weeks.length * 7 + 1">{{ group.label }}</td>
                </tr>
                <tr v-for="plan in group.items" :key="plan.id" class="tr-habit-row">
                  <td class="td-name col-name">
                    <div class="td-name-inner">
                      <div :class="['td-type-dot', plan.type]"></div>
                      <div class="td-plan-name" :title="plan.name">{{ plan.name }}</div>
                    </div>
                  </td>
                  <template v-for="(wk, wi) in weeks" :key="'row' + plan.id + 'wk' + wi">
                    <td
                      v-for="(cell, wd) in wk"
                      :key="'row' + plan.id + 'd' + wi + '-' + wd"
                      class="td-check col-day"
                      :class="[
                        wd === 6 && wi !== weeks.length - 1 ? 'tc-week-sep' : '',
                        !cell ? 'tc-empty' : '',
                        cell && dateKey(cell.year, cell.month, cell.day) === tKey ? 'tc-today-col' : ''
                      ]"
                    >
                      <span v-if="!cell" class="chk-box chk-empty"></span>
                      <span v-else-if="isFuture(cell)" class="chk-box chk-future"></span>
                      <span
                        v-else
                        class="chk-box"
                        :class="checks.isChecked(plan.id, dateKey(cell.year, cell.month, cell.day)) ? 'chk-done' : ''"
                        @click.stop="checks.toggle(plan.id, dateKey(cell.year, cell.month, cell.day))"
                      ></span>
                    </td>
                  </template>
                  <td class="td-pct col-pct">{{ planPct(plan) }}</td>
                </tr>
              </template>
            </template>
          </tbody>
        </table>
      </div>

      <!-- Summary -->
      <div class="tracker-summary">
        <div v-for="item in summary" :key="item.lbl" class="tsumm-item">
          <div class="tsumm-val">{{ item.val }}</div>
          <div class="tsumm-lbl">{{ item.lbl }}</div>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { usePlansStore } from '@/features/plans/model/usePlansStore'
import { useChecksStore } from '@/features/checks/model/useChecksStore'
import { useI18nStore } from '@/shared/i18n/useI18nStore'

const plans = usePlansStore()
const checks = useChecksStore()
const i18n = useI18nStore()
function t(key, fallback) { return i18n.t(key, fallback) }

// ── state ─────────────────────────────────────────────────────────────────────
const now = new Date()
const trackerYear  = ref(now.getFullYear())
const trackerMonth = ref(now.getMonth())

// ── constants ─────────────────────────────────────────────────────────────────
const MONTHS   = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTHS_S = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const WDAYS_M  = ['Mo','Tu','We','Th','Fr','Sa','Su']

// ── helpers ───────────────────────────────────────────────────────────────────
function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function isFuture(cell) {
  const cellDate = new Date(cell.year, cell.month, cell.day)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return cellDate > today
}

function getMonthWeeks(year, month) {
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMon = new Date(year, month + 1, 0).getDate()
  const weeks = []
  let day = 1 - firstDow
  while (day <= daysInMon) {
    const week = []
    for (let wd = 0; wd < 7; wd++) {
      week.push((day >= 1 && day <= daysInMon) ? { year, month, day } : null)
      day++
    }
    weeks.push(week)
  }
  return weeks
}

// ── computed ──────────────────────────────────────────────────────────────────
const tKey = computed(() => todayKey())

const weeks = computed(() => getMonthWeeks(trackerYear.value, trackerMonth.value))

const monthLabel = computed(() => `${MONTHS[trackerMonth.value]} ${trackerYear.value}`)

const shortMonthLabel = computed(() => `${MONTHS_S[trackerMonth.value]} ${trackerYear.value}`)

const groups = computed(() => [
  { label: t('tracker.group.habits', 'Habits · daily recurring'), items: plans.plans.filter(p => p.type === 'habit') },
  { label: t('tracker.group.tasks', 'Tasks · one-time items'),   items: plans.plans.filter(p => p.type === 'todo') },
])

function weekHasToday(wk) {
  const tk = tKey.value
  return wk.some(c => c && dateKey(c.year, c.month, c.day) === tk)
}

function daysElapsed() {
  const t = new Date()
  const y = trackerYear.value
  const m = trackerMonth.value
  if (t.getFullYear() === y && t.getMonth() === m) return t.getDate()
  return new Date(y, m + 1, 0).getDate()
}

function planPct(plan) {
  const elapsed = daysElapsed()
  let done = 0
  for (let d = 1; d <= elapsed; d++) {
    if (checks.isChecked(plan.id, dateKey(trackerYear.value, trackerMonth.value, d))) done++
  }
  return elapsed ? Math.round(done / elapsed * 100) + '%' : '—'
}

const summary = computed(() => {
  const y = trackerYear.value
  const m = trackerMonth.value
  const elapsed = daysElapsed()
  const allPlans = plans.plans

  let tot = 0, don = 0, perf = 0
  for (let d = 1; d <= elapsed; d++) {
    const k = dateKey(y, m, d)
    let allDone = allPlans.length > 0
    allPlans.forEach(p => {
      if (checks.isChecked(p.id, k)) don++
      else allDone = false
      tot++
    })
    if (allDone) perf++
  }

  let bestHabit = allPlans[0] || null
  let bestPct = 0
  allPlans.forEach(p => {
    let c = 0
    for (let d = 1; d <= elapsed; d++) {
      if (checks.isChecked(p.id, dateKey(y, m, d))) c++
    }
    const pp = elapsed ? Math.round(c / elapsed * 100) : 0
    if (pp > bestPct) { bestPct = pp; bestHabit = p }
  })

  return [
    { val: tot ? Math.round(don / tot * 100) + '%' : '—', lbl: t('year.summary.completion', 'Month Completion') },
    { val: `${don}/${tot}`,                                lbl: t('year.summary.total', 'Checks Done') },
    { val: perf,                                           lbl: t('year.summary.perfect', 'Perfect Days') },
    {
      val: bestHabit ? bestPct + '%' : '—',
      lbl: bestHabit ? bestHabit.name.split(' ').slice(0, 2).join(' ') + ' · best' : t('year.summary.best', 'Best Habit')
    },
  ]
})

// ── navigation ────────────────────────────────────────────────────────────────
function prevMonth() {
  trackerMonth.value--
  if (trackerMonth.value < 0) { trackerMonth.value = 11; trackerYear.value-- }
}

function nextMonth() {
  trackerMonth.value++
  if (trackerMonth.value > 11) { trackerMonth.value = 0; trackerYear.value++ }
}

function goToday() {
  const d = new Date()
  trackerYear.value  = d.getFullYear()
  trackerMonth.value = d.getMonth()
}

// ── data loading ──────────────────────────────────────────────────────────────
async function loadMonth() {
  await checks.fetchMonth(trackerYear.value, trackerMonth.value)
}

watch([trackerYear, trackerMonth], loadMonth)

onMounted(async () => {
  if (!plans.plans.length) await plans.fetch()
  await loadMonth()
})
</script>
