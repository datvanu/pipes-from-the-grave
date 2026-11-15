/**
 * @pipes/mcp — MCP stdio server (JSON-RPC 2.0, newline-delimited).
 * Prefers the running HTTP API (PIPES_API_BASE, default http://127.0.0.1:8787).
 * Falls back to an in-process store + engine if the server is unreachable.
 */

import type { PipeDefinition, PipeNode, PipeEdge } from '@pipes/engine';

const API_BASE = (process.env.PIPES_API_BASE || 'http://127.0.0.1:8787').replace(/\/$/, '');
const pipesStore: Map<string, PipeDefinition> = new Map();

export const PROTOCOL_VERSION = '2024-11-05';
export const SERVER_INFO = { name: 'pipes-from-the-grave', version: '0.1.0' };

const NODE_TYPES = [
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
] as const;

const emptyInputSchema = {
  type: 'object',
  properties: {},
  additionalProperties: false,
} as const;

const positionSchema = {
  type: 'object',
  description: 'Canvas coordinates',
  properties: {
    x: { type: 'number' },
    y: { type: 'number' },
  },
  required: ['x', 'y'],
  additionalProperties: false,
} as const;

const nodeSchema = {
  type: 'object',
  description: 'A pipe node',
  properties: {
    id: { type: 'string', description: 'Unique node id' },
    type: { type: 'string', enum: [...NODE_TYPES], description: 'Node type' },
    config: { type: 'object', description: 'Node-specific configuration object' },
    position: positionSchema,
  },
  required: ['id', 'type', 'config'],
  additionalProperties: false,
} as const;

const connectionSchema = {
  type: 'object',
  description: 'An edge between two nodes',
  properties: {
    id: { type: 'string', description: 'Unique connection id' },
    source: { type: 'string', description: 'Source node id' },
    target: { type: 'string', description: 'Target node id' },
  },
  required: ['id', 'source', 'target'],
  additionalProperties: false,
} as const;

const pipeSchema = {
  type: 'object',
  description: 'A complete pipe definition',
  properties: {
    id: { type: 'string', description: 'Pipe id (generated if omitted)' },
    name: { type: 'string', description: 'Display name' },
    nodes: { type: 'array', items: nodeSchema, description: 'Nodes in the pipe' },
    edges: { type: 'array', items: connectionSchema, description: 'Connections between nodes' },
    createdAt: { type: 'string', description: 'ISO-8601 creation timestamp' },
    updatedAt: { type: 'string', description: 'ISO-8601 update timestamp' },
  },
  required: ['name', 'nodes', 'edges'],
  additionalProperties: false,
} as const;

export type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

