/**
 * Pipe execution runner.
 * Orchestrates pipe validation, topological sorting, and node execution.
 */

import type {
  PipeDefinition,
  PipeItem,
  PipeNode,
  PipeEdge,
  RunPipeOptions,
  RunPipeResult,
  NodeType,
  FilterConfig,
  SortConfig,
  TruncateConfig,
  MergeConfig,
  RegexConfig,
  RenameConfig,
  FetchRssConfig,
  FetchJsonConfig,
} from './types.js';
import { topologicalSort, hasCycle, getExecutionOrder } from './topo.js';
import { PipeValidationError } from './types.js';

// Import node runners
import { fetchRss, FetchRssRunner } from './nodes/fetch-rss.js';
import { fetchJson, FetchJsonRunner } from './nodes/fetch-json.js';
import { filterItems, FilterRunner } from './nodes/filter.js';
import { sortItems, SortRunner } from './nodes/sort.js';
import { mergeItems, MergeRunner } from './nodes/merge.js';
import { truncateItems, TruncateRunner } from './nodes/truncate.js';
import { regexReplace, RegexRunner } from './nodes/regex.js';
import { renameFields, RenameRunner } from './nodes/rename.js';
import { OutputRssRunner } from './nodes/output-rss.js';
import { OutputJsonRunner } from './nodes/output-json.js';
import type { ArrayInput } from './nodes/types.js';

/**
 * Execute a pipe definition.
 */
export async function runPipe(
  pipe: PipeDefinition,
  options?: RunPipeOptions,
): Promise<RunPipeResult> {
  // Validate pipe
  validatePipe(pipe);

  // Get execution order
  const executionOrder = getExecutionOrder(pipe.nodes, pipe.edges);

  // Execute nodes in order
  const itemsByNode: Record<string, PipeItem[]> = {};
  const nodeOutputs: Record<string, PipeItem[]> = {};

  for (const node of executionOrder) {
    const inputs = await getNodeInputs(node, pipe.edges, nodeOutputs, options);
    const items = await runNode(node, inputs, options);
    itemsByNode[node.id] = items;
    nodeOutputs[node.id] = items;
  }

  // Get output from output nodes (last output node or all nodes with no outgoing edges)
  const outputNodeIds = getOutputNodeIds(pipe.nodes, pipe.edges);
  const outputItems = outputNodeIds.flatMap(id => nodeOutputs[id] || []);

  return {
    itemsByNode,
    output: outputItems,
  };
}

/**
 * Validate a pipe definition.
 */
export function validatePipe(pipe: PipeDefinition): void {
  // Check required fields
  if (!pipe.id) {
    throw new PipeValidationError('Pipe must have an id');
  }
  
  if (!pipe.name) {
    throw new PipeValidationError('Pipe must have a name');
  }
  
  if (!Array.isArray(pipe.nodes) || pipe.nodes.length === 0) {
    throw new PipeValidationError('Pipe must have at least one node');
  }
  
  if (!Array.isArray(pipe.edges)) {
    throw new PipeValidationError('Pipe edges must be an array');
  }

  // Check for cycles
  if (hasCycle(pipe.nodes, pipe.edges)) {
    throw new PipeValidationError('Pipe contains a cycle');
  }

  // Validate each node
  for (const node of pipe.nodes) {
    validateNode(node);
  }

  // Validate edges
  for (const edge of pipe.edges) {
    validateEdge(edge, pipe.nodes);
  }
}

/**
 * Validate a single node.
 */
function validateNode(node: PipeNode): void {
  if (!node.id) {
    throw new PipeValidationError(`Node must have an id`);
  }

  if (!node.type) {
    throw new PipeValidationError(`Node ${node.id} must have a type`);
  }

  if (!node.config) {
    throw new PipeValidationError(`Node ${node.id} must have config`);
  }
}

/**
 * Validate a single edge.
 */
