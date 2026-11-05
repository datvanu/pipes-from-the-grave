/**
 * OutputJSON node runner.
 * Pass-through for pipeline items; use serialize.itemsToJson for HTTP export.
 */

import type { ArrayInput, ArrayOutput } from './types.js';

export interface OutputJsonConfig {
  pretty?: boolean;
}

export class OutputJsonRunner {
  private readonly config: OutputJsonConfig;

  constructor(config: OutputJsonConfig = {}) {
    this.config = config;
  }

  validate(): void {}

  run(input: ArrayInput): ArrayOutput {
    return { items: input.items.map((item) => ({ ...item })) };
  }
}

export function outputJson(
  input: ArrayInput,
  config?: OutputJsonConfig,
): ArrayOutput {
  const runner = new OutputJsonRunner(config);
  runner.validate();
  return runner.run(input);
}
