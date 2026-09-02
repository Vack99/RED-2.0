import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { crearRegulador, liberarSenal, ocuparSenal, senalBusy } from "./client-senal";

// The browser client is never constructed by anything under test here — `crearRegulador` is
// deliberately free of React and of the DOM, because this repo has no jsdom and every vitest
// project runs `environment: "node"` (vitest.config.ts). Mocked anyway so importing the module
// cannot reach @supabase/ssr's browser globals.
vi.mock("./client", () => ({ createClient: () => ({}) }));

describe("crearRegulador", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    senalBusy.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    senalBusy.clear();
  });

  it("collapses a burst into ONE trailing call carrying the last motive", () => {
    const onSenal = vi.fn();
    const reg = crearRegulador(onSenal, 600);

    reg.pedir("senal");
    vi.advanceTimersByTime(300);
    reg.pedir("visible");
    vi.advanceTimersByTime(599);
    expect(onSenal).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onSenal).toHaveBeenCalledTimes(1);
    expect(onSenal).toHaveBeenCalledWith("visible");
    reg.destruir();
  });

  it("holds the refresh while something is busy, and fires it on release", () => {
    const onSenal = vi.fn();
    const reg = crearRegulador(onSenal, 600);

    ocuparSenal("hoja");
    reg.pedir("senal");
    vi.advanceTimersByTime(5_000);
    expect(onSenal).not.toHaveBeenCalled();

    liberarSenal("hoja");
    expect(onSenal).toHaveBeenCalledTimes(1);
    expect(onSenal).toHaveBeenCalledWith("senal");
    reg.destruir();
  });

  it("stays held while ANY other key is still busy", () => {
    const onSenal = vi.fn();
    const reg = crearRegulador(onSenal, 600);

    ocuparSenal("hoja");
    ocuparSenal("escritura");
    reg.pedir("senal");
    vi.advanceTimersByTime(5_000);

    liberarSenal("hoja");
    expect(onSenal).not.toHaveBeenCalled();

    liberarSenal("escritura");
    expect(onSenal).toHaveBeenCalledTimes(1);
    reg.destruir();
  });

  it("a release with nothing pending fires nothing", () => {
    const onSenal = vi.fn();
    const reg = crearRegulador(onSenal, 600);

    ocuparSenal("hoja");
    liberarSenal("hoja");
    vi.advanceTimersByTime(5_000);

    expect(onSenal).not.toHaveBeenCalled();
    reg.destruir();
  });

  it("destruir cancels the pending fire AND unregisters from the busy flush", () => {
    const onSenal = vi.fn();
    const reg = crearRegulador(onSenal, 600);

    ocuparSenal("hoja");
    reg.pedir("senal");
    reg.destruir();

    liberarSenal("hoja");
    vi.advanceTimersByTime(5_000);
    expect(onSenal).not.toHaveBeenCalled();
  });
});
