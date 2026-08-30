import { describe, expect, it } from 'vitest';
import { weeklyIntelligenceContentSchema } from './activity-insights';

describe('activity intelligence contracts', () => {
  it('uses discrete evidence-backed dimensions instead of numeric scores', () => {
    expect(weeklyIntelligenceContentSchema.parse({
      progress: 'advanced', alignment: 'supporting', output: 'produced', exploration: 'explored', opportunityCost: 'not_observed',
      summary: '形成可运行产物。', outputs: ['vertical slice'], openLoops: [], suggestedNextFocus: ['继续验证'], evidenceFactIds: [1], unknowns: [],
    }).alignment).toBe('supporting');
    expect(() => weeklyIntelligenceContentSchema.parse({
      progress: 'advanced', alignment: '83%', output: 'produced', exploration: 'explored', opportunityCost: 'not_observed', summary: 'x', outputs: [], openLoops: [], suggestedNextFocus: [], evidenceFactIds: [], unknowns: [],
    })).toThrow();
  });
});
