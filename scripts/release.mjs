#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const command = process.argv[2] || 'verify';

function readJson(rel) {
  return JSON.parse(readFileSync(resolve(root, rel), 'utf8'));
}

function readText(rel) {
  return readFileSync(resolve(root, rel), 'utf8');
}

function fail(message) {
  console.error(`release: ${message}`);
  process.exit(1);
}

function productVersion() {
  const version = readJson('package.json').version;
  if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`invalid product version: ${version}`);
  return version;
}

function git(args) {
  return execSync(`git ${args}`, { cwd: root, encoding: 'utf8' }).trim();
}

function verifyReleaseTree({ allowDirty = process.env.RELEASE_ALLOW_DIRTY === '1' } = {}) {
  const version = productVersion();
  const web = readJson('apps/web/package.json').version;
  const api = readJson('apps/api/package.json').version;
  if (web !== version) fail(`web version ${web} != ${version}`);
  if (api !== version) fail(`api version ${api} != ${version}`);

  const gradle = readText('apps/web/android/app/build.gradle');
  const versionName = gradle.match(/versionName\s+"([^"]+)"/)?.[1];
  const versionCode = Number(gradle.match(/versionCode\s+(\d+)/)?.[1] || 0);
  if (versionName !== version) fail(`android versionName ${versionName} != ${version}`);
  if (!Number.isInteger(versionCode) || versionCode < 25001) {
    fail(`android versionCode ${versionCode} must be >= 25001`);
  }

  const dmg = readText('apps/web/scripts/build-dmg.sh');
  if (dmg.includes('PLAINLIST_VERSION:-2.4.0')) fail('build-dmg.sh still hardcodes 2.4.0');
  if (!dmg.includes('macos-${ARCH}')) fail('build-dmg.sh missing macos-arch filename');

  const android = readText('apps/web/scripts/build-android-release.sh');
  if (android.includes('PLAINLIST_VERSION:-2.4.0')) fail('build-android-release.sh still hardcodes 2.4.0');
  if (!android.includes('PlainList-${VERSION}-android.apk')) fail('android apk filename template mismatch');

  const builder = readText('apps/web/electron-builder.yml');
  if (!builder.includes('${productName}-${version}-macos-${arch}.${ext}')) {
    fail('electron-builder artifactName mismatch');
  }

  const desktop = readText('apps/web/scripts/build-desktop-release.sh');
  if (!desktop.includes('sign-adhoc.sh')) fail('desktop release does not ad-hoc sign the app bundle');
  if (!desktop.includes('verify-macos-app.sh')) fail('desktop release does not verify the macOS signature');

  const page = readText('apps/web/public/download/index.html');
  if (!page.includes('下载 PlainList')) fail('download page missing product title');
  if (!page.includes('/releases/latest.json')) fail('download page does not consume the manifest');
  if (page.includes('175.24.134.228')) fail('download page contains raw IP');

  const head = git('rev-parse HEAD');
  if (!/^[0-9a-f]{40}$/.test(head)) fail('HEAD is not a full commit sha');
  const dirty = git('status --porcelain');
  if (dirty && !allowDirty) fail(`git is dirty:\n${dirty}`);

  return { ok: true, version, commit: head, versionCode };
}

function run(cmd) {
  execSync(cmd, { cwd: root, stdio: 'inherit' });
}

if (command === 'verify') {
  console.log(JSON.stringify(verifyReleaseTree(), null, 2));
} else if (command === 'web') {
  console.log(JSON.stringify(verifyReleaseTree(), null, 2));
  run('npm run build:shared');
  run('npm run build:web');
} else if (command === 'manifest') {
  const commit = process.argv[3];
  const artifactDir = process.argv[4];
  if (!commit || !artifactDir) {
    fail('usage: release.mjs manifest <40-char-commit> <artifact-dir>');
  }
  verifyReleaseTree({ allowDirty: true });
  run(`node ${JSON.stringify(resolve(root, 'scripts/generate-release-manifest.mjs'))} ${JSON.stringify(commit)} ${JSON.stringify(artifactDir)}`);
} else {
  fail('usage: release.mjs verify|web|manifest <commit> <artifact-dir>');
}
