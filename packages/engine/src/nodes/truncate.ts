/**
 * Truncate node runner.
 * Limits the number of items and optionally deduplicates.
 */

import type { ArrayInput, ArrayOutput } from './types.js';
import type { TruncateConfig } from '../types.js';

/**
 * Truncate node runner implementation.
 */
export class TruncateRunner {
  private readonly config: TruncateConfig;

  constructor(config: TruncateConfig) {
    this.config = config;
  }

  /**
   * Validate the configuration.
   */
  validate(): void {
    if (this.config.limit === undefined || this.config.limit < 0) {
      throw new Error('truncate node requires non-negative "limit" configuration');
    }
  }

  /**
   * Run the truncate node.
   */
  run(input: ArrayInput): ArrayOutput {
    let items = [...input.items];

    // Deduplicate by field if configured
    if (this.config.uniqueBy) {
      const seen = new Set<unknown>();
      items = items.filter(item => {
        const val = item[this.config.uniqueBy!];
        if (seen.has(val)) {
          return false;
        }
        seen.add(val);
        return true;
      });
    }

    // Truncate to limit
    items = items.slice(0, this.config.limit);

    return { items };
  }
}

/**
 * Convenience function to run truncate.
 */
export function truncateItems(
  config: TruncateConfig,
  input: ArrayInput,
): ArrayOutput {
  const runner = new TruncateRunner(config);
  runner.validate();
  return runner.run(input);
}
