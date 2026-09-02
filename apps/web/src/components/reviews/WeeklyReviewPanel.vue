<template>
  <div class="weekly-review">
    <div v-if="trueEmpty" class="weekly-empty">
      <p class="weekly-empty-title">{{ t('week.summary.no_data', '还没有可回顾的记录') }}</p>
      <p>{{ t('week.summary.no_data_hint', '使用 PlainList、写下日记或连接 ChatGPT 活动记录后，这里会逐渐形成你的周回顾。') }}</p>
    </div>

    <template v-else>
      <article class="weekly-block">
        <h3>{{ t('week.page.previous', '上周回顾') }}</h3>
        <p v-if="previousRange" class="weekly-range">{{ previousRange }}</p>
        <!-- The renderer escapes all input before adding a narrow Markdown allowlist. -->
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div v-if="previousHtml" class="weekly-prose" v-html="previousHtml" />
        <p v-else class="weekly-muted">
          {{ t('week.page.previous_missing', '这是你的第一个自然周，还没有上周回顾。') }}
        </p>
      </article>

      <article class="weekly-block">
        <h3>{{ t('week.page.current', '本周进展') }}</h3>
        <p v-if="currentRange" class="weekly-range">{{ currentRange }}</p>
        <p v-if="updatingNotice" class="weekly-banner">{{ updatingNotice }}</p>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div v-if="currentHtml" class="weekly-prose" v-html="currentHtml" />
        <p v-else-if="isMonday" class="weekly-muted">
          {{ t('week.page.monday_open', '本周刚开始。完成的一天会从明天起出现在这里。') }}
        </p>
        <p v-else-if="dailyJournals.length" class="weekly-muted">
          {{ t('week.page.current_from_daily', '周总结正在更新，下面是已经形成的每日小记。') }}
        </p>
      </article>

      <details v-if="dailyJournals.length" class="weekly-fold">
        <summary>{{ t('week.page.dailies', '本周每日记录') }}</summary>
        <details
          v-for="entry in dailyJournals"
          :key="entry.date"
          class="weekly-day"
        >
          <summary>{{ formatDay(entry.date) }}</summary>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div class="weekly-prose" v-html="renderSafeMarkdown(entry.summaryMarkdown)" />
        </details>
      </details>

      <article v-if="plans.length || nextFocus.length" class="weekly-block">
        <h3>{{ t('week.page.plans', '本周计划 / 下一步') }}</h3>
        <ul>
          <li v-for="item in plans" :key="item.text">{{ item.text }}</li>
          <li v-for="item in nextFocus" :key="item">{{ item }}</li>
        </ul>
      </article>

      <article v-if="weeklyInsight" class="weekly-block weekly-secondary">
        <h3>{{ t('week.intelligence.title', '本周洞察') }}</h3>
        <template v-if="weeklyInsight.outputs?.length">
          <h4>{{ t('week.intelligence.outputs', '本周产出') }}</h4>
          <ul><li v-for="item in weeklyInsight.outputs" :key="item">{{ item }}</li></ul>
        </template>
        <p v-if="weeklyInsight.summary">{{ weeklyInsight.summary }}</p>
        <template v-if="weeklyInsight.openLoops?.length">
          <h4>{{ t('week.intelligence.open_loops', '待完成事项') }}</h4>
          <ul><li v-for="item in weeklyInsight.openLoops" :key="item">{{ item }}</li></ul>
        </template>
        <template v-if="weeklyInsight.suggestedNextFocus?.length">
          <h4>{{ t('week.intelligence.next', '下周焦点') }}</h4>
          <ul><li v-for="item in weeklyInsight.suggestedNextFocus.slice(0, 3)" :key="item">{{ item }}</li></ul>
        </template>
      </article>
    </template>

    <p v-if="runtimeLabel" class="weekly-runtime">{{ runtimeLabel }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { WeeklyReviewPage, WeeklySummaryResponse } from '@plainlist/shared';
import { renderSafeMarkdown } from '@/features/chatgpt-activity/safeMarkdown';
import { useI18nStore } from '@/shared/i18n/useI18nStore';

const props = defineProps<{
  result: WeeklySummaryResponse | null;
  weeklyInsight?: {
    summary?: string;
    outputs?: string[];
    openLoops?: string[];
    suggestedNextFocus?: string[];
  } | null;
}>();

const i18n = useI18nStore();
function t(key: string, fallback: string) {
  return i18n.t(key, fallback);
}

const page = computed<WeeklyReviewPage | null>(() => props.result?.page ?? null);
const trueEmpty = computed(() => (
  page.value ? Boolean(page.value.trueEmpty) : Boolean(props.result && !props.result.content && props.result.notice === 'no_data')
));
const isMonday = computed(() => Boolean(page.value?.isMonday));
const dailyJournals = computed(() => page.value?.currentDailyJournals ?? []);
const plans = computed(() => page.value?.currentPlans ?? []);
const previous = computed(() => page.value?.previousClosedWeek ?? null);
const current = computed(() => page.value?.currentWeek ?? (
  props.result?.content
    ? {
      weekStart: props.result.weekStart,
      weekEnd: props.result.weekEnd,
      status: props.result.status,
      content: props.result.content,
      narrativeMarkdown: props.result.content.narrativeMarkdown || props.result.content.summary,
    }
    : null
));
const nextFocus = computed(() => {
  const fromCurrent = current.value?.content?.nextFocus ?? [];
  const fromPrevious = isMonday.value ? (previous.value?.content?.nextFocus ?? []) : [];
  return [...fromCurrent, ...fromPrevious].filter((item, index, list) => list.indexOf(item) === index);
});

const previousHtml = computed(() => previous.value?.narrativeMarkdown
  ? renderSafeMarkdown(previous.value.narrativeMarkdown)
  : '');
const currentHtml = computed(() => current.value?.narrativeMarkdown
  ? renderSafeMarkdown(current.value.narrativeMarkdown)
  : '');

function formatRange(start?: string, end?: string) {
  if (!start || !end) return '';
  const [, startMonth, startDay] = start.split('-').map(Number);
  const [, endMonth, endDay] = end.split('-').map(Number);
  if (i18n.locale === 'zh-CN') {
    return `${startMonth}月${startDay}日－${endMonth}月${endDay}日`;
  }
  return `${start} – ${end}`;
}

const previousRange = computed(() => formatRange(previous.value?.weekStart, previous.value?.weekEnd));
const currentRange = computed(() => {
  if (isMonday.value) return '';
  const start = current.value?.weekStart || page.value?.currentDailyJournals[0]?.date;
  const end = current.value?.weekEnd || page.value?.currentDailyJournals.at(-1)?.date;
  return formatRange(start, end);
});

const updatingNotice = computed(() => {
  if (current.value?.notice === 'updating' || current.value?.content?.overall === '周总结正在更新') {
    return t('week.summary.updating', '周总结正在更新');
  }
  return '';
});

function formatDay(date: string) {
  const [, month, day] = date.split('-').map(Number);
  return i18n.locale === 'zh-CN' ? `${month} 月 ${day} 日` : date;
}

const runtimeLabel = computed(() => {
  const runtime = page.value?.runtime;
  if (!runtime) return '';
  const weekly = runtime.weeklySource === 'none' || !runtime.weeklyModel
    ? t('week.runtime.weekly_none', '周进展回顾 · 未配置')
    : t('week.runtime.weekly', `周进展回顾 · ${runtime.weeklyProvider} · ${runtime.weeklyModel}${runtime.weeklyHost ? ` · ${runtime.weeklyHost}` : ''}`);
  const activity = t('week.runtime.activity', 'ChatGPT 活动处理 · 本地规则处理');
  return `${weekly}  /  ${activity}`;
});
</script>

<style scoped>
.weekly-review {
  display: grid;
  gap: 1.4rem;
}
.weekly-empty-title {
  margin: 0 0 .4rem;
  font-size: 1.05rem;
  font-weight: 700;
}
.weekly-empty p,
.weekly-muted {
  margin: 0;
  color: var(--mid);
  line-height: 1.65;
}
.weekly-block h3,
.weekly-fold > summary {
  margin: 0 0 .35rem;
  font-family: var(--mono);
  font-size: .62rem;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 600;
}
.weekly-range {
  margin: 0 0 .7rem;
  color: var(--muted);
  font-size: .78rem;
}
.weekly-banner {
  margin: 0 0 .7rem;
  padding: .55rem .75rem;
  border: 1px solid var(--faint);
  border-radius: 8px;
  color: var(--mid);
  font-size: .78rem;
}
.weekly-prose :deep(h2),
.weekly-prose :deep(h3) {
  margin: 1rem 0 .4rem;
  font-size: .95rem;
}
.weekly-prose :deep(p),
.weekly-prose :deep(li) {
  margin: 0 0 .55rem;
  color: var(--dark);
  font-size: .92rem;
  line-height: 1.7;
}
.weekly-prose :deep(ul) {
  padding-left: 1.1rem;
}
.weekly-fold,
.weekly-day {
  border-top: 1px solid var(--faint);
  padding: .85rem 0;
}
.weekly-day {
  border-top: 1px dashed var(--faint);
}
.weekly-fold summary,
.weekly-day summary {
  cursor: pointer;
  color: var(--dark);
}
.weekly-secondary {
  opacity: .92;
}
.weekly-runtime {
  margin: .2rem 0 0;
  color: var(--muted);
  font-family: var(--mono);
  font-size: .62rem;
  letter-spacing: .04em;
}
</style>
