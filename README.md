# reddit-mcp

Remote, read-only MCP connector for Reddit research.

`reddit-mcp` exposes a deliberately small set of structured Reddit tools to ChatGPT and other MCP clients while keeping Reddit OAuth, rate limits, normalization, and policy boundaries inside a standalone service.

## v0.1 scope

The first release exposes exactly five read-only tools:

- `search_reddit`
- `get_post`
- `get_comments`
- `get_subreddit_rules`
- `get_post_requirements`

There are no posting, reply, edit, delete, vote, moderation, private-message, or bulk-outreach tools in v0.1.

`search_reddit` currently searches Reddit **posts**. Reddit's standard `/search` listing does not provide a symmetric comment-search surface, so the connector does not pretend to return comment search results.

## Architecture

```text
MCP client / ChatGPT
        |
        | Streamable HTTP
        v
reddit-mcp
        |
        | Reddit OAuth
        v
Reddit API
```

The MCP layer and Reddit OAuth layer are separate trust boundaries.

## Runtime

- Node.js 20+
- TypeScript
- MCP TypeScript SDK v2 (`@modelcontextprotocol/server`)
- Zod v4
- Vitest

The server uses the MCP 2026-07-28-compatible `createMcpHandler` HTTP entry and the Node adapter.

## Endpoints

```text
POST/GET /mcp
GET      /health
GET      /ready
```

`/health` only confirms that the process is alive.

`/ready` returns `503` until the required Reddit API configuration is present.

## Reddit API approval

Production Reddit calls must only be enabled with Reddit API access approved for the intended use case. This project does not scrape Reddit HTML or bypass API restrictions.

### OAuth modes

Two token modes are supported:

1. `client_credentials` — used when `REDDIT_REFRESH_TOKEN` is absent.
2. `refresh_token` — used when `REDDIT_REFRESH_TOKEN` is configured.

Most read operations use normal Reddit read access. Reddit documents `GET /api/v1/{subreddit}/post_requirements` under the `submit` OAuth scope even though the endpoint itself is read-only. If the app-only token cannot access it, configure a user-granted refresh token containing the required approved scope. The MCP surface still contains no write action.

## Configuration

Copy `.env.example` and set at least:

```text
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
REDDIT_USER_AGENT=web:reddit-mcp:v0.1.0 (by /u/your_reddit_username)
```

Optional:

```text
REDDIT_REFRESH_TOKEN=
MCP_BEARER_TOKEN=
MCP_ALLOWED_HOSTS=
MCP_ALLOWED_ORIGINS=
```

`MCP_BEARER_TOKEN` is a lightweight deployment guard for `/mcp`. It is not Reddit OAuth and is not a replacement for a full MCP OAuth/resource-server integration if the connector is later exposed to multiple users.

## Local development

```bash
npm install
npm run dev
```

Then check:

```bash
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/ready
```

Run verification:

```bash
npm run typecheck
npm run test
npm run build
```

## Tool behavior

### `search_reddit`

Inputs:

```ts
{
  query: string;
  subreddit?: string;
  sort?: "relevance" | "hot" | "top" | "new" | "comments";
  timeRange?: "hour" | "day" | "week" | "month" | "year" | "all";
  limit?: number; // max 50
  cursor?: string;
}
```

Returns normalized posts and an opaque pagination cursor when Reddit supplies another listing page.

### `get_post`

Accepts a short Reddit base36 post ID or `t3_` fullname and returns a normalized post.

### `get_comments`

Returns a bounded flattened comment tree with `parentId` and `depth`. `truncated: true` means the returned view does not represent the entire Reddit comment tree. The connector intentionally avoids unbounded recursive fetches.

### `get_subreddit_rules`

Returns moderator-defined subreddit rules plus site rules included by Reddit's API.

### `get_post_requirements`

Normalizes known Reddit post-requirement fields and preserves unknown future fields in `extra` so Reddit can extend the response without breaking the connector.

## Security

- Tool inputs are validated with Zod.
- All tool annotations declare `readOnlyHint: true`.
- Results are bounded.
- Reddit OAuth tokens and client secrets are never returned from MCP tools.
- Upstream requests have timeouts and bounded retries.
- 401, 403, 404, 429, timeout, and generic upstream failures are normalized.
- Reddit content is not persisted by default.
- No HTML scraping fallback exists.
- `/mcp` can be protected with a bearer token and host/origin allowlists.
- The Docker runtime uses a non-root user.

## Docker

```bash
docker build -t reddit-mcp .
docker run --rm -p 3000:3000 --env-file .env reddit-mcp
```

The application does not hardcode a public hostname and can sit behind Coolify/Traefik/Caddy or another HTTPS reverse proxy.

A possible production URL is:

```text
https://reddit-mcp.mirco.uk/mcp
```

## UI

v0.1 has no UI. If a ChatGPT-facing UI becomes justified later, it should be developed in Storybook and reuse the Ficora product/design system (`product_design.md` and the existing design patterns) rather than introducing a separate visual language.

## CI

GitHub Actions runs:

```text
install
typecheck
lint
test
build
```

The normal CI suite does not require Reddit credentials.

## Roadmap

- v0.1 — read-only Reddit research tools
- v0.2 — stronger MCP identity/auth and optional user-specific Reddit OAuth
- v0.3 — guarded write tools only if approved and needed, with explicit human confirmation and no bulk actions
- v0.4 — optional UI, Storybook-first and aligned with Ficora product design

See `technical-task-v0.1-read-only.md` for the full technical task.
