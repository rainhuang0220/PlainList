const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const verifier = join(__dirname, 'verify-production-api-bundle.cjs');

function rendererBundle(source) {
  const root = mkdtempSync(join(tmpdir(), 'plainlist-api-bundle-'));
  const assets = join(root, 'assets');
  mkdirSync(assets);
  writeFileSync(join(assets, 'index.js'), source);
  return root;
}

test('accepts a renderer bundle that routes production requests to the canonical HTTPS origin', () => {
  const result = spawnSync(process.execPath, [verifier, rendererBundle("const apiOrigin = 'https://plainlist.space';")], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('rejects a renderer bundle that contains the retired public-IP API origin', () => {
  const result = spawnSync(process.execPath, [verifier, rendererBundle("const apiOrigin = 'https://plainlist.space'; const retired = 'http://175.24.134.228';")], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /retired public-IP API origin/);
});

test('rejects a renderer bundle that has no canonical production API origin', () => {
  const result = spawnSync(process.execPath, [verifier, rendererBundle("const apiOrigin = ''; ")], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /canonical API origin/);
});
