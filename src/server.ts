import { timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { loadConfig, missingRedditConfig } from './config/env.js';
import { RedditApiClient } from './reddit/client.js';
import { RedditMcpError } from './reddit/errors.js';
import { RedditOAuthTokenProvider } from './reddit/oauth.js';
import type { RedditClient } from './reddit/types.js';
import { registerRedditTools } from './tools/register.js';

const config = loadConfig();

function buildRedditClient(): RedditClient {
  const missing = missingRedditConfig(config);
  if (missing.length > 0) {
    const error = new RedditMcpError(
      'CONFIGURATION_ERROR',
      `Reddit API is not configured. Missing: ${missing.join(', ')}.`
    );
    return {
      search: async () => Promise.reject(error),
      getPost: async () => Promise.reject(error),
      getComments: async () => Promise.reject(error),
      getSubredditRules: async () => Promise.reject(error),
      getPostRequirements: async () => Promise.reject(error)
    };
  }

  const tokenProvider = new RedditOAuthTokenProvider({
    clientId: config.redditClientId!,
    clientSecret: config.redditClientSecret!,
    userAgent: config.redditUserAgent!,
    ...(config.redditRefreshToken ? { refreshToken: config.redditRefreshToken } : {}),
    requestTimeoutMs: config.redditRequestTimeoutMs
  });

  return new RedditApiClient(
    {
      userAgent: config.redditUserAgent!,
      requestTimeoutMs: config.redditRequestTimeoutMs,
      maxRetries: config.redditMaxRetries
    },
    tokenProvider
  );
}

const reddit = buildRedditClient();

function buildMcpServer(): McpServer {
  const server = new McpServer({ name: 'reddit-mcp', version: '0.1.0' }, { capabilities: { tools: {} } });
  registerRedditTools(server, reddit);
  return server;
}

const mcpHandler = createMcpHandler(buildMcpServer);
const nodeMcpHandler = toNodeHandler(mcpHandler, {
  onerror: error =>
    console.error(JSON.stringify({ level: 'error', event: 'mcp_handler_error', message: error.message }))
});

function json(res: import('node:http').ServerResponse, status: number, body: Record<string, unknown>): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function secureEqual(expected: string, actual: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

function isMcpAuthorized(req: import('node:http').IncomingMessage): boolean {
  if (!config.mcpBearerToken) return true;
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return false;
  return secureEqual(config.mcpBearerToken, header.slice('Bearer '.length));
}

function isAllowedHost(req: import('node:http').IncomingMessage): boolean {
  if (config.allowedHosts.length === 0) return true;
  const host = (req.headers.host ?? '').split(':')[0]?.toLowerCase() ?? '';
  return config.allowedHosts.some(candidate => candidate.toLowerCase() === host);
}

function isAllowedOrigin(req: import('node:http').IncomingMessage): boolean {
  if (config.allowedOrigins.length === 0) return true;
  const origin = req.headers.origin;
  if (!origin) return true;
  return config.allowedOrigins.includes(origin);
}

const httpServer = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    json(res, 200, { status: 'ok', service: 'reddit-mcp', version: '0.1.0' });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/ready') {
    const missing = missingRedditConfig(config);
    const ready = missing.length === 0;
    json(res, ready ? 200 : 503, {
      status: ready ? 'ready' : 'not_ready',
      redditConfigured: ready,
      redditAuthMode: config.redditRefreshToken ? 'refresh_token' : 'client_credentials',
      mcpAuthConfigured: Boolean(config.mcpBearerToken),
      ...(ready ? {} : { missing })
    });
    return;
  }

  if (url.pathname !== '/mcp') {
    json(res, 404, { error: 'not_found' });
    return;
  }

  if (!isAllowedHost(req) || !isAllowedOrigin(req)) {
    json(res, 403, { error: 'forbidden_origin' });
    return;
  }

  if (!isMcpAuthorized(req)) {
    res.setHeader('www-authenticate', 'Bearer realm="reddit-mcp"');
    json(res, 401, { error: 'unauthorized' });
    return;
  }

  void nodeMcpHandler(req, res);
});

httpServer.listen(config.port, config.host, () => {
  console.error(
    JSON.stringify({
      level: 'info',
      event: 'server_started',
      host: config.host,
      port: config.port,
      mcpPath: '/mcp',
      redditConfigured: missingRedditConfig(config).length === 0
    })
  );
});

async function shutdown(signal: string): Promise<void> {
  console.error(JSON.stringify({ level: 'info', event: 'shutdown', signal }));
  await mcpHandler.close();
  await new Promise<void>(resolve => httpServer.close(() => resolve()));
}

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
