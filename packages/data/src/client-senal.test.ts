import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  crearRegulador,
  liberarSenal,
  ocuparSenal,
  senalBusy,
  type MotivoSenal,
  type Regulador,
} from "./client-senal";

// The browser client is never constructed by anything under test here — `crearRegulador` is
// deliberately free of React and of the DOM, because this repo has no jsdom and every vitest
// project runs `environment: "node"` (vitest.config.ts). Mocked anyway so importing the module
// cannot reach @supabase/ssr's browser globals.
vi.mock("./client", () => ({ createClient: () => ({}) }));

describe("crearRegulador", () => {
  // Tracked instead of trusting every test to reach its own trailing `destruir()` — a test that
  // fails an assertion midway would otherwise leave a live regulator (and its armed timer)
  // dangling into the next test.
  let regs: Regulador[] = [];
  const crear = (onSenal: (motivo: MotivoSenal) => void, debounceMs: number) => {
    const reg = crearRegulador(onSenal, debounceMs);
    regs.push(reg);
    return reg;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    senalBusy.clear();
  });

  afterEach(() => {
    for (const reg of regs) reg.destruir();
    regs = [];
    vi.useRealTimers();
    senalBusy.clear();
  });

  it("collapses a burst into ONE trailing call carrying the last motive", () => {
    const onSenal = vi.fn();
    const reg = crear(onSenal, 600);

    reg.pedir("senal");
    vi.advanceTimersByTime(300);
    reg.pedir("visible");
    vi.advanceTimersByTime(599);
    expect(onSenal).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onSenal).toHaveBeenCalledTimes(1);
    expect(onSenal).toHaveBeenCalledWith("visible");
  });

  it("holds the refresh while something is busy, and re-requests it through the debounce on release", () => {
    const onSenal = vi.fn();
    const reg = crear(onSenal, 600);

    ocuparSenal("hoja");
    reg.pedir("senal");
    vi.advanceTimersByTime(5_000);
    expect(onSenal).not.toHaveBeenCalled();

    liberarSenal("hoja");
    // The release re-arms the trailing debounce rather than firing synchronously.
    expect(onSenal).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600);
    expect(onSenal).toHaveBeenCalledTimes(1);
    expect(onSenal).toHaveBeenCalledWith("senal");
  });

  it("stays held while ANY other key is still busy", () => {
    const onSenal = vi.fn();
    const reg = crear(onSenal, 600);

    ocuparSenal("hoja");
    ocuparSenal("escritura");
    reg.pedir("senal");
    vi.advanceTimersByTime(5_000);

    liberarSenal("hoja");
    expect(onSenal).not.toHaveBeenCalled();

    liberarSenal("escritura");
    expect(onSenal).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600);
    expect(onSenal).toHaveBeenCalledTimes(1);
  });

  it("a release with nothing pending fires nothing", () => {
    const onSenal = vi.fn();
    crear(onSenal, 600);

    ocuparSenal("hoja");
    liberarSenal("hoja");
    vi.advanceTimersByTime(5_000);

    expect(onSenal).not.toHaveBeenCalled();
  });

  it("destruir cancels the pending fire AND unregisters from the busy flush", () => {
    const onSenal = vi.fn();
    const reg = crear(onSenal, 600);

    ocuparSenal("hoja");
    reg.pedir("senal");
    reg.destruir();

    liberarSenal("hoja");
    vi.advanceTimersByTime(5_000);
    expect(onSenal).not.toHaveBeenCalled();
  });

  it("destruir makes the regulator inert: pedir() after destruir fires nothing", () => {
    const onSenal = vi.fn();
    const reg = crear(onSenal, 600);

    reg.destruir();
    reg.pedir("senal");
    vi.advanceTimersByTime(5_000);

    expect(onSenal).not.toHaveBeenCalled();
  });

  it("collapses a burst of ocupar/liberar cycles (twenty door taps) into ONE fire, debounceMs after the last release", () => {
    const onSenal = vi.fn();
    const reg = crear(onSenal, 600);

    for (let i = 0; i < 3; i++) {
      ocuparSenal("hoja");
      reg.pedir("senal");
      vi.advanceTimersByTime(100);
      liberarSenal("hoja");
      vi.advanceTimersByTime(100);
    }

    expect(onSenal).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600);
    expect(onSenal).toHaveBeenCalledTimes(1);
    expect(onSenal).toHaveBeenCalledWith("senal");
  });
});
