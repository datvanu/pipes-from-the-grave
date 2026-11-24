/**
 * Ghost builder: default demo mode, and BYOK key handling (never logged or echoed).
 */
import { Writable } from 'node:stream';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/index.js';
import { LOG_REDACT_PATHS, redactSecrets } from '../src/ghost-llm.js';
import { rateLimiter } from '../src/rate-limit.js';

const SECRET = 'sk-test-BYOK-SECRET-VALUE-DO-NOT-LEAK-9f3a';

const llmPipe = {
  pipe: {
    name: 'Rust Digest',
    nodes: [
      { id: 'fetch-rss-1', type: 'fetch-rss', config: { url: 'https://www.rfc-editor.org/rfcrss.xml' }, position: { x: 80, y: 120 } },
      { id: 'truncate-1', type: 'truncate', config: { limit: 5 }, position: { x: 300, y: 120 } },
      { id: 'output-json-1', type: 'output-json', config: { format: 'json' }, position: { x: 520, y: 120 } },
    ],
    edges: [
      { id: 'e1', source: 'fetch-rss-1', target: 'truncate-1' },
      { id: 'e2', source: 'truncate-1', target: 'output-json-1' },
    ],
  },
  explanation: ['A fetch-rss node materializes.', 'A truncate node keeps five souls.'],
};

function loggerSink() {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(String(chunk));
      cb();
    },
  });
  return {
    chunks,
    text: () => chunks.join(''),
    logger: {
      level: 'info',
      stream,
      redact: { paths: LOG_REDACT_PATHS, censor: '[REDACTED]' },
    },
  };
}

