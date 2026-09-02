<template>
  <section class="journal-shell">
    <p class="journal-intro">查看由 PlainList 自动整理的每日活动记录与历史周回顾。</p>

    <div class="journal-tabs" role="tablist">
      <button type="button" role="tab" :aria-selected="tab === 'daily'" :class="{ active: tab === 'daily' }" @click="tab = 'daily'">每日小记</button>
      <button type="button" role="tab" :aria-selected="tab === 'weekly'" :class="{ active: tab === 'weekly' }" @click="tab = 'weekly'">每周回顾</button>
    </div>

    <p v-if="loading" class="muted">正在读取 AI 小记…</p>
    <p v-else-if="error" class="muted">暂时无法读取历史记录，请稍后重试。</p>

    <div v-else-if="tab === 'daily'" class="journal-layout">
      <ul v-if="daily.length" class="journal-index">
        <li v-for="entry in daily" :key="entry.date">
          <button type="button" :class="{ active: selectedDate === entry.date }" @click="selectedDate = entry.date">
            <strong>{{ presentJournalDate(entry.date, today).primary }}</strong>
            <small>{{ entry.activityCount }} 条活动</small>
          </button>
        </li>
      </ul>
      <div class="journal-reader">
        <template v-if="selectedDaily">
          <header class="journal-reader-head">
            <h3>{{ presentJournalDate(selectedDaily.date, today).primary }}</h3>
            <p class="journal-meta">
              ChatGPT 活动 · {{ selectedDaily.activityCount }} 条
              <span v-if="selectedDaily.updatedAt"> · 最后更新 {{ formatClock(selectedDaily.updatedAt) }}</span>
            </p>
          </header>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div class="journal-prose" v-html="renderSafeMarkdown(selectedDaily.summaryMarkdown)" />
        </template>
        <div v-else class="journal-empty">
          <p class="journal-empty-title">{{ emptyDaily.title }}</p>
          <p v-if="emptyDaily.body">{{ emptyDaily.body }}</p>
        </div>
      </div>
    </div>

    <div v-else class="journal-layout">
      <ul v-if="weekly.length" class="journal-index">
        <li v-for="week in weekly" :key="week.weekStart">
          <button type="button" :class="{ active: selectedWeek === week.weekStart }" @click="selectedWeek = week.weekStart">
            <strong>{{ presentWeekRange(week.weekStart, week.weekEnd) }}</strong>
          </button>
        </li>
      </ul>
      <div class="journal-reader">
        <template v-if="selectedWeekly">
          <header class="journal-reader-head">
            <h3>{{ presentWeekRange(selectedWeekly.weekStart, selectedWeekly.weekEnd) }}</h3>
            <p class="journal-meta">已结束的一周</p>
          </header>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div class="journal-prose" v-html="renderSafeMarkdown(selectedWeekly.narrativeMarkdown || selectedWeekly.content?.summary || '')" />
        </template>
        <div v-else class="journal-empty">
          <p class="journal-empty-title">{{ emptyWeekly.title }}</p>
          <p v-if="emptyWeekly.body">{{ emptyWeekly.body }}</p>
        </div>
      </div>
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

function formatClock(value: string) {
  try {
    return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

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
.journal-shell {
  display: grid;
  gap: 14px;
  min-width: 0;
}
.journal-intro {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.6;
}
.journal-tabs {
  display: inline-flex;
  width: fit-content;
  padding: 3px;
  border: 1px solid var(--faint);
  border-radius: 999px;
  background: var(--faint2);
  gap: 0;
}
.journal-tabs button {
  border: 0;
  background: transparent;
  color: var(--mid);
  border-radius: 999px;
  padding: 7px 14px;
  cursor: pointer;
  font: inherit;
}
.journal-tabs button.active {
  background: var(--surface);
  color: var(--dark);
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}
.journal-layout {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
  gap: 20px;
  align-items: start;
  min-height: 0;
}
.journal-index {
  display: grid;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: min(560px, calc(100vh - 260px));
  overflow: auto;
}
.journal-index button {
  width: 100%;
  display: grid;
  gap: 2px;
  border: 0;
  background: transparent;
  color: var(--mid);
  border-radius: 10px;
  padding: 10px 12px;
  text-align: left;
  cursor: pointer;
  font: inherit;
}
.journal-index button strong {
  font-size: 13px;
  font-weight: 600;
  color: var(--dark);
}
.journal-index button small {
  color: var(--muted);
  font-size: 11px;
}
.journal-index button.active {
  background: var(--faint2);
}
.journal-reader {
  min-width: 0;
}
.journal-reader-head h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.journal-meta {
  margin: 6px 0 14px;
  color: var(--muted);
  font-size: 12px;
}
.journal-empty {
  padding: 8px 0;
}
.journal-empty-title,
.muted {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.6;
}
.journal-empty p + p,
.journal-empty-title + p {
  margin: 6px 0 0;
}
.journal-prose :deep(> :first-child) {
  margin-top: 0;
}
.journal-prose :deep(> :last-child) {
  margin-bottom: 0;
}
.journal-prose :deep(h2),
.journal-prose :deep(h3) {
  margin: 1rem 0 .4rem;
  font-size: 15px;
}
.journal-prose :deep(p),
.journal-prose :deep(li) {
  font-size: 14px;
  line-height: 1.75;
  color: var(--dark);
}
@media (max-width: 768px) {
  .journal-layout {
    grid-template-columns: 1fr;
  }
  .journal-index {
    display: flex;
    gap: 8px;
    max-height: none;
    overflow-x: auto;
  }
  .journal-index li {
    flex: 0 0 auto;
  }
  .journal-index button {
    white-space: nowrap;
    border: 1px solid var(--faint);
    border-radius: 999px;
    padding: 7px 12px;
  }
}
</style>
