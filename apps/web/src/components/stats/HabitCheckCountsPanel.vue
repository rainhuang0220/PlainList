<template>
  <div class="hccp" :class="{ open: expanded }">
    <button
      type="button"
      class="hccp-toggle"
      :aria-expanded="expanded ? 'true' : 'false'"
      @click="expanded = !expanded"
    >
      <span class="hccp-toggle-main">
        <span class="hccp-chevron" aria-hidden="true">{{ expanded ? '▾' : '▸' }}</span>
        <span class="hccp-title">{{ t('stats.habits.title', '习惯打卡次数') }}</span>
      </span>
      <span class="hccp-summary">
        {{ totalCount > 0
          ? t('stats.habits.summary', '{count} 次', { count: totalCount })
          : t('stats.habits.summary_empty', '暂无') }}
      </span>
    </button>

    <div v-show="expanded" class="hccp-body">
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
  </div>
</template>

<script setup>
import { aggregateDurationStats } from '@plainlist/shared'
import { computed, ref } from 'vue'
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

const expanded = ref(false)

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

const totalCount = computed(() =>
  items.value.reduce((sum, item) => sum + item.count, 0),
)
</script>

<style scoped>
.hccp {
  margin-top: .85rem;
  padding-top: .15rem;
}
.hccp-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: .75rem;
  border: 0;
  background: transparent;
  color: inherit;
  padding: .15rem 0;
  cursor: pointer;
  text-align: left;
}
.hccp-toggle-main {
  display: inline-flex;
  align-items: center;
  gap: .45rem;
  min-width: 0;
}
.hccp-chevron {
  font-size: .7rem;
  color: var(--muted);
  width: .7rem;
}
.hccp-title {
  font-size: .95rem;
  font-weight: 700;
}
.hccp-summary {
  font-family: var(--mono);
  font-size: .75rem;
  color: var(--muted);
  white-space: nowrap;
}
.hccp-body {
  margin-top: .65rem;
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
