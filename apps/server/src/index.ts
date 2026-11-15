/**
 * @pipes/server - Fastify API server for pipe management
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import staticPlugin from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import { pipeRouter } from './router.js';
import type { PipeDefinition } from '@pipes/engine';
import type { runPipe as RunPipeFn } from '@pipes/engine';
import { clientIp, gateGhost, isGhostDemoOnly, parseTrustProxy, httpLimits, sendRateLimited } from './pipe-limits.js';
import {
  LOG_REDACT_PATHS,
  buildPipeWithUserKey,
  listPublicProviders,
  payloadContainsSecret,
  readGhostLlmKey,
  redactSecrets,
  resolveProvider,
} from './ghost-llm.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8787;

// In-memory pipe store
const pipesStore: Map<string, PipeDefinition> = new Map();

// Optional file persistence
const PERSISTENCE_FILE = path.join(__dirname, '..', 'data', 'pipes.json');

// Cache for exported pipes, keyed by `${id}:json` or `${id}:rss`.
const exportCache = new Map<string, { body: unknown; expires: number }>();

/** Test helper: drop in-memory pipes and export cache. */
export function resetMemoryState() {
  pipesStore.clear();
  exportCache.clear();
}

/**
 * Load pipes from file (if exists)
 */
async function loadPipesFromFile(): Promise<Map<string, PipeDefinition>> {
  try {
    const fs = await import('fs/promises');
    const data = await fs.readFile(PERSISTENCE_FILE, 'utf8');
    const stored = JSON.parse(data) as PipeDefinition[];
    return new Map(stored.map(p => [p.id, p]));
  } catch {
    return new Map();
  }
}

/**
 * Save pipes to file
 */
async function savePipesToFile(): Promise<void> {
  try {
    const fs = await import('fs/promises');
    const fsDir = await import('fs');
    
    // Ensure data directory exists
    const dataDir = path.dirname(PERSISTENCE_FILE);
    if (!fsDir.existsSync(dataDir)) {
      fsDir.mkdirSync(dataDir, { recursive: true });
    }
    
    const pipes = Array.from(pipesStore.values());
    await fs.writeFile(PERSISTENCE_FILE, JSON.stringify(pipes, null, 2));
  } catch (error) {
    console.error('Failed to save pipes to file:', error);
  }
}

export type CreateAppOptions = {
  logger?: boolean | Record<string, unknown>;
  llmFetch?: typeof fetch;
  runPipeFn?: typeof RunPipeFn;
};

/**
 * Build the Fastify app without listening. Used by tests and startServer().
 */
