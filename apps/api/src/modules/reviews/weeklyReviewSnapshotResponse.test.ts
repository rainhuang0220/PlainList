import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.hoisted(() => vi.fn());

vi.mock('../../db/pool', () => ({ pool: { query } }));

import { getCurrentWeeklyReviewSnapshot } from './weeklyReviewSnapshot';

const user = { id: 7, username: 'review-reader', isAdmin: false };
const content = {
  overall: '稳定推进',
  summary: '完成了关键任务',
  comparison: '较上周更稳定',
  positive: '有清晰证据',
  concerns: '仍需观察',
  nextFocus: ['继续推进'],
};

function row(status: 'generating' | 'ready' | 'error', errorMessage: string | null = null) {
  return {
    user_id: 7,
    review_as_of_date: '2026-09-01',
    window_start_date: '2026-08-31',
    window_end_date: '2026-08-31',
    status,
    content_json: status === 'ready' ? JSON.stringify(content) : null,
    generated_at: status === 'ready' ? '2026-09-01T00:10:00.000Z' : null,
    model: status === 'ready' ? 'safe-model' : null,
    provider: status === 'ready' ? 'openai' : null,
    error_message: errorMessage,
    attempt_count: status === 'error' ? 2 : 1,
  };
}

describe('current weekly review response', () => {
  beforeEach(() => vi.clearAllMocks());

  it('never exposes a terminal scheduler error when no ready fallback exists', async () => {
    query
      .mockResolvedValueOnce([[row('error', 'review generation lease expired after maximum attempts')]])
      .mockResolvedValueOnce([[]]);

    const result = await getCurrentWeeklyReviewSnapshot(user);

    expect(result.reason).toBe('本期回顾暂不可用');
    expect(JSON.stringify(result)).not.toContain('lease expired');
  });

  it('marks a previous-ready response as updating while today is generating', async () => {
    query
      .mockResolvedValueOnce([[row('generating')]])
      .mockResolvedValueOnce([[{ ...row('ready'), review_as_of_date: '2026-08-31' }]]);

    const result = await getCurrentWeeklyReviewSnapshot(user);

    expect(result).toMatchObject({ status: 'ready', fallback: true, notice: 'updating', content });
  });

  it('marks a previous-ready response as not updated after today reaches terminal error', async () => {
    query
      .mockResolvedValueOnce([[row('error', 'provider HTTP 401 secret detail')]])
      .mockResolvedValueOnce([[{ ...row('ready'), review_as_of_date: '2026-08-31' }]]);

    const result = await getCurrentWeeklyReviewSnapshot(user);

    expect(result).toMatchObject({ status: 'ready', fallback: true, notice: 'not_updated', content });
    expect(JSON.stringify(result)).not.toContain('401');
  });

  it('returns today\'s ready snapshot without a fallback notice', async () => {
    query.mockResolvedValueOnce([[row('ready')]]);

    const result = await getCurrentWeeklyReviewSnapshot(user);

    expect(result).toMatchObject({ status: 'ready', fallback: false, content });
    expect(result.notice).toBeUndefined();
  });
});
