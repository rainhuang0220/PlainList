import { describe, expect, it } from 'vitest';
import type { ChecksByPlan, PlanRecord, UserProfileTraitRecord } from '@plainlist/shared';
import {
  WEEKLY_SUMMARY_PROMPT_VERSION,
  assembleReviewSnapshotEvidence,
  assembleWeeklyEvidence,
  buildWeeklySummarySystemPrompt,
  isWeeklySummaryCacheFresh,
  normalizeWeekStart,
  parseWeeklySummaryContent,
  sourceHash,
  reviewSourceDataCount,
  weeklyLookbackRange,
  weeklySummarySettingKey,
} from './weeklySummaryCore';

function plan(partial: Partial<PlanRecord> & Pick<PlanRecord, 'id' | 'type' | 'name'>): PlanRecord {
  return {
    time: '09:00',
    sortOrder: 0,
    ...partial,
  };
}

const weekStart = '2026-08-24';

function basePlans(): PlanRecord[] {
  return [
    plan({ id: 2, type: 'todo', name: '论文实验', scheduledDate: '2026-08-26' }),
    plan({ id: 1, type: 'habit', name: '阅读', visibleFrom: '2026-08-01' }),
  ];
}

describe('week identity', () => {
  it('normalizes any date in the week to Monday', () => {
    expect(normalizeWeekStart('2026-08-26')).toBe('2026-08-24');
    expect(normalizeWeekStart('2026-08-24')).toBe('2026-08-24');
    expect(normalizeWeekStart('2026-08-30')).toBe('2026-08-24');
  });

  it('uses an independent settings key per weekStart', () => {
    expect(weeklySummarySettingKey('2026-08-24')).toBe('weekly_ai_summary:2026-08-24');
    expect(weeklySummarySettingKey('2026-08-24')).not.toBe('ai_settings');
  });

  it('looks back four weeks plus the current week', () => {
    expect(weeklyLookbackRange('2026-08-24')).toEqual({
      from: '2026-07-27',
      to: '2026-08-30',
    });
  });
});

