const { mkdtemp, mkdir, writeFile, readFile, rm, chmod } = require('node:fs/promises');
const { existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const helper = join(__dirname, 'macos-install.command');
const forensicBroken = '/tmp/plainlist-forensics-20260904-170327/PlainList.app';
const CORRECT_PASSWORD = 'correct-password';

function runHelper(env, cwd, stdinText) {
  return new Promise((resolve) => {
    const child = spawn('/bin/bash', [helper], {
      cwd,
      env: { ...process.env, PLAINLIST_INSTALL_NONINTERACTIVE: '1', ...env },
      stdio: [stdinText == null ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    if (stdinText != null) {
      child.stdin.write(stdinText);
      child.stdin.end();
    }
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function makeStubApp(dir, version) {
  const app = join(dir, 'PlainList.app');
  await mkdir(join(app, 'Contents', 'MacOS'), { recursive: true });
  await writeFile(join(app, 'Contents', 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleExecutable</key><string>PlainList</string>
  <key>CFBundleIdentifier</key><string>com.plainlist.app</string>
  <key>CFBundleName</key><string>PlainList</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${version}</string>
  <key>CFBundleVersion</key><string>${version}</string>
</dict></plist>
`);
  await writeFile(join(app, 'Contents', 'MacOS', 'PlainList'), '#!/bin/bash\nexit 0\n', { mode: 0o755 });
  const signed = spawnSync('/usr/bin/codesign', ['-s', '-', '--force', '--deep', app], { encoding: 'utf8' });
  assert.equal(signed.status, 0, signed.stderr);
  return app;
}

async function makeFakeSudo(dir) {
  const stamp = join(dir, 'sudo-ok');
  const bin = join(dir, 'fake-sudo');
  await writeFile(bin, `#!/bin/bash
set -euo pipefail
STAMP=${JSON.stringify(stamp)}
if [[ "\${1:-}" == "-S" && "\${2:-}" == "-v" ]]; then
  IFS= read -r pw || exit 1
  if [[ "$pw" == ${JSON.stringify(CORRECT_PASSWORD)} ]]; then
    printf 'ok\\n' > "$STAMP"
    exit 0
  fi
  exit 1
fi
if [[ -f "$STAMP" ]]; then
  exec "$@"
fi
exit 1
`);
  await chmod(bin, 0o755);
  return bin;
}

function authEnv(overrides) {
  return {
    PLAINLIST_INSTALL_REQUIRE_AUTH: '1',
    PLAINLIST_INSTALL_PASSWORD_STDIN: '1',
    PLAINLIST_INSTALL_SKIP_LAUNCH: '1',
    ...overrides,
  };
}

test('helper file exists for the DMG installer', () => {
  assert.equal(existsSync(helper), true);
  const text = require('node:fs').readFileSync(helper, 'utf8');
  assert.match(text, /CFBundleShortVersionString/);
  assert.match(text, /2\.5\.2/);
  const authAt = text.indexOf('请输入 Mac 登录密码');
  const verifyAt = text.indexOf('codesign --verify --deep --strict');
  const copyAt = text.indexOf('正在复制');
  const replaceAt = text.indexOf('rm -rf "$DEST"', copyAt);
  assert.ok(authAt > 0);
  assert.ok(verifyAt > authAt);
  assert.ok(copyAt > verifyAt);
  assert.ok(replaceAt > copyAt);
  assert.match(text, /PLAINLIST_INSTALL_DEST/);
  assert.match(text, /密码验证失败，安装已取消/);
  assert.match(text, /剩余 \$\{remain\} 次/);
  assert.match(text, /read -s/);
  assert.doesNotMatch(text, /echo "\$pass"/);
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

test('auth case A: correct first attempt installs', async () => {
  const work = await mkdtemp(join(tmpdir(), 'pl-auth-a-'));
  const src = await makeStubApp(join(work, 'src'), '2.5.2');
  const dest = join(work, 'dest', 'PlainList.app');
  const sudo = await makeFakeSudo(work);
  try {
    const result = await runHelper(authEnv({
      PLAINLIST_INSTALL_SRC: src,
      PLAINLIST_INSTALL_DEST: dest,
      PLAINLIST_INSTALL_SUDO: sudo,
    }), work, `${CORRECT_PASSWORD}\n`);
    assert.equal(result.code, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /安装完成/);
    assert.equal(existsSync(join(dest, 'Contents', 'Info.plist')), true);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

test('auth case B: wrong then correct retries and installs', async () => {
  const work = await mkdtemp(join(tmpdir(), 'pl-auth-b-'));
  const src = await makeStubApp(join(work, 'src'), '2.5.2');
  const dest = join(work, 'dest', 'PlainList.app');
  const sudo = await makeFakeSudo(work);
  try {
    const result = await runHelper(authEnv({
      PLAINLIST_INSTALL_SRC: src,
      PLAINLIST_INSTALL_DEST: dest,
      PLAINLIST_INSTALL_SUDO: sudo,
    }), work, `nope\n${CORRECT_PASSWORD}\n`);
    assert.equal(result.code, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /剩余 2 次/);
    assert.match(result.stdout, /安装完成/);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

test('auth case C: two wrong then correct installs', async () => {
  const work = await mkdtemp(join(tmpdir(), 'pl-auth-c-'));
  const src = await makeStubApp(join(work, 'src'), '2.5.2');
  const dest = join(work, 'dest', 'PlainList.app');
  const sudo = await makeFakeSudo(work);
  try {
    const result = await runHelper(authEnv({
      PLAINLIST_INSTALL_SRC: src,
      PLAINLIST_INSTALL_DEST: dest,
      PLAINLIST_INSTALL_SUDO: sudo,
    }), work, `bad1\nbad2\n${CORRECT_PASSWORD}\n`);
    assert.equal(result.code, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /剩余 2 次/);
    assert.match(result.stdout, /剩余 1 次/);
    assert.match(result.stdout, /安装完成/);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

test('auth case D: three wrong passwords fail closed', async () => {
  const work = await mkdtemp(join(tmpdir(), 'pl-auth-d-'));
  const src = await makeStubApp(join(work, 'src'), '2.5.2');
  const destRoot = join(work, 'dest');
  const dest = join(destRoot, 'PlainList.app');
  await mkdir(dest, { recursive: true });
  await writeFile(join(dest, 'SENTINEL'), 'keep-me\n');
  const sudo = await makeFakeSudo(work);
  try {
    const result = await runHelper(authEnv({
      PLAINLIST_INSTALL_SRC: src,
      PLAINLIST_INSTALL_DEST: dest,
      PLAINLIST_INSTALL_SUDO: sudo,
    }), work, 'bad1\nbad2\nbad3\n');
    assert.notEqual(result.code, 0);
    assert.match(result.stdout, /密码验证失败，安装已取消/);
    assert.doesNotMatch(result.stdout, /安装完成/);
    assert.doesNotMatch(result.stdout, /正在复制/);
    assert.equal(await readFile(join(dest, 'SENTINEL'), 'utf8'), 'keep-me\n');
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

test('auth case E: password-looking input is never executed as a command', async () => {
  const work = await mkdtemp(join(tmpdir(), 'pl-auth-e-'));
  const src = await makeStubApp(join(work, 'src'), '2.5.2');
  const dest = join(work, 'dest', 'PlainList.app');
  await mkdir(dest, { recursive: true });
  await writeFile(join(dest, 'SENTINEL'), 'keep-me\n');
  const pwned = join(work, 'pwned');
  const sudo = await makeFakeSudo(work);
  const bomb = `touch ${pwned}`;
  try {
    const result = await runHelper(authEnv({
      PLAINLIST_INSTALL_SRC: src,
      PLAINLIST_INSTALL_DEST: dest,
      PLAINLIST_INSTALL_SUDO: sudo,
    }), work, `${bomb}\nabc123\n${bomb}\n`);
    assert.notEqual(result.code, 0);
    assert.equal(existsSync(pwned), false, 'password must not be executed as a shell command');
    assert.match(result.stdout, /密码验证失败，安装已取消/);
    assert.doesNotMatch(result.stdout, /command not found|检测不到当前指令|未知命令/);
    assert.equal(await readFile(join(dest, 'SENTINEL'), 'utf8'), 'keep-me\n');
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

test('auth case F: EOF cancels without touching destination', async () => {
  const work = await mkdtemp(join(tmpdir(), 'pl-auth-f-'));
  const src = await makeStubApp(join(work, 'src'), '2.5.2');
  const dest = join(work, 'dest', 'PlainList.app');
  await mkdir(dest, { recursive: true });
  await writeFile(join(dest, 'SENTINEL'), 'keep-me\n');
  const sudo = await makeFakeSudo(work);
  try {
    const result = await runHelper(authEnv({
      PLAINLIST_INSTALL_SRC: src,
      PLAINLIST_INSTALL_DEST: dest,
      PLAINLIST_INSTALL_SUDO: sudo,
    }), work, '');
    assert.notEqual(result.code, 0);
    assert.doesNotMatch(result.stdout, /安装完成/);
    assert.equal(await readFile(join(dest, 'SENTINEL'), 'utf8'), 'keep-me\n');
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});
