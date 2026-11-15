/**
 * Filter node runner.
 * Filters items based on field matching.
 */

import type { ArrayInput, ArrayOutput } from './types.js';
import type { FilterConfig } from '../types.js';
import { RegexDeniedError, safeRegexTest } from '../safe-regex.js';

/**
 * Filter node runner implementation.
 */
export class FilterRunner {
  private readonly config: FilterConfig;

  constructor(config: FilterConfig) {
    this.config = config;
  }

  /**
   * Validate the configuration.
   */
  validate(): void {
    if (!this.config.field) {
      throw new Error('filter node requires "field" configuration');
    }
    
    if (!this.config.op) {
      throw new Error('filter node requires "op" configuration');
    }
    
    if (this.config.op === 'regex' && !this.config.value) {
      throw new Error('filter with regex op requires "value" for pattern');
    }
  }

  /**
   * Check if a single item matches the filter.
   */
  matches(item: any): boolean {
    const value = item[this.config.field];
    
    if (value === undefined || value === null) {
      return false;
    }

    const strValue = String(value).toLowerCase();
    const strFilter = String(this.config.value).toLowerCase();

    switch (this.config.op) {
      case 'equals':
        return strValue === strFilter;
      
      case 'contains':
        return strValue.includes(strFilter);
      
      case 'regex':
        try {
          return safeRegexTest(this.config.value, 'i', String(value));
        } catch (err) {
          if (err instanceof RegexDeniedError) return false;
          return false;
        }

      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte': {
        const left = Number(value);
        const right = Number(this.config.value);
        if (Number.isNaN(left) || Number.isNaN(right)) return false;
        if (this.config.op === 'gt') return left > right;
        if (this.config.op === 'gte') return left >= right;
        if (this.config.op === 'lt') return left < right;
        return left <= right;
      }
      
      default:
        return false;
    }
  }

  /**
   * Run the filter node.
   */
  run(input: ArrayInput): ArrayOutput {
    return {
      items: input.items.filter(item => this.matches(item)),
    };
  }
}

/**
 * Convenience function to run filter.
 */
export function filterItems(
  config: FilterConfig,
  input: ArrayInput,
): ArrayOutput {
  const runner = new FilterRunner(config);
  runner.validate();
  return runner.run(input);
}
