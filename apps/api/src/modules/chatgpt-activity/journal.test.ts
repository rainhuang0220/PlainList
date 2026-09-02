import { describe, expect, it } from 'vitest';
import { renderChatgptDailyJournal } from './journal';

function cjkCount(text: string): number {
  return Array.from(text.replace(/\s+/g, '')).length;
}

describe('ChatGPT daily journal rendering', () => {
  it('merges multiple conversations into a readable diary while preserving completion semantics', () => {
    const journal = renderChatgptDailyJournal('2026-09-01', [
      { id: 1, sourceId: 10, category: 'engineering', title: '排查桌面端登录问题', outputState: 'partial' },
      { id: 2, sourceId: 10, category: 'engineering', title: '完成登录回归测试', outputState: 'produced' },
      { id: 3, sourceId: 11, category: 'research', title: '阅读同步架构资料', outputState: 'partial' },
    ]);

    expect(journal.activityCount).toBe(3);
    expect(journal.conversationCount).toBe(2);
    expect(journal.summaryMarkdown).toContain('## 9 月 1 日');
    expect(journal.summaryMarkdown).toContain('### 软件工程');
    expect(journal.summaryMarkdown).toContain('推进了排查桌面端登录问题');
    expect(journal.summaryMarkdown).toContain('完成了登录回归测试');
    expect(journal.summaryMarkdown).toContain('### 研究');
    expect(journal.summaryMarkdown).not.toContain('- 完成：');
    expect(cjkCount(journal.summaryMarkdown)).toBeGreaterThan(40);
  });

  it('does not treat AI suggestions as completed work', () => {
    const journal = renderChatgptDailyJournal('2026-09-02', [
      { id: 1, sourceId: 10, category: 'planning', title: '下周发布计划', outputState: 'unknown' },
      { id: 2, sourceId: 10, category: 'engineering', title: '修复周回顾空状态', outputState: 'produced' },
    ]);
    expect(journal.summaryMarkdown).toContain('讨论了下周发布计划');
    expect(journal.summaryMarkdown).toContain('完成了修复周回顾空状态');
    expect(journal.summaryMarkdown).not.toMatch(/完成了下周发布计划/);
  });

  it('ignores weather, one-line lookups and idle chat', () => {
    expect(renderChatgptDailyJournal('2026-09-01', [
      { id: 1, sourceId: 10, category: 'planning', title: '天气', outputState: 'unknown' },
      { id: 2, sourceId: 11, category: 'learning', title: 'hi', outputState: 'unknown' },
    ])).toEqual({
      date: '2026-09-01', summaryMarkdown: '', activityCount: 0, conversationCount: 0,
    });
  });

  it('returns no journal body when there is no relevant activity', () => {
    expect(renderChatgptDailyJournal('2026-09-01', [])).toEqual({
      date: '2026-09-01', summaryMarkdown: '', activityCount: 0, conversationCount: 0,
    });
  });
});
