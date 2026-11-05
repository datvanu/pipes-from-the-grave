/**
 * Merge node runner.
 * Merges multiple item arrays into one.
 */

import type { ArrayInput, ArrayOutput, MergeInput } from './types.js';
import type { MergeConfig } from '../types.js';

/**
 * Merge node runner implementation.
 */
export class MergeRunner {
  private readonly config: MergeConfig;

  constructor(config: MergeConfig = {}) {
    this.config = config;
  }

  /**
   * Validate the configuration (no specific validation needed).
   */
  validate(): void {
    // No validation required
  }

  /**
   * Run the merge node.
   * Union of all input arrays.
   */
  run(input: MergeInput): ArrayOutput {
    const allItems: any[] = [];
    const seenIds = new Set<string>();

    for (const items of input.items) {
      for (const item of items) {
        if (this.config.uniqueById) {
          const id = String(item.id);
          if (!seenIds.has(id)) {
            seenIds.add(id);
            allItems.push(item);
          }
        } else {
          allItems.push(item);
        }
      }
    }

    return { items: allItems };
  }
}

/**
 * Convenience function to run merge.
 */
export function mergeItems(
  input: MergeInput,
  config?: MergeConfig,
): ArrayOutput {
  const runner = new MergeRunner(config);
  runner.validate();
  return runner.run(input);
}
