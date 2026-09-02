import { describe, expect, it } from 'vitest';
import { chineseCharCount, renderChatgptDailyJournal } from './journal';

describe('ChatGPT daily journal rendering', () => {
  it('writes one specific paragraph and keeps named facts', () => {
    const journal = renderChatgptDailyJournal('2026-09-01', [
      { id: 1, sourceId: 10, category: 'engineering', title: '排查桌面端登录问题', outputState: 'partial' },
      { id: 2, sourceId: 10, category: 'engineering', title: '完成登录回归测试', outputState: 'produced' },
      { id: 3, sourceId: 11, category: 'research', title: '阅读同步架构资料', outputState: 'partial' },
    ]);

    expect(journal.activityCount).toBe(3);
    expect(journal.conversationCount).toBe(2);
    expect(journal.summaryMarkdown).not.toMatch(/^## /);
    expect(journal.summaryMarkdown).not.toContain('### ');
    expect(journal.summaryMarkdown).not.toContain('- ');
    expect(journal.summaryMarkdown).not.toContain('项目 / 学习');
    expect(journal.summaryMarkdown).toContain('登录回归测试');
    expect(journal.summaryMarkdown).toContain('桌面端登录');
    expect(chineseCharCount(journal.summaryMarkdown)).toBeLessThanOrEqual(200);
    expect(chineseCharCount(journal.summaryMarkdown)).toBeGreaterThan(20);
  });

  it('does not treat discussion as completion', () => {
    const journal = renderChatgptDailyJournal('2026-09-02', [
      { id: 1, sourceId: 10, category: 'planning', title: '下周发布计划', outputState: 'unknown' },
      { id: 2, sourceId: 10, category: 'engineering', title: '修复周回顾空状态', outputState: 'produced' },
    ]);
    expect(journal.summaryMarkdown).toContain('确定下周发布计划');
    expect(journal.summaryMarkdown).toContain('完成修复周回顾空状态');
    expect(journal.summaryMarkdown).not.toMatch(/完成下周发布计划/);
  });

  it('deduplicates the same topic across conversations', () => {
    const journal = renderChatgptDailyJournal('2026-09-02', [
      { id: 1, sourceId: 10, category: 'engineering', title: '排查 PlainList 登录失败', outputState: 'partial' },
      { id: 2, sourceId: 11, category: 'engineering', title: '继续排查 PlainList 登录失败', outputState: 'partial' },
      { id: 3, sourceId: 12, category: 'engineering', title: '再次讨论 PlainList 登录失败', outputState: 'unknown' },
    ]);
    expect(journal.summaryMarkdown.match(/登录失败/g)?.length).toBe(1);
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

  it('clips a long day to 200 Chinese characters without bullets', () => {
    const journal = renderChatgptDailyJournal('2026-09-02', [
      { id: 1, sourceId: 1, category: 'engineering', title: '完成 PlainList 2.4.1 的 Web 周回顾修复并核对 DashScope qwen3.7-plus', outputState: 'produced' },
      { id: 2, sourceId: 2, category: 'engineering', title: '接入 chatgpt-local-sync 并从 8 月 1 日起回填历史对话', outputState: 'produced' },
      { id: 3, sourceId: 3, category: 'research', title: '阅读 Foreshadow 论文里的侧信道假设', outputState: 'partial' },
      { id: 4, sourceId: 4, category: 'learning', title: '整理用户画像 recency decay 的权重写法', outputState: 'partial' },
      { id: 5, sourceId: 5, category: 'planning', title: '确定明天只做 Desktop titlebar 验收', outputState: 'unknown' },
      { id: 6, sourceId: 6, category: 'engineering', title: '再写一长串不会出现的内部 hash abcdef1234567890', outputState: 'partial' },
    ]);
    expect(journal.summaryMarkdown).not.toContain('abcdef1234567890');
    expect(journal.summaryMarkdown).toContain('PlainList');
    expect(chineseCharCount(journal.summaryMarkdown)).toBeLessThanOrEqual(200);
    expect(journal.summaryMarkdown.includes('\n')).toBe(false);
  });
});
