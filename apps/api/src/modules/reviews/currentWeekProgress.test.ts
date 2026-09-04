import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  WEEKLY_SUMMARY_PROMPT_VERSION,
  assembleReviewSnapshotEvidence,
  buildWeeklySummarySystemPrompt,
  composeDeterministicWeeklyContent,
} from './weeklySummaryCore';
import {
  CURRENT_WEEK_PROGRESS_PROMPT_VERSION,
  buildCurrentWeekProgressSystemPrompt,
  composeDeterministicCurrentWeekProgress,
  isStaleCurrentWeekSnapshot,
  reviewProgressForWindow,
  shouldUseCurrentWeekProgress,
} from './currentWeekProgress';

const diarySplicedJournals = {
  '2026-09-07': '周一：\nPlainList 做了 v2.4.x 封板。',
  '2026-09-08': '周二：\nPlainList 又改了 v2.4.x。\nForeshadow 做了场景稿。',
  '2026-09-09': '周三：\nwhereToken 发布。\nPlainList 又修签名。',
  '2026-09-10': '周四：\nPlainList 又发布。',
};

function currentWeekEvidence() {
  return assembleReviewSnapshotEvidence({
    reviewAsOfDate: '2026-09-11',
    plans: [],
    checks: {},
    reviews: {},
    profile: [],
    chatgptJournals: diarySplicedJournals,
  });
}

describe('current-week window selection', () => {
  it('uses current-week progress only for in-progress Mon–yesterday windows', () => {
    expect(shouldUseCurrentWeekProgress('2026-09-07', '2026-09-10')).toBe(true);
    expect(shouldUseCurrentWeekProgress('2026-09-07', '2026-09-09')).toBe(true);
    expect(shouldUseCurrentWeekProgress('2026-09-07', '2026-09-13')).toBe(false);
  });

  it('does not treat a closed Mon–Sun week as current-week progress', () => {
    const writer = reviewProgressForWindow('2026-09-07', '2026-09-13');
    expect(writer.promptVersion).toBe(WEEKLY_SUMMARY_PROMPT_VERSION);
    expect(writer.promptVersion).not.toBe(CURRENT_WEEK_PROGRESS_PROMPT_VERSION);
  });

  it('selects the current-week writer for a Thursday completed range', () => {
    const writer = reviewProgressForWindow('2026-09-07', '2026-09-10');
    expect(writer.promptVersion).toBe(CURRENT_WEEK_PROGRESS_PROMPT_VERSION);
  });
});

describe('composeDeterministicCurrentWeekProgress', () => {
  it('does not splice the current week as weekday diary entries', () => {
    const content = composeDeterministicCurrentWeekProgress(currentWeekEvidence());
    const narrative = content?.narrativeMarkdown ?? '';
    expect(narrative).not.toMatch(/周[一二三四五六日天]/);
    expect(narrative).not.toMatch(/星期[一二三四五六日天]/);
    expect(narrative).not.toMatch(/##\s*9\s*月\s*\d+\s*日/);
    expect(narrative).not.toMatch(/2026-09-0[7-9] 完成了/);
  });

  it('clusters the same project across days instead of repeating it per weekday', () => {
    const content = composeDeterministicCurrentWeekProgress(currentWeekEvidence());
    const narrative = content?.narrativeMarkdown ?? '';
    expect(narrative).toContain('PlainList');
    expect(narrative).toContain('Foreshadow');
    expect(narrative).toContain('whereToken');
    expect(narrative).toMatch(/封板/);
    expect(narrative).toMatch(/发布/);
    const plainlistHeadingCount = (narrative.match(/^###\s*PlainList\s*$/gm) ?? []).length;
    expect(plainlistHeadingCount).toBe(1);
  });

  it('keeps the completed-range dates already present in evidence', () => {
    const evidence = currentWeekEvidence();
    expect(evidence.weekStart).toBe('2026-09-07');
    expect(evidence.weekEnd).toBe('2026-09-10');
    const content = composeDeterministicCurrentWeekProgress(evidence);
    expect(content).not.toBeNull();
  });
});

describe('current-week prompt', () => {
  it('forbids day-by-day diary listing and asks for thematic abstraction', () => {
    const prompt = buildCurrentWeekProgressSystemPrompt();
    expect(prompt).toContain(CURRENT_WEEK_PROGRESS_PROMPT_VERSION);
    expect(prompt).toContain('本周进展');
    expect(prompt).toMatch(/不要按(星期|日期|日)/);
    expect(prompt).toMatch(/主题|项目/);
    expect(prompt).not.toContain('必须跨周比较');
    expect(prompt).not.toContain('有几天写几天');
  });
});

describe('closed weekly freeze', () => {
  it('leaves the closed-week prompt and diary-fallback composer unchanged', () => {
    const prompt = buildWeeklySummarySystemPrompt();
    expect(prompt).toContain('weekly-summary-v2');
    expect(prompt).toContain('必须跨周比较');
    expect(prompt).toContain('有几天写几天');
    const closedFallback = composeDeterministicWeeklyContent(currentWeekEvidence());
    expect(closedFallback?.narrativeMarkdown).toContain('周一');
    expect(closedFallback?.narrativeMarkdown).toContain('周四');
  });

  it('does not rewrite historical weekly files in this change', () => {
    const weeklyCore = readFileSync(resolve(__dirname, 'weeklySummaryCore.ts'), 'utf8');
    expect(weeklyCore).toContain('必须跨周比较');
    expect(weeklyCore).toContain('有几天写几天');
    expect(weeklyCore).toContain("WEEKLY_SUMMARY_PROMPT_VERSION");
  });
});

describe('stale in-progress snapshots', () => {
  it('marks an in-progress snapshot on the weekly prompt as stale', () => {
    expect(isStaleCurrentWeekSnapshot({
      windowStartDate: '2026-09-07',
      windowEndDate: '2026-09-10',
      promptVersion: WEEKLY_SUMMARY_PROMPT_VERSION,
    })).toBe(true);
  });

  it('does not mark a closed week snapshot as stale', () => {
    expect(isStaleCurrentWeekSnapshot({
      windowStartDate: '2026-08-31',
      windowEndDate: '2026-09-06',
      promptVersion: WEEKLY_SUMMARY_PROMPT_VERSION,
    })).toBe(false);
  });
});

describe('snapshot wiring', () => {
  it('routes in-progress windows through current-week progress, not the closed weekly generator', () => {
    const snapshot = readFileSync(resolve(__dirname, 'weeklyReviewSnapshot.ts'), 'utf8');
    expect(snapshot).toContain('reviewProgressForWindow');
    expect(snapshot).toContain('isStaleCurrentWeekSnapshot');
  });
});
