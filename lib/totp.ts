import crypto from 'node:crypto';

/**
 * Hand-rolled TOTP (RFC 6238) with zero external dependencies.
 *
 * Design choices (see 13-mfa-remember-me-design.md §2.2):
 *  - HMAC-SHA1, 6 digits, 30-second period — the RFC 6238 defaults that every
 *    authenticator app (Google Authenticator, Authy, 1Password, ...) assumes.
 *  - 160-bit (20-byte) secret — meets OWASP ASVS 4.0 V2.8.3 (>= 128 bit).
 *  - Verification accepts a +/-1 period drift (NIST SP 800-63B 5.1.4.2).
 *
 * The secret is passed around as an unpadded, uppercase RFC 4648 base32 string —
 * the format `otpauth://` URIs and manual-entry fields use.
 */

const PERIOD_SECONDS = 30;
const DIGITS = 6;
const ALGORITHM = 'sha1';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Encode raw bytes as an unpadded, uppercase RFC 4648 base32 string. */
export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

/** Decode an RFC 4648 base32 string (padding and case insensitive). */
export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=]+/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) {
      throw new Error('Invalid base32 character in TOTP secret');
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Generate a fresh 160-bit base32 TOTP secret. */
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

/**
 * Build the `otpauth://totp/...` provisioning URI that a QR code encodes.
 * `account` is typically the staff username or email; `issuer` labels the entry.
 */
export function totpAuthUri(
  secret: string,
  account: string,
  issuer = 'GPO Xchange',
): string {
  // Conventional otpauth label form: "Issuer:account", with each part
  // percent-encoded but the separating colon left literal.
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Compute the TOTP code for a given counter (period index). */
function hotp(secretBytes: Buffer, counter: number): string {
  const counterBuf = Buffer.alloc(8);
  // Counter is a 64-bit big-endian integer; JS bit ops are 32-bit, so split.
  counterBuf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuf.writeUInt32BE(counter >>> 0, 4);

  const digest = crypto.createHmac(ALGORITHM, secretBytes).update(counterBuf).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return (binary % 10 ** DIGITS).toString().padStart(DIGITS, '0');
}

/** Current TOTP code for a secret (used in tests and for QR verification hints). */
export function generateTotp(secret: string, atMs: number = Date.now()): string {
  const counter = Math.floor(atMs / 1000 / PERIOD_SECONDS);
  return hotp(base32Decode(secret), counter);
}

/**
 * Verify a user-supplied token against the secret, accepting `window` periods of
 * clock drift on either side (default +/-1 = 90-second tolerance).
 * Returns false for any malformed input rather than throwing.
 */
export function verifyTotp(
  secret: string,
  token: string,
  window = 1,
  atMs: number = Date.now(),
): boolean {
  const normalized = (token ?? '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalized)) return false;

  let secretBytes: Buffer;
  try {
    secretBytes = base32Decode(secret);
  } catch {
    return false;
  }
  if (secretBytes.length === 0) return false;

  const counter = Math.floor(atMs / 1000 / PERIOD_SECONDS);
  const expected = Buffer.from(normalized);
  for (let errorWindow = -window; errorWindow <= window; errorWindow++) {
    const candidate = Buffer.from(hotp(secretBytes, counter + errorWindow));
    if (candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected)) {
      return true;
    }
  }
  return false;
}
