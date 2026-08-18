import { describe, expect, it, vi } from "vitest";

import { fetchTokenOverrides } from "./token-overrides";

// The app-side seam only owns "which slug, if any": no `x-gym` (the unmapped-host
// case) must short-circuit to `undefined` WITHOUT calling into `@gym/data` — the
// live fetch + TTL cache are `@gym/data`'s own contract (resolve-tenant.test.ts).
const stubbedHeaders = new Headers();
vi.mock("next/headers", () => ({ headers: async () => stubbedHeaders }));

describe("fetchTokenOverrides (app seam)", () => {
  it("no x-gym (unmapped host) → undefined, no @gym/data call", async () => {
    stubbedHeaders.delete("x-gym");
    await expect(fetchTokenOverrides()).resolves.toBeUndefined();
  });
});
