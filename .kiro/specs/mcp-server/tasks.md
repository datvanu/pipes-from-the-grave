# MCP Server Implementation Tasks

## Setup
- [ ] Initialize `packages/mcp` with package.json and TypeScript configuration
- [ ] Configure stdio transport for MCP server
- [ ] Add dependencies: @modelcontextprotocol/sdk, zod

## MCP Tools
- [ ] Create `pipe/create` command
  - [ ] Accept pipe definition (name, nodes, edges)
  - [ ] Generate unique pipe ID
  - [ ] Store pipe in memory (for MVP)
  - [ ] Return pipe metadata

- [ ] Create `pipe/run` command
  - [ ] Accept pipe ID
  - [ ] Accept optional node outputs (for testing)
  - [ ] Execute pipe using @pipes/engine
  - [ ] Return execution results

- [ ] Create `pipe/list` command
  - [ ] Return all stored pipes
  - [ ] Include pipe metadata (id, name, createdAt, node count)

- [ ] Create `pipe/delete` command
  - [ ] Accept pipe ID
  - [ ] Remove pipe from storage
  - [ ] Return success status

- [ ] Create `node/add` command
  - [ ] Accept pipe ID, node definition (type, config)
  - [ ] Add node to pipe
  - [ ] Update pipe's updatedAt timestamp

- [ ] Create `connection/add` command
  - [ ] Accept pipe ID, source node ID, target node ID
  - [ ] Add edge to pipe
  - [ ] Validate no cycle introduced
  - [ ] Return success status

## Validation
- [ ] Validate pipe definitions before storage
- [ ] Validate node types against known list
- [ ] Validate edge connections (source/target exist)
- [ ] Validate for cycles before storing

## Error Handling
- [ ] Return descriptive error messages for invalid pipes
- [ ] Handle missing pipes gracefully
- [ ] Validate input schemas with Zod

## Testing
- [ ] Unit tests for each MCP command
- [ ] Integration tests for full workflow
- [ ] Property-based tests for edge cases

## Documentation
- [ ] Document all MCP commands
- [ ] Provide example usage
- [ ] Document error responses
