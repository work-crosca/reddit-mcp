import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { toSafeToolError } from '../reddit/errors.js';
import type { RedditClient } from '../reddit/types.js';

const subredditSchema = z.string().min(2).max(23).describe('Subreddit name, with or without r/ prefix.');

function success<T extends object>(data: T) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data) }],
    structuredContent: data as Record<string, unknown>
  };
}

function failure(error: unknown) {
  const safe = toSafeToolError(error);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(safe) }],
    structuredContent: safe,
    isError: true
  };
}

export function registerRedditTools(server: McpServer, reddit: RedditClient): void {
  server.registerTool(
    'search_reddit',
    {
      title: 'Search Reddit',
      description:
        'Search Reddit posts through the official Reddit API. v0.1 returns posts only, not comment-search results. Supports subreddit scoping and listing pagination.',
      inputSchema: z.object({
        query: z.string().trim().min(1).max(512),
        subreddit: subredditSchema.optional(),
        sort: z.enum(['relevance', 'hot', 'top', 'new', 'comments']).optional(),
        timeRange: z.enum(['hour', 'day', 'week', 'month', 'year', 'all']).optional(),
        limit: z.number().int().min(1).max(50).optional(),
        cursor: z.string().min(1).optional()
      }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async input => {
      try {
        return success(await reddit.search(input));
      } catch (error) {
        return failure(error);
      }
    }
  );

  server.registerTool(
    'get_post',
    {
      title: 'Get Reddit post',
      description: 'Fetch one Reddit post by short base36 id or t3_ fullname.',
      inputSchema: z.object({ id: z.string().trim().min(1).max(64) }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ id }) => {
      try {
        return success(await reddit.getPost(id));
      } catch (error) {
        return failure(error);
      }
    }
  );

  server.registerTool(
    'get_comments',
    {
      title: 'Get Reddit comments',
      description:
        'Fetch a bounded, flattened view of comments for a Reddit post. Nested relationships are preserved through parentId/depth. A truncated flag indicates omitted Reddit more-comments nodes or additional fetched comments.',
      inputSchema: z.object({
        postId: z.string().trim().min(1).max(64),
        sort: z.enum(['confidence', 'top', 'new', 'controversial', 'old', 'qa']).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        depth: z.number().int().min(0).max(10).optional(),
        cursor: z.string().min(1).optional()
      }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async input => {
      try {
        return success(await reddit.getComments(input));
      } catch (error) {
        return failure(error);
      }
    }
  );

  server.registerTool(
    'get_subreddit_rules',
    {
      title: 'Get subreddit rules',
      description: 'Read moderator-defined rules for a subreddit plus Reddit site rules returned by the API.',
      inputSchema: z.object({ subreddit: subredditSchema }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ subreddit }) => {
      try {
        return success(await reddit.getSubredditRules(subreddit));
      } catch (error) {
        return failure(error);
      }
    }
  );

  server.registerTool(
    'get_post_requirements',
    {
      title: 'Get subreddit post requirements',
      description:
        'Read Reddit submission requirements for a subreddit. Reddit documents this GET endpoint under the submit OAuth scope, so a user-granted refresh token may be required even though this MCP tool never writes data.',
      inputSchema: z.object({ subreddit: subredditSchema }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ subreddit }) => {
      try {
        return success(await reddit.getPostRequirements(subreddit));
      } catch (error) {
        return failure(error);
      }
    }
  );
}
