import 'server-only';
import crypto from 'node:crypto';
import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import { generateDeviceToken, hashDeviceToken, parseDeviceLabel } from '@/lib/device';

export const TRUSTED_DEVICE_DAYS = 30;

/**
 * Server-side helpers for staff TOTP MFA (Phase 2 of 13-mfa-remember-me-design.md).
 *
 *  - The TOTP secret never touches application code as ciphertext: it is encrypted
 *    and decrypted inside Postgres via the set_staff_mfa_secret / get_staff_mfa_secret
 *    RPCs (pgcrypto pgp_sym_encrypt), keyed by MFA_SECRET_KEY.
 *  - Recovery codes are hashed with OTP_PEPPER, the same scheme as OTP login codes.
 */

export const RECOVERY_CODE_COUNT = 10;
// Crockford-ish alphabet: no 0/O/1/I/L to keep hand-typed codes unambiguous.
const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function mfaKey(): string {
  const key = process.env.MFA_SECRET_KEY;
  if (!key || key.length < 16) {
    throw new Error('MFA_SECRET_KEY is not configured');
  }
  return key;
}

/** Persist a freshly generated TOTP secret (encrypted at rest by the RPC). */
export async function saveStaffMfaSecret(staffId: string, base32Secret: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc('set_staff_mfa_secret', {
    p_staff_id: staffId,
    p_secret: base32Secret,
    p_key: mfaKey(),
  });
  if (error) throw new Error(`set_staff_mfa_secret failed: ${error.message}`);
}

/** Decrypt and return a staff member's TOTP secret, or null if none is stored. */
export async function getStaffMfaSecret(staffId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.rpc('get_staff_mfa_secret', {
    p_staff_id: staffId,
    p_key: mfaKey(),
  });
  if (error) throw new Error(`get_staff_mfa_secret failed: ${error.message}`);
  return (data as string | null) ?? null;
}

export function hashRecoveryCode(code: string): string {
  return crypto
    .createHash('sha256')
    .update(normalizeRecoveryCode(code) + process.env.OTP_PEPPER)
    .digest('hex');
}

/** Strip formatting so "abcd-2345" and "ABCD 2345" hash identically. */
export function normalizeRecoveryCode(code: string): string {
  return (code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Generate N display codes ("XXXXX-XXXXX") plus their hashes for storage. */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): {
  plain: string[];
  hashes: string[];
} {
  const plain: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = Array.from(crypto.randomBytes(10))
      .map((b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length])
      .join('');
    plain.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return { plain, hashes: plain.map(hashRecoveryCode) };
}

/** Replace all of a staff member's recovery codes with a new hashed set. */
export async function replaceRecoveryCodes(staffId: string, hashes: string[]): Promise<void> {
  await supabaseAdmin.from('staff_mfa_recovery_codes').delete().eq('staff_id', staffId);
  const { error } = await supabaseAdmin.from('staff_mfa_recovery_codes').insert(
    hashes.map((code_hash) => ({ staff_id: staffId, code_hash })),
  );
  if (error) throw new Error(`recovery code insert failed: ${error.message}`);
}

/**
 * Consume a recovery code: returns true and marks it used if it matches an
 * unused row for this staff member, false otherwise.
 */
export async function consumeRecoveryCode(staffId: string, code: string): Promise<boolean> {
  const normalized = normalizeRecoveryCode(code);
  if (normalized.length < 8) return false;

  const { data: row } = await supabaseAdmin
    .from('staff_mfa_recovery_codes')
    .select('id')
    .eq('staff_id', staffId)
    .eq('code_hash', hashRecoveryCode(code))
    .is('used_at', null)
    .maybeSingle();

  if (!row) return false;

  const { error } = await supabaseAdmin
    .from('staff_mfa_recovery_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('id', row.id)
    .is('used_at', null);

  return !error;
}

/** Count of recovery codes a staff member has left (for the account UI). */
export async function countUnusedRecoveryCodes(staffId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from('staff_mfa_recovery_codes')
    .select('id', { count: 'exact', head: true })
    .eq('staff_id', staffId)
    .is('used_at', null);
  return count ?? 0;
}

// ── Trusted devices (Phase 3) — a valid row lets login skip the TOTP challenge ──

/** Register a new trusted device; returns the raw token to put in the cookie. */
export async function createTrustedDevice(
  staffId: string,
  meta: { userAgent: string | null; ip: string | null },
): Promise<string | null> {
  const raw = generateDeviceToken();
  const { error } = await supabaseAdmin.from('staff_trusted_devices').insert({
    staff_id: staffId,
    token_hash: hashDeviceToken(raw),
    label: parseDeviceLabel(meta.userAgent),
    user_agent: meta.userAgent,
    ip: meta.ip,
    expires_at: new Date(Date.now() + TRUSTED_DEVICE_DAYS * 86400_000).toISOString(),
  });
  if (error) return null;
  return raw;
}

/**
 * If `rawToken` matches a live trusted device for this staff member, rotate its
 * token (single-use style) and return the new raw token. Otherwise null.
 */
export async function consumeTrustedDevice(
  staffId: string,
  rawToken: string,
  meta: { userAgent: string | null; ip: string | null },
): Promise<string | null> {
  if (!rawToken) return null;
  const { data: row } = await supabaseAdmin
    .from('staff_trusted_devices')
    .select('id, expires_at')
    .eq('staff_id', staffId)
    .eq('token_hash', hashDeviceToken(rawToken))
    .maybeSingle();

  if (!row || new Date(row.expires_at) < new Date()) return null;

  const next = generateDeviceToken();
  const { error } = await supabaseAdmin
    .from('staff_trusted_devices')
    .update({
      token_hash: hashDeviceToken(next),
      last_used_at: new Date().toISOString(),
      user_agent: meta.userAgent,
      ip: meta.ip,
    })
    .eq('id', row.id);
  if (error) return null;
  return next;
}

export async function revokeAllTrustedDevices(staffId: string): Promise<void> {
  await supabaseAdmin.from('staff_trusted_devices').delete().eq('staff_id', staffId);
}
