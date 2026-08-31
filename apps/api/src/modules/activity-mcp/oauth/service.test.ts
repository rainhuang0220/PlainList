import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  MCP_ACTIVITY_WRITE_SCOPE,
  MCP_CONTEXT_READ_SCOPE,
  OAuthError,
  createOAuthService,
  type AuthorizationCodeRecord,
  type OAuthGrantRepository,
} from './service';
import { createOAuthClientResolver } from './client';

class MemoryGrantRepository implements OAuthGrantRepository {
  readonly codes = new Map<string, AuthorizationCodeRecord>();
  readonly tokens = new Map<string, AuthorizationCodeRecord>();

  async createAuthorizationCode(record: AuthorizationCodeRecord): Promise<void> {
    this.codes.set(record.authorizationCodeHash, record);
  }

  async consumeAuthorizationCode(
    codeHash: string,
    consume: (record: AuthorizationCodeRecord) => { accessTokenHash: string; accessTokenExpiresAt: Date },
  ): Promise<AuthorizationCodeRecord | null> {
    const record = this.codes.get(codeHash);
    if (!record) return null;
    const token = consume(record);
    record.codeUsedAt = new Date('2026-08-30T12:00:00.000Z');
    record.accessTokenHash = token.accessTokenHash;
    record.accessTokenExpiresAt = token.accessTokenExpiresAt;
    this.tokens.set(token.accessTokenHash, record);
    return record;
  }

  async findAccessToken(tokenHash: string): Promise<AuthorizationCodeRecord | null> {
    return this.tokens.get(tokenHash) ?? null;
  }

  async revokeAccessToken(tokenHash: string): Promise<boolean> {
    const record = this.tokens.get(tokenHash);
    if (!record) return false;
    record.revokedAt = new Date('2026-08-30T12:00:00.000Z');
    return true;
  }
}

const baseNow = new Date('2026-08-30T12:00:00.000Z');
const verifier = 'plainlist-mcp-verifier-with-at-least-forty-three-characters';
const challenge = createHash('sha256').update(verifier).digest('base64url');
const authRequest = {
  response_type: 'code',
  client_id: 'chatgpt-test-client',
  redirect_uri: 'https://chatgpt.com/connector/oauth/callback',
  state: 'csrf-state-with-enough-entropy',
  code_challenge: challenge,
  code_challenge_method: 'S256',
  resource: 'https://plainlist.example/mcp',
  scope: `${MCP_ACTIVITY_WRITE_SCOPE} ${MCP_CONTEXT_READ_SCOPE}`,
};

function setup(now = baseNow) {
  const repository = new MemoryGrantRepository();
  let sequence = 0;
  const service = createOAuthService({
    repository,
    now: () => now,
    randomSecret: () => `secret-${++sequence}-${'x'.repeat(48)}`,
    config: {
      issuer: 'https://plainlist.example',
      resource: 'https://plainlist.example/mcp',
      clientId: 'chatgpt-test-client',
      redirectUris: ['https://chatgpt.com/connector/oauth/callback'],
      authorizationCodeTtlSeconds: 300,
      accessTokenTtlSeconds: 900,
    },
  });
  return { repository, service };
}

async function authorizeAndExchange(now = baseNow) {
  const setupResult = setup(now);
  const authorization = await setupResult.service.authorize(
    { id: 7, username: 'reader', isAdmin: false },
    authRequest,
  );
  const token = await setupResult.service.exchangeAuthorizationCode({
    grant_type: 'authorization_code',
    client_id: authRequest.client_id,
    redirect_uri: authRequest.redirect_uri,
    resource: authRequest.resource,
    code: authorization.code,
    code_verifier: verifier,
  });
  return { ...setupResult, authorization, token };
}

