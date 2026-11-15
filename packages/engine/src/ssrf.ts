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

function mappedIPv4(addr: ipaddr.IPv6): string | null {
  if (addr.isIPv4MappedAddress()) {
    return addr.toIPv4Address().toString();
  }
  const parts = addr.toNormalizedString();
  // NAT64 64:ff9b::/96
  if (parts.startsWith('64:ff9b:0:0:0:0:')) {
    try {
      return addr.toIPv4Address().toString();
    } catch {
      const hex = parts.split(':').slice(-2);
      if (hex.length === 2) {
        const a = parseInt(hex[0], 16);
        const b = parseInt(hex[1], 16);
        return `${(a >> 8) & 255}.${a & 255}.${(b >> 8) & 255}.${b & 255}`;
      }
    }
  }
  return null;
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
      const v4 = mappedIPv4(v6);
      if (v4) return isBlockedAddress(v4);
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
