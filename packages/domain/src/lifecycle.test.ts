import { describe, expect, it } from "vitest";
import {
  contarLifecycle,
  derivarVeredicto,
  esPaseSuelto,
  ordenarLifecycle,
  paseSueltoNombres,
} from "./lifecycle";
import type { ConVeredicto, DiaIso, HechosCliente, VeredictoCliente } from "./lifecycle";

// Fixed anchor (arbitrary, mirrors the /proto fixture's own 2026-08-02) so
// every test reasons in whole "días" instead of re-deriving an offset.
const ANCLA = new Date(2026, 7, 2);

function dia(offset: number): DiaIso {
  const d = new Date(ANCLA.getFullYear(), ANCLA.getMonth(), ANCLA.getDate() + offset);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
const HOY = dia(0);
function haceDias(n: number): DiaIso {
  return dia(-n);
}
function enDias(n: number): DiaIso {
  return dia(n);
}

const SIN_PASES: ReadonlySet<string> = new Set();
/** The catalog every pase-suelto case below uses: "1 clase" is a drop-in grant. */
const PASE = "1 clase";
const CON_PASE: ReadonlySet<string> = new Set([PASE]);

// A comfortably-vigente ilimitado row recently seen — every test overrides
// only the facts it cares about.
const BASE: HechosCliente = {
  paquete_nombre: "Ilimitado",
  clases_restantes: null, // ilimitado
  vence: enDias(20),
  tieneCuenta: false,
  visitas: { ultima: haceDias(1), ultimaConsumida: haceDias(1), alta: haceDias(200) },
};

function veredicto(over: Partial<HechosCliente>, pasesSueltos = SIN_PASES): VeredictoCliente {
  return derivarVeredicto({ ...BASE, ...over }, { hoy: HOY, pasesSueltos });
}

/** A roster row carrying its verdict — the shape the folds below read. */
function fila(over: Partial<HechosCliente>, pasesSueltos = SIN_PASES): ConVeredicto {
  return { veredicto: veredicto(over, pasesSueltos) };
}

/** A spent one-off pass inside its own validity window: the catalog grants 1
 *  class, the balance has drained to 0 — its NORMAL end state after one visit. */
function paseGastado(over: Partial<HechosCliente> = {}): VeredictoCliente {
  return veredicto({ paquete_nombre: PASE, clases_restantes: 0, ...over }, CON_PASE);
}

describe("esPaseSuelto — the membership-vs-drop-in predicate (#223 finding 2)", () => {
  it("classifies a grant of exactly 1 class as a one-off pass", () => {
    expect(esPaseSuelto(1)).toBe(true);
  });

  it("classifies any finite grant > 1 as a membership", () => {
    expect(esPaseSuelto(2)).toBe(false);
    expect(esPaseSuelto(8)).toBe(false);
    expect(esPaseSuelto(12)).toBe(false);
  });

  it("classifies ilimitado (a null grant) as a membership", () => {
    expect(esPaseSuelto(null)).toBe(false);
  });
});

describe("paseSueltoNombres — the ONE catalog Set-builder (#225 F5)", () => {
  it("collects only the catalog names whose grant is exactly 1 class", () => {
    const set = paseSueltoNombres([
      { nombre: "1 clase", clases: 1 },
      { nombre: "8 clases", clases: 8 },
      { nombre: "Ilimitado", clases: null },
    ]);
    expect(set.has("1 clase")).toBe(true);
    expect(set.has("8 clases")).toBe(false);
    expect(set.has("Ilimitado")).toBe(false);
  });

  it("is empty for an empty catalog", () => {
    expect(paseSueltoNombres([]).size).toBe(0);
  });
});

describe("derivarVeredicto — la puerta de entrada: hechos crudos, cero ensamble del llamador", () => {
  it("lifts a null clases_restantes to ilimitado and forfeits a lapsed finite balance at read", () => {
    expect(veredicto({ clases_restantes: null, vence: enDias(20) }).clases).toBe("ilimitado");
    // Read-time forfeit (brief Q2): 5 clases on a package that lapsed 3 días ago read 0.
    expect(veredicto({ clases_restantes: 5, vence: haceDias(3) }).clases).toBe(0);
    // Ilimitado has no count to forfeit, even once lapsed.
    expect(veredicto({ clases_restantes: null, vence: haceDias(3) }).clases).toBe("ilimitado");
  });

  it("applies the tienePaquete gate itself (#229 F6): a stray vence with no paquete_nombre is sin_paquete on EVERY axis", () => {
    const v = veredicto({ paquete_nombre: null, vence: enDias(20), clases_restantes: 5 });
    expect(v.estado).toBe("sin_paquete");
    expect(v.vence).toBeNull();
    expect(v.dias).toBeNull();
    expect(v.clases).toBe(0);
  });

  it("GATED vence: non-null for every package estado, null for exactly sin_paquete", () => {
    expect(veredicto({ clases_restantes: 8, vence: enDias(20) }).vence).toBe(enDias(20));
    expect(veredicto({ clases_restantes: 8, vence: haceDias(20) }).vence).toBe(haceDias(20));
    expect(veredicto({ clases_restantes: 0, vence: enDias(20) }).vence).toBe(enDias(20));
    expect(veredicto({ paquete_nombre: null, vence: null }).vence).toBeNull();
  });

  it("is JSON-serializable by construction — a round trip is deep-equal (it crosses the server→client seam as a DTO field)", () => {
    const v = veredicto({ clases_restantes: 3, vence: enDias(4) });
    expect(JSON.parse(JSON.stringify(v))).toEqual(v);
    // …including every honest-null / typed-absence arm.
    const sinPaquete = veredicto({ paquete_nombre: null, vence: null, visitas: "no_leidas" });
    expect(JSON.parse(JSON.stringify(sinPaquete))).toEqual(sinPaquete);
  });

  it("throws a RangeError naming the field and the offending value on a malformed día", () => {
    expect(() => veredicto({ vence: "16/06/2026" })).toThrow(RangeError);
    expect(() => veredicto({ vence: "16/06/2026" })).toThrow(/vence.*"16\/06\/2026"/);
    expect(() => derivarVeredicto(BASE, { hoy: "ayer", pasesSueltos: SIN_PASES })).toThrow(/hoy.*"ayer"/);
    expect(() =>
      veredicto({ visitas: { ultima: "2026-8-2", ultimaConsumida: null, alta: haceDias(9) } }),
    ).toThrow(/visitas\.ultima.*"2026-8-2"/);
  });

  it("validates EVERY supplied día, not just the ones this row's branches read", () => {
    // `alta` is only READ when `ultima` is null (the never-visited floor) — a
    // malformed one beside a perfectly good `ultima` used to sail straight through.
    expect(() =>
      veredicto({ visitas: { ultima: haceDias(2), ultimaConsumida: haceDias(2), alta: "ayer" } }),
    ).toThrow(/visitas\.alta.*"ayer"/);

    // `ultimaConsumida` is only READ on the clases eje — this row is comfortably
    // VIGENTE, so nothing downstream would ever have touched it.
    expect(() =>
      veredicto({
        vence: enDias(20),
        clases_restantes: 8,
        visitas: { ultima: haceDias(2), ultimaConsumida: "02-08-2026", alta: haceDias(200) },
      }),
    ).toThrow(/visitas\.ultimaConsumida.*"02-08-2026"/);

    // `vence` is only READ once `paquete_nombre` is set — a package-less row's stray
    // malformed date is still a malformed stored day, and still says so.
    expect(() => veredicto({ paquete_nombre: null, vence: "n/a" })).toThrow(/vence.*"n\/a"/);
  });
});

describe("derivarVeredicto — urgencia: el piso (#223 finding 3) y la ceguera del pase suelto", () => {
  it("floors an expired package to ok, never crítico — regardless of how long ago it lapsed", () => {
    // Raw urgenciaCliente would say "critico" for both (dias <= 3) — the
    // floor is unconditional, not scaled by how long ago it lapsed.
    expect(veredicto({ clases_restantes: 8, vence: haceDias(5) }).urgencia.nivel).toBe("ok");
    expect(veredicto({ clases_restantes: 8, vence: haceDias(40) }).urgencia.nivel).toBe("ok");
  });

  it("does not floor a still-valid package — reuses urgenciaCliente's thresholds unchanged", () => {
    expect(veredicto({ clases_restantes: 8, vence: enDias(2) }).urgencia.nivel).toBe("critico");
    expect(veredicto({ clases_restantes: 8, vence: enDias(20) }).urgencia.nivel).toBe("ok");
  });

  it("floors sin_paquete to ok (#225 F3) — new business must never read as churn", () => {
    // A package-less row's bare 0 días AND 0 clases would otherwise read "crítico".
    expect(veredicto({ paquete_nombre: null, vence: null, clases_restantes: 0 }).urgencia.nivel).toBe("ok");
  });

  it("does NOT floor vigente/sin_clases — only vencido/sin_paquete floor", () => {
    expect(veredicto({ clases_restantes: 0, vence: enDias(20) }).urgencia.nivel).toBe("critico"); // sin_clases
    expect(veredicto({ clases_restantes: 8, vence: enDias(2) }).urgencia.nivel).toBe("critico"); // vigente
  });

  it("a one-off pass's spent clases never drive urgencia — only días can", () => {
    // días=20 alone reads ok; clases=0 must NOT force critico.
    expect(paseGastado({ vence: enDias(20) }).urgencia.nivel).toBe("ok");
  });

  it("carries `vinculante` off the SAME blinded saldo the nivel is read from", () => {
    // 1 clase left with 25 días to go: the clases axis binds.
    expect(veredicto({ clases_restantes: 1, vence: enDias(25) }).urgencia.vinculante).toBe("clases");
    // Blinded, a spent drop-in binds on días — its 0 clases are inert.
    expect(paseGastado({ vence: enDias(20) }).urgencia.vinculante).toBe("dias");
  });
});

describe("derivarVeredicto — porRenovar: el gate de una fila (#225 F4)", () => {
  it("is true within RENOVACION_DIAS of a live package's date", () => {
    expect(veredicto({ clases_restantes: 8, vence: enDias(5) }).porRenovar).toBe(true);
    expect(veredicto({ clases_restantes: 8, vence: enDias(11) }).porRenovar).toBe(false);
  });

  it("is true at/under RENOVACION_CLASES, exempting a pase suelto", () => {
    expect(veredicto({ clases_restantes: 1, vence: enDias(20) }).porRenovar).toBe(true);
    expect(paseGastado({ clases_restantes: 1, vence: enDias(20) }).porRenovar).toBe(false);
  });

  it("a sin_clases row always qualifies via the clases arm", () => {
    expect(veredicto({ clases_restantes: 0, vence: enDias(20) }).porRenovar).toBe(true);
  });

  it("is false for vencido and sin_paquete — never a renewal candidate", () => {
    expect(veredicto({ clases_restantes: 0, vence: haceDias(1) }).porRenovar).toBe(false);
    expect(veredicto({ paquete_nombre: null, vence: null }).porRenovar).toBe(false);
  });

  it("`porRenovar` and `tile === 'por_renovar'` are the same fact, and `cubo` is non-null iff it holds", () => {
    const renueva = veredicto({ clases_restantes: 8, vence: enDias(5) });
    expect(renueva.porRenovar).toBe(renueva.tile === "por_renovar");
    expect(renueva.cubo).toBe("cuatroACinco");
    const tranquilo = veredicto({ clases_restantes: 8, vence: enDias(20) });
    expect(tranquilo.porRenovar).toBe(false);
    expect(tranquilo.cubo).toBeNull();
  });
});

describe("derivarVeredicto — estado + eje (fecha wins, ruling A2)", () => {
  it("is vigente with días and clases to spare", () => {
    const r = veredicto({ vence: enDias(20), clases_restantes: 8 });
    expect(r.estado).toBe("vigente");
    expect(r.eje).toBeNull();
  });

  it("is vencido once the date has lapsed, even with clases still on the row", () => {
    const r = veredicto({ vence: haceDias(10), clases_restantes: 5 });
    expect(r.estado).toBe("vencido");
    expect(r.eje).toBe("fecha");
    expect(r.dias).toBe(-10);
  });

  it("is sin_clases when clases are exhausted but días remain (SIN CLASES reserved for this)", () => {
    const r = veredicto({ vence: enDias(15), clases_restantes: 0 });
    expect(r.estado).toBe("sin_clases");
    expect(r.eje).toBe("clases");
  });

  it("FORFEIT COLLAPSE — date-expired AND class-empty: fecha wins unconditionally, never SIN CLASES", () => {
    // Every expired finite pack reaches the estado predicate with clases already
    // forfeited to 0, so both conditions are true simultaneously. There is no
    // tie-break to get wrong: VENCIDO.
    const r = veredicto({ vence: haceDias(3), clases_restantes: 0 });
    expect(r.estado).toBe("vencido");
    expect(r.eje).toBe("fecha");
  });

  it("keeps the vence day itself (día 0) vigente — a valid training day (ruling C9 precedent)", () => {
    const r = veredicto({ vence: HOY, clases_restantes: 8 });
    expect(r.estado).toBe("vigente");
    expect(r.dias).toBe(0);
  });

  it("a spent one-off pass never reads SIN CLASES — 0 clases is its normal end state", () => {
    const r = paseGastado({ vence: enDias(15) });
    expect(r.estado).toBe("vigente");
    expect(r.eje).toBeNull();
  });

  it("TRI-SURFACE REGRESSION: a spent drop-in with días left is vigente AND urgencia ok — the ONE verdict the directorio, la ficha and el respaldo now all read", () => {
    // Before the deepening, the ficha and the export each re-ran the urgencia floor
    // over the FLAT clases/días and missed the pase-suelto blind: the same row read
    // VIGENTE/"ok" on the roster and "Crítico" on those two surfaces.
    const r = paseGastado({ vence: enDias(20) }); // días are comfortably clear; only clases could fire
    expect(r.estado).toBe("vigente");
    expect(r.urgencia.nivel).toBe("ok");
    expect(r.clases).toBe(0);
  });
});

describe("derivarVeredicto — el reloj del brazo de clases es la última visita CONSUMIDORA", () => {
  it("0-CLASSES-STILL-TRAINING: lands in POR RENOVAR from the clases arm regardless of how many días remain", () => {
    const r = veredicto({
      vence: enDias(18),
      clases_restantes: 0,
      visitas: { ultima: haceDias(5), ultimaConsumida: haceDias(5), alta: haceDias(200) },
    });
    expect(r.estado).toBe("sin_clases");
    expect(r.eje).toBe("clases");
    expect(r.diasDesdeFin).toBe(5);
    expect(r.tile).toBe("por_renovar");
  });

  it("a NON-CONSUMING walk-in does not reset the clases-arm clock", () => {
    const r = veredicto({
      vence: enDias(18),
      clases_restantes: 0,
      visitas: {
        ultimaConsumida: haceDias(5), // the visit that actually ran the balance to 0
        ultima: HOY, // a later walk-in that did NOT decrement (consumio: false)
        alta: haceDias(200),
      },
    });
    expect(r.diasDesdeFin).toBe(5); // frozen at the consuming visit, not reset to 0
  });

  it("never null-silently-out-of-range: no consuming-visit anchor reports null, not 0 or Infinity", () => {
    const r = veredicto({
      vence: enDias(18),
      clases_restantes: 0,
      visitas: { ultima: null, ultimaConsumida: null, alta: haceDias(200) },
    });
    expect(r.eje).toBe("clases");
    expect(r.diasDesdeFin).toBeNull();
  });

  it("a caller with NO visit aggregate reports the same honest null (never a fabricated 0)", () => {
    const r = veredicto({ vence: enDias(18), clases_restantes: 0, visitas: "no_leidas" });
    expect(r.eje).toBe("clases");
    expect(r.diasDesdeFin).toBeNull();
  });
});

describe("derivarVeredicto — POR RENOVAR", () => {
  it("día 10 is inside the window; día 11 is outside (RENOVACION_DIAS boundary)", () => {
    expect(veredicto({ vence: enDias(10), clases_restantes: 8 }).tile).toBe("por_renovar");
    expect(veredicto({ vence: enDias(11), clases_restantes: 8 }).tile).toBeNull();
  });

  it("día 0 (vence today) is inside the window", () => {
    expect(veredicto({ vence: HOY, clases_restantes: 8 }).tile).toBe("por_renovar");
  });

  it("clases <= 1 triggers the tile regardless of how many días remain", () => {
    const r = veredicto({ vence: enDias(25), clases_restantes: 1 });
    expect(r.estado).toBe("vigente");
    expect(r.tile).toBe("por_renovar");
  });

  it("every SIN CLASES row is always in POR RENOVAR (0 <= RENOVACION_CLASES, invariant)", () => {
    const r = veredicto({ vence: enDias(29), clases_restantes: 0 });
    expect(r.estado).toBe("sin_clases");
    expect(r.tile).toBe("por_renovar");
  });

  it("a comfortably vigente row (>10 días, >1 clase) is in neither tile", () => {
    expect(veredicto({ vence: enDias(20), clases_restantes: 8 }).tile).toBeNull();
  });

  it("a one-off pass's spent clases never trigger the tile — only its own días arm can", () => {
    expect(paseGastado({ vence: enDias(25) }).tile).toBeNull();
    expect(paseGastado({ vence: enDias(4) }).tile).toBe("por_renovar"); // via días, not clases
  });
});

describe("derivarVeredicto — AÚN A TIEMPO, clocked from expiry only", () => {
  it("día 1 is inside the window; día 15 is inside; día 16 is outside (RECUPERACION_DIAS boundary)", () => {
    expect(veredicto({ vence: haceDias(1), clases_restantes: 8 }).tile).toBe("aun_a_tiempo");
    expect(veredicto({ vence: haceDias(15), clases_restantes: 8 }).tile).toBe("aun_a_tiempo");
    expect(veredicto({ vence: haceDias(16), clases_restantes: 8 }).tile).toBeNull();
  });

  it("excludes a spent one-off pass — never a renewal target", () => {
    const r = paseGastado({ vence: haceDias(5) });
    expect(r.estado).toBe("vencido");
    expect(r.tile).toBeNull();
  });

  it("excludes a member with an app account — the client app already nudges them at lapse", () => {
    expect(veredicto({ vence: haceDias(5), clases_restantes: 8, tieneCuenta: true }).tile).toBeNull();
  });

  it("is clocked from the DATE only — attendance recency does not move it", () => {
    const r = veredicto({
      vence: haceDias(5),
      clases_restantes: 8,
      visitas: { ultima: haceDias(40), ultimaConsumida: haceDias(40), alta: haceDias(200) },
    });
    expect(r.tile).toBe("aun_a_tiempo");
    expect(r.diasDesdeFin).toBe(5);
  });

  it("día 44 (long-dead) is well outside the window", () => {
    expect(veredicto({ vence: haceDias(44), clases_restantes: 8 }).tile).toBeNull();
  });

  it("#229 opus review F4 — structural invariant: tile === 'aun_a_tiempo' always implies eje === 'fecha' (A2 fecha-wins makes the clases arm unreachable here)", () => {
    const r = veredicto({ vence: haceDias(5), clases_restantes: 8 });
    expect(r.tile).toBe("aun_a_tiempo");
    expect(r.eje).toBe("fecha");
  });
});

describe("derivarVeredicto — pendienteOnline y sin_paquete: primera clase, nunca 'fuera de alcance'", () => {
  it("DERIVES pendienteOnline from tieneCuenta + sin_paquete — never a caller-supplied flag (#227 F1)", () => {
    const r = veredicto({
      paquete_nombre: null,
      clases_restantes: null,
      vence: null,
      tieneCuenta: true,
      visitas: { ultima: null, ultimaConsumida: null, alta: HOY },
    });
    expect(r.estado).toBe("sin_paquete");
    expect(r.pendienteOnline).toBe(true);
    expect(r.eje).toBeNull();
    expect(r.tile).toBeNull();
    expect(r.dias).toBeNull();
  });

  it("a same-day sign-up with NO account and no package is the same fresh-arrival estado, but NOT pendienteOnline", () => {
    const r = veredicto({
      paquete_nombre: null,
      clases_restantes: null,
      vence: null,
      tieneCuenta: false,
      visitas: { ultima: null, ultimaConsumida: null, alta: HOY },
    });
    expect(r.estado).toBe("sin_paquete");
    expect(r.pendienteOnline).toBe(false);
  });

  it("is reconciled with AÚN A TIEMPO by construction — a no-package row can never also be aun_a_tiempo", () => {
    expect(veredicto({ paquete_nombre: null, vence: null, tieneCuenta: true }).tile).not.toBe("aun_a_tiempo");
  });

  it("#227 F1: an account-holder whose package merely LAPSED is a plain vencido — never pendienteOnline, never group-0", () => {
    // The broader pre-#227 gate marked this row pendienteOnline, which put the
    // ENTIRE dead roster of an all-accounts gym ahead of a día-0 renewal — the
    // exact defect spec #222 opens with.
    const r = veredicto({ vence: haceDias(40), clases_restantes: 0, tieneCuenta: true });
    expect(r.estado).toBe("vencido");
    expect(r.dias).toBe(-40);
    expect(r.pendienteOnline).toBe(false);
    expect(r.tile).toBeNull(); // excluded from AÚN A TIEMPO via tieneCuenta too
  });
});

describe("derivarVeredicto — ausencia: pisos, no fugas (S9/A9), con el gate de la ventana adentro", () => {
  it("is honestly null when the caller read no visit aggregate — never a fabricated { dias: 0, ausente: false }", () => {
    expect(veredicto({ visitas: "no_leidas" }).ausencia).toBeNull();
  });

  it("counts the whole días since the last visit, and floors on alta when there has never been one", () => {
    expect(veredicto({ visitas: { ultima: haceDias(9), ultimaConsumida: haceDias(9), alta: haceDias(200) } }).ausencia)
      .toEqual({ dias: 9, ausente: false });
    const nuncaVino = veredicto({
      vence: enDias(10),
      clases_restantes: 8,
      visitas: { ultima: null, ultimaConsumida: null, alta: haceDias(20) },
    });
    expect(nuncaVino.ausencia).toEqual({ dias: 20, ausente: true });
  });

  it("a numeric last visit under AUSENTE_DIAS is not ausente; at/over it, it is — the SAME anchor the numeral counts from", () => {
    const bajo = veredicto({ visitas: { ultima: haceDias(14), ultimaConsumida: haceDias(14), alta: haceDias(200) } });
    const alto = veredicto({ visitas: { ultima: haceDias(15), ultimaConsumida: haceDias(15), alta: haceDias(200) } });
    expect(bajo.ausencia).toEqual({ dias: 14, ausente: false });
    expect(alto.ausencia).toEqual({ dias: 15, ausente: true });
  });

  it("a same-day sign-up with a null last-visit is NOT yet ausente", () => {
    const r = veredicto({
      vence: HOY,
      clases_restantes: 8,
      visitas: { ultima: null, ultimaConsumida: null, alta: HOY },
    });
    expect(r.ausencia).toEqual({ dias: 0, ausente: false });
  });

  it("does NOT vanish the day the package lapses (the self-erasing bug, S9) — the días keep counting either way", () => {
    const visitas = { ultima: haceDias(24), ultimaConsumida: haceDias(24), alta: haceDias(200) } as const;
    const vigente = veredicto({ vence: enDias(12), clases_restantes: 8, visitas });
    const vencido = veredicto({ vence: haceDias(1), clases_restantes: 8, visitas });
    expect(vigente.estado).toBe("vigente");
    expect(vencido.estado).toBe("vencido");
    expect(vigente.ausencia).toEqual({ dias: 24, ausente: true });
    expect(vencido.ausencia).toEqual({ dias: 24, ausente: true });
  });
});

describe("ausencia.ausente — el gate de la ventana de recuperación va ADENTRO (#229 opus review F1/F2/F5)", () => {
  const ausenteHace30 = { ultima: haceDias(30), ultimaConsumida: haceDias(30), alta: haceDias(400) } as const;

  it("shows for a vigente (paid-up, still trainable) row", () => {
    const r = veredicto({ vence: enDias(20), clases_restantes: 8, visitas: ausenteHace30 });
    expect(r.estado).toBe("vigente");
    expect(r.ausencia?.ausente).toBe(true);
  });

  it("hides for a sin_clases row — date-valid but unable to train today (story 11: paid-AND-ABLE, not merely paid)", () => {
    const r = veredicto({ vence: enDias(20), clases_restantes: 0, visitas: ausenteHace30 });
    expect(r.estado).toBe("sin_clases");
    expect(r.ausencia).toEqual({ dias: 30, ausente: false }); // the FACT survives; the badge does not
  });

  it("shows for a LAPSED member WITH an app account, day 1-15 — A9: it does not vanish at lapse (#188 S9), even though tieneCuenta excludes them from the AÚN A TIEMPO tile itself", () => {
    const r = veredicto({ vence: haceDias(5), clases_restantes: 8, tieneCuenta: true, visitas: ausenteHace30 });
    expect(r.estado).toBe("vencido");
    expect(r.tile).toBeNull(); // excluded from the TILE (has an account)…
    expect(r.ausencia?.ausente).toBe(true); // …but the window gate doesn't care about tieneCuenta
  });

  it("hides for a lapsed member past día 16 — 'the dead', no longer this fact's audience", () => {
    const r = veredicto({ vence: haceDias(16), clases_restantes: 8, visitas: ausenteHace30 });
    expect(r.estado).toBe("vencido");
    expect(r.ausencia?.ausente).toBe(false);
  });

  it("hides for sin_paquete — nothing paid", () => {
    const r = veredicto({ paquete_nombre: null, vence: null, tieneCuenta: true, visitas: ausenteHace30 });
    expect(r.estado).toBe("sin_paquete");
    expect(r.ausencia?.ausente).toBe(false);
  });
});

describe("fueraDeAlcance — el aviso del horizonte de día 16+ (#229 opus review F3)", () => {
  it("is true for a vencido row past RECUPERACION_DIAS, and false for a spent one-off pass", () => {
    expect(veredicto({ vence: haceDias(16), clases_restantes: 8 }).fueraDeAlcance).toBe(true);
    expect(veredicto({ vence: haceDias(44), clases_restantes: 8 }).fueraDeAlcance).toBe(true);
    expect(paseGastado({ vence: haceDias(20) }).fueraDeAlcance).toBe(false);
    expect(veredicto({ vence: haceDias(5), clases_restantes: 8 }).fueraDeAlcance).toBe(false);
    expect(veredicto({ vence: enDias(20), clases_restantes: 8 }).fueraDeAlcance).toBe(false);
  });

  it("counts, over a roster, exactly the rows that carry the flag", () => {
    const filas = [
      fila({ vence: haceDias(16), clases_restantes: 8 }), // just past the window
      fila({ vence: haceDias(44), clases_restantes: 8 }), // long-dead
      fila({ paquete_nombre: PASE, clases_restantes: 0, vence: haceDias(20) }, CON_PASE), // spent pass
      fila({ vence: haceDias(5), clases_restantes: 8 }), // inside the window — not counted
      fila({ vence: enDias(20), clases_restantes: 8 }), // vigente — not counted
    ];
    expect(contarLifecycle(filas).fueraDeAlcance).toBe(2);
  });

  it("is independent of tieneCuenta — an account-holder past día 16 still counts (the disclosure is about days elapsed, not the account exclusion)", () => {
    const filas = [fila({ vence: haceDias(30), clases_restantes: 8, tieneCuenta: true })];
    expect(contarLifecycle(filas).fueraDeAlcance).toBe(1);
  });
});

describe("ordenarLifecycle — actionable → current → expired, most-recently-expired first", () => {
  it("orders actionable before current before expired", () => {
    const actionable = fila({ vence: enDias(3), clases_restantes: 8 });
    const current = fila({ vence: enDias(20), clases_restantes: 8 });
    const expired = fila({ vence: haceDias(5), clases_restantes: 8 });
    expect(ordenarLifecycle([expired, current, actionable])).toEqual([actionable, current, expired]);
  });

  it("expired rows sort most-recently-expired first", () => {
    const reciente = fila({ vence: haceDias(1), clases_restantes: 8 });
    const viejo = fila({ vence: haceDias(44), clases_restantes: 8 });
    expect(ordenarLifecycle([viejo, reciente])).toEqual([reciente, viejo]);
  });

  it("pendienteOnline never sorts below the longest-dead row", () => {
    const online = fila({ paquete_nombre: null, vence: null, tieneCuenta: true });
    const viejo = fila({ vence: haceDias(44), clases_restantes: 8 });
    expect(ordenarLifecycle([viejo, online])[0]).toBe(online);
  });

  it("within POR RENOVAR, soonest expiry sorts first", () => {
    const dia1 = fila({ vence: enDias(1), clases_restantes: 8 });
    const dia9 = fila({ vence: enDias(9), clases_restantes: 8 });
    expect(ordenarLifecycle([dia9, dia1])).toEqual([dia1, dia9]);
  });

  it("a sin_paquete row sorts actionable, never below a plain expired row", () => {
    const fresco = fila({ paquete_nombre: null, vence: null, tieneCuenta: true });
    const plainExpired = fila({ vence: haceDias(10), clases_restantes: 0 });
    expect(ordenarLifecycle([plainExpired, fresco])[0]).toBe(fresco);
  });

  it("LOW (#223 finding 5): a SIN CLASES row with días to spare sorts by its binding-axis urgency, not stranded behind a merely-urgente días-bound row", () => {
    const sinClasesLejos = fila({ vence: enDias(29), clases_restantes: 0 }); // critico via clases
    const diasBoundUrgente = fila({ vence: enDias(5), clases_restantes: 8 }); // urgente via días (29 > 5)
    // Raw-día sorting would strand sinClasesLejos (29 días) behind
    // diasBoundUrgente (5 días) even though it cannot train today.
    expect(ordenarLifecycle([diasBoundUrgente, sinClasesLejos])[0]).toBe(sinClasesLejos);
  });

  it("orders the caller's OWN rows — the verdict rides on the row, so there is no identity map to lose", () => {
    const rows = [
      { id: "viejo", ...fila({ vence: haceDias(44), clases_restantes: 8 }) },
      { id: "urge", ...fila({ vence: enDias(2), clases_restantes: 8 }) },
    ];
    expect(ordenarLifecycle(rows).map((r) => r.id)).toEqual(["urge", "viejo"]);
  });
});

describe("contarLifecycle — POR RENOVAR buckets always sum to the headline (clases-arm bucket sum)", () => {
  it("a clases-bound member (1 clase, 18 días) lands in the CLASES bucket, and buckets sum to total", () => {
    const filas = [
      fila({ vence: enDias(0), clases_restantes: 8 }), // hoy
      fila({ vence: enDias(1), clases_restantes: 8 }), // manana
      fila({ vence: enDias(3), clases_restantes: 8 }), // dosATres
      fila({ vence: enDias(5), clases_restantes: 8 }), // cuatroACinco
      fila({ vence: enDias(10), clases_restantes: 8 }), // seisOMas
      fila({ vence: enDias(18), clases_restantes: 1 }), // clases — outside every día bucket
      fila({ vence: enDias(29), clases_restantes: 0 }), // sin_clases — also the clases bucket
    ];
    const { porRenovar } = contarLifecycle(filas);
    expect(porRenovar.total).toBe(7);
    expect(porRenovar.cubos).toEqual({
      hoy: 1,
      manana: 1,
      dosATres: 1,
      cuatroACinco: 1,
      seisOMas: 1,
      clases: 2,
    });
    const sumaCubos = Object.values(porRenovar.cubos).reduce((a, b) => a + b, 0);
    expect(sumaCubos).toBe(porRenovar.total);
  });

  it("a one-off pass never inflates the clases bucket (the '22 vs 4' bug, #184)", () => {
    const filas = [
      fila({ paquete_nombre: PASE, clases_restantes: 0, vence: enDias(20) }, CON_PASE),
      fila({ paquete_nombre: PASE, clases_restantes: 0, vence: enDias(15) }, CON_PASE),
    ];
    const { porRenovar } = contarLifecycle(filas);
    // Neither reaches the tile at all: días are outside RENOVACION_DIAS OR
    // the pass's spent clases are inert — see the POR RENOVAR describe block.
    expect(porRenovar.total).toBe(0);
    expect(porRenovar.cubos.clases).toBe(0);
  });
});

describe("contarLifecycle — el conteo compartido", () => {
  it("counts aunATiempo and pendienteOnline independently of POR RENOVAR", () => {
    const filas = [
      fila({ vence: haceDias(3), clases_restantes: 8 }), // aun a tiempo
      fila({ paquete_nombre: null, vence: null, tieneCuenta: true }),
      fila({ vence: enDias(20), clases_restantes: 8 }), // neither
    ];
    const conteos = contarLifecycle(filas);
    expect(conteos.aunATiempo.total).toBe(1);
    expect(conteos.pendienteOnline).toBe(1);
    expect(conteos.porRenovar.total).toBe(0);
  });

  it("a row counts ONCE — pendienteOnline is never also aunATiempo/porRenovar (one verdict)", () => {
    const filas = [fila({ paquete_nombre: null, vence: null, tieneCuenta: true })];
    const conteos = contarLifecycle(filas);
    expect(conteos.pendienteOnline).toBe(1);
    expect(conteos.aunATiempo.total).toBe(0);
    expect(conteos.porRenovar.total).toBe(0);
  });

  it("MEDIUM (#223 finding 4): vigentes/total feed the header ratio (story 19) — the one VIGENTE number, never a second inline filter count", () => {
    const filas = [
      fila({ vence: enDias(20), clases_restantes: 8 }), // vigente
      fila({ vence: enDias(3), clases_restantes: 8 }), // vigente, also por_renovar
      fila({ vence: haceDias(5), clases_restantes: 8 }), // vencido
      fila({ vence: enDias(20), clases_restantes: 0 }), // sin_clases
      fila({ paquete_nombre: null, vence: null, tieneCuenta: true }), // sin_paquete
    ];
    const conteos = contarLifecycle(filas);
    expect(conteos.vigentes).toBe(2);
    expect(conteos.total).toBe(5);
  });
});

describe("el motor completo — mezcla al estilo forge (packs finitos, ilimitado, drop-ins, pendienteOnline, vencidos)", () => {
  // forge is the one organically-used gym on the platform, and its usage
  // skews heavily to pasa-lista / class visits (owner-is-dev memory) — this
  // roster leans on finite class packs rather than the /proto fixture's
  // all-ilimitado blind spot (#222's named fixture debt).
  const clasesPackMidCycle = fila({
    paquete_nombre: "8 clases",
    vence: enDias(15),
    clases_restantes: 6,
    visitas: { ultima: haceDias(1), ultimaConsumida: haceDias(1), alta: haceDias(90) },
  });
  const clasesPackCasiEnCero = fila({
    paquete_nombre: "8 clases",
    vence: enDias(20),
    clases_restantes: 1,
    visitas: { ultima: HOY, ultimaConsumida: HOY, alta: haceDias(60) },
  });
  const clasesPackAgotado = fila({
    paquete_nombre: "8 clases",
    vence: enDias(9),
    clases_restantes: 0,
    visitas: { ultima: haceDias(2), ultimaConsumida: haceDias(2), alta: haceDias(40) },
  });
  const ilimitadoPorVencer = fila({
    vence: enDias(4),
    clases_restantes: null,
    visitas: { ultima: haceDias(1), ultimaConsumida: haceDias(1), alta: haceDias(300) },
  });
  const hectorAusenteVigente = fila({
    vence: enDias(12),
    clases_restantes: null,
    visitas: { ultima: haceDias(24), ultimaConsumida: haceDias(24), alta: haceDias(400) },
  });
  const paseSueltoGastado = fila(
    {
      paquete_nombre: PASE,
      vence: enDias(18),
      clases_restantes: 0,
      visitas: { ultima: haceDias(12), ultimaConsumida: haceDias(12), alta: haceDias(12) },
    },
    CON_PASE,
  );
  const recienVencidoSinCuenta = fila({
    paquete_nombre: "8 clases",
    vence: haceDias(3),
    clases_restantes: 0,
    visitas: { ultima: haceDias(3), ultimaConsumida: haceDias(3), alta: haceDias(120) },
  });
  const recienVencidoConCuenta = fila({
    paquete_nombre: "8 clases",
    vence: haceDias(3),
    clases_restantes: 0,
    tieneCuenta: true,
    visitas: { ultima: haceDias(3), ultimaConsumida: haceDias(3), alta: haceDias(120) },
  });
  const largoMuerto = fila({
    paquete_nombre: "8 clases",
    vence: haceDias(44),
    clases_restantes: 0,
    visitas: { ultima: haceDias(49), ultimaConsumida: haceDias(49), alta: haceDias(500) },
  });
  const registroOnline = fila({
    paquete_nombre: null,
    clases_restantes: null,
    vence: null,
    tieneCuenta: true,
    visitas: { ultima: null, ultimaConsumida: null, alta: haceDias(1) },
  });

  const ROSTER = [
    clasesPackMidCycle,
    clasesPackCasiEnCero,
    clasesPackAgotado,
    ilimitadoPorVencer,
    hectorAusenteVigente,
    paseSueltoGastado,
    recienVencidoSinCuenta,
    recienVencidoConCuenta,
    largoMuerto,
    registroOnline,
  ];

  it("orders the fresh-clases-bound row and the online registrant ahead of the long-dead row", () => {
    const orden = ordenarLifecycle(ROSTER);
    const idxViejo = orden.indexOf(largoMuerto);
    expect(orden.indexOf(registroOnline)).toBeLessThan(idxViejo);
    expect(orden.indexOf(clasesPackCasiEnCero)).toBeLessThan(idxViejo);
    expect(idxViejo).toBe(orden.length - 1); // the deadest row is last, not first
  });

  it("counts the tiles and the online rail over the mixed roster", () => {
    const conteos = contarLifecycle(ROSTER);
    // clasesPackCasiEnCero (clases) + clasesPackAgotado (sin_clases) + ilimitadoPorVencer (días)
    expect(conteos.porRenovar.total).toBe(3);
    expect(conteos.porRenovar.cubos.clases).toBe(2); // casiEnCero + agotado
    // recienVencidoSinCuenta only — paseSueltoGastado excluded (one-off),
    // recienVencidoConCuenta excluded (app account), largoMuerto past día 16.
    expect(conteos.aunATiempo.total).toBe(1);
    expect(conteos.pendienteOnline).toBe(1);
    // vigentes (#223 finding 4): midCycle + casiEnCero + porVencer + hector + paseSueltoGastado.
    // agotado is sin_clases, the three vencido rows + registroOnline are not.
    expect(conteos.vigentes).toBe(5);
    expect(conteos.total).toBe(10);
  });

  it("flags Hector — paid up, vigente, but 24 días unseen — as ausente", () => {
    expect(hectorAusenteVigente.veredicto.ausencia).toEqual({ dias: 24, ausente: true });
  });
});
