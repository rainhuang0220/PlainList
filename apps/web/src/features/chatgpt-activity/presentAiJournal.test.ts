import { describe, expect, it } from 'vitest';
import { presentAiJournalEmpty, presentJournalDate, presentWeekRange } from './presentAiJournal';

describe('presentAiJournalEmpty', () => {
  it('does not use a single empty copy for every connection state', () => {
    expect(presentAiJournalEmpty('not_connected', 'daily').title).toContain('尚未连接');
    expect(presentAiJournalEmpty('bootstrapping', 'daily', { processed: 3, checked: 10 }).body).toContain('3 / 10');
    expect(presentAiJournalEmpty('no_activity', 'daily').title).toContain('没有需要记录');
    expect(presentAiJournalEmpty('ready', 'daily').title).not.toBe('还没有每日小记。连接 ChatGPT 活动记录后，这里会按天出现。');
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
