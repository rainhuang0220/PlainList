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

  it('resets the right reader to the top when the selected week changes', () => {
    expect(source).toContain('ref="readerRef"');
    expect(source).toContain('watch(selectedWeek');
    expect(source).toContain('applyWeeklyReaderScrollReset');
    expect(source).toContain('readerRef.value');
    expect(source).not.toContain('window.scrollTo');
  });

  it('fills the settings body with a week rail and a stretching article', () => {
    expect(source).not.toContain('<section');
    expect(source).not.toContain('<nav');
    expect(source).toContain('class="weekly-insight"');
    expect(source).toContain('class="frame"');
    expect(source).toContain('class="weeks"');
    expect(source).toContain('class="article"');
    expect(source).toContain('flex: 1 1 auto');
    expect(source).toContain('min-width: 0');
    expect(source).not.toMatch(/\.article \{[^}]*max-width/s);
    expect(source).not.toMatch(/\.prose \{[^}]*max-width/s);
    expect(source).not.toContain('148px');
    expect(source).not.toContain('7.5rem');
    expect(source).not.toContain('journal-shell');
    expect(source).not.toContain('!important');
    expect(source).not.toContain('height: calc');
    expect(source).not.toContain('us-modal--reader');
    expect(source).not.toContain('us-modal--activity');
    expect(source).not.toContain('us-modal--compact');
    expect(source).not.toContain('--journal');
    expect(source).toContain('@media (max-width: 768px)');
  });
});
