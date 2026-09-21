export interface AppConfig {
  nodeEnv: string;
  host: string;
  port: number;
  redditClientId?: string;
  redditClientSecret?: string;
  redditUserAgent?: string;
  redditRefreshToken?: string;
  mcpBearerToken?: string;
  allowedHosts: string[];
  allowedOrigins: string[];
  redditRequestTimeoutMs: number;
  redditMaxRetries: number;
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseInteger(value: string | undefined, fallback: number, name: string, min: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function parseList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    nodeEnv: clean(env.NODE_ENV) ?? 'development',
    host: clean(env.HOST) ?? '0.0.0.0',
    port: parseInteger(env.PORT, 3000, 'PORT', 1, 65535),
    redditClientId: clean(env.REDDIT_CLIENT_ID),
    redditClientSecret: clean(env.REDDIT_CLIENT_SECRET),
    redditUserAgent: clean(env.REDDIT_USER_AGENT),
    redditRefreshToken: clean(env.REDDIT_REFRESH_TOKEN),
    mcpBearerToken: clean(env.MCP_BEARER_TOKEN),
    allowedHosts: parseList(env.MCP_ALLOWED_HOSTS),
    allowedOrigins: parseList(env.MCP_ALLOWED_ORIGINS),
    redditRequestTimeoutMs: parseInteger(env.REDDIT_REQUEST_TIMEOUT_MS, 10_000, 'REDDIT_REQUEST_TIMEOUT_MS', 1_000, 60_000),
    redditMaxRetries: parseInteger(env.REDDIT_MAX_RETRIES, 2, 'REDDIT_MAX_RETRIES', 0, 5)
  };
}

export function missingRedditConfig(config: AppConfig): string[] {
  const missing: string[] = [];
  if (!config.redditClientId) missing.push('REDDIT_CLIENT_ID');
  if (!config.redditClientSecret) missing.push('REDDIT_CLIENT_SECRET');
  if (!config.redditUserAgent) missing.push('REDDIT_USER_AGENT');
  return missing;
}
