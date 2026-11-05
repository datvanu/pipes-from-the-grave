/**
 * Sort node runner.
 * Sorts items by a field.
 */

import type { ArrayInput, ArrayOutput } from './types.js';
import type { SortConfig } from '../types.js';

/**
 * Sort node runner implementation.
 */
export class SortRunner {
  private readonly config: SortConfig;

  constructor(config: SortConfig) {
    this.config = config;
  }

  /**
   * Validate the configuration.
   */
  validate(): void {
    if (!this.config.field) {
      throw new Error('sort node requires "field" configuration');
    }
    
    if (!this.config.order) {
      throw new Error('sort node requires "order" configuration');
    }
  }

  /**
   * Compare two items by the configured field.
   */
  compare(a: any, b: any): number {
    const valA = a[this.config.field];
    const valB = b[this.config.field];

    // Handle undefined/null values
    if (valA === undefined || valA === null) {
      return 1;
    }
    if (valB === undefined || valB === null) {
      return -1;
    }

    // Try numeric comparison first
    const numA = Number(valA);
    const numB = Number(valB);
    
    if (!isNaN(numA) && !isNaN(numB)) {
      if (numA < numB) return this.config.order === 'asc' ? -1 : 1;
      if (numA > numB) return this.config.order === 'asc' ? 1 : -1;
      return 0;
    }

    // Fall back to string comparison
    const strA = String(valA).toLowerCase();
    const strB = String(valB).toLowerCase();

    if (strA < strB) {
      return this.config.order === 'asc' ? -1 : 1;
    }
    if (strA > strB) {
      return this.config.order === 'asc' ? 1 : -1;
    }
    return 0;
  }

  /**
   * Run the sort node.
   * Uses stable sort (Array.prototype.sort is stable in modern JS engines).
   */
  run(input: ArrayInput): ArrayOutput {
    // Clone to avoid mutating input
    const items = [...input.items];
    
    // Stable sort
    items.sort((a, b) => this.compare(a, b));
    
    return { items };
  }
}

/**
 * Convenience function to run sort.
 */
export function sortItems(
  config: SortConfig,
  input: ArrayInput,
): ArrayOutput {
  const runner = new SortRunner(config);
  runner.validate();
  return runner.run(input);
}
