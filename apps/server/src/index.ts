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
import { isSafeUrl } from '@pipes/engine';
import { checkRateLimit } from './rate-limit.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8787;

// In-memory pipe store
const pipesStore: Map<string, PipeDefinition> = new Map();

// Optional file persistence
const PERSISTENCE_FILE = path.join(__dirname, '..', 'data', 'pipes.json');

// Cache for exported pipes
const exportCache = new Map<string, { items: any; expires: number }>();

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

/**
 * Initialize server
 */
export async function startServer() {
  const app = Fastify({
    logger: true,
  });

  // CORS - allow localhost for dev
  await app.register(cors, {
    origin: [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Static files from web dist (if exists)
  const webDistPath = path.join(__dirname, '..', '..', 'apps', 'web', 'dist');
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

  // Pipe routes
  app.register(pipeRouter, { pipesStore, savePipesToFile });

  // Ghost builder endpoint
  app.post('/api/ghost', async (request, reply) => {
    try {
      const body = request.body as { prompt: string };
      
      if (!body.prompt || typeof body.prompt !== 'string') {
        reply.code(400).send({ error: 'Missing or invalid prompt' });
        return;
      }

      const clientIp = (request.ip || request.headers['x-forwarded-for'] || 'unknown') as string;
      const rl = checkRateLimit(`ghost:${clientIp}`, { windowMs: 60000, max: 20 });
      reply.header('X-RateLimit-Remaining', String(rl.remaining));
      if (!rl.allowed) {
        reply.code(429).header('Retry-After', String(Math.ceil(rl.resetMs / 1000)));
        reply.send({
          error: 'Rate limit exceeded',
          message: 'Too many ghost séances. Please try again later.',
          retryAfterMs: rl.resetMs,
          remaining: 0,
        });
        return;
      }

      const { buildPipeFromPrompt } = await import('./ghost.js');
      const result = buildPipeFromPrompt(body.prompt);

      reply.code(200).send(result);
    } catch (error: any) {
      console.error('Ghost builder error:', error);
      reply.code(500).send({ 
        error: 'Ghost builder failed', 
        message: error.message 
      });
    }
  });

  // Export endpoints (public pipes)
  app.get('/p/:id.json', async (request, reply) => {
    const id = request.params.id as string;
    
    if (!pipesStore.has(id)) {
      reply.code(404).send({ error: 'Pipe not found' });
      return;
    }

    // Check cache
    const cached = exportCache.get(id);
    if (cached && cached.expires > Date.now()) {
      reply.code(200).header('Content-Type', 'application/json');
      reply.send(cached.items);
      return;
    }

    const pipe = pipesStore.get(id)!;
    
    try {
      const { runPipe } = await import('@pipes/engine');
      const result = await runPipe(pipe);
      
      const cacheDuration = 60000; // 60 seconds
      exportCache.set(id, {
        items: result.output,
        expires: Date.now() + cacheDuration,
      });

      reply.code(200).header('Content-Type', 'application/json');
      reply.send(result.output);
    } catch (error: any) {
      reply.code(400).send({ 
        error: 'Failed to run pipe', 
        message: error.message 
      });
    }
  });

  app.get('/p/:id.rss', async (request, reply) => {
    const id = request.params.id as string;
    
    if (!pipesStore.has(id)) {
      reply.code(404).send({ error: 'Pipe not found' });
      return;
    }

    // Check cache
    const cached = exportCache.get(id);
    if (cached && cached.expires > Date.now()) {
      reply.code(200).header('Content-Type', 'application/rss+xml');
      reply.send(cached.items);
      return;
    }

    const pipe = pipesStore.get(id)!;
    
    try {
      const { runPipe, itemsToRss20 } = await import('@pipes/engine');
      const result = await runPipe(pipe);
      
      // Add channel metadata
      const channelMeta = {
        title: `${pipe.name} - Pipes from the Grave`,
        link: `http://localhost:${PORT}/p/${pipe.id}.rss`,
        description: `RSS feed generated from pipe: ${pipe.name}`,
        generator: 'pipes-from-the-grave',
      };

      const rss = itemsToRss20(result.output, channelMeta);
      
      const cacheDuration = 60000; // 60 seconds
      exportCache.set(id, {
        items: rss,
        expires: Date.now() + cacheDuration,
      });

      reply.code(200).header('Content-Type', 'application/rss+xml');
      reply.send(rss);
    } catch (error: any) {
      reply.code(400).send({ 
        error: 'Failed to run pipe', 
        message: error.message 
      });
    }
  });

  // Start server
  try {
    // Load from file if exists
    const loadedPipes = await loadPipesFromFile();
    for (const [id, pipe] of loadedPipes) {
      pipesStore.set(id, pipe);
    }

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