function validateEdge(edge: PipeEdge, nodes: PipeNode[]): void {
  if (!edge.id) {
    throw new PipeValidationError(`Edge must have an id`);
  }

  if (!edge.source) {
    throw new PipeValidationError(`Edge ${edge.id} must have a source node`);
  }

  if (!edge.target) {
    throw new PipeValidationError(`Edge ${edge.id} must have a target node`);
  }

  const sourceNode = nodes.find(n => n.id === edge.source);
  if (!sourceNode) {
    throw new PipeValidationError(`Edge ${edge.id} references unknown source node: ${edge.source}`);
  }

  const targetNode = nodes.find(n => n.id === edge.target);
  if (!targetNode) {
    throw new PipeValidationError(`Edge ${edge.id} references unknown target node: ${edge.target}`);
  }
}

/**
 * Get the inputs for a node from edges.
 */
async function getNodeInputs(
  node: PipeNode,
  edges: PipeEdge[],
  nodeOutputs: Record<string, PipeItem[]>,
  options?: RunPipeOptions,
): Promise<ArrayInput | any> {
  // Find all edges targeting this node
  const incomingEdges = edges.filter(e => e.target === node.id);

  // Handle different node types differently
  if (node.type === 'merge') {
    // Merge node: collect from all incoming edges
    const itemArrays: PipeItem[][] = [];
    for (const edge of incomingEdges) {
      const sourceItems = nodeOutputs[edge.source] || [];
      itemArrays.push(sourceItems);
    }
    return { items: itemArrays };
  } else {
    // Single-input nodes: take from first incoming edge
    // (pipes should have at most one incoming edge per non-merge node)
    if (incomingEdges.length === 0) {
      // No inputs - use seed input if available
      if (options?.seedInputs && node.id in options.seedInputs) {
        return { items: options.seedInputs[node.id] };
      }
      return { items: [] };
    }

    // Take from first (or only) incoming edge
    const sourceId = incomingEdges[0].source;
    const sourceItems = nodeOutputs[sourceId] || [];
    
    if (options?.seedInputs && sourceId in options.seedInputs && sourceItems.length === 0) {
      return { items: options.seedInputs[sourceId] };
    }

    return { items: sourceItems };
  }
}

/**
 * Run a single node with its inputs.
 */
async function runNode(
  node: PipeNode,
  input: any,
  options?: RunPipeOptions,
): Promise<PipeItem[]> {
  const runner = createNodeRunner(node.type, node.config);

  // Validate before running
  runner.validate();

  // Handle different node types differently
  if (node.type === 'fetch-rss' || node.type === 'fetch-json') {
    // Fetch nodes are async
    const result = await (runner as any).run(options);
    return Array.isArray(result) ? result : result.items;
  } else if (node.type === 'merge') {
    // Merge node
    const result = (runner as any).run(input);
    return result.items;
  } else {
    // Regular transform nodes
    const result = (runner as any).run(input as ArrayInput);
    return result.items;
  }
}

/**
 * Create a node runner based on node type.
 */
function createNodeRunner(type: NodeType, config: Record<string, unknown>): any {
  switch (type) {
    case 'fetch-rss':
      return new FetchRssRunner(config as unknown as FetchRssConfig);

    case 'fetch-json':
      return new FetchJsonRunner(config as unknown as FetchJsonConfig);

    case 'filter':
      return new FilterRunner(config as unknown as FilterConfig);

    case 'sort':
      return new SortRunner(config as unknown as SortConfig);

    case 'merge':
      return new MergeRunner(config as unknown as MergeConfig);

    case 'truncate':
      return new TruncateRunner(config as unknown as TruncateConfig);

    case 'regex':
      return new RegexRunner(config as unknown as RegexConfig);

    case 'rename':
      return new RenameRunner(config as unknown as RenameConfig);

    case 'output-rss':
      return new OutputRssRunner(config);

    case 'output-json':
      return new OutputJsonRunner(config);

    default:
      throw new Error(`Unknown node type: ${type}`);
  }
}

/**
 * Get the IDs of output nodes (nodes with no outgoing edges).
 */
function getOutputNodeIds(nodes: PipeNode[], edges: PipeEdge[]): string[] {
  const sourceIds = new Set(edges.map(e => e.source));
  return nodes.map(n => n.id).filter(id => !sourceIds.has(id));
}
