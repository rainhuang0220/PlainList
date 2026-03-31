<template>
  <section id="s4" class="section">
    <div class="section-header">
      <h2 class="section-title">{{ year }}</h2>
      <div class="year-nav">
        <button class="nav-btn" @click="year--">&#8592;</button>
        <button class="nav-btn" @click="year++">&#8594;</button>
      </div>
    </div>

    <!-- 12-month grid -->
    <div class="cal-grid">
      <div v-for="m in 12" :key="m" class="cal-month">
        <div class="cal-month-name">{{ MONTHS_S[m - 1] }}</div>
        <div class="cal-weekdays">
          <div v-for="wd in WDAYS_S" :key="wd" class="cal-wd">{{ wd }}</div>
        </div>
        <div class="cal-days-grid">
          <div
            v-for="_ in firstDay(m - 1)"
            :key="'e' + _"
            class="cal-day empty"
          />
          <div
            v-for="d in daysInMonth(m - 1)"
            :key="d"
            class="cal-day"
            :class="dayClass(m - 1, d)"
            :title="dayTitle(m - 1, d)"
            @click="openMonthDetail(m - 1)"
          />
        </div>
      </div>
    </div>

    <!-- Heatmap per habit -->
    <div class="heatmap-section">
      <div
        v-for="habit in habits"
        :key="habit.id"
        class="heatmap-row"
      >
        <div class="heatmap-row-label">
          {{ habit.name.length > 14 ? habit.name.slice(0, 13) + '…' : habit.name }}
        </div>
        <div class="heatmap-cells">
          <div
            v-for="w in 52"
            :key="w"
            class="hm-cell"
            :class="heatmapLevel(habit.id, w - 1)"
          />
        </div>
      </div>
    </div>

    <!-- Month Detail View -->
    <Teleport to="body">
      <div v-if="monthDetailOpen" class="month-detail-overlay" @click.self="closeMonthDetail">
        <div class="month-detail-container">
          <div class="mdv-header">
            <h2 class="mdv-title">{{ MONTHS[selectedMonth] }} {{ year }}</h2>
            <button class="mdv-close" @click="closeMonthDetail">×</button>
          </div>

          <!-- Treemap-style grid: tightly packed, no gaps -->
          <div class="mdv-treemap" ref="treemapContainer">
            <div
              v-for="(day, index) in activeDaysInMonth(selectedMonth)"
              :key="day.date"
              class="mdv-tree-day"
              :class="{ today: day.isToday }"
              :style="treemapDayStyle(day, index)"
            >
              <div class="mdv-tree-date-badge">{{ day.date }}</div>
              <div class="mdv-tree-tasks-area">
                <div
                  v-for="(task, taskIndex) in day.tasks"
                  :key="task.id"
                  class="mdv-tree-task"
                  :style="taskTileStyle(day, taskIndex)"
                >
                  <span class="mdv-task-text" :data-fit="`${day.date}-${taskIndex}`">{{ task.name }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { usePlansStore } from '@/features/plans/model/usePlansStore'
import { useChecksStore } from '@/features/checks/model/useChecksStore'
import { useI18nStore } from '@/shared/i18n/useI18nStore'

const plansStore = usePlansStore()
const checksStore = useChecksStore()
const i18n = useI18nStore()

const year = ref(new Date().getFullYear())
const today = new Date()

const monthDetailOpen = ref(false)
const selectedMonth = ref(0)

const MONTHS_S_DEFAULT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTHS_DEFAULT = ['January','February','March','April','May','June','July','August','September','October','November','December']
const WDAYS_S_DEFAULT  = ['Su','Mo','Tu','We','Th','Fr','Sa']

const MONTHS_S = computed(() => i18n.L('MONTHS_S', MONTHS_S_DEFAULT))
const MONTHS = computed(() => i18n.L('MONTHS', MONTHS_DEFAULT))
const WDAYS_S  = computed(() => i18n.L('WDAYS_S', WDAYS_S_DEFAULT))

const habits = computed(() => plansStore.plans.filter(p => p.type === 'habit'))

function firstDay(m) {
  return new Date(year.value, m, 1).getDay()
}

function daysInMonth(m) {
  return new Date(year.value, m + 1, 0).getDate()
}

function dateKey(m, d) {
  const mm = String(m + 1).padStart(2, '0')
  const dd = String(d).padStart(2, '0')
  return `${year.value}-${mm}-${dd}`
}

function pctForDay(m, d) {
  const key = dateKey(m, d)
  const all = plansStore.plans
  if (!all.length) return null
  const done = all.filter(p => checksStore.isChecked(p.id, key)).length
  return Math.round((done / all.length) * 100)
}

function completedCount(m, d) {
  const key = dateKey(m, d)
  return plansStore.plans.filter(p => checksStore.isChecked(p.id, key)).length
}

function isFutureDay(m, d) {
  const date = new Date(year.value, m, d)
  return date > today
}

function pctClass(pct) {
  if (pct === null) return 'pct-0'
  if (pct >= 100) return 'pct-100'
  if (pct >= 75)  return 'pct-75'
  if (pct >= 50)  return 'pct-50'
  if (pct >= 25)  return 'pct-25'
  return 'pct-0'
}

function dayClass(m, d) {
  const date = new Date(year.value, m, d)
  const isToday =
    today.getFullYear() === year.value &&
    today.getMonth() === m &&
    today.getDate() === d
  const isFuture = date > today
  const pct = isFuture ? null : pctForDay(m, d)
  return [
    pctClass(pct),
    isToday  ? 'today'  : '',
    isFuture ? 'future' : '',
    'clickable'
  ]
}

function dayTitle(m, d) {
  const date = new Date(year.value, m, d)
  const isFuture = date > today
  const pct = isFuture ? null : pctForDay(m, d)
  return `${MONTHS_S.value[m]} ${d}: ${pct === null ? 'upcoming' : pct + '%'}`
}

function openMonthDetail(m) {
  selectedMonth.value = m
  monthDetailOpen.value = true
}

function closeMonthDetail() {
  monthDetailOpen.value = false
}

// Auto-fit text: measure each span and scale to fill its tile
function fitAllTaskTexts() {
  nextTick(() => {
    // Small delay to ensure layout is complete after animation
    requestAnimationFrame(() => {
      const spans = document.querySelectorAll('.mdv-task-text[data-fit]')
      spans.forEach(span => {
        // Reset any previous transform
        span.style.transform = ''
        span.style.fontSize = '14px'
        span.style.whiteSpace = 'nowrap'

        const tile = span.parentElement
        if (!tile) return

        const tileW = tile.clientWidth - 6 // minus padding
        const tileH = tile.clientHeight - 6
        if (tileW <= 0 || tileH <= 0) return

        // Measure natural text size at base font
        const textW = span.scrollWidth
        const textH = span.scrollHeight
        if (textW <= 0 || textH <= 0) return

        // Scale to fill — allow both X and Y stretch independently
        const scaleX = tileW / textW
        const scaleY = tileH / textH

        // Use the smaller scale to fit without overflow, then stretch the other axis
        // But cap individual axis stretch to avoid extreme distortion (max 2.5x ratio)
        let sx = scaleX
        let sy = scaleY
        const ratio = Math.max(sx, sy) / Math.min(sx, sy)
        if (ratio > 2.5) {
          // Limit distortion: use uniform scale + mild stretch
          const uniform = Math.min(sx, sy)
          sx = sx > sy ? uniform * 2.5 : uniform
          sy = sy > sx ? uniform * 2.5 : uniform
        }

        span.style.transform = `scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`
        span.style.transformOrigin = 'center center'
      })
    })
  })
}

// Trigger fit when month detail opens
watch(monthDetailOpen, (open) => {
  if (open) fitAllTaskTexts()
})

// Get only days with completed tasks for artistic view
function activeDaysInMonth(m) {
  const days = []
  const totalDays = daysInMonth(m)

  for (let d = 1; d <= totalDays; d++) {
    if (isFutureDay(m, d)) continue

    const completed = completedCount(m, d)
    if (completed === 0) continue // Skip days with no completed tasks

    const key = dateKey(m, d)
    const tasks = plansStore.plans
      .filter(p => checksStore.isChecked(p.id, key))
      .map(p => ({ id: p.id, name: p.name }))

    const _date = new Date(year.value, m, d)
    const isToday =
      today.getFullYear() === year.value &&
      today.getMonth() === m &&
      today.getDate() === d

    days.push({
      date: d,
      completed,
      tasks,
      isToday
    })
  }

  return days
}

// Seeded pseudo-random for stable "randomness" per day
function seededRand(seed) {
  let x = Math.sin(seed * 9301 + 49297) * 49297
  return x - Math.floor(x)
}

// Recursive binary-split treemap for day boxes in the month (七巧板 style)
// Computes all day rects at once, then caches
const _dayTileCache = { month: -1, year: -1, tiles: [] }

function computeDayTiles(month) {
  const allDays = activeDaysInMonth(month)
  const n = allDays.length
  if (n === 0) return []
  if (n === 1) return [{ left: 0, top: 0, width: 100, height: 100 }]

  // Weight per day: flatten the range so small days don't get crushed
  const maxCompleted = Math.max(...allDays.map(d => d.completed))
  const weights = allDays.map((d, i) => {
    // Compress range: min 60% of max weight, so small days stay readable
    const normalized = 0.6 + 0.4 * (d.completed / Math.max(maxCompleted, 1))
    const jitter = 0.85 + seededRand(d.date * 41 + i * 17 + month * 7) * 0.3 // 0.85–1.15
    return normalized * jitter
  })

  function splitRect(indices, x, y, w, h, depth) {
    if (indices.length === 0) return []
    if (indices.length === 1) {
      return [{ idx: indices[0], left: x, top: y, width: w, height: h }]
    }

    const totalW = indices.reduce((s, i) => s + weights[i], 0)

    // Alternate direction with randomness
    const horizontal = (depth % 2 === 0) !== (seededRand(month * 5 + depth * 11 + indices.length) > 0.6)

    // Split target: 35–65% of total weight
    const splitTarget = totalW * (0.35 + seededRand(month * 19 + depth * 23 + indices[0] * 3) * 0.3)
    let cumulative = 0
    let splitAt = 1

    for (let i = 0; i < indices.length - 1; i++) {
      cumulative += weights[indices[i]]
      if (cumulative >= splitTarget) {
        splitAt = i + 1
        break
      }
    }

    const ratio = cumulative / totalW
    const groupA = indices.slice(0, splitAt)
    const groupB = indices.slice(splitAt)

    if (horizontal) {
      const wA = w * ratio
      return [
        ...splitRect(groupA, x, y, wA, h, depth + 1),
        ...splitRect(groupB, x + wA, y, w - wA, h, depth + 1)
      ]
    } else {
      const hA = h * ratio
      return [
        ...splitRect(groupA, x, y, w, hA, depth + 1),
        ...splitRect(groupB, x, y + hA, w, h - hA, depth + 1)
      ]
    }
  }

  const indices = allDays.map((_, i) => i)
  const rects = splitRect(indices, 0, 0, 100, 100, 0)
  rects.sort((a, b) => a.idx - b.idx)
  return rects.map(r => ({ left: r.left, top: r.top, width: r.width, height: r.height }))
}

function getDayTiles(month) {
  if (_dayTileCache.month !== month || _dayTileCache.year !== year.value) {
    _dayTileCache.month = month
    _dayTileCache.year = year.value
    _dayTileCache.tiles = computeDayTiles(month)
  }
  return _dayTileCache.tiles
}

function treemapDayStyle(day, index) {
  const tiles = getDayTiles(selectedMonth.value)
  const tile = tiles[index]
  if (!tile) return {}

  const gap = 3
  const r1 = seededRand(day.date * 11 + 5)
  const r2 = seededRand(day.date * 23 + 9)
  const borderRadius = `${2 + Math.floor(r1 * 8)}px`
  const bgOpacity = 3 + Math.floor(r2 * 5)

  return {
    position: 'absolute',
    left: `calc(${tile.left}% + ${gap}px)`,
    top: `calc(${tile.top}% + ${gap}px)`,
    width: `calc(${tile.width}% - ${gap * 2}px)`,
    height: `calc(${tile.height}% - ${gap * 2}px)`,
    animationDelay: `${index * 50}ms`,
    borderRadius,
    background: `color-mix(in srgb, var(--dark) ${bgOpacity}%, var(--surface))`
  }
}

// Slice-and-dice treemap for tasks inside a day box (七巧板 style)
// Returns an array of { left, top, width, height } rects in % for all tasks
function computeTaskTiles(day) {
  const tasks = day.tasks
  const n = tasks.length
  if (n === 0) return []
  if (n === 1) return [{ left: 0, top: 0, width: 100, height: 100 }]

  // Give each task a weight with seeded jitter so sizes vary
  const weights = tasks.map((t, i) => {
    const base = 1
    const jitter = 0.5 + seededRand(day.date * 37 + i * 11) * 1.5 // 0.5–2.0
    return base * jitter
  })

  // Recursive binary split
  function splitRect(indices, x, y, w, h, depth) {
    if (indices.length === 0) return []
    if (indices.length === 1) {
      return [{ idx: indices[0], left: x, top: y, width: w, height: h }]
    }

    const totalW = indices.reduce((s, i) => s + weights[i], 0)

    // Alternate split direction, with jitter on the split point
    const horizontal = (depth % 2 === 0) !== (seededRand(day.date * 3 + depth * 7) > 0.65)

    // Find split point: roughly half the weight, with some randomness
    let splitTarget = totalW * (0.35 + seededRand(day.date * 13 + depth * 19) * 0.3) // 35–65%
    let cumulative = 0
    let splitAt = 1

    for (let i = 0; i < indices.length - 1; i++) {
      cumulative += weights[indices[i]]
      if (cumulative >= splitTarget) {
        splitAt = i + 1
        break
      }
    }

    const ratio = cumulative / totalW
    const groupA = indices.slice(0, splitAt)
    const groupB = indices.slice(splitAt)

    if (horizontal) {
      // Split horizontally (left | right)
      const wA = w * ratio
      const wB = w - wA
      return [
        ...splitRect(groupA, x, y, wA, h, depth + 1),
        ...splitRect(groupB, x + wA, y, wB, h, depth + 1)
      ]
    } else {
      // Split vertically (top / bottom)
      const hA = h * ratio
      const hB = h - hA
      return [
        ...splitRect(groupA, x, y, w, hA, depth + 1),
        ...splitRect(groupB, x, y + hA, w, hB, depth + 1)
      ]
    }
  }

  const indices = tasks.map((_, i) => i)
  const rects = splitRect(indices, 0, 0, 100, 100, 0)

  // Sort by idx to match task order
  rects.sort((a, b) => a.idx - b.idx)
  return rects.map(r => ({ left: r.left, top: r.top, width: r.width, height: r.height }))
}

// Cache computed tiles per day to avoid recalc per task
const _tileCache = new Map()
function getTilesForDay(day) {
  const key = `${day.date}-${day.tasks.length}`
  if (!_tileCache.has(key)) {
    _tileCache.set(key, computeTaskTiles(day))
  }
  return _tileCache.get(key)
}

// Style for each task tile — absolute positioned, font fills the box
function taskTileStyle(day, taskIndex) {
  const tiles = getTilesForDay(day)
  const tile = tiles[taskIndex]
  if (!tile) return {}

  const seed = day.date * 31 + taskIndex * 7
  const gap = 2
  const _textLen = day.tasks[taskIndex]?.name?.length || 1

  // Aspect ratio of this tile
  const aspect = tile.width / Math.max(tile.height, 0.1)

  // Vertical text for tall narrow tiles (aspect < 0.6)
  const isVertical = aspect < 0.55

  // Font weight: heavier for bigger tiles
  const area = tile.width * tile.height / 10000
  const weightIdx = Math.min(4, Math.floor(Math.sqrt(area) * 4.5))
  const weightOptions = [400, 500, 600, 700, 800]
  const fontWeight = weightOptions[weightIdx]

  const style = {
    position: 'absolute',
    left: `calc(${tile.left}% + ${gap}px)`,
    top: `calc(${tile.top}% + ${gap}px)`,
    width: `calc(${tile.width}% - ${gap * 2}px)`,
    height: `calc(${tile.height}% - ${gap * 2}px)`,
    fontWeight,
    lineHeight: 1.05,
    padding: '3px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    overflow: 'hidden',
    borderRadius: `${2 + Math.floor(seededRand(seed + 3) * 6)}px`
  }

  if (isVertical) {
    style.writingMode = 'vertical-rl'
    style.textOrientation = 'mixed'
  }

  return style
}

function _monthDayClass(m, d) {
  const date = new Date(year.value, m, d)
  const isToday =
    today.getFullYear() === year.value &&
    today.getMonth() === m &&
    today.getDate() === d
  const isFuture = date > today
  return [
    isToday  ? 'today'  : '',
    isFuture ? 'future' : '',
  ]
}

function _monthDayStyle(m, d) {
  if (isFutureDay(m, d)) return {}

  const count = completedCount(m, d)
  const allCounts = []
  for (let day = 1; day <= daysInMonth(m); day++) {
    if (!isFutureDay(m, day)) {
      allCounts.push(completedCount(m, day))
    }
  }

  const avgCount = allCounts.reduce((a, b) => a + b, 0) / allCounts.length

  if (count >= avgCount * 1.5 && count >= 3) {
    return { gridRow: 'span 2' }
  }

  return {}
}

// Heatmap: map week index → Mon date of that week in `year`
function weekMonday(w) {
  const jan1 = new Date(year.value, 0, 1)
  const d = new Date(jan1)
  d.setDate(jan1.getDate() + w * 7)
  return d
}

function heatmapLevel(habitId, w) {
  const mon = weekMonday(w)
  let done = 0, total = 0
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon)
    d.setDate(mon.getDate() + i)
    if (d > today) continue
    if (d.getFullYear() !== year.value) continue
    total++
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    if (checksStore.isChecked(habitId, `${year.value}-${mm}-${dd}`)) done++
  }
  if (!total) return ''
  const ratio = done / total
  if (ratio >= 0.8) return 'lvl4'
  if (ratio >= 0.6) return 'lvl3'
  if (ratio >= 0.4) return 'lvl2'
  if (ratio >  0)   return 'lvl1'
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
.cal-month { }
.cal-month-name { font-size: .75rem; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; margin-bottom: .4rem; color: var(--muted); }
.cal-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; margin-bottom: 2px; }
.cal-wd { font-size: .6rem; text-align: center; color: var(--faint); }
.cal-days-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.cal-day { aspect-ratio: 1; border-radius: 2px; background: var(--faint); }
.cal-day.clickable { cursor: pointer; transition: transform .1s; }
.cal-day.clickable:hover { transform: scale(1.2); z-index: 1; }
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

