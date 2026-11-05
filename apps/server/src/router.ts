/**
 * Pipe API router for @pipes/server
 */

import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { PipeDefinition } from '@pipes/engine';
import { v4 as uuidv4 } from 'uuid';
import { runPipe, itemsToJson, itemsToRss20 } from '@pipes/engine';

export interface ServerPluginOptions extends FastifyPluginOptions {
  pipesStore: Map<string, PipeDefinition>;
  savePipesToFile: () => Promise<void>;
}

export async function pipeRouter(
  app: FastifyInstance,
  options: ServerPluginOptions,
) {
  const { pipesStore, savePipesToFile } = options;

  // GET /api/pipes - List all pipes
  app.get('/api/pipes', async (request, reply) => {
    const pipes = Array.from(pipesStore.values()).map(p => ({
      id: p.id,
      name: p.name,
      nodes: p.nodes.length,
      edges: p.edges.length,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
    return { pipes };
  });

  // GET /api/pipes/:id - Get a specific pipe
  app.get('/api/pipes/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const pipe = pipesStore.get(id);

    if (!pipe) {
      reply.code(404).send({ error: 'Pipe not found' });
      return;
    }

    return pipe;
  });

  // POST /api/pipes - Create or update a pipe
  app.post('/api/pipes', async (request, reply) => {
    const body = request.body as PipeDefinition;

    // Validate required fields
    if (!body.name) {
      reply.code(400).send({ error: 'Pipe must have a name' });
      return;
    }

    if (!body.nodes || body.nodes.length === 0) {
      reply.code(400).send({ error: 'Pipe must have at least one node' });
      return;
    }

    // Generate ID if not provided
    const id = body.id || uuidv4();
    const now = new Date().toISOString();

    const pipe: PipeDefinition = {
      ...body,
      id,
      createdAt: body.createdAt || now,
      updatedAt: now,
    };

    pipesStore.set(id, pipe);
    savePipesToFile();

    reply.code(201).send(pipe);
  });

  // DELETE /api/pipes/:id - Delete a pipe
  app.delete('/api/pipes/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    
    if (!pipesStore.has(id)) {
      reply.code(404).send({ error: 'Pipe not found' });
      return;
    }

    pipesStore.delete(id);
    savePipesToFile();

    reply.code(204).send();
  });

  // POST /api/pipes/:id/run - Run a pipe
  app.post('/api/pipes/:id/run', async (request, reply) => {
    const { id } = request.params as { id: string };
    const pipe = pipesStore.get(id);

    if (!pipe) {
      reply.code(404).send({ error: 'Pipe not found' });
      return;
    }

    try {
      const result = await runPipe(pipe);
      reply.code(200).send(result);
    } catch (error: any) {
      reply.code(400).send({ 
        error: 'Failed to run pipe', 
        message: error.message 
      });
    }
  });
}
