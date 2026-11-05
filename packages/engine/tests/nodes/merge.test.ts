/**
 * Merge node property-based tests.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { mergeItems } from '../../src/nodes/merge.js';

describe('mergeItems', () => {
  it('union of all input arrays', () => {
    fc.assert(
      fc.property(
        fc.array(fc.array(fc.record({ id: fc.string() }))),
        (itemArrays) => {
          const result = mergeItems({ items: itemArrays });
          
          // Total count should be sum of all arrays
          const total = itemArrays.reduce((sum, arr) => sum + arr.length, 0);
          expect(result.items.length).toBe(total);
        },
      ),
    );
  });

  it('preserves uniqueById deduplication', () => {
    const items1 = [
      { id: '1', value: 1 },
      { id: '2', value: 2 },
    ];
    const items2 = [
      { id: '2', value: 3 }, // Duplicate ID
      { id: '3', value: 4 },
    ];

    const config = { uniqueById: true };
    const result = mergeItems({ items: [items1, items2] }, config);

    // Should have 3 items (not 4), deduped by ID
    expect(result.items.length).toBe(3);
    const ids = result.items.map(i => i.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('preserves all fields from all items', () => {
    const items1 = [{ id: '1', value1: 1 }];
    const items2 = [{ id: '2', value2: 2 }];

    const result = mergeItems({ items: [items1, items2] });

    expect(result.items.length).toBe(2);
    expect(result.items.find(i => i.id === '1')?.value1).toBe(1);
    expect(result.items.find(i => i.id === '2')?.value2).toBe(2);
  });

  it('handles empty arrays', () => {
    const result = mergeItems({ items: [[], [], []] });
    expect(result.items).toEqual([]);
  });

  it('handles single array', () => {
    const items = [{ id: '1', value: 1 }];
    const result = mergeItems({ items: [items] });
    expect(result.items).toEqual(items);
  });
});
