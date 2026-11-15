/**
 * Stdio integration tests for MCP tools/list and tools/call.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const mcpRoot = path.resolve(here, '..');
const repoRoot = path.resolve(mcpRoot, '..', '..');
const mcpEntry = path.join(mcpRoot, 'src', 'index.ts');
const serverEntry = path.join(repoRoot, 'apps', 'server', 'src', 'index.ts');

type RpcMessage = {
  jsonrpc: string;
  id?: unknown;
  result?: any;
  error?: { code: number; message: string };
};

class McpClient {
  private buf = '';
  private pending: Array<{
    resolve: (msg: RpcMessage) => void;
    reject: (err: Error) => void;
  }> = [];

  constructor(private readonly child: ChildProcessWithoutNullStreams) {
    child.stdout.on('data', (chunk: Buffer) => {
      this.buf += chunk.toString();
      this.drain();
    });
  }

  private drain(): void {
    while (this.buf.includes('\n')) {
      const i = this.buf.indexOf('\n');
      const line = this.buf.slice(0, i);
      this.buf = this.buf.slice(i + 1);
      if (!line.trim()) continue;
      let msg: RpcMessage;
      try {
        msg = JSON.parse(line) as RpcMessage;
      } catch (err) {
        const next = this.pending.shift();
        next?.reject(new Error(`Invalid MCP stdout line: ${line}`));
        continue;
      }
      const next = this.pending.shift();
      if (next) next.resolve(msg);
    }
  }

  request(method: string, params?: unknown, id: number | string = Date.now()): Promise<RpcMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timed out waiting for ${method}`));
      }, 12000);
      this.pending.push({
        resolve: (msg) => {
          clearTimeout(timer);
          resolve(msg);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  async end(): Promise<void> {
    if (this.child.stdin.writable) this.child.stdin.end();
    if (!this.child.killed) this.child.kill('SIGTERM');
  }
}

function spawnMcp(env: Record<string, string> = {}): Promise<{
  child: ChildProcessWithoutNullStreams;
  client: McpClient;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['tsx', mcpEntry], {
      cwd: mcpRoot,
      env: {
        ...process.env,
        PIPES_MCP_STDIO: '1',
        PIPES_API_BASE: env.PIPES_API_BASE || 'http://127.0.0.1:1',
        ...env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('MCP server did not start'));
    }, 10000);

    let stderr = '';
    const onErr = (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.includes('MCP server started')) {
        clearTimeout(timer);
        child.stderr.off('data', onErr);
        resolve({ child, client: new McpClient(child) });
      }
    };
    child.stderr.on('data', onErr);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function assertValidInputSchema(schema: any, toolName: string): void {
  expect(schema, `${toolName} missing inputSchema`).toBeTypeOf('object');
  expect(schema, `${toolName} inputSchema is null`).not.toBeNull();
  expect(JSON.parse(JSON.stringify(schema))).toEqual(schema);
  expect(schema.type, `${toolName} inputSchema.type`).toBe('object');
  expect(schema.properties, `${toolName} inputSchema.properties`).toBeTypeOf('object');
  expect(schema.properties, `${toolName} inputSchema.properties is null`).not.toBeNull();
  if (schema.required !== undefined) {
    expect(Array.isArray(schema.required), `${toolName} required must be an array`).toBe(true);
    for (const key of schema.required as string[]) {
      expect(typeof key).toBe('string');
      expect(
        schema.properties,
        `${toolName} required "${key}" is not in properties`,
      ).toHaveProperty(key);
    }
  }
  for (const [propName, prop] of Object.entries(schema.properties as Record<string, any>)) {
    expect(prop, `${toolName}.${propName} is undefined`).toBeTruthy();
    expect(prop.type, `${toolName}.${propName}.type`).toBeTruthy();
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close();
        reject(new Error('Could not allocate a port'));
        return;
      }
      const port = addr.port;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

async function waitForHealth(base: string, timeoutMs = 10000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`API at ${base} did not become healthy`);
}

describe('MCP tools/list via stdio', () => {
  let client: McpClient;

  beforeAll(async () => {
    const started = await spawnMcp();
    client = started.client;
  });

  afterAll(async () => {
    await client?.end();
  });

  it('returns a unique list of tools with English descriptions and valid JSON Schemas', async () => {
    const init = await client.request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } }, 1);
    expect(init.error).toBeUndefined();
    expect(init.result.protocolVersion).toBe('2024-11-05');
    expect(init.result.serverInfo.name).toBe('pipes-from-the-grave');
    expect(init.result.capabilities.tools).toBeTypeOf('object');

    const listed = await client.request('tools/list', {}, 2);
    expect(listed.error).toBeUndefined();
    const tools = listed.result.tools as Array<{ name: string; description: string; inputSchema: unknown }>;
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThanOrEqual(7);

    const names = tools.map((t) => t.name);
    expect(new Set(names).size, 'duplicate tool names').toBe(names.length);

    const expected = [
      'list_nodes',
      'get_pipe',
      'create_pipe',
      'add_node',
      'add_connection',
      'run_pipe',
      'ghost_build',
    ];
    expect(names.sort()).toEqual([...expected].sort());

    for (const tool of tools) {
      expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(tool.description, `${tool.name} description`).toBeTypeOf('string');
      expect(tool.description.trim().length, `${tool.name} description empty`).toBeGreaterThan(10);
      expect(tool.description).toMatch(/[A-Za-z]{3,}/);
      assertValidInputSchema(tool.inputSchema, tool.name);
    }
  });

  it('returns JSON-RPC errors for unknown methods and tools', async () => {
    const unknownMethod = await client.request('no/such/method', {}, 3);
    expect(unknownMethod.error).toBeDefined();
    expect(unknownMethod.error?.code).toBe(-32601);

    const unknownTool = await client.request('tools/call', { name: 'not_a_tool', arguments: {} }, 4);
    expect(unknownTool.error).toBeDefined();
    expect(unknownTool.error?.code).toBe(-32602);
  });

  it('calls list_nodes via tools/call', async () => {
    const res = await client.request('tools/call', { name: 'list_nodes', arguments: {} }, 5);
    expect(res.error).toBeUndefined();
    expect(res.result.content[0].type).toBe('text');
    const body = JSON.parse(res.result.content[0].text);
    expect(body.nodeTypes.length).toBeGreaterThan(0);
    expect(body.nodeTypes.map((n: { type: string }) => n.type)).toContain('fetch-rss');
  });

  it('returns a tools/call result with isError when get_pipe is missing pipeId', async () => {
    const res = await client.request('tools/call', { name: 'get_pipe', arguments: {} }, 6);
    expect(res.error).toBeUndefined();
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toMatch(/pipeId/i);
  });
});

describe('MCP tools/call against a running API', () => {
  let api: ChildProcessWithoutNullStreams;
  let client: McpClient;
  let base = '';

  beforeAll(async () => {
    const port = await freePort();
    base = `http://127.0.0.1:${port}`;
    api = spawn('npx', ['tsx', serverEntry], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PORT: String(port),
        GHOST_MODE: 'demo',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await waitForHealth(base);
    const started = await spawnMcp({ PIPES_API_BASE: base });
    client = started.client;
  });

  afterAll(async () => {
    await client?.end();
    if (api && !api.killed) api.kill('SIGTERM');
  });

  it('lists tools and calls ghost_build in demo mode through the live API', async () => {
    const listed = await client.request('tools/list', {}, 10);
    expect(listed.error).toBeUndefined();
    const names = (listed.result.tools as Array<{ name: string }>).map((t) => t.name);
    expect(names).toContain('ghost_build');
    expect(names).not.toContain('list_pipes');
    expect(names).not.toContain('delete_pipe');

    const call = await client.request(
      'tools/call',
      { name: 'ghost_build', arguments: { prompt: 'fetch rss about rust, sort, top 5' } },
      11,
    );
    expect(call.error).toBeUndefined();
    const body = JSON.parse(call.result.content[0].text);
    expect(body.mode).toBe('demo');
    expect(body.pipe).toBeTruthy();
    expect(Array.isArray(body.pipe.nodes)).toBe(true);
    expect(body.pipe.nodes.length).toBeGreaterThan(0);
    expect(Array.isArray(body.explanation)).toBe(true);
  });
});
