import { describe, expect, it, vi } from 'vitest';
import { createMysqlReviewSnapshotRepository } from './reviewSnapshotRepository';

const row = {
  user_id: 7,
  review_as_of_date: '2026-09-01',
  window_start_date: '2026-08-31',
  window_end_date: '2026-08-31',
  status: 'ready',
  content_json: JSON.stringify({
    overall: '稳定推进。', summary: '完成了关键任务。', comparison: '更稳定。', positive: '完成有记录。', concerns: '继续观察。', nextFocus: ['保持推进'],
  }),
  generated_at: '2026-09-01T00:00:00.000Z',
  model: 'demo',
  provider: 'openai',
  error_message: null,
};

describe('MySQL review snapshot repository', () => {
  it('claims one database-unique user/as-of-date record rather than creating another record', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[row]]);
    const repository = createMysqlReviewSnapshotRepository(query);

    const snapshot = await repository.ensure({
      userId: 7,
      reviewAsOfDate: '2026-09-01',
      windowStartDate: '2026-08-31',
      windowEndDate: '2026-08-31',
    });

    expect(query.mock.calls[0]?.[0]).toContain('INSERT INTO weekly_review_snapshots');
    expect(query.mock.calls[0]?.[0]).toContain('ON DUPLICATE KEY UPDATE review_as_of_date = VALUES(review_as_of_date)');
    expect(query.mock.calls[0]?.[1]).toEqual([7, '2026-09-01', '2026-08-31', '2026-08-31']);
    expect(snapshot).toMatchObject({ status: 'ready', reviewAsOfDate: '2026-09-01' });
  });

  it('atomically claims retryable or expired generating work but never overwrites a ready snapshot', async () => {
    const query = vi.fn().mockResolvedValue([{ affectedRows: 1 }]);
    const repository = createMysqlReviewSnapshotRepository(query);

    await expect(repository.claim(7, '2026-09-01')).resolves.toEqual(expect.any(String));
    expect(query.mock.calls[0]?.[0]).toContain("status IN ('pending', 'error')");
    expect(query.mock.calls[0]?.[0]).toContain("status = 'generating' AND lease_expires_at < UTC_TIMESTAMP()");
    expect(query.mock.calls[0]?.[0]).toContain("SET status = 'generating'");
    expect(query.mock.calls[0]?.[0]).toContain('claim_token = ?');
    expect(query.mock.calls[0]?.[0]).toContain('lease_expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 6 MINUTE)');
    expect(query.mock.calls[0]?.[0]).toContain('attempt_count < 2');
  });

  it('persists the generated intelligence together with its evidence and prompt metadata', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[row]]);
    const repository = createMysqlReviewSnapshotRepository(query);

    await repository.complete(7, '2026-09-01', 'claim-token', {
      content: JSON.parse(row.content_json),
      generatedAt: '2026-09-01T00:00:00.000Z',
      model: 'demo',
      provider: 'openai',
      evidence: { days: [{ date: '2026-08-31' }] },
      evidenceHash: 'a'.repeat(64),
      promptVersion: 'weekly-summary-v1',
    });

    expect(query.mock.calls[0]?.[0]).toContain('evidence_json = ?');
    expect(query.mock.calls[0]?.[0]).toContain('prompt_version = ?');
    expect(query.mock.calls[0]?.[0]).toContain('claim_token = NULL, lease_expires_at = NULL');
    expect(query.mock.calls[0]?.[0]).toContain('AND claim_token = ?');
    expect(query.mock.calls[0]?.[1]).toEqual(expect.arrayContaining([
      JSON.stringify({ days: [{ date: '2026-08-31' }] }),
      'a'.repeat(64),
      'weekly-summary-v1',
    ]));
  });

  it('does not let an expired claim token mark a newer generation as failed', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([{ affectedRows: 0 }])
      .mockResolvedValueOnce([[row]]);
    const repository = createMysqlReviewSnapshotRepository(query);

    await repository.fail(7, '2026-09-01', 'expired-claim-token', 'old worker failed');

    expect(query.mock.calls[0]?.[0]).toContain("status = 'generating' AND claim_token = ?");
    expect(query.mock.calls[0]?.[1]).toContain('expired-claim-token');
  });

  it('marks a ready closed week dirty so late Sunday journals can regenerate once', async () => {
    const query = vi.fn().mockResolvedValue([{ affectedRows: 1 }]);
    const repository = createMysqlReviewSnapshotRepository(query);

    await repository.markDirty(7, '2026-09-07');

    expect(query.mock.calls[0]?.[0]).toContain("SET status = 'pending', attempt_count = 0");
    expect(query.mock.calls[0]?.[0]).toContain("status IN ('ready', 'error')");
    expect(query.mock.calls[0]?.[1]).toEqual([7, '2026-09-07']);
  });

  it('expires an exhausted stale lease instead of leaving it generating forever', async () => {
    const query = vi.fn().mockResolvedValue([{ affectedRows: 1 }]);
    const repository = createMysqlReviewSnapshotRepository(query);

    await repository.expireExhaustedLeases();

    expect(query.mock.calls[0]?.[0]).toContain("status = 'generating'");
    expect(query.mock.calls[0]?.[0]).toContain('lease_expires_at <= UTC_TIMESTAMP()');
    expect(query.mock.calls[0]?.[0]).toContain('attempt_count >= 2');
    expect(query.mock.calls[0]?.[0]).toContain("SET status = 'error'");
  });
});
