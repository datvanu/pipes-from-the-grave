/**
 * Ephemeral store caps and TTL.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { PipeDefinition } from '@pipes/engine';
import { httpLimits } from '../src/pipe-limits.js';
import { EphemeralPipeStore, StoreLimitError, pruneExportCache } from '../src/pipe-store.js';

const pipe = (id: string, name = id): PipeDefinition => ({
  id,
  name,
  nodes: [{ id: 'n1', type: 'output-json', config: {} }],
  edges: [],
});

describe('EphemeralPipeStore', () => {
  const original = { ...httpLimits };

  afterEach(() => {
    Object.assign(httpLimits, original);
  });

  it('expires entries after the TTL', async () => {
    httpLimits.storeTtlMs = 20;
    const store = new EphemeralPipeStore();
    store.set('a', pipe('a'));
    expect(store.get('a')?.name).toBe('a');
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(store.get('a')).toBeUndefined();
  });

  it('evicts the least recently used entry when the entry cap is reached', async () => {
    httpLimits.storeMaxEntries = 2;
    const store = new EphemeralPipeStore();
    store.set('a', pipe('a'));
    store.set('b', pipe('b'));
    await new Promise((resolve) => setTimeout(resolve, 5));
    store.get('a');
    store.set('c', pipe('c'));
    expect(store.has('a')).toBe(true);
    expect(store.has('b')).toBe(false);
    expect(store.has('c')).toBe(true);
  });

  it('rejects a single pipe that exceeds the volume cap', () => {
    httpLimits.storeMaxBytes = 16;
    const store = new EphemeralPipeStore();
    expect(() => store.set('huge', pipe('huge', 'x'.repeat(80)))).toThrow(StoreLimitError);
  });

  it('prunes expired export cache entries regardless of map size', () => {
    const cache = new Map([
      ['old', { body: 'a', expires: Date.now() - 1, origin: 'relative' }],
      ['fresh', { body: 'b', expires: Date.now() + 60_000, origin: 'relative' }],
    ]);
    pruneExportCache(cache, 100);
    expect(cache.has('old')).toBe(false);
    expect(cache.has('fresh')).toBe(true);
  });
});