describe('assembleWeeklyEvidence', () => {
  it('sorts days and items so DB order cannot change the hash', () => {
    const reviews = { '2026-08-26': '今天把论文实验跑完了' };
    const checks: ChecksByPlan = {
      2: { '2026-08-26': { done: false } },
      1: { '2026-08-26': { done: true } },
    };

    const left = assembleWeeklyEvidence({
      weekStart,
      todayKey: '2026-08-26',
      plans: basePlans(),
      checks,
      reviews,
      profile: [],
    });
    const right = assembleWeeklyEvidence({
      weekStart,
      todayKey: '2026-08-26',
      plans: [...basePlans()].reverse(),
      checks,
      reviews,
      profile: [],
    });

    expect(sourceHash(left)).toBe(sourceHash(right));
    expect(left.days.map((day) => day.date)).toEqual([...left.days.map((day) => day.date)].sort());
    expect(left.days.find((day) => day.date === '2026-08-26')?.items.map((item) => item.id)).toEqual([1, 2]);
  });

  it('changes the hash when a diary in the lookback window changes', () => {
    const plans = basePlans();
    const checks: ChecksByPlan = {};
    const left = assembleWeeklyEvidence({
      weekStart,
      todayKey: '2026-08-26',
      plans,
      checks,
      reviews: { '2026-08-03': '上周在写代码' },
      profile: [],
    });
    const right = assembleWeeklyEvidence({
      weekStart,
      todayKey: '2026-08-26',
      plans,
      checks,
      reviews: { '2026-08-03': '上周几乎都在打游戏' },
      profile: [],
    });
    expect(sourceHash(left)).not.toBe(sourceHash(right));
  });

  it('includes used profile evidence in the hash', () => {
    const profile: UserProfileTraitRecord[] = [{
      id: 9,
      traitKey: 'sleep_rest_delay_buffer',
      title: '睡眠缓冲',
      generatedSummary: '日记多次提到晚起',
      effectiveSummary: '日记多次提到晚起',
      impactRatio: 0.4,
      confidence: 0.5,
      supportCount: 2,
      enabled: true,
      updatedAt: '2026-08-01T00:00:00.000Z',
      evidence: [{
        id: 1,
        traitId: 9,
        reviewDate: '2026-08-20',
        excerpt: '今天又睡到十点',
        observation: '晚起',
        impactNote: '缓冲',
        weight: 0.8,
        createdAt: '2026-08-20T00:00:00.000Z',
      }],
    }];

    const without = assembleWeeklyEvidence({
      weekStart,
      todayKey: '2026-08-26',
      plans: [],
      checks: {},
      reviews: {},
      profile: [],
    });
    const withProfile = assembleWeeklyEvidence({
      weekStart,
      todayKey: '2026-08-26',
      plans: [],
      checks: {},
      reviews: {},
      profile,
    });
    expect(sourceHash(without)).not.toBe(sourceHash(withProfile));
    expect(withProfile.profile[0]?.evidence[0]?.excerpt).toBe('今天又睡到十点');
  });

  it('records a diary-vs-unchecked conflict instead of treating the task as unfinished fact', () => {
    const evidence = assembleWeeklyEvidence({
      weekStart,
      todayKey: '2026-08-26',
      plans: basePlans(),
      checks: { 2: { '2026-08-26': { done: false } } },
      reviews: { '2026-08-26': '今天把论文实验跑完了' },
      profile: [],
    });

    expect(evidence.conflicts).toEqual([
      expect.objectContaining({
        date: '2026-08-26',
        planName: '论文实验',
        checkDone: false,
        kind: 'diary-vs-unchecked',
      }),
    ]);
    expect(evidence.conflicts[0]?.note).toMatch(/日记/);
    expect(evidence.conflicts[0]?.note).not.toMatch(/未完成事实/);
  });

  it('keeps diary text when there are no tasks that day', () => {
    const evidence = assembleWeeklyEvidence({
      weekStart,
      todayKey: '2026-08-26',
      plans: [],
      checks: {},
      reviews: { '2026-08-26': '今天打篮球然后打了 CSGO' },
      profile: [],
    });
    const day = evidence.days.find((item) => item.date === '2026-08-26');
    expect(day?.diary).toContain('CSGO');
    expect(day?.items).toEqual([]);
    expect(evidence.conflicts).toEqual([]);
  });

  it('does not invent a did-not-happen conflict from missing checks without a diary', () => {
    const evidence = assembleWeeklyEvidence({
      weekStart,
      todayKey: '2026-08-26',
      plans: basePlans(),
      checks: {},
      reviews: {},
      profile: [],
    });
    expect(evidence.conflicts).toEqual([]);
  });

  it('keeps empty lookback days so the model can see missing history', () => {
    const evidence = assembleWeeklyEvidence({
      weekStart,
      todayKey: '2026-08-26',
      plans: [],
      checks: {},
      reviews: {},
      profile: [],
    });
    expect(evidence.lookbackStart).toBe('2026-07-27');
    expect(evidence.days[0]?.date).toBe('2026-07-27');
    expect(evidence.days.some((day) => day.date === '2026-08-24')).toBe(true);
  });

  it('does not list a todo on days other than its scheduled date', () => {
    const evidence = assembleWeeklyEvidence({
      weekStart,
      todayKey: '2026-08-26',
      plans: basePlans(),
      checks: {},
      reviews: {},
      profile: [],
    });
    const monday = evidence.days.find((day) => day.date === '2026-08-24');
    expect(monday?.items.some((item) => item.name === '论文实验')).toBe(false);
  });
});

describe('assembleReviewSnapshotEvidence', () => {
  it('keeps the current local date out of a Tuesday snapshot while preserving calendar-week context', () => {
    const evidence = assembleReviewSnapshotEvidence({
      reviewAsOfDate: '2026-09-01',
      plans: [],
      checks: {},
      reviews: {
        '2026-08-31': '昨天完成了实验。',
        '2026-09-01': '今天新建的任务不得进入这份快照。',
      },
      profile: [],
    });

    expect(evidence.weekStart).toBe('2026-08-31');
    expect(evidence.weekEnd).toBe('2026-08-31');
    expect(evidence.days.at(-1)?.date).toBe('2026-08-31');
    expect(evidence.days.some((day) => day.date === '2026-09-01')).toBe(false);
  });
});

describe('reviewSourceDataCount', () => {
  it('treats scheduled-but-unchecked plans as no review source data', () => {
    const evidence = assembleReviewSnapshotEvidence({
      reviewAsOfDate: '2026-09-02',
      plans: [{ id: 1, type: 'habit', name: 'Read', time: '09:00', sortOrder: 0, scheduledDate: null, visibleFrom: '2026-08-01' }],
      checks: {},
      reviews: {},
      profile: [],
    });

    expect(reviewSourceDataCount(evidence)).toBe(0);
  });

  it('counts only diaries and completed checks as review source data', () => {
    const evidence = assembleReviewSnapshotEvidence({
      reviewAsOfDate: '2026-09-02',
      plans: [{ id: 1, type: 'habit', name: 'Read', time: '09:00', sortOrder: 0, scheduledDate: null, visibleFrom: '2026-08-01' }],
      checks: { '1': { '2026-09-01': { done: true, actualMinutes: null } } },
      reviews: { '2026-08-31': 'Made progress.' },
      profile: [],
    });

    expect(reviewSourceDataCount(evidence)).toBe(2);
  });

  it('counts a derived ChatGPT journal without treating it as the user diary', () => {
    const evidence = assembleReviewSnapshotEvidence({
      reviewAsOfDate: '2026-09-02', plans: [], checks: {}, reviews: {}, profile: [],
      chatgptJournals: { '2026-09-01': '## 今日 ChatGPT 活动\n\n- 完成：发布桌面版本' },
    });

    expect(reviewSourceDataCount(evidence)).toBe(1);
    expect(evidence.days.find((day) => day.date === '2026-09-01')).toMatchObject({
      diary: null,
      chatgptJournal: '## 今日 ChatGPT 活动\n\n- 完成：发布桌面版本',
    });
  });
});

