# Ghost Builder Implementation Tasks

## Setup
- [ ] Create `packages/engine/src/ghost/types.ts` with GhostIntent, GhostMessage types
- [ ] Create `packages/engine/src/ghost/index.ts` entry point

## Parser
- [ ] Implement `packages/engine/src/ghost/parser.ts` regex-based parsing
- [ ] Extract source type detection (rss/json)
- [ ] Extract URL detection (regex for URLs)
- [ ] Extract transformation keywords
- [ ] Extract output type detection

## Intent Validation
- [ ] Add `validateIntent` function
- [ ] Require at least source and output
- [ ] Reject impossible combinations (merge without multiple sources)

## Planner
- [ ] Implement `packages/engine/src/ghost/planner.ts`
- [ ] Map transformations to node types
- [ ] Order nodes topologically
- [ ] Generate connection plan

## Constructor
- [ ] Implement `packages/engine/src/ghost/constructor.ts`
- [ ] Create nodes with generated IDs
- [ ] Add connections between nodes
- [ ] Apply default parameters
- [ ] Return valid pipe or error

## Ghost Messages
- [ ] Create `packages/engine/src/ghost/messages.ts`
- [ ] Define all ghost dialogue lines
- [ ] Add message types (start, step, success, error)
- [ ] Integrate messages into construction flow

## Testing
- [ ] Test parser extracts correct intent from patterns
- [ ] Test validator rejects impossible intents
- [ ] Test constructor produces valid pipes
- [ ] Test error paths return helpful messages