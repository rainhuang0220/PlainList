import { describe, expect, it } from 'vitest';
import { normalizeDailyFacts, type ChatgptJournalFact } from './dailyNormalize';

function fact(partial: Partial<ChatgptJournalFact> & Pick<ChatgptJournalFact, 'id' | 'title'>): ChatgptJournalFact {
  return {
    sourceId: partial.sourceId ?? partial.id,
    category: partial.category ?? 'engineering',
    outputState: partial.outputState ?? 'partial',
    summary: partial.summary ?? '',
    ...partial,
  };
}

describe('normalizeDailyFacts', () => {
  it('turns extractor keyword titles into complete factual sentences before compose', () => {
    const input = normalizeDailyFacts('2026-09-02', [
      fact({ id: 1, title: '推进PlainList 活动记录 AI小记', outputState: 'partial' }),
      fact({ id: 2, title: '完成PlainList 历史同步', outputState: 'produced' }),
      fact({ id: 3, category: 'research', title: '推进论文 相关工作', outputState: 'partial' }),
    ]);

    expect(input.date).toBe('2026-09-02');
    expect(input.topics.length).toBeGreaterThanOrEqual(2);
    const sentences = input.topics.flatMap((topic) => topic.facts);
    expect(sentences.every((item) => item.endsWith('。'))).toBe(true);
    expect(sentences.every((item) => /当天|今天/.test(item))).toBe(true);
    expect(sentences.join('')).not.toMatch(/推进PlainList 活动记录/);
    expect(sentences.some((item) => /PlainList/.test(item))).toBe(true);
    expect(sentences.some((item) => /论文/.test(item))).toBe(true);
  });

  it('drops DOI, URL, hash and numeric garbage instead of keeping them as facts', () => {
    const input = normalizeDailyFacts('2026-09-01', [
      fact({ id: 1, category: 'research', title: '推进 10.1007 10.1109 2016.2644615', outputState: 'partial' }),
      fact({ id: 2, category: 'research', title: '修改论文相关工作部分', outputState: 'partial' }),
    ]);

    const blob = JSON.stringify(input);
    expect(blob).not.toMatch(/10\.\d{4}/);
    expect(blob).not.toContain('2016.2644615');
    expect(input.topics.some((topic) => topic.name === '论文')).toBe(true);
    expect(input.topics.every((topic) => topic.facts.every((item) => /。$/.test(item)))).toBe(true);
  });

  it('does not treat a discussion or plan as a completion', () => {
    const input = normalizeDailyFacts('2026-09-02', [
      fact({ id: 1, category: 'planning', title: '下周发布计划', outputState: 'unknown' }),
      fact({ id: 2, title: '修复周回顾空状态', outputState: 'produced' }),
      fact({ id: 3, category: 'research', title: '侧信道假设', outputState: 'unknown' }),
    ]);

    const planned = input.topics.find((topic) => topic.status === 'planned');
    const completed = input.topics.find((topic) => topic.status === 'completed');
    const discussed = input.topics.find((topic) => topic.status === 'discussed' || topic.status === 'progress');
    expect(completed).toBeTruthy();
    expect(planned?.facts.join('') ?? discussed?.facts.join('')).not.toMatch(/完成了下周发布计划/);
    expect(JSON.stringify(input)).not.toMatch(/完成了侧信道/);
  });

  it('clusters same-topic fragments and keeps at most a handful of topics', () => {
    const input = normalizeDailyFacts('2026-09-02', [
      fact({ id: 1, title: '推进PlainList 活动记录', outputState: 'partial' }),
      fact({ id: 2, title: '推进PlainList AI小记', outputState: 'partial' }),
      fact({ id: 3, title: '完成PlainList 周回顾', outputState: 'produced' }),
      fact({ id: 4, title: '完成Foreshadow 验收', outputState: 'produced' }),
      fact({ id: 5, title: '推进Foreshadow 核心流程', outputState: 'partial' }),
      fact({ id: 6, category: 'research', title: '推进论文 相关工作', outputState: 'partial' }),
      fact({ id: 7, category: 'learning', title: '推进用户画像', outputState: 'partial' }),
      fact({ id: 8, title: '推进Desktop titlebar', outputState: 'unknown' }),
    ]);

    expect(input.topics.length).toBeLessThanOrEqual(4);
    expect(input.topics.some((topic) => topic.name === 'PlainList')).toBe(true);
    expect(input.topics.filter((topic) => topic.name === 'PlainList')).toHaveLength(1);
  });

  it('drops trivia and keyword dumps that cannot become a factual sentence', () => {
    const input = normalizeDailyFacts('2026-09-01', [
      fact({ id: 1, title: '天气', outputState: 'unknown' }),
      fact({ id: 2, title: '最终产品 是一个本地优先现场场景 数字化工作台 封板结果 工作树干净', outputState: 'produced' }),
      fact({ id: 3, title: '完成 PlainList 桌面同步验收', outputState: 'produced' }),
    ]);

    const blob = JSON.stringify(input);
    expect(blob).not.toMatch(/本地优先现场场景/);
    expect(blob).not.toMatch(/工作树干净/);
    expect(input.topics.some((topic) => /PlainList/.test(topic.name) || topic.facts.some((item) => /PlainList/.test(item)))).toBe(true);
  });
});
