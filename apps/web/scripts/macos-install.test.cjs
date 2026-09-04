const { mkdtemp, mkdir, writeFile, readFile, rm } = require('node:fs/promises');
const { existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawn } = require('node:child_process');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const helper = join(__dirname, 'macos-install.command');
const forensicBroken = '/tmp/plainlist-forensics-20260904-170327/PlainList.app';

function runHelper(env, cwd) {
  return new Promise((resolve) => {
    const child = spawn('/bin/bash', [helper], {
      cwd,
      env: { ...process.env, PLAINLIST_INSTALL_NONINTERACTIVE: '1', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('helper file exists for the DMG installer', () => {
  assert.equal(existsSync(helper), true);
  const text = require('node:fs').readFileSync(helper, 'utf8');
  assert.match(text, /CFBundleShortVersionString/);
  assert.match(text, /2\.5\.1/);
  const verifyAt = text.indexOf('codesign --verify --deep --strict');
  const copyAt = text.indexOf('正在复制');
  const replaceAt = text.indexOf('rm -rf "$DEST"', copyAt);
  assert.ok(verifyAt > 0);
  assert.ok(copyAt > verifyAt);
  assert.ok(replaceAt > copyAt);
  assert.match(text, /PLAINLIST_INSTALL_DEST/);
  assert.doesNotMatch(text, /^完成/m);
  const successAt = text.indexOf('安装完成');
  assert.ok(successAt > replaceAt);
});

test('fail-closed: linker-signed 2.5.0 does not replace an existing destination', async () => {
  assert.equal(existsSync(forensicBroken), true, 'forensic 2.5.0 app must remain for this test');
  const work = await mkdtemp(join(tmpdir(), 'plainlist-helper-qa-'));
  const destRoot = await mkdtemp(join(tmpdir(), 'plainlist-helper-dest-'));
  const dest = join(destRoot, 'PlainList.app');
  try {
    await mkdir(dest, { recursive: true });
    await writeFile(join(dest, 'SENTINEL'), 'keep-me\n');
    const result = await runHelper({
      PLAINLIST_INSTALL_SRC: forensicBroken,
      PLAINLIST_INSTALL_DEST: dest,
    }, work);
    assert.notEqual(result.code, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /已损坏|2\.5\.0|linker-signed|校验失败/);
    assert.doesNotMatch(result.stdout, /安装完成/);
    assert.equal(await readFile(join(dest, 'SENTINEL'), 'utf8'), 'keep-me\n');
  } finally {
    await rm(work, { recursive: true, force: true });
    await rm(destRoot, { recursive: true, force: true });
  }
});
