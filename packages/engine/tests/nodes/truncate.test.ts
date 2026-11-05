/**
 * Truncate node property-based tests.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { truncateItems } from '../../src/nodes/truncate.js';

describe('truncateItems', () => {
  it('limits to specified count', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ id: fc.string(), value: fc.integer() })),
        fc.integer({ min: 0, max: 10 }),
        (items, limit) => {
          const config = { limit };
          const result = truncateItems(config, { items });
          
          expect(result.items.length).toBeLessThanOrEqual(limit);
        },
      ),
    );
  });

  it('idempotent when no limit changes', () => {
    const items = [
      { id: '1', value: 1 },
      { id: '2', value: 2 },
      { id: '3', value: 3 },
    ];

    const config = { limit: 10 };
    const result1 = truncateItems(config, { items });
    const result2 = truncateItems(config, { items: result1.items });

    expect(result2.items).toEqual(result1.items);
  });

  it('idempotent with uniqueById', () => {
    const items = [
      { id: '1', value: 1 },
      { id: '2', value: 2 },
      { id: '1', value: 3 }, // Duplicate ID
    ];

    const config = { limit: 10, uniqueBy: 'id' };
    const result1 = truncateItems(config, { items });
    const result2 = truncateItems(config, { items: result1.items });

    expect(result2.items).toEqual(result1.items);
  });

  it('deduplicates by field when uniqueBy is set', () => {
    const items = [
      { id: '1', title: 'A' },
      { id: '2', title: 'B' },
      { id: '3', title: 'A' }, // Duplicate title
    ];

    const config = { limit: 10, uniqueBy: 'title' };
    const result = truncateItems(config, { items });

    // Should only have unique titles
    const titles = result.items.map(i => i.title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});
