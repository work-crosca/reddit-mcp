import { describe, expect, it } from 'vitest';
import {
  flattenCommentListing,
  mapPostData,
  normalizePostId,
  normalizePostRequirements,
  normalizeSubreddit
} from '../src/reddit/client.js';

describe('Reddit response normalization', () => {
  it('normalizes post IDs and subreddit names', () => {
    expect(normalizePostId('t3_AbC123')).toBe('abc123');
    expect(normalizePostId('abc123')).toBe('abc123');
    expect(normalizeSubreddit('r/FanFiction')).toBe('FanFiction');
  });

  it('maps a Reddit post and removes deleted optional content', () => {
    const post = mapPostData({
      id: 'abc123',
      subreddit: 'FanFiction',
      title: 'Where do you publish?',
      author: '[deleted]',
      selftext: '[removed]',
      score: 12,
      num_comments: 3,
      created_utc: 1_700_000_000,
      permalink: '/r/FanFiction/comments/abc123/test/',
      url: 'https://www.reddit.com/r/FanFiction/comments/abc123/test/',
      over_18: false,
      locked: false,
      archived: false
    });

    expect(post.id).toBe('abc123');
    expect(post.author).toBeUndefined();
    expect(post.body).toBeUndefined();
    expect(post.score).toBe(12);
    expect(post.nsfw).toBe(false);
  });

  it('flattens bounded comment trees and marks more nodes', () => {
    const result = flattenCommentListing(
      [
        {
          kind: 't1',
          data: {
            id: 'c1',
            parent_id: 't3_p1',
            author: 'writer',
            body: 'First',
            score: 3,
            created_utc: 1_700_000_000,
            depth: 0,
            replies: {
              data: {
                children: [
                  {
                    kind: 't1',
                    data: {
                      id: 'c2',
                      parent_id: 't1_c1',
                      author: 'reader',
                      body: 'Reply',
                      score: 2,
                      created_utc: 1_700_000_001,
                      depth: 1,
                      replies: ''
                    }
                  },
                  { kind: 'more', data: { children: ['c3'] } }
                ]
              }
            }
          }
        }
      ],
      'p1',
      4
    );

    expect(result.items.map(comment => comment.id)).toEqual(['c1', 'c2']);
    expect(result.items[1]?.parentId).toBe('c1');
    expect(result.hasMore).toBe(true);
  });

  it('normalizes documented post requirements and preserves unknown fields', () => {
    const requirements = normalizePostRequirements('FanFiction', {
      body_restriction_policy: 'none',
      domain_blacklist: ['spam.example'],
      is_flair_required: true,
      title_text_min_length: 10,
      future_reddit_field: 'preserved'
    });

    expect(requirements.isFlairRequired).toBe(true);
    expect(requirements.titleTextMinLength).toBe(10);
    expect(requirements.extra).toEqual({ future_reddit_field: 'preserved' });
  });
});
