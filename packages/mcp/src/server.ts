/**
 * @pipes/mcp — MCP-style stdio bridge.
 * Prefers the running HTTP API (PIPES_API_BASE, default http://127.0.0.1:8787).
 * Falls back to an in-process store + engine if the server is unreachable.
 */

import type { PipeDefinition, PipeNode, PipeEdge } from '@pipes/engine';

const API_BASE = (process.env.PIPES_API_BASE || 'http://127.0.0.1:8787').replace(/\/$/, '');
const pipesStore: Map<string, PipeDefinition> = new Map();

function parseMessage(data: string): any {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function sendResponse(id: any, result: any): void {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

function sendError(id: any, code: number, message: string): void {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
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

function handleListNodes(): any {
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

async function handleListPipes(): Promise<any> {
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

async function handleCreatePipe(params: any): Promise<any> {
  if (!params || !params.pipe) throw new Error('Missing pipe parameter');
  const pipe = { ...params.pipe } as PipeDefinition;
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

async function handleRunPipe(params: any): Promise<any> {
  if (!params || !params.pipeId) throw new Error('Missing pipeId parameter');

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

async function handleAddNode(params: any): Promise<any> {
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

async function handleAddConnection(params: any): Promise<any> {
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

async function handleDeletePipe(params: any): Promise<any> {
  if (!params || !params.pipeId) throw new Error('Missing pipeId parameter');

  if (await serverHealthy()) {
    const r = await apiFetch(`/api/pipes/${encodeURIComponent(params.pipeId)}`, { method: 'DELETE' });
    if (!r.ok && r.status !== 204) throw new Error(r.body?.error || `delete HTTP ${r.status}`);
    return { success: true, mode: 'http' };
  }

  if (!pipesStore.has(params.pipeId)) throw new Error(`Pipe not found: ${params.pipeId}`);
  pipesStore.delete(params.pipeId);
  return { success: true, mode: 'local-fallback' };
}

async function handleGhost(params: any): Promise<any> {
  if (!params || !params.prompt) throw new Error('Missing prompt parameter');
  if (!(await serverHealthy())) {
    throw new Error(`Ghost requires the API server at ${API_BASE}`);
  }
  const r = await apiFetch('/api/ghost', { method: 'POST', body: JSON.stringify({ prompt: params.prompt }) });
  if (!r.ok) throw new Error(r.body?.message || r.body?.error || `ghost HTTP ${r.status}`);
  return { ...r.body, mode: 'http' };
}

async function handleRequest(request: any): Promise<void> {
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
      case 'initialize':
      case 'mcp/initialize':
        result = {
          protocolVersion: '2024-11-05',
          serverInfo: { name: 'pipes-from-the-grave', version: '0.1.0' },
          capabilities: { tools: {} },
          apiBase: API_BASE,
        };
        break;
      case 'list_nodes':
      case 'tools/list_nodes':
        result = handleListNodes();
        break;
      case 'list_pipes':
        result = await handleListPipes();
        break;
      case 'create_pipe':
        result = await handleCreatePipe(request.params);
        break;
      case 'run_pipe':
        result = await handleRunPipe(request.params);
        break;
      case 'node/add':
        result = await handleAddNode(request.params);
        break;
      case 'connection/add':
        result = await handleAddConnection(request.params);
        break;
      case 'pipe/delete':
        result = await handleDeletePipe(request.params);
        break;
      case 'ghost':
      case 'ghost_build':
        result = await handleGhost(request.params);
        break;
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
      if (line.trim()) {
        const message = parseMessage(line);
        if (message) void handleRequest(message);
      }
    }
  });
  process.stdin.on('end', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
  process.on('SIGINT', () => process.exit(0));
  console.error(`MCP bridge started (stdio); API base ${API_BASE}`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('index.ts')) {
  startServer();
}
