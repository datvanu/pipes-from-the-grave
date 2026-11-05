/**
 * Shared types and utilities for node runners.
 */

import type { PipeItem } from '../types.js';

/**
 * Base runner interface for all node types.
 */
export interface NodeRunner<Input, Output> {
  validate(input: Input): void;
  run(input: Input): Output;
}

/**
 * Common input type for most nodes: array of items.
 */
export interface ArrayInput {
  items: PipeItem[];
}

/**
 * Common output type for most nodes: array of items.
 */
export interface ArrayOutput {
  items: PipeItem[];
}

/**
 * Input type for merge node: array of item arrays.
 */
export interface MergeInput {
  items: PipeItem[][];
}

/**
 * Input type for merge node: array of item arrays with optional id deduplication.
 */
export interface MergeInputWithDedupe extends MergeInput {
  uniqueById?: boolean;
}

/**
 * Utility to create a new PipeItem with additional fields.
 */
export function createItem(base: Partial<PipeItem>, extra?: Record<string, unknown>): PipeItem {
  return {
    id: base.id || '',
    title: base.title || '',
    link: base.link,
    summary: base.summary,
    published: base.published,
    author: base.author,
    tags: base.tags,
    ...(extra || {}),
  };
}

/**
 * Deep clone a PipeItem (shallow is usually enough since we mutate rarely).
 */
export function cloneItem(item: PipeItem): PipeItem {
  return { ...item };
}

/**
 * Clone an array of items.
 */
export function cloneItems(items: PipeItem[]): PipeItem[] {
  return items.map(cloneItem);
}
