import { describe, expect, it } from 'vitest';
import { chatgptActivityReconcileSchema } from './chatgpt-activity';

describe('chatgpt activity reconcile contract', () => {
  it('accepts only compact dates and sync statistics', () => {
    expect(chatgptActivityReconcileSchema.parse({
      affectedDates: ['2026-08-31', '2026-09-01'],
      finalizeThrough: '2026-08-31',
      checked: 8,
      changed: 2,
      skipped: 6,
    })).toEqual({
      affectedDates: ['2026-08-31', '2026-09-01'],
      finalizeThrough: '2026-08-31',
      checked: 8,
      changed: 2,
      skipped: 6,
    });
  });

  it.each(['messages', 'transcript', 'rawMarkdown', 'cookie', 'session'])('rejects forbidden raw field %s', (field) => {
    expect(chatgptActivityReconcileSchema.safeParse({
      affectedDates: ['2026-09-01'],
      checked: 1,
      changed: 1,
      skipped: 0,
      [field]: ['secret raw content'],
    }).success).toBe(false);
  });
});
