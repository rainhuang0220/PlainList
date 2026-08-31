import { describe, expect, it, vi } from 'vitest';
import { createOAuthClientResolver } from './client';
import { OAuthError } from './service';

const chatgptClientId = 'https://chatgpt.com/oauth/client.json';
const chatgptRedirectUri = 'https://chatgpt.com/connector_platform_oauth_redirect';

function clientDocument(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    client_id: chatgptClientId,
    client_name: 'ChatGPT',
    redirect_uris: [chatgptRedirectUri],
    grant_types: ['authorization_code'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    ...overrides,
  });
}

function jsonResponse(body = clientDocument(), status = 200, headers: Record<string, string> = { 'content-type': 'application/json' }) {
  return new Response(body, { status, headers });
}

describe('ChatGPT CIMD client resolver', () => {
  it('resolves a valid ChatGPT metadata document with exact redirect membership', async () => {
    const fetchClientMetadata = vi.fn(async () => jsonResponse());
    const resolver = createOAuthClientResolver({
      predefinedClient: { clientId: 'plainlist-local-mcp-client', redirectUris: ['http://127.0.0.1:6274/oauth/callback'] },
      fetchClientMetadata,
    });

    await expect(resolver.resolve(chatgptClientId)).resolves.toEqual({
      clientId: chatgptClientId,
      redirectUris: [chatgptRedirectUri],
    });
    expect(fetchClientMetadata).toHaveBeenCalledWith(chatgptClientId, expect.objectContaining({ redirect: 'manual' }));
  });

  it('accepts ChatGPT metadata when its supported token methods overlap with none', async () => {
    const resolver = createOAuthClientResolver({
      predefinedClient: { clientId: 'plainlist-local-mcp-client', redirectUris: [] },
      fetchClientMetadata: async () => jsonResponse(clientDocument({
        token_endpoint_auth_method: 'private_key_jwt',
        token_endpoint_auth_methods_supported: ['none', 'private_key_jwt'],
      })),
    });

    await expect(resolver.resolve(chatgptClientId)).resolves.toMatchObject({ clientId: chatgptClientId });
  });

  it.each([
    ['a metadata client_id mismatch', clientDocument({ client_id: 'https://chatgpt.com/oauth/other/client.json' })],
    ['a missing redirect_uris field', clientDocument({ redirect_uris: undefined })],
    ['malformed JSON', '{not-json'],
    ['a non-JSON response', clientDocument(), 200, { 'content-type': 'text/html' }],
    ['a redirect response', clientDocument(), 302],
  ])('rejects %s', async (_name, body, status = 200, headers) => {
    const resolver = createOAuthClientResolver({
      predefinedClient: { clientId: 'plainlist-local-mcp-client', redirectUris: [] },
      fetchClientMetadata: vi.fn(async () => jsonResponse(body, status, headers)),
    });

    await expect(resolver.resolve(chatgptClientId)).rejects.toMatchObject({ error: 'invalid_client' });
  });

  it.each([
    'http://chatgpt.com/oauth/client.json',
    'https://localhost/oauth/client.json',
    'https://127.0.0.1/oauth/client.json',
    'https://10.0.0.1/oauth/client.json',
    'https://chatgpt.com:8443/oauth/client.json',
    'https://chatgpt.com/oauth/client.json?target=https://evil.example',
    'https://chatgpt.com/oauth/client.json#fragment',
    'https://attacker.example/oauth/client.json',
  ])('rejects an untrusted CIMD URL before any outbound fetch: %s', async (clientId) => {
    const fetchClientMetadata = vi.fn();
    const resolver = createOAuthClientResolver({
      predefinedClient: { clientId: 'plainlist-local-mcp-client', redirectUris: [] },
      fetchClientMetadata,
    });

    await expect(resolver.resolve(clientId)).rejects.toBeInstanceOf(OAuthError);
    expect(fetchClientMetadata).not.toHaveBeenCalled();
  });

  it('keeps the predefined local client offline', async () => {
    const fetchClientMetadata = vi.fn();
    const resolver = createOAuthClientResolver({
      predefinedClient: { clientId: 'plainlist-local-mcp-client', redirectUris: ['http://127.0.0.1:6274/oauth/callback'] },
      fetchClientMetadata,
    });

    await expect(resolver.resolve('plainlist-local-mcp-client')).resolves.toEqual({
      clientId: 'plainlist-local-mcp-client', redirectUris: ['http://127.0.0.1:6274/oauth/callback'],
    });
    expect(fetchClientMetadata).not.toHaveBeenCalled();
  });

  it('times out metadata retrieval without accepting a partial client', async () => {
    const fetchClientMetadata = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const resolver = createOAuthClientResolver({
      predefinedClient: { clientId: 'plainlist-local-mcp-client', redirectUris: [] },
      fetchClientMetadata,
      metadataTimeoutMs: 1,
    });

    await expect(resolver.resolve(chatgptClientId)).rejects.toMatchObject({ error: 'invalid_client' });
    expect(fetchClientMetadata).toHaveBeenCalledOnce();
  });

  it('caches only a successfully validated ChatGPT document', async () => {
    const fetchClientMetadata = vi.fn(async () => jsonResponse());
    const resolver = createOAuthClientResolver({
      predefinedClient: { clientId: 'plainlist-local-mcp-client', redirectUris: [] },
      fetchClientMetadata,
    });

    await resolver.resolve(chatgptClientId);
    await resolver.resolve(chatgptClientId);
    expect(fetchClientMetadata).toHaveBeenCalledOnce();
  });
});
