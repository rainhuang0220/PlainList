import { describe, expect, it } from 'vitest';
import { buildReminderSchedules } from './planReminders';

describe('buildReminderSchedules', () => {
  const now = new Date('2026-08-11T10:00:00');

  it('schedules future todos with date+time', () => {
    const items = buildReminderSchedules(
      [
        {
          id: 42,
          type: 'todo',
          name: 'Submit report',
          time: '15:30',
          scheduledDate: '2026-08-11',
        },
      ],
      now,
    );
    expect(items).toHaveLength(1);
    expect(items[0].planId).toBe(42);
    expect(items[0].body).toBe('Submit report');
    expect(items[0].at.toISOString()).toBe(new Date('2026-08-11T15:30:00').toISOString());
  });

  it('skips past todos, habits, and incomplete todos', () => {
    const items = buildReminderSchedules(
      [
        { id: 1, type: 'todo', name: 'Past', time: '09:00', scheduledDate: '2026-08-11' },
        { id: 2, type: 'habit', name: 'Run', time: '18:00' },
        { id: 3, type: 'todo', name: 'No date', time: '18:00' },
      ],
      now,
    );
    expect(items).toEqual([]);
  });

  it('uses deterministic notification ids derived from plan id', () => {
    const [item] = buildReminderSchedules(
      [{ id: 7, type: 'todo', name: 'X', time: '20:00', scheduledDate: '2026-08-12' }],
      now,
    );
    expect(item.id).toBe(100000 + 7);
  });
});
