/**
 * OutputRSS node runner.
 * Pass-through for pipeline items; use serialize.itemsToRss20 for HTTP export.
 */

import type { ArrayInput, ArrayOutput } from './types.js';

export interface OutputRssConfig {
  title?: string;
  link?: string;
  description?: string;
}

export class OutputRssRunner {
  private readonly config: OutputRssConfig;

  constructor(config: OutputRssConfig = {}) {
    this.config = config;
  }

  validate(): void {}

  run(input: ArrayInput): ArrayOutput {
    return { items: input.items.map((item) => ({ ...item })) };
  }
}

export function outputRss(
  input: ArrayInput,
  config?: OutputRssConfig,
): ArrayOutput {
  const runner = new OutputRssRunner(config);
  runner.validate();
  return runner.run(input);
}
