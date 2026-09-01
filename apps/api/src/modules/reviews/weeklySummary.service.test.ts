import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WEEKLY_SUMMARY_PROMPT_VERSION, toDateKey } from '@plainlist/shared';

const query = vi.fn();
const listChecks = vi.fn();
const listReviews = vi.fn();
const listUserProfile = vi.fn();
const resolveAiConfigForUser = vi.fn();
const chatComplete = vi.fn();

vi.mock('../../db/pool', () => ({
  pool: { query: (...args: unknown[]) => query(...args) },
}));

vi.mock('../checks/service', () => ({
  listChecks: (...args: unknown[]) => listChecks(...args),
}));

vi.mock('./service', () => ({
  listReviews: (...args: unknown[]) => listReviews(...args),
}));

vi.mock('../user-profile/service', () => ({
  listUserProfile: (...args: unknown[]) => listUserProfile(...args),
}));

vi.mock('../ai-intake/settings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ai-intake/settings')>();
  return {
    ...actual,
    resolveAiConfigForUser: (...args: unknown[]) => resolveAiConfigForUser(...args),
  };
});

vi.mock('../ai-shared/llm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ai-shared/llm')>();
  return {
    ...actual,
    chatComplete: (...args: unknown[]) => chatComplete(...args),
  };
});

import { assembleWeeklyEvidence, sourceHash } from './weeklySummaryCore';
import { generateWeeklySummary, getWeeklySummary } from './weeklySummary';

const user = { id: 3, username: 'rain', isAdmin: false };
const weekStart = '2026-08-24';

const validContent = {
  overall: '本周波动。',
  summary: '日记记录了实验，周六打球。',
  comparison: '与上周相比学习记录减少。',
  positive: '周三实验有日记证据。',
  concerns: '核心投入连续两周下降。',
  next_focus: ['先确认论文实验的下一步'],
};

function expectedHash() {
  return sourceHash(assembleWeeklyEvidence({
    weekStart,
    todayKey: toDateKey(new Date()),
    plans: [],
    checks: {},
    reviews: {},
    profile: [],
  }));
}

function stubLoaders(settingsRows: unknown[] = []) {
  listChecks.mockResolvedValue({});
  listReviews.mockResolvedValue({});
  listUserProfile.mockResolvedValue({ traits: [], lastRun: null });
  query.mockImplementation(async (sql: string) => {
    const text = String(sql);
    if (text.includes('FROM plans')) {
      return [[]];
    }
    if (text.includes('FROM user_settings')) {
      return [settingsRows];
    }
    if (text.includes('INSERT INTO user_settings')) {
      return [{ affectedRows: 1 }];
    }
    return [[]];
  });
}

describe('weekly summary service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns cached summary when weekStart, sourceHash and promptVersion match', async () => {
    const hash = expectedHash();
    stubLoaders([{
      value: JSON.stringify({
        weekStart,
        weekEnd: '2026-08-30',
        sourceHash: hash,
        promptVersion: WEEKLY_SUMMARY_PROMPT_VERSION,
        model: 'cached-model',
        generatedAt: '2026-08-26T00:00:00.000Z',
        content: {
          overall: '缓存。',
          summary: '缓存摘要。',
          comparison: '缓存比较。',
          positive: '缓存肯定。',
          concerns: '缓存问题。',
          nextFocus: ['缓存建议'],
        },
      }),
    }]);

    const result = await getWeeklySummary(user, { weekStart });
    expect(result.status).toBe('ready');
    expect(result.cached).toBe(true);
    expect(result.content?.overall).toBe('缓存。');
    expect(chatComplete).not.toHaveBeenCalled();
  });

  it('does not call the model when API config is missing', async () => {
    stubLoaders([]);
    resolveAiConfigForUser.mockResolvedValue(null);

    const result = await generateWeeklySummary(user, { weekStart });
    expect(result.status).toBe('unavailable');
    expect(result.reason).toBe('本期回顾暂不可用');
    expect(chatComplete).not.toHaveBeenCalled();
  });

  it('returns unavailable when the model throws', async () => {
    stubLoaders([]);
    resolveAiConfigForUser.mockResolvedValue({
      provider: 'openai',
      baseUrl: 'https://example.com/v1',
      model: 'demo',
      apiKey: 'sk-test',
      timeoutMs: 30000,
      anthropicVersion: '2023-06-01',
      source: 'user',
    });
    chatComplete.mockRejectedValue(new Error('upstream failed'));

    const result = await generateWeeklySummary(user, { weekStart });
    expect(result.status).toBe('unavailable');
    expect(chatComplete).toHaveBeenCalledTimes(1);
  });

  it('returns unavailable when the model returns illegal JSON', async () => {
    stubLoaders([]);
    resolveAiConfigForUser.mockResolvedValue({
      provider: 'openai',
      baseUrl: 'https://example.com/v1',
      model: 'demo',
      apiKey: 'sk-test',
      timeoutMs: 30000,
      anthropicVersion: '2023-06-01',
      source: 'user',
    });
    chatComplete.mockResolvedValue({ text: 'not-json', model: 'demo', provider: 'openai' });

    const result = await generateWeeklySummary(user, { weekStart });
    expect(result.status).toBe('unavailable');
    expect(query.mock.calls.some((call) => String(call[0]).includes('INSERT INTO user_settings'))).toBe(false);
  });

  it('writes cache to weekly_ai_summary key and never touches ai_settings', async () => {
    stubLoaders([]);
    resolveAiConfigForUser.mockResolvedValue({
      provider: 'openai',
      baseUrl: 'https://example.com/v1',
      model: 'demo',
      apiKey: 'sk-test',
      timeoutMs: 30000,
      anthropicVersion: '2023-06-01',
      source: 'user',
    });
    chatComplete.mockResolvedValue({
      text: JSON.stringify(validContent),
      model: 'demo',
      provider: 'openai',
    });

    const result = await generateWeeklySummary(user, { weekStart });
    expect(result.status).toBe('ready');
    expect(result.cached).toBe(false);

    const insert = query.mock.calls.find((call) => String(call[0]).includes('INSERT INTO user_settings'));
    expect(insert).toBeTruthy();
    expect(insert?.[1]?.[1]).toBe('weekly_ai_summary:2026-08-24');
    expect(query.mock.calls.every((call) => !String(call[1]?.[1] ?? '').includes('ai_settings'))).toBe(true);
  });

  it('skips the model on generate when cache is still fresh', async () => {
    const hash = expectedHash();
    stubLoaders([{
      value: JSON.stringify({
        weekStart,
        weekEnd: '2026-08-30',
        sourceHash: hash,
        promptVersion: WEEKLY_SUMMARY_PROMPT_VERSION,
        model: 'cached-model',
        generatedAt: '2026-08-26T00:00:00.000Z',
        content: {
          overall: '缓存。',
          summary: '缓存摘要。',
          comparison: '缓存比较。',
          positive: '缓存肯定。',
          concerns: '缓存问题。',
          nextFocus: ['缓存建议'],
        },
      }),
    }]);

    const result = await generateWeeklySummary(user, { weekStart });
    expect(result.status).toBe('ready');
    expect(result.cached).toBe(true);
    expect(chatComplete).not.toHaveBeenCalled();
  });
});
