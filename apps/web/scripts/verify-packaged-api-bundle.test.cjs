const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const { createPackage } = require('@electron/asar');
const test = require('node:test');

const verifier = join(__dirname, 'verify-packaged-api-bundle.cjs');

async function packagedApp({ renderer, main }) {
  const root = mkdtempSync(join(tmpdir(), 'plainlist-packaged-api-'));
  const source = join(root, 'source');
  const assets = join(source, 'dist', 'assets');
  mkdirSync(assets, { recursive: true });
  mkdirSync(join(source, 'electron'));
  writeFileSync(join(assets, 'index.js'), renderer);
  writeFileSync(join(source, 'electron', 'main.cjs'), main);
  const asarPath = join(root, 'PlainList.app', 'Contents', 'Resources', 'app.asar');
  mkdirSync(join(asarPath, '..'), { recursive: true });
  await createPackage(source, asarPath);
  return join(root, 'PlainList.app');
}

test('accepts a packaged app whose renderer uses the canonical host and whose main process preserves system proxy settings', async () => {
  const appPath = await packagedApp({
    renderer: "const apiOrigin = 'https://plainlist.space';",
    main: 'app.whenReady().then(createMainWindow);',
  });
  const result = spawnSync(process.execPath, [verifier, appPath], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('rejects a packaged app that forces direct proxy mode', async () => {
  const appPath = await packagedApp({
    renderer: "const apiOrigin = 'https://plainlist.space';",
    main: "session.defaultSession.setProxy({ mode: 'direct' });",
  });
  const result = spawnSync(process.execPath, [verifier, appPath], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /system proxy settings/);
});
