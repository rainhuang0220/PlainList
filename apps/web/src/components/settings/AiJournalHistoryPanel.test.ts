import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'AiJournalHistoryPanel.vue'), 'utf8');

describe('AiJournalHistoryPanel reader', () => {
  it('is a history reader rather than a settings form or date picker', () => {
    expect(source).toContain('journal-layout');
    expect(source).toContain('每日小记');
    expect(source).toContain('每周回顾');
    expect(source).not.toContain('type="date"');
    expect(source).not.toContain('还没有每日小记。连接 ChatGPT 活动记录后，这里会按天出现。');
    expect(source).not.toContain('AUTOMATIC SOURCE');
    expect(source).not.toContain('bootstrap_skipped');
    expect(source).toContain('presentAiJournalEmpty');
  });
});
