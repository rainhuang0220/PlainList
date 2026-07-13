import { describe, expect, it } from 'vitest';
import type { UserProfileTraitRecord } from '@plainlist/shared';
import { extractProfileEvidenceFromReviews } from './extractor';
import { buildUserProfileHints } from './hints';

describe('user profile extraction', () => {
  it('extracts sleep delay and quality tradeoff evidence from daily reviews', () => {
    const evidence = extractProfileEvidenceFromReviews([
      {
        reviewDate: '2026-07-08',
        content: '下午大约睡到三点半起床，但三点半没睡舒服，又多睡了40分钟。下午没硬事，状态反而好些。',
      },
    ]);

    expect(evidence.map((item) => item.traitKey)).toContain('sleep_rest_delay_buffer');
    expect(evidence.map((item) => item.traitKey)).toContain('fuzzy_time_uncertainty');
    expect(evidence.map((item) => item.traitKey)).toContain('rest_quality_tradeoff');
    expect(evidence.every((item) => item.reviewDate === '2026-07-08')).toBe(true);
    expect(evidence.every((item) => item.excerpt.length > 0)).toBe(true);
  });

  it('formats enabled profile traits as concise intake hints', () => {
    const hints = buildUserProfileHints([
      {
        id: 1,
        traitKey: 'sleep_rest_delay_buffer',
        title: '睡眠或休息后延缓冲',
        generatedSummary: '当后续没有硬约束时，排程应预留 30-45 分钟缓冲。',
        userSummary: null,
        effectiveSummary: '当后续没有硬约束时，排程应预留 30-45 分钟缓冲。',
        impactRatio: 0.68,
        confidence: 0.83,
        supportCount: 5,
        enabled: true,
        lastEvidenceDate: '2026-07-08',
        updatedAt: '2026-07-08T00:00:00.000Z',
      } satisfies UserProfileTraitRecord,
    ]);

    expect(hints).toContain('用户画像提示');
    expect(hints).toContain('睡眠或休息后延缓冲');
    expect(hints).toContain('影响 68%');
    expect(hints).toContain('硬约束不得被画像覆盖');
  });
});
