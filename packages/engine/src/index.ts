/**
 * @pipes/engine - Pipe execution engine for "Pipes from the Grave"
 */

// Core types
export type {
  PipeItem,
  NodeType,
  PipeNode,
  PipeEdge,
  PipeDefinition,
  RunPipeOptions,
  RunPipeResult,
  FilterConfig,
  SortConfig,
  TruncateConfig,
  MergeConfig,
  RegexConfig,
  RenameConfig,
  FetchConfig,
  OutputConfig,
} from './types.js';

export { PipeValidationError, NODE_TYPES } from './types.js';

// SSRF protection
export { isSafeUrl, assertSafeUrl, validateUrl, isBlockedAddress, resolveAndCheck, SSRF_DENIED } from './ssrf.js';

// Topological sort
export { topologicalSort, hasCycle, getExecutionOrder } from './topo.js';

// Node runners
export {
  // Fetch RSS
  fetchRss,
  FetchRssRunner,
  parseRssFeed,
} from './nodes/fetch-rss.js';

export {
  fetchJson,
  FetchJsonRunner,
  parseJsonToItems,
} from './nodes/fetch-json.js';

export {
  filterItems,
  FilterRunner,
} from './nodes/filter.js';

export {
  sortItems,
  SortRunner,
} from './nodes/sort.js';

export {
  mergeItems,
  MergeRunner,
} from './nodes/merge.js';

export {
  truncateItems,
  TruncateRunner,
} from './nodes/truncate.js';

export {
  regexReplace,
  RegexRunner,
} from './nodes/regex.js';

export {
  renameFields,
  RenameRunner,
} from './nodes/rename.js';

export {
  outputRss,
  OutputRssRunner,
} from './nodes/output-rss.js';

export {
  outputJson,
  OutputJsonRunner,
} from './nodes/output-json.js';

// Serialization
export { itemsToRss20, itemsToJson, rss20ToItems } from './serialize.js';

// Runner
export { runPipe, validatePipe } from './runner.js';
