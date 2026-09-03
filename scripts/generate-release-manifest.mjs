#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const version = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
const commit = process.argv[2];
const artifactDir = process.argv[3] || resolve(root, '.release-artifacts');
if (!commit || !/^[0-9a-f]{40}$/.test(commit)) {
  console.error('usage: generate-release-manifest.mjs <40-char-commit> [artifact-dir]');
  process.exit(1);
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

const files = readdirSync(artifactDir).filter((name) => (
  name.startsWith(`PlainList-${version}-`) && (name.endsWith('.dmg') || name.endsWith('.zip') || name.endsWith('.apk'))
));

const artifacts = files.map((name) => {
  const file = resolve(artifactDir, name);
  const macos = name.match(/macos-(arm64|x64)\.(dmg|zip)$/);
  const android = name.endsWith('-android.apk');
  if (macos) {
    return {
      platform: 'macos',
      arch: macos[1],
      filename: name,
      url: `https://github.com/rainhuang0220/PlainList/releases/download/v${version}/${name}`,
      mirrorUrl: `https://plainlist.space/downloads/${name}`,
      sha256: sha256(file),
      size: statSync(file).size,
    };
  }
  if (android) {
    return {
      platform: 'android',
      arch: 'universal',
      filename: name,
      url: `https://github.com/rainhuang0220/PlainList/releases/download/v${version}/${name}`,
      mirrorUrl: `https://plainlist.space/downloads/${name}`,
      sha256: sha256(file),
      size: statSync(file).size,
    };
  }
  throw new Error(`unrecognized artifact name: ${name}`);
});

if (!artifacts.some((item) => item.platform === 'macos' && item.arch === 'arm64' && item.filename.endsWith('.dmg'))) {
  console.error('missing macOS arm64 dmg');
  process.exit(1);
}
if (!artifacts.some((item) => item.platform === 'macos' && item.arch === 'x64' && item.filename.endsWith('.dmg'))) {
  console.error('missing macOS x64 dmg');
  process.exit(1);
}
if (!artifacts.some((item) => item.platform === 'android')) {
  console.error('missing Android apk');
  process.exit(1);
}

const mismatch = artifacts.find((item) => !item.filename.includes(`-${version}-`));
if (mismatch) {
  console.error(`artifact version mismatch: ${mismatch.filename}`);
  process.exit(1);
}

const manifest = {
  version,
  commit,
  publishedAt: new Date().toISOString(),
  githubRelease: `https://github.com/rainhuang0220/PlainList/releases/tag/v${version}`,
  artifacts,
};
mkdirSync(artifactDir, { recursive: true });
writeFileSync(resolve(artifactDir, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const sums = artifacts.map((item) => `${item.sha256}  ${item.filename}`).join('\n');
writeFileSync(resolve(artifactDir, 'SHA256SUMS.txt'), `${sums}\n`);

if (process.argv.includes('--write-public')) {
  const outDir = resolve(root, 'apps/web/public/releases');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

console.log(JSON.stringify(manifest, null, 2));
