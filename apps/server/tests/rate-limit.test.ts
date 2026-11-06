/**
 * Rate limiter tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit, rateLimiter } from '../src/rate-limit.js';

describe('rate-limit', () => {
  beforeEach(() => {
    rateLimiter.clear();
  });

  it('allows requests under the limit', () => {
    const ip = '192.168.1.1';
    const options = { windowMs: 60000, max: 5 };

    // First 5 requests should be allowed
    for (let i = 0; i < 5; i++) {
      const result = checkRateLimit(ip, options);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4 - i);
    }
  });

  it('denies requests over the limit', () => {
    const ip = '192.168.1.1';
    const options = { windowMs: 60000, max: 3 };

    // Use up the limit
    checkRateLimit(ip, options);
    checkRateLimit(ip, options);
    checkRateLimit(ip, options);

    // 4th request should be denied
    const result = checkRateLimit(ip, options);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.resetMs).toBeGreaterThan(0);
  });

  it('tracks different IPs separately', () => {
    const options = { windowMs: 60000, max: 2 };

    // Use limit for IP 1
    checkRateLimit('192.168.1.1', options);
    checkRateLimit('192.168.1.1', options);

    // IP 2 should still have full limit
    const result2 = checkRateLimit('192.168.1.2', options);
    expect(result2.allowed).toBe(true);
    expect(result2.remaining).toBe(1);
  });
});
