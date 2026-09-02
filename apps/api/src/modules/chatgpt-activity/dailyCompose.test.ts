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
}

describe('composeDailyJournal', () => {
  it('writes one Chinese paragraph from normalized facts without fragment concatenation', async () => {
    const input = normalizeDailyFacts('2026-09-02', [
      fact({ id: 1, title: '调整 ChatGPT 活动记录与 AI 小记展示', outputState: 'partial' }),
      fact({ id: 2, title: '确认 PlainList 历史同步和周回顾数据正常', outputState: 'produced' }),
      fact({ id: 3, title: 'Foreshadow 当前版本验收', outputState: 'produced' }),
      fact({ id: 4, category: 'research', title: '修改论文相关工作部分', outputState: 'partial' }),
      fact({ id: 5, category: 'research', title: '核对论文引用与表述', outputState: 'partial' }),
    ]);
    const result = await composeDailyJournal(input, { tryModel: false });
    assertReadable(result.text);
    expect(result.compositionMode).toBe('fallback');
    expect(result.text).toContain('PlainList');
    expect(result.text).toMatch(/论文/);
    expect(result.text).not.toMatch(/并论文/);
    expect(result.text).not.toMatch(/推进PlainList /);
  });

  it('sends only normalized structured facts to the model and accepts a readable paragraph', async () => {
    const input = normalizeDailyFacts('2026-09-02', [
      fact({ id: 1, title: '完成 PlainList 桌面同步验收', outputState: 'produced' }),
      fact({ id: 2, category: 'research', title: '修改论文相关工作', outputState: 'partial' }),
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
    expect(payload).not.toContain('推进PlainList ');
    assertReadable(result.text);
  });

  it('retries once then falls back when the model returns unreadable text', async () => {
    const input = normalizeDailyFacts('2026-09-01', [
      fact({ id: 1, title: '完成 PlainList 桌面同步验收', outputState: 'produced' }),
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
    assertReadable(result.text);
    expect(result.text).not.toMatch(/10\.\d{4}/);
    expect(result.text).toContain('PlainList');
  });

  it('does not join raw extractor fragments in the fallback', async () => {
    const input = normalizeDailyFacts('2026-09-02', [
      fact({
        id: 1,
        title: '最终产品 是一个本地优先现场场景 数字化工作台 封板结果 工作树干净 基线已核对',
        outputState: 'produced',
      }),
      fact({ id: 2, title: '完成 PlainList 桌面同步验收', outputState: 'produced' }),
      fact({ id: 3, category: 'research', title: '推进 10.1007 10.1109 论文相关工作', outputState: 'partial' }),
    ]);
    const result = await composeDailyJournal(input, { tryModel: false });
    assertReadable(result.text);
    expect(result.text).not.toMatch(/本地优先现场场景/);
    expect(result.text).not.toMatch(/10\.\d{4}/);
    expect(result.text).not.toMatch(/完成最终产品/);
    expect(result.text).toContain('PlainList');
    expect(result.text).toMatch(/论文/);
  });

  it('rejects truncated model prose and uses the readable fallback', async () => {
    const input = normalizeDailyFacts('2026-09-02', [
      fact({ id: 1, title: '完成 PlainList 桌面同步验收', outputState: 'produced' }),
    ]);
    const result = await composeDailyJournal(input, {
      tryModel: true,
      complete: async () => '2026年9月2日，当天户”的相关活动。',
    });
    expect(result.compositionMode).toBe('fallback');
    assertReadable(result.text);
    expect(result.text).not.toMatch(/当天户/);
    expect(result.text).not.toMatch(/相关活动。$/);
    expect(result.text).toContain('PlainList');
  });
});
