import { vi } from 'vitest';

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
