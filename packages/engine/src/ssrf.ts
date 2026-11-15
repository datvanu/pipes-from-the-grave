/**
 * SSRF protection: scheme/port checks, IP classification (IPv4 and IPv6),
 * and DNS resolution before connect. Error messages never include resolved IPs.
 */
import { isIP } from 'node:net';
import { promises as dns } from 'node:dns';
import ipaddr from 'ipaddr.js';

export const SSRF_DENIED = 'The fetch URL is not allowed.';
export const ALLOWED_PORTS = new Set([80, 443]);

const BLOCKED_HOST_EXACT = new Set([
  'localhost',
  'localhost.',
  'metadata.google.internal',
  'metadata.google.internal.',
  'cloudmetadata',
]);

export type LookupAddress = { address: string; family: number };
export type LookupFn = (hostname: string) => Promise<LookupAddress[]>;

export function defaultLookup(hostname: string): Promise<LookupAddress[]> {
  return dns.lookup(hostname, { all: true, verbatim: true });
}

function stripBrackets(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

function ipv4FromBytes(bytes: number[], offset: number, xor = 0): string {
  return `${bytes[offset]! ^ xor}.${bytes[offset + 1]! ^ xor}.${bytes[offset + 2]! ^ xor}.${bytes[offset + 3]! ^ xor}`;
}

/**
 * Extract IPv4 addresses embedded in IPv6 transition forms.
 * Returns an empty list when the address is not a known transition prefix.
 */
export function embeddedIPv4s(ip: ipaddr.IPv6): string[] {
  const bytes = ip.toByteArray();
  const parts = ip.parts;
  const found: string[] = [];
  const take = (offset: number, xor = 0) => {
    found.push(ipv4FromBytes(bytes, offset, xor));
  };

  // IPv4-mapped ::ffff:a.b.c.d  (::ffff:0:0/96)
  if (bytes.slice(0, 10).every((b) => b === 0) && bytes[10] === 0xff && bytes[11] === 0xff) {
    take(12);
  }

  // SIIT / IPv4-translated ::ffff:0:a.b.c.d  (::ffff:0:0:0/96)
  if (
    bytes.slice(0, 8).every((b) => b === 0) &&
    bytes[8] === 0xff &&
    bytes[9] === 0xff &&
    bytes[10] === 0 &&
    bytes[11] === 0
  ) {
    take(12);
  }

  // Deprecated IPv4-compatible ::a.b.c.d  (::/96)
  if (bytes.slice(0, 12).every((b) => b === 0)) {
    take(12);
  }

  // 6to4 2002::/16 — IPv4 in bits 16–47
  if (bytes[0] === 0x20 && bytes[1] === 0x02) {
    take(2);
  }

  // Teredo 2001::/32 — server IPv4 in bits 32–63, client IPv4 in the last
  // 32 bits XOR 0xFFFFFFFF.
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0 && bytes[3] === 0) {
    take(4);
    take(12, 0xff);
  }

  // Well-known NAT64 64:ff9b::/96 and 64:ff9b:1::/96 (RFC 6052 / RFC 8215)
  if (
    parts[0] === 0x64 &&
    parts[1] === 0xff9b &&
    parts[3] === 0 &&
    parts[4] === 0 &&
    parts[5] === 0 &&
    (parts[2] === 0 || parts[2] === 1)
  ) {
    take(12);
  }

  return found;
}

function isSiteLocalV6(addr: ipaddr.IPv6): boolean {
  // Deprecated site-local fec0::/10
  return (addr.parts[0]! & 0xffc0) === 0xfec0;
}

const BLOCKED_V4_RANGES = new Set([
  'unspecified',
  'broadcast',
  'multicast',
  'linkLocal',
  'loopback',
  'carrierGradeNat',
  'private',
  'reserved',
]);

const BLOCKED_V6_RANGES = new Set([
  'unspecified',
  'linkLocal',
  'multicast',
  'loopback',
  'uniqueLocal',
  'reserved',
]);

/**
 * True if the address must not be contacted (private, loopback, metadata, etc.).
 */
