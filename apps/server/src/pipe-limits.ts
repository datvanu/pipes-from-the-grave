/**
 * Public-API limits and helpers for pipe create/run/export.
 */
import type { PipeDefinition } from '@pipes/engine';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { checkRateLimit } from './rate-limit.js';

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isServerPipeId(id: unknown): id is string {
  return typeof id === 'string' && UUID_RE.test(id);
}

export function newPipeId(): string {
  return crypto.randomUUID();
}

/** Mutable so tests can tighten windows without exposing a public env knob. */
export const httpLimits = {
  windowMs: 60_000,
  runPerIp: 30,
  runGlobal: 120,
  ghostPerIp: 20,
  ghostGlobal: 60,
  maxNodes: 20,
  maxEdges: 40,
  maxBodyBytes: 256 * 1024,
  runTimeoutMs: 25_000,
};

export function clientIp(request: FastifyRequest): string {
  return (request.ip || 'unknown').split(',')[0]!.trim() || 'unknown';
}

export function publicBaseUrl(request: FastifyRequest, fallbackPort: number): string {
  const fromEnv = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  const forwardedProto = String(request.headers['x-forwarded-proto'] || '').split(',')[0]!.trim();
  const proto = forwardedProto || request.protocol || 'http';
  const forwardedHost = String(request.headers['x-forwarded-host'] || '').split(',')[0]!.trim();
  const host = forwardedHost || String(request.headers.host || `localhost:${fallbackPort}`);
  return `${proto}://${host}`;
}

export function isGhostDemoOnly(): boolean {
  return (process.env.GHOST_MODE || '').trim().toLowerCase() === 'demo';
}

export function parseTrustProxy(env: NodeJS.ProcessEnv = process.env): boolean | number {
  const raw = (env.TRUST_PROXY || '').trim();
  if (raw === '0' || raw.toLowerCase() === 'false') return false;
  if (raw === '1' || raw.toLowerCase() === 'true') return 1;
  if (/^\d+$/.test(raw)) return Number(raw);
  if (env.RENDER) return 1;
  return false;
}

export function validatePipeShape(pipe: PipeDefinition | undefined): string | null {
  if (!pipe || typeof pipe !== 'object') return 'Pipe definition is required';
  if (!pipe.name || typeof pipe.name !== 'string') return 'Pipe must have a name';
  if (!Array.isArray(pipe.nodes) || pipe.nodes.length === 0) {
    return 'Pipe must have at least one node';
  }
  if (!Array.isArray(pipe.edges)) return 'Pipe must have an edges array';
  if (pipe.nodes.length > httpLimits.maxNodes) {
    return `Pipe exceeds the limit of ${httpLimits.maxNodes} nodes`;
  }
  if (pipe.edges.length > httpLimits.maxEdges) {
    return `Pipe exceeds the limit of ${httpLimits.maxEdges} edges`;
  }
  return null;
}

export function hasItemsOverride(pipe: PipeDefinition): boolean {
  return (pipe.nodes || []).some(
    (node) =>
      node?.config != null &&
      typeof node.config === 'object' &&
      (node.config as { itemsOverride?: unknown }).itemsOverride != null,
  );
}

export async function runPipeBounded<T>(
  run: () => Promise<T>,
  timeoutMs = httpLimits.runTimeoutMs,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Pipe run timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type RunGate = {
  allowed: boolean;
  remaining: number;
  resetMs: number;
};

export function gateExpensiveRun(ip: string): RunGate {
  const perIp = checkRateLimit(`run:${ip}`, {
    windowMs: httpLimits.windowMs,
    max: httpLimits.runPerIp,
  });
  if (!perIp.allowed) return perIp;
  const global = checkRateLimit('run:global', {
    windowMs: httpLimits.windowMs,
    max: httpLimits.runGlobal,
  });
  if (!global.allowed) return global;
  return {
    allowed: true,
    remaining: Math.min(perIp.remaining, global.remaining),
    resetMs: Math.max(perIp.resetMs, global.resetMs),
  };
}

export function gateGhost(ip: string): RunGate {
  const perIp = checkRateLimit(`ghost:${ip}`, {
    windowMs: httpLimits.windowMs,
    max: httpLimits.ghostPerIp,
  });
  if (!perIp.allowed) return perIp;
  const global = checkRateLimit('ghost:global', {
    windowMs: httpLimits.windowMs,
    max: httpLimits.ghostGlobal,
  });
  if (!global.allowed) return global;
  return {
    allowed: true,
    remaining: Math.min(perIp.remaining, global.remaining),
    resetMs: Math.max(perIp.resetMs, global.resetMs),
  };
}

export function sendRateLimited(reply: FastifyReply, gate: RunGate, message: string) {
  reply.code(429).header('Retry-After', String(Math.ceil(gate.resetMs / 1000)));
  reply.header('X-RateLimit-Remaining', '0');
  reply.send({
    error: 'Rate limit exceeded',
    message,
    retryAfterMs: gate.resetMs,
    remaining: 0,
  });
}
