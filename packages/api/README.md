# @pdc/api

A tiny Cloudflare Worker (free tier, one KV namespace, no accounts, no auth) that backs the static PokeDraftChamps site with:

- a **daily-league leaderboard** (one board per `YYYY-MM-DD`), and
- **anonymous, opt-in run summaries** with aggregate counters.

The router is the pure function `handle(request, env)` in `src/handle.ts`; the tests drive it with a fake in-memory KV. All tunable numbers live in `src/limits.ts`.

## Endpoints

All responses are JSON and carry CORS headers. `OPTIONS` preflight returns 204. Errors are `{ "error": "..." }` (400 validation, 404 unknown route, 413 body too large).

| Method and path | Purpose |
| --- | --- |
| `GET /health` | `{ ok: true, version }` |
| `GET /daily/:date` | `{ date, entries }`: top 100, score descending then earliest submission first |
| `POST /daily/:date` | Submit a score. Body: `{ nickname, score, seed, runId, abbrev?, result?, version? }`. Returns `{ ok, rank, entries }` (plus `replaced`) |
| `POST /runs` | Opt-in run summary (JSON object up to 16 KB with `runId`, `phase`, `config.teams`, ...). Returns `{ ok: true }`, or `{ ok: true, duplicate: true }` for a repeat `runId` the same day |
| `GET /runs/stats` | Aggregate counters (zeros when empty) |

Limits (nickname 1-20 chars, score 0..1,000,000, 500 stored entries per day, 100 per page, 90-day run retention) are in `LIMITS`. One entry is kept per `runId`; a resubmission replaces it only with a strictly higher score.

CORS: `ALLOWED_ORIGINS` (a `wrangler.toml` var) is `*` by default; set it to a comma-separated origin list (e.g. `https://zanderjensen7.github.io`) to restrict browsers to your site.

## Setup

```sh
npm install
npx wrangler login
npx wrangler kv namespace create PDC_KV      # prints an id; paste it into wrangler.toml (id, and preview_id if you use `wrangler dev`)
npm run deploy -w @pdc/api
```

Local dev: `npm run dev -w @pdc/api`. Tests: `npm run test -w @pdc/api`.

### GitHub Actions

`.github/workflows/deploy-api.yml` tests and deploys on pushes to `main` that touch `packages/api/**`. Add these repository secrets; without `CLOUDFLARE_API_TOKEN` the workflow still passes but skips the deploy:

- `CLOUDFLARE_API_TOKEN`: an API token with the "Edit Cloudflare Workers" template
- `CLOUDFLARE_ACCOUNT_ID`: your Cloudflare account id

The game reads the deployed URL from `VITE_PDC_API_URL`.

## Honesty note

Scores are reported by the browser, so **they can be faked**: anyone can POST any score. v1 accepts that. The leaderboard is for fun, not competition integrity. Validation only keeps the data well-formed and bounded.

## Known v1 limitations

- KV writes are read-modify-write with no locking, so concurrent submissions can race and one may be lost. KV is also eventually consistent across regions (reads can lag a write by up to about a minute).
- No rate limiting beyond Cloudflare's own.
