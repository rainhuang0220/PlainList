import { createHash } from 'node:crypto';
import type { Server } from 'node:http';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createActivityOAuthRouter } from './oauth/router';
import {
  MCP_ACTIVITY_WRITE_SCOPE, MCP_CONTEXT_READ_SCOPE, createOAuthService,
  type AuthorizationCodeRecord, type OAuthGrantRepository,
} from './oauth/service';
import { createActivityMcpServer } from './server';
import { createActivityMcpTransportRouter } from './transport';

class MemoryRepository implements OAuthGrantRepository {
  codes = new Map<string, AuthorizationCodeRecord>();
  tokens = new Map<string, AuthorizationCodeRecord>();
  async createAuthorizationCode(record: AuthorizationCodeRecord) { this.codes.set(record.authorizationCodeHash, record); }
  async consumeAuthorizationCode(codeHash: string, consume: (record: AuthorizationCodeRecord) => { accessTokenHash: string; accessTokenExpiresAt: Date }) {
    const record = this.codes.get(codeHash);
    if (!record) return null;
    const token = consume(record);
    record.codeUsedAt = new Date(); record.accessTokenHash = token.accessTokenHash;
    record.accessTokenExpiresAt = token.accessTokenExpiresAt; this.tokens.set(token.accessTokenHash, record);
    return record;
  }
  async findAccessToken(tokenHash: string) { return this.tokens.get(tokenHash) ?? null; }
  async revokeAccessToken(tokenHash: string) {
    const record = this.tokens.get(tokenHash); if (!record) return false; record.revokedAt = new Date(); return true;
  }
}

const issuer = 'https://plainlist.example';
const resource = `${issuer}/mcp`;
const redirectUri = 'https://chatgpt.com/connector/oauth/callback';
const clientId = 'chatgpt-test-client';
const verifier = 'integration-pkce-verifier-with-forty-three-characters-minimum';
const challenge = createHash('sha256').update(verifier).digest('base64url');
let httpServer: Server;
let baseUrl: string;
let oauthService: ReturnType<typeof createOAuthService>;
let facts: Array<{ userId: number; dateKey: string; summary: string }>;
let auditEvents: Array<{ kind: string; username: string }>;

function authorizationParams() {
  return new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri,
    state: 'integration-csrf-state-12345', code_challenge: challenge, code_challenge_method: 'S256', resource,
    scope: `${MCP_ACTIVITY_WRITE_SCOPE} ${MCP_CONTEXT_READ_SCOPE}` });
}

