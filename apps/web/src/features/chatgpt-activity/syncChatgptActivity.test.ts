import { describe, expect, it, vi } from 'vitest';
import { syncChatgptActivity } from './syncChatgptActivity';

describe('automatic ChatGPT activity sync', () => {
  it('checkpoints conversations, reconciles affected days, and never forwards raw messages', async () => {
    const digest = {
      sourceType: 'chatgpt-local-sync', sourceExternalId: 'conversation-1', idempotencyKey: 'conversation-stable-1',
      dateKey: '2026-09-01', occurredAt: '2026-09-01T10:00:00.000Z', summary: 'compact', activities: ['推进工程工作'],
      outputs: [], learnings: [], decisions: [], unresolved: [], localFacts: [{ dateKey: '2026-09-01', category: 'engineering', title: '推进工程工作', completed: false }], candidateGoalRelations: [],
    };
    const scan = vi.fn().mockResolvedValue({ status: 'enabled', checked: 1, changed: 1, skipped: 0, bootstrap: true, digests: [{ hash: 'hash-1', digest }] });
    const acknowledge = vi.fn().mockResolvedValue({ ok: true });
    const postDigest = vi.fn().mockResolvedValue({ factCount: 1, affectedDates: ['2026-09-01'] });
    const reconcile = vi.fn().mockResolvedValue({ journals: [] });

    const result = await syncChatgptActivity({ userScope: 'reader', reason: 'startup', scan, acknowledge, postDigest, reconcile });

    expect(result.activities).toBe(1);
    expect(acknowledge).toHaveBeenNthCalledWith(1, 'reader', [{ conversationId: 'conversation-1', hash: 'hash-1', updatedAt: '2026-09-01T10:00:00.000Z' }], expect.any(Object), { bootstrapComplete: false });
    expect(acknowledge.mock.calls[0][2]).toMatchObject({ processed: 1, journalDays: 1, historicalBootstrap: true, dateFrom: '2026-09-01', dateTo: '2026-09-01' });
    expect(acknowledge).toHaveBeenLastCalledWith('reader', [], expect.any(Object), { bootstrapComplete: true });
    const payload = reconcile.mock.calls[0][0];
    expect(payload.affectedDates).toEqual(['2026-09-01']);
    expect(payload.historicalBootstrap).toBe(true);
    expect(JSON.stringify(payload)).not.toMatch(/messages|transcript|cookie|session/i);
  });

  it('keeps successful checkpoints and leaves bootstrap incomplete when a later provider request fails', async () => {
    const item = (id: string) => ({
      hash: `hash-${id}`,
      digest: { sourceExternalId: id, occurredAt: '2026-09-01T10:00:00.000Z' },
    });
    const scan = vi.fn().mockResolvedValue({
      status: 'enabled', checked: 2, changed: 2, skipped: 0, bootstrap: true,
      digests: [item('one'), item('two')],
    });
    const acknowledge = vi.fn().mockResolvedValue({ ok: true });
    const postDigest = vi.fn().mockImplementation((digest: any) => digest.sourceExternalId === 'one'
      ? Promise.resolve({ factCount: 1, affectedDates: ['2026-09-01'] })
      : Promise.reject(Object.assign(new Error('provider unavailable'), { status: 503 })));

    await expect(syncChatgptActivity({
      userScope: 'reader', reason: 'startup', scan, acknowledge, postDigest,
      reconcile: vi.fn(), sleep: vi.fn().mockResolvedValue(undefined), concurrency: 1,
    })).rejects.toThrow('provider unavailable');

    expect(acknowledge).toHaveBeenCalledTimes(1);
    expect(acknowledge.mock.calls[0][1][0].conversationId).toBe('one');
    expect(postDigest).toHaveBeenCalledTimes(4); // one success + three bounded attempts
  });

  it('can pause a bootstrap after a checkpoint and resume it on the next scan', async () => {
    const controller = new AbortController();
    const digests = ['one', 'two'].map((id) => ({ hash: `hash-${id}`, digest: { sourceExternalId: id, occurredAt: '2026-09-01T10:00:00.000Z' } }));
    const acknowledge = vi.fn().mockImplementation(async () => { controller.abort(); return { ok: true }; });
    const postDigest = vi.fn().mockResolvedValue({ factCount: 1, affectedDates: ['2026-09-01'] });

    await expect(syncChatgptActivity({
      userScope: 'reader', reason: 'startup', signal: controller.signal, concurrency: 1,
      scan: vi.fn().mockResolvedValue({ status: 'enabled', checked: 2, changed: 2, skipped: 0, bootstrap: true, digests }),
      acknowledge, postDigest, reconcile: vi.fn(),
    })).rejects.toMatchObject({ name: 'AbortError' });

    expect(postDigest).toHaveBeenCalledTimes(1);
    expect(acknowledge).toHaveBeenCalledTimes(1);
  });
});
