import { describe, expect, it } from 'vitest';
import { effectiveMinutes } from './effectiveMinutes';

describe('effectiveMinutes', () => {
  const plan = { id: 1, type: 'todo' as const, name: 'x', time: '09:00', sortOrder: 0, durationMinutes: 30 };

  it('returns null when not done', () => {
    expect(effectiveMinutes(plan, { done: false })).toBeNull();
  });

  it('prefers actualMinutes when done', () => {
    expect(effectiveMinutes(plan, { done: true, actualMinutes: 45 })).toBe(45);
  });

  it('falls back to plan duration when done and actual empty', () => {
    expect(effectiveMinutes(plan, { done: true })).toBe(30);
  });

  it('returns null for reminder-only completed item', () => {
    expect(effectiveMinutes({ ...plan, durationMinutes: null }, { done: true })).toBeNull();
  });
});
