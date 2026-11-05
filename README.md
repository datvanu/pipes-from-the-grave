# Pipes from the Grave

**Kiroween 2026 — Resurrection**

A spooky visual feed and data pipe editor. Drag nodes, connect ectoplasm edges, summon a Ghost to build a pipe from one sentence, and export JSON/RSS.

> Inspired by classic visual feed pipes (discontinued 2015). This project is an independent recreation and does not use third-party brand names or logos.

## Features (MVP)

- Browser editor (React + React Flow) with tombstone nodes and glowing edges
- Pipe engine with Fetch RSS/JSON, Filter, Sort, Merge, Truncate, Regex, Rename, Output RSS/JSON
- Property-based tests (fast-check) for core transforms
- Ghost builder: natural language → pipe (rule-based demo; optional LLM hook)
- Fastify API with `/api/*` and public `/p/:id.json|.rss`
- MCP stdio skeleton so agents can list/create/run pipes
- `/.kiro` steering, specs, hooks notes, and MCP settings

## Requirements

- Node.js 20+
- npm 10+

## Quick start

```bash
npm install
npm run dev:all
```

- Web UI: http://localhost:5173
- API health: http://localhost:8787/api/health

Or separately:

```bash
npm run dev:server
npm run dev:web
```

## Scripts

| Script | Description |
|---|---|
| `npm test` | Run workspace tests (engine) |
| `npm run build` | Build workspaces |
| `npm run dev:all` | API + web together |
| `npm run dev:mcp` | Start MCP stdio server |

## Ghost builder

`POST /api/ghost` with `{ "prompt": "fetch rss about rust, sort, top 5" }`.

Without an LLM key the server uses a rule-based demo. Set `GHOST_LLM_URL` later to plug in an external model (no secrets in the repo). See `.env.example`.

## MCP

```bash
npm run dev:mcp
```

Configured for Kiro in `.kiro/settings/mcp.json`.

## Kiro usage

See [docs/KIRO-USAGE.md](docs/KIRO-USAGE.md) for how this project was designed and built with Kiro CLI.

## License

MIT — see [LICENSE](LICENSE).

## Third-party libraries

Vite, React, `@xyflow/react`, Fastify, Vitest, fast-check, fast-xml-parser, and others listed in workspace `package.json` files.
