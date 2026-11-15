/**
 * Rename node runner.
 * Renames fields in items.
 */

import type { ArrayInput, ArrayOutput } from './types.js';
import type { PipeItem, RenameConfig } from '../types.js';

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
    const items: PipeItem[] = input.items.map((item) => {
      const newItem: PipeItem = { ...item };

      // Copy fields, renaming as configured
      for (const [oldKey, newKey] of Object.entries(this.config.mapping)) {
        if (oldKey in item) {
          (newItem as Record<string, unknown>)[newKey] = item[oldKey];
          if (oldKey !== newKey) {
            delete (newItem as Record<string, unknown>)[oldKey];
          }
        }
      }

      if (typeof newItem.id !== 'string') newItem.id = String(newItem.id ?? '');
      if (typeof newItem.title !== 'string') newItem.title = String(newItem.title ?? '');
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
