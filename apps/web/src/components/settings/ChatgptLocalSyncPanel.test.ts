import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'ChatgptLocalSyncPanel.vue'), 'utf8');

describe('ChatgptLocalSyncPanel layout', () => {
  it('does not keep the failed importer dashboard', () => {
    expect(source).not.toContain('AUTOMATIC SOURCE');
    expect(source).not.toContain('source-ledger');
    expect(source).not.toContain('activity-source-card');
    expect(source).not.toContain('activity-card');
    expect(source).not.toContain('<h3>ChatGPT 活动记录</h3>');
    expect(source).not.toMatch(/<span>连接<\/span>/);
    expect(source).not.toContain('height: 32px');
    expect(source).not.toContain('min-height');
    expect(source).not.toContain('!important');
  });

  it('keeps a living connected state and an AI journal entry', () => {
    expect(source).toContain('连接本地资料库');
    expect(source).toContain('查看 AI 小记');
    expect(source).toContain('下载 Desktop');
    expect(source).toContain('立即检查');
    expect(source).toContain('重新选择资料库');
    expect(source).toContain('btn-primary');
    expect(source).toContain('btn-secondary');
  });

  it('does not leave desktop folder controls on web', () => {
    expect(source).toContain('v-if="isDesktop && !rootName"');
    expect(source).toContain('v-if="isDesktop && rootName"');
    expect(source).toContain('card.showDesktopDownload');
  });
});
