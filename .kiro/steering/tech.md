# Technology Stack

## Monorepo Structure
- **Package Manager**: npm workspaces
- **Language**: TypeScript (strict mode)
- **Runtime**: Node.js 20+ (LTS)

## Packages
### `packages/engine`
- Pure pipe execution engine
- Node implementations (Fetch, Filter, Sort, Merge, Truncate, Regex, Rename, Output)
- Property-based testing with `fast-check`
- No UI dependencies

### `packages/mcp`
- Standard library MCP server
- stdio transport
- Commands: `pipe/create`, `pipe/run`, `node/add`, `connection/add`, `pipe/list`, `pipe/delete`

## Apps
### `apps/server`
- **Framework**: Fastify
- **Purpose**: API for pipe management, export endpoints, MCP broker
- **Security**: SSRF protection middleware, input sanitization

### `apps/web`
- **Framework**: Vite + React 18
- **Graph Editor**: `@xyflow/react`
- **Styling**: CSS modules / scoped styles
- **State**: React state + localStorage (client-side only)

## Testing
- **Test Runner**: Vitest
- **Testing Strategy**: Unit tests for engine, integration tests for server, E2E for web UI

## Build Tools
- TypeScript compiler (`tsc`)
- Vite for web bundling
- No transpilation for Node code (ESM with `type: "module"`)

## English Only
All code, comments, documentation, and logs must be in English.