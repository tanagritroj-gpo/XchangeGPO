import { describe, it, expect } from 'vitest';
import { hibp, fetchStub } from '../../test/setup';
import {
  MIN_PASSWORD_LENGTH,
  assertPasswordAllowed,
  isPasswordBreached,
  validateNewPassword,
  assessPasswordStrength,
  passwordField,
} from '@/lib/password-policy';

const range = (body: string) => () => Promise.resolve(new Response(body, { status: 200 }));

// SHA-1("correct horse battery staple 2569") — คำนวณไว้ล่วงหน้าสำหรับ mock HIBP
// (จริง ๆ เทสต์คำนวณเองด้านล่างเพื่อไม่ต้อง hardcode)
async function sha1Upper(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

describe('assertPasswordAllowed — รูปแบบ', () => {
  const OK = 'จักรยานสีส้มคันเก่ง2569'; // ยาวพอ ไม่ trivial ไม่มีคำต้องห้าม

  it('ผ่านรหัสผ่านที่ยาวพอและไม่มีปัญหา', () => {
    expect(assertPasswordAllowed(OK)).toEqual({ ok: true });
    expect(assertPasswordAllowed('correct-horse-battery-staple')).toEqual({ ok: true });
  });

  it('ปฏิเสธค่าว่าง / ไม่ใช่ string', () => {
    expect(assertPasswordAllowed('').ok).toBe(false);
    expect(assertPasswordAllowed(undefined).ok).toBe(false);
    expect(assertPasswordAllowed(12345678901234).ok).toBe(false);
  });

  it(`ปฏิเสธสั้นกว่า ${MIN_PASSWORD_LENGTH} ตัว`, () => {
    const r = assertPasswordAllowed('Xk9-mLp2#Qw'); // 11 ตัว ไม่ trivial
    expect(r.ok).toBe(false);
    expect(r.error).toContain(String(MIN_PASSWORD_LENGTH));
    expect(assertPasswordAllowed('Xk9-mLp2#QwZ').ok).toBe(true); // 12 ตัว → ผ่าน
  });

  it('ปฏิเสธยาวเกิน 72 ตัวอักษร และเกิน 72 ไบต์ (ภาษาไทยหลายตัว)', () => {
    expect(assertPasswordAllowed('a'.repeat(73)).ok).toBe(false);
    // 25 ตัวไทย = 75 ไบต์ (เกิน 72) แต่ < 72 ตัวอักษร
    expect(assertPasswordAllowed('ก'.repeat(25)).ok).toBe(false);
    expect(assertPasswordAllowed('ก'.repeat(25)).error).toContain('ไบต์');
  });

  it('ปฏิเสธตัวซ้ำล้วน / เรียงลำดับ', () => {
    expect(assertPasswordAllowed('aaaaaaaaaaaaaa').ok).toBe(false);
    expect(assertPasswordAllowed('123456789012345').ok).toBe(false);
    expect(assertPasswordAllowed('abcdefghijklmno').ok).toBe(false);
    expect(assertPasswordAllowed('qwertyuiopasdfg').ok).toBe(false);
    expect(assertPasswordAllowed('987654321098765').ok).toBe(false); // เรียงย้อนกลับ
  });

  it('ปฏิเสธคำต้องห้ามในระบบ + คำที่มาจาก identifier', () => {
    expect(assertPasswordAllowed('mypasswordislong123').ok).toBe(false); // "password"
    expect(assertPasswordAllowed('gpoxchange-portal-2569').ok).toBe(false);
    expect(
      assertPasswordAllowed('somchai-likes-cats-2569', { identifiers: ['somchai@hospital.go.th'] }).ok,
    ).toBe(false); // "somchai"
    expect(
      assertPasswordAllowed('bkkgeneral-return-flow', { identifiers: ['bkkgeneral'] }).ok,
    ).toBe(false);
  });

  it('identifier สั้นกว่า 4 ตัว ไม่ถูกใช้เป็น blocklist (กัน false positive)', () => {
    expect(assertPasswordAllowed('abc-is-a-fine-phrase-2569', { identifiers: ['abc'] }).ok).toBe(true);
  });
});

describe('passwordField (Zod)', () => {
  it('สะท้อน assertPasswordAllowed', () => {
    expect(passwordField.safeParse('จักรยานสีส้มคันเก่ง2569').success).toBe(true);
    const bad = passwordField.safeParse('short');
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0].message).toContain(String(MIN_PASSWORD_LENGTH));
  });
});

