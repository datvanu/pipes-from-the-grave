# MCP Server Feature

## Feature Description
Model Context Protocol server for programmatic pipe building and execution. Allows AI agents to create, run, and inspect pipes.

## EARS Requirements

### Episode
As an AI agent, I want to build and run pipes via MCP so I can automate data processing workflows.

### Action
The MCP server receives commands via stdio, executes them, and returns JSON responses.

### Result
Agents can fully control pipe lifecycle programmatically.

## Acceptance Criteria
1. Server implements MCP stdio protocol
2. Supports pipe creation with node addition
3. Supports pipe execution with results
4. Supports listing and deletion
5. Returns structured JSON responses
6. Errors include error codes and messages

## MCP Commands

| Command | Params | Response |
|---------|--------|----------|
| `pipe/create` | `{ name: string }` | `{ pipeId: string }` |
| `pipe/delete` | `{ pipeId: string }` | `{ success: boolean }` |
| `pipe/list` | `{}` | `{ pipes: PipeMetadata[] }` |
| `node/add` | `{ pipeId, type, params, position }` | `{ nodeId: string }` |
| `connection/add` | `{ pipeId, sourceNodeId, sourceOutput, targetNodeId, targetInput }` | `{ connectionId: string }` |
| `pipe/run` | `{ pipeId }` | `{ output: any, error?: string }` |
| `pipe/get` | `{ pipeId }` | `{ pipe: Pipe }` |

## State Management
- In-memory storage for MVP (pipeId → Pipe mapping)
- No persistence (restart clears all)
- Thread-safe operations (simple lock or sequential execution)

## Error Handling
```typescript
interface MCPError {
  code: 'PIPE_NOT_FOUND' | 'INVALID_NODE' | 'INVALID_CONNECTION' | 'RUNTIME_ERROR';
  message: string;
}
```