/** Canonical MCP tool list. Names are unique; there are no aliases or dead tools. */
export const TOOLS: McpTool[] = [
  {
    name: 'list_nodes',
    description: 'List the node types available in the pipe engine, with a short description of each.',
    inputSchema: { ...emptyInputSchema },
  },
  {
    name: 'list_pipes',
    description: 'List saved pipes (id, name, node and edge counts, timestamps). Uses the HTTP API when it is reachable.',
    inputSchema: { ...emptyInputSchema },
  },
  {
    name: 'get_pipe',
    description: 'Fetch the full definition of a saved pipe by id.',
    inputSchema: {
      type: 'object',
      properties: {
        pipeId: { type: 'string', description: 'Id of the pipe to fetch' },
      },
      required: ['pipeId'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_pipe',
    description: 'Create or update a pipe from a full definition (name, nodes, edges).',
    inputSchema: {
      type: 'object',
      properties: {
        pipe: pipeSchema,
      },
      required: ['pipe'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_node',
    description: 'Add a node to an existing pipe and persist the change.',
    inputSchema: {
      type: 'object',
      properties: {
        pipeId: { type: 'string', description: 'Id of the pipe to edit' },
        node: nodeSchema,
      },
      required: ['pipeId', 'node'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_connection',
    description: 'Add an edge between two nodes in an existing pipe and persist the change.',
    inputSchema: {
      type: 'object',
      properties: {
        pipeId: { type: 'string', description: 'Id of the pipe to edit' },
        connection: connectionSchema,
      },
      required: ['pipeId', 'connection'],
      additionalProperties: false,
    },
  },
  {
    name: 'run_pipe',
    description: 'Execute a saved pipe and return its output items, per-node items, and duration.',
    inputSchema: {
      type: 'object',
      properties: {
        pipeId: { type: 'string', description: 'Id of the pipe to run' },
      },
      required: ['pipeId'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_pipe',
    description: 'Delete a saved pipe by id.',
    inputSchema: {
      type: 'object',
      properties: {
        pipeId: { type: 'string', description: 'Id of the pipe to delete' },
      },
      required: ['pipeId'],
      additionalProperties: false,
    },
  },
  {
    name: 'ghost_build',
    description:
      'Build a pipe from a natural-language prompt. Default is the rule-based demo mode (no LLM key required).',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Natural-language description of the pipe to build' },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
  },
];

const TOOL_NAMES = new Set(TOOLS.map((t) => t.name));

function parseMessage(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function writeMessage(payload: unknown): void {
  process.stdout.write(JSON.stringify(payload) + '\n');
}

function sendResponse(id: unknown, result: unknown): void {
  writeMessage({ jsonrpc: '2.0', id, result });
}

function sendError(id: unknown, code: number, message: string): void {
  writeMessage({ jsonrpc: '2.0', id, error: { code, message } });
}

async function apiFetch(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: any }> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let body: any = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  return { ok: res.ok, status: res.status, body };
}

async function serverHealthy(): Promise<boolean> {
  try {
    const r = await apiFetch('/api/health');
    return r.ok;
  } catch {
    return false;
  }
}

function handleListNodes(): unknown {
  return {
    nodeTypes: [
      { type: 'fetch-rss', description: 'Fetch RSS/Atom feed (SSRF-protected)' },
      { type: 'fetch-json', description: 'Fetch JSON data (SSRF-protected)' },
      { type: 'filter', description: 'Filter items' },
      { type: 'sort', description: 'Sort items' },
      { type: 'merge', description: 'Merge multiple streams' },
      { type: 'truncate', description: 'Limit items' },
      { type: 'regex', description: 'Regex transformation' },
      { type: 'rename', description: 'Rename fields via mapping' },
      { type: 'output-rss', description: 'Output as RSS' },
      { type: 'output-json', description: 'Output as JSON' },
    ],
  };
}

async function handleListPipes(): Promise<unknown> {
  if (await serverHealthy()) {
    const r = await apiFetch('/api/pipes');
    if (!r.ok) throw new Error(r.body?.message || r.body?.error || `list_pipes HTTP ${r.status}`);
    return r.body;
  }
  return {
    pipes: Array.from(pipesStore.values()).map((p) => ({
      id: p.id,
      name: p.name,
      nodes: p.nodes.length,
      edges: p.edges.length,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
    mode: 'local-fallback',
  };
}

async function handleGetPipe(params: any): Promise<unknown> {
  if (!params || typeof params.pipeId !== 'string' || !params.pipeId) {
    throw new Error('Missing pipeId parameter');
  }

  if (await serverHealthy()) {
    const r = await apiFetch(`/api/pipes/${encodeURIComponent(params.pipeId)}`);
    if (!r.ok) throw new Error(r.body?.error || r.body?.message || `get_pipe HTTP ${r.status}`);
    return { pipe: r.body, mode: 'http' };
  }

  const pipe = pipesStore.get(params.pipeId);
  if (!pipe) throw new Error(`Pipe not found: ${params.pipeId}`);
  return { pipe, mode: 'local-fallback' };
}

async function handleCreatePipe(params: any): Promise<unknown> {
  if (!params || !params.pipe) throw new Error('Missing pipe parameter');
  const pipe = { ...params.pipe } as PipeDefinition;
  if (!pipe.name) throw new Error('Pipe must have a name');
  if (!Array.isArray(pipe.nodes)) pipe.nodes = [];
  if (!Array.isArray(pipe.edges)) pipe.edges = [];
  if (!pipe.id) pipe.id = `pipe-${Date.now()}`;
  pipe.updatedAt = new Date().toISOString();
  pipe.createdAt = pipe.createdAt || pipe.updatedAt;

  if (await serverHealthy()) {
    const r = await apiFetch('/api/pipes', { method: 'POST', body: JSON.stringify(pipe) });
    if (!r.ok) throw new Error(r.body?.message || r.body?.error || `create_pipe HTTP ${r.status}`);
    return { pipe: r.body, mode: 'http' };
  }

  pipesStore.set(pipe.id, pipe);
  return { pipe, mode: 'local-fallback' };
}

async function handleRunPipe(params: any): Promise<unknown> {
  if (!params || typeof params.pipeId !== 'string' || !params.pipeId) {
    throw new Error('Missing pipeId parameter');
  }

  if (await serverHealthy()) {
    const r = await apiFetch(`/api/pipes/${encodeURIComponent(params.pipeId)}/run`, { method: 'POST' });
    if (r.status === 429) {
      throw new Error(
        `Rate limit exceeded (retryAfterMs=${r.body?.retryAfterMs ?? '?'}): ${r.body?.message || 'too many requests'}`,
      );
    }
    if (!r.ok) throw new Error(r.body?.message || r.body?.error || `run_pipe HTTP ${r.status}`);
    return { ...r.body, mode: 'http' };
  }

  const pipe = pipesStore.get(params.pipeId);
  if (!pipe) throw new Error(`Pipe not found locally: ${params.pipeId} (is the API server running on ${API_BASE}?)`);
  const { runPipe } = await import('@pipes/engine');
  const result = await runPipe(pipe);
  return { ...result, mode: 'local-fallback' };
}

async function handleAddNode(params: any): Promise<unknown> {
  if (!params || !params.pipeId || !params.node) throw new Error('Missing pipeId or node parameter');
  const node = params.node as PipeNode;
  if (!node.id || !node.type) throw new Error('Node must have id and type');

  if (await serverHealthy()) {
    const get = await apiFetch(`/api/pipes/${encodeURIComponent(params.pipeId)}`);
    if (!get.ok) throw new Error(get.body?.error || `pipe not found HTTP ${get.status}`);
    const pipe = get.body as PipeDefinition;
    pipe.nodes.push(node);
    pipe.updatedAt = new Date().toISOString();
    const saved = await apiFetch('/api/pipes', { method: 'POST', body: JSON.stringify(pipe) });
    if (!saved.ok) throw new Error(saved.body?.message || `save failed HTTP ${saved.status}`);
    return { node, mode: 'http' };
  }

  const pipe = pipesStore.get(params.pipeId);
  if (!pipe) throw new Error(`Pipe not found: ${params.pipeId}`);
  pipe.nodes.push(node);
  pipe.updatedAt = new Date().toISOString();
  pipesStore.set(pipe.id, pipe);
  return { node, mode: 'local-fallback' };
}

async function handleAddConnection(params: any): Promise<unknown> {
  if (!params || !params.pipeId || !params.connection) throw new Error('Missing pipeId or connection parameter');
  const connection = params.connection as PipeEdge;
  if (!connection.id || !connection.source || !connection.target) {
    throw new Error('Connection must have id, source, and target');
  }

  if (await serverHealthy()) {
    const get = await apiFetch(`/api/pipes/${encodeURIComponent(params.pipeId)}`);
    if (!get.ok) throw new Error(get.body?.error || `pipe not found HTTP ${get.status}`);
    const pipe = get.body as PipeDefinition;
    pipe.edges.push(connection);
    pipe.updatedAt = new Date().toISOString();
    const saved = await apiFetch('/api/pipes', { method: 'POST', body: JSON.stringify(pipe) });
    if (!saved.ok) throw new Error(saved.body?.message || `save failed HTTP ${saved.status}`);
    return { connection, mode: 'http' };
  }

  const pipe = pipesStore.get(params.pipeId);
  if (!pipe) throw new Error(`Pipe not found: ${params.pipeId}`);
  pipe.edges.push(connection);
  pipe.updatedAt = new Date().toISOString();
  pipesStore.set(pipe.id, pipe);
  return { connection, mode: 'local-fallback' };
}

async function handleDeletePipe(params: any): Promise<unknown> {
  if (!params || typeof params.pipeId !== 'string' || !params.pipeId) {
    throw new Error('Missing pipeId parameter');
  }

  if (await serverHealthy()) {
    const r = await apiFetch(`/api/pipes/${encodeURIComponent(params.pipeId)}`, { method: 'DELETE' });
    if (!r.ok && r.status !== 204) throw new Error(r.body?.error || `delete HTTP ${r.status}`);
    return { success: true, mode: 'http' };
  }

  if (!pipesStore.has(params.pipeId)) throw new Error(`Pipe not found: ${params.pipeId}`);
  pipesStore.delete(params.pipeId);
  return { success: true, mode: 'local-fallback' };
}

async function handleGhost(params: any): Promise<unknown> {
  if (!params || typeof params.prompt !== 'string' || !params.prompt) {
    throw new Error('Missing prompt parameter');
  }
  if (!(await serverHealthy())) {
    throw new Error(`Ghost requires the API server at ${API_BASE}`);
  }
  const r = await apiFetch('/api/ghost', { method: 'POST', body: JSON.stringify({ prompt: params.prompt }) });
  if (!r.ok) throw new Error(r.body?.message || r.body?.error || `ghost HTTP ${r.status}`);
  return { ...r.body, mode: r.body?.mode || 'http' };
}

async function callTool(name: string, args: any): Promise<unknown> {
  switch (name) {
    case 'list_nodes':
      return handleListNodes();
    case 'list_pipes':
      return handleListPipes();
    case 'get_pipe':
      return handleGetPipe(args);
    case 'create_pipe':
      return handleCreatePipe(args);
    case 'add_node':
      return handleAddNode(args);
    case 'add_connection':
      return handleAddConnection(args);
    case 'run_pipe':
      return handleRunPipe(args);
    case 'delete_pipe':
      return handleDeletePipe(args);
    case 'ghost_build':
      return handleGhost(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function toolCallResult(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [{ type: 'text', text: JSON.stringify(data) }],
  };
}

export async function handleRequest(request: any): Promise<void> {
  if (request == null || typeof request !== 'object') {
    sendError(null, -32600, 'Invalid Request');
    return;
  }

  const isNotification = request.id === undefined;
  if (request.jsonrpc !== '2.0') {
    if (!isNotification) sendError(request.id ?? null, -32600, 'Invalid JSON-RPC version');
    return;
  }
  if (!request.method || typeof request.method !== 'string') {
    if (!isNotification) sendError(request.id ?? null, -32600, 'Missing method');
    return;
  }

  // Notifications must not receive a JSON-RPC response.
  if (isNotification) {
    return;
  }

  try {
    let result: unknown;
    switch (request.method) {
      case 'initialize':
      case 'mcp/initialize':
        result = {
          protocolVersion: PROTOCOL_VERSION,
          serverInfo: SERVER_INFO,
          capabilities: { tools: {} },
          instructions:
            `Pipes from the Grave MCP server. Default Ghost mode is the rule-based demo (no LLM key). API base: ${API_BASE}.`,
        };
        break;
      case 'ping':
        result = {};
        break;
      case 'tools/list':
        result = { tools: TOOLS };
        break;
      case 'tools/call': {
        const name = request.params?.name;
        if (!name || typeof name !== 'string') {
          sendError(request.id, -32602, 'Missing tool name');
          return;
        }
        if (!TOOL_NAMES.has(name)) {
          sendError(request.id, -32601, `Method not found: ${name}`);
          return;
        }
        const args = request.params?.arguments ?? {};
        const data = await callTool(name, args);
        result = toolCallResult(data);
        break;
      }
      default:
        sendError(request.id, -32601, `Method not found: ${request.method}`);
        return;
    }
    sendResponse(request.id, result);
  } catch (error: any) {
    sendError(request.id, -32000, error.message || String(error));
  }
}

export function startServer(): void {
  let buffer = '';
  process.stdin.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    while (buffer.includes('\n')) {
      const lineEnd = buffer.indexOf('\n');
      const line = buffer.slice(0, lineEnd);
      buffer = buffer.slice(lineEnd + 1);
      const trimmed = line.trim();
      if (!trimmed) continue;
      const message = parseMessage(trimmed);
      if (message) {
        void handleRequest(message);
      } else {
        sendError(null, -32700, 'Parse error');
      }
    }
  });
  process.stdin.on('end', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
  process.on('SIGINT', () => process.exit(0));
  console.error(`MCP server started (stdio); API base ${API_BASE}`);
}
