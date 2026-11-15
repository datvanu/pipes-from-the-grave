# Video script — Pipes from the Grave

Draft shooting script for the Kiroween 2026 Devpost video. **Target length: about 2:30, never over 2:45** (rule: under 3:00). English voice-over. Film the running app on the target device (the browser editor, plus a brief cut to Kiro CLI and the `/.kiro` tree).

This is a draft only. Kilian records and uploads the YouTube video himself. Do not publish from this repo.

## Constraints (read before filming)

- Show the **rule-based demo Ghost** as the default the jury will get. BYOK (a viewer’s own key) may be mentioned in one sentence; do not paste or display any API key, and do not film the Optional BYOK fields filled in.
- No third-party brand names or logos on screen or in the voice-over. For the gallery, pick **Frontpage Digest** (public RFC Editor feed). For the Ghost prompt, keep the default sentence that already includes `https://www.rfc-editor.org/rfcrss.xml`, or type that URL yourself. Do not open templates whose inspector would show other hostnames if you can avoid it.
- No purchased or copyrighted music. Silence, room tone, or a short original / CC0 bed only — this script assumes **voice-over and UI sounds only, no music**.
- Start the app locally (`npm run dev:all`) or on the approved demo URL once it exists. Also start `npm run dev:mcp` before the Kiro scene. If the hosted demo is on a Free tier, wait for it to wake so the first shot is not a spinner.
- On-screen text is already in English.

Approximate spoken length is noted after each voice-over. Leave a beat for clicks and for a live run (feeds can take a few seconds).

---

## 0:00–0:12 — Hook

**On screen:** Browser full screen. Title bar of **Pipes from the Grave**: tombstone node palette on the left, empty-or-quiet canvas, footer “The graveyard is quiet.”

**Voice-over:** “Classic visual feed pipes disappeared years ago. This is Pipes from the Grave — a browser editor that lets you fetch, filter, and export feeds again, with a Ghost that builds a pipe from one sentence.”

(~12s)

---

## 0:12–0:32 — Graveyard templates

**Action:** Click **Graveyard**. The **Graveyard Templates** dialog opens. Pause on the list (Frontpage Digest, Keyword Watch, Regex Title Cleanup, and the others). Click **Frontpage Digest**. The dialog closes; the canvas shows Fetch RSS → Sort → Truncate → Output RSS, with glowing edges.

**Voice-over:** “The Graveyard holds ready-made pipes. I pick Frontpage Digest — fetch a public feed, sort it, keep the top fifteen, and output RSS.”

(~10s talk + time to click)

---

## 0:32–0:58 — Ghost Séance (demo mode)

**Action:** Click **Ghost Séance**. The dialog appears, including the line that demo rules are free and no key is required. Leave Optional BYOK empty. The prompt should read: “Fetch RSS from https://www.rfc-editor.org/rfcrss.xml, sort, top 5”. Click **Summon**. When the status says the Ghost built a pipe in **demo mode**, close the dialog. The canvas updates; **Last Ghost Words** appear in the inspector (rule-based lines such as a fetch-rss node materializing, a sort, a truncate, then “Pipes assembled.”).

**Voice-over:** “Or I describe the pipe in a sentence and summon the Ghost. For the jury, the default is a free, rule-based demo — no API key. You can later paste your own key in the browser if you want a live model; that key never sits on our server. Watch the tombstones appear, and the Ghost explain what it built.”

(~18s)

---

## 0:58–1:28 — Run and séance debug

**Action:** Click **Run**. Wait for the footer (souls returned, duration, graveyard export path `/p/<id>.json`). The **Séance Output** list opens with item titles. Click **Debug Souls**. The **Séance Debug — souls per node** strip appears. Click one node so the inspector shows “Souls at this node” and the tombstone badge shows a soul count.

**Voice-over:** “Run executes the pipe on the server, with safe fetches and rate limits. Each node shows how many souls — the items — passed through it, so you can debug the séance step by step.”

(~12s talk + wait for the live fetch)

---

## 1:28–1:48 — RSS and JSON export

**Action:** From the footer, copy or click through the export path shown after the run (`/p/<id>.json`). Open that JSON URL in a second tab. Then change the suffix to `.rss` and show the RSS 2.0 document. Cut back to the editor’s Séance Output list.

**Voice-over:** “Every saved pipe has a public graveyard URL: JSON or RSS, no login. You can subscribe to the RSS, or pull the JSON, and the editor already previewed the same souls.”

(~12s)

---

## 1:48–2:18 — MCP in Kiro, specs, steering, hooks

**Action (cut, keep it brisk):**

1. Terminal: API already running; `npm run dev:mcp` with the “MCP server started” line visible. No secrets on screen.
2. Kiro: open `.kiro/settings/mcp.json` (the `pipes` server pointing at `packages/mcp`). Show a `tools/list` result or a short `tools/call` of `list_nodes` or `ghost_build` — only the tool names (`list_nodes`, `list_pipes`, `get_pipe`, `create_pipe`, `add_node`, `add_connection`, `run_pipe`, `delete_pipe`, `ghost_build`).
3. File tree: open `.kiro/steering/product.md` (one heading), `.kiro/specs/pipe-engine/tasks.md` or `mcp-server` tasks, and `.kiro/hooks/README.md` (the intended hook recipes). Do not claim hook JSON files are installed; the README is what is in the repo.

**Voice-over:** “Agents talk to the same pipes through an MCP server — list nodes, build, and run. We designed this in Kiro: steering for voice and stack, specs for the engine and MCP tools, and hook recipes that say ‘new node, add a test.’ Property-based tests guard the transforms.”

(~18s)

---

## 2:18–2:32 — Close

**On screen:** Back to the editor canvas, glowing edges, séance output still visible. End on the title **Pipes from the Grave**.

**Voice-over:** “Pipes from the Grave — resurrect a visual pipe, summon a Ghost, export a feed. Built with Kiro for Kiroween, category Resurrection. Try the demo; the source and the Kiro files are in the repo.”

(~12s)

---

## Timing check

| Scene | Clock |
|---|---|
| Hook | 0:00–0:12 |
| Graveyard | 0:12–0:32 |
| Ghost (demo) | 0:32–0:58 |
| Run + debug | 0:58–1:28 |
| JSON / RSS | 1:28–1:48 |
| MCP + Kiro artifacts | 1:48–2:18 |
| Close | 2:18–2:32 |

If a live fetch is slow, trim the close, not the Ghost or MCP scenes. If you overrun, drop the second export tab (show only JSON or only RSS) before cutting Kiro.

## Shot checklist

- [ ] Demo Ghost only; no keys on screen
- [ ] Frontpage Digest + RFC Editor URL in the Ghost prompt
- [ ] Run, souls per node, `/p/:id.json` and `/p/:id.rss`
- [ ] MCP tools list or call, plus steering, specs, and hooks README
- [ ] No third-party marks, no licensed music, runtime under 2:45
