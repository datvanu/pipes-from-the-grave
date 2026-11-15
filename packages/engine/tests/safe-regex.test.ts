/**
 * RE2-backed regex: length/flag limits and a catastrophic pattern that must not hang.
 */
import { describe, expect, it } from 'vitest';
import {
  compileSafeRegex,
  safeRegexReplace,
  safeRegexTest,
  RegexDeniedError,
  MAX_PATTERN_LENGTH,
} from '../src/safe-regex.js';

describe('safe regex', () => {
  it('matches and replaces with a simple pattern', () => {
    expect(safeRegexTest('ab+', 'i', 'xxABBByy')).toBe(true);
    expect(safeRegexReplace('a+', 'g', 'xaaay', 'o')).toBe('xoy');
  });

  it('rejects overlong patterns and illegal flags', () => {
    expect(() => compileSafeRegex('a'.repeat(MAX_PATTERN_LENGTH + 1), 'i')).toThrow(RegexDeniedError);
    expect(() => compileSafeRegex('abc', 's')).toThrow(RegexDeniedError);
  });

  it('rejects backreferences that RE2 does not support', () => {
    expect(() => compileSafeRegex('(a+)\\1')).toThrow(RegexDeniedError);
  });

  it('evaluates a catastrophic backtracking pattern in linear time', () => {
    const pattern = '(a+)+$';
    const input = `${'a'.repeat(40)}b`;
    const started = Date.now();
    const matched = safeRegexTest(pattern, '', input);
    const elapsed = Date.now() - started;
    expect(matched).toBe(false);
    expect(elapsed).toBeLessThan(500);
  });
});
