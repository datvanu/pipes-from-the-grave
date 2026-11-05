/**
 * @pipes/mcp - MCP server for pipe operations
 * Minimal JSON-RPC stdio implementation
 */

import { spawn } from 'child_process';
import type { PipeDefinition, PipeNode, PipeEdge } from '@pipes/engine';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Server state
const pipesStore: Map<string, PipeDefinition> = new Map();

/**
 * Parse incoming JSON-RPC message from stdin
 */
function parseMessage(data: string): any {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Send JSON-RPC response to stdout
 */
function sendResponse(id: any, result: any): void {
  const response = {
    jsonrpc: '2.0',
    id,
    result,
  };
  process.stdout.write(JSON.stringify(response) + '\n');
}

/**
 * Send JSON-RPC error to stdout
 */
function sendError(id: any, code: number, message: string): void {
  const response = {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
    },
  };
  process.stdout.write(JSON.stringify(response) + '\n');
}

/**
 * List available node types
 */
function handleListNodes(): any {
  return {
    nodeTypes: [
      { type: 'fetch-rss', description: 'Fetch RSS feed' },
      { type: 'fetch-json', description: 'Fetch JSON data' },
      { type: 'filter', description: 'Filter items' },
      { type: 'sort', description: 'Sort items' },
      { type: 'merge', description: 'Merge multiple streams' },
      { type: 'truncate', description: 'Limit items' },
      { type: 'regex', description: 'Regex transformation' },
      { type: 'rename', description: 'Rename fields' },
      { type: 'output-rss', description: 'Output as RSS' },
      { type: 'output-json', description: 'Output as JSON' },
    ],
  };
}

/**
 * List all pipes
 */
function handleListPipes(): any {
  return {
    pipes: Array.from(pipesStore.values()).map(p => ({
      id: p.id,
      name: p.name,
      nodes: p.nodes.length,
      edges: p.edges.length,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
  };
}

/**
 * Create a new pipe
 */
function handleCreatePipe(params: any): any {
  if (!params || !params.pipe) {
    throw new Error('Missing pipe parameter');
  }

  const pipe = params.pipe as PipeDefinition;

  if (!pipe.id) {
    pipe.id = `pipe-${Date.now()}`;
  }

  pipesStore.set(pipe.id, pipe);
  
  return { pipe };
}

/**
 * Run a pipe
 */
function handleRunPipe(params: any): any {
  if (!params || !params.pipeId) {
    throw new Error('Missing pipeId parameter');
  }

  const pipe = pipesStore.get(params.pipeId);
  if (!pipe) {
    throw new Error(`Pipe not found: ${params.pipeId}`);
  }

  // Import engine dynamically
  return import('@pipes/engine').then(({ runPipe }) => {
    return runPipe(pipe);
  });
}

/**
 * Add a node to a pipe
 */
function handleAddNode(params: any): any {
  if (!params || !params.pipeId || !params.node) {
    throw new Error('Missing pipeId or node parameter');
  }

  const pipe = pipesStore.get(params.pipeId);
  if (!pipe) {
    throw new Error(`Pipe not found: ${params.pipeId}`);
  }

  const node = params.node as PipeNode;
  if (!node.id || !node.type) {
    throw new Error('Node must have id and type');
  }

  pipe.nodes.push(node);
  pipe.updatedAt = new Date().toISOString();
  pipesStore.set(pipe.id, pipe);

  return { node };
}

/**
 * Add a connection between nodes
 */
function handleAddConnection(params: any): any {
  if (!params || !params.pipeId || !params.connection) {
    throw new Error('Missing pipeId or connection parameter');
  }

  const pipe = pipesStore.get(params.pipeId);
  if (!pipe) {
    throw new Error(`Pipe not found: ${params.pipeId}`);
  }

  const connection = params.connection as PipeEdge;
  if (!connection.id || !connection.source || !connection.target) {
    throw new Error('Connection must have id, source, and target');
  }

  pipe.edges.push(connection);
  pipe.updatedAt = new Date().toISOString();
  pipesStore.set(pipe.id, pipe);

  return { connection };
}

/**
 * Delete a pipe
 */
function handleDeletePipe(params: any): any {
  if (!params || !params.pipeId) {
    throw new Error('Missing pipeId parameter');
  }

  if (!pipesStore.has(params.pipeId)) {
    throw new Error(`Pipe not found: ${params.pipeId}`);
  }

  pipesStore.delete(params.pipeId);
  
  return { success: true };
}

/**
 * Handle incoming request
 */
function handleRequest(request: any): void {
  if (request.jsonrpc !== '2.0') {
    sendError(request.id, -32600, 'Invalid JSON-RPC version');
    return;
  }

  if (!request.method) {
    sendError(request.id, -32600, 'Missing method');
    return;
  }

  try {
    let result: any;

    switch (request.method) {
      case 'list_nodes':
        result = handleListNodes();
        break;
      case 'list_pipes':
        result = handleListPipes();
        break;
      case 'create_pipe':
        result = handleCreatePipe(request.params);
        break;
      case 'run_pipe':
        result = handleRunPipe(request.params);
        break;
      case 'node/add':
        result = handleAddNode(request.params);
        break;
      case 'connection/add':
        result = handleAddConnection(request.params);
        break;
      case 'pipe/delete':
        result = handleDeletePipe(request.params);
        break;
      default:
        sendError(request.id, -32601, `Method not found: ${request.method}`);
        return;
    }

    if (result instanceof Promise) {
      result
        .then((r: any) => sendResponse(request.id, r))
        .catch((e: any) => sendError(request.id, -32000, e.message));
    } else {
      sendResponse(request.id, result);
    }
  } catch (error: any) {
    sendError(request.id, -32000, error.message);
  }
}

/**
 * Start the MCP server
 */
export function startServer(): void {
  let buffer = '';

  process.stdin.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    
    // Process complete lines
    while (buffer.includes('\n')) {
      const lineEnd = buffer.indexOf('\n');
      const line = buffer.slice(0, lineEnd);
      buffer = buffer.slice(lineEnd + 1);
      
      if (line.trim()) {
        const message = parseMessage(line);
        if (message) {
          handleRequest(message);
        }
      }
    }
  });

  process.stdin.on('end', () => {
    process.exit(0);
  });

  // Handle process termination
  process.on('SIGTERM', () => process.exit(0));
  process.on('SIGINT', () => process.exit(0));

  console.error('MCP server started (stdio)');
}

// Auto-start if run directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('index.ts')) {
  startServer();
}
