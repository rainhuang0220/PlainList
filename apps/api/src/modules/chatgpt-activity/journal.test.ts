import { describe, expect, it } from 'vitest';
import { renderChatgptDailyJournal } from './journal';

describe('ChatGPT daily journal rendering', () => {
  it('merges multiple conversations by category while preserving completion semantics', () => {
    const journal = renderChatgptDailyJournal('2026-09-01', [
      { id: 1, sourceId: 10, category: 'engineering', title: '排查桌面端登录问题', outputState: 'partial' },
      { id: 2, sourceId: 10, category: 'engineering', title: '完成登录回归测试', outputState: 'produced' },
      { id: 3, sourceId: 11, category: 'research', title: '阅读同步架构资料', outputState: 'partial' },
    ]);

    expect(journal.activityCount).toBe(3);
    expect(journal.conversationCount).toBe(2);
    expect(journal.summaryMarkdown).toContain('## 今日 ChatGPT 活动');
    expect(journal.summaryMarkdown).toContain('### 软件工程');
    expect(journal.summaryMarkdown).toContain('- 推进：排查桌面端登录问题');
    expect(journal.summaryMarkdown).toContain('- 完成：完成登录回归测试');
    expect(journal.summaryMarkdown).toContain('### 研究');
  });

  it('returns no journal body when there is no relevant activity', () => {
    expect(renderChatgptDailyJournal('2026-09-01', [])).toEqual({
      date: '2026-09-01', summaryMarkdown: '', activityCount: 0, conversationCount: 0,
    });
  });
});
