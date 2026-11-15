/**
 * SSRF-aware fetch: resolve and classify IPs, pin the lookup, follow
 * at most 3 redirects with a fresh check, cap the body at 2 MB, abort on timeout.
 */
import { Agent, fetch as undiciFetch } from 'undici';
import {
  SSRF_DENIED,
  defaultLookup,
  resolveAndCheck,
  type LookupFn,
} from './ssrf.js';

export const MAX_FETCH_BYTES = 2 * 1024 * 1024;
export const MAX_REDIRECTS = 3;
export const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

export type SafeFetchOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
  lookup?: LookupFn;
  fetchFn?: typeof fetch;
  headers?: Record<string, string>;
};

function combineSignals(timeoutMs: number, external?: AbortSignal): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternal = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', onExternal, { once: true });
  }
  return {
    signal: controller.signal,
    cancel: () => {
      clearTimeout(timer);
      external?.removeEventListener('abort', onExternal);
    },
  };
}

function pinnedDispatcher(addresses: { address: string; family: number }[]): Agent {
  return new Agent({
    connect: {
      lookup(_hostname, options, callback) {
        const all = Boolean((options as { all?: boolean }).all);
        if (all) {
          (callback as (err: Error | null, result: Array<{ address: string; family: number }>) => void)(
            null,
            addresses,
          );
          return;
        }
        const first = addresses[0]!;
        (callback as (err: Error | null, address: string, family: number) => void)(
          null,
          first.address,
          first.family,
        );
      },
    },
  });
}

async function readCapped(response: Response, signal: AbortSignal): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      if (signal.aborted) throw new Error(`Fetch timed out`);
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_FETCH_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error(`Response exceeded the ${MAX_FETCH_BYTES} byte limit`);
      }
      chunks.push(value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function resolveRedirect(current: string, location: string | null): string | null {
  if (!location) return null;
  try {
    return new URL(location, current).toString();
  } catch {
    return null;
  }
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

/**
 * Fetch a URL after SSRF checks. Redirects are followed manually (max 3) and
 * re-validated. The connection is pinned to the already-checked addresses.
 */
export async function safeFetch(url: string, options: SafeFetchOptions = {}): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const { signal, cancel } = combineSignals(timeoutMs, options.signal);
  const lookup = options.lookup ?? defaultLookup;
  const doFetch = options.fetchFn;

  try {
    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (signal.aborted) throw new Error(`Fetch timed out after ${timeoutMs}ms`);
      const { parsed, addresses } = await resolveAndCheck(current, lookup);
      const requestInit: RequestInit = {
        method: 'GET',
        redirect: 'manual',
        signal,
        headers: {
          Host: parsed.url.host,
          ...(options.headers || {}),
        },
      };

      let response: Response;
      try {
        if (doFetch) {
          response = await doFetch(parsed.url.toString(), requestInit);
        } else {
          const dispatcher = pinnedDispatcher(addresses);
          try {
            response = (await undiciFetch(parsed.url.toString(), {
              method: 'GET',
              redirect: 'manual',
              signal,
              headers: {
                Host: parsed.url.host,
                ...(options.headers || {}),
              },
              dispatcher,
            })) as unknown as Response;
          } finally {
            await dispatcher.close().catch(() => undefined);
          }
        }
      } catch (err: any) {
        if (err?.name === 'AbortError' || signal.aborted) {
          throw new Error(`Fetch timed out after ${timeoutMs}ms`);
        }
        if (err instanceof Error && (err.message === SSRF_DENIED || err.message.startsWith('Response exceeded') || err.message.startsWith('Too many'))) {
          throw err;
        }
        throw new Error('Failed to fetch the URL');
      }

      if (isRedirect(response.status)) {
        if (hop === MAX_REDIRECTS) {
          throw new Error('Too many redirects');
        }
        const next = resolveRedirect(current, response.headers.get('location'));
        if (!next) throw new Error(SSRF_DENIED);
        current = next;
        continue;
      }

      const body = await readCapped(response, signal);
      return new Response(Buffer.from(body), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }
    throw new Error('Too many redirects');
  } finally {
    cancel();
  }
}

/** @deprecated Use safeFetch. Kept as a name alias for existing imports. */
export async function fetchWithTimeout(
  url: string,
  fetchFn: typeof fetch,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<Response> {
  return safeFetch(url, { fetchFn, timeoutMs, signal });
}
