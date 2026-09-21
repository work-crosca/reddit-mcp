import { errorForStatus, RedditMcpError } from './errors.js';
import type { RedditTokenProvider } from './oauth.js';
import type {
  PostRequirements,
  RedditClient,
  RedditComment,
  RedditCommentPage,
  RedditCommentsInput,
  RedditPost,
  RedditSearchInput,
  RedditSearchPage,
  RedditSearchResult,
  SubredditRules
} from './types.js';

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function isoFromUnix(value: unknown): string {
  const seconds = asNumber(value) ?? 0;
  return new Date(seconds * 1000).toISOString();
}

export function normalizePostId(value: string): string {
  const id = value.trim().toLowerCase().replace(/^t3_/, '');
  if (!/^[a-z0-9]+$/.test(id)) {
    throw new RedditMcpError('INVALID_INPUT', 'Invalid Reddit post ID.');
  }
  return id;
}

export function normalizeSubreddit(value: string): string {
  const subreddit = value.trim().replace(/^r\//i, '');
  if (!/^[A-Za-z0-9_]{2,21}$/.test(subreddit)) {
    throw new RedditMcpError('INVALID_INPUT', 'Invalid subreddit name.');
  }
  return subreddit;
}

function encodeCursor(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string | undefined): JsonObject {
  if (!cursor) return {};
  try {
    return asObject(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
  } catch {
    throw new RedditMcpError('INVALID_INPUT', 'Invalid pagination cursor.');
  }
}

function normalizeAuthor(value: unknown): string | undefined {
  const author = asString(value);
  return author && author !== '[deleted]' ? author : undefined;
}

function normalizeBody(value: unknown): string | undefined {
  const body = asString(value);
  return body && body !== '[deleted]' && body !== '[removed]' ? body : undefined;
}

export function mapPostData(data: JsonObject): RedditPost {
  const id = asString(data.id);
  const subreddit = asString(data.subreddit);
  const title = asString(data.title);
  const permalink = asString(data.permalink);

  if (!id || !subreddit || !title || !permalink) {
    throw new RedditMcpError('UPSTREAM_ERROR', 'Reddit returned an incomplete post payload.');
  }

  return {
    id,
    subreddit,
    author: normalizeAuthor(data.author),
    title,
    body: normalizeBody(data.selftext),
    score: asNumber(data.score) ?? 0,
    commentCount: asNumber(data.num_comments) ?? 0,
    createdAt: isoFromUnix(data.created_utc),
    permalink: `https://www.reddit.com${permalink}`,
    url: asString(data.url),
    flair: asString(data.link_flair_text),
    nsfw: asBoolean(data.over_18),
    locked: asBoolean(data.locked),
    archived: asBoolean(data.archived)
  };
}

function mapSearchResult(data: JsonObject): RedditSearchResult {
  const post = mapPostData(data);
  return {
    id: post.id,
    kind: 'post',
    subreddit: post.subreddit,
    author: post.author,
    title: post.title,
    text: post.body,
    score: post.score,
    commentCount: post.commentCount,
    createdAt: post.createdAt,
    permalink: post.permalink,
    url: post.url,
    nsfw: post.nsfw
  };
}

export function normalizePostRequirements(subreddit: string, raw: unknown): PostRequirements {
  const data = asObject(raw);
  const knownKeys = new Set([
    'body_blacklisted_strings',
    'body_restriction_policy',
    'domain_blacklist',
    'domain_whitelist',
    'is_flair_required',
    'title_blacklisted_strings',
    'title_required_strings',
    'title_text_max_length',
    'title_text_min_length'
  ]);
  const extra: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (!knownKeys.has(key)) extra[key] = value;
  }

  return {
    subreddit,
    bodyBlacklistedStrings: asStringArray(data.body_blacklisted_strings),
    bodyRestrictionPolicy: asString(data.body_restriction_policy),
    domainBlacklist: asStringArray(data.domain_blacklist),
    domainWhitelist: asStringArray(data.domain_whitelist),
    isFlairRequired: asBoolean(data.is_flair_required),
    titleBlacklistedStrings: asStringArray(data.title_blacklisted_strings),
    titleRequiredStrings: asStringArray(data.title_required_strings),
    titleTextMaxLength: asNumber(data.title_text_max_length),
    titleTextMinLength: asNumber(data.title_text_min_length),
    extra
  };
}

export function flattenCommentListing(
  rawChildren: unknown,
  postId: string,
  maxDepth: number
): { items: RedditComment[]; hasMore: boolean } {
  const result: RedditComment[] = [];
  let hasMore = false;

  const visit = (children: unknown, depth: number): void => {
    if (!Array.isArray(children)) return;

    for (const child of children) {
      const thing = asObject(child);
      const kind = asString(thing.kind);
      if (kind === 'more') {
        hasMore = true;
        continue;
      }
      if (kind !== 't1') continue;

      const data = asObject(thing.data);
      const id = asString(data.id);
      const body = normalizeBody(data.body);
      if (id && body && depth <= maxDepth) {
        const rawParentId = asString(data.parent_id);
        result.push({
          id,
          postId,
          parentId: rawParentId?.replace(/^t[13]_/, ''),
          author: normalizeAuthor(data.author),
          body,
          score: asNumber(data.score) ?? 0,
          createdAt: isoFromUnix(data.created_utc),
          permalink: asString(data.permalink)
            ? `https://www.reddit.com${asString(data.permalink)}`
            : undefined,
          depth
        });
      }

      const replies = data.replies;
      if (depth < maxDepth && replies && typeof replies === 'object') {
        const listing = asObject(asObject(replies).data);
        visit(listing.children, depth + 1);
      } else if (replies && typeof replies === 'object') {
        hasMore = true;
      }
    }
  };

  visit(rawChildren, 0);
  return { items: result, hasMore };
}

interface RedditApiClientConfig {
  userAgent: string;
  requestTimeoutMs: number;
  maxRetries: number;
}

export class RedditApiClient implements RedditClient {
  constructor(
    private readonly config: RedditApiClientConfig,
    private readonly tokens: RedditTokenProvider,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  private async requestJson(path: string, params: URLSearchParams = new URLSearchParams()): Promise<unknown> {
    params.set('raw_json', '1');
    const url = new URL(path, 'https://oauth.reddit.com');
    url.search = params.toString();

    let lastError: unknown;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);

      try {
        const accessToken = await this.tokens.getAccessToken();
        const response = await this.fetchImpl(url, {
          headers: {
            authorization: `Bearer ${accessToken}`,
            'user-agent': this.config.userAgent
          },
          signal: controller.signal
        });

        const retryAfterHeader = response.headers.get('retry-after');
        const retryAfterMs = retryAfterHeader ? Math.max(0, Number.parseFloat(retryAfterHeader) * 1000) : undefined;

        if (response.status === 401 && attempt === 0) {
          this.tokens.invalidate();
          lastError = errorForStatus(response.status);
          continue;
        }

        if (!response.ok) {
          const error = errorForStatus(response.status, retryAfterMs);
          const retryable = response.status === 429 || response.status >= 500;

          if (retryable && attempt < this.config.maxRetries) {
            const delayMs = retryAfterMs ?? Math.min(250 * 2 ** attempt, 2_000);
            if (delayMs <= 5_000) {
              await new Promise(resolve => setTimeout(resolve, delayMs));
              lastError = error;
              continue;
            }
          }
          throw error;
        }

        return await response.json();
      } catch (error) {
        if (error instanceof RedditMcpError) throw error;

        const timedOut = error instanceof Error && error.name === 'AbortError';
        const wrapped = new RedditMcpError(
          timedOut ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_ERROR',
          timedOut ? 'Reddit API request timed out.' : 'Reddit API request failed.',
          { cause: error }
        );

        if (attempt < this.config.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, Math.min(250 * 2 ** attempt, 2_000)));
          lastError = wrapped;
          continue;
        }
        throw wrapped;
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new RedditMcpError('UPSTREAM_ERROR', 'Reddit API request failed after retries.');
  }

  async search(input: RedditSearchInput): Promise<RedditSearchPage> {
    const params = new URLSearchParams();
    params.set('q', input.query.trim());
    params.set('sort', input.sort ?? 'relevance');
    params.set('t', input.timeRange ?? 'all');
    params.set('limit', String(Math.min(Math.max(input.limit ?? 20, 1), 50)));
    params.set('type', 'link');

    let path = '/search';
    if (input.subreddit) {
      const subreddit = normalizeSubreddit(input.subreddit);
      path = `/r/${subreddit}/search`;
      params.set('restrict_sr', '1');
    }

    const cursor = decodeCursor(input.cursor);
    const after = asString(cursor.after);
    if (after) params.set('after', after);

    const payload = asObject(await this.requestJson(path, params));
    const listing = asObject(payload.data);
    const children = Array.isArray(listing.children) ? listing.children : [];

    const items = children
      .map(asObject)
      .filter(thing => asString(thing.kind) === 't3')
      .map(thing => mapSearchResult(asObject(thing.data)));

    const nextAfter = asString(listing.after);
    return {
      items,
      ...(nextAfter ? { nextCursor: encodeCursor({ after: nextAfter }) } : {})
    };
  }

  async getPost(idValue: string): Promise<RedditPost> {
    const id = normalizePostId(idValue);
    const params = new URLSearchParams({ limit: '1', depth: '0' });
    const payload = await this.requestJson(`/comments/${id}`, params);

    if (!Array.isArray(payload) || payload.length === 0) {
      throw new RedditMcpError('NOT_FOUND', 'The requested Reddit post was not found.');
    }

    const listing = asObject(payload[0]);
    const data = asObject(listing.data);
    const children = Array.isArray(data.children) ? data.children : [];
    const first = asObject(children[0]);
    if (asString(first.kind) !== 't3') {
      throw new RedditMcpError('NOT_FOUND', 'The requested Reddit post was not found.');
    }

    return mapPostData(asObject(first.data));
  }

  async getComments(input: RedditCommentsInput): Promise<RedditCommentPage> {
    const postId = normalizePostId(input.postId);
    const requestedLimit = Math.min(Math.max(input.limit ?? 50, 1), 100);
    const maxDepth = Math.min(Math.max(input.depth ?? 5, 0), 10);
    const cursor = decodeCursor(input.cursor);
    const offset = Math.max(0, Math.floor(asNumber(cursor.offset) ?? 0));
    const upstreamLimit = Math.min(500, Math.max(requestedLimit + offset, requestedLimit));

    const params = new URLSearchParams({
      sort: input.sort ?? 'confidence',
      depth: String(maxDepth),
      limit: String(upstreamLimit)
    });

    const payload = await this.requestJson(`/comments/${postId}`, params);
    if (!Array.isArray(payload) || payload.length < 2) {
      throw new RedditMcpError('UPSTREAM_ERROR', 'Reddit returned an invalid comment listing.');
    }

    const commentsListing = asObject(payload[1]);
    const children = asObject(commentsListing.data).children;
    const flattened = flattenCommentListing(children, postId, maxDepth);
    const items = flattened.items.slice(offset, offset + requestedLimit);
    const nextOffset = offset + items.length;
    const hasNext = nextOffset < flattened.items.length || flattened.hasMore;

    return {
      items,
      ...(hasNext ? { nextCursor: encodeCursor({ offset: nextOffset }) } : {}),
      truncated: flattened.hasMore
    };
  }

  async getSubredditRules(subredditValue: string): Promise<SubredditRules> {
    const subreddit = normalizeSubreddit(subredditValue);
    const payload = asObject(await this.requestJson(`/r/${subreddit}/about/rules`));

    const rules = Array.isArray(payload.rules)
      ? payload.rules.map(asObject).map(rule => ({
          shortName: asString(rule.short_name) ?? 'Unnamed rule',
          ...(asString(rule.description) ? { description: asString(rule.description) } : {}),
          ...(asString(rule.kind) ? { kind: asString(rule.kind) } : {}),
          ...(asString(rule.violation_reason) ? { violationReason: asString(rule.violation_reason) } : {})
        }))
      : [];

    const siteRules = Array.isArray(payload.site_rules)
      ? payload.site_rules
          .map(item => {
            if (typeof item === 'string') return item;
            return asString(asObject(item).short_name) ?? asString(asObject(item).description);
          })
          .filter((item): item is string => Boolean(item))
      : [];

    return { subreddit, rules, siteRules };
  }

  async getPostRequirements(subredditValue: string): Promise<PostRequirements> {
    const subreddit = normalizeSubreddit(subredditValue);
    const payload = await this.requestJson(`/api/v1/${subreddit}/post_requirements`);
    return normalizePostRequirements(subreddit, payload);
  }
}
