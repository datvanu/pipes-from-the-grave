/**
 * Pipe API: unguessable IDs, no public list/delete, export cache keys, rate limits.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp, resetMemoryState } from '../src/index.js';
import { httpLimits } from '../src/pipe-limits.js';
import { rateLimiter } from '../src/rate-limit.js';
import type { PipeDefinition } from '@pipes/engine';

const samplePipe = (name = 'Frontpage Digest'): PipeDefinition => ({
  name,
  nodes: [
    { id: 'fetch-rss-1', type: 'fetch-rss', config: { url: 'https://www.rfc-editor.org/rfcrss.xml' }, position: { x: 80, y: 120 } },
    { id: 'output-json-1', type: 'output-json', config: {}, position: { x: 300, y: 120 } },
  ],
  edges: [{ id: 'e1', source: 'fetch-rss-1', target: 'output-json-1' }],
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('pipe API store and exports', () => {
  const originalLimits = { ...httpLimits };

  beforeEach(() => {
    resetMemoryState();
    rateLimiter.clear();
    Object.assign(httpLimits, originalLimits);
  });

  afterEach(() => {
    resetMemoryState();
    rateLimiter.clear();
    Object.assign(httpLimits, originalLimits);
  });

  it('assigns a UUID and ignores a client-supplied slug so two posts do not clobber each other', async () => {
    const app = await createApp({ logger: false });
    const first = await app.inject({
      method: 'POST',
      url: '/api/pipes',
      payload: { ...samplePipe(), id: 'frontpage-digest' },
    });
    expect(first.statusCode).toBe(201);
    const a = first.json();
    expect(a.id).toMatch(UUID_RE);
    expect(a.id).not.toBe('frontpage-digest');

    const second = await app.inject({
      method: 'POST',
      url: '/api/pipes',
      payload: { ...samplePipe('Frontpage Digest'), id: 'frontpage-digest' },
    });
    expect(second.statusCode).toBe(201);
    const b = second.json();
    expect(b.id).toMatch(UUID_RE);
    expect(b.id).not.toBe(a.id);

    const gotA = await app.inject({ method: 'GET', url: `/api/pipes/${a.id}` });
    expect(gotA.statusCode).toBe(200);
    expect(gotA.json().name).toBe('Frontpage Digest');

    await app.close();
  });

  it('updates only when the client already holds a stored server id', async () => {
    const app = await createApp({ logger: false });
    const created = await app.inject({
      method: 'POST',
      url: '/api/pipes',
      payload: samplePipe('Original'),
    });
    const id = created.json().id;
    const updated = await app.inject({
      method: 'POST',
      url: '/api/pipes',
      payload: { ...samplePipe('Renamed'), id },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().id).toBe(id);
    expect(updated.json().name).toBe('Renamed');
    const unknown = await app.inject({
      method: 'POST',
      url: '/api/pipes',
      payload: { ...samplePipe('Other'), id: '11111111-1111-4111-8111-111111111111' },
    });
    expect(unknown.statusCode).toBe(201);
    expect(unknown.json().id).not.toBe('11111111-1111-4111-8111-111111111111');
    await app.close();
  });

  it('does not expose a public list or delete', async () => {
    const app = await createApp({ logger: false });
    await app.inject({ method: 'POST', url: '/api/pipes', payload: samplePipe() });
    const listed = await app.inject({ method: 'GET', url: '/api/pipes' });
    expect(listed.statusCode).toBe(404);
    expect(JSON.stringify(listed.json())).not.toMatch(/Frontpage Digest/);
    const deleted = await app.inject({ method: 'DELETE', url: '/api/pipes/does-not-matter' });
    expect(deleted.statusCode).toBeGreaterThanOrEqual(400);
    expect(deleted.statusCode).not.toBe(204);
    await app.close();
  });

  it('rejects itemsOverride on create and run', async () => {
    const app = await createApp({ logger: false });
    const bad: PipeDefinition = {
      name: 'Override',
      nodes: [
        { id: 'fetch-json-1', type: 'fetch-json', config: { itemsOverride: [{ id: '1', title: 'x' }] } },
        { id: 'output-json-1', type: 'output-json', config: {} },
      ],
      edges: [{ id: 'e1', source: 'fetch-json-1', target: 'output-json-1' }],
    };
    const created = await app.inject({ method: 'POST', url: '/api/pipes', payload: bad });
    expect(created.statusCode).toBe(400);
    const run = await app.inject({
      method: 'POST',
      url: '/api/pipes/run',
      payload: { pipe: bad, persist: false },
    });
    expect(run.statusCode).toBe(400);
    expect(run.json().error).toMatch(/itemsOverride/);
    await app.close();
  });

  it('keeps JSON and RSS export caches on separate keys in either order', async () => {
    let calls = 0;
    const runPipeFn = async () => {
      calls += 1;
      return {
        output: [{ id: String(calls), title: `item-${calls}` }],
        itemsByNode: {},
      };
    };
    const app = await createApp({ logger: false, runPipeFn: runPipeFn as any });
    const saved = await app.inject({ method: 'POST', url: '/api/pipes', payload: samplePipe() });
    const id = saved.json().id;

    const jsonFirst = await app.inject({ method: 'GET', url: `/p/${id}.json` });
    expect(jsonFirst.statusCode).toBe(200);
    expect(jsonFirst.headers['content-type']).toMatch(/json/);
    const jsonBody = jsonFirst.json();
    expect(Array.isArray(jsonBody)).toBe(true);
    expect(jsonBody[0].title).toBe('item-1');

    const rssSecond = await app.inject({ method: 'GET', url: `/p/${id}.rss` });
    expect(rssSecond.statusCode).toBe(200);
    expect(String(rssSecond.headers['content-type'])).toMatch(/rss|xml/);
    const rssText = rssSecond.body;
    expect(rssText).toMatch(/<rss|<item|item-2/);
    expect(rssText.trim().startsWith('{') || rssText.trim().startsWith('[')).toBe(false);

    // Reverse order on a second pipe
    const saved2 = await app.inject({ method: 'POST', url: '/api/pipes', payload: samplePipe('Other') });
    const id2 = saved2.json().id;
    const rssFirst = await app.inject({ method: 'GET', url: `/p/${id2}.rss` });
    const jsonSecond = await app.inject({ method: 'GET', url: `/p/${id2}.json` });
    expect(rssFirst.statusCode).toBe(200);
    expect(jsonSecond.statusCode).toBe(200);
    expect(Array.isArray(jsonSecond.json())).toBe(true);
    expect(String(jsonSecond.json()[0].title)).toMatch(/^item-/);
    expect(String(jsonSecond.body).includes('<rss')).toBe(false);
    expect(calls).toBe(4);
    await app.close();
  });

  it('rate-limits public export endpoints', async () => {
    httpLimits.runPerIp = 3;
    httpLimits.runGlobal = 100;
    const app = await createApp({ logger: false, runPipeFn: (async () => ({ output: [], itemsByNode: {} })) as any });
    const saved = await app.inject({ method: 'POST', url: '/api/pipes', payload: samplePipe() });
    const id = saved.json().id;
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await app.inject({ method: 'GET', url: `/p/${id}.json` });
      codes.push(res.statusCode);
    }
    expect(codes.slice(0, 3).every((c) => c === 200)).toBe(true);
    expect(codes[3]).toBe(429);
    expect(JSON.parse((await app.inject({ method: 'GET', url: `/p/${id}.rss` })).body).error).toMatch(/Rate limit/i);
    await app.close();
  });

  it('runs a pipe from the request body and can persist an export id', async () => {
    const runPipeFn = async () => ({ output: [{ id: '1', title: 'soul' }], itemsByNode: {} });
    const app = await createApp({ logger: false, runPipeFn: runPipeFn as any });
    const res = await app.inject({
      method: 'POST',
      url: '/api/pipes/run',
      payload: { pipe: samplePipe(), persist: true },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.output[0].title).toBe('soul');
    expect(body.pipeId).toMatch(UUID_RE);
    expect(body.exports.json).toMatch(`/p/${body.pipeId}.json`);
    const got = await app.inject({ method: 'GET', url: `/api/pipes/${body.pipeId}` });
    expect(got.statusCode).toBe(200);
    await app.close();
  });

  it('does not persist an export id unless persist is true', async () => {
    const runPipeFn = async () => ({ output: [{ id: '1', title: 'soul' }], itemsByNode: {} });
    const app = await createApp({ logger: false, runPipeFn: runPipeFn as any });
    const res = await app.inject({
      method: 'POST',
      url: '/api/pipes/run',
      payload: { pipe: samplePipe() },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pipeId).toBeUndefined();
    expect(body.exports).toBeUndefined();
    await app.close();
  });

  it('rate-limits pipe creation', async () => {
    httpLimits.createPerIp = 2;
    httpLimits.createGlobal = 2;
    const app = await createApp({ logger: false });
    const codes: number[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await app.inject({ method: 'POST', url: '/api/pipes', payload: samplePipe(`Pipe ${i}`) });
      codes.push(res.statusCode);
    }
    expect(codes.slice(0, 2).every((c) => c === 201)).toBe(true);
    expect(codes[2]).toBe(429);
    await app.close();
  });

  it('rejects unknown node types', async () => {
    const app = await createApp({ logger: false });
    const res = await app.inject({
      method: 'POST',
      url: '/api/pipes',
      payload: {
        name: 'Nope',
        nodes: [{ id: 'n1', type: 'eval', config: {} }],
        edges: [],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/unknown or invalid node type/i);
    await app.close();
  });

  it('advertises ghost config and security headers on health', async () => {
    const previous = process.env.GHOST_MODE;
    delete process.env.GHOST_MODE;
    const app = await createApp({ logger: false });
    const open = await app.inject({ method: 'GET', url: '/api/health' });
    expect(open.statusCode).toBe(200);
    expect(open.json().ghost).toEqual({ mode: 'byok', acceptVisitorKeys: true });
    expect(open.headers['content-security-policy']).toMatch(/default-src 'self'/);
    expect(open.headers['referrer-policy']).toBe('no-referrer');
    expect(open.headers['permissions-policy']).toMatch(/camera=\(\)/);
    expect(open.headers['x-content-type-options']).toBe('nosniff');
    expect(open.headers['x-frame-options']).toBe('DENY');
    process.env.GHOST_MODE = 'demo';
    const demo = await app.inject({ method: 'GET', url: '/api/health' });
    expect(demo.json().ghost).toEqual({ mode: 'demo', acceptVisitorKeys: false });
    if (previous === undefined) delete process.env.GHOST_MODE;
    else process.env.GHOST_MODE = previous;
    await app.close();
  });

  it('uses relative export links in production when PUBLIC_BASE_URL is unset', async () => {
    const previousEnv = process.env.NODE_ENV;
    const previousBase = process.env.PUBLIC_BASE_URL;
    process.env.NODE_ENV = 'production';
    delete process.env.PUBLIC_BASE_URL;
    const runPipeFn = async () => ({ output: [{ id: '1', title: 'soul' }], itemsByNode: {} });
    const app = await createApp({ logger: false, runPipeFn: runPipeFn as any });
    const res = await app.inject({
      method: 'POST',
      url: '/api/pipes/run',
      headers: { host: 'evil.example', 'x-forwarded-host': 'evil.example' },
      payload: { pipe: samplePipe(), persist: true },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.exports.json).toBe(`/p/${body.pipeId}.json`);
    expect(body.exports.rss).toBe(`/p/${body.pipeId}.rss`);
    expect(JSON.stringify(body)).not.toContain('evil.example');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=/);
    if (previousEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnv;
    if (previousBase === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = previousBase;
    await app.close();
  });
});
