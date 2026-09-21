export type RedditSearchSort = 'relevance' | 'hot' | 'top' | 'new' | 'comments';
export type RedditTimeRange = 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
export type RedditCommentSort = 'confidence' | 'top' | 'new' | 'controversial' | 'old' | 'qa';

export interface RedditSearchInput {
  query: string;
  subreddit?: string;
  sort?: RedditSearchSort;
  timeRange?: RedditTimeRange;
  limit?: number;
  cursor?: string;
}

export interface RedditCommentsInput {
  postId: string;
  sort?: RedditCommentSort;
  limit?: number;
  depth?: number;
  cursor?: string;
}

export interface RedditSearchResult {
  id: string;
  kind: 'post';
  subreddit: string;
  author?: string;
  title?: string;
  text?: string;
  score: number;
  commentCount?: number;
  createdAt: string;
  permalink: string;
  url?: string;
  nsfw?: boolean;
}

export interface RedditPost {
  id: string;
  subreddit: string;
  author?: string;
  title: string;
  body?: string;
  score: number;
  commentCount: number;
  createdAt: string;
  permalink: string;
  url?: string;
  flair?: string;
  nsfw?: boolean;
  locked?: boolean;
  archived?: boolean;
}

export interface RedditComment {
  id: string;
  postId: string;
  parentId?: string;
  author?: string;
  body: string;
  score: number;
  createdAt: string;
  permalink?: string;
  depth: number;
}

export interface RedditSearchPage {
  items: RedditSearchResult[];
  nextCursor?: string;
}

export interface RedditCommentPage {
  items: RedditComment[];
  nextCursor?: string;
  truncated: boolean;
}

export interface SubredditRule {
  shortName: string;
  description?: string;
  kind?: string;
  violationReason?: string;
}

export interface SubredditRules {
  subreddit: string;
  rules: SubredditRule[];
  siteRules: string[];
}

export interface PostRequirements {
  subreddit: string;
  bodyBlacklistedStrings: string[];
  bodyRestrictionPolicy?: 'required' | 'notAllowed' | 'none' | string;
  domainBlacklist: string[];
  domainWhitelist: string[];
  isFlairRequired?: boolean;
  titleBlacklistedStrings: string[];
  titleRequiredStrings: string[];
  titleTextMaxLength?: number;
  titleTextMinLength?: number;
  extra: Record<string, unknown>;
}

export interface RedditClient {
  search(input: RedditSearchInput): Promise<RedditSearchPage>;
  getPost(id: string): Promise<RedditPost>;
  getComments(input: RedditCommentsInput): Promise<RedditCommentPage>;
  getSubredditRules(subreddit: string): Promise<SubredditRules>;
  getPostRequirements(subreddit: string): Promise<PostRequirements>;
}
