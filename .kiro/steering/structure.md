# Folder Layout and Naming Conventions

## Directory Structure
```
packages/
  engine/          # Pipe execution engine + node implementations
  mcp/             # MCP server implementation

apps/
  server/          # Fastify API server
  web/             # Vite + React client

docs/              # Documentation
specs/             # Feature specifications (EARS format)
.scripts/          # Build and deployment scripts
logs/              # Runtime logs (gitignored)
```

## File Naming
- **TypeScript**: `*.ts`, `*.tsx`
- **Tests**: `*.test.ts`, `*.spec.ts`
- **Configuration**: `*.json`, `*.config.ts`
- **Styles**: `*.module.css`, `*.css`
- **React Components**: `PascalCase.tsx` or `PascalCase/index.tsx`

## Package Conventions
- **Engine**: Pure functions, no side effects in core logic
- **MCP**: State machine pattern for server state
- **Server**: Fastify decorators for shared utilities
- **Web**: Context providers for shared state

## Export Conventions
- **Main entry**: `index.ts` re-exports public API
- **Types**: `types.ts` for shared type definitions
- **Constants**: `constants.ts` or inline for simple values