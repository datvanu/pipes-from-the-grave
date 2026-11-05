/**
 * Rename node runner.
 * Renames fields in items.
 */

import type { ArrayInput, ArrayOutput } from './types.js';
import type { RenameConfig } from '../types.js';

/**
 * Rename node runner implementation.
 */
export class RenameRunner {
  private readonly config: RenameConfig;

  constructor(config: RenameConfig) {
    this.config = config;
  }

  /**
   * Validate the configuration.
   */
  validate(): void {
    if (!this.config.mapping || Object.keys(this.config.mapping).length === 0) {
      throw new Error('rename node requires "mapping" configuration');
    }
  }

  /**
   * Run the rename node.
   */
  run(input: ArrayInput): ArrayOutput {
    const items = input.items.map(item => {
      const newItem: Record<string, unknown> = {};
      
      // Copy fields, renaming as configured
      for (const [oldKey, newKey] of Object.entries(this.config.mapping)) {
        if (oldKey in item) {
          newItem[newKey] = item[oldKey];
        }
      }
      
      // Copy fields not in mapping
      for (const key of Object.keys(item)) {
        if (!(key in this.config.mapping)) {
          newItem[key] = item[key];
        }
      }
      
      return newItem;
    });

    return { items };
  }
}

/**
 * Convenience function to run rename.
 */
export function renameFields(
  config: RenameConfig,
  input: ArrayInput,
): ArrayOutput {
  const runner = new RenameRunner(config);
  runner.validate();
  return runner.run(input);
}
