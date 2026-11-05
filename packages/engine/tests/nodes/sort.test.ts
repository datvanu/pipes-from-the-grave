/**
 * Sort node property-based tests.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { sortItems } from '../../src/nodes/sort.js';

describe('sortItems', () => {
  it('sorts in ascending order', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ id: fc.string(), value: fc.integer({ min: -1000000, max: 1000000 }) })),
        (items) => {
          const config = { field: 'value', order: 'asc' };
          const result = sortItems(config, { items });
          
          // Check ascending order
          for (let i = 0; i < result.items.length - 1; i++) {
            expect(result.items[i].value).toBeLessThanOrEqual(result.items[i + 1].value);
          }
        },
      ),
    );
  });

  it('sorts in descending order', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ id: fc.string(), value: fc.integer({ min: -1000000, max: 1000000 }) })),
        (items) => {
          const config = { field: 'value', order: 'desc' };
          const result = sortItems(config, { items });
          
          // Check descending order
          for (let i = 0; i < result.items.length - 1; i++) {
            expect(result.items[i].value).toBeGreaterThanOrEqual(result.items[i + 1].value);
          }
        },
      ),
    );
  });

  it('is stable (preserves original order for equal keys)', () => {
    const items = [
      { id: '1', value: 5 },
      { id: '2', value: 3 },
      { id: '3', value: 5 },
      { id: '4', value: 3 },
    ] as const;

    const config = { field: 'value', order: 'asc' };
    const result = sortItems(config, { items });

    // Items with same value should maintain relative order
    const value5Items = result.items.filter(i => i.value === 5);
    const value3Items = result.items.filter(i => i.value === 3);

    expect(value5Items[0].id).toBe('1');
    expect(value5Items[1].id).toBe('3');
    expect(value3Items[0].id).toBe('2');
    expect(value3Items[1].id).toBe('4');
  });

  it('preserves all items (no items lost)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ id: fc.string(), value: fc.integer() })),
        (items) => {
          const config = { field: 'value', order: 'asc' };
          const result = sortItems(config, { items });
          
          expect(result.items.length).toBe(items.length);
          expect(new Set(result.items.map(i => i.id))).toEqual(new Set(items.map(i => i.id)));
        },
      ),
    );
  });
});
