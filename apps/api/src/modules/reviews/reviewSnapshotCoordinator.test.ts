import { describe, expect, it, vi } from 'vitest';
import type { WeeklySummaryContent } from '@plainlist/shared';
import {
  createReviewSnapshotCoordinator,
  type ReviewSnapshot,
  type ReviewSnapshotRepository,
} from './reviewSnapshotCoordinator';

const content: WeeklySummaryContent = {
  overall: '稳定推进。',
  summary: '完成了关键任务。',
  comparison: '与上周相比更稳定。',
  positive: '有明确完成记录。',
  concerns: '仍需持续观察。',
  nextFocus: ['保持推进'],
};

function createRepository(): ReviewSnapshotRepository {
  const records = new Map<string, ReviewSnapshot>();
  const key = (userId: number, reviewAsOfDate: string) => `${userId}:${reviewAsOfDate}`;

  return {
    async ensure(input) {
      const recordKey = key(input.userId, input.reviewAsOfDate);
      if (!records.has(recordKey)) {
        records.set(recordKey, { ...input, status: 'pending', content: null, generatedAt: null, model: null, provider: null, errorMessage: null });
      }
      return records.get(recordKey)!;
    },
    async find(userId, reviewAsOfDate) {
      return records.get(key(userId, reviewAsOfDate)) ?? null;
    },
    async claim(userId, reviewAsOfDate) {
      const snapshot = records.get(key(userId, reviewAsOfDate));
      if (!snapshot || !['pending', 'error'].includes(snapshot.status)) return null;
      snapshot.status = 'generating';
      return 'test-claim-token';
    },
    async complete(userId, reviewAsOfDate, _claimToken, result) {
      const snapshot = records.get(key(userId, reviewAsOfDate))!;
      Object.assign(snapshot, { status: 'ready', ...result, errorMessage: null });
      return snapshot;
    },
    async fail(userId, reviewAsOfDate, _claimToken, errorMessage) {
      const snapshot = records.get(key(userId, reviewAsOfDate))!;
      snapshot.status = 'error';
      snapshot.errorMessage = errorMessage;
      return snapshot;
    },
    async latestReady(userId) {
      return [...records.values()].filter((item) => item.userId === userId && item.status === 'ready').at(-1) ?? null;
    },
    async findByWindow(userId, windowStartDate, windowEndDate) {
      return [...records.values()].find((item) => (
        item.userId === userId
        && item.windowStartDate === windowStartDate
        && item.windowEndDate === windowEndDate
        && item.status === 'ready'
      )) ?? null;
    },
    async listClosedWeeks(userId) {
      return [...records.values()].filter((item) => item.userId === userId && item.status === 'ready');
    },
    async markDirty(userId, reviewAsOfDate) {
      const snapshot = records.get(key(userId, reviewAsOfDate));
      if (snapshot && (snapshot.status === 'ready' || snapshot.status === 'error')) {
        snapshot.status = 'pending';
        snapshot.attemptCount = 0;
      }
    },
    async expireExhaustedLeases() {},
  };
}

describe('review snapshot coordinator', () => {
  it('creates only one same-day logical snapshot when scheduler and startup catch-up race', async () => {
    const generate = vi.fn().mockResolvedValue({ content, model: 'demo', provider: 'openai' });
    const coordinator = createReviewSnapshotCoordinator({
      repository: createRepository(),
      generate,
      now: () => new Date('2026-09-01T00:00:00.000Z'),
    });

    const [scheduler, catchUp] = await Promise.all([
      coordinator.generate({ id: 7, username: 'rain', isAdmin: false }, '2026-09-01'),
      coordinator.generate({ id: 7, username: 'rain', isAdmin: false }, '2026-09-01'),
    ]);

    expect(generate).toHaveBeenCalledTimes(1);
    expect([scheduler.status, catchUp.status]).toContain('ready');
    expect(await coordinator.read(7, '2026-09-01')).toMatchObject({
      status: 'ready',
      reviewAsOfDate: '2026-09-01',
      windowStartDate: '2026-08-31',
      windowEndDate: '2026-08-31',
    });
  });

  it('keeps a ready same-day snapshot immutable across repeated reads and source changes', async () => {
    const generate = vi.fn().mockResolvedValue({ content, model: 'demo', provider: 'openai' });
    const coordinator = createReviewSnapshotCoordinator({
      repository: createRepository(),
      generate,
      now: () => new Date('2026-09-02T00:00:00.000Z'),
    });
    const user = { id: 7, username: 'rain', isAdmin: false };

    await coordinator.generate(user, '2026-09-02');
    const reads = await Promise.all(Array.from({ length: 10 }, () => coordinator.read(user.id, '2026-09-02')));

    expect(reads.every((snapshot) => snapshot?.status === 'ready')).toBe(true);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('preserves yesterday\'s snapshot and creates a distinct Monday final review after midnight', async () => {
    const generate = vi.fn().mockResolvedValue({ content, model: 'demo', provider: 'openai' });
    const coordinator = createReviewSnapshotCoordinator({
      repository: createRepository(),
      generate,
      now: () => new Date('2026-09-07T00:00:00.000Z'),
    });
    const user = { id: 7, username: 'rain', isAdmin: false };

    const sunday = await coordinator.generate(user, '2026-09-06');
    const monday = await coordinator.generate(user, '2026-09-07');

    expect(sunday).toMatchObject({ windowStartDate: '2026-08-31', windowEndDate: '2026-09-05' });
    expect(monday).toMatchObject({ windowStartDate: '2026-08-31', windowEndDate: '2026-09-06' });
    expect(await coordinator.read(user.id, '2026-09-06')).toMatchObject({ reviewAsOfDate: '2026-09-06' });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('allows one controlled regeneration of a closed week after late Sunday evidence arrives', async () => {
    const generate = vi.fn()
      .mockResolvedValueOnce({ content, model: 'demo', provider: 'openai' })
      .mockResolvedValueOnce({
        content: { ...content, summary: '补回了周日日记后的最终周总结。' },
        model: 'demo',
        provider: 'openai',
      });
    const coordinator = createReviewSnapshotCoordinator({
      repository: createRepository(),
      generate,
      now: () => new Date('2026-09-07T00:30:00.000Z'),
    });
    const user = { id: 7, username: 'rain', isAdmin: false };

    await coordinator.generate(user, '2026-09-07');
    const regenerated = await coordinator.generate(user, '2026-09-07', { force: true });

    expect(generate).toHaveBeenCalledTimes(2);
    expect(regenerated).toMatchObject({
      status: 'ready',
      windowStartDate: '2026-08-31',
      windowEndDate: '2026-09-06',
      content: { summary: '补回了周日日记后的最终周总结。' },
    });
  });
});
