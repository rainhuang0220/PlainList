const { mkdtemp, mkdir, writeFile, readFile, rm, chmod } = require('node:fs/promises');
const { existsSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const helper = join(__dirname, 'macos-install.command');
const ptyHarness = join(__dirname, 'macos-install.pty-harness.py');
const forensicBroken = '/tmp/plainlist-forensics-20260904-170327/PlainList.app';
const PRODUCT_VERSION = '2.5.3';
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
  const log = join(dir, 'sudo-args.log');
  const bin = join(dir, 'fake-sudo');
  await writeFile(bin, `#!/bin/bash
set -euo pipefail
STAMP=${JSON.stringify(stamp)}
LOG=${JSON.stringify(log)}
printf 'ARGS:%s\\n' "$*" >> "$LOG"
if [[ "\${1:-}" == "-v" ]]; then
  tries=0
  while (( tries < 3 )); do
    tries=$((tries + 1))
    printf 'Password:' >&2
    IFS= read -r pw || exit 1
    if [[ "$pw" == ${JSON.stringify(CORRECT_PASSWORD)} ]]; then
      : > "$STAMP"
      exit 0
    fi
    echo 'Sorry, try again.' >&2
  done
  echo 'sudo: 3 incorrect password attempts' >&2
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

function runPtyCase(name, extraEnv, sends) {
  const env = {
    ...process.env,
    PLAINLIST_PTY_CASE: name,
    ...extraEnv,
  };
  delete env.PLAINLIST_INSTALL_NONINTERACTIVE;
  delete env.PLAINLIST_INSTALL_PASSWORD_STDIN;
  env.TERM_PROGRAM = 'test-harness';
  const result = spawnSync('/usr/bin/python3', [ptyHarness, JSON.stringify(sends)], {
    encoding: 'utf8',
    env,
    timeout: 25000,
  });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

test('helper file exists and uses OS-owned sudo, not a custom password parser', () => {
  assert.equal(existsSync(helper), true);
  const text = readFileSync(helper, 'utf8');
  assert.match(text, /CFBundleShortVersionString/);
  assert.match(text, /2\.5\.3/);
  assert.match(text, /PLAINLIST_INSTALL_DEST/);
  assert.match(text, /密码验证失败，安装已取消/);
  assert.match(text, /dest_needs_privilege/);
  assert.match(text, /"\$SUDO" -v/);
  assert.match(text, /wait_for_enter/);
  assert.match(text, /close_this_terminal_window/);
  assert.doesNotMatch(text, /sudo -S/);
  assert.doesNotMatch(text, /read -s/);
  assert.doesNotMatch(text, /PASSWORD_STDIN/);
  assert.doesNotMatch(text, /AUTH_TRIES/);
  assert.doesNotMatch(text, /read_password/);
  assert.doesNotMatch(text, /echo "\$pass"/);
  assert.doesNotMatch(text, /剩余 \$\{remain\} 次/);
  const authAt = text.indexOf('authenticate_admin');
  const verifyAt = text.indexOf('codesign --verify --deep --strict');
  const copyAt = text.indexOf('正在复制');
  const replaceAt = text.indexOf('rm -rf "$DEST"', copyAt);
  assert.ok(authAt > 0);
  assert.ok(verifyAt > authAt);
  assert.ok(copyAt > verifyAt);
  assert.ok(replaceAt > copyAt);
  const successAt = text.indexOf('安装完成');
  assert.ok(successAt > replaceAt);
});

test('DMG builder ships the download-page installer name as an alias', () => {
  const text = readFileSync(join(__dirname, 'build-dmg.sh'), 'utf8');
  assert.match(text, /① 双击我安装并打开\.command/);
  assert.match(text, /安装并打开\.command/);
  assert.match(text, /安装 PlainList\.command/);
  assert.match(text, /请先双击安装\.txt/);
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
    assert.match(`${result.stdout}\n${result.stderr}`, /已损坏|2\.5\.0|linker-signed|校验失败|版本必须是/);
    assert.doesNotMatch(result.stdout, /安装完成/);
    assert.equal(await readFile(join(dest, 'SENTINEL'), 'utf8'), 'keep-me\n');
  } finally {
    await rm(work, { recursive: true, force: true });
    await rm(destRoot, { recursive: true, force: true });
  }
});

test('writable dest skips sudo and installs', async () => {
  const work = await mkdtemp(join(tmpdir(), 'pl-helper-writable-'));
  try {
    const src = await makeStubApp(join(work, 'src'), PRODUCT_VERSION);
    const dest = join(work, 'dest', 'PlainList.app');
    const sudo = await makeFakeSudo(work);
    const result = await runHelper({
      PLAINLIST_INSTALL_SRC: src,
      PLAINLIST_INSTALL_DEST: dest,
      PLAINLIST_INSTALL_SUDO: sudo,
      PLAINLIST_INSTALL_SKIP_LAUNCH: '1',
    }, work);
    assert.equal(result.code, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /安装完成/);
    assert.equal(existsSync(join(dest, 'Contents', 'Info.plist')), true);
    assert.equal(existsSync(join(work, 'sudo-ok')), false);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

test('PTY auth case A: correct first attempt installs', async () => {
  const work = await mkdtemp(join(tmpdir(), 'pl-auth-a-'));
  try {
    const src = await makeStubApp(join(work, 'src'), PRODUCT_VERSION);
    const dest = join(work, 'dest', 'PlainList.app');
    const sudo = await makeFakeSudo(work);
    const result = runPtyCase('A', {
      PLAINLIST_INSTALL_SRC: src,
      PLAINLIST_INSTALL_DEST: dest,
      PLAINLIST_INSTALL_SUDO: sudo,
      PLAINLIST_INSTALL_REQUIRE_AUTH: '1',
      PLAINLIST_INSTALL_SKIP_LAUNCH: '1',
      PLAINLIST_PTY_PARENT: '0',
    }, [
      { wait: 'Password:', send: `${CORRECT_PASSWORD}\n` },
      { wait: '按回车关闭此窗口', send: '\n' },
    ]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /安装完成/);
    assert.match(result.stdout, /Password:/);
    assert.doesNotMatch(result.stdout, /请输入 Mac 登录密码/);
    assert.equal(existsSync(join(dest, 'Contents', 'Info.plist')), true);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

test('PTY auth case B: wrong then correct stays in OS auth and installs', async () => {
  const work = await mkdtemp(join(tmpdir(), 'pl-auth-b-'));
  try {
    const src = await makeStubApp(join(work, 'src'), PRODUCT_VERSION);
    const dest = join(work, 'dest', 'PlainList.app');
    const sudo = await makeFakeSudo(work);
    const result = runPtyCase('B', {
      PLAINLIST_INSTALL_SRC: src,
      PLAINLIST_INSTALL_DEST: dest,
      PLAINLIST_INSTALL_SUDO: sudo,
      PLAINLIST_INSTALL_REQUIRE_AUTH: '1',
      PLAINLIST_INSTALL_SKIP_LAUNCH: '1',
      PLAINLIST_PTY_PARENT: '0',
    }, [
      { wait: 'Password:', send: 'nope\n' },
      { wait: 'Sorry, try again.', send: `${CORRECT_PASSWORD}\n` },
      { wait: '按回车关闭此窗口', send: '\n' },
    ]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Sorry, try again/);
    assert.match(result.stdout, /安装完成/);
    assert.doesNotMatch(result.stdout, /command not found|检测不到当前指令|找不到命令|找不到指令/);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

test('PTY auth case C: two wrong then correct installs', async () => {
  const work = await mkdtemp(join(tmpdir(), 'pl-auth-c-'));
  try {
    const src = await makeStubApp(join(work, 'src'), PRODUCT_VERSION);
    const dest = join(work, 'dest', 'PlainList.app');
    const sudo = await makeFakeSudo(work);
    const result = runPtyCase('C', {
      PLAINLIST_INSTALL_SRC: src,
      PLAINLIST_INSTALL_DEST: dest,
      PLAINLIST_INSTALL_SUDO: sudo,
      PLAINLIST_INSTALL_REQUIRE_AUTH: '1',
      PLAINLIST_INSTALL_SKIP_LAUNCH: '1',
      PLAINLIST_PTY_PARENT: '0',
    }, [
      { wait: 'Password:', send: 'bad1\n' },
      { wait: 'Sorry, try again.', send: 'bad2\n' },
      { wait: 'Sorry, try again.', send: `${CORRECT_PASSWORD}\n`, occurrence: 2 },
      { wait: '按回车关闭此窗口', send: '\n' },
    ]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /安装完成/);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

test('PTY auth case D: three wrong passwords fail closed', async () => {
  const work = await mkdtemp(join(tmpdir(), 'pl-auth-d-'));
  try {
    const src = await makeStubApp(join(work, 'src'), PRODUCT_VERSION);
    const destRoot = join(work, 'dest');
    const dest = join(destRoot, 'PlainList.app');
    await mkdir(dest, { recursive: true });
    await writeFile(join(dest, 'SENTINEL'), 'keep-me\n');
    const sudo = await makeFakeSudo(work);
    const result = runPtyCase('D', {
      PLAINLIST_INSTALL_SRC: src,
      PLAINLIST_INSTALL_DEST: dest,
      PLAINLIST_INSTALL_SUDO: sudo,
      PLAINLIST_INSTALL_REQUIRE_AUTH: '1',
      PLAINLIST_INSTALL_SKIP_LAUNCH: '1',
      PLAINLIST_PTY_PARENT: '0',
    }, [
      { wait: 'Password:', send: 'bad1\n' },
      { wait: 'Sorry, try again.', send: 'bad2\n' },
      { wait: 'Sorry, try again.', send: 'bad3\n', occurrence: 2 },
      { wait: '按回车退出', send: '\n' },
    ]);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /密码验证失败，安装已取消/);
    assert.doesNotMatch(result.stdout, /安装完成/);
    assert.doesNotMatch(result.stdout, /正在复制/);
    assert.equal(await readFile(join(dest, 'SENTINEL'), 'utf8'), 'keep-me\n');
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

test('PTY auth case E: leftover password is not executed as a parent shell command', async () => {
  const work = await mkdtemp(join(tmpdir(), 'pl-auth-e-'));
  try {
    const src = await makeStubApp(join(work, 'src'), PRODUCT_VERSION);
    const dest = join(work, 'dest', 'PlainList.app');
    await mkdir(dest, { recursive: true });
    await writeFile(join(dest, 'SENTINEL'), 'keep-me\n');
    const sudo = await makeFakeSudo(work);
    const pwned = join(work, 'pwned');
    const result = runPtyCase('E', {
      PLAINLIST_INSTALL_SRC: src,
      PLAINLIST_INSTALL_DEST: dest,
      PLAINLIST_INSTALL_SUDO: sudo,
      PLAINLIST_INSTALL_REQUIRE_AUTH: '1',
      PLAINLIST_INSTALL_SKIP_LAUNCH: '1',
      PLAINLIST_PTY_PARENT: '1',
      PLAINLIST_PTY_PWNED: pwned,
    }, [
      { wait: 'Password:', send: 'bad1\n' },
      { wait: 'Sorry, try again.', send: 'bad2\n' },
      { wait: 'Sorry, try again.', send: 'bad3\n', occurrence: 2 },
      { wait: '按回车退出', send: `hello123\ntouch ${pwned}\n\n` },
    ]);
    assert.notEqual(result.status, 0);
    assert.equal(existsSync(pwned), false, 'password/leftover must not be executed as a shell command');
    assert.match(result.stdout, /密码验证失败，安装已取消/);
    assert.doesNotMatch(result.stdout, /PARENT_COMMAND_NOT_FOUND|command not found|检测不到当前指令|找不到命令|找不到指令/);
    assert.equal(await readFile(join(dest, 'SENTINEL'), 'utf8'), 'keep-me\n');
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

test('PTY auth case F: EOF cancels without touching destination', async () => {
  const work = await mkdtemp(join(tmpdir(), 'pl-auth-f-'));
  try {
    const src = await makeStubApp(join(work, 'src'), PRODUCT_VERSION);
    const dest = join(work, 'dest', 'PlainList.app');
    await mkdir(dest, { recursive: true });
    await writeFile(join(dest, 'SENTINEL'), 'keep-me\n');
    const sudo = await makeFakeSudo(work);
    const result = runPtyCase('F', {
      PLAINLIST_INSTALL_SRC: src,
      PLAINLIST_INSTALL_DEST: dest,
      PLAINLIST_INSTALL_SUDO: sudo,
      PLAINLIST_INSTALL_REQUIRE_AUTH: '1',
      PLAINLIST_INSTALL_SKIP_LAUNCH: '1',
      PLAINLIST_PTY_PARENT: '0',
      PLAINLIST_PTY_EOF_ON_PASSWORD: '1',
    }, [
      { wait: '按回车退出', send: '\n' },
    ]);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout, /安装完成/);
    assert.match(result.stdout, /密码验证失败，安装已取消/);
    assert.equal(await readFile(join(dest, 'SENTINEL'), 'utf8'), 'keep-me\n');
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});
