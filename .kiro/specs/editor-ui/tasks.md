# Editor UI Implementation Tasks

## Setup
- [ ] Create `apps/web` with Vite + React + TypeScript
- [ ] Install `@xyflow/react` and dependencies
- [ ] Configure `vite.config.ts` with React plugin
- [ ] Create `src/main.tsx` and `src/App.tsx`

## Core Components
- [ ] Create `src/components/Canvas/Canvas.tsx` with reactflow setup
- [ ] Create `src/components/Canvas/NodeRenderer.tsx` custom node
- [ ] Create `src/components/Canvas/EdgeRenderer.tsx` custom edge
- [ ] Add CSS for spooky effects (ectoplasm glow, particles)

## Node Palette
- [ ] Create `src/components/Palette/Palette.tsx`
- [ ] Create `src/components/Palette/CategoryGroup.tsx`
- [ ] Create `src/components/Palette/NodeItem.tsx`
- [ ] Add drag-to-canvas logic

## Node Properties
- [ ] Create `src/components/Properties/Properties.tsx`
- [ ] Create `src/components/Properties/ParamInput.tsx`
- [ ] Create `src/components/Properties/ParamSelect.tsx`
- [ ] Add form handling for node updates

## State Hooks
- [ ] Create `src/hooks/usePipeState.ts`
- [ ] Create `src/hooks/useNodePalette.ts`
- [ ] Create `src/hooks/useGhostBuilder.ts`
- [ ] Create `src/hooks/usePipeRunner.ts`

## Ghost Integration
- [ ] Create `src/components/Ghost/GhostModal.tsx`
- [ ] Create `src/components/Ghost/GhostMessage.tsx`
- [ ] Integrate with ghost builder API

## Run and Export
- [ ] Create `src/components/Run/RunButton.tsx`
- [ ] Create `src/components/Run/RunResults.tsx`
- [ ] Create `src/components/Export/ExportButton.tsx`
- [ ] Create `src/components/Export/PublicUrlDisplay.tsx`

## SSRF Protection
- [ ] Add URL validation utility
- [ ] Block internal IPs
- [ ] Allow only http/https protocols
- [ ] Validate before API calls