/**
 * Ghost Builder - AI-powered pipe builder with spooky flair
 * Rule-based demo implementation (no LLM required)
 */

import type { PipeDefinition, PipeNode, PipeEdge, NodeType } from '@pipes/engine';

// Safe default RSS URL for demo purposes
const SAFE_RSS_URL = 'https://www.rfc-editor.org/rfcrss.xml';

/**
 * Spooky explanation messages (see spooky-voice.md)
 */
const EXPLANATIONS = {
  fetchRss: (url: string) =>
    url.includes('rfc-editor.org')
      ? 'Fetching the public RFC Editor feed.'
      : `Fetching the RSS feed at ${url}.`,
  fetchJson: (url: string) => `Fetching JSON from ${url}.`,
  filter: (field: string, op: string, value: string) =>
    `Keeping items whose ${field} ${op} "${value}".`,
  sort: (field: string, order: string) =>
    field === 'published' && order === 'desc'
      ? 'Sorting by published date, newest first.'
      : `Sorting by ${field} (${order}).`,
  truncate: (limit: number) => `Keeping the first ${limit} items.`,
  merge: 'Merging the streams into one list.',
  regex: (pattern: string, replacement: string) =>
    replacement
      ? `Rewriting fields with pattern "${pattern}", replaced by "${replacement}".`
      : `Rewriting fields with pattern "${pattern}".`,
  rename: (from: string, to: string) => `Renaming "${from}" to "${to}".`,
  outputJson: 'Publishing the result as JSON.',
  outputRss: 'Publishing the result as RSS.',
  complete: 'Pipes assembled. Ectoplasm humming...',
  unrecognized:
    'I only follow simple keywords in demo mode (rss, json, filter, sort, top…). Try a chip below, or add your own key for a live model.',
  error: "Something flickers... ah, an error! Let's fix it.",
};

/**
 * Rule-based pipe builder from natural language prompt
 * Maps keywords to node types
 */
/**
 * Pull an http(s) URL out of a sentence, stripping trailing punctuation
 * so "https://example.com/feed.xml," does not keep the comma.
 */
export function extractPromptUrl(prompt: string): string | null {
  const match = prompt.match(/https?:\/\/[^\s'"`<>]+/i);
  if (!match) return null;
  return match[0].replace(/[),.;:!?\]\}]+$/g, '');
}

export function nameFromPrompt(prompt: string): string {
  const lower = prompt.toLowerCase();
  const parts: string[] = [];
  if (lower.includes('rfc-editor')) parts.push('RFC feed');
  else if (/\brss\b|\bfeed\b/.test(lower)) parts.push('RSS feed');
  else if (/\bjson\b/.test(lower)) parts.push('JSON feed');
  const top = lower.match(/(?:top|first|limit)\s*(\d+)/);
  if (top) parts.push(`top ${top[1]}`);
  if (parts.length) return parts.join(', ').slice(0, 40);
  const cleaned = prompt.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
  return (cleaned.split(/[.!?]/)[0] || 'Ghost-Built Pipe').slice(0, 40) || 'Ghost-Built Pipe';
}

export type GhostBuildResult = {
  pipe: PipeDefinition;
  explanation: string[];
  recognized: boolean;
};