describe('MCP OAuth 2.1 authorization code + PKCE', () => {
  it('completes authorization-code PKCE flow for a trusted ChatGPT CIMD client', async () => {
    const cimdClientId = 'https://chatgpt.com/oauth/client.json';
    const cimdRedirectUri = 'https://chatgpt.com/connector_platform_oauth_redirect';
    const resolver = createOAuthClientResolver({
      predefinedClient: { clientId: 'chatgpt-test-client', redirectUris: [authRequest.redirect_uri] },
      fetchClientMetadata: async () => new Response(JSON.stringify({
        client_id: cimdClientId,
        client_name: 'ChatGPT',
        redirect_uris: [cimdRedirectUri],
        grant_types: ['authorization_code'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      }), { headers: { 'content-type': 'application/json' } }),
    });
    const repository = new MemoryGrantRepository();
    const service = createOAuthService({
      repository, now: () => baseNow, randomSecret: () => `cimd-secret-${'x'.repeat(48)}`,
      config: { issuer: 'https://plainlist.example', resource: authRequest.resource, clientId: 'chatgpt-test-client',
        redirectUris: [authRequest.redirect_uri], authorizationCodeTtlSeconds: 300, accessTokenTtlSeconds: 900 },
      clientResolver: resolver,
    });
    const request = { ...authRequest, client_id: cimdClientId, redirect_uri: cimdRedirectUri };

    const authorization = await service.authorize({ id: 7, username: 'reader', isAdmin: false }, request);
    await expect(service.exchangeAuthorizationCode({
      grant_type: 'authorization_code', client_id: cimdClientId, redirect_uri: cimdRedirectUri,
      resource: authRequest.resource, code: authorization.code, code_verifier: verifier,
    })).resolves.toMatchObject({ token_type: 'Bearer' });
    expect([...repository.codes.values()][0]).toMatchObject({ clientId: cimdClientId, redirectUri: cimdRedirectUri });
  });

  it('accepts a valid authorization request and stores only a code hash', async () => {
    const { repository, service } = setup();
    const result = await service.authorize({ id: 7, username: 'reader', isAdmin: false }, authRequest);

    expect(result).toMatchObject({ state: authRequest.state, issuer: 'https://plainlist.example' });
    expect([...repository.codes.keys()]).not.toContain(result.code);
    expect([...repository.codes.values()][0]).toMatchObject({
      userId: 7,
      clientId: authRequest.client_id,
      redirectUri: authRequest.redirect_uri,
      resource: authRequest.resource,
      codeChallengeMethod: 'S256',
    });
  });

  it.each([
    ['missing state', { ...authRequest, state: undefined }],
    ['unregistered redirect URI', { ...authRequest, redirect_uri: 'https://attacker.example/callback' }],
    ['plain PKCE', { ...authRequest, code_challenge_method: 'plain' }],
    ['wrong audience', { ...authRequest, resource: 'https://plainlist.example/api' }],
    ['unknown scope', { ...authRequest, scope: 'plainlist.admin' }],
  ])('rejects %s', async (_name, request) => {
    const { service } = setup();
    await expect(service.authorize({ id: 7, username: 'reader', isAdmin: false }, request)).rejects.toBeInstanceOf(OAuthError);
  });

  it('issues a short-lived bearer token for a valid S256 verifier', async () => {
    const { repository, token } = await authorizeAndExchange();

    expect(token).toMatchObject({
      token_type: 'Bearer',
      expires_in: 900,
      scope: `${MCP_ACTIVITY_WRITE_SCOPE} ${MCP_CONTEXT_READ_SCOPE}`,
    });
    expect([...repository.tokens.keys()]).not.toContain(token.access_token);
  });

  it('rejects an invalid verifier without consuming the authorization code', async () => {
    const { service } = setup();
    const authorization = await service.authorize({ id: 7, username: 'reader', isAdmin: false }, authRequest);

    await expect(service.exchangeAuthorizationCode({
      grant_type: 'authorization_code', client_id: authRequest.client_id,
      redirect_uri: authRequest.redirect_uri, resource: authRequest.resource,
      code: authorization.code, code_verifier: `${verifier}-wrong`,
    })).rejects.toMatchObject({ error: 'invalid_grant' });
  });

  it('rejects an expired code', async () => {
    const mutableNow = { value: baseNow };
    const repository = new MemoryGrantRepository();
    const service = createOAuthService({
      repository, now: () => mutableNow.value, randomSecret: () => `secret-${'x'.repeat(48)}`,
      config: { issuer: 'https://plainlist.example', resource: authRequest.resource, clientId: authRequest.client_id,
        redirectUris: [authRequest.redirect_uri], authorizationCodeTtlSeconds: 300, accessTokenTtlSeconds: 900 },
    });
    const authorization = await service.authorize({ id: 7, username: 'reader', isAdmin: false }, authRequest);
    mutableNow.value = new Date('2026-08-30T12:06:00.000Z');

    await expect(service.exchangeAuthorizationCode({ ...authRequest, grant_type: 'authorization_code',
      code: authorization.code, code_verifier: verifier })).rejects.toMatchObject({ error: 'invalid_grant' });
  });

  it('rejects authorization code replay', async () => {
    const { service, authorization } = await authorizeAndExchange();
    await expect(service.exchangeAuthorizationCode({ ...authRequest, grant_type: 'authorization_code',
      code: authorization.code, code_verifier: verifier })).rejects.toMatchObject({ error: 'invalid_grant' });
  });

  it('authenticates the token with its account, audience and scopes', async () => {
    const { service, token } = await authorizeAndExchange();
    await expect(service.authenticateAccessToken(token.access_token, [MCP_CONTEXT_READ_SCOPE])).resolves.toMatchObject({
      user: { id: 7, username: 'reader' },
      scopes: [MCP_ACTIVITY_WRITE_SCOPE, MCP_CONTEXT_READ_SCOPE],
    });
    await expect(service.authenticateAccessToken(token.access_token, ['plainlist.admin'])).rejects.toMatchObject({ status: 403 });
  });

  it('rejects expired and revoked tokens', async () => {
    const mutableNow = { value: baseNow };
    const { service, token } = await authorizeAndExchange(mutableNow.value);
    await service.revokeAccessToken(token.access_token);
    await expect(service.authenticateAccessToken(token.access_token)).rejects.toMatchObject({ error: 'invalid_token' });

    const second = await authorizeAndExchange(mutableNow.value);
    mutableNow.value = new Date('2026-08-30T12:16:00.000Z');
    // A service using the advanced clock verifies expiry against the same repository.
    const expiryService = createOAuthService({
      repository: second.repository, now: () => mutableNow.value, randomSecret: () => 'unused',
      config: { issuer: 'https://plainlist.example', resource: authRequest.resource, clientId: authRequest.client_id,
        redirectUris: [authRequest.redirect_uri], authorizationCodeTtlSeconds: 300, accessTokenTtlSeconds: 900 },
    });
    await expect(expiryService.authenticateAccessToken(second.token.access_token)).rejects.toMatchObject({ error: 'invalid_token' });
  });
});