export async function createApp(options: CreateAppOptions = {}) {
  const app = Fastify({
    logger: options.logger ?? {
      redact: { paths: LOG_REDACT_PATHS, censor: '[REDACTED]' },
    },
    trustProxy: parseTrustProxy(),
    bodyLimit: httpLimits.maxBodyBytes,
  });

  // CORS — localhost defaults for dev; set CORS_ORIGINS for a hosted frontend.
  const corsOrigins = (process.env.CORS_ORIGINS ||
    'http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  await app.register(cors, {
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Ghost-LLM-Key'],
  });

  // Static files from the Vite build (apps/web/dist), overridable for containers.
  const webDistPath = process.env.WEB_DIST_DIR
    ? path.resolve(process.env.WEB_DIST_DIR)
    : path.join(__dirname, '..', '..', 'web', 'dist');
  const webDistExists = await import('fs/promises')
    .then(fs => fs.stat(webDistPath).then(() => true).catch(() => false));

  if (webDistExists) {
    await app.register(staticPlugin, {
      root: webDistPath,
      prefix: '/',
      maxAge: '1d',
      cacheControl: true,
      setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    });
  }

  // Health check
  app.get('/api/health', async (request, reply) => {
    return { status: 'healthy', timestamp: new Date().toISOString() };
  });

  // Pre-handler to set rate limit headers when available
  app.addHook('preHandler', (request, reply, done) => {
    // Add common headers that might be useful
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    done();
  });

  // Pipe routes (create/get/run/export). No public list or delete.
  app.register(pipeRouter, {
    pipesStore,
    savePipesToFile,
    exportCache,
    runPipeFn: options.runPipeFn,
    port: PORT,
  });

  // Never echo a user-supplied LLM key in a response body.
  app.addHook('onSend', (request, _reply, payload, done) => {
    const key = readGhostLlmKey(request.headers as Record<string, unknown>);
    const secrets = key ? [key] : [];
    if (payloadContainsSecret(payload, secrets) && (typeof payload === 'string' || Buffer.isBuffer(payload))) {
      done(null, redactSecrets(payload.toString(), secrets));
      return;
    }
    done(null, payload);
  });

  app.get('/api/ghost/providers', async () => {
    return { providers: listPublicProviders() };
  });

  // Ghost builder endpoint
  app.post('/api/ghost', async (request, reply) => {
    const apiKey = readGhostLlmKey(request.headers as Record<string, unknown>);
    const redact = (value: unknown) => redactSecrets(String(value ?? ''), apiKey ? [apiKey] : []);
    try {
      const body = (request.body || {}) as { prompt?: string; provider?: string; model?: string };

      if (!body.prompt || typeof body.prompt !== 'string') {
        reply.code(400).send({ error: 'Missing or invalid prompt' });
        return;
      }

      const rl = gateGhost(clientIp(request));
      reply.header('X-RateLimit-Remaining', String(rl.remaining));
      if (!rl.allowed) {
        sendRateLimited(reply, rl, 'Too many ghost séances. Please try again later.');
        return;
      }

      const { buildPipeFromPrompt } = await import('./ghost.js');

      // Default is the free, rule-based demo. A user-supplied key is
      // forwarded once to an allowlisted provider and never stored.
      // GHOST_MODE=demo (hosted jury URL) refuses forwarding entirely.
      if (!apiKey || isGhostDemoOnly()) {
        const result = buildPipeFromPrompt(body.prompt);
        reply.code(200).send({
          ...result,
          mode: 'demo',
          ...(apiKey && isGhostDemoOnly()
            ? { fallbackReason: 'This host is in demo mode; visitor keys are not forwarded.' }
            : {}),
        });
        return;
      }

      if (body.provider && !resolveProvider(body.provider)) {
        const result = buildPipeFromPrompt(body.prompt);
        reply.code(200).send({
          ...result,
          mode: 'demo',
          fallbackReason: 'Unknown provider; used the rule-based demo instead.',
        });
        return;
      }

      try {
        const result = await buildPipeWithUserKey({
          prompt: body.prompt,
          apiKey,
          providerId: body.provider,
          model: body.model,
          fetchFn: options.llmFetch,
        });
        reply.code(200).send({ ...result, mode: 'llm' });
      } catch (error: any) {
        request.log.warn({ err: redact(error?.message || error) }, 'Ghost LLM failed; falling back to demo');
        const result = buildPipeFromPrompt(body.prompt);
        reply.code(200).send({
          ...result,
          mode: 'demo',
          fallbackReason: redact(error?.message || 'Ghost LLM failed; used the rule-based demo instead.'),
        });
      }
    } catch (error: any) {
      request.log.error({ err: redact(error?.message || error) }, 'Ghost builder failed');
      reply.code(500).send({
        error: 'Ghost builder failed',
        message: redact(error?.message || 'unknown error'),
      });
    }
  });

  // SPA fallback for the hosted Vite build (non-API routes).
  app.setNotFoundHandler(async (request, reply) => {
    const url = request.raw.url || '';
    if (url.startsWith('/api') || url.startsWith('/p/')) {
      reply.code(404).send({ error: 'Not found' });
      return;
    }
    if (webDistExists) {
      return reply.sendFile('index.html');
    }
    reply.code(404).send({ error: 'Not found' });
  });

  return app;
}

/**
 * Initialize and listen.
 */
export async function startServer() {
  try {
    const loadedPipes = await loadPipesFromFile();
    for (const [id, pipe] of loadedPipes) {
      pipesStore.set(id, pipe);
    }

    const app = await createApp();
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`Server listening on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
    return app;
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Auto-start if run directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('index.ts')) {
  startServer();
}
