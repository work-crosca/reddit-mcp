import { RedditMcpError } from './errors.js';

export interface RedditOAuthConfig {
  clientId: string;
  clientSecret: string;
  userAgent: string;
  refreshToken?: string;
  requestTimeoutMs: number;
}

interface CachedToken {
  value: string;
  expiresAt: number;
}

interface RedditTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
}

export interface RedditTokenProvider {
  getAccessToken(): Promise<string>;
  invalidate(): void;
}

export class RedditOAuthTokenProvider implements RedditTokenProvider {
  private token?: CachedToken;

  constructor(private readonly config: RedditOAuthConfig, private readonly fetchImpl: typeof fetch = fetch) {}

  invalidate(): void {
    this.token = undefined;
  }

  async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.token && this.token.expiresAt - 60_000 > now) return this.token.value;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);

    try {
      const body = new URLSearchParams();
      if (this.config.refreshToken) {
        body.set('grant_type', 'refresh_token');
        body.set('refresh_token', this.config.refreshToken);
      } else {
        body.set('grant_type', 'client_credentials');
      }

      const basic = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`, 'utf8').toString('base64');
      const response = await this.fetchImpl('https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: {
          authorization: `Basic ${basic}`,
          'content-type': 'application/x-www-form-urlencoded',
          'user-agent': this.config.userAgent
        },
        body,
        signal: controller.signal
      });

      if (!response.ok) {
        throw new RedditMcpError('AUTH_REQUIRED', `Reddit OAuth token request failed with HTTP ${response.status}.`, {
          status: response.status
        });
      }

      const payload = (await response.json()) as RedditTokenResponse;
      if (!payload.access_token) {
        throw new RedditMcpError('AUTH_REQUIRED', `Reddit OAuth token response did not include an access token${payload.error ? ` (${payload.error})` : ''}.`);
      }

      const expiresIn = Math.max(60, payload.expires_in ?? 3600);
      this.token = { value: payload.access_token, expiresAt: now + expiresIn * 1000 };
      return this.token.value;
    } catch (error) {
      if (error instanceof RedditMcpError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new RedditMcpError('UPSTREAM_TIMEOUT', 'Reddit OAuth token request timed out.', { cause: error });
      }
      throw new RedditMcpError('UPSTREAM_ERROR', 'Reddit OAuth token request failed.', { cause: error });
    } finally {
      clearTimeout(timeout);
    }
  }
}
