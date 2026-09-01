import { describe, expect, it } from 'vitest';
import type { WeeklySummaryResponse } from '@plainlist/shared';
import { presentWeeklyReview } from './weeklyReviewPresentation';

const t = (_key: string, fallback: string) => fallback;
const content = {
  overall: '稳定推进',
  summary: '完成关键任务',
  comparison: '较上周稳定',
  positive: '证据清晰',
  concerns: '继续观察',
  nextFocus: ['继续推进'],
};
const base: WeeklySummaryResponse = {
  status: 'error',
  weekStart: '2026-08-31',
  weekEnd: '2026-08-31',
  promptVersion: 'weekly-summary-v1',
};

describe('weekly review presentation', () => {
  it('ignores raw technical reasons for a terminal response', () => {
    const result = presentWeeklyReview({
      ...base,
      notice: 'unavailable',
      reason: 'review generation lease expired after maximum attempts',
    }, t);

    expect(result).toEqual({ status: 'unavailable', summary: null, message: '本期回顾暂不可用' });
  });

  it('shows a lightweight updating notice over previous-ready content', () => {
    const result = presentWeeklyReview({
      ...base,
      status: 'ready',
      fallback: true,
      notice: 'updating',
      reason: 'provider HTTP 401',
      content,
    }, t);

    expect(result).toEqual({ status: 'ready', summary: content, message: '本期回顾正在更新' });
  });

  it('shows a lightweight not-updated notice over previous-ready content', () => {
    const result = presentWeeklyReview({
      ...base,
      status: 'ready',
      fallback: true,
      notice: 'not_updated',
      content,
    }, t);

    expect(result).toEqual({ status: 'ready', summary: content, message: '本期回顾暂未更新' });
  });
});
