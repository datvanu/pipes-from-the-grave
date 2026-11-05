# Pipe Engine Design

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Pipe Engine                        │
├─────────────────────────────────────────────────────┤
│  TopologicalSorter  →  ExecutionContext  →  Runner │
└─────────────────────────────────────────────────────┘
```

## Core Types

```typescript
// Pipe definition
interface Pipe {
  id: string;
  nodes: Node[];
  connections: Connection[];
}

interface Node {
  id: string;
  type: NodeType;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
}

interface Connection {
  id: string;
  sourceNodeId: string;
  sourceOutputKey: string;
  targetNodeId: string;
  targetInputKey: string;
}
```

## Execution Flow

1. **Validate**: Check for circular dependencies, valid connections, required params
2. **Topologically Sort**: Order nodes for execution
3. **Execute**: Run each node with its inputs, store outputs
4. **Collect**: Gather final output from Output nodes

## Node Interface

```typescript
interface NodeRunner<T = unknown, R = unknown> {
  validate(inputs: T): void;
  run(inputs: T): R;
}
```

## Property-Based Tests

```typescript
// Example: Filter node
test.prop([
  fc.array(fc.integer()),
  fc.integer({ min: 0, max: 100 })
])('preserves elements matching predicate', (arr, threshold) => {
  const result = filterNode.run({ data: arr, predicate: (x: number) => x > threshold });
  expect(result.data).every(x => x > threshold);
});
```

## File Structure

```
packages/engine/
  src/
    types.ts              # Core types
    topological-sort.ts   # Cycle detection + sort
    runner.ts             # Execution engine
    nodes/
      fetch-rss.ts
      fetch-json.ts
      filter.ts
      sort.ts
      merge.ts
      truncate.ts
      regex.ts
      rename.ts
      output-rss.ts
      output-json.ts
    index.ts              # Public API
  test/
    runner.test.ts
    nodes/
```