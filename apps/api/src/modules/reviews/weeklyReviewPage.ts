import {
  closedWeekReviewAsOf,
  firstFullClosedWeekStart,
  weeklyReviewPageFor,
  type WeeklyReviewDailyEntry,
  type WeeklyReviewPage,
  type WeeklyReviewPlanItem,
  type WeeklyReviewRuntime,
  type WeeklyReviewSection,
  type WeeklySummaryContent,
  type WeeklySummaryStatus,
} from '@plainlist/shared';

export function narrativeFromContent(content: WeeklySummaryContent | null | undefined): string {
  if (!content) return '';
  if (content.narrativeMarkdown?.trim()) return content.narrativeMarkdown.trim();
  return [content.summary, content.overall, content.positive, content.concerns, content.nextFocus.join('；')]
    .filter((part) => part && part !== '无法判断' && part !== '周总结正在更新')
    .join('\n\n');
}

export function sectionFromSnapshot(input: {
  weekStart: string;
  weekEnd: string;
  status: WeeklySummaryStatus;
  content?: WeeklySummaryContent | null;
  notice?: WeeklyReviewSection['notice'];
  model?: string | null;
  provider?: string | null;
  generatedAt?: string | null;
}): WeeklyReviewSection {
  const content = input.content ?? undefined;
  return {
    weekStart: input.weekStart,
    weekEnd: input.weekEnd,
    status: input.status,
    content,
    narrativeMarkdown: narrativeFromContent(content) || undefined,
    notice: input.notice,
    model: input.model ?? undefined,
    provider: input.provider ?? undefined,
    generatedAt: input.generatedAt ?? undefined,
    source: input.provider === 'deterministic' ? 'deterministic' : content ? 'model' : undefined,
  };
}

export function buildWeeklyReviewPage(input: {
  asOfDate: string;
  previousClosed: WeeklyReviewSection | null;
  current: WeeklyReviewSection | null;
  currentDailyJournals: WeeklyReviewDailyEntry[];
  currentPlans: WeeklyReviewPlanItem[];
  hasHistory: boolean;
  hasPriorHistory?: boolean;
  runtime: WeeklyReviewRuntime;
}): WeeklyReviewPage {
  const window = weeklyReviewPageFor(input.asOfDate);
  const hasPriorHistory = input.hasPriorHistory ?? input.hasHistory;
  const current = input.current ?? (window.isMonday
    ? {
      weekStart: window.currentWeekStart,
      weekEnd: window.currentWeekEnd,
      status: 'ready' as const,
      source: 'deterministic' as const,
    }
    : window.currentCompletedStart && window.currentCompletedEnd
      ? {
        weekStart: window.currentCompletedStart,
        weekEnd: window.currentCompletedEnd,
        status: 'missing' as const,
      }
      : null);

  const hasCurrentMaterial = Boolean(
    current?.content
    || current?.narrativeMarkdown
    || input.currentDailyJournals.length
    || input.currentPlans.length,
  );
  const trueEmpty = !input.hasHistory
    && !input.previousClosed?.content
    && !input.previousClosed?.narrativeMarkdown
    && !hasCurrentMaterial;

  const hasPreviousSummary = Boolean(input.previousClosed?.content || input.previousClosed?.narrativeMarkdown);
  const previousWeekState = hasPreviousSummary
    ? 'summary'
    : (hasPriorHistory ? 'preparing' : 'first_week');

  return {
    asOfDate: window.asOfDate,
    isMonday: window.isMonday,
    trueEmpty,
    hasPriorHistory,
    previousWeekState,
    previousClosedWeek: hasPreviousSummary ? input.previousClosed : (
      previousWeekState === 'preparing'
        ? {
          weekStart: window.previousClosedStart,
          weekEnd: window.previousClosedEnd,
          status: 'missing',
        }
        : null
    ),
    currentWeek: current,
    currentDailyJournals: input.currentDailyJournals,
    currentPlans: input.currentPlans,
    runtime: input.runtime,
  };
}

export function previousWeekCopy(state: WeeklyReviewPage['previousWeekState'] | undefined) {
  if (state === 'preparing') return '上周回顾正在准备';
  if (state === 'first_week') return '这是你的第一个自然周，还没有上周回顾。';
  return '';
}

export function recoverClosedWeekSection(input: {
  weekStart: string;
  weekEnd: string;
  snapshot?: WeeklyReviewSection | null;
  cached?: WeeklyReviewSection | null;
  composed?: WeeklyReviewSection | null;
}): WeeklyReviewSection | null {
  if (input.snapshot?.content || input.snapshot?.narrativeMarkdown) return input.snapshot;
  if (input.cached?.content || input.cached?.narrativeMarkdown) return input.cached;
  if (input.composed?.content || input.composed?.narrativeMarkdown) return input.composed;
  return null;
}

export interface ClosedHistoryWeek {
  weekStart: string;
  weekEnd: string;
  reviewAsOfDate: string;
  status: WeeklySummaryStatus;
  content?: WeeklySummaryContent;
  narrativeMarkdown?: string;
  model?: string | null;
  provider?: string | null;
  generatedAt?: string | null;
}

export function mergeClosedWeeklyHistory(input: {
  asOf: string;
  historicalStart: string;
  limit?: number;
  snapshots?: ClosedHistoryWeek[];
  cached?: ClosedHistoryWeek[];
  fromJournals?: ClosedHistoryWeek[];
  fromDiaries?: ClosedHistoryWeek[];
}): ClosedHistoryWeek[] {
  const firstFull = firstFullClosedWeekStart(input.historicalStart);
  const byStart = new Map<string, ClosedHistoryWeek>();
  const consider = (item?: ClosedHistoryWeek | null) => {
    if (!item?.weekStart || !item.weekEnd) return;
    if (item.weekStart < firstFull) return;
    if (input.asOf < closedWeekReviewAsOf(item.weekEnd)) return;
    if (!item.content && !item.narrativeMarkdown) return;
    if (byStart.has(item.weekStart)) return;
    byStart.set(item.weekStart, item);
  };
  for (const item of input.snapshots ?? []) consider(item);
  for (const item of input.cached ?? []) consider(item);
  for (const item of input.fromJournals ?? []) consider(item);
  for (const item of input.fromDiaries ?? []) consider(item);
  return [...byStart.values()]
    .sort((left, right) => right.weekStart.localeCompare(left.weekStart))
    .slice(0, input.limit ?? 24);
}
