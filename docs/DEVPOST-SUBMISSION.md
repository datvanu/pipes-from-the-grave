# Devpost submission draft — Pipes from the Grave

English draft for the Kiroween 2026 Devpost form. **Do not submit this form or publish the YouTube video from this file.** Kilian submits on his Devpost account once the demo URL and video URL are filled in.

Grounded in the current tree (README, `/.kiro`, `docs/KIRO-USAGE.md`, and the running demo-mode app). No extra features or metrics.

## Placeholders

| Field | Value |
|---|---|
| Repo URL | https://github.com/datvanu/pipes-from-the-grave — public GitHub repo under `datvanu`, with `/.kiro` at the root and the MIT license visible in the About section. |
| Demo URL | https://pipes-from-the-grave.onrender.com — running on a Render Free web service in Frankfurt (see [HOSTING.md](HOSTING.md)). No login; leave the private credentials field empty. The Free plan spins down after about 15 minutes idle; the next request takes about one minute to wake (Render shows a loading page). Say so in “How to test.” |
| Video URL | `{{VIDEO_URL}}` — public YouTube video, under 3 minutes. See [VIDEO-SCRIPT.md](VIDEO-SCRIPT.md). Not recorded yet. |

The Fastify process serves both the editor and `/api/*` on the same origin.

## Required items (from the official rules, as recorded in the 30 October 2026 plan)

Confirm each box before Kilian submits on Devpost (deadline **4 December 2026, 23:00 Europe/Berlin**; no extensions).

