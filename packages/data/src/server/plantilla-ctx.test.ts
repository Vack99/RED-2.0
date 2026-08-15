import { describe, expect, it } from "vitest";

import type { CobroDTO } from "./cobro";
import type { PaqueteDTO } from "./paquetes";
import { fmtClases, fmtDatosPago, fmtDias, fmtPrecios, renderMensajes } from "./plantilla-ctx";

const paquete = (over: Partial<PaqueteDTO> = {}): PaqueteDTO => ({
  id: "p1",
  nombre: "8 clases",
  clases: 8,
  vigencia: "30 días",
  vigenciaTipo: "dias",
  vigenciaDias: 30,
  hasta: "16 jun",
  precio: 800,
  popular: false,
  ...over,
});

const cobro = (over: Partial<CobroDTO> = {}): CobroDTO => ({
  titular: "Andrea Castro",
  banco: "BBVA",
  clabe: "012180001234567890",
  tarjeta: null,
  aceptaEfectivo: true,
  aceptaTransferencia: true,
  aceptaTarjeta: false,
  ...over,
});

describe("fmtPrecios", () => {
  it("formats one bullet line per paquete with the peso price", () => {
    const out = fmtPrecios([
      paquete({ nombre: "8 clases", precio: 800 }),
      paquete({ id: "p2", nombre: "Ilimitado", precio: 1200 }),
    ]);
    expect(out).toBe("• 8 clases — $800\n• Ilimitado — $1,200");
  });

  it("is empty for an empty catalog", () => {
    expect(fmtPrecios([])).toBe("");
  });
});

describe("fmtDatosPago", () => {
  it("returns '' when there is no cobro row", () => {
    expect(fmtDatosPago(null)).toBe("");
  });

  it("returns '' when transferencia is off and no card", () => {
    expect(
      fmtDatosPago(
        cobro({ aceptaTransferencia: false, clabe: null, tarjeta: null, banco: null }),
      ),
    ).toBe("");
  });

  it("includes the bank + CLABE + titular when transferencia is configured", () => {
    const out = fmtDatosPago(cobro());
    expect(out).toContain("BBVA");
    expect(out).toContain("012180001234567890");
    expect(out).toContain("Andrea Castro");
    expect(out.length).toBeGreaterThan(0);
  });

  it("includes the card line when a tarjeta is configured", () => {
    const out = fmtDatosPago(
      cobro({ aceptaTarjeta: true, tarjeta: "4111 1111 1111 1111" }),
    );
    expect(out).toContain("4111 1111 1111 1111");
  });
});

describe("fmtDias", () => {
  it("formats a count > 1 as 'vence en {n} días'", () => {
    expect(fmtDias(20)).toBe("vence en 20 días");
  });

  it("uses 'vence mañana' for exactly one day", () => {
    expect(fmtDias(1)).toBe("vence mañana");
  });

  it("día 0 (the vence day itself, a valid training day — C9) reads 'vence hoy', never vencido", () => {
    // Pre-#226 this read "vencido" (or, after #225's residual fix, the signed "0 días") —
    // the off-by-one #226's seed rewrite exists to close, since the seeded Renovación body
    // now embeds {dias} directly instead of a fixed "vence en" prefix.
    expect(fmtDias(0)).toBe("vence hoy");
  });

  it("uses 'venció ayer' for exactly one day expired", () => {
    expect(fmtDias(-1)).toBe("venció ayer");
  });

  it("formats an expired count > 1 as 'venció hace {n} días' (correct direction — closes #225 F1's documented residual)", () => {
    // #225 F1 left this as the signed "-3 días" deliberately, because the OLD seeded body
    // ("Tu paquete vence en {dias}") had no grammatically correct substitution for a
    // negative count without rewriting the migration-gated seed text. #226 rewrites that
    // seed (packages/data/src/server/plantilla-ctx.ts's fmtDias now carries the whole verb
    // phrase, and the body embeds {dias} directly), which is why this residual can close here.
    expect(fmtDias(-3)).toBe("venció hace 3 días");
  });
});

describe("fmtClases", () => {
  it("formats a finite count as '{n} clases'", () => {
    expect(fmtClases(5)).toBe("5 clases");
  });

  it("does NOT special-case one (matches today's non-pluralizing ternary)", () => {
    expect(fmtClases(1)).toBe("1 clases");
  });

  it("reads ilimitado as 'clases ilimitadas'", () => {
    expect(fmtClases("ilimitado")).toBe("clases ilimitadas");
  });
});

describe("renderMensajes", () => {
  it("maps each template to a MensajeDTO with tokens substituted", () => {
    const out = renderMensajes(
      [
        { id: "t1", nombre: "Recordatorio", body: "Hola {nombre}, te quedan {clases}." },
        { id: "t2", nombre: "Precios", body: "Precios:\n{precios}" },
      ],
      { nombre: "Andrea", clases: "5 clases", precios: "• 8 clases — $800" },
    );
    expect(out).toEqual([
      { id: "t1", nombre: "Recordatorio", texto: "Hola Andrea, te quedan 5 clases." },
      { id: "t2", nombre: "Precios", texto: "Precios:\n• 8 clases — $800" },
    ]);
  });

  it("leaves unknown tokens as the literal placeholder", () => {
    const out = renderMensajes([{ id: "t1", nombre: "X", body: "{nombre} {desconocido}" }], {
      nombre: "Andrea",
    });
    expect(out[0].texto).toBe("Andrea {desconocido}");
  });
});
