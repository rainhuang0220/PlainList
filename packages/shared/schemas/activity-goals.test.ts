import { describe, expect, it } from 'vitest';
import { createActivityGoalSchema } from './activity-goals';

describe('activity goal contract', () => {
  it('accepts discrete goal properties but no productivity score', () => {
    expect(createActivityGoalSchema.parse({
      title: '完成 PlainList 研究线',
      priorityRank: 1,
      timeHorizon: 'medium_term',
      status: 'active',
      successSignals: ['提交可运行 vertical slice'],
    })).toMatchObject({ priorityRank: 1, status: 'active' });

    expect(() => createActivityGoalSchema.parse({
      title: 'bad', priorityRank: 1, timeHorizon: 'near_term', status: 'active', productivityScore: 87.5,
    })).toThrow();
  });
});
