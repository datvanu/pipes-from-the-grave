/**
 * Pipe API router for @pipes/server
 */
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import type { PipeDefinition } from '@pipes/engine';
import { runPipe as engineRunPipe, itemsToRss20 } from '@pipes/engine';
import {
  clientIp,
  gateExpensiveRun,
  hasItemsOverride,
  httpLimits,
  isServerPipeId,
  newPipeId,
  publicBaseUrl,
  runPipeBounded,
  sendRateLimited,
  validatePipeShape,
} from './pipe-limits.js';

export interface ServerPluginOptions extends FastifyPluginOptions {
  pipesStore: Map<string, PipeDefinition>;
  savePipesToFile: () => Promise<void>;
  exportCache: Map<string, { body: unknown; expires: number }>;
  runPipeFn?: typeof engineRunPipe;
  port?: number;
}

function preparePipe(
  body: PipeDefinition,
  pipesStore: Map<string, PipeDefinition>,
): { error?: string; pipe?: PipeDefinition } {
  const shapeError = validatePipeShape(body);
  if (shapeError) return { error: shapeError };
  if (hasItemsOverride(body)) {
    return { error: 'itemsOverride is not allowed on the public API' };
  }

  const now = new Date().toISOString();
  const existingId = isServerPipeId(body.id) && pipesStore.has(body.id) ? body.id : null;
  const id = existingId || newPipeId();
  const previous = existingId ? pipesStore.get(id) : undefined;

  const pipe: PipeDefinition = {
    ...body,
    id,
    createdAt: previous?.createdAt || now,
    updatedAt: now,
  };
  return { pipe };
}

export async function pipeRouter(app: FastifyInstance, options: ServerPluginOptions) {
  const { pipesStore, savePipesToFile, exportCache } = options;
  const runFn = options.runPipeFn || engineRunPipe;
  const port = options.port || 8787;

  // GET /api/pipes — intentionally not listed (no public inventory).

  app.get('/api/pipes/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const pipe = pipesStore.get(id);
    if (!pipe) {
      reply.code(404).send({ error: 'Pipe not found' });
      return;
    }
    return pipe;
  });

  // Create a new pipe (server-assigned UUID) or update an existing unguessable id.
  app.post('/api/pipes', async (request, reply) => {
    const prepared = preparePipe((request.body || {}) as PipeDefinition, pipesStore);
    if (prepared.error || !prepared.pipe) {
      reply.code(400).send({ error: prepared.error });
      return;
    }
    const created = !pipesStore.has(prepared.pipe.id);
    pipesStore.set(prepared.pipe.id, prepared.pipe);
    void savePipesToFile();
    reply.code(created ? 201 : 200).send(prepared.pipe);
  });

  // DELETE is not public. Unregistered routes under /api/* 404.

  async function executeRun(pipe: PipeDefinition, request: any, reply: any, persist: boolean) {
    if (hasItemsOverride(pipe) || validatePipeShape(pipe)) {
      const err = hasItemsOverride(pipe)
        ? 'itemsOverride is not allowed on the public API'
        : validatePipeShape(pipe);
      reply.code(400).send({ error: err });
      return;
    }

    const gate = gateExpensiveRun(clientIp(request));
    reply.header('X-RateLimit-Remaining', String(gate.remaining));
    if (!gate.allowed) {
      sendRateLimited(reply, gate, 'Too many pipe runs. Please try again later.');
      return;
    }

    let stored = pipe;
    if (persist) {
      const prepared = preparePipe(pipe, pipesStore);
      if (prepared.error || !prepared.pipe) {
        reply.code(400).send({ error: prepared.error });
        return;
      }
      stored = prepared.pipe;
      pipesStore.set(stored.id, stored);
      void savePipesToFile();
    }

    try {
      const startTime = Date.now();
      const result = await runPipeBounded(() => runFn(stored));
      const durationMs = Date.now() - startTime;
      const base = publicBaseUrl(request, port);
      reply.code(200).send({
        output: result.output,
        itemsByNode: result.itemsByNode,
        durationMs,
        rateLimit: {
          remaining: gate.remaining,
          resetMs: gate.resetMs,
        },
        ...(persist
          ? {
              pipeId: stored.id,
              exports: {
                json: `${base}/p/${stored.id}.json`,
                rss: `${base}/p/${stored.id}.rss`,
              },
            }
          : {}),
      });
    } catch (error: any) {
      const message = error?.message || 'Failed to run pipe';
      const timedOut = /timed out/i.test(message);
      reply.code(timedOut ? 504 : 400).send({
        error: 'Failed to run pipe',
        message,
      });
    }
  }

  // Run a pipe from the request body (preferred). Optional persist creates an ephemeral export id.
  app.post('/api/pipes/run', async (request, reply) => {
    const body = (request.body || {}) as { pipe?: PipeDefinition; persist?: boolean };
    const pipe = body.pipe;
    if (!pipe) {
      reply.code(400).send({ error: 'Pipe definition is required' });
      return;
    }
    await executeRun(pipe, request, reply, body.persist !== false);
  });

  app.post('/api/pipes/:id/run', async (request, reply) => {
    const { id } = request.params as { id: string };
    const pipe = pipesStore.get(id);
    if (!pipe) {
      reply.code(404).send({ error: 'Pipe not found' });
      return;
    }
    await executeRun(pipe, request, reply, false);
  });

  async function exportPipe(
    request: any,
    reply: any,
    format: 'json' | 'rss',
  ) {
    const { id } = request.params as { id: string };
    const gate = gateExpensiveRun(clientIp(request));
    reply.header('X-RateLimit-Remaining', String(gate.remaining));
    if (!gate.allowed) {
      sendRateLimited(reply, gate, 'Too many export requests. Please try again later.');
      return;
    }

    if (!pipesStore.has(id)) {
      reply.code(404).send({ error: 'Pipe not found' });
      return;
    }

    const cacheKey = `${id}:${format}`;
    const cached = exportCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      reply
        .code(200)
        .header('Content-Type', format === 'rss' ? 'application/rss+xml' : 'application/json')
        .send(cached.body);
      return;
    }

    const pipe = pipesStore.get(id)!;
    if (hasItemsOverride(pipe)) {
      reply.code(400).send({ error: 'itemsOverride is not allowed on the public API' });
      return;
    }

    try {
      const result = await runPipeBounded(() => runFn(pipe));
      let body: unknown = result.output;
      if (format === 'rss') {
        body = itemsToRss20(result.output, {
          title: `${pipe.name} - Pipes from the Grave`,
          link: `${publicBaseUrl(request, port)}/p/${pipe.id}.rss`,
          description: `RSS feed generated from pipe: ${pipe.name}`,
          generator: 'pipes-from-the-grave',
        });
      }
      exportCache.set(cacheKey, { body, expires: Date.now() + 60_000 });
      reply
        .code(200)
        .header('Content-Type', format === 'rss' ? 'application/rss+xml' : 'application/json')
        .send(body);
    } catch (error: any) {
      const message = error?.message || 'Failed to run pipe';
      const timedOut = /timed out/i.test(message);
      reply.code(timedOut ? 504 : 400).send({
        error: 'Failed to run pipe',
        message,
      });
    }
  }

  app.get('/p/:id.json', (request, reply) => exportPipe(request, reply, 'json'));
  app.get('/p/:id.rss', (request, reply) => exportPipe(request, reply, 'rss'));
}

export { httpLimits };
