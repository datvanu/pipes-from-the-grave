/**
 * SSRF protection utilities for safe URL validation.
 * Blocks private, link-local, and metadata IPs.
 */

// Private IP ranges
const PRIVATE_IP_PATTERNS = [
  /^10\./,                    // 10.0.0.0/8
  /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0/12
  /^192\.168\./,              // 192.168.0.0/16
  /^127\./,                   // 127.0.0.0/8 (loopback)
  /^0\./,                     // 0.0.0.0/8
  /^169\.254\./,              // 169.254.0.0/16 (link-local)
];

// Blocked domain patterns
const BLOCKED_DOMAINS = [
  'localhost',
  'localhost.',
];

/**
 * Check if a URL uses a safe scheme (http or https only).
 */
function isSafeScheme(url: URL): boolean {
  return url.protocol === 'http:' || url.protocol === 'https:';
}

/**
 * Check if an IP address is private or blocked.
 */
function isPrivateIP(ip: string): boolean {
  // Check private IP patterns
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(ip)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if a host is a safe public hostname.
 */
function isSafeHost(host: string): boolean {
  // Block localhost
  if (host === 'localhost' || host === 'localhost.') {
    return false;
  }
  
  // Check if it's a numeric IP
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return !isPrivateIP(host);
  }
  
  // Allow valid domain names
  // Block metadata service domains
  const lowerHost = host.toLowerCase();
  const blockedMetadata = [
    '169.254.169.254',
    'metadata.google.internal',
    'cloudmetadata',
  ];
  
  for (const blocked of blockedMetadata) {
    if (lowerHost.includes(blocked)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Check if a URL is safe to fetch.
 * Blocks private IPs, metadata services, and non-http(s) schemes.
 */
export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    
    // Only allow http/https
    if (!isSafeScheme(parsed)) {
      return false;
    }
    
    // Check host is safe (not private IP, not metadata, not localhost)
    if (!isSafeHost(parsed.hostname)) {
      return false;
    }
    
    return true;
  } catch {
    // Invalid URL format
    return false;
  }
}

/**
 * Assert that a URL is safe. Throws if not safe.
 */
export function assertSafeUrl(url: string): void {
  if (!isSafeUrl(url)) {
    throw new Error(`URL is not safe for fetching: ${url}`);
  }
}

/**
 * Validate a URL and return an error message if unsafe, or null if safe.
 */
export function validateUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    
    if (!isSafeScheme(parsed)) {
      return `Scheme not allowed: ${parsed.protocol}. Only http/https allowed.`;
    }
    
    if (!isSafeHost(parsed.hostname)) {
      return `Host not allowed: ${parsed.hostname}. Private IPs and metadata services are blocked.`;
    }
    
    return null;
  } catch (e) {
    return `Invalid URL format: ${url}`;
  }
}
