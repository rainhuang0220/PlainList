<template>
  <section id="s1">
    <div class="s1-grid">
      <div class="clock-panel">
        <div class="sec-tag"><span>01</span> &nbsp;/&nbsp; {{ t('section.now', 'Now') }}</div>
        <div id="clock-time">
          <span id="ct-hm">{{ hm }}</span><span id="ct-sec" style="font-size:.45em;color:var(--mid);vertical-align:baseline">{{ sec }}</span>
        </div>
        <div id="clock-date">{{ dateStr }}</div>
        <div id="clock-week">{{ weekDayLabel }}</div>
        <div class="clock-motto">{{ t('clock.motto', 'Every second is irreversible.') }}</div>
      </div>
      <div class="progress-panel">
        <div class="sec-tag"><span>{{ t('section.progress', 'Progress') }}</span></div>
        <div class="prog-item">
          <div class="prog-header">
            <span class="prog-label">{{ t('prog.year', 'Year') }}</span>
            <div><div class="prog-pct">{{ yearPct }}%</div><div class="prog-sub">{{ yearProgressLabel }}</div></div>
          </div>
          <div class="prog-track"><div class="prog-fill" :style="{ width: yearPct + '%' }"></div></div>
          <div class="prog-dots">
            <div v-for="i in 10" :key="i" :class="['prog-dot', i <= Math.round(yearPct/10) ? 'on' : '']"></div>
          </div>
        </div>
        <div class="prog-item">
          <div class="prog-header">
            <span class="prog-label">{{ t('prog.month', 'Month') }}</span>
            <div><div class="prog-pct">{{ monthPct }}%</div><div class="prog-sub">{{ monthProgressLabel }}</div></div>
          </div>
          <div class="prog-track"><div class="prog-fill" :style="{ width: monthPct + '%' }"></div></div>
          <div class="prog-dots">
            <div v-for="i in daysInMonth" :key="i" :class="['prog-dot', i <= dayOfMonth ? 'on' : '']"></div>
          </div>
        </div>
        <div class="prog-item">
          <div class="prog-header">
            <span class="prog-label">{{ t('prog.today', 'Today') }}</span>
            <div><div class="prog-pct">{{ dayPct }}%</div><div class="prog-sub">{{ dayProgressLabel }}</div></div>
          </div>
          <div class="prog-track"><div class="prog-fill" :style="{ width: dayPct + '%' }"></div></div>
          <div class="prog-dots">
            <div v-for="i in 24" :key="i" :class="['prog-dot', i <= Math.round(dayPct / 100 * 24) ? 'on' : '']"></div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18nStore } from '@/shared/i18n/useI18nStore'

const i18n = useI18nStore()
function t(key, fallback, params) { return i18n.t(key, fallback, params) }

const DAYS_DEFAULT = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const MONTHS_DEFAULT = ['January','February','March','April','May','June','July','August','September','October','November','December']

function pad(n) { return String(n).padStart(2, '0') }
function ordinal(n) {
  const s = ['th','st','nd','rd'], v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

const now = ref(new Date())
let timer = null

const hm = computed(() => pad(now.value.getHours()) + ':' + pad(now.value.getMinutes()))
const sec = computed(() => ':' + pad(now.value.getSeconds()))

const dayOfYear = computed(() => Math.floor((now.value - new Date(now.value.getFullYear(), 0, 0)) / 86400000))
const daysInYear = computed(() => {
  const y = now.value.getFullYear()
  return y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 366 : 365
})
const weekNum = computed(() => pad(Math.ceil(dayOfYear.value / 7)))
const yearPct = computed(() => Math.round(dayOfYear.value / daysInYear.value * 100))

const dayOfMonth = computed(() => now.value.getDate())
const daysInMonth = computed(() => new Date(now.value.getFullYear(), now.value.getMonth() + 1, 0).getDate())
const monthPct = computed(() => Math.round(dayOfMonth.value / daysInMonth.value * 100))

const dayPct = computed(() => {
  const seconds = now.value.getHours() * 3600 + now.value.getMinutes() * 60 + now.value.getSeconds()
  return Math.round(seconds / 86400 * 100)
})

const days = computed(() => i18n.L('DAYS', DAYS_DEFAULT))
const months = computed(() => i18n.L('MONTHS', MONTHS_DEFAULT))

const dateStr = computed(() => {
  if (i18n.locale === 'zh-CN') {
    return `${now.value.getFullYear()}年${now.value.getMonth() + 1}月${now.value.getDate()}日 ${days.value[now.value.getDay()]}`
  }

  return `${days.value[now.value.getDay()]}, ${months.value[now.value.getMonth()]} ${ordinal(now.value.getDate())}, ${now.value.getFullYear()}`
})

const weekDayLabel = computed(() => t('clock.week_day', 'Week {week} · Day {day}', {
  week: weekNum.value,
  day: dayOfYear.value,
}))

const yearProgressLabel = computed(() => t('prog.days_elapsed', '{current} / {total} days', {
  current: dayOfYear.value,
  total: daysInYear.value,
}))

const monthProgressLabel = computed(() => t('prog.days_elapsed', '{current} / {total} days', {
  current: dayOfMonth.value,
  total: daysInMonth.value,
}))

const dayProgressLabel = computed(() => t('prog.time_elapsed', '{time} / 24:00', {
  time: `${pad(now.value.getHours())}:${pad(now.value.getMinutes())}`,
}))

onMounted(() => {
  timer = setInterval(() => { now.value = new Date() }, 1000)
})

onUnmounted(() => clearInterval(timer))
</script>
