import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}));

vi.mock('@/shared/api/useApi', () => ({
  useApi: () => api,
}));

import { useReviewsStore } from './useReviewsStore';

describe('useReviewsStore weekly summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('loads today\'s saved snapshot through a read-only endpoint', async () => {
    api.get.mockResolvedValueOnce({
      status: 'ready',
      weekStart: '2026-08-24',
      weekEnd: '2026-08-30',
      promptVersion: 'weekly-summary-v1',
      cached: true,
      content: {
        overall: '稳定推进',
        summary: '日记记录了实验',
        comparison: '与上周接近',
        positive: '实验有证据',
        concerns: '无法判断娱乐是否挤压',
        nextFocus: ['继续论文实验'],
      },
    });

    const store = useReviewsStore();
    const result = await store.fetchWeeklySummary();
    expect(api.get).toHaveBeenCalledWith('/reviews/weekly-summary');
    expect(result.status).toBe('ready');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('does not expose a page-triggered generation command', async () => {
    const store = useReviewsStore();
    expect((store as unknown as Record<string, unknown>).generateWeeklySummary).toBeUndefined();
    expect(api.post).not.toHaveBeenCalled();
  });
});

describe('useReviewsStore persist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('PUTs the provided dateKey and does not require it to be today', async () => {
    api.put.mockResolvedValueOnce({ ok: true });
    const store = useReviewsStore();
    await store.persist('2026-08-28', '完成论文实验');
    expect(api.put).toHaveBeenCalledWith('/reviews/2026-08-28', { content: '完成论文实验' });
    expect(store.getReview('2026-08-28')).toBe('完成论文实验');
  });

  it('keeps local content and throws when the server write fails', async () => {
    api.put.mockRejectedValueOnce(new Error('network'));
    const store = useReviewsStore();
    await expect(store.persist('2026-08-28', '未落盘')).rejects.toThrow('network');
    expect(store.getReview('2026-08-28')).toBe('未落盘');
  });
});
