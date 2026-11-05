/**
 * Full pipe execution integration tests.
 */

import { describe, it, expect } from 'vitest';
import { runPipe } from '../../src/index.js';

function node(id: string, type: string, config: any = {}) {
  return { id, type, config };
}

function edge(source: string, target: string) {
  return { id: `${source}-${target}`, source, target };
}

describe('runPipe integration', () => {
  it('executes fetch -> filter -> sort -> truncate', async () => {
    const seedItems = [
      { id: '1', title: 'Apple', category: 'fruit', value: 3 },
      { id: '2', title: 'Banana', category: 'fruit', value: 1 },
      { id: '3', title: 'Carrot', category: 'vegetable', value: 2 },
      { id: '4', title: 'Date', category: 'fruit', value: 4 },
      { id: '5', title: 'Eggplant', category: 'vegetable', value: 5 },
    ];

    const pipe = {
      id: 'integration',
      name: 'Integration Test',
      nodes: [
        node('fetch', 'fetch-json', { itemsOverride: seedItems }),
        node('filter', 'filter', { field: 'category', op: 'equals', value: 'fruit' }),
        node('sort', 'sort', { field: 'value', order: 'desc' }),
        node('truncate', 'truncate', { limit: 2 }),
      ],
      edges: [
        edge('fetch', 'filter'),
        edge('filter', 'sort'),
        edge('sort', 'truncate'),
      ],
    };

    const result = await runPipe(pipe);

    // Should have 2 fruit items, sorted by value descending
    expect(result.output.length).toBe(2);
    expect(result.output[0].value).toBeGreaterThanOrEqual(result.output[1].value);
    
    // All should be fruits
    expect(result.output.every(i => i.category === 'fruit')).toBe(true);
  });

  it('executes fetch -> merge -> filter', async () => {
    const items1 = [
      { id: '1', title: 'One', value: 1 },
      { id: '2', title: 'Two', value: 2 },
    ];
    const items2 = [
      { id: '3', title: 'Three', value: 3 },
      { id: '4', title: 'Four', value: 4 },
    ];

    const pipe = {
      id: 'merge',
      name: 'Merge Test',
      nodes: [
        node('fetch1', 'fetch-json', { itemsOverride: items1 }),
        node('fetch2', 'fetch-json', { itemsOverride: items2 }),
        node('merge', 'merge', { uniqueById: true }),
        node('filter', 'filter', { field: 'value', op: 'gt', value: 2 }),
      ],
      edges: [
        edge('fetch1', 'merge'),
        edge('fetch2', 'merge'),
        edge('merge', 'filter'),
      ],
    };

    const result = await runPipe(pipe);

    // Values 3 and 4 are both > 2
    expect(result.output.length).toBe(2);
    expect(result.output.map(i => i.title).sort()).toEqual(['Four', 'Three']);
  });

  it('executes with regex transformation', async () => {
    const seedItems = [
      { id: '1', title: 'Hello World', link: 'https://example.com/hello' },
      { id: '2', title: 'Goodbye Moon', link: 'https://example.com/goodbye' },
    ];

    const pipe = {
      id: 'regex',
      name: 'Regex Test',
      nodes: [
        node('fetch', 'fetch-json', { itemsOverride: seedItems }),
        node('regex', 'regex', {
          field: 'link',
          pattern: 'example.com',
          replacement: 'test.com',
        }),
      ],
      edges: [edge('fetch', 'regex')],
    };

    const result = await runPipe(pipe);

    expect(result.output[0].link).toBe('https://test.com/hello');
    expect(result.output[1].link).toBe('https://test.com/goodbye');
  });

  it('executes with rename transformation', async () => {
    const seedItems = [
      { id: '1', title: 'Test', description: 'Description' },
    ];

    const pipe = {
      id: 'rename',
      name: 'Rename Test',
      nodes: [
        node('fetch', 'fetch-json', { itemsOverride: seedItems }),
        node('rename', 'rename', { mapping: { description: 'summary' } }),
      ],
      edges: [edge('fetch', 'rename')],
    };

    const result = await runPipe(pipe);

    expect(result.output[0].summary).toBe('Description');
    expect(result.output[0].description).toBeUndefined();
  });
});
