const assert = require('node:assert/strict');
const test = require('node:test');

const { CANONICAL_API_ORIGIN, productionApiOrigin } = require('./production-api-contract.cjs');

test('uses the canonical HTTPS API origin when a release command has no caller-provided API origin', () => {
  assert.equal(productionApiOrigin(''), CANONICAL_API_ORIGIN);
});

test('rejects a release command that attempts to inject a non-canonical API origin', () => {
  assert.throws(() => productionApiOrigin('http://175.24.134.228'), /must use https:\/\/plainlist\.space/);
});
