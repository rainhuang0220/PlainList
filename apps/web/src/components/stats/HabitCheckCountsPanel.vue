<template>
  <div class="hccp">
    <div class="hccp-title">{{ t('stats.habits.title', '习惯打卡次数') }}</div>
    <div v-if="!items.length" class="hccp-empty">
      {{ t('stats.habits.empty', '本周期暂无习惯完成记录') }}
    </div>
    <ul v-else class="hccp-list">
      <li v-for="item in items" :key="item.planId" class="hccp-row">
        <span class="hccp-name">{{ item.name }}</span>
        <span class="hccp-count">
          {{ t('stats.habits.count', '{count} 天', { count: item.count }) }}
        </span>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { aggregateDurationStats } from '@plainlist/shared'
import { computed } from 'vue'
import { useChecksStore } from '@/features/checks/model/useChecksStore'
import { usePlansStore } from '@/features/plans/model/usePlansStore'
import { useI18nStore } from '@/shared/i18n/useI18nStore'

const props = defineProps({
  from: { type: String, required: true },
  to: { type: String, required: true },
})

const plansStore = usePlansStore()
const checksStore = useChecksStore()
const i18n = useI18nStore()
function t(key, fallback, params) {
  return i18n.t(key, fallback, params)
}

const items = computed(() =>
  aggregateDurationStats({
    plans: plansStore.plans,
    checks: checksStore.checks,
    from: props.from,
    to: props.to,
    // Habit counts stay independent of hour-chart hide/merge prefs.
    prefs: { hiddenPlanIds: [], merges: [] },
  }).habitCounts,
)
</script>

<style scoped>
.hccp {
  margin-top: 1.1rem;
  padding-top: .2rem;
}
.hccp-title {
  font-size: .95rem;
  font-weight: 700;
  margin-bottom: .65rem;
}
.hccp-empty {
  font-size: .8rem;
  color: var(--muted);
}
.hccp-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: .35rem;
}
.hccp-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: .75rem;
  border-bottom: 1px solid var(--faint);
  padding: .45rem 0;
}
.hccp-row:last-child {
  border-bottom: 0;
}
.hccp-name {
  font-size: .82rem;
  font-weight: 600;
}
.hccp-count {
  font-family: var(--mono);
  font-size: .75rem;
  color: var(--mid);
  white-space: nowrap;
}
</style>
