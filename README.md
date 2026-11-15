# Pipes from the Grave

**Kiroween 2026 — Resurrection**

A spooky visual feed and data pipe editor. Drag nodes, connect ectoplasm edges, summon a Ghost to build a pipe from one sentence, and export JSON/RSS.

> Inspired by classic visual feed pipes (discontinued 2015). This project is an independent recreation and does not use third-party brand names or logos.

## Features (MVP)

- Browser editor (React + React Flow) with tombstone nodes and glowing edges
- Live fetches with SSRF protection, 15s timeouts, rate-limit headers, and UI error banners
- Séance debug: souls (items) per node after a run; Ghost séance with clearer explanations
- Graveyard template gallery (frontpage digest, keyword watch, regex cleanup, …)
- Pipe engine with Fetch RSS/JSON, Filter, Sort, Merge, Truncate, Regex, Rename, Output RSS/JSON
- Property-based / unit tests for core transforms (engine + rate-limit + MCP)
- Ghost builder: natural language → pipe (rule-based **demo mode** by default; optional browser-pasted key for an allowlisted provider)
- Fastify API with `/api/*` and public `/p/:id.json|.rss`
- MCP stdio server with a proper `tools/list` / `tools/call` interface (prefers the running HTTP API)
- `/.kiro` steering, specs, hooks notes, custom agent, and MCP settings

## Requirements

- Node.js 20+
- npm 10+

## Quick start

```bash
npm install
npm run dev
```

(`npm run dev:all` is the same command.)

- Web UI: http://127.0.0.1:5173
- API health: http://127.0.0.1:8787/api/health

No API keys are required. The Ghost builder runs in rule-based demo mode by default.

Or start the sides separately:

```bash
npm run dev:server
npm run dev:web
```

Copy `.env.example` if you want to override ports or CORS. See [docs/HOSTING.md](docs/HOSTING.md) for a hosted demo (not deployed from this repo).

## Scripts

| Script | Description |
|---|---|
| `npm test` | Run workspace tests (engine, server, MCP) |
| `npm run build` | Build workspaces |
| `npm run dev` / `npm run dev:all` | API (8787) and web UI (5173) together |
| `npm start` | Production-style API start (`tsx`, a runtime dependency) |
| `npm run dev:mcp` | Start the MCP stdio server |

## Demo mode and optional BYOK (Ghost)

`POST /api/ghost` with `{ "prompt": "fetch rss about rust, sort, top 5" }`.

The default is **demo mode**: a rule-based builder that maps keywords in the prompt to nodes. It needs no LLM and no secrets. The JSON response includes `"mode": "demo"`.

Optionally, a visitor may bring their own key for an allowlisted model provider. The key stays in the browser (session storage, or local storage only if they opt in) and is sent only as the `X-Ghost-LLM-Key` request header. The server forwards that header once to the hardcoded provider URL, then forgets it — except when `GHOST_MODE=demo`, which is the hosted-demo setting and disables forwarding entirely. Keys are never stored, logged, or returned. If the provider call fails, the Ghost falls back to demo mode and sets `fallbackReason`. There is no project- or host-owned API key.

The MCP `ghost_build` tool does not accept a key and always uses demo mode, so a key cannot leak through an agent session.

See `.env.example` and the Ghost Séance panel in the editor.

## MCP

```bash
# Terminal 1: API
npm run dev:server

# Terminal 2: stdio MCP server
npm run dev:mcp
```

The server speaks MCP JSON-RPC over stdio (`initialize`, `tools/list`, `tools/call`), **newline-delimited** (one JSON message per line, not Content-Length framing). It prefers the running HTTP API at `PIPES_API_BASE` (default `http://127.0.0.1:8787`) and falls back to an in-process store for most tools if the API is down (`ghost_build` needs the API).

The public API does not list or delete pipes. `create_pipe` returns a server-assigned unguessable id; `run_pipe` can send a pipe body or that id. There are no `list_pipes` or `delete_pipe` tools, so `tools/list` matches what the server can actually do.

Tools:

| Tool | Purpose |
|---|---|
| `list_nodes` | List engine node types |
| `get_pipe` | Fetch a pipe definition by its unguessable id |
| `create_pipe` | Create a pipe (server assigns the id; updates only an existing id) |
| `add_node` | Add a node to a pipe you already created |
| `add_connection` | Add an edge between nodes |
| `run_pipe` | Run a pipe by id, or by sending the pipe in the tool arguments |
| `ghost_build` | Build a pipe from a sentence (demo mode by default) |

Configured for Kiro in `.kiro/settings/mcp.json`.

## How Kiro was used

This project was designed and built with Kiro CLI. The session log is in [docs/KIRO-USAGE.md](docs/KIRO-USAGE.md). This section only restates what that log and the committed `/.kiro` artifacts show.

- **Steering** (`.kiro/steering/`): product, tech, structure, and spooky-voice notes constrained later sessions (voice, stack, and layout).
- **Specs** (`.kiro/specs/`): requirements, design, and tasks for the pipe engine, node library, Ghost builder, editor UI, and MCP server. These drove engine work and the MCP tool list.
- **Hooks** (`.kiro/hooks/README.md`): documents intended automation (new node file → test stub; engine save → tests; server save → typecheck). The recipes live in that README; hook JSON files are not checked in.
- **MCP** (`.kiro/settings/mcp.json`): points Kiro at the `packages/mcp` stdio server, which prefers the running HTTP API via `PIPES_API_BASE`.
- **Custom agent** (`.kiro/agents/crypt-keeper.md`): a review agent for SSRF safety, valid graphs, spooky voice, and no third-party brand names. It is present in the repo; the usage log does not record a separate review session with it.

Kiro generated the steering and specs, the engine, server/Ghost/MCP scaffolding, the first web draft, and later rate-limit and Ghost server pieces. Human/agent follow-up fixed tests, SSRF validation order, web template issues, tsconfig emit cleanup, séance/rate-limit UI, the template gallery, the MCP HTTP bridge, RSS CDATA parsing so live fetches show titles, the optional browser key path for the Ghost, and later UX fixes for the demo prompt and first visit.

## Kiro usage log

See [docs/KIRO-USAGE.md](docs/KIRO-USAGE.md) for CLI version, session times, and reproduce steps.

## License

MIT — see [LICENSE](LICENSE).

## Third-party libraries

Vite, React, `@xyflow/react`, Fastify, Vitest, fast-check, fast-xml-parser, and others listed in workspace `package.json` files.
