<template>
  <section class="weekly-insight">
    <p v-if="loading" class="muted">正在读取周度洞察…</p>
    <p v-else-if="error" class="muted">暂时无法读取历史记录，请稍后重试。</p>

    <div v-else class="frame">
      <nav v-if="weekly.length" class="weeks" aria-label="历史周">
        <button
          v-for="week in weekly"
          :key="week.weekStart"
          type="button"
          :class="{ active: selectedWeek === week.weekStart }"
          @click="selectedWeek = week.weekStart"
        >
          {{ presentWeekRange(week.weekStart, week.weekEnd) }}
        </button>
      </nav>
      <article class="article">
        <template v-if="selectedWeekly">
          <h3>{{ presentWeekRange(selectedWeekly.weekStart, selectedWeekly.weekEnd) }}</h3>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div class="prose" v-html="renderSafeMarkdown(selectedWeekly.narrativeMarkdown || selectedWeekly.content?.summary || '')" />
        </template>
        <div v-else>
          <p class="muted">{{ emptyWeekly.title }}</p>
          <p v-if="emptyWeekly.body" class="muted">{{ emptyWeekly.body }}</p>
        </div>
      </article>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { renderSafeMarkdown } from '@/features/chatgpt-activity/safeMarkdown';
import { presentAiJournalEmpty, presentWeekRange } from '@/features/chatgpt-activity/presentAiJournal';
import { useChatgptActivityStore } from '@/features/chatgpt-activity/useChatgptActivityStore';
import { useReviewsStore } from '@/features/reviews/model/useReviewsStore';

const reviews = useReviewsStore();
const activity = useChatgptActivityStore();
const loading = ref(true);
const error = ref('');
const selectedWeek = ref('');
const weekly = ref<Array<{
  weekStart: string;
  weekEnd: string;
  narrativeMarkdown?: string;
  content?: { summary?: string };
}>>([]);

const selectedWeekly = computed(() => weekly.value.find((item) => item.weekStart === selectedWeek.value) ?? weekly.value[0] ?? null);
const emptyWeekly = computed(() => presentAiJournalEmpty(activity.connection.displayState, {
  processed: activity.connection.processed,
  checked: activity.connection.checked,
}));

onMounted(async () => {
  try {
    await activity.fetchConnection().catch(() => {});
    const result = await reviews.fetchWeeklyHistory();
    weekly.value = result.weekly ?? [];
    if (weekly.value[0]) selectedWeek.value = weekly.value[0].weekStart;
  } catch {
    error.value = 'unavailable';
  } finally {
    loading.value = false;
  }
});
</script>
<style scoped>
.weekly-insight {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
}
.frame {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}
.weeks {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 0;
  overflow: auto;
  padding-right: 12px;
  margin-right: 16px;
  border-right: 1px solid var(--faint);
}
.weeks button {
  display: block;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  background: transparent;
  color: var(--dark);
  text-align: left;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  line-height: 1.45;
  border-radius: var(--r);
  white-space: nowrap;
}
.weeks button.active {
  font-weight: 600;
  background: var(--faint2);
}
.article {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: auto;
}
.article h3 {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--dark);
}
.prose :deep(> :first-child) {
  margin-top: 0;
}
.prose :deep(p),
.prose :deep(li) {
  margin: 0 0 8px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--dark);
}
.prose :deep(h2),
.prose :deep(h3) {
  margin: 16px 0 8px;
  font-size: 14px;
}
.prose :deep(ul) {
  padding-left: 18px;
}
.muted {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--muted);
}
.muted + .muted {
  margin-top: 8px;
}
@media (max-width: 768px) {
  .frame {
    flex-direction: column;
  }
  .weeks {
    flex-direction: row;
    gap: 8px;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 0 0 12px;
    margin: 0 0 12px;
    border-right: 0;
    border-bottom: 1px solid var(--faint);
  }
  .weeks button {
    width: auto;
    padding: 8px 14px;
    border: 1px solid var(--faint);
  }
  .weeks button.active {
    background: var(--dark);
    color: var(--surface);
    border-color: var(--dark);
  }
}
</style>
