# Product Vision: Pipes from the Grave

## Core Concept
A visual browser-based feed and data pipe editor where users connect nodes to process data. Inspired by classic visual feed pipes (discontinued 2015), resurrected for modern usage.

## Features
- **Node Types**: Fetch RSS/JSON, Filter, Sort, Merge, Truncate, Regex/Rename, Output RSS/JSON
- **AI Ghost Builder**: Describe a pipe in one sentence; the Ghost builds it with spooky flair
- **Ectoplasm UI**: Spooky, playful visual style with glowing connections and animated particles
- **MCP Server**: Allow agents to build, run, and inspect pipes programmatically
- **Public Graveyard**: Export pipes as public RSS/JSON URLs (no login required for MVP)
- **SSRF Safe**: All fetch operations use allowlists and IP blocking

## Non-Goals (MVP)
- User accounts and authentication
- Pipe persistence (server-side)
- Collaborative editing
- Complex custom node types (beyond core library)

## Acceptance Criteria
- Users can connect nodes to build a valid pipe in the editor
- AI Ghost builds a pipe from a natural language description
- Pipes execute end-to-end with correct data transformation
- Exported pipes produce valid RSS or JSON at a public URL
- No SSRF vulnerabilities in fetch operations