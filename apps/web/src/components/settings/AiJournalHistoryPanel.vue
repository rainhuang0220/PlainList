<template>
  <section class="ai-journal">
    <div class="tabs" role="tablist">
      <button type="button" role="tab" :aria-selected="tab === 'daily'" :class="{ active: tab === 'daily' }" @click="tab = 'daily'">每日小记</button>
      <button type="button" role="tab" :aria-selected="tab === 'weekly'" :class="{ active: tab === 'weekly' }" @click="tab = 'weekly'">每周回顾</button>
    </div>

    <p v-if="loading" class="muted">正在读取 AI 小记…</p>
    <p v-else-if="error" class="muted">暂时无法读取历史记录，请稍后重试。</p>

    <div v-else-if="tab === 'daily'" class="layout" :class="{ 'has-index': daily.length }">
      <ul v-if="daily.length" class="index">
        <li v-for="entry in daily" :key="entry.date">
          <button type="button" :class="{ active: selectedDate === entry.date }" @click="selectedDate = entry.date">
            {{ presentJournalDate(entry.date, today).primary }}
          </button>
        </li>
      </ul>
      <article class="reader">
        <template v-if="selectedDaily">
          <h3>{{ presentJournalDate(selectedDaily.date, today).primary }}</h3>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div class="prose" v-html="renderSafeMarkdown(selectedDaily.summaryMarkdown)" />
        </template>
        <div v-else>
          <p class="muted">{{ emptyDaily.title }}</p>
          <p v-if="emptyDaily.body" class="muted">{{ emptyDaily.body }}</p>
        </div>
      </article>
    </div>

    <div v-else class="layout" :class="{ 'has-index': weekly.length }">
      <ul v-if="weekly.length" class="index">
        <li v-for="week in weekly" :key="week.weekStart">
          <button type="button" :class="{ active: selectedWeek === week.weekStart }" @click="selectedWeek = week.weekStart">
            {{ presentWeekRange(week.weekStart, week.weekEnd) }}
          </button>
        </li>
      </ul>
      <article class="reader">
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
import { presentAiJournalEmpty, presentJournalDate, presentWeekRange } from '@/features/chatgpt-activity/presentAiJournal';
import { useChatgptActivityStore } from '@/features/chatgpt-activity/useChatgptActivityStore';
import { useReviewsStore } from '@/features/reviews/model/useReviewsStore';

const reviews = useReviewsStore();
const activity = useChatgptActivityStore();
const tab = ref<'daily' | 'weekly'>('daily');
const loading = ref(true);
const error = ref('');
const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const selectedDate = ref(today);
const selectedWeek = ref('');
const daily = ref<Array<{
  date: string;
  summaryMarkdown: string;
  activityCount: number;
  conversationCount: number;
  updatedAt?: string;
}>>([]);
const weekly = ref<Array<{
  weekStart: string;
  weekEnd: string;
  narrativeMarkdown?: string;
  content?: { summary?: string };
}>>([]);

const selectedDaily = computed(() => daily.value.find((item) => item.date === selectedDate.value) ?? daily.value[0] ?? null);
const selectedWeekly = computed(() => weekly.value.find((item) => item.weekStart === selectedWeek.value) ?? weekly.value[0] ?? null);
const emptyDaily = computed(() => presentAiJournalEmpty(activity.connection.displayState, 'daily', {
  processed: activity.connection.processed,
  checked: activity.connection.checked,
}));
const emptyWeekly = computed(() => presentAiJournalEmpty(activity.connection.displayState, 'weekly', {
  processed: activity.connection.processed,
  checked: activity.connection.checked,
}));

onMounted(async () => {
  try {
    await activity.fetchConnection().catch(() => {});
    const result = await reviews.fetchWeeklyHistory();
    daily.value = result.daily ?? [];
    weekly.value = result.weekly ?? [];
    if (daily.value[0]) selectedDate.value = daily.value[0].date;
    if (weekly.value[0]) selectedWeek.value = weekly.value[0].weekStart;
  } catch {
    error.value = 'unavailable';
  } finally {
    loading.value = false;
  }
});
</script>
<style scoped>
.ai-journal {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  height: 100%;
}
.tabs {
  display: flex;
  gap: 8px;
  flex: 0 0 auto;
}
.tabs button {
  border: 1px solid var(--faint);
  background: transparent;
  color: var(--mid);
  padding: 8px 14px;
  font-size: 12px;
  letter-spacing: 0.06em;
  cursor: pointer;
  border-radius: var(--r);
  font-family: inherit;
}
.tabs button.active {
  background: var(--dark);
  color: var(--surface);
  border-color: var(--dark);
}
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  min-height: 0;
  flex: 1 1 auto;
}
.layout.has-index {
  grid-template-columns: 148px minmax(0, 1fr);
}
.index {
  margin: 0;
  padding: 0;
  list-style: none;
  min-height: 0;
  overflow: auto;
}
.index button {
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-bottom: 1px solid var(--faint);
  background: transparent;
  color: var(--dark);
  text-align: left;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
  border-radius: var(--r);
}
.index button.active {
  font-weight: 600;
  background: var(--surface);
}
.reader {
  min-height: 0;
  overflow: auto;
}
.reader h3 {
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
  .layout,
  .layout.has-index {
    grid-template-columns: 1fr;
    gap: 12px;
  }
  .index {
    display: flex;
    gap: 8px;
    overflow-x: auto;
  }
  .index li {
    flex: 0 0 auto;
  }
  .index button {
    width: auto;
    padding: 8px 14px;
    border: 1px solid var(--faint);
    white-space: nowrap;
    font-size: 12px;
  }
  .index button.active {
    background: var(--dark);
    color: var(--surface);
    border-color: var(--dark);
  }
}
</style>
