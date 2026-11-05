/**
 * Core types for the pipe engine.
 */

/**
 * Represents a single item in the pipe data stream.
 * Typically represents a feed item or JSON object.
 */
export interface PipeItem {
  id: string;
  title: string;
  link?: string;
  summary?: string;
  published?: string;
  author?: string;
  tags?: string[];
  [key: string]: unknown;
}

/**
 * The type of node in a pipe definition.
 */
export type NodeType =
  | 'fetch-rss'
  | 'fetch-json'
  | 'filter'
  | 'sort'
  | 'merge'
  | 'truncate'
  | 'regex'
  | 'rename'
  | 'output-rss'
  | 'output-json';

/**
 * A node in the pipe definition graph.
 */
export interface PipeNode {
  id: string;
  type: NodeType;
  config: Record<string, unknown>;
  position?: { x: number; y: number };
}

/**
 * An edge (connection) between two nodes in the pipe.
 */
export interface PipeEdge {
  id: string;
  source: string;
  target: string;
}

/**
 * Complete pipe definition with nodes and edges.
 */
export interface PipeDefinition {
  id: string;
  name: string;
  nodes: PipeNode[];
  edges: PipeEdge[];
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Options for running a pipe.
 */
export interface RunPipeOptions {
  fetchFn?: typeof fetch;
  seedInputs?: Record<string, PipeItem[]>;
}

/**
 * Result of pipe execution.
 */
export interface RunPipeResult {
  itemsByNode: Record<string, PipeItem[]>;
  output: PipeItem[];
}

/**
 * Error thrown when pipe validation fails.
 */
export class PipeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PipeValidationError';
  }
}

/**
 * Configuration for filter node.
 */
export interface FilterConfig {
  field: string;
  op: 'equals' | 'contains' | 'regex' | 'gt' | 'gte' | 'lt' | 'lte';
  value: string;
}

/**
 * Configuration for sort node.
 */
export interface SortConfig {
  field: string;
  order: 'asc' | 'desc';
}

/**
 * Configuration for truncate node.
 */
export interface TruncateConfig {
  limit: number;
  uniqueBy?: string;
}

/**
 * Configuration for merge node.
 */
export interface MergeConfig {
  uniqueById?: boolean;
}

/**
 * Configuration for regex node.
 */
export interface RegexConfig {
  field: string;
  pattern: string;
  flags?: string;
  replacement: string;
}

/**
 * Configuration for rename node.
 */
export interface RenameConfig {
  mapping: Record<string, string>;
}

/**
 * Configuration for fetch nodes.
 */
export interface FetchConfig {
  url: string;
}

/**
 * Configuration for output nodes.
 */
export interface OutputConfig {
  format: 'rss' | 'json';
}

export interface FetchRssConfig {
  url?: string;
  itemsOverride?: PipeItem[];
}

export interface FetchJsonConfig {
  url?: string;
  itemsOverride?: any[];
  mapping?: Record<string, string>;
}
