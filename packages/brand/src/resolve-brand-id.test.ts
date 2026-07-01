import { describe, expect, it } from "vitest";

import { resolveBrandId } from "./resolve-brand-id";

// resolveBrandId is the one pure host→brand seam both apps run (ADR-0012 §1), a
// plain function over values (sibling to decideRedirect). These arms pin the
// host-wins precedence — known host-map hit › a `?gym=` override naming a known
// brand › DEFAULT_BRAND — so "one deployment resolves brand" is falsifiable here.

describe("resolveBrandId", () => {
  it("resolves a known host-map hit, port-stripped and case-insensitive", () => {
    expect(resolveBrandId("forge.localhost", null)).toBe("forge");
    expect(resolveBrandId("red.localhost", null)).toBe("red");
    expect(resolveBrandId("red.localhost:3000", null)).toBe("red");
    expect(resolveBrandId("RED.localhost", null)).toBe("red");
  });

  it("honors a `?gym=` override naming a known brand when the host is unmapped", () => {
    expect(resolveBrandId(null, "red")).toBe("red");
    expect(resolveBrandId("preview-xyz.vercel.app", "red")).toBe("red");
  });

  it("ignores a `?gym=` override that does not name a known brand", () => {
    expect(resolveBrandId(null, "banana")).toBe("forge");
    expect(resolveBrandId(null, "toString")).toBe("forge");
  });

  it("lets the host win over a conflicting override on a mapped domain", () => {
    expect(resolveBrandId("forge.localhost", "red")).toBe("forge");
  });

  it("falls back to DEFAULT_BRAND when neither host nor override resolves", () => {
    expect(resolveBrandId(null, null)).toBe("forge");
    expect(resolveBrandId("unmapped.example.com", null)).toBe("forge");
  });
});
