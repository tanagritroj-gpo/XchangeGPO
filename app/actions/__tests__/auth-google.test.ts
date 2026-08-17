import { describe, it, expect, vi, beforeEach } from 'vitest';

// auth-google.ts talks to the Supabase SSR client (cookies-backed, real OAuth redirect
// building), not the admin fake used elsewhere — mock the whole module so no real cookies()/
// network call is needed.
const mockSignInWithOAuth = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { signInWithOAuth: mockSignInWithOAuth },
  }),
}));

const { loginWithGoogle } = await import('../auth-google');

beforeEach(() => {
  mockSignInWithOAuth.mockReset();
  process.env.NEXT_PUBLIC_SITE_URL = 'https://portal.example.com';
});

describe('loginWithGoogle', () => {
  it('takes no arguments — the redirect target is never client-controlled', () => {
    expect(loginWithGoogle.length).toBe(0);
  });

  it('requests the google provider with the redirect pointed at our own /auth/callback', async () => {
    mockSignInWithOAuth.mockResolvedValue({ data: { url: 'https://accounts.google.com/o/oauth2/auth?...' }, error: null });
    await loginWithGoogle();
    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'https://portal.example.com/auth/callback' },
    });
  });

  it('returns the OAuth URL for the client to navigate to itself, rather than redirecting server-side', async () => {
    mockSignInWithOAuth.mockResolvedValue({ data: { url: 'https://accounts.google.com/o/oauth2/auth?...' }, error: null });
    const res = await loginWithGoogle();
    expect(res).toEqual({ success: true, url: 'https://accounts.google.com/o/oauth2/auth?...' });
  });

  it('fails cleanly, without leaking the raw Supabase error, when signInWithOAuth errors', async () => {
    mockSignInWithOAuth.mockResolvedValue({ data: { url: null }, error: { message: 'provider not configured' } });
    const res = await loginWithGoogle();
    expect(res).toEqual({ success: false, error: 'ไม่สามารถเชื่อมต่อ Google ได้ในขณะนี้' });
  });

  it('fails cleanly when no error is returned but the url is unexpectedly missing', async () => {
    mockSignInWithOAuth.mockResolvedValue({ data: { url: null }, error: null });
    const res = await loginWithGoogle();
    expect(res).toEqual({ success: false, error: 'ไม่สามารถเชื่อมต่อ Google ได้ในขณะนี้' });
  });
});
