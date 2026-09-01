const assert = require('node:assert/strict');
const test = require('node:test');

const { createDesktopApiRequest } = require('./desktop-api.cjs');

test('routes a relative API request only to the canonical production API', async () => {
  let seenUrl = null;
  let seenInit = null;
  const request = createDesktopApiRequest(async (url, init) => {
    seenUrl = url;
    seenInit = init;
    return new Response('{"ok":true}', { status: 200, statusText: 'OK' });
  });

  const result = await request({
    method: 'POST',
    path: '/auth/login',
    body: { username: 'desktop-test', password: 'not-logged' },
    authorization: 'Bearer example-token',
  });

  assert.equal(seenUrl, 'https://plainlist.space/api/auth/login');
  assert.deepEqual(seenInit, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer example-token',
    },
    body: '{"username":"desktop-test","password":"not-logged"}',
  });
  assert.deepEqual(result, { status: 200, statusText: 'OK', body: '{"ok":true}' });
});

test('rejects an API path that could select a different host', async () => {
  const request = createDesktopApiRequest(async () => {
    throw new Error('network must not be called');
  });

  await assert.rejects(
    request({ method: 'GET', path: '//attacker.example/api/auth/accounts' }),
    /relative API path/,
  );
});

test('rejects a method outside the renderer API contract', async () => {
  const request = createDesktopApiRequest(async () => {
    throw new Error('network must not be called');
  });

  await assert.rejects(
    request({ method: 'CONNECT', path: '/auth/accounts' }),
    /unsupported API method/,
  );
});
