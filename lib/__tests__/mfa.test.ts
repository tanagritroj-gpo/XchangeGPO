import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { createFakeAdmin } from '../../test/fakeSupabase';

process.env.OTP_PEPPER = 'test-pepper';
process.env.MFA_SECRET_KEY = 'unit-test-mfa-key-0123456789';

vi.mock('@/lib/supabase/admin', async () => {
  const { createFakeAdmin } = await import('../../test/fakeSupabase');
  return { admin: undefined, __fake: createFakeAdmin() };
});

const adminModule: any = await import('@/lib/supabase/admin');
const fakeAdmin: ReturnType<typeof createFakeAdmin> = adminModule.__fake;
adminModule.admin = fakeAdmin.client;

const {
  generateRecoveryCodes, hashRecoveryCode, normalizeRecoveryCode,
  consumeRecoveryCode, countUnusedRecoveryCodes,
  saveStaffMfaSecret, getStaffMfaSecret,
  createTrustedDevice, consumeTrustedDevice, revokeAllTrustedDevices,
} = await import('../mfa');

beforeEach(() => {
  fakeAdmin.seed({ staff_users: [], staff_mfa_recovery_codes: [], staff_trusted_devices: [] });
});

describe('recovery codes', () => {
  it('generates 10 formatted codes with matching hashes', () => {
    const { plain, hashes } = generateRecoveryCodes();
    expect(plain).toHaveLength(10);
    expect(hashes).toHaveLength(10);
    for (const code of plain) {
      expect(code).toMatch(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/);
      expect(code).not.toMatch(/[OIL01]/); // unambiguous alphabet
    }
    expect(hashes[0]).toBe(hashRecoveryCode(plain[0]));
    expect(new Set(plain).size).toBe(10);
  });

  it('hash ignores case and separators', () => {
    expect(hashRecoveryCode('abcde-12345')).toBe(hashRecoveryCode('ABCDE12345'));
    expect(normalizeRecoveryCode('  ab-cd ef ')).toBe('ABCDEF');
  });

  it('consumeRecoveryCode marks a matching unused code used, once', async () => {
    const { plain, hashes } = generateRecoveryCodes();
    fakeAdmin.seed({
      staff_mfa_recovery_codes: hashes.map((code_hash, i) => ({
        id: `c${i}`, staff_id: 'staff-1', code_hash, used_at: null,
      })),
    });

    expect(await consumeRecoveryCode('staff-1', plain[3])).toBe(true);
    // second use of the same code fails
    expect(await consumeRecoveryCode('staff-1', plain[3])).toBe(false);
    // a still-unused one works
    expect(await consumeRecoveryCode('staff-1', plain[4])).toBe(true);

    expect(await countUnusedRecoveryCodes('staff-1')).toBe(8);
  });

  it('consumeRecoveryCode rejects a non-matching / too-short code', async () => {
    fakeAdmin.seed({ staff_mfa_recovery_codes: [{ id: 'c0', staff_id: 'staff-1', code_hash: 'x', used_at: null }] });
    expect(await consumeRecoveryCode('staff-1', '12345')).toBe(false);
    expect(await consumeRecoveryCode('staff-1', 'ZZZZZ-ZZZZZ')).toBe(false);
  });
});

describe('mfa secret RPC wrappers', () => {
  it('saveStaffMfaSecret / getStaffMfaSecret round-trip through the RPC layer', async () => {
    const store: Record<string, string> = {};
    fakeAdmin.setRpcHandler('set_staff_mfa_secret', ({ p_staff_id, p_secret }) => {
      store[p_staff_id] = p_secret;
      return { data: null, error: null };
    });
    fakeAdmin.setRpcHandler('get_staff_mfa_secret', ({ p_staff_id }) => ({
      data: store[p_staff_id] ?? null, error: null,
    }));

    await saveStaffMfaSecret('staff-1', 'JBSWY3DPEHPK3PXP');
    expect(await getStaffMfaSecret('staff-1')).toBe('JBSWY3DPEHPK3PXP');
    expect(await getStaffMfaSecret('nobody')).toBeNull();
  });

  it('getStaffMfaSecret throws a clear error when the RPC errors', async () => {
    fakeAdmin.setRpcHandler('get_staff_mfa_secret', () => ({ data: null, error: { message: 'boom' } }));
    await expect(getStaffMfaSecret('staff-1')).rejects.toThrow(/get_staff_mfa_secret/);
  });
});

describe('trusted devices', () => {
  const meta = { userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/124.0 Safari/537.36', ip: '203.0.113.7' };

  it('createTrustedDevice stores a hashed token + label and returns the raw token', async () => {
    const raw = await createTrustedDevice('staff-1', meta);
    expect(raw).toMatch(/^[0-9a-f]{64}$/);
    const rows = fakeAdmin.rows('staff_trusted_devices');
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).not.toBe(raw);
    expect(rows[0].label).toBe('Chrome บน Windows');
    expect(new Date(rows[0].expires_at).getTime()).toBeGreaterThan(Date.now() + 20 * 86400_000);
  });

  it('consumeTrustedDevice accepts a valid token, rotates it, and rejects the old one', async () => {
    const raw = await createTrustedDevice('staff-1', meta);
    const next = await consumeTrustedDevice('staff-1', raw!, meta);
    expect(next).toMatch(/^[0-9a-f]{64}$/);
    expect(next).not.toBe(raw);
    // old token no longer valid
    expect(await consumeTrustedDevice('staff-1', raw!, meta)).toBeNull();
    // new token valid
    expect(await consumeTrustedDevice('staff-1', next!, meta)).not.toBeNull();
  });

  it('consumeTrustedDevice rejects another staff member / expired rows', async () => {
    const raw = await createTrustedDevice('staff-1', meta);
    expect(await consumeTrustedDevice('staff-2', raw!, meta)).toBeNull();

    fakeAdmin.seed({
      staff_trusted_devices: [{
        id: 'd-old', staff_id: 'staff-1', token_hash: (await import('../device')).hashDeviceToken('xyz'),
        expires_at: new Date(Date.now() - 1000).toISOString(),
      }],
    });
    expect(await consumeTrustedDevice('staff-1', 'xyz', meta)).toBeNull();
  });

  it('revokeAllTrustedDevices clears every row for the staff member', async () => {
    await createTrustedDevice('staff-1', meta);
    await createTrustedDevice('staff-1', meta);
    await createTrustedDevice('staff-2', meta);
    await revokeAllTrustedDevices('staff-1');
    const rows = fakeAdmin.rows('staff_trusted_devices');
    expect(rows).toHaveLength(1);
    expect(rows[0].staff_id).toBe('staff-2');
  });
});