export function isBlockedAddress(ip: string): boolean {
  const raw = stripBrackets(ip).trim();
  if (!raw) return true;
  try {
    const parsed = ipaddr.parse(raw);
    if (parsed.kind() === 'ipv6') {
      const v6 = parsed as ipaddr.IPv6;
      if (isSiteLocalV6(v6)) return true;
      const embedded = embeddedIPv4s(v6);
      if (embedded.length > 0) {
        // Block if any embedded IPv4 is blocked; otherwise fall through only
        // when extraction succeeded. Unknown or incomplete forms already
        // produce no candidates and are classified below.
        if (embedded.some((v4) => isBlockedAddress(v4))) return true;
        return BLOCKED_V6_RANGES.has(v6.range());
      }
      return BLOCKED_V6_RANGES.has(v6.range());
    }
    const v4 = parsed as ipaddr.IPv4;
    if (BLOCKED_V4_RANGES.has(v4.range())) return true;
    // ipaddr may call some documentation ranges "unicast"; still block 0.0.0.0/8 leftovers
    const octets = v4.toByteArray();
    if (octets[0] === 0) return true;
    return false;
  } catch {
    return true;
  }
}

function isBlockedHostname(host: string): boolean {
  const lower = stripBrackets(host).toLowerCase().replace(/\.$/, '');
  if (BLOCKED_HOST_EXACT.has(lower) || BLOCKED_HOST_EXACT.has(`${lower}.`)) return true;
  if (lower === 'metadata.google.internal' || lower.endsWith('.metadata.google.internal')) return true;
  if (lower === 'localhost' || lower.endsWith('.localhost')) return true;
  return false;
}

export type ParsedFetchUrl = {
  url: URL;
  hostname: string;
  port: number;
  protocol: 'http:' | 'https:';
};

export function parseFetchUrl(input: string): ParsedFetchUrl | null {
  try {
    const url = new URL(input);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    const hostname = stripBrackets(url.hostname);
    if (!hostname) return null;
    const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
    if (!ALLOWED_PORTS.has(port) || !Number.isInteger(port)) return null;
    if (isBlockedHostname(hostname)) return null;
    if (isIP(hostname) && isBlockedAddress(hostname)) return null;
    return { url, hostname, port, protocol: url.protocol };
  } catch {
    return null;
  }
}

/**
 * Synchronous check of the URL string (scheme, port, literal IPs, blocked names).
 * Hostnames still require resolveAndCheck before a real fetch.
 */
export function isSafeUrl(url: string): boolean {
  return parseFetchUrl(url) != null;
}

export function assertSafeUrl(url: string): void {
  if (!isSafeUrl(url)) {
    throw new Error(SSRF_DENIED);
  }
}

export function validateUrl(url: string): string | null {
  return isSafeUrl(url) ? null : SSRF_DENIED;
}

export async function resolveAndCheck(
  input: string,
  lookup: LookupFn = defaultLookup,
): Promise<{ parsed: ParsedFetchUrl; addresses: LookupAddress[] }> {
  const parsed = parseFetchUrl(input);
  if (!parsed) {
    throw new Error(SSRF_DENIED);
  }

  if (isIP(parsed.hostname)) {
    if (isBlockedAddress(parsed.hostname)) {
      throw new Error(SSRF_DENIED);
    }
    const family = isIP(parsed.hostname);
    return { parsed, addresses: [{ address: parsed.hostname, family }] };
  }

  let records: LookupAddress[];
  try {
    records = await lookup(parsed.hostname);
  } catch {
    throw new Error(SSRF_DENIED);
  }
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error(SSRF_DENIED);
  }

  const addresses: LookupAddress[] = [];
  for (const record of records) {
    const address = record?.address;
    const family = record?.family || (address ? isIP(address) : 0);
    if (!address || isBlockedAddress(address)) {
      throw new Error(SSRF_DENIED);
    }
    addresses.push({ address, family: family === 6 ? 6 : 4 });
  }
  return { parsed, addresses };
}
