import { describe, expect, it } from 'vitest';
import { applyWeeklyReaderScrollReset } from './resetWeeklyReaderScroll';

describe('applyWeeklyReaderScrollReset', () => {
  it('sets reader.scrollTop to 0 when the selected week changes', () => {
    const reader = { scrollTop: 240 };
    applyWeeklyReaderScrollReset(reader, '2026-08-18', '2026-08-25');
    expect(reader.scrollTop).toBe(0);
  });

  it('also resets when switching back to a previously scrolled week', () => {
    const reader = { scrollTop: 180 };
    applyWeeklyReaderScrollReset(reader, '2026-08-25', '2026-08-18');
    expect(reader.scrollTop).toBe(0);
  });

  it('does not reset when the same week is rerendered', () => {
    const reader = { scrollTop: 240 };
    applyWeeklyReaderScrollReset(reader, '2026-08-25', '2026-08-25');
    expect(reader.scrollTop).toBe(240);
  });

  it('does nothing when the reader node is missing', () => {
    expect(() => applyWeeklyReaderScrollReset(null, '2026-08-18', '2026-08-25')).not.toThrow();
  });
});
