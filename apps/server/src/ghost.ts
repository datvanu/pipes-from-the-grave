/**
 * Ghost Builder - AI-powered pipe builder with spooky flair
 * Rule-based demo implementation (no LLM required)
 */

import type { PipeDefinition, PipeNode, PipeEdge, NodeType } from '@pipes/engine';

// Safe default RSS URL for demo purposes
const SAFE_RSS_URL = 'https://www.reddit.com/r/programming/.rss';

/**
 * Spooky explanation messages (see spooky-voice.md)
 */
const EXPLANATIONS = {
  fetchRss: "A fetch-rss nodeMaterializes from the shadows...",
  fetchJson: "A fetch-json node forms in the mist...",
  filter: "A filter node appears, sifting through the ectoplasm...",
  sort: "A sort node hums with spectral energy...",
  truncate: "A truncate node contracts the stream...",
  merge: "A merge node opens, connecting parallel streams...",
  outputJson: "An output-json node pulses with data...",
  outputRss: "An output-rss node glows with broadcast energy...",
  complete: "Pipes assembled. Ectoplasm humming...",
  error: "Something flickers... ah, an error! Let's fix it.",
};

/**
 * Rule-based pipe builder from natural language prompt
 * Maps keywords to node types
 */
export function buildPipeFromPrompt(
  prompt: string,
  options?: {
    llm?: (prompt: string) => Promise<string>;
  }
): { pipe: PipeDefinition; explanation: string[] } {
  const explanation: string[] = [];
  const nodes: PipeNode[] = [];
  const edges: PipeEdge[] = [];
  
  const promptLower = prompt.toLowerCase();
  let nodeIdCounter = 0;
  
  const getNextNodeId = (type: string): string => {
    nodeIdCounter++;
    return `${type}-${nodeIdCounter}`;
  };

  // Parse the prompt for keywords and build nodes
  let hasRss = false;
  let hasJson = false;
  let hasFilter = false;
  let hasSort = false;
  let hasTruncate = false;
  let hasMerge = false;
  let filterValue = '';

  // Detect fetch sources
  if (promptLower.includes('rss') || promptLower.includes('feed')) {
    hasRss = true;
    const nodeId = getNextNodeId('fetch-rss');
    nodes.push({
      id: nodeId,
      type: 'fetch-rss',
      config: { url: SAFE_RSS_URL },
    });
    explanation.push(EXPLANATIONS.fetchRss);
  }

  if (promptLower.includes('json')) {
    hasJson = true;
    const nodeId = getNextNodeId('fetch-json');
    nodes.push({
      id: nodeId,
      type: 'fetch-json',
      config: { url: 'https://jsonplaceholder.typicode.com/posts' },
    });
    explanation.push(EXPLANATIONS.fetchJson);
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
    });
    explanation.push(EXPLANATIONS.filter);
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
    });
    explanation.push(EXPLANATIONS.sort);
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
    });
    explanation.push(EXPLANATIONS.truncate);
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
    });
    explanation.push(EXPLANATIONS.merge);
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
    
    // Connect last non-output node to output node(s)
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

  // If no nodes were created, add a default fetch-rss with output-json
  if (nodes.length === 0) {
    const nodeId = getNextNodeId('fetch-rss');
    nodes.push({
      id: nodeId,
      type: 'fetch-rss',
      config: { url: SAFE_RSS_URL },
    });
    explanation.push(EXPLANATIONS.fetchRss);

    const outputNodeId = getNextNodeId('output-json');
    nodes.push({
      id: outputNodeId,
      type: 'output-json',
      config: { format: 'json' },
    });
    outputNodeIds.push(outputNodeId);
    explanation.push(EXPLANATIONS.outputJson);

    edges.push({
      id: `${nodeId}-${outputNodeId}`,
      source: nodeId,
      target: outputNodeId,
    });
  }

  // Final explanation
  explanation.push(EXPLANATIONS.complete);

  const pipe: PipeDefinition = {
    id: `ghost-${Date.now()}`,
    name: prompt.split('.')[0].slice(0, 50) || 'Ghost-Built Pipe',
    nodes,
    edges,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return { pipe, explanation };
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
