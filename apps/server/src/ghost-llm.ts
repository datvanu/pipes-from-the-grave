/**
 * Optional BYOK Ghost: forward a user-supplied key to an allowlisted,
 * OpenAI-compatible Chat Completions endpoint. The server never stores the key.
 * Provider URLs are hardcoded (no caller-supplied URL) to avoid SSRF.
 */

import type { PipeDefinition, PipeNode, PipeEdge, NodeType } from '@pipes/engine';
import { isSafeUrl } from '@pipes/engine';
import { validatePipeNodes } from './ghost.js';

export const GHOST_LLM_KEY_HEADER = 'x-ghost-llm-key';

export const GHOST_LLM_PROVIDERS = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    url: 'https://api.openai.com/v1/chat/completions',
    host: 'api.openai.com',
    defaultModel: 'gpt-4o-mini',
  },
} as const;

export type GhostLlmProviderId = keyof typeof GHOST_LLM_PROVIDERS;

export const LOG_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers["x-ghost-llm-key"]',
  'headers.authorization',
  'headers["x-ghost-llm-key"]',
  'err.config.headers.authorization',
  'err.config.headers["x-ghost-llm-key"]',
];

const VALID_NODE_TYPES: NodeType[] = [
  'fetch-rss',
  'fetch-json',
  'filter',
  'sort',
  'merge',
  'truncate',
  'regex',
  'rename',
  'output-rss',
  'output-json',
];

const SYSTEM_PROMPT = `You are the Ghost builder for Pipes from the Grave, a visual feed and data pipe editor.
Return ONLY a JSON object, with no markdown and no commentary, in this shape:
{"pipe":{"name":"short name","nodes":[{"id":"string","type":"fetch-rss","config":{},"position":{"x":80,"y":120}}],"edges":[{"id":"string","source":"node-id","target":"node-id"}]},"explanation":["short spooky sentence"]}
Allowed node types: fetch-rss, fetch-json, filter, sort, merge, truncate, regex, rename, output-rss, output-json.
Config shapes: fetch-rss/fetch-json {url}; filter {field,op,value} with op one of equals|contains|regex|gt|gte|lt|lte; sort {field,order:"asc"|"desc"}; truncate {limit}; regex {field,pattern,replacement}; rename {mapping:{from:to}}; merge {uniqueById:true}; output-rss {format:"rss"}; output-json {format:"json"}.
Include at least one fetch node and one output node, connected left to right. If the user includes an http(s) URL, use that URL. Explanations should be playful and spooky, never violent.`;

export function listPublicProviders(): Array<{ id: string; label: string; host: string; defaultModel: string }> {
  return Object.values(GHOST_LLM_PROVIDERS).map((p) => ({
    id: p.id,
    label: p.label,
    host: p.host,
    defaultModel: p.defaultModel,
  }));
}

export function resolveProvider(id: unknown): (typeof GHOST_LLM_PROVIDERS)[GhostLlmProviderId] | null {
  if (typeof id !== 'string') return GHOST_LLM_PROVIDERS.openai;
  if (id in GHOST_LLM_PROVIDERS) {
    return GHOST_LLM_PROVIDERS[id as GhostLlmProviderId];
  }
  return null;
}

export function sanitizeModel(model: unknown, fallback: string): string {
  if (typeof model !== 'string') return fallback;
  const trimmed = model.trim();
  if (!trimmed || trimmed.length > 80) return fallback;
  if (!/^[a-zA-Z0-9._:+/-]+$/.test(trimmed)) return fallback;
  if (/https?:/i.test(trimmed)) return fallback;
  return trimmed;
}

export function redactSecrets(text: string, secrets: string[] = []): string {
  let out = String(text ?? '');
  for (const secret of secrets) {
    if (secret && secret.length >= 4) {
      out = out.split(secret).join('[REDACTED]');
    }
  }
  out = out.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
  out = out.replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]');
  out = out.replace(/x-ghost-llm-key\s*[:=]\s*\S+/gi, 'x-ghost-llm-key: [REDACTED]');
  return out;
}

