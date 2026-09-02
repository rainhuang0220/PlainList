import {
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
  runtime: WeeklyReviewRuntime;
}): WeeklyReviewPage {
  const window = weeklyReviewPageFor(input.asOfDate);
  const current = input.current ?? (window.isMonday
    ? {
      weekStart: window.currentWeekStart,
      weekEnd: window.currentWeekEnd,
      status: 'ready' as const,
      source: 'deterministic' as const,
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

  return {
    asOfDate: window.asOfDate,
    isMonday: window.isMonday,
    trueEmpty,
    previousClosedWeek: input.previousClosed,
    currentWeek: current,
    currentDailyJournals: input.currentDailyJournals,
    currentPlans: input.currentPlans,
    runtime: input.runtime,
  };
}
