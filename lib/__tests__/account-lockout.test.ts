import { describe, it, expect } from 'vitest';
import {
  LOCKOUT_THRESHOLD,
  lockDurationMinutes,
  lockStatus,
  lockedMessage,
  recordFailure,
  CLEARED,
} from '@/lib/account-lockout';

describe('lockDurationMinutes', () => {
  it('ยังไม่ล็อกก่อนถึงเกณฑ์', () => {
    for (let i = 0; i < LOCKOUT_THRESHOLD; i++) expect(lockDurationMinutes(i)).toBe(0);
  });
  it('ล็อก 15 → 30 → 60 (cap) ตามจำนวนครั้งสะสม', () => {
    expect(lockDurationMinutes(5)).toBe(15);
    expect(lockDurationMinutes(6)).toBe(30);
    expect(lockDurationMinutes(7)).toBe(60);
    expect(lockDurationMinutes(20)).toBe(60);
  });
});

describe('lockStatus', () => {
  it('ไม่ล็อกเมื่อ null/undefined หรือเวลาผ่านไปแล้ว', () => {
    expect(lockStatus(null)).toEqual({ locked: false, minutesLeft: 0 });
    expect(lockStatus(undefined)).toEqual({ locked: false, minutesLeft: 0 });
    expect(lockStatus(new Date(Date.now() - 60_000).toISOString())).toEqual({ locked: false, minutesLeft: 0 });
  });
  it('ล็อกเมื่อ locked_until ยังอยู่ในอนาคต + ปัดขึ้นเป็นนาที', () => {
    const r = lockStatus(new Date(Date.now() + 12.3 * 60_000).toISOString());
    expect(r.locked).toBe(true);
    expect(r.minutesLeft).toBe(13);
  });
});

describe('recordFailure', () => {
  it('เพิ่ม count ทีละ 1; ยังไม่ล็อกจนถึงครั้งที่ 5', () => {
    const r = recordFailure(3);
    expect(r).toEqual({ failed_login_count: 4, locked_until: null, justLocked: false });
  });
  it('ครั้งที่ 5 → justLocked + locked_until ~15 นาทีข้างหน้า', () => {
    const before = Date.now();
    const r = recordFailure(4);
    expect(r.failed_login_count).toBe(5);
    expect(r.justLocked).toBe(true);
    const ms = new Date(r.locked_until!).getTime() - before;
    expect(ms).toBeGreaterThan(14 * 60_000);
    expect(ms).toBeLessThan(16 * 60_000);
  });
  it('ครั้งที่ 6 → ~30 นาที', () => {
    const r = recordFailure(5);
    const ms = new Date(r.locked_until!).getTime() - Date.now();
    expect(ms).toBeGreaterThan(29 * 60_000);
    expect(ms).toBeLessThan(31 * 60_000);
  });
});

describe('lockedMessage / CLEARED', () => {
  it('ข้อความบอกจำนวนนาทีที่เหลือ', () => {
    expect(lockedMessage(7)).toContain('7 นาที');
  });
  it('CLEARED รีเซ็ตทั้ง count และ lock', () => {
    expect(CLEARED).toEqual({ failed_login_count: 0, locked_until: null });
  });
});
