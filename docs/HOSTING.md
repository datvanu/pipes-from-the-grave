# Hosting the demo

This document only prepares a hosted demo. **Nothing here is deployed.** Do not create accounts, attach payment methods, or publish a site until Kilian approves a specific host and a public repo.

The jury needs a URL to a running app until the end of judging (29 January 2027). The API performs live HTTP fetches, so a static-only host cannot run the full demo unless fetches are replaced with canned data.

## What needs to run

| Part | Stack | Notes |
|---|---|---|
| Web editor | Vite → static `apps/web/dist` | React + React Flow. Talks to `/api/*`. |
| API | Fastify (`apps/server`) | `POST /api/pipes` (server-assigned UUID, no public list or delete), `POST /api/pipes/run`, `/api/ghost` (rule-based demo by default; optional visitor key unless `GHOST_MODE=demo`), public `/p/:id.json` and `/p/:id.rss` with rate limits. Listens on `PORT` (default 8787), host `0.0.0.0`. |
| Pipe engine | `@pipes/engine` (TypeScript) | Runs on the server. Browser fetches to third-party RSS/JSON feeds would fail CORS, so the engine should stay on the API. |
| MCP | stdio (`packages/mcp`) | For local Kiro/agents only. Not required on the public demo URL. |

The API can also serve the Vite build (and falls back to `index.html` for non-API routes). That is the cheapest way to ship one URL.

## Recommendation (no cost for a jury demo)

**One free Render web service** that builds the Vite app and starts the Fastify server with `./node_modules/.bin/tsx apps/server/src/index.ts` (`tsx` is a runtime dependency, so `npm ci --omit=dev` still starts). The same origin serves UI and API, so `VITE_API_BASE` can stay empty and production CORS stays same-origin unless `CORS_ORIGINS` is set. `render.yaml` sets `healthCheckPath: /api/health` and `TRUST_PROXY=1`. Security headers include a CSP fitted to the Vite app, `Referrer-Policy: no-referrer`, a restrictive Permissions-Policy, and HSTS on the hosted origin.

- **Cost:** $0 on Render’s Free compute plan (0.1 CPU, 512 MB RAM).
- **Account needed:** a Render account (new). GitHub org `datvanu` can be connected later so Render builds from the public repo — that still needs a separate approval to make the repo public and to connect the account.
- **Limits (as of November 2026, [Render Free docs](https://render.com/docs/free)):**
  - Spins down after 15 minutes idle; the next request takes about one minute to wake the service (Render shows a loading page). Fine for a jury link; mention the cold start in the Devpost test instructions.
  - 750 Free instance hours per workspace per calendar month (idle time does not count). One service that only runs while people visit it should stay inside this cap.
  - Ephemeral filesystem: saved pipes and `/p/:id.*` export links are lost on restart or spin-down. The UI warns about this. Browser drafts and Graveyard templates survive. Acceptable for a demo (in-memory / `apps/server/data` is not durable anyway).
  - Free web services and static sites count against the workspace’s included outbound bandwidth and build pipeline minutes. If those are exhausted and no payment method is on file, Render suspends free services or new builds rather than charging. Do not add a card unless Kilian approves possible overage billing.
  - Free Postgres is **not** needed and would expire after 30 days.

A committed `render.yaml` and `Dockerfile` describe this setup. Do not apply the blueprint or push a deploy without approval.

### Why not GitHub Pages plus a separate API?

[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) is free for a public repo (1 GB site, 100 GB/month soft bandwidth). The org `datvanu` can host a project site at `https://datvanu.github.io/pipes-from-the-grave/` once the repo is public. Pages is static only, so you would still need a second host for Fastify, plus `VITE_API_BASE`, `VITE_BASE=/pipes-from-the-grave/`, and `CORS_ORIGINS` set to the Pages origin.

That works, but it is two systems for the same demo. Prefer the single Render service unless Pages is needed for some other reason.

### Why not frontend-only?

The engine is TypeScript and could be bundled into the Vite app, and `jsonplaceholder` already allows browser CORS. Most RSS feeds do not. A Pages-only demo would have to use canned `itemsOverride` data, which is a weaker jury experience than live fetches. Not recommended as the primary hosted URL.

### Why not Fly.io as the free default?

[Fly.io no longer has a free tier](https://docs.fly.io/about/free-waiver) for new organizations (November 2026). New accounts get a short $1 trial; monthly bills under $5 may be waived, but that is not a guaranteed $0 plan and typically involves a payment method later. Skip it unless Kilian prefers Fly and accepts that risk.

## How to run the image locally (no registry push)

```bash
docker build -t pipes-from-the-grave .
docker run --rm -p 8787:8787 -e GHOST_MODE=demo -e TRUST_PROXY=1 pipes-from-the-grave
# open http://localhost:8787/
# The image runs as the non-root `node` user.
```

## Build the static UI (for a later Pages option)

```bash
# Same-origin / Render (default)
npm run build -w @pipes/web

# GitHub Pages project site, talking to a separate API
# VITE_BASE=/pipes-from-the-grave/ VITE_API_BASE=https://YOUR-API.onrender.com npm run build -w @pipes/web
./scripts/build-web.sh
```

## Environment

See `.env.example`. For a single-service deploy the important values are:

| Variable | Demo value |
|---|---|
| `PORT` | Injected by the host, or `8787` |
| `GHOST_MODE` | `byok` (demo by default, optional visitor key; `demo` disables forwarding) |
| `TRUST_PROXY` | `1` (so rate limits key off the client, not the Render proxy) |
| _(no LLM API key)_ | never set on the host; visitor keys stay in the browser and are forwarded per request only to the allowlisted provider |
| `CORS_ORIGINS` | not required when the UI is served from the same origin; set it if the UI is on Pages |
| `WEB_DIST_DIR` | unset (defaults to `apps/web/dist`) |
| `VITE_API_BASE` | empty for same-origin |
| `PUBLIC_BASE_URL` | required for absolute export links in production; leave unset until the public HTTPS origin is known. Host and Forwarded headers are not trusted when hosted. |

## Accounts and approvals still required

| Action | Account | Cost | Status |
|---|---|---|---|
| Public GitHub repo under `datvanu` | existing GitHub org | $0 (public) | needs Kilian’s approval; not done |
| Render Free web service | **new Render account** | $0 if you stay inside free limits and add no payment method | needs Kilian’s approval; not created, not deployed |
| GitHub Pages (optional) | same GitHub org | $0 | only if the split option is chosen later |
| Custom domain | optional | possibly DNS / registrar cost | not needed for the jury URL |

No hosting account was created as part of this preparation.
