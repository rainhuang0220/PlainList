import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
vi.mock('../../db/pool', () => ({ pool: { query: (...args: unknown[]) => query(...args) } }));

import { analyzeUserProfile, loadProfileCorpus, updateUserProfileTrait } from './service';

const admin = { id: 2, username: 'owner', isAdmin: true };
const user = { id: 7, username: 'reader', isAdmin: false };

function emptyQueries() {
  query.mockImplementation(async (sql: string) => {
    expect(String(sql)).not.toMatch(/INTERVAL\s+60|DATE_SUB\s*\(/i);
    if (/INSERT INTO user_profile_runs/i.test(String(sql))) return [{ insertId: 1 }];
    if (/INSERT INTO user_profile_traits|INSERT IGNORE INTO user_profile_evidence|UPDATE user_profile_traits|DELETE FROM user_profile_evidence/i.test(String(sql))) {
      return [{ affectedRows: 1, insertId: 1 }];
    }
    if (/SELECT id FROM user_profile_traits/i.test(String(sql))) return [[{ id: 1 }]];
    return [[]];
  });
}

describe('user profile self-write and history scope', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('loads all available history without a 60-day cutoff', async () => {
    emptyQueries();
    await loadProfileCorpus(2);
    const sql = query.mock.calls.map(([statement]) => String(statement)).join('\n');
    expect(sql).toMatch(/activity_goals/);
    expect(sql).toMatch(/daily_reviews/);
    expect(sql).toMatch(/chatgpt_daily_journals/);
    expect(sql).toMatch(/activity_facts/);
    expect(sql).not.toMatch(/INTERVAL\s+60|DATE_SUB\s*\(/i);
    expect(sql).not.toMatch(/BETWEEN \? AND \?/);
  });

  it('lets an admin generate and persist their own profile', async () => {
    emptyQueries();
    const result = await analyzeUserProfile(admin, {});
    expect(result.ok).toBe(true);
    const deleted = query.mock.calls.find(([sql]) => /DELETE FROM user_profile_evidence/i.test(String(sql)));
    expect(deleted?.[1]?.[0]).toBe(2);
    expect(JSON.stringify(query.mock.calls)).not.toContain('99');
  });

  it('lets a normal user generate their own profile', async () => {
    emptyQueries();
    const result = await analyzeUserProfile(user, { days: 60 });
    expect(result.ok).toBe(true);
    expect(query.mock.calls.some(([sql]) => /INTERVAL\s+60|DATE_SUB\s*\(/i.test(String(sql)))).toBe(false);
  });

  it('rejects a caller-supplied userId', async () => {
    await expect(analyzeUserProfile(user, { userId: 99 })).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('lets an admin update their own trait and still scopes the write to session user id', async () => {
    query
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{
        id: 4, trait_key: 'user_portrait', title: '用户画像', generated_summary: '长期做 PlainList',
        user_summary: '继续做 PlainList', impact_ratio: 0.5, confidence: 0.5, support_count: 1, enabled: 1,
        last_evidence_date: '2026-09-01', updated_at: '2026-09-02T00:00:00.000Z',
      }]])
      .mockResolvedValueOnce([[]]);

    const updated = await updateUserProfileTrait(admin, { id: 4 }, { userSummary: '继续做 PlainList' });
    expect(updated.userSummary).toBe('继续做 PlainList');
    const updateCall = query.mock.calls.find(([sql]) => /UPDATE user_profile_traits SET/i.test(String(sql)));
    expect(updateCall?.[1]?.at(-1)).toBe(2);
    expect(JSON.stringify(query.mock.calls)).not.toContain('99');
  });
});
