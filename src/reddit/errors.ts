export type RedditMcpErrorCode =
  | 'INVALID_INPUT'
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_ERROR'
  | 'CONFIGURATION_ERROR';

export class RedditMcpError extends Error {
  readonly code: RedditMcpErrorCode;
  readonly status?: number;
  readonly retryAfterMs?: number;

  constructor(
    code: RedditMcpErrorCode,
    message: string,
    options: { status?: number; retryAfterMs?: number; cause?: unknown } = {}
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'RedditMcpError';
    this.code = code;
    this.status = options.status;
    this.retryAfterMs = options.retryAfterMs;
  }
}

export function errorForStatus(status: number, retryAfterMs?: number): RedditMcpError {
  if (status === 401) return new RedditMcpError('AUTH_REQUIRED', 'Reddit rejected the OAuth token.', { status });
  if (status === 403) return new RedditMcpError('FORBIDDEN', 'Reddit denied access to this resource or OAuth scope.', { status });
  if (status === 404) return new RedditMcpError('NOT_FOUND', 'The requested Reddit resource was not found.', { status });
  if (status === 429) return new RedditMcpError('RATE_LIMITED', 'Reddit rate limit reached.', { status, retryAfterMs });
  return new RedditMcpError('UPSTREAM_ERROR', `Reddit API returned HTTP ${status}.`, { status });
}

export function toSafeToolError(error: unknown): { code: RedditMcpErrorCode; message: string; retryAfterMs?: number } {
  if (error instanceof RedditMcpError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.retryAfterMs === undefined ? {} : { retryAfterMs: error.retryAfterMs })
    };
  }
  return { code: 'UPSTREAM_ERROR', message: 'Unexpected error while contacting Reddit.' };
}
