/**
 * Simple in-memory IP rate limiter
 */

interface RateLimitOptions {
  windowMs: number;
  max: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

class RateLimitMap {
  private records: Map<string, { count: number; resetTime: number }> = new Map();
  private readonly defaultOptions: RateLimitOptions = { windowMs: 60000, max: 30 };

  checkRateLimit(ip: string, options?: Partial<RateLimitOptions>): RateLimitResult {
    const { windowMs, max } = { ...this.defaultOptions, ...options };
    const now = Date.now();

    if (this.records.size > 256) {
      for (const [key, rec] of this.records) {
        if (now >= rec.resetTime) this.records.delete(key);
      }
    }

    const record = this.records.get(ip);

    // Reset if window has passed
    if (!record || now >= record.resetTime) {
      this.records.set(ip, {
        count: 1,
        resetTime: now + windowMs,
      });
      return { allowed: true, remaining: max - 1, resetMs: windowMs };
    }

    // Check if over limit
    if (record.count >= max) {
      return { allowed: false, remaining: 0, resetMs: record.resetTime - now };
    }

    // Increment counter
    record.count++;
    return { allowed: true, remaining: max - record.count, resetMs: record.resetTime - now };
  }

  clear(): void {
    this.records.clear();
  }
}

export const rateLimiter = new RateLimitMap();

export function checkRateLimit(ip: string, options?: Partial<RateLimitOptions>): RateLimitResult {
  return rateLimiter.checkRateLimit(ip, options);
}

export class RateLimitError extends Error {
  constructor(message: string, public readonly retryAfterMs: number) {
    super(message);
    this.name = 'RateLimitError';
  }
}
