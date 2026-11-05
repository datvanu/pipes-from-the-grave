# Editor UI Feature

## Feature Description
Web-based visual pipe editor using reactflow. Users drag nodes, connect them, configure parameters, and run pipes.

## EARS Requirements

### Episode
As a visual pipe builder, I want a canvas to drag nodes and connect them so I can build pipes intuitively.

### Action
The editor renders nodes and connections, handles drag-and-drop, and updates the pipe model.

### Result
Users can build, edit, and run pipes in the browser.

## Acceptance Criteria
1. Canvas shows node palette with categories
2. Drag nodes from palette to canvas
3. Click ports to create connections
4. Click nodes to open parameter editor
5. Run button executes current pipe
6. Ghost builder button opens ghost modal
7. Export button generates public URL
8. Errors display in the UI

## Reactflow Components

```typescript
<NodeRenderer node={node} />
<EdgeRenderer edge={edge} />
<NodePalette nodes={nodeDefinitions} />
<NodeProperties node={node} onChange={updateNode} />
<PipeRunner pipe={pipe} onRun={runPipe} />
```

## Spooky UI Requirements
- Ectoplasm glow on connections
- Animated particles on active pipes
- Hover effects on nodes
- Transitions between states

## SSRF Protection
- URLs validated before fetch
- Internal IPs blocked
- Protocol allowlist (http, https only)