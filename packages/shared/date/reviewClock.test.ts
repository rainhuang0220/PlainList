import { describe, expect, it } from 'vitest';
import { createReviewClock, reviewWindowFor, weeklyReviewPageFor } from './reviewClock';

describe('reviewWindowFor', () => {
  // A regression in either Monday handling or the cutoff must fail this table.
  it.each([
    ['Monday closes the preceding calendar week', '2026-08-31', '2026-08-24', '2026-08-30'],
    ['Tuesday includes only this Monday', '2026-09-01', '2026-08-31', '2026-08-31'],
    ['Wednesday includes Monday and Tuesday', '2026-09-02', '2026-08-31', '2026-09-01'],
    ['Sunday excludes the still-open Sunday', '2026-09-06', '2026-08-31', '2026-09-05'],
    ['the next Monday creates a distinct final prior-week window', '2026-09-07', '2026-08-31', '2026-09-06'],
  ])('%s', (_label, asOfDate, windowStartDate, windowEndDate) => {
    expect(reviewWindowFor(asOfDate)).toEqual({
      reviewAsOfDate: asOfDate,
      windowStartDate,
      windowEndDate,
    });
  });
});

describe('weeklyReviewPageFor', () => {
  it('on Monday shows the previous closed week and zero current completed days', () => {
    expect(weeklyReviewPageFor('2026-09-07')).toEqual({
      asOfDate: '2026-09-07',
      isMonday: true,
      currentWeekStart: '2026-09-07',
      currentWeekEnd: '2026-09-13',
      currentCompletedStart: null,
      currentCompletedEnd: null,
      previousClosedStart: '2026-08-31',
      previousClosedEnd: '2026-09-06',
      completedDays: [],
    });
  });

  it('on Tuesday includes only Monday in the current-week completed range', () => {
    expect(weeklyReviewPageFor('2026-09-08')).toMatchObject({
      isMonday: false,
      currentWeekStart: '2026-09-07',
      currentWeekEnd: '2026-09-13',
      currentCompletedStart: '2026-09-07',
      currentCompletedEnd: '2026-09-07',
      previousClosedStart: '2026-08-31',
      previousClosedEnd: '2026-09-06',
      completedDays: ['2026-09-07'],
    });
  });

  it('on Thursday includes Monday through Wednesday', () => {
    expect(weeklyReviewPageFor('2026-09-10').completedDays).toEqual([
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
    ]);
  });

  it('on Sunday excludes the still-open Sunday from completed current-week days', () => {
    const page = weeklyReviewPageFor('2026-09-13');
    expect(page.currentCompletedEnd).toBe('2026-09-12');
    expect(page.completedDays).toEqual([
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
    ]);
    expect(page.completedDays).not.toContain('2026-09-13');
  });

  it('on the next Monday closes Sep 7-13 as the previous week', () => {
    expect(weeklyReviewPageFor('2026-09-14')).toMatchObject({
      isMonday: true,
      currentWeekStart: '2026-09-14',
      currentWeekEnd: '2026-09-20',
      previousClosedStart: '2026-09-07',
      previousClosedEnd: '2026-09-13',
      completedDays: [],
    });
  });
});

describe('ReviewClock', () => {
  it('uses the configured IANA timezone instead of the server timezone', () => {
    const clock = createReviewClock({
      timezone: 'Asia/Shanghai',
      now: () => new Date('2026-08-31T16:00:00.000Z'),
    });

    expect(clock.currentDateKey()).toBe('2026-09-01');
    expect(clock.reviewWindow()).toEqual({
      reviewAsOfDate: '2026-09-01',
      windowStartDate: '2026-08-31',
      windowEndDate: '2026-08-31',
    });
  });

  it('changes reviewAsOfDate exactly at app-local midnight', () => {
    const beforeMidnight = createReviewClock({
      timezone: 'Asia/Shanghai',
      now: () => new Date('2026-08-31T15:59:59.000Z'),
    });
    const atMidnight = createReviewClock({
      timezone: 'Asia/Shanghai',
      now: () => new Date('2026-08-31T16:00:00.000Z'),
    });

    expect(beforeMidnight.currentDateKey()).toBe('2026-08-31');
    expect(atMidnight.currentDateKey()).toBe('2026-09-01');
    expect(beforeMidnight.millisecondsUntilNextMidnight()).toBe(1_000);
  });
});
