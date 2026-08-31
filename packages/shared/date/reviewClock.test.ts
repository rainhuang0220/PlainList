import { describe, expect, it } from 'vitest';
import { createReviewClock, reviewWindowFor } from './reviewClock';

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
