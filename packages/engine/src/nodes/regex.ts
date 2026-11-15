/**
 * Regex node runner.
 * Applies regex replacement to a field.
 */

import type { ArrayInput, ArrayOutput } from './types.js';
import type { RegexConfig } from '../types.js';
import { compileSafeRegex, safeRegexReplace } from '../safe-regex.js';

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
    compileSafeRegex(this.config.pattern, this.config.flags, { allowGlobal: true });
  }

  /**
   * Apply regex replacement to a value.
   */
  replace(value: string): string {
    return safeRegexReplace(this.config.pattern, this.config.flags, value, this.config.replacement ?? '');
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
