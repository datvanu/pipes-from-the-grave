# Kiro Usage Log — Pipes from the Grave

Written as part of the Kiroween 2026 hackathon. This log records how **Kiro CLI**
(`kiro-cli`) on the build box was used to design and implement the project.

## Account / environment

- CLI: `kiro-cli` 3.1.0 (KAS), path `~/.local/bin/kiro-cli`
- Auth: AWS Builder ID (`webmaster@datvanu.de`) via device flow
- Mode: `kiro-cli chat --no-interactive --trust-all-tools --trust-workspace`
- Preferred model for bulk generation: `qwen3-coder-next` (low credit multiplier)
- Working directory: project root `pipes-from-the-grave/`
- Session logs: `logs/kiro-session-*.log` (gitignored; not committed)

## Session log (Europe/Berlin)

| When | Model | Purpose | Outcome |
|---|---|---|---|
| 2026-11-05 ~08:32 | qwen3-coder-next | Steering + specs under `/.kiro` + root package.json | Created product/tech/structure/spooky-voice steering; specs for pipe-engine, node-library, ghost-builder, editor-ui, mcp-server; `mcp.json` |
| 2026-11-05 ~08:35 | qwen3-coder-next | Implement `@pipes/engine` + PBT tests | Packages, nodes, runner, SSRF, serialize, vitest suite |
| 2026-11-05 ~08:45 | qwen3-coder-next | Server, Ghost builder, MCP skeleton, hooks README | `apps/server`, `packages/mcp`, `.env.example`, `.kiro/hooks/README.md` |
| 2026-11-05 ~08:53 | qwen3-coder-next | Web editor (Vite/React/React Flow) | Scaffold + templates + initial App (syntax cleanup finished manually) |
| 2026-11-05 ~08:31 | qwen3-coder-next | Smoke login/chat | Confirmed non-interactive chat works |
| 2026-11-06 ~17:25 | qwen3-coder-next | MVP: rate-limit, run response, ghost improvements | Created `rate-limit.ts`, enhanced `/run`, ghost URL/regex/rename/positions; struggled with `fs_write`/tsconfig emit into `src/` (cleaned up manually); server rate-limit tests added |
| 2026-11-06 ~17:38 | qwen3-coder-next | Credit/smoke ping | Answered `PONG` — CLI still healthy on Builder ID |

## How Kiro artifacts map to the product

- **Steering** (`.kiro/steering/*.md`) constrained voice, stack, and structure for later sessions.
- **Specs** (`.kiro/specs/*/requirements|design|tasks.md`) drove engine tasks and MCP tool list.
- **Hooks** documented intended automation (new node → test stub; engine save → tests).
- **MCP settings** point Kiro at `packages/mcp` (HTTP bridge to the running API via `PIPES_API_BASE`).

## Follow-up by human/agent (still under Kiroween build on this box)

After the 2026-11-06 Kiro session: cleaned accidental `tsc` emit into `packages/engine/src`; fixed Ghost rename `mapping`; expanded Graveyard templates; upgraded web UI (rate-limit banner, séance debug / souls-per-node, template gallery); hardened MCP to prefer the live HTTP API; fixed RSS CDATA title parsing; added fetch timeouts; kept SSRF.

## Reproduce a headless Kiro task

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /path/to/pipes-from-the-grave
kiro-cli chat --no-interactive --trust-all-tools --trust-workspace \
  --model qwen3-coder-next \
  "Implement the next unchecked task in .kiro/specs/pipe-engine/tasks.md"
```

## Credits / limits notes

- Logged in as Builder ID `webmaster@datvanu.de` (Kilian asked to keep this account).
- Exact remaining credit balance is **not** exposed by `kiro-cli whoami` / chat help in 3.1.0; free-tier + hackathon credits apply to this session.
- Prefer low-multiplier models (`qwen3-coder-next`, `minimax-m2.1`) for scaffolding.
- Headless docs mention `KIRO_API_KEY` for some paid flows; device-login + `--no-interactive` worked here without a separate API key file.
- Observed CLI limits this turn: ~8 minute wall timeout for long tasks; intermittent `fs_write` failures (`text: expected string, received undefined`) causing Kiro to thrash on tsconfig.
- Apply for the 4,000 Kiroween credits by **2026-12-01 21:00 Europe/Berlin** using the Kiro / AWS account id.

## Honest attribution

Kiro generated steering, specs, engine, server/ghost/MCP scaffolding, the first web draft, and the 2026-11-06 rate-limit/ghost server pieces.
Human/agent follow-up fixed async test assertions, SSRF override validation order, web template-literal corruption, tsconfig emit cleanup, UI séance/rate-limit UX, template gallery, MCP HTTP bridge, and RSS CDATA parsing so live fetches show titles.
