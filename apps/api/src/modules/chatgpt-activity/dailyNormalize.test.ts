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
  it('clusters complete semantic facts without reconstructing lost meaning', () => {
    const input = normalizeDailyFacts('2026-09-02', [
      fact({
        id: 1,
        title: '推进PlainList 活动记录 AI小记',
        summary: '继续推进 PlainList 的 ChatGPT 活动记录和 AI 小记界面调整。',
        outputState: 'partial',
      }),
      fact({
        id: 2,
        title: '完成PlainList 历史同步',
        summary: '完成了 PlainList 历史 Daily Journal 的重新生成。',
        outputState: 'produced',
      }),
      fact({
        id: 3,
        category: 'research',
        title: '推进论文 相关工作',
        summary: '讨论了论文 Related Work 的结构，并核对了几篇参考文献。',
        outputState: 'partial',
      }),
    ]);

    expect(input.date).toBe('2026-09-02');
    const sentences = input.topics.flatMap((topic) => topic.facts);
    expect(sentences.every((item) => item.endsWith('。'))).toBe(true);
    expect(sentences.join('')).not.toMatch(/推进PlainList 活动记录/);
    expect(sentences).toContain('完成了 PlainList 历史 Daily Journal 的重新生成。');
    expect(sentences.some((item) => /Related Work/.test(item))).toBe(true);
  });

  it('drops keyword titles, DOI dumps and extractor residue instead of guessing', () => {
    const input = normalizeDailyFacts('2026-09-01', [
      fact({ id: 1, category: 'research', title: '推进 10.1007 10.1109 2016.2644615', outputState: 'partial' }),
      fact({ id: 2, title: 'Related Work Structure Analysis', outputState: 'partial' }),
      fact({ id: 3, title: '没有可提取的用户活动', outputState: 'unknown' }),
      fact({
        id: 4,
        category: 'research',
        title: '修改论文相关工作部分',
        summary: '修改了论文 Related Work 的结构，并核对了参考文献。',
        outputState: 'partial',
      }),
    ]);

    const blob = JSON.stringify(input);
    expect(blob).not.toMatch(/10\.\d{4}/);
    expect(blob).not.toContain('Related Work Structure Analysis');
    expect(blob).not.toContain('没有可提取的用户');
    expect(input.topics.some((topic) => topic.facts.some((item) => /Related Work/.test(item)))).toBe(true);
  });

  it('does not treat a discussion or plan as a completion', () => {
    const input = normalizeDailyFacts('2026-09-02', [
      fact({
        id: 1,
        category: 'planning',
        title: '下周发布计划',
        summary: '计划了下周的发布安排。',
        outputState: 'unknown',
      }),
      fact({
        id: 2,
        title: '修复周回顾空状态',
        summary: '完成了周回顾空状态的修复。',
        outputState: 'produced',
      }),
      fact({
        id: 3,
        category: 'research',
        title: '侧信道假设',
        summary: '讨论了侧信道假设的适用边界。',
        outputState: 'unknown',
      }),
    ]);

    const planned = input.topics.find((topic) => topic.status === 'planned');
    const completed = input.topics.find((topic) => topic.status === 'completed');
    expect(completed?.facts.join('')).toMatch(/完成了周回顾空状态的修复/);
    expect(planned?.facts.join('') ?? '').toMatch(/计划了下周的发布安排/);
    expect(JSON.stringify(input)).not.toMatch(/完成了下周发布计划/);
    expect(JSON.stringify(input)).not.toMatch(/完成了侧信道/);
  });

  it('keeps at most four ranked topics and drops trivia', () => {
    const input = normalizeDailyFacts('2026-09-02', [
      fact({ id: 1, title: '天气', outputState: 'unknown' }),
      fact({ id: 2, title: '最终产品 是一个本地优先现场场景 数字化工作台 封板结果 工作树干净', outputState: 'produced' }),
      fact({
        id: 3,
        title: '完成 PlainList 桌面同步验收',
        summary: '完成了 PlainList 桌面同步验收。',
        outputState: 'produced',
      }),
      fact({
        id: 4,
        title: 'Foreshadow 验收',
        summary: '完成了 Foreshadow 当前版本验收。',
        outputState: 'produced',
      }),
      fact({
        id: 5,
        category: 'research',
        title: '论文',
        summary: '继续修改论文 Related Work，并核对了部分参考文献。',
        outputState: 'partial',
      }),
      fact({
        id: 6,
        category: 'learning',
        title: '学习 Hugging Face',
        summary: '继续学习 Hugging Face 的模型加载和推理流程。',
        outputState: 'partial',
      }),
      fact({
        id: 7,
        title: 'Desktop titlebar',
        summary: '调整了 Desktop titlebar 的间距。',
        outputState: 'unknown',
      }),
    ]);

    expect(input.topics.length).toBeLessThanOrEqual(4);
    const blob = JSON.stringify(input);
    expect(blob).not.toMatch(/本地优先现场场景/);
    expect(blob).not.toMatch(/"天气"/);
    expect(input.topics.some((topic) => /PlainList/.test(topic.name) || topic.facts.some((item) => /PlainList/.test(item)))).toBe(true);
  });
});
