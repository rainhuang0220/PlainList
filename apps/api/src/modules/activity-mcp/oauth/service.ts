import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { AuthenticatedUser } from '@plainlist/shared';
import { z } from 'zod';
import { createOAuthClientResolver, type OAuthClientResolver } from './client';

export const MCP_ACTIVITY_WRITE_SCOPE = 'plainlist.activity.write';
export const MCP_CONTEXT_READ_SCOPE = 'plainlist.context.read';
export const MCP_SCOPES = [MCP_ACTIVITY_WRITE_SCOPE, MCP_CONTEXT_READ_SCOPE] as const;

export interface OAuthServerConfig {
  issuer: string;
  resource: string;
  clientId: string;
  redirectUris: string[];
  authorizationCodeTtlSeconds: number;
  accessTokenTtlSeconds: number;
}

export interface AuthorizationCodeRecord {
  userId: number;
  username: string;
  isAdmin: boolean;
  clientId: string;
  redirectUri: string;
  scopes: string[];
  resource: string;
  authorizationCodeHash: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  codeExpiresAt: Date;
  codeUsedAt: Date | null;
  accessTokenHash: string | null;
  accessTokenExpiresAt: Date | null;
  revokedAt: Date | null;
}

export interface OAuthGrantRepository {
  createAuthorizationCode(record: AuthorizationCodeRecord): Promise<void>;
  consumeAuthorizationCode(
    codeHash: string,
    consume: (record: AuthorizationCodeRecord) => { accessTokenHash: string; accessTokenExpiresAt: Date },
  ): Promise<AuthorizationCodeRecord | null>;
  findAccessToken(tokenHash: string): Promise<AuthorizationCodeRecord | null>;
  revokeAccessToken(tokenHash: string): Promise<boolean>;
}

export class OAuthError extends Error {
  constructor(
    public readonly error: 'invalid_request' | 'invalid_client' | 'invalid_grant' | 'invalid_scope' | 'invalid_token' | 'insufficient_scope',
    public readonly status: number,
    description: string,
  ) {
    super(description);
    this.name = 'OAuthError';
  }
}

const authorizationRequestSchema = z.object({
  response_type: z.literal('code'),
  client_id: z.string().min(1).max(512),
  redirect_uri: z.string().url().max(1024),
  state: z.string().min(16).max(512),
  code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
  code_challenge_method: z.literal('S256'),
  resource: z.string().url().max(1024),
  scope: z.string().min(1).max(255),
});

const tokenRequestSchema = z.object({
  grant_type: z.literal('authorization_code'),
  client_id: z.string().min(1).max(512),
  redirect_uri: z.string().url().max(1024),
  resource: z.string().url().max(1024),
  code: z.string().min(32).max(512),
  code_verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
});

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function parseScopes(raw: string): string[] {
  const scopes = [...new Set(raw.split(/\s+/).filter(Boolean))].sort();
  if (!scopes.length || scopes.some((scope) => !MCP_SCOPES.includes(scope as typeof MCP_SCOPES[number]))) {
    throw new OAuthError('invalid_scope', 400, 'The requested scope is not supported');
  }
  return scopes;
}

function invalidRequest(): OAuthError {
  return new OAuthError('invalid_request', 400, 'The OAuth request is invalid');
}

