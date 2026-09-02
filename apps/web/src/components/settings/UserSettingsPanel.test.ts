import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'UserSettingsPanel.vue'), 'utf8');

describe('UserSettingsPanel AI journal entry', () => {
  it('places AI 小记 in settings instead of adding a primary navigation item', () => {
    expect(source).toContain("label: 'AI 小记'");
    expect(source).toContain('AiJournalHistoryPanel');
    expect(source).toContain("switchSection('ai-journal')");
  });
});
