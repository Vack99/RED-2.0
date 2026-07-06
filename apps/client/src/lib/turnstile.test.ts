import { describe, expect, it, vi } from "vitest";

import { verificarTurnstile } from "./turnstile";

/** The captcha verifier posts the secret+token(+ip) to Cloudflare and returns the `success` flag. It
 *  fails CLOSED: a null token never touches the network; a `success:false` or a thrown fetch is false. */
describe("verificarTurnstile", () => {
  it("returns false for a null token without calling fetch", async () => {
    const fetchImpl = vi.fn();
    expect(await verificarTurnstile(null, "1.2.3.4", { fetchImpl: fetchImpl as unknown as typeof fetch })).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("posts secret+token+remoteip and returns true on success", async () => {
    let sentBody: URLSearchParams | undefined;
    const fetchImpl = vi.fn(async (_url: string, init: { body: URLSearchParams }) => {
      sentBody = init.body;
      return { json: async () => ({ success: true }) } as Response;
    });
    const ok = await verificarTurnstile("tok-123", "9.9.9.9", {
      secret: "sekret",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(ok).toBe(true);
    expect(sentBody?.get("secret")).toBe("sekret");
    expect(sentBody?.get("response")).toBe("tok-123");
    expect(sentBody?.get("remoteip")).toBe("9.9.9.9");
  });

  it("returns false when Cloudflare reports failure", async () => {
    const fetchImpl = vi.fn(async () => ({ json: async () => ({ success: false }) }) as Response);
    expect(await verificarTurnstile("tok", null, { fetchImpl: fetchImpl as unknown as typeof fetch })).toBe(false);
  });

  it("fails closed on a network error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    expect(await verificarTurnstile("tok", null, { fetchImpl: fetchImpl as unknown as typeof fetch })).toBe(false);
  });
});
