import { describe, expect, it } from 'vitest';
import {
  buildWeeklyReviewPage,
  mergeClosedWeeklyHistory,
  previousWeekCopy,
  recoverClosedWeekSection,
  sectionFromSnapshot,
} from './weeklyReviewPage';

const runtime = {
  weeklyProvider: 'openai',
  weeklyModel: 'qwen3.7-plus',
  weeklySource: 'server' as const,
  weeklyHost: 'dashscope.aliyuncs.com',
  activityMethod: 'deterministic_local' as const,
};

const closedContent = {
  overall: '上一周完成了 2.4.0 主干。',
  summary: '历史回填、日记和周回顾都已经接上。',
  comparison: '比前一周更集中。',
  positive: '有明确完成记录。',
  concerns: '周日日记可能迟到。',
  nextFocus: ['继续打磨周回顾'],
  narrativeMarkdown: '上一周主要完成了 PlainList 2.4.0 的活动日记主干，并把周回顾从空状态里救了回来。',
};

describe('buildWeeklyReviewPage', () => {
  it('does not call 8/24-8/30 the first natural week when earlier diaries exist', () => {
    const page = buildWeeklyReviewPage({
      asOfDate: '2026-09-02',
      previousClosed: sectionFromSnapshot({
        weekStart: '2026-08-24',
        weekEnd: '2026-08-30',
        status: 'error',
      }),
      current: null,
      currentDailyJournals: [],
      currentPlans: [{ kind: 'task', text: '写周报' }],
      hasHistory: true,
      hasPriorHistory: true,
      runtime,
    });
    expect(page.trueEmpty).toBe(false);
    expect(page.previousWeekState).toBe('preparing');
    expect(page.previousClosedWeek?.weekStart).toBe('2026-08-24');
    expect(page.previousClosedWeek?.narrativeMarkdown).toBeUndefined();
  });

  it('uses a recovered closed-week summary instead of the first-week empty copy', () => {
    const page = buildWeeklyReviewPage({
      asOfDate: '2026-09-02',
      previousClosed: sectionFromSnapshot({
        weekStart: '2026-08-24',
        weekEnd: '2026-08-30',
        status: 'ready',
        content: closedContent,
      }),
      current: null,
      currentDailyJournals: [],
      currentPlans: [],
      hasHistory: true,
      hasPriorHistory: true,
      runtime,
    });
    expect(page.previousWeekState).toBe('summary');
    expect(page.previousClosedWeek?.narrativeMarkdown).toContain('活动日记主干');
  });

  it('on Monday keeps the previous closed week and does not show ordinary no_data', () => {
    const page = buildWeeklyReviewPage({
      asOfDate: '2026-09-07',
      previousClosed: sectionFromSnapshot({
        weekStart: '2026-08-31',
        weekEnd: '2026-09-06',
        status: 'ready',
        content: closedContent,
        provider: 'openai',
        model: 'qwen3.7-plus',
      }),
      current: null,
      currentDailyJournals: [],
      currentPlans: [{ kind: 'task', text: '验证周回顾页面' }],
      hasHistory: true,
      runtime,
    });

    expect(page.isMonday).toBe(true);
    expect(page.trueEmpty).toBe(false);
    expect(page.previousClosedWeek?.weekStart).toBe('2026-08-31');
    expect(page.previousClosedWeek?.narrativeMarkdown).toContain('活动日记主干');
    expect(page.currentWeek?.weekStart).toBe('2026-09-07');
    expect(page.currentDailyJournals).toEqual([]);
    expect(page.currentPlans).toEqual([{ kind: 'task', text: '验证周回顾页面' }]);
  });

  it('on Thursday shows Monday through Wednesday journals as current-week material', () => {
    const page = buildWeeklyReviewPage({
      asOfDate: '2026-09-10',
      previousClosed: sectionFromSnapshot({
        weekStart: '2026-08-31',
        weekEnd: '2026-09-06',
        status: 'ready',
        content: closedContent,
      }),
      current: sectionFromSnapshot({
        weekStart: '2026-09-07',
        weekEnd: '2026-09-09',
        status: 'ready',
        content: {
          ...closedContent,
          overall: '本周前三天继续推进。',
          summary: '周一到周三都有日记。',
          narrativeMarkdown: '本周前三天继续推进 PlainList 周回顾。',
        },
      }),
      currentDailyJournals: [
        { date: '2026-09-07', summaryMarkdown: '## 9 月 7 日\n\n推进了周模型。', activityCount: 2, conversationCount: 1 },
        { date: '2026-09-08', summaryMarkdown: '## 9 月 8 日\n\n修复了设置页空白。', activityCount: 1, conversationCount: 1 },
        { date: '2026-09-09', summaryMarkdown: '## 9 月 9 日\n\n整理了 AI 小记。', activityCount: 1, conversationCount: 1 },
      ],
      currentPlans: [],
      hasHistory: true,
      runtime,
    });

    expect(page.trueEmpty).toBe(false);
    expect(page.currentDailyJournals.map((item) => item.date)).toEqual([
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
    ]);
    expect(page.currentWeek?.narrativeMarkdown).toContain('本周前三天');
  });

  it('only uses the true-empty state when there is no history and no current evidence', () => {
    const page = buildWeeklyReviewPage({
      asOfDate: '2026-09-07',
      previousClosed: null,
      current: null,
      currentDailyJournals: [],
      currentPlans: [],
      hasHistory: false,
      runtime,
    });

    expect(page.trueEmpty).toBe(true);
    expect(page.previousClosedWeek).toBeNull();
  });

  it('keeps the week useful when daily journals exist but the model summary is still updating', () => {
    const page = buildWeeklyReviewPage({
      asOfDate: '2026-09-08',
      previousClosed: null,
      current: sectionFromSnapshot({
        weekStart: '2026-09-07',
        weekEnd: '2026-09-07',
        status: 'error',
        notice: 'updating',
      }),
      currentDailyJournals: [
        { date: '2026-09-07', summaryMarkdown: '## 9 月 7 日\n\n推进了登录修复。', activityCount: 1, conversationCount: 1 },
      ],
      currentPlans: [],
      hasHistory: true,
      runtime,
    });

    expect(page.trueEmpty).toBe(false);
    expect(page.currentDailyJournals).toHaveLength(1);
  });

  it('shows the current completed range 8/31-9/1 even before a model summary exists', () => {
    const page = buildWeeklyReviewPage({
      asOfDate: '2026-09-02',
      previousClosed: null,
      current: null,
      currentDailyJournals: [],
      currentPlans: [],
      hasHistory: true,
      hasPriorHistory: true,
      runtime,
    });
    expect(page.previousWeekState).toBe('preparing');
    expect(page.currentWeek?.weekStart).toBe('2026-08-31');
    expect(page.currentWeek?.weekEnd).toBe('2026-09-01');
    expect(previousWeekCopy(page.previousWeekState)).toBe('上周回顾正在准备');
    expect(previousWeekCopy('first_week')).toBe('这是你的第一个自然周，还没有上周回顾。');
  });
});

