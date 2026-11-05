# Node Library Design

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                Node Library                         │
├─────────────────────────────────────────────────────┤
│  Registry  →  NodeDefinitions  →  Validation      │
└─────────────────────────────────────────────────────┘
```

## File Structure

```
packages/engine/src/
  nodes/
    types.ts              # Shared node types
    library.ts            # Node registry
    definitions/
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
    validation.ts         # Connection validation
    index.ts              # Public API
```

## Registry Interface

```typescript
interface NodeRegistry {
  get(type: string): NodeDefinition | undefined;
  getAll(): NodeDefinition[];
  getByCategory(category: string): NodeDefinition[];
  canConnect(sourceType: string, outputKey: string, targetType: string, inputKey: string): boolean;
  register(definition: NodeDefinition): void;
}
```

## Node Definition Structure

```typescript
interface NodeDefinition {
  type: string;                          // Unique identifier (e.g., "fetch-rss")
  label: string;                         // Display name (e.g., "Fetch RSS")
  description: string;                   // Tooltip text
  category: 'source' | 'transform' | 'output';
  inputs: NodePort[];                    // Input ports
  outputs: NodePort[];                   // Output ports
  defaults: Record<string, any>;         // Default parameter values
  validate?: (inputs: Record<string, any>) => void;
}
```

## Port Structure

```typescript
interface NodePort {
  key: string;                           // Internal key (e.g., "data")
  label: string;                         // Display label
  type: 'input' | 'output';
  allowedTypes?: string[];               // If set, restrict compatible connections
  required?: boolean;                    // Must be connected
}
```

## Valid Connection Matrix

| Source Category | Target Category | Compatible? |
|-----------------|-----------------|-------------|
| source | transform | ✓ |
| transform | transform | ✓ |
| transform | output | ✓ |
| source | output | ✗ (unless output accepts raw) |
| output | any | ✗ |

## Registry Implementation

```typescript
class NodeRegistry {
  private nodes: Map<string, NodeDefinition> = new Map();
  
  register(definition: NodeDefinition): void {
    if (this.nodes.has(definition.type)) {
      throw new Error(`Node type ${definition.type} already registered`);
    }
    this.nodes.set(definition.type, definition);
  }
  
  get(type: string): NodeDefinition | undefined {
    return this.nodes.get(type);
  }
  
  getAll(): NodeDefinition[] {
    return Array.from(this.nodes.values());
  }
  
  getByCategory(category: string): NodeDefinition[] {
    return Array.from(this.nodes.values())
      .filter(n => n.category === category);
  }
  
  canConnect(
    sourceType: string, sourceOutput: string,
    targetType: string, targetInput: string
  ): boolean {
    const source = this.nodes.get(sourceType);
    const target = this.nodes.get(targetType);
    
    if (!source || !target) return false;
    
    const outputPort = source.outputs.find(p => p.key === sourceOutput);
    const inputPort = target.inputs.find(p => p.key === targetInput);
    
    if (!outputPort || !inputPort) return false;
    
    // Type compatibility check
    const sourceAllowed = outputPort.allowedTypes || ['data'];
    const targetAllowed = inputPort.allowedTypes || ['data'];
    
    return sourceAllowed.some(t => targetAllowed.includes(t));
  }
}
```
