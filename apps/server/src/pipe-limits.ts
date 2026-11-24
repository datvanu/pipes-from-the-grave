/**
 * Public-API limits and helpers for pipe create/run/export.
 */
import type { PipeDefinition } from '@pipes/engine';
import { NODE_TYPES } from '@pipes/engine';
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
  createPerIp: 30,
  createGlobal: 120,
  storeMaxEntries: 200,
  storeMaxBytes: 10 * 1024 * 1024,
  storeTtlMs: 45 * 60 * 1000,
  maxPromptChars: 8 * 1024,
  maxKeyChars: 512,
};

export function clientIp(request: { ip?: string }): string {
  return (request.ip || 'unknown').split(',')[0]!.trim() || 'unknown';
}

export function isHostedProduction(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.RENDER) || env.NODE_ENV === 'production';
}

/**
 * Canonical public origin for export links. In production only PUBLIC_BASE_URL
 * is used — Host and Forwarded headers are not trusted.
 */
export function publicBaseUrl(request: { protocol?: string; headers: Record<string, unknown> }, fallbackPort: number): string {
  const fromEnv = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  if (isHostedProduction()) return '';
  const proto = request.protocol || 'http';
  const host = String(request.headers.host || `localhost:${fallbackPort}`);
  return `${proto}://${host}`;
}

export function exportHref(base: string, path: string): string {
  if (!base) return path.startsWith('/') ? path : `/${path}`;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

function parseBoolEnv(raw: string): boolean | undefined {
  const value = raw.trim().toLowerCase();
  if (value === '1' || value === 'true' || value === 'yes') return true;
  if (value === '0' || value === 'false' || value === 'no') return false;
  return undefined;
}

/**
 * Whether this host forwards an optional visitor-supplied LLM key (BYOK).
 * GHOST_ACCEPT_VISITOR_KEYS wins when set. Otherwise GHOST_MODE=demo
 * disables forwarding; unset or "byok" allows it. There is never a
 * host-owned key. The rule-based demo remains the default when no key
 * is sent.
 */
export function acceptsVisitorKeys(env: NodeJS.ProcessEnv = process.env): boolean {
  const explicit = parseBoolEnv(env.GHOST_ACCEPT_VISITOR_KEYS || '');
  if (explicit !== undefined) return explicit;
  return (env.GHOST_MODE || '').trim().toLowerCase() !== 'demo';
}

export function isGhostDemoOnly(env: NodeJS.ProcessEnv = process.env): boolean {
  return !acceptsVisitorKeys(env);
}

export function parseTrustProxy(
  env: NodeJS.ProcessEnv = process.env,
): boolean | ((address: string, hop: number) => boolean) {
  const raw = (env.TRUST_PROXY || '').trim();
  if (raw === '0' || raw.toLowerCase() === 'false') return false;
  const hopsFrom = (hops: number) => (_address: string, hop: number) => hop < hops;
  if (raw === '1' || raw.toLowerCase() === 'true') return hopsFrom(1);
  if (/^\d+$/.test(raw)) return hopsFrom(Number(raw));
  if (env.RENDER) return hopsFrom(1);
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
  const allowed = new Set(NODE_TYPES);
  for (const node of pipe.nodes) {
    if (!node || typeof node.id !== 'string' || !allowed.has(node.type as (typeof NODE_TYPES)[number])) {
      return 'Pipe contains an unknown or invalid node type';
    }
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
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs = httpLimits.runTimeoutMs,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const timeoutError = new Error(`Pipe run timed out after ${timeoutMs}ms`);
  try {
    return await Promise.race([
      run(controller.signal),
      new Promise<T>((_, reject) => {
        if (controller.signal.aborted) {
          reject(timeoutError);
          return;
        }
        controller.signal.addEventListener('abort', () => reject(timeoutError), { once: true });
      }),
    ]);
  } finally {
    clearTimeout(timer);
    if (!controller.signal.aborted) controller.abort();
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

export function gateCreate(ip: string): RunGate {
  const perIp = checkRateLimit(`create:${ip}`, {
    windowMs: httpLimits.windowMs,
    max: httpLimits.createPerIp,
  });
  if (!perIp.allowed) return perIp;
  const global = checkRateLimit('create:global', {
    windowMs: httpLimits.windowMs,
    max: httpLimits.createGlobal,
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

export function sendRateLimited(
  reply: { code: (status: number) => { header: (name: string, value: string) => unknown }; header: (name: string, value: string) => unknown; send: (payload: unknown) => unknown },
  gate: RunGate,
  message: string,
) {
  reply.code(429).header('Retry-After', String(Math.ceil(gate.resetMs / 1000)));
  reply.header('X-RateLimit-Remaining', '0');
  reply.send({
    error: 'Rate limit exceeded',
    message,
    retryAfterMs: gate.resetMs,
    remaining: 0,
  });
}