describe('recoverClosedWeekSection', () => {
  it('prefers a recovered cache over an empty error snapshot', () => {
    const recovered = recoverClosedWeekSection({
      weekStart: '2026-08-24',
      weekEnd: '2026-08-30',
      snapshot: sectionFromSnapshot({ weekStart: '2026-08-24', weekEnd: '2026-08-30', status: 'error' }),
      cached: sectionFromSnapshot({
        weekStart: '2026-08-24',
        weekEnd: '2026-08-30',
        status: 'ready',
        content: closedContent,
      }),
    });
    expect(recovered?.narrativeMarkdown).toContain('活动日记主干');
  });
});

describe('mergeClosedWeeklyHistory', () => {
  it('keeps closed weeks from 8/3 onward and skips the current unclosed week', () => {
    const weekly = mergeClosedWeeklyHistory({
      asOf: '2026-09-02',
      historicalStart: '2026-08-01',
      snapshots: [{
        weekStart: '2026-08-24',
        weekEnd: '2026-08-30',
        reviewAsOfDate: '2026-08-31',
        status: 'ready',
        narrativeMarkdown: 'closed week from snapshot',
      }],
      fromDiaries: [
        {
          weekStart: '2026-08-17',
          weekEnd: '2026-08-23',
          reviewAsOfDate: '2026-08-24',
          status: 'ready',
          narrativeMarkdown: 'composed from diaries',
          provider: 'deterministic',
        },
        {
          weekStart: '2026-07-27',
          weekEnd: '2026-08-02',
          reviewAsOfDate: '2026-08-03',
          status: 'ready',
          narrativeMarkdown: 'partial week before the floor',
        },
        {
          weekStart: '2026-08-31',
          weekEnd: '2026-09-06',
          reviewAsOfDate: '2026-09-07',
          status: 'ready',
          narrativeMarkdown: 'current week is not closed',
        },
      ],
    });
    expect(weekly.map((item) => item.weekStart)).toEqual(['2026-08-24', '2026-08-17']);
  });
});
