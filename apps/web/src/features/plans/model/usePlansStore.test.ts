import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() }));
const syncFromPlans = vi.fn();

vi.mock('@/shared/api/useApi', () => ({ useApi: () => api }));
vi.mock('@/shared/notifications', () => ({ getNotificationScheduler: () => ({ syncFromPlans, clearAll: vi.fn() }) }));

import { usePlansStore } from './usePlansStore';

describe('usePlansStore add', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    syncFromPlans.mockResolvedValue(undefined);
    setActivePinia(createPinia());
  });

  it('creates a task with exactly one non-retried POST and reconciles the returned record', async () => {
    api.post.mockResolvedValueOnce({ id: 9, type: 'todo', name: '实验', time: '09:00', sortOrder: 0, scheduledDate: '2026-09-01' });
    const store = usePlansStore();

    await store.add('实验', 'todo', '09:00', '2026-09-01');

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/plans', { name: '实验', type: 'todo', time: '09:00', scheduledDate: '2026-09-01' });
    expect(store.plans).toHaveLength(1);
  });

  it('rejects a timed-out request without creating a phantom local task, so the UI can clear loading and let the user retry', async () => {
    api.post.mockRejectedValueOnce(new Error('请求超时。'));
    const store = usePlansStore();

    await expect(store.add('实验', 'habit', '09:00')).rejects.toThrow('请求超时。');

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(store.plans).toEqual([]);
  });
});
