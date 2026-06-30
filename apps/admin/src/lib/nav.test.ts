import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { consumeInAppNav, markInAppNav } from "./nav";

/** Minimal in-memory sessionStorage stub (node test env has no DOM). */
function stubSessionStorage(): Map<string, string> {
  const store = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("in-app nav breadcrumb", () => {
  beforeEach(() => stubSessionStorage());

  it("is absent (false) by default — a cold deep link does not look in-app", () => {
    expect(consumeInAppNav()).toBe(false);
  });

  it("reads true exactly once after being armed, then clears (one-shot)", () => {
    markInAppNav();
    expect(consumeInAppNav()).toBe(true);
    // Consumed: a later back press on a fresh load must NOT see a stale flag.
    expect(consumeInAppNav()).toBe(false);
  });
});

describe("breadcrumb degrades safely without storage", () => {
  it("returns false (→ fall back to push) when sessionStorage throws", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("storage disabled");
      },
      setItem: () => {
        throw new Error("storage disabled");
      },
      removeItem: () => {},
    });
    // markInAppNav swallows the throw; consume reports the safe default.
    expect(() => markInAppNav()).not.toThrow();
    expect(consumeInAppNav()).toBe(false);
  });
});
