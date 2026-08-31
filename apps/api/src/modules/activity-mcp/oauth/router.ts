import { Router, urlencoded, type NextFunction, type Request, type Response } from 'express';
import { authenticateUserCredentials } from '../../auth/service';
import { logAuthEvent } from '../../../shared/auditLog';
import { getClientIp } from '../../../shared/clientIp';
import { mcpOAuthConfig } from './config';
import { MysqlOAuthGrantRepository } from './repository';
import { MCP_SCOPES, OAuthError, createOAuthService } from './service';

type OAuthService = ReturnType<typeof createOAuthService>;

const scopeDescriptions: Record<string, string> = {
  'plainlist.activity.write': 'Write compact activity digests to your PlainList activity history',
  'plainlist.context.read': 'Read your active goals and compact weekly context',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character] ?? character);
}

function oauthError(error: unknown, res: Response): void {
  const known = error instanceof OAuthError ? error : new OAuthError('invalid_request', 400, 'OAuth request failed');
  res.status(known.status).json({ error: known.error, error_description: known.message });
}

function authorizationParameters(source: Record<string, unknown>) {
  return {
    response_type: source.response_type,
    client_id: source.client_id,
    redirect_uri: source.redirect_uri,
    state: source.state,
    code_challenge: source.code_challenge,
    code_challenge_method: source.code_challenge_method,
    resource: source.resource,
    scope: source.scope,
  };
}

function redirectAuthorizationResult(
  res: Response,
  redirectUri: string,
  values: Record<string, string>,
): void {
  const target = new URL(redirectUri);
  for (const [key, value] of Object.entries(values)) target.searchParams.set(key, value);
  res.redirect(303, target.toString());
}

export function createActivityOAuthRouter(dependencies: {
  service?: OAuthService;
  authenticateCredentials?: typeof authenticateUserCredentials;
  auditAuth?: typeof logAuthEvent;
  issuer?: string;
  resource?: string;
} = {}) {
  const service = dependencies.service ?? createOAuthService({
    repository: new MysqlOAuthGrantRepository(),
    config: mcpOAuthConfig,
  });
  const authenticateCredentials = dependencies.authenticateCredentials ?? authenticateUserCredentials;
  const auditAuth = dependencies.auditAuth ?? logAuthEvent;
  const issuer = dependencies.issuer ?? mcpOAuthConfig.issuer;
  const resource = dependencies.resource ?? mcpOAuthConfig.resource;
  const router = Router();

  router.use('/oauth', urlencoded({ extended: false, limit: '16kb' }));

  router.get('/.well-known/oauth-protected-resource', (_req, res) => {
    res.json({
      resource,
      authorization_servers: [issuer],
      scopes_supported: [...MCP_SCOPES],
      bearer_methods_supported: ['header'],
    });
  });

  router.get('/.well-known/oauth-authorization-server', (_req, res) => {
    res.json({
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      revocation_endpoint: `${issuer}/oauth/revoke`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: [...MCP_SCOPES],
      authorization_response_iss_parameter_supported: true,
      client_id_metadata_document_supported: true,
      resource_indicators_supported: true,
    });
  });

  router.get('/oauth/authorize', async (req, res) => {
    try {
      const request = await service.validateAuthorizationRequest(authorizationParameters(req.query));
      const hidden = Object.entries(authorizationParameters(request))
        .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(String(value))}">`).join('');
      const requested = request.scopes.map((scope) => `<li>${escapeHtml(scopeDescriptions[scope] ?? scope)}</li>`).join('');
      res.set({
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
        'X-Frame-Options': 'DENY',
      }).type('html').send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Authorize PlainList</title><style>body{font:16px system-ui;max-width:34rem;margin:4rem auto;padding:0 1rem}label{display:block;margin:1rem 0}input{display:block;width:100%;padding:.6rem}button{margin:.5rem .5rem 0 0;padding:.7rem 1rem}</style><h1>Connect PlainList</h1><p>The MCP client is requesting permission to:</p><ul>${requested}</ul><form method="post" action="/oauth/authorize">${hidden}<label>PlainList username<input name="username" required autocomplete="username" maxlength="80"></label><label>Passphrase<input name="password" type="password" required autocomplete="current-password" maxlength="200"></label><button name="decision" value="allow">Allow</button><button name="decision" value="deny" formnovalidate>Cancel</button></form></html>`);
    } catch (error) {
      oauthError(error, res);
    }
  });

  router.post('/oauth/authorize', async (req: Request, res: Response) => {
    let request: Awaited<ReturnType<OAuthService['validateAuthorizationRequest']>>;
    try {
      request = await service.validateAuthorizationRequest(authorizationParameters(req.body));
    } catch (error) {
      oauthError(error, res);
      return;
    }
    if (req.body.decision !== 'allow') {
      redirectAuthorizationResult(res, request.redirect_uri, { error: 'access_denied', state: request.state, iss: issuer });
      return;
    }
    try {
      const requestedUsername = typeof req.body.username === 'string' ? req.body.username.trim() : 'unknown';
      let user;
      try {
        user = await authenticateCredentials({ username: req.body.username, password: req.body.password });
        auditAuth({ kind: 'login-ok', ip: getClientIp(req), username: user.username });
      } catch (error) {
        const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status: number }).status) : 500;
        if (status === 401) {
          auditAuth({ kind: 'login-fail', ip: getClientIp(req), username: requestedUsername,
            reason: error instanceof Error ? error.message : 'unauthorized' });
        }
        throw error;
      }
      const authorization = await service.authorize(user, request);
      redirectAuthorizationResult(res, authorization.redirectUri, {
        code: authorization.code, state: authorization.state, iss: authorization.issuer,
      });
    } catch (error) {
      const errorCode = error instanceof OAuthError ? error.error : 'access_denied';
      redirectAuthorizationResult(res, request.redirect_uri, { error: errorCode, state: request.state, iss: issuer });
    }
  });

  router.post('/oauth/token', async (req, res) => {
    try {
      const result = await service.exchangeAuthorizationCode(req.body);
      res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' }).json(result);
    } catch (error) {
      oauthError(error, res);
    }
  });

  router.post('/oauth/revoke', async (req, res) => {
    await service.revokeAccessToken(typeof req.body.token === 'string' ? req.body.token : '');
    res.status(200).end();
  });

  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status: number }).status) : 400;
    const known = status === 413
      ? new OAuthError('invalid_request', 413, 'OAuth request body exceeds 16 KiB')
      : new OAuthError('invalid_request', 400, 'OAuth form body is invalid');
    oauthError(known, res);
  });

  return router;
}
