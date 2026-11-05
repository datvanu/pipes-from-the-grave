# Node Library Feature

## Feature Description
Collection of reusable node types for pipe construction. Implements the core node set with validation, defaults, and type definitions.

## EARS Requirements

### Episode
As a pipe builder, I want to select from a library of node types so I can build pipes without implementing each node myself.

### Action
Nodes are registered with metadata, defaults, and validation logic. The editor displays nodes and validates connections.

### Result
Users can add nodes to the canvas, configure them, and connect them validly.

## Acceptance Criteria
1. All engine node types are exposed as library nodes
2. Each node has a unique type identifier
3. Each node defines input/output ports with types
4. Each node has default parameter values
5. Node validation rejects invalid connections
6. Node metadata includes UI display name and description

## Node Metadata Structure

```typescript
interface NodeDefinition {
  type: string;
  label: string;
  description: string;
  category: 'source' | 'transform' | 'output';
  inputs: NodePort[];
  outputs: NodePort[];
  defaults: Record<string, any>;
  validate?: (inputs: Record<string, any>) => void;
}
```

## Node Categories
- **Source**: FetchRSS, FetchJSON (start pipes)
- **Transform**: Filter, Sort, Merge, Truncate, Regex, Rename (modify data)
- **Output**: OutputRSS, OutputJSON (consume data)

## UI Requirements
- Node palette organized by category
- Drag-and-drop to canvas
- Visual feedback for valid/invalid connections