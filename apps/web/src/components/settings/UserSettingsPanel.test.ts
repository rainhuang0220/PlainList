import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'UserSettingsPanel.vue'), 'utf8');

describe('UserSettingsPanel AI journal entry', () => {
  it('places 周度洞察 in settings instead of adding a primary navigation item', () => {
    expect(source).toContain("label: '周度洞察'");
    expect(source).not.toContain('AI 小记');
    expect(source).toContain('AiJournalHistoryPanel');
    expect(source).toContain("switchSection('ai-journal')");
    expect(source).toContain('aria-label="关闭"');
  });

  it('keeps ChatGPT and weekly insight on the same settings modal as Account', () => {
    expect(source).not.toContain('us-modal--compact');
    expect(source).not.toContain('us-main-body--compact');
    expect(source).toContain('width: 860px');
    expect(source).toContain('height: 640px');
    expect(source).toContain('us-main-body--journal');
    expect(source).toContain('us-modal--reader');
    expect(source).toContain('us-modal--activity');
  });

  it('widens the weekly reader and lets the activity card hug its content', () => {
    expect(source).toContain('width: min(1020px, calc(100vw - 48px))');
    expect(source).toContain('padding: 12px 16px 16px');
    expect(source).toContain('.us-modal--activity {\n  height: auto;\n  align-items: flex-start;\n}');
    expect(source).toContain('.us-modal--activity .us-main-body {\n  flex: 0 0 auto;\n  overflow: visible;\n}');
    expect(source).not.toContain('us-modal--compact');
  });
});