/* Month Detail View */
.month-detail-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: var(--bg);
  z-index: 9999;
  overflow: hidden;
  animation: fadeIn .4s cubic-bezier(.4, 0, .2, 1);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.month-detail-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.mdv-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 30px 40px;
  background: var(--bg);
  z-index: 10;
  position: relative;
}

.mdv-title {
  font-size: 42px;
  font-weight: 700;
  letter-spacing: -.03em;
}

.mdv-close {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 1px solid var(--faint);
  background: var(--surface);
  font-size: 24px;
  color: var(--mid);
  cursor: pointer;
  transition: all .2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mdv-close:hover {
  background: var(--dark);
  color: var(--bg);
  border-color: var(--dark);
  transform: rotate(90deg);
}

/* Treemap container */
.mdv-treemap {
  position: relative;
  flex: 1;
  width: 100%;
  overflow: hidden;
}

.mdv-tree-day {
  position: absolute;
  border: 1.5px solid color-mix(in srgb, var(--dark) 8%, transparent);
  padding: 0;
  display: block;
  transition: all .3s cubic-bezier(.4, 0, .2, 1);
  opacity: 0;
  animation: treeSlideIn .5s cubic-bezier(.4, 0, .2, 1) forwards;
  overflow: hidden;
  cursor: pointer;
}

@keyframes treeSlideIn {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.mdv-tree-day:hover {
  z-index: 5;
  box-shadow: 0 8px 32px rgba(0,0,0,.15);
  transform: scale(1.02) !important;
  border-color: var(--mid);
}

.mdv-tree-day.today {
  background: var(--dark) !important;
  color: var(--bg);
  border-color: var(--dark);
}

.mdv-tree-day.today .mdv-tree-date-badge {
  color: var(--bg);
  background: color-mix(in srgb, var(--bg) 20%, transparent);
}

.mdv-tree-day.today .mdv-tree-task {
  background: color-mix(in srgb, var(--bg) 15%, transparent);
  color: var(--bg);
}

/* Date badge — floating top-left */
.mdv-tree-date-badge {
  position: absolute;
  top: 6px;
  left: 8px;
  font-size: clamp(14px, 2.5vw, 32px);
  font-weight: 800;
  color: var(--dark);
  line-height: 1;
  letter-spacing: -.02em;
  z-index: 2;
  opacity: 0.25;
  pointer-events: none;
}

/* Tasks area — fills the entire day box */
.mdv-tree-tasks-area {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.mdv-tree-task {
  color: var(--dark);
  background: color-mix(in srgb, var(--dark) 6%, transparent);
  transition: background .2s;
  overflow: hidden;
  padding: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mdv-tree-task:hover {
  background: color-mix(in srgb, var(--dark) 16%, transparent);
  z-index: 3;
}

.mdv-task-text {
  white-space: nowrap;
  word-break: keep-all;
  overflow-wrap: normal;
  line-height: 1;
  font-size: 14px;
  display: block;
  will-change: transform;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .mdv-header {
    padding: 20px;
  }

  .mdv-title {
    font-size: 28px;
  }

  .mdv-tree-day {
    padding: 12px;
  }
}
</style>
