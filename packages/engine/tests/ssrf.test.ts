/**
 * SSRF protection tests.
 */

import { describe, it, expect } from 'vitest';
import { isSafeUrl, assertSafeUrl, validateUrl } from '../src/ssrf.js';

describe('isSafeUrl', () => {
  it('allows http URLs', () => {
    expect(isSafeUrl('http://example.com/feed.xml')).toBe(true);
  });

  it('allows https URLs', () => {
    expect(isSafeUrl('https://example.com/feed.xml')).toBe(true);
  });

  it('rejects localhost', () => {
    expect(isSafeUrl('http://localhost:8080/feed.xml')).toBe(false);
  });

  it('rejects 127.0.0.1', () => {
    expect(isSafeUrl('http://127.0.0.1:8080/feed.xml')).toBe(false);
  });

  it('rejects private IP ranges', () => {
    expect(isSafeUrl('http://10.0.0.1/feed.xml')).toBe(false);
    expect(isSafeUrl('http://172.16.0.1/feed.xml')).toBe(false);
    expect(isSafeUrl('http://192.168.1.1/feed.xml')).toBe(false);
    expect(isSafeUrl('http://169.254.1.1/feed.xml')).toBe(false);
  });

  it('rejects file scheme', () => {
    expect(isSafeUrl('file:///etc/passwd')).toBe(false);
  });

  it('rejects data scheme', () => {
    expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('rejects javascript scheme', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects invalid URLs', () => {
    expect(isSafeUrl('not a url')).toBe(false);
  });

  it('rejects URLs with metadata service domains', () => {
    expect(isSafeUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
  });
});

describe('assertSafeUrl', () => {
  it('does not throw for safe URLs', () => {
    expect(() => assertSafeUrl('http://example.com/feed.xml')).not.toThrow();
  });

  it('throws for unsafe URLs', () => {
    expect(() => assertSafeUrl('http://localhost:8080/feed.xml')).toThrow();
  });
});

describe('validateUrl', () => {
  it('returns null for safe URLs', () => {
    expect(validateUrl('http://example.com/feed.xml')).toBeNull();
  });

  it('returns error message for unsafe URLs', () => {
    const result = validateUrl('http://localhost:8080/feed.xml');
    expect(result).toBeDefined();
    expect(result?.length).toBeGreaterThan(0);
  });
});
