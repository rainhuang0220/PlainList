import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'scripts/generate-release-manifest.mjs');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const commit = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function writeDummy(dir, name) {
  writeFileSync(join(dir, name), `${name}\n`);
}

test('generate-release-manifest writes versioned checksums and a matching commit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'plainlist-manifest-'));
  try {
    writeDummy(dir, `PlainList-${version}-macos-arm64.dmg`);
    writeDummy(dir, `PlainList-${version}-macos-x64.dmg`);
    writeDummy(dir, `PlainList-${version}-android.apk`);
    execFileSync('node', [script, commit, dir], { cwd: root, encoding: 'utf8' });
    const manifest = JSON.parse(readFileSync(join(dir, 'latest.json'), 'utf8'));
    const sums = readFileSync(join(dir, 'SHA256SUMS.txt'), 'utf8');
    assert.equal(manifest.version, version);
    assert.equal(manifest.commit, commit);
    assert.equal(manifest.artifacts.length, 3);
    assert.match(sums, new RegExp(`PlainList-${version}-macos-arm64\\.dmg`));
    assert.match(sums, new RegExp(`PlainList-${version}-android\\.apk`));
    for (const item of manifest.artifacts) {
      assert.ok(item.filename.includes(`-${version}-`));
      assert.equal(item.sha256.length, 64);
      assert.match(item.url, /^https:\/\/github\.com\/rainhuang0220\/PlainList\/releases\/download\//);
      assert.match(item.mirrorUrl, /^https:\/\/plainlist\.space\/downloads\//);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('generate-release-manifest stops when an artifact is missing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'plainlist-manifest-missing-'));
  try {
    writeDummy(dir, `PlainList-${version}-macos-arm64.dmg`);
    writeDummy(dir, `PlainList-${version}-macos-x64.dmg`);
    assert.throws(() => execFileSync('node', [script, commit, dir], { cwd: root, encoding: 'utf8' }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