describe('Ghost BYOK', () => {
  const previousGhostMode = process.env.GHOST_MODE;
  const previousAccept = process.env.GHOST_ACCEPT_VISITOR_KEYS;

  beforeEach(() => {
    rateLimiter.clear();
    delete process.env.GHOST_MODE;
    delete process.env.GHOST_ACCEPT_VISITOR_KEYS;
  });

  afterEach(() => {
    rateLimiter.clear();
    if (previousGhostMode === undefined) delete process.env.GHOST_MODE;
    else process.env.GHOST_MODE = previousGhostMode;
    if (previousAccept === undefined) delete process.env.GHOST_ACCEPT_VISITOR_KEYS;
    else process.env.GHOST_ACCEPT_VISITOR_KEYS = previousAccept;
  });

  it('uses rule-based demo mode when no key is sent', async () => {
    const sink = loggerSink();
    const app = await createApp({ logger: sink.logger });
    const res = await app.inject({
      method: 'POST',
      url: '/api/ghost',
      payload: { prompt: 'fetch rss about rust, sort, top 5' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.mode).toBe('demo');
    expect(body.pipe?.nodes?.length).toBeGreaterThan(0);
    expect(Array.isArray(body.explanation)).toBe(true);
    expect(JSON.stringify(body)).not.toContain(SECRET);
    expect(sink.text()).not.toContain(SECRET);
    await app.close();
  });

  it('forwards a user key to the allowlisted provider and never echoes it', async () => {
    const sink = loggerSink();
    let seenAuth: string | undefined;
    let seenUrl: string | undefined;
    const llmFetch: typeof fetch = async (input, init) => {
      seenUrl = String(input);
      seenAuth = (init?.headers as Record<string, string> | undefined)?.Authorization;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(llmPipe) } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const app = await createApp({ logger: sink.logger, llmFetch });
    const res = await app.inject({
      method: 'POST',
      url: '/api/ghost',
      headers: { 'x-ghost-llm-key': SECRET },
      payload: { prompt: 'fetch rss about rust, sort, top 5', provider: 'openai' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.mode).toBe('llm');
    expect(body.pipe.name).toBe('Rust Digest');
    expect(seenUrl).toBe('https://api.openai.com/v1/chat/completions');
    expect(seenAuth).toBe(`Bearer ${SECRET}`);
    expect(JSON.stringify(body)).not.toContain(SECRET);
    expect(res.body).not.toContain(SECRET);
    expect(sink.text()).not.toContain(SECRET);
    await app.close();
  });

  it('redacts the BYOK header and bearer tokens in logger output and error text', () => {
    const chunks: string[] = [];
    const log = pino(
      { redact: { paths: LOG_REDACT_PATHS, censor: '[REDACTED]' } },
      { write(msg: string) { chunks.push(msg); } },
    );
    log.info({
      req: { headers: { 'x-ghost-llm-key': SECRET, authorization: `Bearer ${SECRET}` } },
      headers: { 'x-ghost-llm-key': SECRET },
    }, 'probe');
    const text = chunks.join('');
    expect(text).not.toContain(SECRET);
    expect(text).toMatch(/\[REDACTED\]/);
    expect(redactSecrets(`upstream failed for Bearer ${SECRET} and ${SECRET}`, [SECRET])).not.toContain(SECRET);
  });

  it('falls back to demo when the provider call fails, without leaking the key', async () => {
    const sink = loggerSink();
    const llmFetch: typeof fetch = async () => {
      throw new Error(`upstream failed for ${SECRET}`);
    };
    const app = await createApp({ logger: sink.logger, llmFetch });
    const res = await app.inject({
      method: 'POST',
      url: '/api/ghost',
      headers: { 'x-ghost-llm-key': SECRET },
      payload: { prompt: 'fetch rss, top 5' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.mode).toBe('demo');
    expect(body.fallbackReason).toBeTruthy();
    expect(JSON.stringify(body)).not.toContain(SECRET);
    expect(sink.text()).not.toContain(SECRET);
    await app.close();
  });

  it('falls back to demo for an unknown provider without calling a custom URL', async () => {
    let called = 0;
    const llmFetch: typeof fetch = async () => {
      called += 1;
      return new Response('nope', { status: 500 });
    };
    const app = await createApp({ llmFetch, logger: false });
    const res = await app.inject({
      method: 'POST',
      url: '/api/ghost',
      headers: { 'x-ghost-llm-key': SECRET },
      payload: { prompt: 'fetch rss, top 5', provider: 'https://evil.example' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.mode).toBe('demo');
    expect(body.fallbackReason).toMatch(/unknown provider/i);
    expect(called).toBe(0);
    expect(JSON.stringify(body)).not.toContain(SECRET);
    await app.close();
  });

  it('lists allowlisted providers without secrets', async () => {
    const app = await createApp({ logger: false });
    const res = await app.inject({ method: 'GET', url: '/api/ghost/providers' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.providers[0].id).toBe('openai');
    expect(body.providers[0].host).toBe('api.openai.com');
    expect(JSON.stringify(body)).not.toMatch(/sk-/);
    expect(JSON.stringify(body)).not.toContain('Authorization');
    await app.close();
  });

  it('does not forward a visitor key when GHOST_MODE is demo', async () => {
    process.env.GHOST_MODE = 'demo';
    let called = false;
    const llmFetch: typeof fetch = async () => {
      called = true;
      return new Response('{}', { status: 200 });
    };
    const app = await createApp({ logger: false, llmFetch });
    const res = await app.inject({
      method: 'POST',
      url: '/api/ghost',
      headers: { 'x-ghost-llm-key': SECRET },
      payload: { prompt: 'fetch rss about rust, sort, top 5' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.mode).toBe('demo');
    expect(body.fallbackReason).toMatch(/demo mode/i);
    expect(called).toBe(false);
    expect(JSON.stringify(body)).not.toContain(SECRET);
    await app.close();
  });

  it('forwards a visitor key when GHOST_MODE is demo but GHOST_ACCEPT_VISITOR_KEYS is true', async () => {
    process.env.GHOST_MODE = 'demo';
    process.env.GHOST_ACCEPT_VISITOR_KEYS = 'true';
    let seenAuth: string | undefined;
    const llmFetch: typeof fetch = async (_input, init) => {
      seenAuth = (init?.headers as Record<string, string> | undefined)?.Authorization;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(llmPipe) } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };
    const app = await createApp({ logger: false, llmFetch });
    const res = await app.inject({
      method: 'POST',
      url: '/api/ghost',
      headers: { 'x-ghost-llm-key': SECRET },
      payload: { prompt: 'fetch rss about rust, sort, top 5', provider: 'openai' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.mode).toBe('llm');
    expect(body.pipe.name).toBe('Rust Digest');
    expect(seenAuth).toBe(`Bearer ${SECRET}`);
    expect(JSON.stringify(body)).not.toContain(SECRET);
    await app.close();
  });

  it('redacts a key that appears inside a JSON object payload', async () => {
    const leaky = {
      ...llmPipe,
      explanation: [`used key ${SECRET}`],
    };
    const llmFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(leaky) } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    const app = await createApp({ logger: false, llmFetch });
    const res = await app.inject({
      method: 'POST',
      url: '/api/ghost',
      headers: { 'x-ghost-llm-key': SECRET },
      payload: { prompt: 'fetch rss about rust, sort, top 5', provider: 'openai' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain(SECRET);
    expect(JSON.stringify(res.json())).not.toContain(SECRET);
    expect(res.json().mode).toBe('llm');
    await app.close();
  });

  it('rejects an oversized prompt and ignores an oversized key', async () => {
    const { httpLimits } = await import('../src/pipe-limits.js');
    let called = 0;
    const llmFetch: typeof fetch = async () => {
      called += 1;
      return new Response('{}', { status: 200 });
    };
    const app = await createApp({ logger: false, llmFetch });
    const tooLong = await app.inject({
      method: 'POST',
      url: '/api/ghost',
      payload: { prompt: 'x'.repeat(httpLimits.maxPromptChars + 1) },
    });
    expect(tooLong.statusCode).toBe(400);
    expect(tooLong.json().error).toMatch(/too long/i);
    const oversizedKey = await app.inject({
      method: 'POST',
      url: '/api/ghost',
      headers: { 'x-ghost-llm-key': 'k'.repeat(httpLimits.maxKeyChars + 1) },
      payload: { prompt: 'fetch rss, top 5' },
    });
    expect(oversizedKey.statusCode).toBe(200);
    expect(oversizedKey.json().mode).toBe('demo');
    expect(called).toBe(0);
    await app.close();
  });

});
