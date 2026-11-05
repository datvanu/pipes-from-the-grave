# Pipe Engine Implementation Tasks

## Setup
- [ ] Initialize `packages/engine` with `package.json` (name, type: module, exports)
- [ ] Add `fast-check` and `vitest` as dev dependencies
- [ ] Configure `tsconfig.json` (extends root, outDir: dist)
- [ ] Create `src/types.ts` with Pipe, Node, Connection types
- [ ] Create `src/index.ts` entry point

## Core Engine
- [ ] Implement `src/topological-sort.ts` (cycle detection + sort)
- [ ] Implement `src/runner.ts` (validate + execute pipe)
- [ ] Add `PipeValidationError` class for typed errors

## Node Implementations
- [ ] Create `src/nodes/fetch-rss.ts` (FetchRSS runner)
- [ ] Create `src/nodes/fetch-json.ts` (FetchJSON runner)
- [ ] Create `src/nodes/filter.ts` (Filter runner)
- [ ] Create `src/nodes/sort.ts` (Sort runner)
- [ ] Create `src/nodes/merge.ts` (Merge runner)
- [ ] Create `src/nodes/truncate.ts` (Truncate runner)
- [ ] Create `src/nodes/regex.ts` (Regex runner)
- [ ] Create `src/nodes/rename.ts` (Rename runner)
- [ ] Create `src/nodes/output-rss.ts` (OutputRSS runner)
- [ ] Create `src/nodes/output-json.ts` (OutputJSON runner)

## Property-Based Tests
- [ ] Create `test/runner.test.ts` with cycle detection tests
- [ ] Create `test/nodes/filter.test.ts` with fast-check tests
- [ ] Create `test/nodes/sort.test.ts` with fast-check tests
- [ ] Create `test/nodes/merge.test.ts` with fast-check tests
- [ ] Create `test/nodes/truncate.test.ts` with fast-check tests

## Integration
- [ ] Wire all nodes into single pipe execution test
- [ ] Add SSRF-safe URL validation helper
- [ ] Add documentation comments to all public types/functions