async function mcp(accessToken: string, method: string, params: Record<string, unknown>, id = 1) {
  return fetch(`${baseUrl}/mcp`, { method: 'POST', headers: {
    authorization: `Bearer ${accessToken}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream',
  }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) });
}

beforeEach(async () => {
  facts = [];
  auditEvents = [];
  let secret = 0;
  oauthService = createOAuthService({
    repository: new MemoryRepository(), now: () => new Date('2026-08-30T12:00:00.000Z'),
    randomSecret: () => `integration-secret-${++secret}-${'x'.repeat(48)}`,
    config: { issuer, resource, clientId, redirectUris: [redirectUri], authorizationCodeTtlSeconds: 300, accessTokenTtlSeconds: 900 },
  });
  const app = express();
  app.use(createActivityOAuthRouter({
    service: oauthService, issuer, resource,
    auditAuth: (event) => { auditEvents.push({ kind: event.kind, username: event.username }); },
    authenticateCredentials: async (credentials: unknown) => {
      if ((credentials as any).username !== 'reader' || (credentials as any).password !== 'correct-passphrase') {
        throw Object.assign(new Error('invalid credentials'), { status: 401 });
      }
      return { id: 7, username: 'reader', isAdmin: false };
    },
  }));
  app.use('/mcp', createActivityMcpTransportRouter({
    allowedOrigins: new Set([issuer]),
    authenticateToken: (token) => oauthService.authenticateAccessToken(token),
    createServer: (principal) => createActivityMcpServer(principal, {
      appendDigest: async (user, payload: any) => {
        facts.push({ userId: user.id, dateKey: payload.dateKey, summary: payload.summary });
        return { sourceId: 91, factCount: 1, created: true };
      },
      listGoals: async (user) => user.id === 7 ? [{ id: 4, title: 'Ship MCP', description: null, priorityRank: 0,
        timeHorizon: 'near_term', status: 'active', domain: 'engineering', successSignals: ['connected'], antiGoals: [],
        version: 1, createdAt: '', updatedAt: '' }] : [],
      getContext: async (user, weekStart) => ({ weekStart, status: 'ready', ownerProof: user.id, goals: [], intelligence: null, daily: [] }),
    }),
  }));
  await new Promise<void>((resolve) => { httpServer = app.listen(0, '127.0.0.1', resolve); });
  const address = httpServer.address();
  if (!address || typeof address === 'string') throw new Error('integration server failed to bind');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
});

describe('OAuth account binding to authenticated MCP tools', () => {
  it('publishes OAuth discovery and rejects unsafe authorization requests', async () => {
    const protectedResource = await fetch(`${baseUrl}/.well-known/oauth-protected-resource`);
    expect(await protectedResource.json()).toMatchObject({ resource, authorization_servers: [issuer] });
    const authorizationServer = await fetch(`${baseUrl}/.well-known/oauth-authorization-server`);
    expect(await authorizationServer.json()).toMatchObject({ issuer, code_challenge_methods_supported: ['S256'] });

    const missingState = authorizationParams(); missingState.delete('state');
    expect((await fetch(`${baseUrl}/oauth/authorize?${missingState}`)).status).toBe(400);
    const badRedirect = authorizationParams(); badRedirect.set('redirect_uri', 'https://attacker.example/callback');
    const unsafe = await fetch(`${baseUrl}/oauth/authorize?${badRedirect}`);
    expect(unsafe.status).toBe(400);
    expect(unsafe.headers.get('location')).toBeNull();

    const denied = authorizationParams();
    denied.set('username', 'reader'); denied.set('password', 'wrong-passphrase'); denied.set('decision', 'allow');
    expect((await fetch(`${baseUrl}/oauth/authorize`, { method: 'POST', headers: {
      'content-type': 'application/x-www-form-urlencoded',
    }, body: denied })).status).toBe(400);
    expect(auditEvents).toEqual([{ kind: 'login-fail', username: 'reader' }]);
  });

  it('completes consent, PKCE exchange, MCP initialize/list/read/write, revocation and tenant binding', async () => {
    const consent = await fetch(`${baseUrl}/oauth/authorize?${authorizationParams()}`);
    expect(consent.status).toBe(200);
    expect(await consent.text()).toMatch(/Allow[\s\S]*Cancel/);

    const form = authorizationParams();
    form.set('username', 'reader'); form.set('password', 'correct-passphrase'); form.set('decision', 'allow');
    const approval = await fetch(`${baseUrl}/oauth/authorize`, { method: 'POST', redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form });
    expect(approval.status).toBe(303);
    expect(auditEvents).toEqual([{ kind: 'login-ok', username: 'reader' }]);
    const callback = new URL(String(approval.headers.get('location')));
    expect(callback.origin + callback.pathname).toBe(redirectUri);
    expect(callback.searchParams.get('state')).toBe('integration-csrf-state-12345');
    expect(callback.searchParams.get('iss')).toBe(issuer);
    const code = String(callback.searchParams.get('code'));

    const wrongVerifier = await fetch(`${baseUrl}/oauth/token`, { method: 'POST', headers: {
      'content-type': 'application/x-www-form-urlencoded',
    }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, redirect_uri: redirectUri,
      resource, code, code_verifier: `${verifier}-wrong` }) });
    expect(wrongVerifier.status).toBe(400);

    const tokenResponse = await fetch(`${baseUrl}/oauth/token`, { method: 'POST', headers: {
      'content-type': 'application/x-www-form-urlencoded',
    }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, redirect_uri: redirectUri,
      resource, code, code_verifier: verifier }) });
    expect(tokenResponse.status).toBe(200);
    const token = await tokenResponse.json() as { access_token: string };

    const replay = await fetch(`${baseUrl}/oauth/token`, { method: 'POST', headers: {
      'content-type': 'application/x-www-form-urlencoded',
    }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, redirect_uri: redirectUri,
      resource, code, code_verifier: verifier }) });
    expect(replay.status).toBe(400);

    const initialized = await mcp(token.access_token, 'initialize', {
      protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'integration', version: '1.0.0' },
    });
    expect(initialized.status).toBe(200);
    const listed = await mcp(token.access_token, 'tools/list', {});
    expect((await listed.json() as any).result.tools).toHaveLength(3);
    const goals = await mcp(token.access_token, 'tools/call', { name: 'get_goals', arguments: {} });
    expect((await goals.json() as any).result.structuredContent.goals[0]).toMatchObject({ id: 4, title: 'Ship MCP' });

    const saved = await mcp(token.access_token, 'tools/call', { name: 'save_activity_digest', arguments: {
      sourceExternalId: 'chat-integration', idempotencyKey: 'integration-digest-1', dateKey: '2026-08-30',
      summary: 'Completed the authenticated MCP integration.', activities: [], outputs: ['MCP flow'], learnings: [],
      decisions: [], unresolved: [], candidateGoalRelations: [],
    } });
    expect((await saved.json() as any).result.structuredContent).toMatchObject({ status: 'created', sourceId: 91, savedDateKey: '2026-08-30' });
    expect(facts).toEqual([{ userId: 7, dateKey: '2026-08-30', summary: 'Completed the authenticated MCP integration.' }]);

    await fetch(`${baseUrl}/oauth/revoke`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: token.access_token }) });
    expect((await mcp(token.access_token, 'tools/list', {})).status).toBe(401);
  });
});