- [ ] Project was started after 30 October 2026, 17:00 Europe/Berlin (this repo’s Kiro sessions begin 5 November 2026). No prior product code was copied in; third-party libraries are listed below and in the README.
- [ ] **Category: Resurrection** (the other official choices are Frankenstein, Skeleton Crew, and Costume Contest; this project is entered in Resurrection).
- [x] Public **GitHub** repository (not GitLab or Bitbucket) at https://github.com/datvanu/pipes-from-the-grave, with `/.kiro` at the repo root and **not** gitignored (only local overrides `.kiro/permissions.yaml` and `.kiro/settings/mcp.local.json` are ignored). MIT license is visible in GitHub About.
- [ ] Open-source **license file** in the repo (MIT, `LICENSE`) and shown in GitHub About.
- [ ] Sources plus a README quick start so a judge can run or use the project.
- [ ] **Video** under 3 minutes, public on **YouTube**, showing the project on the target device, with **no third-party brands** and **no copyrighted music** without permission.
- [x] **URL of a running app** (https://pipes-from-the-grave.onrender.com) that judges can try at no cost through the end of judging (29 January 2027). Login credentials, if any, go in Devpost’s non-public field — this app has no login.
- [ ] Submission text in **English**.
- [ ] Built with Kiro, plus the required **write-up of Kiro use** (see “How Kiro was used” below: CLI, custom agent file, hooks, specs, steering, MCP, property-based tests; no Powers).
- [ ] Team size ≤ 3. Single-person / organization entry is allowed; Germany is not a restricted country.

Judging criteria (20 % each, for context, not a form field): Potential Impact, Technological Implementation (Kiro), Design, Innovation/Idea, Presentation (video).

Optional bonuses (not part of this draft to submit unless Kilian decides later): Bonus Blog (public post with the phrase “written as part of the Kiroween 2026 hackathon”); Social Blitz (Kilian must write the post himself; it must start with `#KiroweenHackathon26`).

---

## Project name

Pipes from the Grave

## Tagline

Resurrect visual feed pipes in the browser. Summon a Ghost from one sentence, then export JSON or RSS.

## Category

Resurrection

## Inspiration

Visual feed pipes were a simple idea: fetch a feed, filter and sort it, and publish the result again. The classic tools went away. We wanted that canvas back — tombstone nodes, glowing edges, and a Ghost you can summon with a sentence — as a practical editor, not a museum piece. Kiroween’s Resurrection category was the right moment to build it in the open, with specs, steering, and an MCP server so agents can build pipes too.

## What it does

Pipes from the Grave is a browser editor for feed and data pipes.

- Drag nodes from a palette (Fetch RSS, Fetch JSON, Filter, Sort, Merge, Truncate, Regex, Rename, Output RSS, Output JSON) and connect them on a canvas.
- A first visit already shows the **Frontpage Digest** starter pipe. Open the **Graveyard** for more templates (for example Frontpage Digest, keyword watch, regex cleanup), or start from an empty canvas.
- Open **Ghost Séance**, type a sentence, and **Summon** a pipe. The default is a **free, rule-based demo** that maps keywords in the prompt to nodes. No API key is required. Optionally, a visitor may paste **their own** key for an allowlisted model provider. That key stays in the browser (session storage, or local storage only if they opt in), is sent to that provider only as a request header when they click Summon, and is not stored on the server. If the provider call fails, the Ghost falls back to the demo.
- **Run** executes the pipe on the server (SSRF-safe fetches, timeouts, rate limits). **Séance Debug** shows how many “souls” (items) passed each node. The output list is also shown in the editor.
- Saved pipes are exported, without a login, at `/p/:id.json` and `/p/:id.rss`.
- An MCP stdio server exposes tools (`list_nodes`, `get_pipe`, `create_pipe`, `add_node`, `add_connection`, `run_pipe`, `ghost_build`) so Kiro or another agent can build and run pipes against the same API. There is no public list or delete of server pipes; create returns an unguessable id.

## How we built it

A TypeScript npm-workspace monorepo:

- `@pipes/engine` — pipe runner, node library, SSRF checks, RSS/JSON serialization, Vitest plus fast-check property tests.
- `@pipes/server` — Fastify API (`POST /api/pipes` and `POST /api/pipes/run`, `/api/ghost`, ephemeral public `/p/:id.json|.rss`), rate limits, optional static hosting of the Vite build.
- `@pipes/web` — Vite, React, and React Flow editor (graveyard, ghost séance, inspector, séance debug).
- `@pipes/mcp` — newline-delimited JSON-RPC MCP server (`tools/list`, `tools/call`) that prefers the live HTTP API.

Local quick start is `npm install` and `npm run dev` (or `npm run dev:all`; UI on port 5173, API on 8787). The jury demo is a single Render Free web service in Frankfurt: https://pipes-from-the-grave.onrender.com (see [HOSTING.md](HOSTING.md)). The same origin serves the editor and `/api/*`.

## How Kiro was used

This is the required Kiro write-up. It only restates [docs/KIRO-USAGE.md](KIRO-USAGE.md) and the committed `/.kiro` artifacts.

- **Surface:** Kiro **CLI** (`kiro-cli` 3.1.0), non-interactive, on the build machine. The log does not record Kiro IDE, Kiro Web, or Crew sessions, and we do not claim them.
- **Steering:** `.kiro/steering/` (product, tech, structure, spooky-voice) constrained later sessions for voice, stack, and layout.
- **Specs:** `.kiro/specs/` for the pipe engine, node library, Ghost builder, editor UI, and MCP server (requirements, design, and tasks). These drove engine work and the MCP tool list.
- **Hooks:** `.kiro/hooks/README.md` documents intended automation (new node file → test stub; engine save → tests; server save → typecheck). The recipes are in that README; hook JSON files are not checked in.
- **MCP:** `.kiro/settings/mcp.json` points Kiro at `packages/mcp`. The server speaks `tools/list` and `tools/call` and prefers the running API via `PIPES_API_BASE`.
- **Custom agent:** `.kiro/agents/crypt-keeper.md` is a review agent for SSRF safety, valid graphs, spooky voice, and no third-party brand names. It is in the repo; the usage log does not record a separate review session with it.
- **Property-based tests:** Kiro’s engine session added a Vitest suite with fast-check on core transforms (for example filter is a subset, sort is stable, truncate/unique behaviour, broken feeds do not crash the parser).
- **Powers:** not present in `/.kiro` and not described in the usage log. We did not use them.

Kiro generated the steering and specs, the engine, server/Ghost/MCP scaffolding, the first web draft, and later rate-limit and Ghost server pieces. Human/agent follow-up fixed tests, SSRF validation order, web template issues, accidental TypeScript emit, séance and rate-limit UI, the template gallery, the MCP HTTP bridge and `tools/list` interface, RSS CDATA parsing so live fetches show titles, hosting preparation, and the optional browser-key Ghost path.

## Challenges we ran into

- Teaching the MCP server to speak a clean `tools/list` / `tools/call` interface with valid JSON Schemas, instead of ad-hoc method names, and proving it over stdio against a live API.
- Keeping live fetches useful and safe: SSRF blocking, timeouts, and RSS titles hidden in CDATA.
- Cleaning accidental TypeScript emit out of the engine package so `npm run build` stayed trustworthy.
- Deciding how the Ghost should work for judges: a real model needs a key, but this project must not ship or host anyone’s key. The answer we shipped is demo-by-default plus an optional key the visitor pastes in the browser.

## Accomplishments that we're proud of

- A complete editor loop the jury can try: template or Ghost, run, inspect souls, export JSON and RSS, with no account and no key.
- An MCP tool surface that matches the API, with tests for the tool list and a live `tools/call`.
- Steering, specs, hook notes, and a custom agent committed under `/.kiro` at the repo root, plus an honest usage log of what Kiro did and what people fixed afterwards.
- Property-based and unit tests around the engine, rate limits, Ghost prompts, and MCP (87 tests in the current workspace run).

## What we learned

Specs and steering paid off when several sessions had to stay on the same voice and node set. Hook recipes are useful even before hook JSON is installed, because they make the intended loop explicit. And for anything that talks to a model, “the default must work with zero secrets” is a product constraint, not an afterthought — a visitor-supplied key has to be allowlisted and redacted, or it is safer not to offer it.

## What's next for Pipes from the Grave

The jury demo is live on Render Free. Record and upload the official video from the script (a draft MP4 is ready locally; the YouTube URL is still a placeholder). After that, a security review of the public API and the visitor-key header path, and only then any extra allowlisted providers. A hosted LLM key of our own is not planned.

## How to test (for judges)

1. Open https://pipes-from-the-grave.onrender.com. This is a Render Free web service. If nobody has used the demo for about 15 minutes, the host may take about one minute to wake. You should see Render’s loading page — please wait instead of refreshing right away.
2. Click **Graveyard**, pick **Frontpage Digest**, click **Run**, and wait for Séance Output. This is the first proven path.
3. Click **Ghost Séance**. Leave the key field empty. Use a prompt that the demo rules can parse, for example: “Fetch RSS from https://www.rfc-editor.org/rfcrss.xml then sort and keep the top 5”. Click Summon, check that the Fetch URL in the inspector has no trailing comma, then click Run. Optionally open `/p/<id>.json` or `.rss` from the footer. Those export links, and any server-saved pipe, last only until the free host sleeps; your browser draft and the Graveyard templates remain. Use **Download JSON** if you want a copy you can **Load JSON** later.
The default Ghost is rule-based: it looks for simple keywords. You do not need a key.
4. No sign-in is required. A personal key is optional: if you paste one, it stays in your browser and is sent only to the provider you pick when you Summon. It is never stored on the server and is never required to try the editor. There is no project-owned API key.

To run from source: Node 20+, `npm install`, `npm run dev` (or `npm run dev:all`). See the README.

## Built with

TypeScript, Node.js, React, Vite, React Flow (`@xyflow/react`), Fastify, Vitest, fast-check, fast-xml-parser, Model Context Protocol (stdio JSON-RPC), Kiro CLI.

(Workspace `package.json` files list the exact dependencies.)

## Image / gallery notes (not attached here)

When submitting, add screenshots of: the canvas with a Frontpage Digest pipe; Ghost Séance in demo mode (no key visible); Séance Debug with soul counts; a `/p/:id.rss` tab; the `/.kiro` tree or MCP `tools/list`. No brand marks, no keys.
