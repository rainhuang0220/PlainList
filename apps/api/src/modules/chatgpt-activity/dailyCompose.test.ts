import { describe, expect, it } from 'vitest';
import { composeDailyJournal, isReadableDailyParagraph } from './dailyCompose';
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

function assertReadable(text: string) {
  expect(isReadableDailyParagraph(text)).toBe(true);
  expect(text).not.toMatch(/^## /);
  expect(text).not.toContain('\n');
  expect(text).not.toMatch(/(^|\n)[-*] /);
  expect(text).toMatch(/。/);
  expect(text).not.toMatch(/取得了一定进展|开展了相关工作|进行了多方面探索/);
  expect(text).not.toMatch(/没有可提取的用户|无有效活动|\bextract\b|\bfallback\b|\bconversation\b|用户消息/i);
}

describe('composeDailyJournal', () => {
  it('writes one Chinese paragraph from complete semantic facts', async () => {
    const input = normalizeDailyFacts('2026-09-02', [
      fact({
        id: 1,
        title: '调整界面',
        summary: '继续调整 ChatGPT 活动记录与 AI 小记的展示。',
        outputState: 'partial',
      }),
      fact({
        id: 2,
        title: '确认同步',
        summary: '确认 PlainList 历史同步和周回顾数据正常。',
        outputState: 'produced',
      }),
      fact({
        id: 3,
        title: 'Foreshadow 验收',
        summary: '完成了 Foreshadow 当前版本验收。',
        outputState: 'produced',
      }),
      fact({
        id: 4,
        category: 'research',
        title: '论文',
        summary: '继续修改论文 Related Work，并核对了部分参考文献。',
        outputState: 'partial',
      }),
    ]);
    const result = await composeDailyJournal(input, { tryModel: false });
    assertReadable(result.text);
    expect(result.compositionMode).toBe('fallback');
    expect(result.text).toContain('PlainList');
    expect(result.text).toMatch(/论文|Related Work/);
    expect(result.text).not.toMatch(/并论文/);
    expect(result.text).not.toMatch(/推进PlainList /);
  });

  it('joins already-valid semantic facts in fallback instead of fragments', async () => {
    const result = await composeDailyJournal({
      date: '2026-09-02',
      topics: [
        { name: 'PlainList', status: 'completed', facts: ['完成了 PlainList v2.4.4 的 AI 小记界面重写。'] },
        { name: '论文', status: 'discussed', facts: ['讨论了论文 Related Work 的结构，并核对了几篇参考文献。'] },
        { name: 'Foreshadow', status: 'planned', facts: ['计划第二天继续对 Foreshadow 进行产品测试。'] },
      ],
    }, { tryModel: false });
    assertReadable(result.text);
    expect(result.text).toMatch(/完成了 PlainList v2\.4\.4 的 AI 小记界面重写/);
    expect(result.text).toMatch(/讨论了论文 Related Work 的结构/);
    expect(result.text).toMatch(/计划第二天继续对 Foreshadow 进行产品测试/);
    expect(result.text).not.toMatch(/今天主要完成了PlainList相关工作/);
  });

  it('never writes a conversation title into fallback prose', async () => {
    const input = normalizeDailyFacts('2026-09-01', [
      fact({
        id: 1,
        title: 'Related Work Structure Analysis',
        summary: '讨论了已录用论文与在投论文的区分，并核对了参考文献。',
        outputState: 'partial',
        category: 'research',
      }),
    ]);
    const result = await composeDailyJournal(input, { tryModel: false });
    assertReadable(result.text);
    expect(result.text).not.toContain('Related Work Structure Analysis');
    expect(result.text).not.toContain('没有可提取的用户');
  });

  it('sends only normalized structured facts to the model and accepts a readable paragraph', async () => {
    const input = normalizeDailyFacts('2026-09-02', [
      fact({
        id: 1,
        title: '完成验收',
        summary: '完成了 PlainList 桌面同步验收。',
        outputState: 'produced',
      }),
      fact({
        id: 2,
        category: 'research',
        title: '论文',
        summary: '继续修改论文 Related Work。',
        outputState: 'partial',
      }),
    ]);
    let payload = '';
    const result = await composeDailyJournal(input, {
      tryModel: true,
      complete: async (request) => {
        payload = `${request.system}\n${request.user}`;
        return '今天主要推进 PlainList 和论文工作。PlainList 完成桌面同步验收；论文方面继续修改相关工作部分。';
      },
    });
    expect(result.compositionMode).toBe('model');
    expect(result.providerCalled).toBe(true);
    expect(payload).not.toMatch(/transcript|messages\[\]|rawMarkdown|cookie|session/i);
    expect(payload).toContain('"topics"');
    expect(payload).toContain('完成了 PlainList 桌面同步验收。');
    expect(payload).not.toContain('Related Work Structure Analysis');
    assertReadable(result.text);
  });

  it('classifies validator rejection after one repair and still returns readable fallback', async () => {
    const input = normalizeDailyFacts('2026-09-01', [
      fact({
        id: 1,
        title: '完成验收',
        summary: '完成了 PlainList 桌面同步验收。',
        outputState: 'produced',
      }),
    ]);
    let calls = 0;
    const result = await composeDailyJournal(input, {
      tryModel: true,
      complete: async () => {
        calls += 1;
        return '推进10.1007 10.1109 取得了一定进展';
      },
    });
    expect(calls).toBe(2);
    expect(result.compositionMode).toBe('fallback');
    expect(result.fallbackReason).toBe('validator_reject');
    assertReadable(result.text);
    expect(result.text).not.toMatch(/10\.\d{4}/);
    expect(result.text).toContain('PlainList');
  });

  it('retries a transient provider timeout then classifies remaining failures', async () => {
    const input = normalizeDailyFacts('2026-09-02', [
      fact({
        id: 1,
        title: '完成验收',
        summary: '完成了 PlainList 桌面同步验收。',
        outputState: 'produced',
      }),
    ]);
    let calls = 0;
    const result = await composeDailyJournal(input, {
      tryModel: true,
      retryDelayMs: 0,
      complete: async () => {
        calls += 1;
        const error = Object.assign(new Error('OpenAI 兼容接口 请求超时或被中断'), { status: 504 });
        throw error;
      },
    });
    expect(calls).toBe(2);
    expect(result.compositionMode).toBe('fallback');
    expect(result.fallbackReason).toBe('timeout');
    assertReadable(result.text);
  });

  it('drops internal extractor phrasing from the final paragraph', async () => {
    const result = await composeDailyJournal({
      date: '2026-09-02',
      topics: [
        { name: '工作', status: 'discussed', facts: ['没有可提取的用户活动。'] },
        { name: 'PlainList', status: 'completed', facts: ['完成了 PlainList 桌面同步验收。'] },
      ],
    }, { tryModel: false });
    assertReadable(result.text);
    expect(result.text).not.toMatch(/没有可提取的用户/);
    expect(result.text).toContain('PlainList');
  });
});
