import type { Server } from 'node:http';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OAuthError, MCP_ACTIVITY_WRITE_SCOPE, MCP_CONTEXT_READ_SCOPE } from './oauth/service';
import { createActivityMcpServer } from './server';
import { createActivityMcpTransportRouter } from './transport';

const principal = {
  user: { id: 7, username: 'reader', isAdmin: false },
  scopes: [MCP_ACTIVITY_WRITE_SCOPE, MCP_CONTEXT_READ_SCOPE],
  clientId: 'test-client',
};
const appendDigest = vi.fn().mockResolvedValue({ sourceId: 44, factCount: 1, created: true });
let server: Server;
let baseUrl: string;

function rpc(method: string, params: Record<string, unknown> = {}, id = 1) {
  return { jsonrpc: '2.0', id, method, params };
}

function headers(overrides: Record<string, string> = {}) {
  return {
    authorization: 'Bearer valid-token',
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    ...overrides,
  };
}

async function post(body: unknown, headerOverrides: Record<string, string> = {}) {
  return fetch(`${baseUrl}/mcp`, { method: 'POST', headers: headers(headerOverrides), body: typeof body === 'string' ? body : JSON.stringify(body) });
}

beforeEach(async () => {
  appendDigest.mockClear();
  const app = express();
  app.use('/mcp', createActivityMcpTransportRouter({
    allowedOrigins: new Set(['https://plainlist.example']),
    authenticateToken: async (token) => {
      if (token === 'expired-token') throw new OAuthError('invalid_token', 401, 'Bearer token is invalid or expired');
      if (token !== 'valid-token') throw new OAuthError('invalid_token', 401, 'Invalid bearer token');
      return principal;
    },
    createServer: (authenticated) => createActivityMcpServer(authenticated, {
      appendDigest,
      listGoals: async () => [],
      getContext: async (_user, weekStart) => ({ weekStart, status: 'missing', goals: [], intelligence: null, daily: [] }),
    }),
  }));
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test server did not bind TCP');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

describe('MCP Streamable HTTP transport', () => {
  it('supports initialize, tools/list and tools/call over stateless JSON-RPC', async () => {
    const initialized = await post(rpc('initialize', {
      protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' },
    }));
    expect(initialized.status).toBe(200);
    expect((await initialized.json() as any).result.serverInfo.name).toBe('plainlist-activity');

    const listed = await post(rpc('tools/list'));
    expect((await listed.json() as any).result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      'save_activity_digest', 'get_goals', 'get_week_context',
    ]);

    const called = await post(rpc('tools/call', { name: 'get_week_context', arguments: { weekStart: '2026-08-24' } }));
    expect((await called.json() as any).result.structuredContent).toMatchObject({ weekStart: '2026-08-24', status: 'missing' });
  });

  it.each([
    ['missing', { authorization: '' }, 401],
    ['invalid', { authorization: 'Bearer wrong-token' }, 401],
    ['expired', { authorization: 'Bearer expired-token' }, 401],
  ])('rejects %s authentication with protected-resource discovery', async (_name, changedHeaders, status) => {
    const response = await post(rpc('tools/list'), changedHeaders);
    expect(response.status).toBe(status);
    expect(response.headers.get('www-authenticate')).toMatch(/oauth-protected-resource/);
  });

  it('rejects browser requests from an untrusted Origin', async () => {
    const response = await post(rpc('tools/list'), { origin: 'https://attacker.example' });
    expect(response.status).toBe(403);
  });

  it('rejects invalid content negotiation and unsupported methods', async () => {
    expect((await post(rpc('tools/list'), { 'content-type': 'text/plain' })).status).toBe(415);
    expect((await post(rpc('tools/list'), { accept: 'application/json' })).status).toBe(406);
    const get = await fetch(`${baseUrl}/mcp`, { method: 'GET', headers: { authorization: 'Bearer valid-token' } });
    expect(get.status).toBe(405);
  });

  it('returns JSON-RPC errors for malformed JSON, invalid requests, invalid args and unknown tools', async () => {
    const malformed = await post('{not-json');
    expect(malformed.status).toBe(400);
    expect((await malformed.json() as any).error.code).toBe(-32700);

    const invalidRpc = await post({ jsonrpc: '2.0', id: 1, method: 42 });
    expect((await invalidRpc.json() as any).error.code).toBe(-32600);

    const invalidArgs = await post(rpc('tools/call', { name: 'get_week_context', arguments: { weekStart: 'not-a-date' } }));
    expect((await invalidArgs.json() as any).result.isError).toBe(true);

    const unknown = await post(rpc('tools/call', { name: 'unknown_tool', arguments: {} }));
    expect((await unknown.json() as any).result.isError).toBe(true);
  });
});
