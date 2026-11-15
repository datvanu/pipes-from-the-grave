/**
 * FetchJSON node runner.
 * Fetches JSON data from a URL and converts to PipeItems.
 */

import type { RunPipeOptions, PipeItem } from '../types.js';
import type { ArrayInput, ArrayOutput } from './types.js';
import { assertSafeUrl } from '../ssrf.js';
import { safeFetch } from '../fetch-safe.js';
import { MAX_FEED_ITEMS } from './fetch-rss.js';

/**
 * Configuration for fetch-json node.
 */
export interface FetchJsonConfig {
  url?: string;
  itemsOverride?: PipeItem[]; // For testing
  mapping?: Record<string, string>; // Map JSON fields to PipeItem fields
}

/**
 * Default mapping from common JSON fields to PipeItem fields.
 */
const DEFAULT_MAPPING: Record<string, string> = {
  id: 'id',
  title: 'title',
  link: 'link',
  url: 'link',
  description: 'summary',
  summary: 'summary',
  published: 'published',
  date: 'published',
  author: 'author',
  tags: 'tags',
  categories: 'tags',
};

/**
 * Parse JSON to PipeItems.
 * Handles: array of objects, object with items array.
 */
export function parseJsonToItems(json: unknown, mapping?: Record<string, string>): PipeItem[] {
  // Empty object should return empty array
  if (json === null || json === undefined) {
    return [];
  }
  
  if (typeof json !== 'object') {
    return [];
  }

  let items: unknown[] = [];

  if (Array.isArray(json)) {
    items = json;
  } else if ('items' in json && Array.isArray(json.items)) {
    items = json.items;
  } else if (Object.keys(json as object).length > 0) {
    // Non-empty object - wrap in array
    items = [json];
  }
  // Empty object returns empty array

  const fieldMap = { ...DEFAULT_MAPPING, ...(mapping || {}) };

  return items.slice(0, MAX_FEED_ITEMS).map((item: any) => {
    const result: Record<string, unknown> = {};

    // Map known fields
    for (const [jsonKey, pipeKey] of Object.entries(fieldMap)) {
      if (jsonKey in item) {
        result[pipeKey] = item[jsonKey];
      }
    }

    // Keep any additional fields
    for (const key of Object.keys(item)) {
      if (!(key in fieldMap)) {
        result[key] = item[key];
      }
    }

    // Ensure required fields have defaults
    if (!result.id && result.title) {
      result.id = String(result.title);
    }

    return result as PipeItem;
  });
}

/**
 * FetchJSON node runner implementation.
 */
export class FetchJsonRunner {
  private readonly config: FetchJsonConfig;

  constructor(config: FetchJsonConfig) {
    this.config = config;
  }

  /**
   * Validate the configuration.
   */
  validate(): void {
    // Testing override: no network URL required
    if (this.config.itemsOverride) {
      return;
    }

    if (!this.config.url) {
      throw new Error('fetch-json node requires "url" configuration');
    }

    assertSafeUrl(this.config.url);
  }

  /**
   * Run the fetch-json node.
   * Returns items from the fetched JSON or override.
   */
  async run(options?: RunPipeOptions): Promise<PipeItem[]> {
    // Use override for testing
    if (this.config.itemsOverride) {
      return this.config.itemsOverride;
    }

    const url = this.config.url;
    if (!url) {
      throw new Error('fetch-json node requires "url" or "itemsOverride"');
    }

    // Fetch the JSON
    const fetchFn = options?.fetchFn ?? globalThis.fetch;
    
    if (!fetchFn) {
      throw new Error('fetchFn not available');
    }

    const response = await safeFetch(url, {
      fetchFn: fetchFn as typeof fetch,
      lookup: options?.lookupFn,
      signal: options?.signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch JSON: ${response.status}`);
    }

    const json = await response.json();
    return parseJsonToItems(json, this.config.mapping);
  }
}

/**
 * Convenience function to run fetch-json.
 */
export async function fetchJson(
  config: FetchJsonConfig,
  options?: RunPipeOptions,
): Promise<PipeItem[]> {
  const runner = new FetchJsonRunner(config);
  runner.validate();
  return runner.run(options);
}
