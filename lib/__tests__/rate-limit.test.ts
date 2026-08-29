import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── mock ชั้นล่างสุด: supabaseAdmin.rpc(...).maybeSingle() ──
// คุมค่าที่ maybeSingle คืน/throw ได้ต่อเทสต์ เพื่อจำลอง "store ปกติ" กับ "store ล่ม"
const maybeSingle = vi.fn();
const rpc = vi.fn(() => ({ maybeSingle }));
vi.mock('@/lib/supabase/admin', () => ({ admin: { rpc } }));

// จับ Sentry alert — fallback path ทุกครั้งต้องยิง (ไม่ใช่บันทึกเงียบ ๆ)
const captureMessage = vi.fn();
vi.mock('@sentry/nextjs', () => ({
  captureMessage: (...args: unknown[]) => captureMessage(...args),
}));

const { checkRateLimit } = await import('@/lib/rate-limit');

beforeEach(() => {
  rpc.mockClear();
  maybeSingle.mockReset();
  captureMessage.mockClear();
});

describe('checkRateLimit — การทำงานปกติ (store ตอบได้)', () => {
  it('ผ่านเมื่อ count ยังไม่เกิน limit และคำนวณ remaining ถูก', async () => {
    maybeSingle.mockResolvedValue({ data: { current_count: 3 }, error: null });

    const result = await checkRateLimit('login-staff:bob', 10, 300);

    expect(result).toEqual({ allowed: true, remaining: 7 });
    expect(rpc).toHaveBeenCalledWith('increment_rate_limit', {
      p_key: 'login-staff:bob',
      p_window_seconds: 300,
    });
  });

  it('ผ่านพอดีที่ขอบ (count === limit)', async () => {
    maybeSingle.mockResolvedValue({ data: { current_count: 10 }, error: null });
    expect((await checkRateLimit('k', 10, 300)).allowed).toBe(true);
  });

  it('บล็อกเมื่อ count เกิน limit และ remaining ไม่ติดลบ', async () => {
    maybeSingle.mockResolvedValue({ data: { current_count: 11 }, error: null });

    const result = await checkRateLimit('login-staff:bob', 10, 300);

    expect(result).toEqual({ allowed: false, remaining: 0 });
    expect(captureMessage).not.toHaveBeenCalled();
  });
});

describe('checkRateLimit — fallback เมื่อ store เช็คไม่ได้', () => {
  it('ค่าเริ่มต้น = fail CLOSED: RPC error → บล็อกคำขอ', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'connection refused' } });

    const result = await checkRateLimit('login-staff:bob', 10, 300);

    expect(result).toEqual({ allowed: false, remaining: 0 });
  });

  it('ค่าเริ่มต้น = fail CLOSED: data เป็น null โดยไม่มี error ก็ยังบล็อก', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await checkRateLimit('register:x@y.com', 3, 3600)).allowed).toBe(false);
  });

  it('ค่าเริ่มต้น = fail CLOSED: maybeSingle throw (network) ก็บล็อก ไม่ reject ทะลุไป caller', async () => {
    maybeSingle.mockRejectedValue(new Error('socket hang up'));

    const result = await checkRateLimit('customer-pwreset-verify:a@b.com', 5, 300);

    expect(result).toEqual({ allowed: false, remaining: 0 });
  });

  it('fail OPEN เฉพาะเมื่อระบุ failMode: "open" ชัดเจนเท่านั้น', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'db down' } });

    const result = await checkRateLimit('track:ip:1.2.3.4', 20, 300, { failMode: 'open' });

    expect(result).toEqual({ allowed: true, remaining: 20 });
  });

  it('fail OPEN ที่ระบุชัดเจน ก็ยังยิง Sentry alert (ไม่เงียบ)', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'db down' } });

    await checkRateLimit('track:miss:1.2.3.4', 8, 900, { failMode: 'open' });

    expect(captureMessage).toHaveBeenCalledTimes(1);
    const [msg, opts] = captureMessage.mock.calls[0] as [string, any];
    expect(msg).toContain('failing open');
    expect(opts.tags.failMode).toBe('open');
  });

  it('ยิง Sentry ทุก fallback พร้อม tag failMode/keyCategory และ "ไม่" ส่ง key ดิบ (กัน PII หลุด)', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'db down' } });

    await checkRateLimit('login-customer:secret@example.com', 10, 300);

    expect(captureMessage).toHaveBeenCalledTimes(1);
    const [msg, opts] = captureMessage.mock.calls[0] as [string, any];
    expect(msg).toContain('failing closed');
    expect(opts.level).toBe('error');
    expect(opts.tags.failMode).toBe('closed');
    expect(opts.tags.keyCategory).toBe('login-customer');
    // key เต็ม (มีอีเมล) ต้องไม่หลุดเข้า Sentry payload ไม่ว่าจุดไหน
    expect(JSON.stringify(opts)).not.toContain('secret@example.com');
  });
});
