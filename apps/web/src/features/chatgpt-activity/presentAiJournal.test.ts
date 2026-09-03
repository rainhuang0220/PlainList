import { describe, expect, it } from 'vitest';
import { presentAiJournalEmpty, presentJournalDate, presentWeekRange } from './presentAiJournal';

describe('presentAiJournalEmpty', () => {
  it('does not use a single empty copy for every connection state', () => {
    expect(presentAiJournalEmpty('not_connected').title).toContain('尚未连接');
    expect(presentAiJournalEmpty('bootstrapping', { processed: 3, checked: 10 }).body).toContain('3 / 10');
    expect(presentAiJournalEmpty('no_activity').title).toContain('还没有已结束的周回顾');
    expect(presentAiJournalEmpty('ready').title).toBe('还没有已结束的周回顾。');
    expect(presentAiJournalEmpty('ready').title).not.toContain('每日小记');
  });
});

describe('presentJournalDate', () => {
  it('uses today/yesterday labels instead of a raw date input', () => {
    expect(presentJournalDate('2026-09-02', '2026-09-02').primary).toBe('今天');
    expect(presentJournalDate('2026-09-01', '2026-09-02').primary).toBe('昨天');
    expect(presentJournalDate('2026-08-30', '2026-09-02').primary).toBe('8 月 30 日');
    expect(presentWeekRange('2026-08-24', '2026-08-30')).toBe('8 月 24 日–8 月 30 日');
  });
});
