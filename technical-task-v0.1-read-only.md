# Technical Task — Reddit MCP v0.1 (Read-only)

## 1. Objective

Build a standalone, reusable remote MCP server that exposes approved Reddit API data to ChatGPT and other MCP-compatible clients.

The first release is intentionally **read-only**. Its purpose is research and community discovery, initially for Ficora, without coupling the connector to Ficora-specific business logic.

Target architecture:

```text
ChatGPT / MCP client
        |
        | MCP (Streamable HTTP)
        v
reddit-mcp.mirco.uk
        |
        | OAuth / Reddit API
        v
Reddit
```

The service must remain generic enough to be reused by other projects.

---

## 2. Scope

### v0.1 tools

Implement exactly these MCP tools:

1. `search_reddit`
2. `get_post`
3. `get_comments`
4. `get_subreddit_rules`
5. `get_post_requirements`

All tools must be read-only.

### Explicitly out of scope for v0.1

Do **not** implement:

- create post
- reply/comment
- edit post/comment
- delete post/comment
- private messages / chat
- voting
- following
- moderation actions
- bulk user profiling
- autonomous outreach
- scraping Reddit HTML as a fallback
- a database unless a concrete technical need appears
- Ficora-specific ranking or acquisition logic
- custom ChatGPT UI/widgets

Write actions may be considered in a later release only after the read-only connector is stable and the required Reddit/API permissions are confirmed.

---

## 3. External prerequisite

Production use must depend on approved Reddit API access.

The implementation should be able to run against fixtures/mocks before production credentials are available.

Do not design around bypassing Reddit API access restrictions.

For any use that may be considered commercial, confirm the applicable Reddit API/Data API agreement requirements before enabling production usage.

---

## 4. Technology

Preferred stack:

- Node.js
- TypeScript
- official MCP TypeScript SDK
- Zod for input/output validation
- native `fetch` or a small HTTP client
- Vitest for unit/integration tests
- Docker

Use current stable package versions at implementation time.

Avoid unnecessary frameworks.

---

## 5. Proposed repository structure

```text
reddit-mcp/
├── src/
│   ├── server.ts
│   │
│   ├── config/
│   │   └── env.ts
│   │
│   ├── reddit/
│   │   ├── client.ts
│   │   ├── oauth.ts
│   │   ├── schemas.ts
│   │   ├── types.ts
│   │   └── errors.ts
│   │
│   ├── policy/
│   │   ├── rate-limit.ts
│   │   └── permissions.ts
│   │
│   └── tools/
│       ├── search-reddit.ts
│       ├── get-post.ts
│       ├── get-comments.ts
│       ├── get-subreddit-rules.ts
│       └── get-post-requirements.ts
│
├── tests/
│   ├── fixtures/
│   ├── reddit/
│   └── tools/
│
├── .env.example
├── .gitignore
├── Dockerfile
├── package.json
├── tsconfig.json
└── README.md
```

The exact structure may be adjusted if the implementation benefits from a simpler layout, but keep the Reddit client separate from MCP tool handlers.

---

## 6. MCP transport

Expose a remote MCP server over Streamable HTTP.

Recommended endpoints:

```text
POST /mcp
GET  /health
GET  /ready
```

Requirements:

- `/health` confirms that the process is alive.
- `/ready` confirms configuration is valid and required dependencies are ready.
- `/mcp` is the MCP transport endpoint.
- No Reddit credentials or tokens may ever be returned by any endpoint.
- Tool definitions must mark read-only behavior appropriately where supported by the MCP SDK.

Do not add UI resources in v0.1.

---

## 7. Reddit authentication

Create a dedicated Reddit OAuth module.

Responsibilities:

- obtain/refresh Reddit access tokens using the approved Reddit application credentials
- keep tokens out of logs and tool responses
- refresh tokens before/after expiry as appropriate
- surface normalized authentication errors
- allow the Reddit client to be mocked in tests

Environment configuration should be centralized.

Example variables:

```text
NODE_ENV=
PORT=3000

REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
REDDIT_USER_AGENT=

# Add other OAuth fields only if required by the approved Reddit app type.
```

Do not commit secrets.

The final OAuth flow must match the Reddit application type and permissions actually approved for this project.

---

## 8. Reddit client layer

Create a small typed client instead of calling Reddit directly from each MCP tool.

Example interface:

```ts
interface RedditClient {
  search(input: RedditSearchInput): Promise<RedditSearchPage>;
  getPost(id: string): Promise<RedditPost>;
  getComments(input: RedditCommentsInput): Promise<RedditCommentPage>;
  getSubredditRules(subreddit: string): Promise<SubredditRules>;
  getPostRequirements(subreddit: string): Promise<PostRequirements>;
}
```

Responsibilities:

- OAuth headers
- User-Agent
- timeouts
- Reddit response parsing
- pagination/cursors
- rate-limit metadata
- normalized errors
- retry policy for safe transient failures only

