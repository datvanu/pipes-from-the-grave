/**
 * FetchRSS node runner.
 * Fetches RSS/Atom feeds from a URL and converts to PipeItems.
 */

import { XMLParser } from 'fast-xml-parser';
import type { RunPipeOptions, PipeItem } from '../types.js';
import type { ArrayInput, ArrayOutput } from './types.js';
import { assertSafeUrl } from '../ssrf.js';
import { safeFetch } from '../fetch-safe.js';

/**
 * Configuration for fetch-rss node.
 */
export interface FetchRssConfig {
  url?: string;
  itemsOverride?: PipeItem[]; // For testing
}

/** Normalize parser nodes that may be string or { _text }. */
function textOf(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    if ('_text' in obj) return String(obj._text ?? '');
    if ('__cdata' in obj) return String(obj.__cdata ?? '');
    if ('#text' in obj) return String(obj['#text'] ?? '');
  }
  return '';
}

/**
 * Parse RSS/Atom XML to PipeItems.
 */
export const MAX_FEED_ITEMS = 500;

export function parseRssFeed(xml: string): PipeItem[] {
  if (typeof xml === 'string' && xml.length > 2 * 1024 * 1024) {
    return [];
  }
  const parser = new XMLParser({
    attributeNamePrefix: '',
    textNodeName: '_text',
    ignoreAttributes: false,
    allowBooleanAttributes: true,
    processEntities: false,
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

    return items.slice(0, MAX_FEED_ITEMS).map((item: any) => ({
      id: textOf(item.guid) || textOf(item.link) || textOf(item.title),
      title: textOf(item.title),
      link: textOf(item.link) || (typeof item.link === 'object' ? item.link?.href || '' : ''),
      summary: textOf(item.description) || textOf(item.summary),
      published: textOf(item.pubDate) || textOf(item.updated),
      author: textOf(item.author) || textOf(item['dc:creator']),
      tags: item.category
        ? Array.isArray(item.category)
          ? item.category.map((c: any) => textOf(c) || c?.term || String(c))
          : [textOf(item.category) || item.category?.term || String(item.category)]
        : [],
    }));
  }

  // Handle Atom format
  if (result?.feed?.entry) {
    const entries = Array.isArray(result.feed.entry)
      ? result.feed.entry
      : [result.feed.entry];

    return entries.slice(0, MAX_FEED_ITEMS).map((entry: any) => {
      const link = Array.isArray(entry.link)
        ? (entry.link.find((l: any) => l.rel === 'alternate') || entry.link[0])
        : entry.link;
      return {
        id: textOf(entry.id) || (typeof link === 'object' ? link?.href || '' : textOf(link)),
        title: textOf(entry.title),
        link: typeof link === 'object' ? link?.href || '' : textOf(link),
        summary: textOf(entry.summary) || textOf(entry.content),
        published: textOf(entry.published) || textOf(entry.updated),
        author: textOf(entry.author?.name) || textOf(entry.author),
        tags: entry.category
          ? Array.isArray(entry.category)
            ? entry.category.map((c: any) => c.term || textOf(c) || '')
            : [entry.category.term || textOf(entry.category) || '']
          : [],
      };
    });
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

    const url = this.config.url;
    if (!url) {
      throw new Error('fetch-rss node requires "url" or "itemsOverride"');
    }

    // Fetch the feed
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
      throw new Error(`Failed to fetch feed: ${response.status}`);
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
