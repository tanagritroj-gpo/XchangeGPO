import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Regression test for the bug found in app/tracking/page.tsx: a public page
// (no session guard) had a "กลับหน้าหลัก" (back to home) link pointing at
// href="/welcome" — the authenticated customer dashboard — instead of "/".
// Anyone whose browser still held a valid (but forgotten, or shared-device)
// session cookie would land straight on that dashboard instead of the
// public home page. No session-validation bug was involved: the link
// itself just claimed to go "home" while actually pointing at gated,
// personalized content.
//
// This test targets exactly that pattern — a link labeled as a neutral
// "back to home" / "กลับหน้าหลัก" navigation, on a page with no auth guard,
// must point at "/". It deliberately does NOT flag public pages that link
// into protected routes under an honest label (e.g. the /guide page's
// "เข้าระบบเพื่อยื่นคำร้อง" button to /form) — those rely on the target
// route's own guard to redirect unauthenticated visitors to login, which is
// a normal, intentional pattern, not a mislabeled destination.
//
// "Protected" is derived from the actual guard code (a layout.tsx in the
// route's directory chain that calls getCustomerSession()/getStaffSession()
// and redirects when absent) rather than a hand-maintained list, so this
// keeps working as routes are added or moved.

const APP_DIR = path.resolve(__dirname, '../../app');

const GUARD_MARKERS = ['getCustomerSession(', 'getStaffSession('];

// Phrases the codebase actually uses for "go back to the neutral home page".
// Any of these appearing as link text is a promise that the link is safe to
// click regardless of login state.
const HOME_LINK_PHRASES = ['กลับหน้าหลัก', 'back to home'];

function hasGuard(fileContent: string): boolean {
  return (
    GUARD_MARKERS.some((marker) => fileContent.includes(marker)) &&
    fileContent.includes('redirect(')
  );
}

function findAllPageFiles(): string[] {
  return fs
    .readdirSync(APP_DIR, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && d.name === 'page.tsx')
    .map((d) => path.join((d as any).parentPath ?? (d as any).path, d.name));
}

// Walk from a page file's directory up to app/, collecting every layout.tsx
// on the way (Next.js layouts nest, so any ancestor guard applies).
function ancestorLayouts(pageFile: string): string[] {
  const layouts: string[] = [];
  let dir = path.dirname(pageFile);
  while (true) {
    const layoutFile = path.join(dir, 'layout.tsx');
    if (fs.existsSync(layoutFile)) layouts.push(layoutFile);
    if (path.resolve(dir) === path.resolve(APP_DIR)) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return layouts;
}

function isProtectedPage(pageFile: string): boolean {
  if (hasGuard(fs.readFileSync(pageFile, 'utf8'))) return true;
  return ancestorLayouts(pageFile).some((layoutFile) =>
    hasGuard(fs.readFileSync(layoutFile, 'utf8')),
  );
}

interface HomeLinkTarget {
  href: string;
  text: string;
}

// Finds <a href="...">...</a> tags whose visible text is one of the known
// "back to home" phrases, and returns their static href target. Only
// matches string-literal hrefs (href="/x" or href='/x') — dynamic hrefs
// aren't the pattern this bug involved and can't be checked statically.
function homeLabeledLinks(source: string): HomeLinkTarget[] {
  const results: HomeLinkTarget[] = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const [, attrs, inner] = match;
    const isHomeLabel = HOME_LINK_PHRASES.some((phrase) => inner.includes(phrase));
    if (!isHomeLabel) continue;
    const hrefMatch = /href\s*=\s*(["'])(\/[^"'{]*)\1/.exec(attrs);
    if (hrefMatch) results.push({ href: hrefMatch[2], text: inner.trim() });
  }
  return results;
}

describe('"back to home" links on public pages must point to "/"', () => {
  const pageFiles = findAllPageFiles();
  const protectedPages = pageFiles.filter(isProtectedPage);
  const publicPages = pageFiles.filter((f) => !protectedPages.includes(f));

  // Sanity check: this suite is only meaningful if it can actually see both
  // kinds of routes. If either list goes empty because the directory
  // structure changed, the test would trivially pass without checking
  // anything.
  it('finds both protected and public pages', () => {
    expect(protectedPages.length).toBeGreaterThan(0);
    expect(publicPages.length).toBeGreaterThan(0);
  });

  const publicPagesWithHomeLinks = publicPages
    .map((f) => ({ file: f, links: homeLabeledLinks(fs.readFileSync(f, 'utf8')) }))
    .filter((p) => p.links.length > 0);

  it('at least one public page actually has a "back to home" link (suite is exercised)', () => {
    expect(publicPagesWithHomeLinks.length).toBeGreaterThan(0);
  });

  it.each(
    publicPagesWithHomeLinks.flatMap(({ file, links }) =>
      links.map((link) => [path.relative(APP_DIR, file), link] as const),
    ),
  )('%s: "back to home" link goes to "/"', (_relPath, link) => {
    expect(link.href).toBe('/');
  });
});