Do not leak raw Reddit response objects into the MCP layer.

---

## 9. Normalized data model

Prefer stable, compact, structured responses.

### Search result

```ts
type RedditSearchResult = {
  id: string;
  kind: "post" | "comment";
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
};
```

### Post

```ts
type RedditPost = {
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
};
```

### Comment

```ts
type RedditComment = {
  id: string;
  postId: string;
  parentId?: string;
  author?: string;
  body: string;
  score: number;
  createdAt: string;
  permalink?: string;
  depth: number;
};
```

Deleted/removed authors or content must be represented safely instead of causing parsing failures.

---

## 10. Tool contracts

### 10.1 `search_reddit`

Purpose: search Reddit posts/comments using the Reddit API.

Input:

```ts
{
  query: string;
  subreddit?: string;
  sort?: "relevance" | "hot" | "top" | "new" | "comments";
  timeRange?: "hour" | "day" | "week" | "month" | "year" | "all";
  limit?: number;
  cursor?: string;
}
```

Rules:

- `query` required and trimmed.
- `limit` default: 20.
- `limit` maximum: 50.
- Support pagination with an opaque cursor.
- If `subreddit` is provided, restrict the API request to it.
- Return normalized objects only.
- Do not silently broaden a subreddit-scoped request to all Reddit.

Output:

```ts
{
  items: RedditSearchResult[];
  nextCursor?: string;
}
```

If Reddit search behavior differs by result type, document the behavior clearly instead of pretending all combinations are supported.

---

### 10.2 `get_post`

Input:

```ts
{
  id: string;
}
```

Requirements:

- accept canonical Reddit fullname or supported short post ID
- normalize the identifier internally
- return one normalized `RedditPost`
- distinguish not-found, forbidden/private and rate-limit errors

---

### 10.3 `get_comments`

Input:

```ts
{
  postId: string;
  sort?: "confidence" | "top" | "new" | "controversial" | "old" | "qa";
  limit?: number;
  depth?: number;
  cursor?: string;
}
```

Rules:

- sensible default limit
- maximum result count must be bounded
- depth must be bounded
- preserve parent/depth relationships where possible
- do not return unbounded comment trees
- support pagination or continuation when Reddit exposes it

Output:

```ts
{
  items: RedditComment[];
  nextCursor?: string;
}
```

---

### 10.4 `get_subreddit_rules`

Input:

```ts
{
  subreddit: string;
}
```

Return a compact normalized structure:

```ts
{
  subreddit: string;
  rules: Array<{
    shortName: string;
    description?: string;
    kind?: string;
    violationReason?: string;
  }>;
}
```

This tool is important for any future workflow that prepares content intended for a subreddit.

---

### 10.5 `get_post_requirements`

Input:

```ts
{
  subreddit: string;
}
```

Return the subreddit posting requirements exposed by Reddit, normalized into a stable schema.

Examples may include:

- title length constraints
- body requirements
- flair requirements
- domain restrictions
- title/body regex rules
- allowed post types
- other API-provided submission constraints

Do not invent requirements that are not returned by Reddit.

---

## 11. Error model

All tools should expose useful, normalized errors.

Suggested categories:

```ts
type RedditMcpErrorCode =
  | "INVALID_INPUT"
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "UPSTREAM_TIMEOUT"
  | "UPSTREAM_ERROR"
  | "CONFIGURATION_ERROR";
```

A tool error should be concise and actionable.

Never return:

- OAuth tokens
- client secrets
- raw authorization headers
- full internal stack traces in production

Log detailed stack traces server-side only.

---

## 12. Rate limiting and retries

Respect Reddit-provided rate-limit information.

Requirements:

- inspect relevant upstream rate-limit headers when available
- do not exceed Reddit API limits
- no uncontrolled retry loops
- retry only safe read requests and only for transient failures
- use exponential backoff with a small maximum retry count
- respect `Retry-After` when supplied
- do not retry authentication/permission/not-found errors

The connector may also have its own defensive per-client limits.

---

## 13. Security and privacy

Minimum requirements:

- secrets via environment variables / deployment secret store
- validate all MCP tool inputs
- bound all limits/depth values
- enforce upstream timeouts
- sanitize logs
- no token logging
- no storing Reddit content by default
- no user profiling database
- no HTML scraping fallback
- no write endpoints in v0.1
- run container as non-root where practical
- minimal production image
- dependency audit in CI

If an MCP authentication layer is added for the remote server, keep it separate from Reddit OAuth. They are different trust boundaries.

Conceptually:

```text
MCP client
   |
   | MCP authentication
   v
reddit-mcp
   |
   | Reddit OAuth
   v
Reddit API
```

---

## 14. Observability

Use structured logs.

Recommended fields:

```text
timestamp
level
requestId
tool
durationMs
upstreamStatus
retryCount
rateLimitRemaining
errorCode
```

