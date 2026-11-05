# Editor UI Design

## Architecture

```
┌─────────────────────────────────────────────────────┐
│               Editor UI                             │
├─────────────────────────────────────────────────────┤
│  App  →  Canvas  →  Nodes + Edges  →  Pipe State   │
│         ↓                                           │
│  Palette  |  Properties  |  Ghost Modal  |  Run     │
└─────────────────────────────────────────────────────┘
```

## File Structure

```
apps/web/
  src/
    main.tsx
    App.tsx
    components/
      Canvas/
        Canvas.tsx
        NodeRenderer.tsx
        EdgeRenderer.tsx
      Palette/
        Palette.tsx
        CategoryGroup.tsx
        NodeItem.tsx
      Properties/
        Properties.tsx
        ParamInput.tsx
        ParamSelect.tsx
      Ghost/
        GhostModal.tsx
        GhostMessage.tsx
      Run/
        RunButton.tsx
        RunResults.tsx
      Export/
        ExportButton.tsx
        PublicUrlDisplay.tsx
    hooks/
      usePipeState.ts
      useNodePalette.ts
      useGhostBuilder.ts
      usePipeRunner.ts
    styles/
      Canvas.module.css
      Palette.module.css
      ghost-anim.css
```

## State Management

```typescript
// usePipeState hook
interface PipeState {
  nodes: Node[];
  connections: Connection[];
  selectedNode: string | null;
  isRunning: boolean;
  runResults: RunResult | null;
}

// Actions
- addNode(type, position)
- removeNode(id)
- updateNode(id, params)
- addConnection(source, sourceOutput, target, targetInput)
- removeConnection(id)
- selectNode(id)
- runPipe()
```

## Node Rendering

```typescript
// Custom node with ports
function NodeRenderer({ node }: { node: Node }) {
  return (
    <div className="node">
      <div className="node-header">{node.type}</div>
      <div className="node-ports">
        {node.inputs.map(port => <Port key={port.key} type="input" />)}
        {node.outputs.map(port => <Port key={port.key} type="output" />)}
      </div>
    </div>
  );
}
```

## Connection Rendering

```typescript
// Custom edge with ghost glow
function EdgeRenderer({ edge }: { edge: Connection }) {
  return (
    <BaseEdge
      className="ectoplasm-edge"
      style={{ stroke: '#4af626' }}
    />
  );
}
```

## Ghost Modal

```typescript
function GhostModal({ isOpen, onClose, onBuild }: GhostModalProps) {
  // Text input for description
  // Live ghost messages
  // Build button
}
```

## Export Flow

1. User clicks "Exorcise to Graveyard"
2. Server generates UUID and saves pipe
3. Public URL returned: `/graveyard/{uuid}`
4. URL accessible via GET returns RSS/JSON output