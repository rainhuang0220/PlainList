import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const page = readFileSync(resolve(__dirname, '../../../public/download/index.html'), 'utf8');
const dmg = readFileSync(resolve(__dirname, '../../../scripts/build-dmg.sh'), 'utf8');
const desktop = readFileSync(resolve(__dirname, '../../../scripts/build-desktop-release.sh'), 'utf8');
const builder = readFileSync(resolve(__dirname, '../../../electron-builder.yml'), 'utf8');
const android = readFileSync(resolve(__dirname, '../../../scripts/build-android-release.sh'), 'utf8');
const nginx = readFileSync(resolve(__dirname, '../../../../../deploy/nginx-download.inc'), 'utf8');
const getHost = readFileSync(resolve(__dirname, '../../../../../deploy/nginx-get.plainlist.space.conf'), 'utf8');
const ipRedirect = readFileSync(resolve(__dirname, '../../../../../deploy/nginx-ip-root-redirect.inc'), 'utf8');

describe('v3.0.0 download distribution', () => {
  it('does not hardcode artifact URLs on the public download page', () => {
    expect(page).toContain('下载 PlainList');
    expect(page).toContain('/releases/latest.json');
    expect(page).toContain('适合这台设备');
    expect(page).toContain('Windows — 暂未提供');
    expect(page).toContain('IBM Plex Mono');
    expect(page).toContain('button(arm');
    expect(page).toContain('button(intel');
    expect(page).toContain('button(android');
    expect(page).toContain("'下载 v' + manifest.version");
    expect(page).toContain('将 PlainList 拖入“应用程序”');
    expect(page).toContain('系统设置 → 隐私与安全性 → 仍要打开');
    expect(page).not.toContain('macOS 版本正在更新，请稍后');
    expect(page).not.toContain('双击安装');
    expect(page).not.toContain('双击「安装 PlainList」');
    expect(page).not.toContain('xattr');
    expect(page).not.toContain('175.24.134.228');
    expect(page).not.toContain('PlainList-2.4.0');
    expect(page).toContain('iPhone|iPad|iPod');
  });

  it('names macOS and Android artifacts with platform and product version', () => {
    expect(dmg).toContain('macos-${ARCH}');
    expect(dmg).toContain('read-product-version.cjs');
    expect(dmg).not.toContain('PLAINLIST_VERSION:-2.4.0');
    expect(builder).toContain('${productName}-${version}-macos-${arch}.${ext}');
    expect(android).toContain('PlainList-${VERSION}-android.apk');
    expect(android).not.toContain('PLAINLIST_VERSION:-2.4.0');
    expect(desktop).toContain('sign-adhoc.sh');
    expect(desktop).toContain('verify-macos-app.sh');
  });

  it('ships a drag-to-Applications DMG with no installer helper', () => {
    expect(dmg).toContain('ln -s /Applications');
    expect(dmg).not.toContain('macos-install.command');
    expect(dmg).not.toContain('① 双击我安装并打开.command');
    expect(dmg).not.toContain('安装并打开.command');
    expect(dmg).not.toContain('安装 PlainList.command');
    expect(page).toContain('button(arm');
    expect(page).toContain('button(intel');
  });

  it('keeps a single canonical download page and short-caches the manifest', () => {
    expect(nginx).toContain('try_files /download/index.html =404');
    expect(nginx).toContain('alias /www/wwwroot/plainlist-downloads/latest.json');
    expect(nginx).toContain('max-age=60, must-revalidate');
    expect(getHost).toContain('server_name get.plainlist.space');
    expect(getHost).toContain('return 308 https://plainlist.space/download');
    expect(ipRedirect).toContain('return 308 https://plainlist.space/download');
    expect(ipRedirect).not.toContain('try_files /index.html');
  });
});
