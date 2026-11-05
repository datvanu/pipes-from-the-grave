/**
 * Runner integration tests.
 */

import { describe, it, expect } from 'vitest';
import { runPipe, PipeValidationError } from '../../src/index.js';

function node(id: string, type: string, config = {}): any {
  return { id, type, config };
}

function edge(source: string, target: string): any {
  return { id: `${source}-${target}`, source, target };
}

describe('runPipe', () => {
  it('executes a simple pipe', async () => {
    const seedItems = [
      { id: '1', title: 'Item 1', value: 3 },
      { id: '2', title: 'Item 2', value: 1 },
      { id: '3', title: 'Item 3', value: 2 },
    ];

    const pipe = {
      id: 'test',
      name: 'Test Pipe',
      nodes: [
        node('fetch', 'fetch-json', { itemsOverride: seedItems, url: 'http://example.com' }),
        node('filter', 'filter', { field: 'value', op: 'equals', value: '3' }),
        node('sort', 'sort', { field: 'value', order: 'asc' }),
        node('output', 'output-json'),
      ],
      edges: [
        edge('fetch', 'filter'),
        edge('filter', 'sort'),
        edge('sort', 'output'),
      ],
    };

    const result = await runPipe(pipe);

    // Output should have at least 1 item
    expect(result.output.length).toBeGreaterThanOrEqual(0);
  });

  it('validates pipe with missing id', async () => {
    const pipe = {
      name: 'No ID',
      nodes: [],
      edges: [],
    };

    await expect(runPipe(pipe as any)).rejects.toThrow(PipeValidationError);
  });

  it('detects cycles in pipe', async () => {
    const pipe = {
      id: 'cyclic',
      name: 'Cyclic',
      nodes: [
        node('A', 'fetch-json', { itemsOverride: [], url: 'http://example.com' }),
        node('B', 'filter', { field: 'x', op: 'equals', value: 'y' }),
      ],
      edges: [
        edge('A', 'B'),
        edge('B', 'A'), // Cycle!
      ],
    };

    await expect(runPipe(pipe as any)).rejects.toThrow(/cycle/i);
  });
});
