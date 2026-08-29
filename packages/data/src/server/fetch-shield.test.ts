import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { JWKS_FALLBACK, shieldedFetch } from "./fetch-shield";

/**
 * The shield's contract is behavioural, so the fake is the 2026-08-29 stall itself: a
 * `fetch` that never settles until something aborts its signal. Fake timers drive the
 * deadlines, so a 8 s bound costs no wall-clock in the suite.
 */
const REST = "https://x.supabase.co/rest/v1/ventas";
const JWKS = "https://x.supabase.co/auth/v1/.well-known/jwks.json";

/** Hangs forever unless the signal it was handed aborts (i.e. only the shield can end it). */
const hangs: typeof fetch = (_input, init) =>
  new Promise<Response>((_resolve, reject) => {
    const abort = () => reject(new DOMException("aborted", "AbortError"));
    if (init?.signal?.aborted) abort();
    else init?.signal?.addEventListener("abort", abort);
  });

function stub(impl: typeof fetch) {
  const mock = vi.fn<typeof fetch>(impl);
  vi.stubGlobal("fetch", mock);
  return mock;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("shieldedFetch", () => {
  it("passes a healthy GET straight through", async () => {
    const ok = new Response("[]");
    const mock = stub(async () => ok);

    await expect(shieldedFetch(REST)).resolves.toBe(ok);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("retries a stalled GET once, UNTIMED, so the worst case is still a render", async () => {
    const ok = new Response("[]");
    const mock = stub(async () => ok);
    mock.mockImplementationOnce(hangs);

    const pending = shieldedFetch(REST);
    await vi.advanceTimersByTimeAsync(8_000);

    await expect(pending).resolves.toBe(ok);
    expect(mock).toHaveBeenCalledTimes(2);
    // The second attempt carries no deadline: it can only be slower than today, never fail.
    expect(mock.mock.calls[1]?.[1]?.signal).toBeUndefined();
  });

  it("does not resurrect a request the caller itself aborted", async () => {
    const mock = stub(hangs);
    const caller = new AbortController();
    caller.abort();

    await expect(shieldedFetch(REST, { signal: caller.signal })).rejects.toThrow();
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("honours an abort carried by the Request input itself (no retry)", async () => {
    const mock = stub(hangs);
    const caller = new AbortController();
    caller.abort();

    await expect(shieldedFetch(new Request(REST, { signal: caller.signal }))).rejects.toThrow();
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("never times out or retries a POST (a stalled write may have committed)", async () => {
    let release: ((response: Response) => void) | undefined;
    const mock = stub(() => new Promise<Response>((resolve) => (release = resolve)));

    const pending = shieldedFetch(`${REST.replace("/ventas", "/rpc/registrar_venta")}`, {
      method: "post",
    });
    await vi.advanceTimersByTimeAsync(60_000);

    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock.mock.calls[0]?.[1]?.signal).toBeUndefined();
    release?.(new Response("ok"));
    await expect(pending).resolves.toBeInstanceOf(Response);
  });

  it("reads the method off a Request input", async () => {
    const mock = stub(async () => new Response("ok"));
    const request = new Request(REST, { method: "POST", body: "{}" });

    await shieldedFetch(request);

    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock.mock.calls[0]?.[0]).toBe(request);
    expect(mock.mock.calls[0]?.[1]).toBeUndefined();
  });

  it("answers a stalled jwks.json with the pinned key set instead of hanging", async () => {
    const mock = stub(hangs);

    const pending = shieldedFetch(JWKS);
    await vi.advanceTimersByTimeAsync(2_500);
    const response = await pending;

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(JWKS_FALLBACK);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("rethrows a caller-aborted jwks.json instead of serving the pinned key set", async () => {
    const mock = stub(hangs);
    const caller = new AbortController();
    caller.abort();

    await expect(shieldedFetch(JWKS, { signal: caller.signal })).rejects.toThrow();
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("lets a live jwks.json win over the pinned key set", async () => {
    const live = new Response(JSON.stringify({ keys: [{ kid: "rotada" }] }));
    stub(async () => live);

    await expect(shieldedFetch(JWKS)).resolves.toBe(live);
  });

  it("pins a JWK WebCrypto still accepts (a malformed pin is a total auth outage)", async () => {
    vi.useRealTimers();
    const jwk = JWKS_FALLBACK.keys[0] as JsonWebKey;

    await expect(
      crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, true, [
        "verify",
      ]),
    ).resolves.toBeDefined();
  });
});
