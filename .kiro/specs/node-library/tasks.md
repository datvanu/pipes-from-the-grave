# Node Library Implementation Tasks

## Setup
- [ ] Create `packages/engine/src/nodes/library.ts`
- [ ] Add `NodeRegistry` class with get/register/getAll methods
- [ ] Create `PortType` and `NodePort` type definitions

## Node Definitions
- [ ] Define `FetchRSSNode` with metadata and port definitions
- [ ] Define `FetchJSONNode` with metadata and port definitions
- [ ] Define `FilterNode` with metadata and port definitions
- [ ] Define `SortNode` with metadata and port definitions
- [ ] Define `MergeNode` with metadata and port definitions
- [ ] Define `TruncateNode` with metadata and port definitions
- [ ] Define `RegexNode` with metadata and port definitions
- [ ] Define `RenameNode` with metadata and port definitions
- [ ] Define `OutputRSSNode` with metadata and port definitions
- [ ] Define `OutputJSONNode` with metadata and port definitions

## Registry
- [ ] Register all nodes in `library.ts`
- [ ] Add category filtering method (getSourceNodes, getTransformNodes, getOutputNodes)
- [ ] Add connection validation method (canConnect(source, target))

## Validation Helpers
- [ ] Add type compatibility checker (canConnect(sourceType, targetType))
- [ ] Add node-specific validation (validateParams)
- [ ] Add error messages for common connection errors

## Testing
- [ ] Test registry returns correct nodes
- [ ] Test connection validation rejects invalid pairs
- [ ] Test default params are applied correctly