export function buildPipeFromPrompt(
  prompt: string,
  options?: {
    llm?: (prompt: string) => Promise<string>;
  }
): GhostBuildResult {
  const explanation: string[] = [];
  const nodes: PipeNode[] = [];
  const edges: PipeEdge[] = [];
  
  const promptLower = prompt.toLowerCase();
  let nodeIdCounter = 0;
  
  const getNextNodeId = (type: string): string => {
    nodeIdCounter++;
    return `${type}-${nodeIdCounter}`;
  };

  const promptUrl = extractPromptUrl(prompt);

  // Parse the prompt for keywords and build nodes
  let hasRss = false;
  let hasJson = false;
  let hasFilter = false;
  let hasSort = false;
  let hasTruncate = false;
  let hasMerge = false;
  let hasRegex = false;
  let hasRename = false;
  let filterValue = '';

  // Detect fetch sources
  if (promptLower.includes('rss') || promptLower.includes('feed')) {
    hasRss = true;
    const nodeId = getNextNodeId('fetch-rss');
    nodes.push({
      id: nodeId,
      type: 'fetch-rss',
      config: { url: promptUrl || SAFE_RSS_URL },
      position: { x: 80, y: 120 },
    });
    explanation.push(EXPLANATIONS.fetchRss(promptUrl || SAFE_RSS_URL));
  }

  if (promptLower.includes('json')) {
    hasJson = true;
    const nodeId = getNextNodeId('fetch-json');
    nodes.push({
      id: nodeId,
      type: 'fetch-json',
      config: { url: promptUrl || 'https://jsonplaceholder.typicode.com/posts' },
      position: { x: 80, y: 120 },
    });
    explanation.push(EXPLANATIONS.fetchJson(promptUrl || 'https://jsonplaceholder.typicode.com/posts'));
  }

  // Detect transformations
  if (promptLower.includes('filter') || 
      promptLower.includes('contain') || 
      promptLower.includes('about')) {
    hasFilter = true;
    
    // Try to extract a filter value (quoted or bare word after about/contain)
    const aboutQuoted = promptLower.match(/about\s+(['"])(.+?)\1/);
    // Match "about rust" (word after about)
    const aboutBare = promptLower.match(/about\s+([a-zA-Z0-9_-]+)/);
    const containsQuoted = promptLower.match(/contain(?:s|ing)?\s+(['"])(.+?)\1/);
    const containsBare = promptLower.match(/contain(?:s|ing)?\s+([a-zA-Z0-9_-]+)/);
    filterValue =
      aboutQuoted?.[2] ||
      containsQuoted?.[2] ||
      aboutBare?.[1] ||
      containsBare?.[1] ||
      'sample';
    
    const nodeId = getNextNodeId('filter');
    nodes.push({
      id: nodeId,
      type: 'filter',
      config: {
        field: 'title',
        op: 'contains' as const,
        value: filterValue,
      },
      position: { x: 300, y: 120 },
    });
    explanation.push(EXPLANATIONS.filter('title', 'contains', filterValue));
  }

  if (promptLower.includes('sort')) {
    hasSort = true;
    const nodeId = getNextNodeId('sort');
    nodes.push({
      id: nodeId,
      type: 'sort',
      config: {
        field: 'published',
        order: 'desc' as const,
      },
      position: { x: 300, y: 120 },
    });
    explanation.push(EXPLANATIONS.sort('published', 'desc'));
  }

  if (promptLower.includes('top') || 
      promptLower.includes('limit') || 
      promptLower.includes('first')) {
    hasTruncate = true;
    const nodeId = getNextNodeId('truncate');
    // Extract number if present (e.g., "top 5")
    const match = promptLower.match(/(?:top|first|limit)\s*(\d+)/);
    const limit = match ? parseInt(match[1], 10) : 10;
    
    nodes.push({
      id: nodeId,
      type: 'truncate',
      config: {
        limit,
        uniqueById: true,
      },
      position: { x: 300, y: 120 },
    });
    explanation.push(EXPLANATIONS.truncate(limit));
  }

  if (promptLower.includes('merge')) {
    hasMerge = true;
    const nodeId = getNextNodeId('merge');
    nodes.push({
      id: nodeId,
      type: 'merge',
      config: {
        uniqueById: true,
      },
      position: { x: 300, y: 120 },
    });
    explanation.push(EXPLANATIONS.merge);
  }

  // Detect regex transformation
  if (promptLower.includes('regex') || promptLower.includes('pattern')) {
    hasRegex = true;
    // Try to extract pattern from quotes
    const patternMatch = prompt.match(/pattern\s+(['"])(.+?)\1/);
    const pattern = patternMatch ? patternMatch[2] : '[0-9]+';
    
    const nodeId = getNextNodeId('regex');
    nodes.push({
      id: nodeId,
      type: 'regex',
      config: {
        field: 'title',
        pattern,
        replacement: '',
      },
      position: { x: 300, y: 120 },
    });
    explanation.push(EXPLANATIONS.regex(pattern, ''));
  }

  // Detect rename transformation
  if (promptLower.includes('rename') || promptLower.includes('map field')) {
    hasRename = true;
    // Try to extract "rename foo to bar" pattern
    const renameMatch = promptLower.match(/rename\s+['"]?([a-zA-Z0-9_]+)['"]?\s+to\s+['"]?([a-zA-Z0-9_]+)['"]?/);
    const fromField = renameMatch ? renameMatch[1] : 'oldField';
    const toField = renameMatch ? renameMatch[2] : 'newField';
    
    const nodeId = getNextNodeId('rename');
    nodes.push({
      id: nodeId,
      type: 'rename',
      config: {
        mapping: { [fromField]: toField },
      },
      position: { x: 300, y: 120 },
    });
    explanation.push(EXPLANATIONS.rename(fromField, toField));
  }

  // Ensure a fetch source exists when transforms were requested without one
  if (nodes.length > 0 && !hasRss && !hasJson) {
    const nodeId = getNextNodeId('fetch-rss');
    nodes.unshift({
      id: nodeId,
      type: 'fetch-rss',
      config: { url: promptUrl || SAFE_RSS_URL },
      position: { x: 80, y: 120 },
    });
    hasRss = true;
    explanation.unshift(EXPLANATIONS.fetchRss(promptUrl || SAFE_RSS_URL));
  }

  const recognized = hasRss || hasJson || hasFilter || hasSort || hasTruncate || hasMerge || hasRegex || hasRename;

  // If nothing was recognized, use a safe default feed and say so clearly.
  if (!recognized) {
    nodes.length = 0;
    edges.length = 0;
    explanation.length = 0;
    const nodeId = getNextNodeId('fetch-rss');
    nodes.push({
      id: nodeId,
      type: 'fetch-rss',
      config: { url: SAFE_RSS_URL },
      position: { x: 80, y: 120 },
    });
    const outputNodeId = getNextNodeId('output-json');
    nodes.push({
      id: outputNodeId,
      type: 'output-json',
      config: { format: 'json' },
      position: { x: 520, y: 120 },
    });
    edges.push({
      id: `${nodeId}-${outputNodeId}`,
      source: nodeId,
      target: outputNodeId,
    });
    explanation.push(EXPLANATIONS.unrecognized);
    explanation.push(EXPLANATIONS.fetchRss(SAFE_RSS_URL));
    explanation.push(EXPLANATIONS.outputJson);
    nodes.forEach((node, i) => {
      node.position = { x: 80 + i * 220, y: 120 };
    });
    const pipe: PipeDefinition = {
      id: `ghost-${Date.now()}`,
      name: nameFromPrompt(prompt),
      nodes,
      edges,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return { pipe, explanation, recognized: false };
  }

  // Determine output format
  const outputNodeIds: string[] = [];

  if (hasRss) {
    const nodeId = getNextNodeId('output-rss');
    nodes.push({
      id: nodeId,
      type: 'output-rss',
      config: { format: 'rss' },
    });
    outputNodeIds.push(nodeId);
    explanation.push(EXPLANATIONS.outputRss);
  } else {
    const nodeId = getNextNodeId('output-json');
    nodes.push({
      id: nodeId,
      type: 'output-json',
      config: { format: 'json' },
    });
    outputNodeIds.push(nodeId);
    explanation.push(EXPLANATIONS.outputJson);
  }

  // Build edges (chain nodes sequentially)
  if (nodes.length >= 2) {
    const nonOutputNodes = nodes.filter(n => !outputNodeIds.includes(n.id));

    for (let i = 0; i < nonOutputNodes.length - 1; i++) {
      edges.push({
        id: `${nonOutputNodes[i].id}-${nonOutputNodes[i + 1].id}`,
        source: nonOutputNodes[i].id,
        target: nonOutputNodes[i + 1].id,
      });
    }

    if (nonOutputNodes.length > 0) {
      for (const outputId of outputNodeIds) {
        edges.push({
          id: `${nonOutputNodes[nonOutputNodes.length - 1].id}-${outputId}`,
          source: nonOutputNodes[nonOutputNodes.length - 1].id,
          target: outputId,
        });
      }
    }
  }

  // Normalize positions left-to-right for the editor canvas
  nodes.forEach((node, i) => {
    node.position = { x: 80 + i * 220, y: 120 };
  });

  explanation.push(EXPLANATIONS.complete);

  const pipe: PipeDefinition = {
    id: `ghost-${Date.now()}`,
    name: nameFromPrompt(prompt),
    nodes,
    edges,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return { pipe, explanation, recognized: true };
}

/**
 * Validate that all node types in a pipe definition are valid
 */
export function validatePipeNodes(pipe: PipeDefinition): boolean {
  const validTypes: NodeType[] = [
    'fetch-rss',
    'fetch-json',
    'filter',
    'sort',
    'merge',
    'truncate',
    'regex',
    'rename',
    'output-rss',
    'output-json',
  ];

  return pipe.nodes.every(node => validTypes.includes(node.type));
}
