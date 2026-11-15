/**
 * SSRF protection tests. No connections to foreign systems; lookups and fetches are injected.
 */
import { describe, expect, it } from 'vitest';
import {
  isSafeUrl,
  assertSafeUrl,
  validateUrl,
  isBlockedAddress,
  resolveAndCheck,
  SSRF_DENIED,
} from '../src/ssrf.js';
import { safeFetch, MAX_REDIRECTS, MAX_FETCH_BYTES } from '../src/fetch-safe.js';

describe('isSafeUrl', () => {
  it('allows http URLs', () => {
    expect(isSafeUrl('http://example.com/feed.xml')).toBe(true);
  });

  it('allows https URLs', () => {
    expect(isSafeUrl('https://example.com/feed.xml')).toBe(true);
  });

  it('rejects localhost', () => {
    expect(isSafeUrl('http://localhost/feed.xml')).toBe(false);
    expect(isSafeUrl('http://localhost:8080/feed.xml')).toBe(false);
    expect(isSafeUrl('http://foo.localhost/feed.xml')).toBe(false);
  });

  it('rejects 127.0.0.1 and unusual IPv4 writings that normalize to loopback', () => {
    expect(isSafeUrl('http://127.0.0.1/feed.xml')).toBe(false);
    expect(isSafeUrl('http://127.0.0.1:8080/feed.xml')).toBe(false);
    expect(isSafeUrl('http://2130706433/feed.xml')).toBe(false); // decimal 127.0.0.1
    expect(isSafeUrl('http://0x7f000001/feed.xml')).toBe(false);
  });

  it('rejects private, link-local, CGNAT, multicast and reserved IPv4', () => {
    expect(isSafeUrl('http://10.0.0.1/feed.xml')).toBe(false);
    expect(isSafeUrl('http://172.16.0.1/feed.xml')).toBe(false);
    expect(isSafeUrl('http://192.168.1.1/feed.xml')).toBe(false);
    expect(isSafeUrl('http://169.254.1.1/feed.xml')).toBe(false);
    expect(isSafeUrl('http://100.64.0.1/feed.xml')).toBe(false);
    expect(isSafeUrl('http://224.0.0.1/feed.xml')).toBe(false);
    expect(isSafeUrl('http://0.0.0.0/feed.xml')).toBe(false);
    expect(isSafeUrl('http://255.255.255.255/feed.xml')).toBe(false);
  });

  it('rejects IPv6 loopback, ULA, link-local, multicast and mapped loopback', () => {
    expect(isSafeUrl('http://[::1]/feed.xml')).toBe(false);
    expect(isSafeUrl('http://[::]/feed.xml')).toBe(false);
    expect(isSafeUrl('http://[fc00::1]/feed.xml')).toBe(false);
    expect(isSafeUrl('http://[fd12:3456:789a::1]/feed.xml')).toBe(false);
    expect(isSafeUrl('http://[fe80::1]/feed.xml')).toBe(false);
    expect(isSafeUrl('http://[ff02::1]/feed.xml')).toBe(false);
    expect(isSafeUrl('http://[::ffff:127.0.0.1]/feed.xml')).toBe(false);
    expect(isSafeUrl('http://[::ffff:10.0.0.1]/feed.xml')).toBe(false);
    expect(isSafeUrl('http://[::ffff:169.254.169.254]/feed.xml')).toBe(false);
  });

  it('rejects IPv6 transition forms that embed a blocked IPv4, plus site-local', () => {
    // SIIT / IPv4-translated ::ffff:0:a.b.c.d
    expect(isSafeUrl('http://[::ffff:0:127.0.0.1]/feed.xml')).toBe(false);
    expect(isSafeUrl('http://[::ffff:0:10.0.0.1]/feed.xml')).toBe(false);
    expect(isSafeUrl('http://[::ffff:0:7f00:1]/feed.xml')).toBe(false);
    // 6to4 2002::/16
    expect(isSafeUrl('http://[2002:7f00:1::1]/feed.xml')).toBe(false);
    expect(isSafeUrl('http://[2002:c0a8:1::1]/feed.xml')).toBe(false);
    expect(isSafeUrl('http://[2002:a00:1::]/feed.xml')).toBe(false);
    // Teredo 2001::/32 with a private client (192.168.1.1 XOR 255.255.255.255)
    expect(isSafeUrl('http://[2001:0:808:808:0:0:3f57:fefe]/feed.xml')).toBe(false);
    // Site-local fec0::/10
    expect(isSafeUrl('http://[fec0::1]/feed.xml')).toBe(false);
    expect(isSafeUrl('http://[fed0:1234::1]/feed.xml')).toBe(false);
    // Deprecated IPv4-compatible ::a.b.c.d
    expect(isSafeUrl('http://[::127.0.0.1]/feed.xml')).toBe(false);
    expect(isSafeUrl('http://[::10.0.0.1]/feed.xml')).toBe(false);
    // NAT64 64:ff9b::/96 and 64:ff9b:1::/96
    expect(isSafeUrl('http://[64:ff9b::7f00:1]/feed.xml')).toBe(false);
    expect(isSafeUrl('http://[64:ff9b::10.0.0.1]/feed.xml')).toBe(false);
    expect(isSafeUrl('http://[64:ff9b:1::10.0.0.1]/feed.xml')).toBe(false);
  });

  it('allows transition forms only when every embedded IPv4 is public', () => {
    expect(isSafeUrl('http://[::ffff:8.8.8.8]/feed.xml')).toBe(true);
    expect(isSafeUrl('http://[::ffff:0:8.8.8.8]/feed.xml')).toBe(true);
    expect(isSafeUrl('http://[2002:808:808::1]/feed.xml')).toBe(true);
    expect(isSafeUrl('http://[::8.8.8.8]/feed.xml')).toBe(true);
    expect(isSafeUrl('http://[64:ff9b::808:808]/feed.xml')).toBe(true);
    // Teredo with public server 8.8.8.8 and public client 8.8.8.8
    expect(isSafeUrl('http://[2001:0:808:808:0:0:f7f7:f7f7]/feed.xml')).toBe(true);
  });

  it('rejects non-80/443 ports and credentials', () => {
    expect(isSafeUrl('https://example.com:8443/feed.xml')).toBe(false);
    expect(isSafeUrl('http://example.com:8080/feed.xml')).toBe(false);
    expect(isSafeUrl('https://user:pass@example.com/feed.xml')).toBe(false);
  });

  it('rejects file, data and javascript schemes', () => {
    expect(isSafeUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects invalid URLs and metadata names', () => {
    expect(isSafeUrl('not a url')).toBe(false);
    expect(isSafeUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isSafeUrl('http://metadata.google.internal/')).toBe(false);
  });
});

describe('isBlockedAddress', () => {
  it('classifies IPv4 and IPv6 blocked families', () => {
    expect(isBlockedAddress('127.0.0.1')).toBe(true);
    expect(isBlockedAddress('10.1.2.3')).toBe(true);
    expect(isBlockedAddress('100.64.1.2')).toBe(true);
    expect(isBlockedAddress('169.254.169.254')).toBe(true);
    expect(isBlockedAddress('::1')).toBe(true);
    expect(isBlockedAddress('[::1]')).toBe(true);
    expect(isBlockedAddress('fc00::1')).toBe(true);
    expect(isBlockedAddress('fe80::1')).toBe(true);
    expect(isBlockedAddress('::ffff:192.168.0.1')).toBe(true);
    expect(isBlockedAddress('::ffff:0:10.0.0.1')).toBe(true);
    expect(isBlockedAddress('2002:7f00:1::1')).toBe(true);
    expect(isBlockedAddress('2001:0:a00:1:0:0:3f57:fefe')).toBe(true);
    expect(isBlockedAddress('fec0::1')).toBe(true);
    expect(isBlockedAddress('::10.0.0.1')).toBe(true);
    expect(isBlockedAddress('64:ff9b::c0a8:1')).toBe(true);
    expect(isBlockedAddress('8.8.8.8')).toBe(false);
    expect(isBlockedAddress('2001:4860:4860::8888')).toBe(false);
    expect(isBlockedAddress('::ffff:8.8.8.8')).toBe(false);
    expect(isBlockedAddress('2002:808:808::1')).toBe(false);
  });
});

describe('assertSafeUrl / validateUrl', () => {
  it('does not throw for safe URLs', () => {
    expect(() => assertSafeUrl('http://example.com/feed.xml')).not.toThrow();
  });

  it('throws a generic message without resolved addresses', () => {
    expect(() => assertSafeUrl('http://localhost/feed.xml')).toThrow(SSRF_DENIED);
  });

  it('returns null for safe URLs and a generic error otherwise', () => {
    expect(validateUrl('http://example.com/feed.xml')).toBeNull();
    const result = validateUrl('http://localhost/feed.xml');
    expect(result).toBe(SSRF_DENIED);
    expect(result).not.toMatch(/127\.|::1|fc00/);
  });
});

describe('resolveAndCheck', () => {
  it('rejects a hostname after DNS returns a private IPv4', async () => {
    await expect(
      resolveAndCheck('https://evil.example/feed', async () => [{ address: '10.0.0.8', family: 4 }]),
    ).rejects.toThrow(SSRF_DENIED);
  });

  it('rejects a hostname after DNS returns IPv6 ULA or loopback', async () => {
    await expect(
      resolveAndCheck('https://evil.example/feed', async () => [{ address: 'fc00::aa', family: 6 }]),
    ).rejects.toThrow(SSRF_DENIED);
    await expect(
      resolveAndCheck('https://evil.example/feed', async () => [{ address: '::1', family: 6 }]),
    ).rejects.toThrow(SSRF_DENIED);
  });

  it('rejects if any record in the set is blocked', async () => {
    await expect(
      resolveAndCheck('https://evil.example/feed', async () => [
        { address: '8.8.8.8', family: 4 },
        { address: '127.0.0.1', family: 4 },
      ]),
    ).rejects.toThrow(SSRF_DENIED);
  });

  it('accepts a public resolution and does not mention the IP in errors', async () => {
    const result = await resolveAndCheck('https://example.com/feed', async () => [
      { address: '93.184.216.34', family: 4 },
    ]);
    expect(result.addresses[0]?.address).toBe('93.184.216.34');
  });
});

describe('safeFetch', () => {
  it('does not call fetch when DNS resolves to a loopback address', async () => {
    let fetched = false;
    const fetchFn: typeof fetch = async () => {
      fetched = true;
      return new Response('nope');
    };
    await expect(
      safeFetch('https://internal.example/secret', {
        lookup: async () => [{ address: '127.0.0.1', family: 4 }],
        fetchFn,
      }),
    ).rejects.toThrow(SSRF_DENIED);
    expect(fetched).toBe(false);
  });

  it('re-checks redirect targets and refuses a hop to a blocked IP', async () => {
    const calls: string[] = [];
    const fetchFn: typeof fetch = async (input) => {
      calls.push(String(input));
      return new Response(null, {
        status: 302,
        headers: { Location: 'http://127.0.0.1/steal' },
      });
    };
    await expect(
      safeFetch('https://example.com/feed', {
        lookup: async (hostname) => {
          if (hostname === 'example.com') return [{ address: '93.184.216.34', family: 4 }];
          throw new Error('lookup should not run for the raw IP hop after parse');
        },
        fetchFn,
      }),
    ).rejects.toThrow(SSRF_DENIED);
    expect(calls).toEqual(['https://example.com/feed']);
  });

  it('follows a safe redirect and pins the public lookup', async () => {
    const fetchFn: typeof fetch = async (input) => {
      const url = String(input);
      if (url === 'https://example.com/old') {
        return new Response(null, { status: 302, headers: { Location: 'https://example.com/new' } });
      }
      return new Response('ok-body', { status: 200 });
    };
    const res = await safeFetch('https://example.com/old', {
      lookup: async () => [{ address: '93.184.216.34', family: 4 }],
      fetchFn,
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok-body');
  });

  it('stops after the redirect hop limit', async () => {
    const fetchFn: typeof fetch = async () =>
      new Response(null, { status: 302, headers: { Location: 'https://example.com/next' } });
    await expect(
      safeFetch('https://example.com/start', {
        lookup: async () => [{ address: '93.184.216.34', family: 4 }],
        fetchFn,
      }),
    ).rejects.toThrow(/Too many redirects/);
  });

  it('aborts when the body exceeds 2 MB', async () => {
    const fetchFn: typeof fetch = async () =>
      new Response(new Uint8Array(MAX_FETCH_BYTES + 1), { status: 200 });
    await expect(
      safeFetch('https://example.com/big', {
        lookup: async () => [{ address: '93.184.216.34', family: 4 }],
        fetchFn,
      }),
    ).rejects.toThrow(/byte limit/);
  });

  it('does not leak resolved IPs in failure messages', async () => {
    try {
      await safeFetch('https://evil.example/x', {
        lookup: async () => [{ address: '10.1.2.3', family: 4 }],
        fetchFn: async () => new Response('x'),
      });
      throw new Error('should have failed');
    } catch (err) {
      expect(String(err)).toBe(`Error: ${SSRF_DENIED}`);
      expect(String(err)).not.toMatch(/10\.1\.2\.3/);
    }
  });
});
