import { describe, it, expect } from 'vitest';
import {
  base32Encode,
  base32Decode,
  generateTotpSecret,
  generateTotp,
  verifyTotp,
  totpAuthUri,
} from '@/lib/totp';

// RFC 6238 Appendix B reference secret for HMAC-SHA1: the ASCII string
// "12345678901234567890" (20 bytes). The RFC publishes 8-digit codes; our
// implementation emits 6 digits, i.e. the low-order 6 of each published value.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

const RFC_VECTORS: Array<[seconds: number, sixDigit: string]> = [
  [59, '287082'],
  [1111111109, '081804'],
  [1111111111, '050471'],
  [1234567890, '005924'],
  [2000000000, '279037'],
  [20000000000, '353130'],
];

describe('base32', () => {
  it('round-trips arbitrary bytes', () => {
    const buf = Buffer.from([0, 1, 2, 253, 254, 255, 42, 17, 200]);
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
  });

  it('decodes case-insensitively and ignores padding/whitespace', () => {
    const encoded = base32Encode(Buffer.from('hello world'));
    const lowerPadded = `  ${encoded.toLowerCase()}==  `;
    expect(base32Decode(lowerPadded).toString()).toBe('hello world');
  });

  it('rejects characters outside the RFC 4648 alphabet', () => {
    expect(() => base32Decode('AAAA1111')).toThrow();
  });
});

describe('generateTotp — RFC 6238 SHA1 vectors', () => {
  for (const [seconds, expected] of RFC_VECTORS) {
    it(`t=${seconds}s -> ${expected}`, () => {
      expect(generateTotp(RFC_SECRET, seconds * 1000)).toBe(expected);
    });
  }
});

describe('verifyTotp', () => {
  const atMs = 1111111111 * 1000;

  it('accepts the exact-period code', () => {
    expect(verifyTotp(RFC_SECRET, '050471', 1, atMs)).toBe(true);
  });

  it('accepts a code from the previous and next period (+/-1 drift)', () => {
    const prev = generateTotp(RFC_SECRET, atMs - 30_000);
    const next = generateTotp(RFC_SECRET, atMs + 30_000);
    expect(verifyTotp(RFC_SECRET, prev, 1, atMs)).toBe(true);
    expect(verifyTotp(RFC_SECRET, next, 1, atMs)).toBe(true);
  });

  it('rejects a code two periods away when window is 1', () => {
    const drifted = generateTotp(RFC_SECRET, atMs + 60_000);
    expect(verifyTotp(RFC_SECRET, drifted, 1, atMs)).toBe(false);
  });

  it('rejects whitespace-normalised but wrong-length input', () => {
    expect(verifyTotp(RFC_SECRET, '0504', 1, atMs)).toBe(false);
    expect(verifyTotp(RFC_SECRET, '0504711', 1, atMs)).toBe(false);
  });

  it('rejects non-numeric input', () => {
    expect(verifyTotp(RFC_SECRET, 'abcdef', 1, atMs)).toBe(false);
  });

  it('accepts a code with embedded spaces (e.g. "050 471")', () => {
    expect(verifyTotp(RFC_SECRET, '050 471', 1, atMs)).toBe(true);
  });

  it('returns false (does not throw) for a malformed secret', () => {
    expect(verifyTotp('not!valid!base32', '123456', 1, atMs)).toBe(false);
  });
});

describe('generateTotpSecret', () => {
  it('produces a 160-bit (32-char base32) secret', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(secret)).toHaveLength(20);
  });

  it('produces a distinct secret each call', () => {
    expect(generateTotpSecret()).not.toBe(generateTotpSecret());
  });

  it('a freshly generated secret verifies its own current code', () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, generateTotp(secret))).toBe(true);
  });
});

describe('totpAuthUri', () => {
  it('encodes issuer, account and parameters', () => {
    const uri = totpAuthUri('ABCDEF', 'somchai', 'GPO Xchange');
    expect(uri).toMatch(/^otpauth:\/\/totp\/GPO%20Xchange:somchai\?/);
    expect(uri).toContain('secret=ABCDEF');
    expect(uri).toContain('issuer=GPO+Xchange');
    expect(uri).toContain('algorithm=SHA1');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
  });
});
