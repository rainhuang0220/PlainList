import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'ChatgptLocalSyncPanel.vue'), 'utf8');

describe('ChatgptLocalSyncPanel layout', () => {
  it('is a compact source status section, not a dashboard', () => {
    expect(source).not.toContain('<section');
    expect(source).not.toContain('AUTOMATIC SOURCE');
    expect(source).not.toContain('source-ledger');
    expect(source).not.toContain('activity-source-card');
    expect(source).not.toContain('activity-card');
    expect(source).not.toContain('<h3>ChatGPT 活动记录</h3>');
    expect(source).not.toContain('height: 32px');
    expect(source).not.toContain('min-height');
    expect(source).not.toContain('flex: 1');
    expect(source).not.toContain('!important');
    expect(source).not.toContain('max-width: 520px');
    expect(source).not.toContain('us-modal--compact');
    expect(source).not.toContain('us-modal--reader');
    expect(source).not.toContain('us-modal--activity');
    expect(source).not.toContain('height: calc');
    expect(source).toContain('class="sync-block"');
    expect(source).toContain('display: block');
    expect(source).toMatch(/<div class="sync-block">[\s\S]*<div class="actions">/);
  });

  it('keeps a living connected state and an AI journal entry', () => {
    expect(source).toContain('连接本地资料库');
    expect(source).toContain('查看周度洞察');
    expect(source).not.toContain('AI 小记');
    expect(source).toContain('下载 Desktop');
    expect(source).toContain('立即检查');
    expect(source).toContain('重新选择资料库');
    expect(source).toContain('settings-btn-primary');
    expect(source).toContain('settings-btn-secondary');
    expect(source).toContain('text-link');
    expect(source).not.toContain('class="btn-primary"');
  });

  it('does not leave desktop folder controls on web', () => {
    expect(source).toContain('v-if="isDesktop && !rootName"');
    expect(source).toContain('v-if="isDesktop && rootName"');
    expect(source).toContain('card.showDesktopDownload');
  });
});
