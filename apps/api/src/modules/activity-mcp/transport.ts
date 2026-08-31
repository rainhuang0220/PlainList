import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { JSONRPCMessageSchema } from '@modelcontextprotocol/sdk/types.js';
import type { NextFunction, Request, Response } from 'express';
import { Router, json } from 'express';
import { mcpAllowedOrigins, mcpOAuthConfig } from './oauth/config';
import { MysqlOAuthGrantRepository } from './oauth/repository';
import { MCP_SCOPES, OAuthError, createOAuthService } from './oauth/service';
import { createActivityMcpServer, type McpPrincipal } from './server';

type TokenAuthenticator = (token: string) => Promise<McpPrincipal>;

const productionOAuthService = createOAuthService({
  repository: new MysqlOAuthGrantRepository(),
  config: mcpOAuthConfig,
});

function jsonRpcError(res: Response, status: number, code: number, message: string): void {
  res.status(status).json({ jsonrpc: '2.0', error: { code, message }, id: null });
}

function bearerChallenge(res: Response, error: OAuthError): void {
  const metadata = `${mcpOAuthConfig.issuer}/.well-known/oauth-protected-resource`;
  res.set('WWW-Authenticate', `Bearer resource_metadata="${metadata}", scope="${MCP_SCOPES.join(' ')}", error="${error.error}"`);
  res.status(error.status).json({ error: error.error, error_description: error.message });
}

function contentTypeMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!req.is('application/json') && !req.is('application/*+json')) {
    jsonRpcError(res, 415, -32600, 'Content-Type must be application/json');
    return;
  }
  next();
}

function acceptMiddleware(req: Request, res: Response, next: NextFunction): void {
  const accept = String(req.headers.accept ?? '').toLowerCase();
  if (!accept.includes('application/json') || !accept.includes('text/event-stream')) {
    jsonRpcError(res, 406, -32600, 'Accept must include application/json and text/event-stream');
    return;
  }
  next();
}

export function createActivityMcpTransportRouter(dependencies: {
  authenticateToken?: TokenAuthenticator;
  allowedOrigins?: Set<string>;
  createServer?: typeof createActivityMcpServer;
} = {}) {
  const authenticateToken = dependencies.authenticateToken ?? (async (token: string) => {
    const principal = await productionOAuthService.authenticateAccessToken(token);
    return principal;
  });
  const allowedOrigins = dependencies.allowedOrigins ?? mcpAllowedOrigins;
  const createServer = dependencies.createServer ?? createActivityMcpServer;
  const router = Router();

  router.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.has(origin)) {
      res.status(403).json({ error: 'invalid_origin' });
      return;
    }
    next();
  });

  router.post('/', contentTypeMiddleware, acceptMiddleware, json({ limit: '16kb', strict: true }), async (req, res) => {
    const authorization = req.headers.authorization;
    const bearer = authorization?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
    if (!bearer) {
      bearerChallenge(res, new OAuthError('invalid_token', 401, 'Missing bearer token'));
      return;
    }

    let principal: McpPrincipal;
    try {
      principal = await authenticateToken(bearer);
    } catch (error) {
      bearerChallenge(res, error instanceof OAuthError ? error : new OAuthError('invalid_token', 401, 'Invalid bearer token'));
      return;
    }
    if (!JSONRPCMessageSchema.safeParse(req.body).success) {
      jsonRpcError(res, 400, -32600, 'Invalid JSON-RPC request');
      return;
    }

    const server = createServer(principal);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      void transport.close();
      void server.close();
    };
    try {
      await server.connect(transport);
      res.on('close', close);
      await transport.handleRequest(req, res, req.body);
    } catch {
      close();
      if (!res.headersSent) jsonRpcError(res, 500, -32603, 'Internal MCP server error');
    }
  });

  const methodNotAllowed = (_req: Request, res: Response) => {
    res.set('Allow', 'POST, GET');
    jsonRpcError(res, 405, -32000, 'Method not allowed');
  };
  router.get('/', methodNotAllowed);
  router.delete('/', methodNotAllowed);
  router.put('/', methodNotAllowed);
  router.patch('/', methodNotAllowed);

  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status: number }).status) : 400;
    jsonRpcError(res, status === 413 ? 413 : 400, status === 413 ? -32600 : -32700,
      status === 413 ? 'MCP request body exceeds 16 KiB' : 'Invalid JSON-RPC JSON');
  });

  return router;
}
