import { describe, expect, it } from 'vitest';
import {
  chineseCharCount,
  composeDailyJournalWithModel,
  renderChatgptDailyJournal,
  type ChatgptJournalFact,
} from './journal';

function fact(partial: Partial<ChatgptJournalFact> & Pick<ChatgptJournalFact, 'id' | 'title'>): ChatgptJournalFact {
  return {
    sourceId: partial.sourceId ?? partial.id,
    category: partial.category ?? 'engineering',
    outputState: partial.outputState ?? 'partial',
    summary: partial.summary ?? '',
    ...partial,
  };
}

function assertReadableParagraph(text: string) {
  expect(text).not.toMatch(/^## /);
  expect(text).not.toContain('### ');
  expect(text).not.toContain('\n');
  expect(text).not.toMatch(/(^|\n)[-*] /);
  expect(text).toMatch(/。/);
  expect(text).not.toMatch(/取得了一定进展|开展了相关工作|进行了多方面探索/);
  expect(text).not.toMatch(/没有可提取的用户|Related Work Structure Analysis/);
  expect(chineseCharCount(text)).toBeGreaterThan(12);
  expect(chineseCharCount(text)).toBeLessThanOrEqual(280);
}

describe('ChatGPT daily journal composition', () => {
  it('writes one readable Chinese paragraph from clustered topics', () => {
    const journal = renderChatgptDailyJournal('2026-09-02', [
      fact({ id: 1, title: '调整界面', summary: '继续调整 ChatGPT 活动记录与 AI 小记的展示。', outputState: 'partial' }),
      fact({ id: 2, title: '确认同步', summary: '确认 PlainList 历史同步和周回顾数据正常。', outputState: 'produced' }),
      fact({ id: 3, title: 'Foreshadow 验收', summary: '完成了 Foreshadow 当前版本验收。', outputState: 'produced' }),
      fact({ id: 4, title: 'Foreshadow 流程', summary: '确认 Foreshadow 核心流程已经可以实际使用。', outputState: 'produced' }),
      fact({ id: 5, category: 'research', title: '论文', summary: '继续修改论文 Related Work，并核对了部分参考文献。', outputState: 'partial' }),
    ]);

    assertReadableParagraph(journal.summaryMarkdown);
    expect(journal.summaryMarkdown).toContain('PlainList');
    expect(journal.summaryMarkdown).toContain('Foreshadow');
    expect(journal.summaryMarkdown).toMatch(/论文|Related Work/);
    expect(journal.summaryMarkdown).toMatch(/完成了|确认/);
    expect(journal.summaryMarkdown).toMatch(/继续|修改/);
    expect(journal.activityCount).toBe(5);
  });

  it('does not dump conversation-title fragments as a keyword string', () => {
    const journal = renderChatgptDailyJournal('2026-09-02', [
      fact({
        id: 1,
        title: '最终产品 是一个本地优先现场场景 数字化工作台 封板结果 工作树干净 基线已核对',
        outputState: 'produced',
      }),
      fact({
        id: 2,
        title: '完成 PlainList 桌面同步验收',
        summary: '完成了 PlainList 桌面同步验收。',
        outputState: 'produced',
      }),
    ]);

    assertReadableParagraph(journal.summaryMarkdown);
    expect(journal.summaryMarkdown).not.toMatch(/本地优先现场场景/);
    expect(journal.summaryMarkdown).not.toMatch(/工作树干净/);
    expect(journal.summaryMarkdown).toContain('PlainList');
    expect(journal.summaryMarkdown).toMatch(/完成了/);
  });

  it('strips DOI, URL, hashes and year fragments instead of splicing them', () => {
    const journal = renderChatgptDailyJournal('2026-09-02', [
      fact({
        id: 1,
        category: 'research',
        title: '推进 10.1007/978-3-319 10.1109 2016.2644615 10.1016 研究论文相关工作的撰写修改 https://doi.org/10.1109/x',
        outputState: 'partial',
      }),
      fact({
        id: 2,
        title: '内部 hash abcdef1234567890 不应出现',
        summary: '继续修改论文 Related Work，并核对了参考文献。',
        outputState: 'partial',
        category: 'research',
      }),
    ]);

    assertReadableParagraph(journal.summaryMarkdown);
    expect(journal.summaryMarkdown).not.toMatch(/10\.\d{4}/);
    expect(journal.summaryMarkdown).not.toContain('2016.2644615');
    expect(journal.summaryMarkdown).not.toContain('abcdef1234567890');
    expect(journal.summaryMarkdown).not.toContain('https://');
    expect(journal.summaryMarkdown).toMatch(/论文|Related Work|参考文献/);
  });

  it('keeps discussion and planning distinct from completion', () => {
    const journal = renderChatgptDailyJournal('2026-09-02', [
      fact({ id: 1, category: 'planning', title: '下周发布计划', summary: '计划了下周的发布安排。', outputState: 'unknown' }),
      fact({ id: 2, title: '修复周回顾空状态', summary: '完成了周回顾空状态的修复。', outputState: 'produced' }),
      fact({ id: 3, category: 'research', title: '侧信道假设', summary: '讨论了侧信道假设的适用边界。', outputState: 'unknown' }),
    ]);

    assertReadableParagraph(journal.summaryMarkdown);
    expect(journal.summaryMarkdown).toMatch(/完成了/);
    expect(journal.summaryMarkdown).toMatch(/周回顾空状态/);
    expect(journal.summaryMarkdown).toMatch(/确定|计划/);
    expect(journal.summaryMarkdown).toMatch(/讨论了|梳理了|侧信道/);
    expect(journal.summaryMarkdown).not.toMatch(/完成了下周发布计划/);
    expect(journal.summaryMarkdown).not.toMatch(/完成了侧信道/);
  });

  it('clusters many conversations into at most four topics', () => {
    const journal = renderChatgptDailyJournal('2026-09-02', [
      fact({ id: 1, title: 'PlainList 活动记录', summary: '继续调整 PlainList 的活动记录按钮。', outputState: 'partial' }),
      fact({ id: 2, title: 'PlainList AI 小记', summary: '继续调整 PlainList 的 AI 小记阅读器。', outputState: 'partial' }),
      fact({ id: 3, title: 'PlainList 周回顾', summary: '完成了 PlainList 周回顾空状态修复。', outputState: 'produced' }),
      fact({ id: 4, title: 'Foreshadow 验收', summary: '完成了 Foreshadow 验收脚本。', outputState: 'produced' }),
      fact({ id: 5, title: 'Foreshadow 流程', summary: '确认 Foreshadow 核心流程已经可以实际使用。', outputState: 'produced' }),
      fact({ id: 6, category: 'research', title: '论文', summary: '继续修改论文 Related Work。', outputState: 'partial' }),
      fact({ id: 7, category: 'learning', title: '用户画像', summary: '继续调整用户画像权重。', outputState: 'partial' }),
      fact({ id: 8, title: 'Desktop titlebar', summary: '调整了 Desktop titlebar 的间距和层级。', outputState: 'unknown' }),
    ]);

    assertReadableParagraph(journal.summaryMarkdown);
    expect(journal.summaryMarkdown).toContain('PlainList');
    expect(chineseCharCount(journal.summaryMarkdown)).toBeLessThanOrEqual(200);
  });

  it('ignores trivia and returns empty when nothing meaningful remains', () => {
    expect(renderChatgptDailyJournal('2026-09-01', [
      fact({ id: 1, category: 'planning', title: '天气', outputState: 'unknown' }),
      fact({ id: 2, category: 'learning', title: 'hi', outputState: 'unknown' }),
    ])).toEqual({
      date: '2026-09-01', summaryMarkdown: '', activityCount: 0, conversationCount: 0,
    });
    expect(renderChatgptDailyJournal('2026-09-01', [])).toEqual({
      date: '2026-09-01', summaryMarkdown: '', activityCount: 0, conversationCount: 0,
    });
  });

  it('uses a complete semantic fact when only one valid event remains', () => {
    const journal = renderChatgptDailyJournal('2026-09-01', [
      fact({ id: 1, title: '排查登录', summary: '继续排查了桌面端的登录问题。', outputState: 'partial' }),
    ]);
    assertReadableParagraph(journal.summaryMarkdown);
    expect(journal.summaryMarkdown).toMatch(/^今天/);
    expect(journal.summaryMarkdown).toContain('桌面端');
    expect(journal.summaryMarkdown).toMatch(/继续|推进|排查/);
  });
});

describe('composeDailyJournalWithModel', () => {
  it('sends only compact facts and accepts a readable model paragraph', async () => {
    const facts = [
      fact({ id: 1, title: '完成验收', summary: '完成了 PlainList 桌面同步验收。', outputState: 'produced' }),
      fact({ id: 2, category: 'research', title: '论文', summary: '继续修改论文 Related Work。', outputState: 'partial' }),
    ];
    let payload = '';
    const text = await composeDailyJournalWithModel(facts, async (request) => {
      payload = `${request.system}\n${request.user}`;
      return '今天主要完成了 PlainList 的桌面同步验收，并继续修改论文的相关工作部分。';
    });
    expect(text).toContain('桌面同步验收');
    expect(payload).not.toMatch(/transcript|messages\[\]|rawMarkdown|cookie|session/i);
    expect(payload).toContain('PlainList');
    expect(payload).toContain('completed');
  });

  it('falls back to the deterministic paragraph when the model returns unreadable text', async () => {
    const facts = [
      fact({ id: 1, title: '完成验收', summary: '完成了 PlainList 桌面同步验收。', outputState: 'produced' }),
    ];
    const text = await composeDailyJournalWithModel(facts, async () => '推进10.1007 10.1109 取得了一定进展');
    assertReadableParagraph(text);
    expect(text).not.toMatch(/10\.\d{4}/);
    expect(text).toContain('PlainList');
  });
});
