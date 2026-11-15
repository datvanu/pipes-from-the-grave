/**
 * Ghost prompt parsing: trailing punctuation on URLs, default demo sentence, unrecognized keywords.
 */
import { describe, expect, it } from 'vitest';
import { buildPipeFromPrompt, extractPromptUrl, nameFromPrompt } from '../src/ghost.js';

const DEFAULT_PROMPT =
  'Fetch RSS from https://www.rfc-editor.org/rfcrss.xml then sort and keep the top 5';

describe('extractPromptUrl', () => {
  it('strips a trailing comma from a URL', () => {
    expect(
      extractPromptUrl('Fetch RSS from https://www.rfc-editor.org/rfcrss.xml, sort, top 5'),
    ).toBe('https://www.rfc-editor.org/rfcrss.xml');
  });

  it('strips other trailing punctuation', () => {
    expect(extractPromptUrl('see https://example.com/feed.xml.')).toBe('https://example.com/feed.xml');
    expect(extractPromptUrl('see https://example.com/feed.xml)')).toBe('https://example.com/feed.xml');
    expect(extractPromptUrl('see https://example.com/feed.xml; next')).toBe('https://example.com/feed.xml');
    expect(extractPromptUrl('see https://example.com/feed.xml!')).toBe('https://example.com/feed.xml');
  });

  it('keeps a clean URL unchanged', () => {
    expect(extractPromptUrl(DEFAULT_PROMPT)).toBe('https://www.rfc-editor.org/rfcrss.xml');
  });
});

describe('buildPipeFromPrompt', () => {
  it('builds a runnable pipe from the default demo sentence without a trailing comma on the URL', () => {
    const result = buildPipeFromPrompt(DEFAULT_PROMPT);
    expect(result.recognized).toBe(true);
    const fetch = result.pipe.nodes.find((n) => n.type === 'fetch-rss');
    expect(fetch?.config.url).toBe('https://www.rfc-editor.org/rfcrss.xml');
    expect(String(fetch?.config.url)).not.toMatch(/,$/);
    expect(result.pipe.nodes.some((n) => n.type === 'sort')).toBe(true);
    expect(result.pipe.nodes.some((n) => n.type === 'truncate' && n.config.limit === 5)).toBe(true);
    expect(result.pipe.name).toBe('RFC feed, top 5');
  });

  it('does not claim success when no keywords are recognized', () => {
    const result = buildPipeFromPrompt('hello world please make something beautiful');
    expect(result.recognized).toBe(false);
    expect(result.explanation[0]).toMatch(/simple keywords in demo mode/);
    expect(result.explanation.join(' ')).not.toMatch(/Pipes assembled/);
    expect(result.pipe.nodes.some((n) => n.type === 'fetch-rss')).toBe(true);
  });
});

describe('nameFromPrompt', () => {
  it('keeps names short and readable', () => {
    expect(nameFromPrompt(DEFAULT_PROMPT)).toBe('RFC feed, top 5');
  });
});
