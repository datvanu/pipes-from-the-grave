/**
 * Topological sort and cycle detection tests.
 */

import { describe, it, expect } from 'vitest';
import { topologicalSort, hasCycle, getExecutionOrder } from '../src/topo.js';
import type { PipeNode, PipeEdge } from '../src/types.js';

function node(id: string, type: string): PipeNode {
  return {
    id,
    type: type as any,
    config: {},
  };
}

function edge(source: string, target: string): PipeEdge {
  return {
    id: `${source}-${target}`,
    source,
    target,
  };
}

describe('topologicalSort', () => {
  it('sorts a simple linear chain', () => {
    const nodes = [
      node('A', 'fetch-rss'),
      node('B', 'filter'),
      node('C', 'output-rss'),
    ];
    const edges = [
      edge('A', 'B'),
      edge('B', 'C'),
    ];

    const result = topologicalSort(nodes, edges);
    expect(result).toEqual(['A', 'B', 'C']);
  });

  it('sorts a diamond graph', () => {
    const nodes = [
      node('A', 'fetch-rss'),
      node('B', 'filter'),
      node('C', 'sort'),
      node('D', 'output-rss'),
    ];
    const edges = [
      edge('A', 'B'),
      edge('A', 'C'),
      edge('B', 'D'),
      edge('C', 'D'),
    ];

    const result = topologicalSort(nodes, edges);
    expect(result[0]).toBe('A');
    expect(result[3]).toBe('D');
    expect(new Set(result)).toEqual(new Set(['A', 'B', 'C', 'D']));
  });

  it('handles empty graph', () => {
    const nodes: PipeNode[] = [];
    const edges: PipeEdge[] = [];
    expect(topologicalSort(nodes, edges)).toEqual([]);
  });
});

describe('hasCycle', () => {
  it('detects a simple cycle', () => {
    const nodes = [
      node('A', 'fetch-rss'),
      node('B', 'filter'),
      node('C', 'output-rss'),
    ];
    const edges = [
      edge('A', 'B'),
      edge('B', 'C'),
      edge('C', 'A'), // Cycle!
    ];

    expect(hasCycle(nodes, edges)).toBe(true);
  });

  it('detects no cycle in DAG', () => {
    const nodes = [
      node('A', 'fetch-rss'),
      node('B', 'filter'),
      node('C', 'output-rss'),
    ];
    const edges = [
      edge('A', 'B'),
      edge('B', 'C'),
    ];

    expect(hasCycle(nodes, edges)).toBe(false);
  });

  it('detects self-loop', () => {
    const nodes = [node('A', 'fetch-rss')];
    const edges = [edge('A', 'A')];

    expect(hasCycle(nodes, edges)).toBe(true);
  });
});

describe('getExecutionOrder', () => {
  it('returns nodes in execution order', () => {
    const nodes = [
      node('A', 'fetch-rss'),
      node('B', 'filter'),
      node('C', 'output-rss'),
    ];
    const edges = [
      edge('A', 'B'),
      edge('B', 'C'),
    ];

    const result = getExecutionOrder(nodes, edges);
    expect(result.map(n => n.id)).toEqual(['A', 'B', 'C']);
  });

  it('throws on cycle', () => {
    const nodes = [
      node('A', 'fetch-rss'),
      node('B', 'filter'),
      node('C', 'output-rss'),
    ];
    const edges = [
      edge('A', 'B'),
      edge('B', 'C'),
      edge('C', 'A'),
    ];

    expect(() => getExecutionOrder(nodes, edges)).toThrow('cycle');
  });
});
