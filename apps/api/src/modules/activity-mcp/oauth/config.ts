import { env } from '../../../config/env';
import type { OAuthServerConfig } from './service';

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export const mcpPublicBaseUrl = withoutTrailingSlash(env.MCP_PUBLIC_BASE_URL);
const publicUrl = new URL(mcpPublicBaseUrl);
const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1']);
if (publicUrl.username || publicUrl.password || publicUrl.pathname !== '/' || publicUrl.search || publicUrl.hash) {
  throw new Error('MCP_PUBLIC_BASE_URL must be an origin without a path, query, or fragment');
}
if (publicUrl.protocol !== 'https:' && !loopbackHosts.has(publicUrl.hostname)) {
  throw new Error('MCP_PUBLIC_BASE_URL must use HTTPS except on a loopback host');
}

const redirectUris = env.MCP_OAUTH_REDIRECT_URIS.split(',').map((value) => value.trim()).filter(Boolean);
for (const redirectUri of redirectUris) {
  const parsed = new URL(redirectUri);
  if (parsed.username || parsed.password || parsed.hash) {
    throw new Error('MCP OAuth redirect URIs cannot contain credentials or fragments');
  }
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopbackHosts.has(parsed.hostname))) {
    throw new Error('MCP OAuth redirect URIs must use HTTPS except for loopback clients');
  }
}

export const mcpOAuthConfig: OAuthServerConfig = {
  issuer: mcpPublicBaseUrl,
  resource: `${mcpPublicBaseUrl}/mcp`,
  clientId: env.MCP_OAUTH_CLIENT_ID,
  redirectUris,
  authorizationCodeTtlSeconds: env.MCP_AUTH_CODE_TTL_SECONDS,
  accessTokenTtlSeconds: env.MCP_ACCESS_TOKEN_TTL_SECONDS,
};

export const mcpAllowedOrigins = new Set([
  new URL(mcpPublicBaseUrl).origin,
  ...env.MCP_ALLOWED_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean),
]);
