/**
 * Robustness tests for malformed XML/JSON.
 */

import { describe, it, expect } from 'vitest';
import { parseRssFeed, parseJsonToItems, itemsToRss20, itemsToJson } from '../src/index.js';

describe('parseRssFeed', () => {
  it('handles completely broken XML', () => {
    const result = parseRssFeed('this is not xml at all!');
    expect(result).toEqual([]);
  });

  it('handles XML with unclosed tags', () => {
    const result = parseRssFeed('<rss><channel><item><title>test</title>');
    // Should not crash, returns empty or partial
    expect(Array.isArray(result)).toBe(true);
  });

  it('handles empty string', () => {
    const result = parseRssFeed('');
    expect(result).toEqual([]);
  });

  it('handles null/undefined', () => {
    // @ts-expect-error testing runtime handling
    const result = parseRssFeed(null);
    expect(result).toEqual([]);
  });
});

describe('parseJsonToItems', () => {
  it('handles completely broken JSON', () => {
    // @ts-expect-error testing runtime handling
    const result = parseJsonToItems('not json');
    expect(result).toEqual([]);
  });

  it('handles empty object', () => {
    const result = parseJsonToItems({});
    expect(result).toEqual([]);
  });

  it('handles empty array', () => {
    const result = parseJsonToItems([]);
    expect(result).toEqual([]);
  });
});

describe('itemsToRss20', () => {
  it('handles empty items', () => {
    const xml = itemsToRss20([]);
    expect(xml).toContain('<rss');
    expect(xml).toContain('</rss>');
  });

  it('handles items with missing fields', () => {
    const items = [{ id: '1', title: 'Test' }];
    const xml = itemsToRss20(items);
    expect(xml).toContain('Test');
    expect(xml).toContain('pipes-from-the-grave');
  });

  it('generates valid RSS with channel metadata', () => {
    const items = [{ id: '1', title: 'Test', summary: 'Summary' }];
    const xml = itemsToRss20(items, {
      title: 'My Feed',
      link: 'http://example.com',
      description: 'A test feed',
    });
    
    expect(xml).toContain('<title>My Feed</title>');
    expect(xml).toContain('<link>http://example.com</link>');
  });
});

describe('itemsToJson', () => {
  it('handles empty items', () => {
    const json = itemsToJson([]);
    expect(json).toBe('[]');
  });

  it('handles items with extra fields', () => {
    const items = [
      {
        id: '1',
        title: 'Test',
        extraField1: 'value1',
        extraField2: 'value2',
      },
    ];
    
    const json = itemsToJson(items);
    const parsed = JSON.parse(json);
    
    expect(parsed[0].extraField1).toBe('value1');
    expect(parsed[0].extraField2).toBe('value2');
  });
});
