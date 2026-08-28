import crypto from 'node:crypto';

/**
 * Tiny, dependency-free helpers for the trusted-device / session-list features
 * (Phase 3 of 13-mfa-remember-me-design.md).
 */

export function generateDeviceToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashDeviceToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Short, non-reversible handle for a session, safe to send to the client so it
 * can ask to revoke a specific session without ever seeing the session token.
 */
export function sessionShortId(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 16);
}

const BROWSERS: Array<[re: RegExp, name: string]> = [
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\bOPR\/|\bOpera\//, 'Opera'],
  [/\bFirefox\/|\bFxiOS\//, 'Firefox'],
  [/\bCriOS\//, 'Chrome'],
  [/\bChrome\//, 'Chrome'],
  [/\bSafari\//, 'Safari'],
];

const PLATFORMS: Array<[re: RegExp, name: string]> = [
  [/\biPhone\b/, 'iPhone'],
  [/\biPad\b/, 'iPad'],
  [/\bAndroid\b/, 'Android'],
  [/\bWindows NT\b/, 'Windows'],
  [/\bMac OS X\b|\bMacintosh\b/, 'macOS'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bLinux\b/, 'Linux'],
];

/** Best-effort "Chrome บน Windows"-style label from a User-Agent string. */
export function parseDeviceLabel(userAgent: string | null | undefined): string {
  if (!userAgent) return 'อุปกรณ์ที่ไม่ทราบ';
  const browser = BROWSERS.find(([re]) => re.test(userAgent))?.[1];
  const platform = PLATFORMS.find(([re]) => re.test(userAgent))?.[1];
  if (browser && platform) return `${browser} บน ${platform}`;
  if (browser) return browser;
  if (platform) return platform;
  return 'อุปกรณ์ที่ไม่ทราบ';
}
