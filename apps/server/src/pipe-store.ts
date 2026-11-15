/**
 * Ephemeral pipe store with TTL, entry cap and volume cap.
 */
import type { PipeDefinition } from '@pipes/engine';
import { httpLimits } from './pipe-limits.js';

type Entry = { pipe: PipeDefinition; expires: number; bytes: number; touched: number };

export type ExportCacheEntry = { body: unknown; expires: number; origin: string };

export class EphemeralPipeStore {
  private readonly items = new Map<string, Entry>();
  private totalBytes = 0;

  get size() {
    this.prune();
    return this.items.size;
  }

  get volume() {
    this.prune();
    return this.totalBytes;
  }

  has(id: string): boolean {
    return this.get(id) != null;
  }

  get(id: string): PipeDefinition | undefined {
    this.prune();
    const entry = this.items.get(id);
    if (!entry) return undefined;
    if (entry.expires <= Date.now()) {
      this.delete(id);
      return undefined;
    }
    entry.touched = Date.now();
    return entry.pipe;
  }

  set(id: string, pipe: PipeDefinition): void {
    this.prune();
    const bytes = Buffer.byteLength(JSON.stringify(pipe));
    if (bytes > httpLimits.storeMaxBytes) {
      throw new StoreLimitError('Pipe exceeds the store volume limit');
    }
    if (this.items.has(id)) this.delete(id);
    while (
      this.items.size >= httpLimits.storeMaxEntries ||
      this.totalBytes + bytes > httpLimits.storeMaxBytes
    ) {
      const evicted = this.oldestId();
      if (!evicted) break;
      this.delete(evicted);
    }
    const now = Date.now();
    this.items.set(id, {
      pipe,
      bytes,
      expires: now + httpLimits.storeTtlMs,
      touched: now,
    });
    this.totalBytes += bytes;
  }

  delete(id: string): boolean {
    const entry = this.items.get(id);
    if (!entry) return false;
    this.items.delete(id);
    this.totalBytes = Math.max(0, this.totalBytes - entry.bytes);
    return true;
  }

  clear(): void {
    this.items.clear();
    this.totalBytes = 0;
  }

  values(): PipeDefinition[] {
    this.prune();
    return [...this.items.values()].map((entry) => entry.pipe);
  }

  prune(): void {
    const now = Date.now();
    for (const [id, entry] of this.items) {
      if (entry.expires <= now) this.delete(id);
    }
  }

  private oldestId(): string | undefined {
    let oldest: { id: string; touched: number } | undefined;
    for (const [id, entry] of this.items) {
      if (!oldest || entry.touched < oldest.touched) oldest = { id, touched: entry.touched };
    }
    return oldest?.id;
  }
}

export class StoreLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoreLimitError';
  }
}

export function pruneExportCache(cache: Map<string, ExportCacheEntry>, maxEntries = 100): void {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expires <= now) cache.delete(key);
  }
  if (cache.size <= maxEntries) return;
  const ordered = [...cache.entries()].sort((a, b) => a[1].expires - b[1].expires);
  for (const [key] of ordered.slice(0, cache.size - maxEntries)) {
    cache.delete(key);
  }
}
