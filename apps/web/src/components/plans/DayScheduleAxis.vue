<template>
  <div v-if="blocks.length" class="dsa">
    <div class="dsa-label">{{ t('plan.day.axis', '今日时间轴') }}</div>
    <div class="dsa-track" aria-hidden="true">
      <span
        v-for="tick in ticks"
        :key="tick.minutes"
        class="dsa-tick"
        :style="{ left: `${tick.left}%` }"
      >
        {{ tick.label }}
      </span>
      <div class="dsa-rail" />
      <div
        v-for="block in blocks"
        :key="block.id"
        class="dsa-block"
        :class="[block.kind, { done: block.done }]"
        :style="blockStyle(block)"
        :title="blockTitle(block)"
      />
    </div>
    <div class="dsa-legend">
      <div
        v-for="block in blocks"
        :key="`legend-${block.id}`"
        class="dsa-legend-row"
        :class="{ done: block.done }"
      >
        <span class="dsa-legend-mark" :class="block.kind" />
        <span class="dsa-legend-name">{{ block.label }}</span>
        <span class="dsa-legend-time">{{ block.timeLabel }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import {
  DAY_VIEW_END,
  DAY_VIEW_START,
  minutesToPercent,
  timeToMinutes,
} from '@plainlist/shared'
import { useI18nStore } from '@/shared/i18n/useI18nStore'

const props = defineProps({
  plans: { type: Array, default: () => [] },
  /** Record or Map-like: planId -> done */
  doneMap: { type: Object, default: () => ({}) },
})

const i18n = useI18nStore()
function t(key, fallback) {
  return i18n.t(key, fallback)
}

function fmtTime(totalMinutes) {
  const clamped = ((Math.round(totalMinutes) % (24 * 60)) + (24 * 60)) % (24 * 60)
  const hour = Math.floor(clamped / 60)
  const minute = clamped % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

const ticks = computed(() => {
  const out = []
  for (let minutes = DAY_VIEW_START; minutes <= DAY_VIEW_END; minutes += 120) {
    out.push({
      minutes,
      label: fmtTime(minutes),
      left: minutesToPercent(minutes),
    })
  }
  return out
})

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
        const left = minutesToPercent(startMin)
        const right = minutesToPercent(endMin)
        return {
          id: plan.id,
          kind: 'bar',
          label: plan.name,
          done,
          left,
          width: Math.max(1.5, right - left),
          timeLabel: `${plan.time}–${fmtTime(endMin)} · ${duration}m`,
        }
      }
      return {
        id: plan.id,
        kind: 'point',
        label: plan.name,
        done,
        left: minutesToPercent(startMin),
        width: 0,
        timeLabel: plan.time,
      }
    })
    .sort((a, b) => a.left - b.left)
})

function blockStyle(block) {
  if (block.kind === 'point') {
    return { left: `calc(${block.left}% - 4px)` }
  }
  return {
    left: `${block.left}%`,
    width: `${block.width}%`,
  }
}

function blockTitle(block) {
  return `${block.label} · ${block.timeLabel}`
}
</script>

<style scoped>
.dsa {
  margin: 0 0 18px;
  padding: 12px 0 4px;
  border-bottom: 1px solid var(--faint);
}

.dsa-label {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 10px;
}

.dsa-track {
  position: relative;
  height: 36px;
  margin: 0 0 10px;
}

.dsa-rail {
  position: absolute;
  left: 0;
  right: 0;
  top: 22px;
  height: 1px;
  background: var(--faint);
}

.dsa-tick {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 0.04em;
  color: var(--muted);
  white-space: nowrap;
}

.dsa-block {
  position: absolute;
  top: 18px;
  box-sizing: border-box;
}

.dsa-block.bar {
  height: 8px;
  border-radius: 2px;
  background: var(--dark);
  opacity: 0.85;
}

.dsa-block.point {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--dark);
  border: 1.5px solid var(--dark);
}

.dsa-block.done {
  opacity: 0.35;
}

.dsa-block.point.done {
  background: transparent;
  opacity: 0.55;
}

.dsa-legend {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 120px;
  overflow: auto;
}

.dsa-legend-row {
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  font-size: 11px;
  color: var(--dark);
}

.dsa-legend-row.done {
  opacity: 0.45;
}

.dsa-legend-mark {
  width: 8px;
  height: 8px;
  background: var(--dark);
  justify-self: center;
}

.dsa-legend-mark.bar {
  border-radius: 1px;
  width: 10px;
  height: 4px;
}

.dsa-legend-mark.point {
  border-radius: 50%;
}

.dsa-legend-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsa-legend-time {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--muted);
  white-space: nowrap;
}
</style>
