import { describe, it, expect } from 'vitest';
import {
  parseDeviceLabel, generateDeviceToken, hashDeviceToken, sessionShortId,
} from '@/lib/device';

describe('parseDeviceLabel', () => {
  const cases: Array<[ua: string, expected: string]> = [
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', 'Chrome บน Windows'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15', 'Safari บน macOS'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1', 'Chrome บน iPhone'],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0', 'Firefox บน Linux'],
    ['Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 Edg/124.0', 'Edge บน Windows'],
  ];
  for (const [ua, expected] of cases) {
    it(`${expected}`, () => expect(parseDeviceLabel(ua)).toBe(expected));
  }
  it('handles null/garbage', () => {
    expect(parseDeviceLabel(null)).toBe('อุปกรณ์ที่ไม่ทราบ');
    expect(parseDeviceLabel('curl/8.1')).toBe('อุปกรณ์ที่ไม่ทราบ');
  });
});

describe('device token', () => {
  it('generates 64 hex chars and hashes deterministically', () => {
    const raw = generateDeviceToken();
    expect(raw).toMatch(/^[0-9a-f]{64}$/);
    expect(hashDeviceToken(raw)).toBe(hashDeviceToken(raw));
    expect(hashDeviceToken(raw)).not.toBe(raw);
    expect(generateDeviceToken()).not.toBe(generateDeviceToken());
  });
});

describe('sessionShortId', () => {
  it('is a stable 16-hex-char non-reversible handle', () => {
    const id = sessionShortId('11111111-1111-1111-1111-111111111111');
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(sessionShortId('11111111-1111-1111-1111-111111111111')).toBe(id);
    expect(sessionShortId('22222222-2222-2222-2222-222222222222')).not.toBe(id);
  });
});
