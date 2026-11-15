/**
 * Regression: production fetches must pin the connect lookup to the
 * already-checked addresses. A default fetchFn (globalThis.fetch) would
 * resolve DNS again and allow rebinding. Lookups and fetches are stubbed;
 * no connections to foreign systems.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const agentLookups: Array<(hostname: string, options: unknown, callback: LookupCallback) => void> = [];
const undiciFetchCalls: string[] = [];

type LookupCallback = (
  err: Error | null,
  address?: string | Array<{ address: string; family: number }>,
  family?: number,
) => void;

vi.mock('undici', async (importOriginal) => {
  const actual = await importOriginal<typeof import('undici')>();
  class InstrumentedAgent extends actual.Agent {
    constructor(opts: ConstructorParameters<typeof actual.Agent>[0] = {}) {
      super(opts);
      const lookup = (opts as { connect?: { lookup?: (hostname: string, options: unknown, callback: LookupCallback) => void } })
        ?.connect?.lookup;
      if (lookup) agentLookups.push(lookup);
    }
  }
  return {
    ...actual,
    Agent: InstrumentedAgent,
    fetch: async (url: string) => {
      undiciFetchCalls.push(String(url));
      const body = String(url).includes('rss')
        ? '<?xml version="1.0"?><rss version="2.0"><channel><title>t</title></channel></rss>'
        : '[]';
      return new actual.Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  };
});

import { safeFetch } from '../src/fetch-safe.js';
import { fetchJson } from '../src/nodes/fetch-json.js';
import { fetchRss } from '../src/nodes/fetch-rss.js';

function rebindingLookup() {
  let calls = 0;
  const lookup = async () => {
    calls += 1;
    if (calls === 1) return [{ address: '93.184.216.34', family: 4 }];
    return [{ address: '127.0.0.1', family: 4 }];
  };
  return { lookup, count: () => calls };
}

async function pinnedAddresses() {
  const lookup = agentLookups.at(-1);
  if (!lookup) throw new Error('expected a pinned Agent lookup');
  return new Promise<Array<{ address: string; family: number }>>((resolve, reject) => {
    lookup('rebind.example', { all: true }, (err, result) => {
      if (err) reject(err);
      else resolve(result as Array<{ address: string; family: number }>);
    });
  });
}

describe('DNS pinning without a default fetchFn', () => {
  afterEach(() => {
    agentLookups.length = 0;
    undiciFetchCalls.length = 0;
  });

  it('uses the undici pin path and ignores a later internal DNS answer', async () => {
    const stub = rebindingLookup();
    const res = await safeFetch('https://rebind.example/feed.json', { lookup: stub.lookup });
    expect(res.status).toBe(200);
    expect(stub.count()).toBe(1);
    expect(undiciFetchCalls).toEqual(['https://rebind.example/feed.json']);
    expect(await pinnedAddresses()).toEqual([{ address: '93.184.216.34', family: 4 }]);
  });

  it('fetch-json does not inject globalThis.fetch, so pinning is used', async () => {
    const stub = rebindingLookup();
    const items = await fetchJson(
      { url: 'https://rebind.example/feed.json' },
      { lookupFn: stub.lookup },
    );
    expect(items).toEqual([]);
    expect(stub.count()).toBe(1);
    expect(undiciFetchCalls).toEqual(['https://rebind.example/feed.json']);
    expect(await pinnedAddresses()).toEqual([{ address: '93.184.216.34', family: 4 }]);
  });

  it('fetch-rss does not inject globalThis.fetch, so pinning is used', async () => {
    const stub = rebindingLookup();
    const items = await fetchRss(
      { url: 'https://rebind.example/feed.rss' },
      { lookupFn: stub.lookup },
    );
    expect(items).toEqual([]);
    expect(stub.count()).toBe(1);
    expect(undiciFetchCalls).toEqual(['https://rebind.example/feed.rss']);
    expect(await pinnedAddresses()).toEqual([{ address: '93.184.216.34', family: 4 }]);
  });
});