describe('cache freshness', () => {
  it('requires weekStart, sourceHash and promptVersion to all match', () => {
    const cache = {
      weekStart: '2026-08-24',
      sourceHash: 'abc',
      promptVersion: WEEKLY_SUMMARY_PROMPT_VERSION,
    };
    expect(isWeeklySummaryCacheFresh(cache, {
      weekStart: '2026-08-24',
      sourceHash: 'abc',
      promptVersion: WEEKLY_SUMMARY_PROMPT_VERSION,
    })).toBe(true);
    expect(isWeeklySummaryCacheFresh(cache, {
      weekStart: '2026-08-17',
      sourceHash: 'abc',
      promptVersion: WEEKLY_SUMMARY_PROMPT_VERSION,
    })).toBe(false);
    expect(isWeeklySummaryCacheFresh(cache, {
      weekStart: '2026-08-24',
      sourceHash: 'def',
      promptVersion: WEEKLY_SUMMARY_PROMPT_VERSION,
    })).toBe(false);
    expect(isWeeklySummaryCacheFresh(cache, {
      weekStart: '2026-08-24',
      sourceHash: 'abc',
      promptVersion: 'weekly-summary-v2',
    })).toBe(false);
  });
});

describe('parseWeeklySummaryContent', () => {
  const valid = {
    overall: '本周核心目标推进不足。',
    summary: '日记记录了三次论文实验，周六打球和打游戏。',
    comparison: '相比上周，学习相关日记减少。',
    positive: '周三把实验跑通，有直接证据。',
    concerns: '核心项目投入已连续两周下降。',
    next_focus: ['先补上论文实验的可验证进度'],
  };

  it('parses structured JSON including next_focus alias', () => {
    const parsed = parseWeeklySummaryContent(JSON.stringify(valid));
    expect(parsed?.nextFocus).toEqual(['先补上论文实验的可验证进度']);
    expect(parsed?.overall).toBe(valid.overall);
  });

  it('extracts JSON after model preamble', () => {
    const parsed = parseWeeklySummaryContent(`分析如下：\n${JSON.stringify(valid)}`);
    expect(parsed?.summary).toBe(valid.summary);
  });

  it('rejects missing required fields', () => {
    expect(parseWeeklySummaryContent(JSON.stringify({ ...valid, overall: '' }))).toBeNull();
    expect(parseWeeklySummaryContent(JSON.stringify({ ...valid, comparison: undefined }))).toBeNull();
  });

  it('rejects empty or illegal payloads', () => {
    expect(parseWeeklySummaryContent('')).toBeNull();
    expect(parseWeeklySummaryContent('not json')).toBeNull();
    expect(parseWeeklySummaryContent('{"overall":1}')).toBeNull();
  });

  it('rejects nextFocus outside 1-3 items', () => {
    expect(parseWeeklySummaryContent(JSON.stringify({ ...valid, next_focus: [] }))).toBeNull();
    expect(parseWeeklySummaryContent(JSON.stringify({
      ...valid,
      next_focus: ['a', 'b', 'c', 'd'],
    }))).toBeNull();
  });
});

describe('system prompt constraints', () => {
  it('encodes observer rules rather than a generic summarize request', () => {
    const prompt = buildWeeklySummarySystemPrompt();
    expect(prompt).toContain('第三方观察者');
    expect(prompt).toContain('weekly-summary-v1');
    expect(prompt).not.toMatch(/请根据以下数据总结本周表现/);
    expect(prompt).toContain('未打卡不等于未完成');
    expect(prompt).toContain('日记优先');
    expect(prompt).toContain('不得把娱乐或休息自动判定为低效或荒废');
    expect(prompt).toContain('不得讨好');
    expect(prompt).toContain('不得羞辱');
    expect(prompt).toContain('心理诊断');
    expect(prompt).toContain('必须跨周比较');
    expect(prompt).toContain('无法判断');
    expect(prompt).toContain('事实');
    expect(prompt).toContain('解释必须使用');
  });
});
