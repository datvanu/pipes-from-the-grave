/**
 * Linear-time regular expressions via RE2 (WASM). Caps pattern length and flags
 * so user-supplied patterns cannot stall the event loop.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { RE2 } = require('re2-wasm') as { RE2: new (pattern: string, flags: string) => Re2Like };

type Re2Like = {
  test: (value: string) => boolean;
  constructor: Function;
};

export const MAX_PATTERN_LENGTH = 200;
export const MAX_REGEX_INPUT_LENGTH = 100_000;
const ALLOWED_FLAGS = new Set(['i', 'm', 'u']);

export class RegexDeniedError extends Error {
  constructor(message = 'Regular expression is not allowed.') {
    super(message);
    this.name = 'RegexDeniedError';
  }
}

function normalizeFlags(flags: string | undefined, allowGlobal: boolean): string {
  const seen = new Set<string>();
  for (const flag of flags || '') {
    if (flag === 'g' && allowGlobal) {
      seen.add('g');
      continue;
    }
    if (!ALLOWED_FLAGS.has(flag)) {
      throw new RegexDeniedError('Regular expression flags are not allowed.');
    }
    seen.add(flag);
  }
  seen.add('u'); // required by re2-wasm, and Unicode mode is desirable
  return [...seen].join('');
}

export function compileSafeRegex(pattern: string, flags?: string, opts?: { allowGlobal?: boolean }): InstanceType<typeof RE2> {
  if (typeof pattern !== 'string' || pattern.length === 0 || pattern.length > MAX_PATTERN_LENGTH) {
    throw new RegexDeniedError('Regular expression pattern is too long or empty.');
  }
  const normalized = normalizeFlags(flags, opts?.allowGlobal === true);
  try {
    return new RE2(pattern, normalized);
  } catch {
    throw new RegexDeniedError('Regular expression pattern is invalid.');
  }
}

export function safeRegexTest(pattern: string, flags: string | undefined, value: string): boolean {
  const input = value.length > MAX_REGEX_INPUT_LENGTH ? value.slice(0, MAX_REGEX_INPUT_LENGTH) : value;
  const re = compileSafeRegex(pattern, flags, { allowGlobal: false });
  return re.test(input);
}

export function safeRegexReplace(pattern: string, flags: string | undefined, value: string, replacement: string): string {
  const input = value.length > MAX_REGEX_INPUT_LENGTH ? value.slice(0, MAX_REGEX_INPUT_LENGTH) : value;
  // One pass: allow `g` only as an explicit flag, RE2 remains linear-time.
  const re = compileSafeRegex(pattern, flags, { allowGlobal: true });
  return input.replace(re as unknown as RegExp, replacement ?? '');
}
