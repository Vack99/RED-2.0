import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { JWKS_FALLBACK, fetchBlindado } from "./fetch-shield";

/**
 * The shield's contract is behavioural, so the fake is the 2026-08-29 stall itself: a
 * `fetch` that never settles until something aborts its signal. Fake timers drive the
 * deadlines, so a 8 s bound costs no wall-clock in the suite.
 */
const REST = "https://x.supabase.co/rest/v1/ventas";
const JWKS = "https://x.supabase.co/auth/v1/.well-known/jwks.json";

/** Hangs forever unless the signal it was handed aborts (i.e. only the shield can end it). */
const colgado: typeof fetch = (_input, init) =>
  new Promise<Response>((_resolve, reject) => {
    const abortar = () => reject(new DOMException("aborted", "AbortError"));
    if (init?.signal?.aborted) abortar();
    else init?.signal?.addEventListener("abort", abortar);
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

describe("fetchBlindado", () => {
  it("passes a healthy GET straight through", async () => {
    const ok = new Response("[]");
    const mock = stub(async () => ok);

    await expect(fetchBlindado(REST)).resolves.toBe(ok);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("retries a stalled GET once, UNTIMED, so the worst case is still a render", async () => {
    const ok = new Response("[]");
    const mock = stub(async () => ok);
    mock.mockImplementationOnce(colgado);

    const pendiente = fetchBlindado(REST);
    await vi.advanceTimersByTimeAsync(8_000);

    await expect(pendiente).resolves.toBe(ok);
    expect(mock).toHaveBeenCalledTimes(2);
    // The second attempt carries no deadline: it can only be slower than today, never fail.
    expect(mock.mock.calls[1]?.[1]?.signal).toBeUndefined();
  });

  it("does not resurrect a request the caller itself aborted", async () => {
    const mock = stub(colgado);
    const caller = new AbortController();
    caller.abort();

    await expect(fetchBlindado(REST, { signal: caller.signal })).rejects.toThrow();
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("never times out or retries a POST (a stalled write may have committed)", async () => {
    let liberar: ((response: Response) => void) | undefined;
    const mock = stub(() => new Promise<Response>((resolve) => (liberar = resolve)));

    const pendiente = fetchBlindado(`${REST.replace("/ventas", "/rpc/registrar_venta")}`, {
      method: "post",
    });
    await vi.advanceTimersByTimeAsync(60_000);

    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock.mock.calls[0]?.[1]?.signal).toBeUndefined();
    liberar?.(new Response("ok"));
    await expect(pendiente).resolves.toBeInstanceOf(Response);
  });

  it("reads the method off a Request input", async () => {
    const mock = stub(async () => new Response("ok"));
    const peticion = new Request(REST, { method: "POST", body: "{}" });

    await fetchBlindado(peticion);

    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock.mock.calls[0]?.[0]).toBe(peticion);
    expect(mock.mock.calls[0]?.[1]).toBeUndefined();
  });

  it("answers a stalled jwks.json with the pinned key set instead of hanging", async () => {
    const mock = stub(colgado);

    const pendiente = fetchBlindado(JWKS);
    await vi.advanceTimersByTimeAsync(2_500);
    const respuesta = await pendiente;

    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toEqual(JWKS_FALLBACK);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("lets a live jwks.json win over the pinned key set", async () => {
    const vivo = new Response(JSON.stringify({ keys: [{ kid: "rotada" }] }));
    stub(async () => vivo);

    await expect(fetchBlindado(JWKS)).resolves.toBe(vivo);
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
