# MCP Server Design

## Architecture

```
┌─────────────────────────────────────────────────────┐
│               MCP Server                            │
├─────────────────────────────────────────────────────┤
│  Stdio Transport  →  Router  →  Handlers           │
│                                        ↓             │
│                            PipeStore (in-memory)    │
└─────────────────────────────────────────────────────┘
```

## File Structure

```
packages/mcp/
  src/
    index.ts           # Entry point, stdio setup
    router.ts          # Command routing
    handlers/
      pipe-create.ts
      pipe-delete.ts
      pipe-list.ts
      node-add.ts
      connection-add.ts
      pipe-run.ts
      pipe-get.ts
    store.ts           # In-memory pipe store
    types.ts           # MCP-specific types
    schema/            # JSON Schema for validation
      pipe-create.json
      node-add.json
      connection-add.json
      pipe-run.json
```

## Stdio Protocol

### Incoming Message (Client → Server)
```typescript
{
  jsonrpc: '2.0',
  id: number | string,
  method: string,      // command name
  params?: any
}
```

### Outgoing Message (Server → Client)
```typescript
{
  jsonrpc: '2.0',
  id: number | string,
  result?: any,
  error?: MCPError
}
```

## Pipe Store Interface

```typescript
interface PipeStore {
  create(name: string): string;        // Returns pipeId
  get(pipeId: string): Pipe | null;
  delete(pipeId: string): boolean;
  list(): PipeMetadata[];
  addNode(pipeId: string, node: Node): string;
  addConnection(pipeId: string, connection: Connection): string;
  run(pipeId: string): RunResult;
}
```

## Handler Pattern

```typescript
// Each handler exports a function
export async function handlePipeCreate(params: any): Promise<{ pipeId: string }> {
  const { name } = params;
  if (!name) throw new MCPError('INVALID_PARAMS', 'Name required');
  const pipeId = store.create(name);
  return { pipeId };
}
```

## Error Codes

```typescript
enum ErrorCode {
  INVALID_PARAMS = 'INVALID_PARAMS',
  PIPE_NOT_FOUND = 'PIPE_NOT_FOUND',
  NODE_NOT_FOUND = 'NODE_NOT_FOUND',
  INVALID_CONNECTION = 'INVALID_CONNECTION',
  RUNTIME_ERROR = 'RUNTIME_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR'
}

interface MCPError {
  code: ErrorCode;
  message: string;
}
```

## Command Reference

| Command | Params | Response | Description |
|---------|--------|----------|-------------|
| `pipe/create` | `{ name: string }` | `{ pipeId: string }` | Create new pipe |
| `pipe/delete` | `{ pipeId: string }` | `{ success: boolean }` | Delete pipe |
| `pipe/list` | `{}` | `{ pipes: PipeMetadata[] }` | List all pipes |
| `node/add` | `{ pipeId, type, params?, position? }` | `{ nodeId: string }` | Add node to pipe |
| `connection/add` | `{ pipeId, sourceNodeId, sourceOutput, targetNodeId, targetInput }` | `{ connectionId: string }` | Add connection |
| `pipe/run` | `{ pipeId }` | `{ output: any, error?: string }` | Execute pipe |
| `pipe/get` | `{ pipeId }` | `{ pipe: Pipe }` | Get full pipe definition |

## Implementation Notes

1. **State**: In-memory storage for MVP (pipeId → Pipe mapping)
2. **Concurrency**: Sequential execution (simple lock or promise queue)
3. **Validation**: Use JSON Schema for param validation
4. **Logging**: Stderr for debug messages, stdout for JSON responses
