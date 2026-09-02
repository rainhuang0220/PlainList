<template>
  <section class="journal-history">
    <div class="tabs">
      <button type="button" :class="{ active: tab === 'daily' }" @click="tab = 'daily'">每日小记</button>
      <button type="button" :class="{ active: tab === 'weekly' }" @click="tab = 'weekly'">每周回顾</button>
    </div>

    <p v-if="loading" class="muted">正在读取 AI 小记…</p>
    <p v-else-if="error" class="muted">暂时无法读取历史记录，请稍后重试。</p>

    <template v-else-if="tab === 'daily'">
      <label class="picker">
        <span>日期</span>
        <input v-model="selectedDate" type="date" :max="today" />
      </label>
      <ul class="index">
        <li v-for="entry in daily" :key="entry.date">
          <button type="button" :class="{ active: selectedDate === entry.date }" @click="selectedDate = entry.date">
            {{ formatDay(entry.date) }}
            <small>{{ entry.activityCount }} 条活动</small>
          </button>
        </li>
      </ul>
      <p v-if="!daily.length" class="muted">还没有每日小记。连接 ChatGPT 活动记录后，这里会按天出现。</p>
      <article v-else-if="selectedDaily" class="article">
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div class="prose" v-html="renderSafeMarkdown(selectedDaily.summaryMarkdown)" />
      </article>
    </template>

    <template v-else>
      <ul class="index">
        <li v-for="week in weekly" :key="week.weekStart">
          <button type="button" :class="{ active: selectedWeek === week.weekStart }" @click="selectedWeek = week.weekStart">
            {{ weekLabel(week.weekStart, week.weekEnd) }}
            <small>{{ week.weekStart }} → {{ week.weekEnd }}</small>
          </button>
        </li>
      </ul>
      <p v-if="!weekly.length" class="muted">还没有已结束的周回顾。每个自然周结束后，这里会留下一篇约 500 字的总结。</p>
      <article v-else-if="selectedWeekly" class="article">
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div class="prose" v-html="renderSafeMarkdown(selectedWeekly.narrativeMarkdown || selectedWeekly.content?.summary || '')" />
      </article>
    </template>
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { renderSafeMarkdown } from '@/features/chatgpt-activity/safeMarkdown';
import { useReviewsStore } from '@/features/reviews/model/useReviewsStore';

const reviews = useReviewsStore();
const tab = ref<'daily' | 'weekly'>('daily');
const loading = ref(true);
const error = ref('');
const today = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
const selectedDate = ref(today);
const selectedWeek = ref('');
const daily = ref<Array<{ date: string; summaryMarkdown: string; activityCount: number; conversationCount: number }>>([]);
const weekly = ref<Array<{
  weekStart: string;
  weekEnd: string;
  narrativeMarkdown?: string;
  content?: { summary?: string };
}>>([]);

const selectedDaily = computed(() => daily.value.find((item) => item.date === selectedDate.value) ?? daily.value[0] ?? null);
const selectedWeekly = computed(() => weekly.value.find((item) => item.weekStart === selectedWeek.value) ?? weekly.value[0] ?? null);

function formatDay(date: string) {
  const [, month, day] = date.split('-').map(Number);
  return `${Number(month)} 月 ${Number(day)} 日`;
}

function isoWeek(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()} W${String(week).padStart(2, '0')}`;
}

function weekLabel(start: string, end: string) {
  const [, startMonth, startDay] = start.split('-').map(Number);
  const [, endMonth, endDay] = end.split('-').map(Number);
  return `${isoWeek(start)}  ·  ${Number(startMonth)}/${Number(startDay)}–${Number(endMonth)}/${Number(endDay)}`;
}

onMounted(async () => {
  try {
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
.journal-history {
  display: grid;
  gap: 16px;
  max-width: 680px;
}
.tabs {
  display: flex;
  gap: 8px;
}
.tabs button,
.index button {
  border: 1px solid var(--faint);
  background: var(--surface);
  color: var(--mid);
  border-radius: 999px;
  padding: 7px 12px;
  cursor: pointer;
}
.tabs button.active,
.index button.active {
  background: var(--dark);
  color: var(--bg);
  border-color: var(--dark);
}
.index {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 220px;
  overflow: auto;
}
.index button {
  width: 100%;
  display: flex;
  justify-content: space-between;
  border-radius: 10px;
  text-align: left;
}
.picker {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  font-weight: 700;
}
.picker input {
  padding: 7px 9px;
  border: 1px solid var(--faint);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
}
.article {
  padding-top: 8px;
}
.muted {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.6;
}
.prose :deep(h2),
.prose :deep(h3) {
  margin: 1rem 0 .4rem;
}
.prose :deep(p),
.prose :deep(li) {
  font-size: 13px;
  line-height: 1.75;
}
</style>