describe('isPasswordBreached — HaveIBeenPwned k-anonymity', () => {
  const PW = 'จักรยานสีส้มคันเก่ง2569';

  it('ส่งแค่ 5 ตัวแรกของ SHA-1 ไม่เคยส่งรหัสผ่าน/hash เต็ม + ใช้ Add-Padding', async () => {
    const hash = await sha1Upper(PW);
    hibp.respond = range(hash.slice(5) + ':0\n');

    await isPasswordBreached(PW);

    const [url, init] = fetchStub.mock.calls.at(-1) as [string, RequestInit];
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`);
    expect(url).not.toContain(hash.slice(5));
    expect(JSON.stringify(init)).not.toContain(PW);
    expect((init.headers as Record<string, string>)['Add-Padding']).toBe('true');
  });

  it('breached=true เมื่อ suffix อยู่ใน response พร้อม count > 0', async () => {
    const hash = await sha1Upper(PW);
    hibp.respond = range(`AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:2\n${hash.slice(5)}:42\n`);
    expect(await isPasswordBreached(PW)).toEqual({ breached: true, checkFailed: false });
  });

  it('breached=false เมื่อ suffix ไม่อยู่ในรายการ (default stub)', async () => {
    expect(await isPasswordBreached(PW)).toEqual({ breached: false, checkFailed: false });
  });

  it('fail-open (checkFailed=true) เมื่อ API คืน error', async () => {
    hibp.respond = () => Promise.resolve(new Response('nope', { status: 503 }));
    expect(await isPasswordBreached('x')).toEqual({ breached: false, checkFailed: true });
  });

  it('fail-open (checkFailed=true) เมื่อ fetch throw / timeout', async () => {
    hibp.respond = async () => { throw new Error('timeout'); };
    expect(await isPasswordBreached('x')).toEqual({ breached: false, checkFailed: true });
  });
});

describe('validateNewPassword — รวม shape + HIBP', () => {
  it('ปฏิเสธตั้งแต่ shape โดยไม่เรียก HIBP', async () => {
    const r = await validateNewPassword('short');
    expect(r.ok).toBe(false);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('ปฏิเสธเมื่อ HIBP บอกว่าเคยรั่ว', async () => {
    const pw = 'จักรยานสีส้มคันเก่ง2569';
    const hash = await sha1Upper(pw);
    hibp.respond = range(`${hash.slice(5)}:9\n`);
    const r = await validateNewPassword(pw);
    expect(r).toEqual({ ok: false, error: expect.stringContaining('รั่วไหล') });
  });

  it('ผ่าน + breachCheckFailed=true เมื่อ HIBP ล่ม (fail-open)', async () => {
    hibp.respond = async () => { throw new Error('down'); };
    const r = await validateNewPassword('จักรยานสีส้มคันเก่ง2569');
    expect(r).toEqual({ ok: true, breachCheckFailed: true });
  });
});

describe('assessPasswordStrength', () => {
  it('score ต่ำเมื่อสั้น/trivial, สูงเมื่อยาวและหลากหลาย', () => {
    expect(assessPasswordStrength('').score).toBe(0);
    expect(assessPasswordStrength('short').score).toBeLessThanOrEqual(1);
    expect(assessPasswordStrength('aaaaaaaaaaaaaaaa').score).toBeLessThanOrEqual(1);
    expect(assessPasswordStrength('Tr0ub4dour-and-3-more-words!').score).toBeGreaterThanOrEqual(3);
  });

  it('มี hint บอกความยาวขั้นต่ำเมื่อสั้นเกินไป', () => {
    expect(assessPasswordStrength('abc').hint).toContain(String(MIN_PASSWORD_LENGTH));
  });
});