export function createOAuthService(dependencies: {
  repository: OAuthGrantRepository;
  config: OAuthServerConfig;
  clientResolver?: OAuthClientResolver;
  now?: () => Date;
  randomSecret?: () => string;
}) {
  const now = dependencies.now ?? (() => new Date());
  const randomSecret = dependencies.randomSecret ?? (() => randomBytes(32).toString('base64url'));
  const { repository, config } = dependencies;
  const clientResolver = dependencies.clientResolver ?? createOAuthClientResolver({
    predefinedClient: { clientId: config.clientId, redirectUris: config.redirectUris },
  });

  return {
    async validateAuthorizationRequest(rawRequest: unknown) {
      const parsed = authorizationRequestSchema.safeParse(rawRequest);
      if (!parsed.success) throw invalidRequest();
      const request = parsed.data;
      const client = await clientResolver.resolve(request.client_id);
      if (!client.redirectUris.includes(request.redirect_uri)) throw invalidRequest();
      if (request.resource !== config.resource) throw invalidRequest();
      return { ...request, scopes: parseScopes(request.scope) };
    },

    async authorize(user: AuthenticatedUser, rawRequest: unknown) {
      const request = await this.validateAuthorizationRequest(rawRequest);
      const scopes = request.scopes;
      const code = randomSecret();
      const issuedAt = now();
      await repository.createAuthorizationCode({
        userId: user.id,
        username: user.username,
        isAdmin: user.isAdmin,
        clientId: request.client_id,
        redirectUri: request.redirect_uri,
        scopes,
        resource: request.resource,
        authorizationCodeHash: hashSecret(code),
        codeChallenge: request.code_challenge,
        codeChallengeMethod: 'S256',
        codeExpiresAt: new Date(issuedAt.getTime() + config.authorizationCodeTtlSeconds * 1000),
        codeUsedAt: null,
        accessTokenHash: null,
        accessTokenExpiresAt: null,
        revokedAt: null,
      });
      return { code, state: request.state, issuer: config.issuer, redirectUri: request.redirect_uri };
    },

    async exchangeAuthorizationCode(rawRequest: unknown) {
      const parsed = tokenRequestSchema.safeParse(rawRequest);
      if (!parsed.success) throw new OAuthError('invalid_grant', 400, 'The authorization code exchange is invalid');
      const request = parsed.data;
      const client = await clientResolver.resolve(request.client_id);
      if (request.resource !== config.resource || !client.redirectUris.includes(request.redirect_uri)) {
        throw new OAuthError('invalid_grant', 400, 'Authorization code binding mismatch');
      }
      const accessToken = randomSecret();
      const accessTokenHash = hashSecret(accessToken);
      const exchangedAt = now();
      const accessTokenExpiresAt = new Date(exchangedAt.getTime() + config.accessTokenTtlSeconds * 1000);
      const record = await repository.consumeAuthorizationCode(hashSecret(request.code), (grant) => {
        if (grant.codeUsedAt || grant.revokedAt || grant.codeExpiresAt.getTime() <= exchangedAt.getTime()) {
          throw new OAuthError('invalid_grant', 400, 'Authorization code is expired or already used');
        }
        if (grant.clientId !== request.client_id || grant.redirectUri !== request.redirect_uri || grant.resource !== request.resource) {
          throw new OAuthError('invalid_grant', 400, 'Authorization code binding mismatch');
        }
        const calculatedChallenge = createHash('sha256').update(request.code_verifier, 'utf8').digest('base64url');
        if (!constantTimeEqual(calculatedChallenge, grant.codeChallenge)) {
          throw new OAuthError('invalid_grant', 400, 'PKCE verification failed');
        }
        return { accessTokenHash, accessTokenExpiresAt };
      });
      if (!record) throw new OAuthError('invalid_grant', 400, 'Unknown authorization code');
      return {
        access_token: accessToken,
        token_type: 'Bearer' as const,
        expires_in: config.accessTokenTtlSeconds,
        scope: record.scopes.join(' '),
      };
    },

    async authenticateAccessToken(rawToken: string, requiredScopes: string[] = []) {
      if (!rawToken) throw new OAuthError('invalid_token', 401, 'Missing bearer token');
      const record = await repository.findAccessToken(hashSecret(rawToken));
      const checkedAt = now();
      if (!record || record.revokedAt || !record.accessTokenExpiresAt || record.accessTokenExpiresAt.getTime() <= checkedAt.getTime()
        || record.resource !== config.resource) {
        throw new OAuthError('invalid_token', 401, 'Bearer token is invalid or expired');
      }
      if (requiredScopes.some((scope) => !record.scopes.includes(scope))) {
        throw new OAuthError('insufficient_scope', 403, 'Bearer token does not grant the required scope');
      }
      return {
        user: { id: record.userId, username: record.username, isAdmin: record.isAdmin } satisfies AuthenticatedUser,
        scopes: [...record.scopes],
        clientId: record.clientId,
      };
    },

    async revokeAccessToken(rawToken: string): Promise<void> {
      if (rawToken) await repository.revokeAccessToken(hashSecret(rawToken));
    },
  };
}
