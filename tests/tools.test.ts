import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { McpServer } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RedditClient } from '../src/reddit/types.js';
import { registerRedditTools } from '../src/tools/register.js';

const reddit: RedditClient = {
  search: vi.fn(async input => ({
    items: [
      {
        id: 'abc123',
        kind: 'post',
        subreddit: input.subreddit ?? 'FanFiction',
        title: 'AO3 alternatives?',
        score: 10,
        createdAt: '2026-09-21T00:00:00.000Z',
        permalink: '/r/FanFiction/comments/abc123/'
      }
    ]
  })),
  getPost: vi.fn(async id => ({
    id,
    subreddit: 'FanFiction',
    title: 'Test',
    score: 1,
    commentCount: 0,
    createdAt: '2026-09-21T00:00:00.000Z',
    permalink: `/comments/${id}`
  })),
  getComments: vi.fn(async () => ({ items: [], truncated: false })),
  getSubredditRules: vi.fn(async subreddit => ({ subreddit, rules: [], siteRules: [] })),
  getPostRequirements: vi.fn(async subreddit => ({
    subreddit,
    bodyBlacklistedStrings: [],
    domainBlacklist: [],
    domainWhitelist: [],
    titleBlacklistedStrings: [],
    titleRequiredStrings: [],
    extra: {}
  }))
};

async function createHarness() {
  const server = new McpServer({ name: 'reddit-mcp-test', version: '0.1.0' });
  registerRedditTools(server, reddit);
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { server, client };
}

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (closers.length) await closers.pop()?.();
  vi.clearAllMocks();
});

describe('MCP tools', () => {
  it('advertises exactly the five read-only v0.1 tools', async () => {
    const { server, client } = await createHarness();
    closers.push(async () => {
      await client.close();
      await server.close();
    });
    const result = await client.listTools();
    expect(result.tools.map(tool => tool.name).sort()).toEqual(
      ['get_comments', 'get_post', 'get_post_requirements', 'get_subreddit_rules', 'search_reddit'].sort()
    );
    expect(result.tools.every(tool => tool.annotations?.readOnlyHint === true)).toBe(true);
  });

  it('calls search_reddit and returns structured content', async () => {
    const { server, client } = await createHarness();
    closers.push(async () => {
      await client.close();
      await server.close();
    });
    const result = await client.callTool({
      name: 'search_reddit',
      arguments: { query: 'AO3 alternatives', subreddit: 'FanFiction', limit: 10 }
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      items: [{ id: 'abc123', subreddit: 'FanFiction' }]
    });
    expect(reddit.search).toHaveBeenCalledOnce();
  });

  it('rejects an invalid tool input before calling Reddit', async () => {
    const { server, client } = await createHarness();
    closers.push(async () => {
      await client.close();
      await server.close();
    });
    const result = await client.callTool({ name: 'search_reddit', arguments: { query: '', limit: 500 } });
    expect(result.isError).toBe(true);
    expect(reddit.search).not.toHaveBeenCalled();
  });
});
