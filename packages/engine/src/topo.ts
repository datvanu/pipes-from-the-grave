/**
 * Topological sort implementation with cycle detection.
 * Used to order pipe nodes for execution.
 */

import type { PipeNode, PipeEdge } from './types.js';

/**
 * Graph representation for topological sort.
 */
interface Graph {
  nodes: Set<string>;
  edges: Map<string, Set<string>>;
}

/**
 * Build a graph from nodes and edges.
 */
function buildGraph(nodes: PipeNode[], edges: PipeEdge[]): Graph {
  const nodeIds = new Set(nodes.map(n => n.id));
  const edgesMap = new Map<string, Set<string>>();
  
  for (const node of nodes) {
    edgesMap.set(node.id, new Set());
  }
  
  for (const edge of edges) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      const targets = edgesMap.get(edge.source) || new Set();
      targets.add(edge.target);
      edgesMap.set(edge.source, targets);
    }
  }
  
  return {
    nodes: nodeIds,
    edges: edgesMap,
  };
}

/**
 * Perform topological sort using Kahn's algorithm.
 * Returns sorted node IDs, or throws if a cycle is detected.
 */
export function topologicalSort(
  nodes: PipeNode[],
  edges: PipeEdge[],
): string[] {
  const graph = buildGraph(nodes, edges);
  const inDegree = new Map<string, number>();
  
  // Initialize in-degrees
  for (const nodeId of graph.nodes) {
    inDegree.set(nodeId, 0);
  }
  
  // Calculate in-degrees
  for (const [source, targets] of graph.edges) {
    for (const target of targets) {
      const current = inDegree.get(target) || 0;
      inDegree.set(target, current + 1);
    }
  }
  
  // Find all nodes with no incoming edges
  const queue: string[] = [];
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) {
      queue.push(nodeId);
    }
  }
  
  const sorted: string[] = [];
  
  while (queue.length > 0) {
    // Sort queue to ensure deterministic order
    queue.sort();
    const current = queue.shift()!;
    sorted.push(current);
    
    // Reduce in-degree of neighbors
    const neighbors = graph.edges.get(current) || new Set();
    for (const neighbor of neighbors) {
      const degree = inDegree.get(neighbor)!;
      inDegree.set(neighbor, degree - 1);
      
      if (degree - 1 === 0) {
        queue.push(neighbor);
      }
    }
  }
  
  // If we didn't process all nodes, there's a cycle
  if (sorted.length !== graph.nodes.size) {
    throw new Error(
      'Pipe contains a cycle. Nodes cannot be topologically sorted.',
    );
  }
  
  return sorted;
}

/**
 * Check if a pipe definition has cycles.
 */
export function hasCycle(nodes: PipeNode[], edges: PipeEdge[]): boolean {
  try {
    topologicalSort(nodes, edges);
    return false;
  } catch {
    return true;
  }
}

/**
 * Get the execution order for a pipe definition.
 * Throws if the pipe has cycles.
 */
export function getExecutionOrder(
  pipeNodes: PipeNode[],
  pipeEdges: PipeEdge[],
): PipeNode[] {
  const sortedIds = topologicalSort(pipeNodes, pipeEdges);
  
  const nodeMap = new Map(pipeNodes.map(n => [n.id, n]));
  
  return sortedIds.map(id => {
    const node = nodeMap.get(id);
    if (!node) {
      throw new Error(`Node ${id} not found in pipe definition`);
    }
    return node;
  });
}
