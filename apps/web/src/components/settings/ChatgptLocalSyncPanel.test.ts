import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'ChatgptLocalSyncPanel.vue'), 'utf8');

describe('ChatgptLocalSyncPanel layout', () => {
  it('does not reserve a technical status ledger or duplicate importer header', () => {
    expect(source).not.toContain('AUTOMATIC SOURCE');
    expect(source).not.toContain('source-ledger');
    expect(source).not.toContain('自动同步');
    expect(source).not.toContain('<h3>ChatGPT 活动记录</h3>');
    expect(source).not.toMatch(/<span>连接<\/span>/);
    expect(source).not.toMatch(/<span>资料库<\/span>/);
  });

  it('keeps a living connected state and an AI journal entry', () => {
    expect(source).toContain('连接本地资料库');
    expect(source).toContain('查看 AI 小记');
    expect(source).toContain('下载 Desktop');
    expect(source).toContain('chatgpt-local-sync');
    expect(source).toContain('v-if="hasActions"');
  });

  it('keeps one primary action and compact secondary controls', () => {
    expect(source).toContain('class="ghost"');
    expect(source).toContain('count-line');
    expect(source).toContain('height: 32px');
  });
});
