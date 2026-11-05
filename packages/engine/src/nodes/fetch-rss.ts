/**
 * FetchRSS node runner.
 * Fetches RSS/Atom feeds from a URL and converts to PipeItems.
 */

import { XMLParser } from 'fast-xml-parser';
import type { RunPipeOptions, PipeItem } from '../types.js';
import type { ArrayInput, ArrayOutput } from './types.js';
import { assertSafeUrl } from '../ssrf.js';

/**
 * Configuration for fetch-rss node.
 */
export interface FetchRssConfig {
  url: string;
  itemsOverride?: PipeItem[]; // For testing
}

/**
 * Parse RSS/Atom XML to PipeItems.
 */
export function parseRssFeed(xml: string): PipeItem[] {
  const parser = new XMLParser({
    attributeNamePrefix: '',
    textNodeName: '_text',
    ignoreAttributes: false,
    allowBooleanAttributes: true,
  });

  let result;
  try {
    result = parser.parse(xml);
  } catch (e) {
    return [];
  }

  // Handle RSS 2.0 format
  if (result?.rss?.channel?.item) {
    const items = Array.isArray(result.rss.channel.item)
      ? result.rss.channel.item
      : [result.rss.channel.item];

    return items.map((item: any) => ({
      id: item.guid?._text || item.link || '',
      title: item.title?._text || '',
      link: item.link || '',
      summary: item.description?._text || item.summary?._text || '',
      published: item.pubDate?._text || item.updated?._text || '',
      author: item.author?._text || item['dc:creator']?._text || '',
      tags: item.category
        ? Array.isArray(item.category)
          ? item.category.map((c: any) => c._text || c)
          : [item.category]
        : [],
    }));
  }

  // Handle Atom format
  if (result?.feed?.entry) {
    const entries = Array.isArray(result.feed.entry)
      ? result.feed.entry
      : [result.feed.entry];

    return entries.map((entry: any) => ({
      id: entry.id?._text || entry.link?.href || '',
      title: entry.title?._text || '',
      link: entry.link?.href || '',
      summary: entry.summary?._text || '',
      published: entry.published?._text || '',
      author: entry.author?.name?._text || '',
      tags: entry.category
        ? Array.isArray(entry.category)
          ? entry.category.map((c: any) => c.term || '')
          : [entry.category.term || '']
        : [],
    }));
  }

  return [];
}

/**
 * FetchRSS node runner implementation.
 */
export class FetchRssRunner {
  private readonly config: FetchRssConfig;

  constructor(config: FetchRssConfig) {
    this.config = config;
  }

  /**
   * Validate the configuration.
   */
  validate(): void {
    if (this.config.itemsOverride) {
      return;
    }

    if (!this.config.url) {
      throw new Error('fetch-rss node requires "url" configuration');
    }

    assertSafeUrl(this.config.url);
  }

  /**
   * Run the fetch-rss node.
   * Returns items from the fetched feed or override.
   */
  async run(options?: RunPipeOptions): Promise<PipeItem[]> {
    // Use override for testing
    if (this.config.itemsOverride) {
      return this.config.itemsOverride;
    }

    // Fetch the feed
    const fetchFn = options?.fetchFn ?? globalThis.fetch;
    
    if (!fetchFn) {
      throw new Error('fetchFn not available');
    }

    const response = await fetchFn(this.config.url);

    if (!response.ok) {
      throw new Error(`Failed to fetch feed: ${response.status} ${response.statusText}`);
    }

    const xml = await response.text();
    return parseRssFeed(xml);
  }
}

/**
 * Convenience function to run fetch-rss.
 */
export async function fetchRss(
  config: FetchRssConfig,
  options?: RunPipeOptions,
): Promise<PipeItem[]> {
  const runner = new FetchRssRunner(config);
  runner.validate();
  return runner.run(options);
}
