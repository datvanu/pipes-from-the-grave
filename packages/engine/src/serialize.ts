/**
 * Serialization utilities for PipeItem arrays.
 * Converts to RSS 2.0 XML and JSON formats.
 */

import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import type { PipeItem } from './types.js';

/**
 * RSS 2.0 channel metadata.
 */
export interface RssChannelMeta {
  title: string;
  link: string;
  description: string;
  language?: string;
  copyright?: string;
  managingEditor?: string;
  webMaster?: string;
  pubDate?: string;
  lastBuildDate?: string;
  generator?: string;
  docs?: string;
  category?: string;
}

/**
 * Convert PipeItems to RSS 2.0 XML string.
 */
export function itemsToRss20(
  items: PipeItem[],
  channelMeta?: RssChannelMeta,
): string {
  const channel = {
    title: [{ _text: channelMeta?.title || 'Pipe Output' }],
    link: [{ _text: channelMeta?.link || '/' }],
    description: [{ _text: channelMeta?.description || 'Data from pipe' }],
    language: channelMeta?.language ? [{ _text: channelMeta.language }] : undefined,
    copyright: channelMeta?.copyright ? [{ _text: channelMeta.copyright }] : undefined,
    managingEditor: channelMeta?.managingEditor ? [{ _text: channelMeta.managingEditor }] : undefined,
    webMaster: channelMeta?.webMaster ? [{ _text: channelMeta.webMaster }] : undefined,
    pubDate: channelMeta?.pubDate ? [{ _text: channelMeta.pubDate }] : undefined,
    lastBuildDate: channelMeta?.lastBuildDate ? [{ _text: channelMeta.lastBuildDate }] : undefined,
    generator: [{ _text: channelMeta?.generator || 'pipes-from-the-grave' }],
    docs: channelMeta?.docs ? [{ _text: channelMeta.docs }] : undefined,
    category: channelMeta?.category ? [{ _text: channelMeta.category }] : undefined,
    item: items.map(item => ({
      title: [{ _text: item.title }],
      link: [{ _text: item.link }],
      description: [{ _text: item.summary }],
      author: item.author ? [{ _text: item.author }] : undefined,
      category: item.tags?.length 
        ? item.tags.map((t: string) => ({ _text: t })) 
        : undefined,
      pubDate: item.published ? [{ _text: item.published }] : undefined,
      guid: [{ _text: item.id }],
    })),
  };

  const rss = {
    rss: {
      '@_version': '2.0',
      channel: channel,
    },
  };

  const builder = new XMLBuilder({
    attributeNamePrefix: '',
    textNodeName: '_text',
    ignoreAttributes: false,
    
    format: true,
    indentBy: '  ',
  });

  return builder.build(rss);
}

/**
 * Convert PipeItems to JSON string.
 */
export function itemsToJson(items: PipeItem[]): string {
  const itemsMapped = items.map(item => ({
    id: item.id,
    title: item.title,
    link: item.link,
    summary: item.summary,
    published: item.published,
    author: item.author,
    tags: item.tags,
    ...Object.fromEntries(
      Object.entries(item).filter(([k]) => !['id', 'title', 'link', 'summary', 'published', 'author', 'tags'].includes(k))
    ),
  }));

  return JSON.stringify(itemsMapped, null, 2);
}

/**
 * Parse RSS XML string to PipeItems.
 */
export function rss20ToItems(xml: string): PipeItem[] {
  const parser = new XMLBuilder({
    attributeNamePrefix: '',
    textNodeName: '_text',
    ignoreAttributes: false,
  });

  let result;
  try {
    result = new XMLParser().parse(xml);
  } catch {
    return [];
  }

  if (!result?.rss?.channel?.item) {
    return [];
  }

  const items = Array.isArray(result.rss.channel.item)
    ? result.rss.channel.item
    : [result.rss.channel.item];

  return items.map((item: any) => ({
    id: item.guid?._text || item.link || '',
    title: item.title?._text || '',
    link: item.link || '',
    summary: item.description?._text || '',
    published: item.pubDate?._text || '',
    author: item.author?._text || '',
    tags: item.category
      ? Array.isArray(item.category)
        ? item.category.map((c: any) => c._text || c)
        : [item.category]
      : [],
  }));
}
