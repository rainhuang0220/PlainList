import { describe, expect, it } from 'vitest';
import { buildDailyDigest, buildWeeklyIntelligence } from './projection';

describe('activity intelligence projections', () => {
  it('keeps a daily digest compact and distinguishes output from activity', () => {
    const digest = buildDailyDigest('2026-08-30', [
      { id: 1, category: 'activity', summary: '阅读了 MCP 文档', outputState: 'not_applicable', explorationState: 'explored' },
      { id: 2, category: 'output', summary: '完成 Activity Intelligence vertical slice', outputState: 'produced', explorationState: 'not_applicable' },
    ]);
    expect(digest.mainProgress).toContain('Activity Intelligence');
    expect(digest.outputs).toEqual(['完成 Activity Intelligence vertical slice']);
    expect(JSON.stringify(digest).length).toBeLessThan(2000);
  });

  it('uses daily projections and active goals only, retaining evidence and no numeric score', () => {
    const result = buildWeeklyIntelligence('2026-08-24', [{
      dateKey: '2026-08-30', mainProgress: '完成 vertical slice', outputs: ['完成 vertical slice'], learnings: [], unresolved: [], evidenceFactIds: [2],
    }], [{ id: 8, title: '研究主线', priorityRank: 1, status: 'active' }]);
    expect(result.output).toBe('produced');
    expect(result.evidenceFactIds).toEqual([2]);
    expect(JSON.stringify(result)).not.toMatch(/score|87|percent/i);
  });
});
