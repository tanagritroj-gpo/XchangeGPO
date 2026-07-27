import { vi } from 'vitest';

// revalidatePath only works inside a real Next.js request context. Every
// action under test calls it as a side effect after mutating data — stub it
// out globally so tests don't need to repeat this in every file.
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));
