# Ghost Builder Design

## Architecture

```
┌─────────────────────────────────────────────────────┐
│              Ghost Builder                          │
├─────────────────────────────────────────────────────┤
│  Parser  →  Intent  →  Planner  →  Constructor     │
└─────────────────────────────────────────────────────┘
```

## Intent Detection

```typescript
interface GhostIntent {
  sourceType: 'rss' | 'json';
  urls: string[];
  transformations: Transformation[];
  outputType: 'rss' | 'json';
}

type Transformation = 
  | { type: 'filter'; field?: string; value: string }
  | { type: 'sort'; field?: string; descending: boolean }
  | { type: 'truncate'; limit: number }
  | { type: 'merge' };
```

## Parser Rules

```typescript
// Pattern extraction
- "fetch (rss|json) from (url)" → sourceType, urls
- "filter (by|for) (field)" → filter transformation
- "sort (ascending|descending)" → sort transformation
- "truncate to (number)" → truncate transformation
- "merge (feeds|pipes)" → merge transformation
- "output (rss|json)" → outputType
```

## Construction Algorithm

1. **Parse** description into intent
2. **Validate** intent (has source, has output, valid transformations)
3. **Plan** node sequence (source → transforms → output)
4. **Construct** pipe with node IDs and connections
5. **Validate** pipe structure (no cycles, valid connections)
6. **Return** pipe or error with ghost message

## Ghost Messages

```typescript
const GHOST_MESSAGES = {
  start: "Whispers through the mist... constructing pipe...",
  success: "Ectoplasm humming. Pipe ready for the afterlife.",
  error: "Flickering lights... something went wrong. Try rephrasing.",
  filter: "Filter materializing in the shadows...",
  sort: "Order emerging from chaos...",
  truncate: "Excess flesh... I mean, data... trimmed away.",
  merge: "Tentacles connecting feeds...",
  output: "Pipe taking final form..."
};
```

## File Structure

```
packages/engine/src/
  ghost/
    parser.ts           # Natural language parser
    planner.ts          # Intent → plan
    constructor.ts      # Plan → pipe
    types.ts            # Ghost types
    index.ts            # Public API
```