/**
 * Filter node property-based tests.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { filterItems } from '../../src/nodes/filter.js';
import type { ArrayInput } from '../../src/nodes/types.js';

describe('filterItems', () => {
  it('preserves items matching equals filter', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ id: fc.string(), status: fc.string() })),
        fc.string(),
        (items, status) => {
          const config = { field: 'status', op: 'equals', value: status };
          const result = filterItems(config, { items });
          
          // All results should match the filter (equals is case-insensitive)
          expect(result.items.every(i => i.status.toLowerCase() === status.toLowerCase())).toBe(true);
          
          // Results should be subset of original
          expect(result.items.length).toBeLessThanOrEqual(items.length);
        },
      ),
    );
  });

  it('preserves items containing filter value', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ id: fc.string(), title: fc.string() })),
        // Use non-empty strings to avoid empty substring matching everything
        fc.string().filter(s => s.length > 0),
        (items, substring) => {
          const config = { field: 'title', op: 'contains', value: substring };
          const result = filterItems(config, { items });
          
          // All results should contain the substring (case-insensitive)
          expect(result.items.every(i => 
            i.title.toLowerCase().includes(substring.toLowerCase())
          )).toBe(true);
        },
      ),
    );
  });

  it('always returns a subset of original items', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ id: fc.string(), value: fc.integer() })),
        (items) => {
          const config = { field: 'value', op: 'equals', value: 'test' };
          const result = filterItems(config, { items });
          
          // Each result item should be in original
          for (const item of result.items) {
            expect(items.some(i => i.id === item.id)).toBe(true);
          }
        },
      ),
    );
  });
});
