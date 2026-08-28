import { vi, beforeEach } from 'vitest';

// revalidatePath only works inside a real Next.js request context. Every
// action under test calls it as a side effect after mutating data — stub it
// out globally so tests don't need to repeat this in every file.
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// 'server-only' is a Next.js build-time marker package (errors if bundled into
// client code) — it has no runtime behavior of its own, but plain vitest has no
// Next.js bundler to special-case it, so any action that transitively imports
// something requiring it (e.g. lib/rate-limit.ts) fails to resolve. Stub it out
// globally the same way next/cache is stubbed above.
vi.mock('server-only', () => ({}));

// Safety net: the only outbound network call in the whole codebase from within a
// unit-tested path is lib/password-policy.ts → HaveIBeenPwned. No test should ever
// hit the real network. Return a "not breached" range response for HIBP; throw
// loudly for anything else so an accidental network dependency is caught, not silent.
// (Action tests additionally mock @/lib/password-policy; password-policy.test.ts
//  installs its own per-test fetch spy on top of this.)
// Controls what the stubbed fetch returns for HaveIBeenPwned range requests.
// Default = "not breached". Tests reassign `hibp.respond` for that test only
// (reset in beforeEach below).
const NOT_BREACHED = (): Promise<Response> =>
  Promise.resolve(new Response('0'.repeat(35) + ':0\n', { status: 200 }));
export const hibp: { respond: (rangePrefix: string) => Promise<Response> } = {
  respond: NOT_BREACHED,
};

export const fetchStub = vi.fn(async (...args: unknown[]) => {
  const input = args[0];
  const url =
    typeof input === 'string' ? input : String((input as { url?: string })?.url ?? input);
  const m = url.match(/api\.pwnedpasswords\.com\/range\/([A-F0-9]{5})/i);
  if (m) return hibp.respond(m[1]);
  // Anything else (e.g. Sentry transport) — never hit the real network; degrade quietly.
  return new Response(null, { status: 503 });
});
vi.stubGlobal('fetch', fetchStub);

beforeEach(() => {
  fetchStub.mockClear();
  hibp.respond = NOT_BREACHED;
});
