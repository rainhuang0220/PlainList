import { z } from 'zod';
import { OAuthError } from './service';

const CHATGPT_CLIENT_METADATA_ORIGIN = 'https://chatgpt.com';
const CHATGPT_CLIENT_METADATA_PATH = /^\/oauth(?:\/[A-Za-z0-9_-]+)?\/client\.json$/;
const CLIENT_METADATA_MAX_BYTES = 16 * 1024;
const CLIENT_METADATA_TIMEOUT_MS = 2_500;

const clientMetadataSchema = z.object({
  client_id: z.string().url(),
  client_name: z.string().trim().min(1).max(256),
  redirect_uris: z.array(z.string().url()).min(1).max(16),
  grant_types: z.array(z.string()).max(16).optional(),
  response_types: z.array(z.string()).max(16).optional(),
  token_endpoint_auth_method: z.string().max(64).optional(),
  token_endpoint_auth_methods_supported: z.array(z.string()).max(16).optional(),
}).passthrough();

export interface ResolvedOAuthClient {
  clientId: string;
  redirectUris: string[];
}

export interface OAuthClientResolver {
  resolve(clientId: string): Promise<ResolvedOAuthClient>;
}

function invalidClient(description = 'The OAuth client metadata is invalid'): OAuthError {
  return new OAuthError('invalid_client', 400, description);
}

function isTrustedChatGptMetadataUrl(clientId: string): boolean {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    return false;
  }
  return url.origin === CHATGPT_CLIENT_METADATA_ORIGIN
    && url.protocol === 'https:'
    && url.port === ''
    && url.username === ''
    && url.password === ''
    && url.search === ''
    && url.hash === ''
    && CHATGPT_CLIENT_METADATA_PATH.test(url.pathname);
}

function isSafeRedirectUri(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.username === '' && url.password === '' && url.hash === '';
  } catch {
    return false;
  }
}

export function createOAuthClientResolver(dependencies: {
  predefinedClient: ResolvedOAuthClient;
  fetchClientMetadata?: typeof fetch;
  metadataTimeoutMs?: number;
  metadataMaxBytes?: number;
  now?: () => number;
  cacheTtlMs?: number;
}): OAuthClientResolver {
  const fetchClientMetadata = dependencies.fetchClientMetadata ?? fetch;
  const metadataTimeoutMs = dependencies.metadataTimeoutMs ?? CLIENT_METADATA_TIMEOUT_MS;
  const metadataMaxBytes = dependencies.metadataMaxBytes ?? CLIENT_METADATA_MAX_BYTES;
  const now = dependencies.now ?? Date.now;
  const cacheTtlMs = dependencies.cacheTtlMs ?? 5 * 60 * 1000;
  const cache = new Map<string, { expiresAt: number; client: ResolvedOAuthClient }>();

  return {
    async resolve(clientId: string): Promise<ResolvedOAuthClient> {
      if (clientId === dependencies.predefinedClient.clientId) return dependencies.predefinedClient;
      if (!isTrustedChatGptMetadataUrl(clientId)) throw invalidClient('Unknown OAuth client');

      const cached = cache.get(clientId);
      if (cached && cached.expiresAt > now()) return cached.client;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), metadataTimeoutMs);
      let response: Response;
      try {
        response = await fetchClientMetadata(clientId, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
      } catch {
        throw invalidClient('Unable to retrieve OAuth client metadata');
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok || response.type === 'opaqueredirect' || response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
        throw invalidClient();
      }
      const contentLength = Number(response.headers.get('content-length') ?? '0');
      if (!Number.isFinite(contentLength) || contentLength > metadataMaxBytes) throw invalidClient();

      let body: string;
      try {
        body = await response.text();
      } catch {
        throw invalidClient();
      }
      if (Buffer.byteLength(body, 'utf8') > metadataMaxBytes) throw invalidClient();

      let rawMetadata: unknown;
      try {
        rawMetadata = JSON.parse(body);
      } catch {
        throw invalidClient();
      }
      const parsed = clientMetadataSchema.safeParse(rawMetadata);
      if (!parsed.success) throw invalidClient();
      const metadata = parsed.data;
      if (metadata.client_id !== clientId
        || metadata.redirect_uris.some((redirectUri) => !isSafeRedirectUri(redirectUri))
        || (metadata.grant_types && !metadata.grant_types.includes('authorization_code'))
        || (metadata.response_types && !metadata.response_types.includes('code'))
        || (metadata.token_endpoint_auth_methods_supported
          ? !metadata.token_endpoint_auth_methods_supported.includes('none')
          : metadata.token_endpoint_auth_method !== undefined && metadata.token_endpoint_auth_method !== 'none')) {
        throw invalidClient();
      }

      const client = { clientId, redirectUris: [...new Set(metadata.redirect_uris)] };
      cache.set(clientId, { client, expiresAt: now() + cacheTtlMs });
      return client;
    },
  };
}
