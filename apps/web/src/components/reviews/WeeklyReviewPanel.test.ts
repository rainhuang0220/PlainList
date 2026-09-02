import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'WeeklyReviewPanel.vue'), 'utf8');

describe('WeeklyReviewPanel first-week copy', () => {
  it('does not hardcode the first-week sentence for every empty previous summary', () => {
    expect(source).toContain('previousMissingCopy');
    expect(source).toContain('previousWeekState');
    expect(source).toContain('上周回顾正在准备');
    expect(source).toContain('这是你的第一个自然周，还没有上周回顾。');
  });

  it('labels the previous closed natural week as 上周回顾, not 本周回顾', () => {
    expect(source).toContain("t('week.page.previous', '上周回顾')");
    expect(source).toContain("t('week.page.current', '本周进展')");
    expect(source).not.toMatch(/t\('week\.page\.previous',\s*'本周回顾'\)/);
    expect(source).not.toMatch(/<h3>\{\{\s*t\('week\.page\.previous'[^}]*本周回顾/);
  });
});