Do not include Reddit access tokens, secrets, or full sensitive request headers.

Provide enough information to diagnose:

- authentication failures
- Reddit API failures
- timeouts
- rate limiting
- malformed upstream data
- MCP validation errors

---

## 15. Testing

### Unit tests

Cover:

- input validation
- identifier normalization
- Reddit response mapping
- deleted/removed posts/comments
- pagination cursors
- bounded limits
- error mapping
- rate-limit handling
- retry rules

### Tool tests

Use a mocked `RedditClient`.

Verify each tool:

- accepts valid input
- rejects invalid input
- returns only normalized fields
- propagates normalized errors
- respects maximum limits

### Integration tests

Use captured/synthetic fixtures.

Do not require live Reddit credentials for the normal CI test suite.

Optional live integration tests may exist behind an explicit environment flag and must never run automatically in pull requests.

---

## 16. Development fixtures

Because Reddit API approval may not be immediately available, include realistic JSON fixtures for:

- search response
- post
- comments
- subreddit rules
- post requirements
- 401
- 403
- 404
- 429
- 5xx

Fixtures must contain no secrets and should avoid unnecessary real-user personal data.

This allows MCP tool development and testing before production API access is enabled.

---

## 17. Docker

Provide a production Dockerfile.

Requirements:

- multi-stage build
- install only production dependencies in final stage
- non-root runtime where practical
- expose configured port
- `NODE_ENV=production`
- health endpoint available to the orchestrator
- graceful shutdown on SIGTERM/SIGINT

Expected deployment target: a standalone container, e.g. Coolify, behind HTTPS.

Potential public endpoint:

```text
https://reddit-mcp.mirco.uk/mcp
```

Do not hardcode the domain into the application.

---

## 18. README

Document:

- project purpose
- architecture
- local development
- environment variables
- how Reddit OAuth is configured
- how to run tests
- how to run with mock fixtures
- Docker build/run
- MCP endpoint
- list of tools and examples
- production limitations
- explicit statement that v0.1 is read-only
- Reddit API approval prerequisite

Do not document secrets or real production credentials.

---

## 19. CI

Add a minimal GitHub Actions workflow for pull requests and pushes to `main`.

Required checks:

```text
install
typecheck
lint
test
build
```

The standard CI workflow must not require Reddit credentials.

---

## 20. Acceptance criteria

v0.1 is complete when all of the following are true:

- [ ] TypeScript project builds successfully.
- [ ] MCP server runs locally.
- [ ] Remote MCP transport is exposed through `/mcp`.
- [ ] `/health` returns healthy for a running process.
- [ ] `/ready` detects invalid required configuration.
- [ ] `search_reddit` is implemented.
- [ ] `get_post` is implemented.
- [ ] `get_comments` is implemented.
- [ ] `get_subreddit_rules` is implemented.
- [ ] `get_post_requirements` is implemented.
- [ ] All tool inputs are schema-validated.
- [ ] Tool outputs are normalized and bounded.
- [ ] Pagination is supported where appropriate.
- [ ] Reddit API errors are normalized.
- [ ] Rate-limit behavior is implemented.
- [ ] No write action is exposed.
- [ ] No credentials appear in logs or MCP responses.
- [ ] Unit/tool tests pass using mocks/fixtures.
- [ ] CI passes without Reddit credentials.
- [ ] Docker image builds and starts successfully.
- [ ] README documents setup and limitations.
- [ ] Production Reddit calls remain disabled until valid approved credentials are configured.

---

## 21. Future releases

### v0.2 — user OAuth / stronger identity model

Possible scope:

- user-specific Reddit OAuth where required
- secure encrypted token persistence
- multi-user isolation
- MCP server authentication/authorization

Only add persistent storage when this release requires it.

### v0.3 — guarded write actions

Potential tools:

- `create_post`
- `reply`
- `edit_post`
- `delete_post`

Requirements before implementation:

- Reddit permissions confirmed
- human approval before writes
- no bulk posting/replies
- idempotency protection
- audit log
- strict rate limiting
- subreddit rules/requirements validation before submission

Private messaging should remain excluded unless a concrete legitimate use case is approved.

### v0.4 — optional ChatGPT UI

Only if a UI materially improves the workflow.

The connector should remain fully useful as a normal MCP server without UI components.

---

## 22. Example target workflow

The finished read-only connector should support workflows such as:

```text
User:
"Find recent Reddit discussions about alternatives to AO3."

ChatGPT
   |
   +--> search_reddit(...)
   |
   +--> get_post(...)
   |
   +--> get_comments(...)
   |
   +--> get_subreddit_rules(...)
   |
   +--> get_post_requirements(...)
   |
   v
Research summary / proposed response

NO automatic posting in v0.1
```

The MCP server is responsible for reliable access and normalized Reddit data.

Higher-level interpretation, ranking and content drafting belong to the MCP client/agent, not to the connector itself.
