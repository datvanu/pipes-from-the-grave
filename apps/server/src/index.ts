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
import { clientIp, gateGhost, isGhostDemoOnly, isHostedProduction, parseTrustProxy, httpLimits, sendRateLimited } from './pipe-limits.js';
import { EphemeralPipeStore, type ExportCacheEntry } from './pipe-store.js';
import { Stream } from 'node:stream';
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

const pipesStore = new EphemeralPipeStore();

// Optional file persistence
const PERSISTENCE_FILE = path.join(__dirname, '..', 'data', 'pipes.json');

// Cache for exported pipes, keyed by `${id}:${format}:${origin}`.
const exportCache = new Map<string, ExportCacheEntry>();

/** Test helper: drop in-memory pipes and export cache. */
export function resetMemoryState() {
  pipesStore.clear();
  exportCache.clear();
}

/**
 * Load pipes from file (if exists)
 */
async function loadPipesFromFile(): Promise<PipeDefinition[]> {
  try {
    const fs = await import('fs/promises');
    const data = await fs.readFile(PERSISTENCE_FILE, 'utf8');
    const stored = JSON.parse(data) as PipeDefinition[];
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
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
    
    const pipes = pipesStore.values();
    await fs.writeFile(PERSISTENCE_FILE, JSON.stringify(pipes, null, 2));
  } catch (error) {
    console.error('Failed to save pipes to file:', error);
  }
}


const CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";

function applySecurityHeaders(set: (name: string, value: string) => void) {
  set('X-Content-Type-Options', 'nosniff');
  set('X-Frame-Options', 'DENY');
  set('Referrer-Policy', 'no-referrer');
  set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  if (isHostedProduction() || process.env.PUBLIC_BASE_URL?.startsWith('https:')) {
    set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
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

  // CORS: explicit allowlist, or same-origin only when hosted, localhost in dev.
  const corsEnv = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const corsOrigins = corsEnv.length
    ? corsEnv
    : isHostedProduction()
      ? false
      : [
          'http://localhost:3000',
          'http://localhost:5173',
          'http://127.0.0.1:3000',
          'http://127.0.0.1:5173',
        ];
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
      setHeaders: (res, filePath) => {
        const raw = (res as { raw?: { setHeader: (name: string, value: string) => void }; setHeader?: (name: string, value: string) => void });
        const set = (name: string, value: string) => {
          if (typeof raw.setHeader === 'function') raw.setHeader(name, value);
          else raw.raw?.setHeader(name, value);
        };
        applySecurityHeaders(set);
        if (filePath.endsWith('.html')) set('Cache-Control', 'no-cache');
      },
    });
  }

  // Health check also advertises whether visitor keys are accepted.
  app.get('/api/health', async () => {
    const demo = isGhostDemoOnly();
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      ghost: { mode: demo ? 'demo' : 'byok', acceptVisitorKeys: !demo },
    };
  });

  app.addHook('onRequest', (_request, reply, done) => {
    applySecurityHeaders((name, value) => {
      reply.header(name, value);
    });
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

  // Serialize first, then redact, so JSON objects cannot leak a key.
  app.addHook('onSend', (request, reply, payload, done) => {
    if (payload == null || payload instanceof Stream) {
      done(null, payload);
      return;
    }
    const key = readGhostLlmKey(request.headers as Record<string, unknown>);
    const secrets = key ? [key] : [];
    let text: string;
    let asJson = false;
    if (typeof payload === 'string') {
      text = payload;
    } else if (Buffer.isBuffer(payload)) {
      text = payload.toString();
    } else {
      try {
        text = JSON.stringify(payload);
        asJson = true;
      } catch {
        done(null, payload);
        return;
      }
    }
    const redacted = redactSecrets(text, secrets);
    if (asJson) {
      reply.header('Content-Type', 'application/json; charset=utf-8');
    }
    done(null, redacted);
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
      if (body.prompt.length > httpLimits.maxPromptChars) {
        reply.code(400).send({ error: 'Prompt is too long' });
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
    for (const pipe of loadedPipes) {
      if (pipe?.id) pipesStore.set(pipe.id, pipe);
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
