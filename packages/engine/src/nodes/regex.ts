/**
 * Regex node runner.
 * Applies regex replacement to a field.
 */

import type { ArrayInput, ArrayOutput } from './types.js';
import type { RegexConfig } from '../types.js';

/**
 * Regex node runner implementation.
 */
export class RegexRunner {
  private readonly config: RegexConfig;

  constructor(config: RegexConfig) {
    this.config = config;
  }

  /**
   * Validate the configuration.
   */
  validate(): void {
    if (!this.config.field) {
      throw new Error('regex node requires "field" configuration');
    }
    
    if (!this.config.pattern) {
      throw new Error('regex node requires "pattern" configuration');
    }
  }

  /**
   * Apply regex replacement to a value.
   */
  replace(value: string): string {
    try {
      const regex = new RegExp(this.config.pattern, this.config.flags);
      return value.replace(regex, this.config.replacement);
    } catch {
      // If regex is invalid, return original value
      return value;
    }
  }

  /**
   * Run the regex node.
   */
  run(input: ArrayInput): ArrayOutput {
    const items = input.items.map(item => {
      const newValue = item[this.config.field];
      
      if (newValue === undefined || newValue === null) {
        return item;
      }

      return {
        ...item,
        [this.config.field]: this.replace(String(newValue)),
      };
    });

    return { items };
  }
}

/**
 * Convenience function to run regex.
 */
export function regexReplace(
  config: RegexConfig,
  input: ArrayInput,
): ArrayOutput {
  const runner = new RegexRunner(config);
  runner.validate();
  return runner.run(input);
}
