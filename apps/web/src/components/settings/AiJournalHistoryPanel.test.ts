import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'AiJournalHistoryPanel.vue'), 'utf8');

describe('AiJournalHistoryPanel reader', () => {
  it('is a closed-week Weekly Summary reader, not a daily journal', () => {
    expect(source).not.toContain('每日小记');
    expect(source).not.toContain("tab === 'daily'");
    expect(source).not.toContain('selectedDaily');
    expect(source).not.toContain('result.daily');
    expect(source).toContain('weekly');
    expect(source).toContain('presentWeekRange');
    expect(source).not.toContain('type="date"');
    expect(source).not.toContain('journal-intro');
    expect(source).not.toContain('AUTOMATIC SOURCE');
    expect(source).not.toContain('bootstrap_skipped');
    expect(source).not.toContain('previewText');
    expect(source).not.toContain('journal-meta');
    expect(source).toContain('presentAiJournalEmpty');
    expect(source).toContain('renderSafeMarkdown');
  });

  it('uses a week list beside the reader only when closed weeks exist', () => {
    expect(source).toContain("class=\"layout\" :class=\"{ 'has-index': weekly.length }\"");
    expect(source).toContain('grid-template-columns: 148px minmax(0, 1fr)');
    expect(source).not.toContain('journal-shell');
    expect(source).not.toContain('!important');
    expect(source).not.toContain('height: calc');
    expect(source).toContain('@media (max-width: 768px)');
  });
});
