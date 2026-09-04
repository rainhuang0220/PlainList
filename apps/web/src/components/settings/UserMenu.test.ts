import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const menu = readFileSync(resolve(__dirname, 'UserMenu.vue'), 'utf8');
const settings = readFileSync(resolve(__dirname, 'UserSettingsPanel.vue'), 'utf8');
const app = readFileSync(resolve(__dirname, '../../app/App.vue'), 'utf8');
const chatgpt = readFileSync(resolve(__dirname, 'ChatgptLocalSyncPanel.vue'), 'utf8');

describe('user settings download entry', () => {
  it('removes 下载 PlainList from the user-settings menu', () => {
    expect(menu).toContain("t('settings.menu_settings', '用户设置')");
    expect(menu).not.toContain('productDownloadHref');
    expect(menu).not.toContain('downloadHref');
    expect(menu).not.toMatch(/<a class="user-menu-item"[^>]*>下载/);
    expect(settings).not.toContain('下载 PlainList');
    expect(settings).not.toContain('productDownloadHref');
  });

  it('keeps the public download surfaces that are not user settings', () => {
    expect(app).toContain('下载 PlainList');
    expect(chatgpt).toContain('下载 Desktop');
  });
});
