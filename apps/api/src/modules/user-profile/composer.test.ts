import { describe, expect, it } from 'vitest';
import { composeUserPortrait, recencyWeight, resolveContradictions, scoreFact, type ProfileFact } from './composer';

const today = '2026-09-02';

function fact(partial: Partial<ProfileFact> & Pick<ProfileFact, 'kind' | 'text'>): ProfileFact {
  return {
    date: '2026-08-01',
    baseWeight: 0.7,
    ...partial,
  };
}

describe('user portrait composition', () => {
  it('keeps a long-running preference that has not been mentioned in 60 days', () => {
    const facts: ProfileFact[] = [
      fact({ kind: 'preference', text: '长期用 DashScope 的 qwen 做周报', date: '2026-06-01', explicit: true, baseWeight: 0.95 }),
      fact({ kind: 'activity', text: '临时问了一下天气 API', date: '2026-09-01', baseWeight: 0.4 }),
    ];
    const portrait = composeUserPortrait(facts, today);
    expect(portrait.markdown).toContain('DashScope');
    expect(recencyWeight('2026-06-01', today)).toBeGreaterThan(0.4);
    expect(scoreFact(facts[0], today)).toBeGreaterThan(scoreFact(facts[1], today));
  });

  it('lets a later explicit statement replace an older preference', () => {
    const resolved = resolveContradictions([
      fact({ kind: 'preference', text: '默认用 DeepSeek', date: '2026-05-01', explicit: true, baseWeight: 0.9 }),
      fact({ kind: 'preference', text: '默认用 qwen3.7-plus', date: '2026-08-20', explicit: true, baseWeight: 0.9 }),
    ]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].text).toContain('qwen3.7-plus');
    const portrait = composeUserPortrait(resolved, today);
    expect(portrait.markdown).toContain('qwen3.7-plus');
    expect(portrait.markdown).not.toContain('DeepSeek');
  });

  it('omits empty sections and avoids psychological labels', () => {
    const portrait = composeUserPortrait([
      fact({ kind: 'goal', text: '把 PlainList 做成可用的个人时间工具', date: '2026-08-01', explicit: true, baseWeight: 0.95 }),
      fact({ kind: 'activity', text: '完成 PlainList 2.4.1 周回顾修复', date: '2026-09-01', baseWeight: 0.7 }),
    ], today);
    expect(portrait.markdown).toContain('## 长期目标');
    expect(portrait.markdown).toContain('PlainList');
    expect(portrait.markdown).not.toContain('完美主义');
    expect(portrait.sections.every((section) => section.body.trim().length > 0)).toBe(true);
  });
});