export function payloadContainsSecret(payload: unknown, secrets: string[]): boolean {
  if (!secrets.some((s) => s && s.length >= 4)) return false;
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return secrets.some((s) => s && s.length >= 4 && text.includes(s));
}

export function readGhostLlmKey(headers: Record<string, unknown>): string | undefined {
  const raw = headers[GHOST_LLM_KEY_HEADER] ?? headers['X-Ghost-LLM-Key'];
  if (typeof raw !== 'string') return undefined;
  const key = raw.trim();
  if (!key) return undefined;
  if (key.length > 512) return undefined;
  return key;
}

function extractJsonObject(text: string): any {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced ? fenced[1].trim() : trimmed;
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('Ghost LLM returned no JSON object');
  }
  return JSON.parse(source.slice(start, end + 1));
}

function normalizePipe(raw: any, prompt: string): PipeDefinition {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Ghost LLM pipe was empty');
  }
  const nodesIn = Array.isArray(raw.nodes) ? raw.nodes : [];
  const edgesIn = Array.isArray(raw.edges) ? raw.edges : [];
  const nodes: PipeNode[] = nodesIn.map((n: any, i: number) => ({
    id: typeof n?.id === 'string' && n.id ? n.id : `node-${i + 1}`,
    type: n?.type,
    config: n?.config && typeof n.config === 'object' ? n.config : {},
    position: {
      x: Number(n?.position?.x ?? 80 + i * 220) || 80 + i * 220,
      y: Number(n?.position?.y ?? 120) || 120,
    },
  }));
  const edges: PipeEdge[] = edgesIn
    .filter((e: any) => e && e.id && e.source && e.target)
    .map((e: any) => ({ id: String(e.id), source: String(e.source), target: String(e.target) }));

  const pipe: PipeDefinition = {
    id: crypto.randomUUID(),
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 80) : prompt.split('.')[0].slice(0, 50) || 'Ghost-Built Pipe',
    nodes,
    edges,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (pipe.nodes.length === 0) throw new Error('Ghost LLM returned no nodes');
  if (!validatePipeNodes(pipe)) throw new Error('Ghost LLM returned unknown node types');

  for (const node of pipe.nodes) {
    if (node.type === 'fetch-rss' || node.type === 'fetch-json') {
      const url = node.config?.url;
      if (typeof url === 'string' && url && !isSafeUrl(url)) {
        throw new Error('Ghost LLM returned a blocked fetch URL');
      }
    }
  }

  const ids = new Set(pipe.nodes.map((n) => n.id));
  for (const edge of pipe.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      throw new Error('Ghost LLM returned an edge to an unknown node');
    }
  }

  return pipe;
}

export type GhostLlmSuccess = {
  pipe: PipeDefinition;
  explanation: string[];
};

export async function buildPipeWithUserKey(options: {
  prompt: string;
  apiKey: string;
  providerId?: unknown;
  model?: unknown;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}): Promise<GhostLlmSuccess> {
  const provider = resolveProvider(options.providerId ?? 'openai');
  if (!provider) {
    throw new Error('Unknown Ghost LLM provider');
  }

  const model = sanitizeModel(options.model, provider.defaultModel);
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetchFn(provider.url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: options.prompt },
        ],
      }),
    });
  } catch (error: any) {
    const message = error?.name === 'AbortError' ? 'Ghost LLM request timed out' : 'Ghost LLM request failed';
    throw new Error(message);
  } finally {
    clearTimeout(timer);
  }

  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(`Ghost LLM provider returned HTTP ${response.status}`);
  }

  let parsedEnvelope: any;
  try {
    parsedEnvelope = JSON.parse(rawText);
  } catch {
    throw new Error('Ghost LLM provider returned invalid JSON');
  }

  const content = parsedEnvelope?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Ghost LLM provider returned an empty completion');
  }

  const parsed = extractJsonObject(content);
  const pipe = normalizePipe(parsed.pipe ?? parsed, options.prompt);
  const explanation = Array.isArray(parsed.explanation)
    ? parsed.explanation.filter((line: unknown) => typeof line === 'string').map((line: string) => line.slice(0, 300))
    : ['The Ghost shaped a pipe from your sentence.'];

  return { pipe, explanation };
}
