import { chromium } from "playwright";

import { ADMIN_USER, GYM_SLUG, LCP_SAMPLES, PORTS } from "../config.mjs";

/**
 * Log in ONCE through the real login form and hand back the session cookies.
 *
 * Driving the actual UI rather than hand-rolling Supabase's cookie format means the
 * harness holds exactly the session a real operator holds — including whatever the
 * proxy's `getClaims()` refresh does to it. Cookies ignore port, so the single
 * localhost session is valid for BOTH apps (3100 and 3200); the seeded user is both
 * staff of the gym and a member with an active membership, so both apps accept it.
 *
 * Returns { cookieHeader, cookies } — the string form for the raw HTTP timer, the
 * structured form for injecting into Playwright contexts.
 */
export async function login(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`http://localhost:${PORTS.admin}/login?gym=${GYM_SLUG}`);
  await page.fill('input[type="email"]', ADMIN_USER.email);
  await page.fill('input[type="password"]', ADMIN_USER.password);
  await Promise.all([
    page.waitForURL(/\/inicio/, { timeout: 20_000 }),
    page.click('button[type="submit"]'),
  ]);

  const cookies = await context.cookies();
  await context.close();

  if (!cookies.some((c) => c.name.startsWith("sb-"))) {
    throw new Error("login produced no Supabase session cookie — is the perf user seeded?");
  }

  return {
    cookies,
    cookieHeader: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
  };
}

/**
 * Largest Contentful Paint, median of LCP_SAMPLES cold contexts.
 *
 * Recorded but NOT gated (see config.GATE_METRIC). It is the number that tracks what
 * a member actually feels — bundle size, hydration, font loading — and it is how we
 * catch a "win" on the server that merely pushed the cost into the browser.
 *
 * Each sample uses a fresh context (empty cache) so we measure a first visit, which
 * is the honest case for a public gym page.
 */
export async function measureLcp(browser, port, path, cookies) {
  const samples = [];

  for (let i = 0; i < LCP_SAMPLES; i++) {
    const context = await browser.newContext();
    if (cookies?.length) await context.addCookies(cookies);
    const page = await context.newPage();

    try {
      await page.goto(`http://localhost:${port}${path}`, { waitUntil: "load", timeout: 30_000 });

      // Resolve on the FINAL LCP entry: the buffered observer replays entries that
      // fired before this script ran, and LCP is only final once the page settles.
      const lcp = await page.evaluate(
        () =>
          new Promise((resolve) => {
            let last = 0;
            new PerformanceObserver((list) => {
              for (const entry of list.getEntries()) last = entry.startTime;
            }).observe({ type: "largest-contentful-paint", buffered: true });
            // Give late images/fonts a beat to supersede the current candidate.
            setTimeout(() => resolve(last), 600);
          }),
      );
      if (lcp > 0) samples.push(lcp);
    } catch {
      // A route that cannot load is a real finding, but it is the HTTP timer's job to
      // report it (status/redirect). Don't let a flaky browser sample kill the run.
    } finally {
      await context.close();
    }
  }

  if (!samples.length) return null;
  samples.sort((a, b) => a - b);
  return +samples[Math.floor(samples.length / 2)].toFixed(1);
}

export const launchBrowser = () => chromium.launch();
