<template>
  <section id="s4" class="section">
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
              <button class="day-popover-close" type="button" @click="closeDayPopover">x</button>
            </div>

            <div v-if="dayPopover.tasks.length" class="day-popover-list">
              <div
                v-for="task in dayPopover.tasks"
                :key="task.id"
                class="day-popover-item"
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
              {{ t('tracker.empty', 'No completed items for this day') }}
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { usePlansStore } from '@/features/plans/model/usePlansStore'
import { useChecksStore } from '@/features/checks/model/useChecksStore'
import { useI18nStore } from '@/shared/i18n/useI18nStore'

const plansStore = usePlansStore()
const checksStore = useChecksStore()
const i18n = useI18nStore()

const year = ref(new Date().getFullYear())
const today = new Date()

const dayPopoverOpen = ref(false)
const dayPopover = ref(null)
const popoverStyle = ref({})

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

function completedTasksForDay(month, day) {
  const key = dateKey(month, day)
  return plansStore.plans.filter((plan) => checksStore.isChecked(plan.id, key))
}

function pctForDay(month, day) {
  const all = plansStore.plans
  if (!all.length) return null
  const done = completedTasksForDay(month, day).length
  return Math.round((done / all.length) * 100)
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
  return `${MONTHS_S.value[month]} ${day}: ${pct === null ? 'upcoming' : `${pct}%`}`
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
  const tasks = completedTasksForDay(month, day)
  dayPopover.value = {
    title: `${MONTHS.value[month]} ${day}, ${year.value}`,
    completed: tasks.length,
    total: plansStore.plans.length,
    tasks: tasks.map((task) => ({
      id: task.id,
      name: task.name,
      type: task.type,
      time: task.time,
    })),
  }
  popoverStyle.value = buildPopoverStyle(event)
  dayPopoverOpen.value = true
}

function closeDayPopover() {
  dayPopoverOpen.value = false
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
.cal-day { aspect-ratio: 1; border-radius: 2px; background: var(--faint); border: none; }
.cal-day.clickable { cursor: pointer; transition: transform .1s, box-shadow .15s, outline-color .15s; }
.cal-day.clickable:hover { transform: scale(1.14); z-index: 1; box-shadow: 0 10px 22px rgba(17,17,17,.14); }
.cal-day.empty { background: transparent; }
.cal-day.future { background: var(--faint2); border: 1px dashed var(--faint); }
.cal-day.today { outline: 2px solid var(--dark); outline-offset: 1px; }
.cal-day.pct-0   { background: var(--faint2); }
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

.day-popover-close {
  width: 28px;
  height: 28px;
  border: 1px solid var(--faint);
  border-radius: 50%;
  background: var(--surface);
  color: var(--mid);
  cursor: pointer;
  font-family: var(--mono);
}

.day-popover-close:hover {
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

@media (max-width: 768px) {
  .cal-grid { grid-template-columns: repeat(2, 1fr); }
  .day-popover {
    left: 12px !important;
    right: 12px !important;
    width: auto !important;
  }
}
</style>
