import { describe, expect, it } from "vitest";

import { derivarVeredicto, type ContextoVeredicto, type HechosCliente } from "@gym/domain/lifecycle";
import type { ClienteRosterDTO } from "@gym/data/server/clientes";
import { derivarVistaRoster, filaCoincideBusqueda } from "./clientes-vm";

// These tests exercise the WIRING (does derivarVistaRoster order/count/reshape the
// DTOs' own verdicts?) — the engine's own ordering/estado/urgencia rules are already
// pinned by packages/domain/src/lifecycle.test.ts and are not re-asserted here (per
// #227's testing note). Fixtures are built from STORED facts through the real
// `derivarVeredicto`, not hand-written verdicts: a hand-written one could state an
// impossible combination (vencido with a null diasDesdeFin) that no read can produce.

const HOY = "2026-08-02";
const PASE = "1 clase";
const CTX: ContextoVeredicto = { hoy: HOY, pasesSueltos: new Set([PASE]) };

function dia(offset: number): string {
  const d = new Date(2026, 7, 2 + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const HECHOS_BASE: HechosCliente = {
  paquete_nombre: "8 clases",
  clases_restantes: 8,
  vence: dia(20),
  tieneCuenta: false,
  visitas: { ultima: dia(-1), ultimaConsumida: dia(-1), alta: dia(-200) },
};

const BASE: Omit<ClienteRosterDTO, "veredicto"> = {
  id: "base",
  nombre: "Base Cliente",
  tel: "6141234567",
  inicial: "B",
  paquete: "8 clases",
  venceDisplay: "22 ago",
  clasesRestLabel: "8",
  asistEsteMes: 3,
  invitacion: { estado: "sin_email", badge: "Sin email" },
  altaIso: "2026-01-01",
};

function mk(
  id: string,
  hechos: Partial<HechosCliente> = {},
  over: Partial<Omit<ClienteRosterDTO, "veredicto">> = {},
): ClienteRosterDTO {
  return {
    ...BASE,
    id,
    nombre: over.nombre ?? id,
    ...over,
    veredicto: derivarVeredicto({ ...HECHOS_BASE, ...hechos }, CTX),
  };
}

describe("derivarVistaRoster — ordering (wiring onto ordenarLifecycle)", () => {
  it("orders actionable (por renovar) before current before expired", () => {
    const actionable = mk("a", { vence: dia(5) }); // <= RENOVACION_DIAS
    const current = mk("c", { vence: dia(20) });
    const expired = mk("e", { vence: dia(-10) });

    const { filas } = derivarVistaRoster([expired, current, actionable]);
    expect(filas.map((f) => f.c.id)).toEqual(["a", "c", "e"]);
  });

  it("#227 F1: a lapsed account-holder (200 días vencido) is plain vencido — it does NOT outrank a vence-hoy vigente member, and a sin_paquete account-holder (a genuine fresh arrival) still leads", () => {
    // pendienteOnline is DERIVED now (tieneCuenta && sin_paquete), so this pairing
    // can no longer be mis-stated by a fixture: `viejo` HAS an account and is merely
    // lapsed, and only `fresco` (never bought) is pendienteOnline. Before #227 F1 BOTH
    // read pendienteOnline and topped the list — the "longest-dead first and loudest"
    // defect spec #222 opens with.
    const venceHoy = mk("hoy", { vence: HOY });
    const vencido200 = mk("viejo", { vence: dia(-200), clases_restantes: 0, tieneCuenta: true }, {
      invitacion: { estado: "cuenta_activa", badge: "Cuenta activa" },
    });
    const fresco = mk("fresco", { paquete_nombre: null, clases_restantes: null, vence: null, tieneCuenta: true }, {
      invitacion: { estado: "cuenta_activa", badge: "Cuenta activa" },
    });

    expect(vencido200.veredicto.pendienteOnline).toBe(false);
    expect(fresco.veredicto.pendienteOnline).toBe(true);

    const { filas } = derivarVistaRoster([vencido200, venceHoy, fresco]);
    expect(filas.map((f) => f.c.id)).toEqual(["fresco", "hoy", "viejo"]);
  });
});

describe("derivarVistaRoster — diasDesdeVencido", () => {
  it("is the positive days-since-expiry for a vencido row", () => {
    const { filas } = derivarVistaRoster([mk("e", { vence: dia(-12), clases_restantes: 0 })]);
    expect(filas[0]?.diasDesdeVencido).toBe(12);
  });

  it("is null for a still-vigente row", () => {
    const { filas } = derivarVistaRoster([mk("v", { vence: dia(5) })]);
    expect(filas[0]?.diasDesdeVencido).toBeNull();
  });
});

describe("derivarVistaRoster — vinculante numeral", () => {
  it("binds on clases when 1 clase remains with 25 días left", () => {
    const { filas } = derivarVistaRoster([mk("c", { vence: dia(25), clases_restantes: 1 })]);
    expect(filas[0]?.vinculante).toBe("clases");
  });
});

describe("derivarVistaRoster — pase suelto blinding (#227 F2/F3)", () => {
  const gastado = (id: string, vence: string) =>
    mk(id, { paquete_nombre: PASE, clases_restantes: 0, vence });

  it("a spent one-off pass (0 clases, días left) reads urgencia ok and binds on días — the blinded clases axis never fires crítico", () => {
    const { filas } = derivarVistaRoster([gastado("p", dia(20))]);
    expect(filas[0]?.urgencia).toBe("ok");
    expect(filas[0]?.vinculante).toBe("dias");
    expect(filas[0]?.renovar).toBe(false); // clases arm exempts pase suelto
  });

  it("does not jump ahead of a genuinely-urgent row in the SAME (current) tier — unblinded, the spent pass's raw 0 clases would read crítico and sort FIRST; blinded, it correctly sorts LAST", () => {
    // Both rows are outside POR RENOVAR (días > RENOVACION_DIAS for both) — the
    // same "current" ordering tier, so this isolates the urgencia-key ordering
    // from the group split (that's the prior test's job).
    const spent = gastado("p", dia(20));
    const pronto = mk("g", { vence: dia(12) }); // día 12 <= URGENCIA_DIAS.pronto
    const { filas } = derivarVistaRoster([spent, pronto]);
    expect(filas.map((f) => f.c.id)).toEqual(["g", "p"]);
  });
});

describe("derivarVistaRoster — nombrePlegado", () => {
  it("diacritic-folds the candidate name", () => {
    const { filas } = derivarVistaRoster([mk("c", {}, { nombre: "Chávez" })]);
    expect(filas[0]?.nombrePlegado).toBe("chavez");
  });
});

describe("derivarVistaRoster — conteos (header ratio + filter chips)", () => {
  it("matches hand counts on a small mixed roster", () => {
    const vigente = mk("v", { vence: dia(20) });
    const porRenovar = mk("r", { vence: dia(3) });
    const vencido = mk("x", { vence: dia(-5), clases_restantes: 0 });
    const online = mk("o", { paquete_nombre: null, clases_restantes: null, vence: null, tieneCuenta: true }, {
      invitacion: { estado: "cuenta_activa", badge: "Cuenta activa" },
    });

    const { conteos } = derivarVistaRoster([vigente, porRenovar, vencido, online]);
    expect(conteos.vigentes).toBe(2); // vigente + porRenovar (still "vigente" estado)
    expect(conteos.total).toBe(4);
    expect(conteos.porRenovar.total).toBe(1);
    expect(conteos.pendienteOnline).toBe(1);
  });

  it("counts aunATiempo off the same verdicts the rows render", () => {
    const recuperable = mk("r", { vence: dia(-5), clases_restantes: 0 });
    const vigente = mk("v", { vence: dia(20) });
    const { conteos } = derivarVistaRoster([recuperable, vigente]);
    expect(conteos.aunATiempo.total).toBe(1);
  });
});

describe("derivarVistaRoster — #229: AÚN A TIEMPO filter flag + the {n}D SIN VENIR badge gate", () => {
  /** Absent for 30 días — over AUSENTE_DIAS on every fixture below. */
  const ausente30 = { ultima: dia(-30), ultimaConsumida: dia(-30), alta: dia(-400) };

  it("aunATiempo mirrors the row's own tile", () => {
    const { filas } = derivarVistaRoster([mk("r", { vence: dia(-5), clases_restantes: 0 })]);
    expect(filas[0]?.aunATiempo).toBe(true);
    expect(filas[0]?.renovar).toBe(false); // never both — one verdict per row
  });

  it("shows the badge for a paid-up (vigente) row when the row's ausencia says so", () => {
    const { filas } = derivarVistaRoster([mk("v", { vence: dia(20), visitas: ausente30 })]);
    expect(filas[0]?.ausente).toBe(true);
    expect(filas[0]?.diasSinVenir).toBe(30);
  });

  it("shows the badge for a lapsed member INSIDE the recovery window (A9: does not vanish at lapse)", () => {
    const { filas } = derivarVistaRoster([
      mk("r", { vence: dia(-5), clases_restantes: 0, visitas: ausente30 }),
    ]);
    expect(filas[0]?.ausente).toBe(true);
  });

  it("#229 opus review F1/F2/F5: shows the badge for a lapsed member WITH an app account inside the window — excluded from the AÚN A TIEMPO TILE (tieneCuenta), but the window gate doesn't care", () => {
    const { filas } = derivarVistaRoster([
      mk("ca", { vence: dia(-5), clases_restantes: 0, tieneCuenta: true, visitas: ausente30 }),
    ]);
    expect(filas[0]?.aunATiempo).toBe(false); // not in the tile…
    expect(filas[0]?.ausente).toBe(true); // …but the badge still shows (A9)
  });

  it("#229 opus review F1/F2/F5: hides the badge for a sin_clases row — date-valid but unable to train today (story 11: paid-AND-ABLE, not merely paid)", () => {
    const { filas } = derivarVistaRoster([
      mk("sc", { vence: dia(20), clases_restantes: 0, visitas: ausente30 }),
    ]);
    expect(filas[0]?.ausente).toBe(false);
  });

  it("hides the badge for a plain long-dead vencido row PAST the recovery window, even though the absence fact is true", () => {
    const { filas } = derivarVistaRoster([
      mk("x", { vence: dia(-200), clases_restantes: 0, visitas: ausente30 }),
    ]);
    expect(filas[0]?.ausente).toBe(false); // "the dead" — no longer this fact's audience
    expect(filas[0]?.diasSinVenir).toBe(30); // the numeral survives; the badge does not
  });

  it("hides the badge for a sin_paquete/pendienteOnline row, even though the absence fact is true", () => {
    const { filas } = derivarVistaRoster([
      mk("o", { paquete_nombre: null, clases_restantes: null, vence: null, tieneCuenta: true, visitas: ausente30 }),
    ]);
    expect(filas[0]?.ausente).toBe(false); // nothing paid — never "paid-up"
  });

  it("reads false/0 for a roster with no visit aggregate at all — never a badge on an unknown absence", () => {
    const { filas } = derivarVistaRoster([mk("nl", { visitas: "no_leidas" })]);
    expect(filas[0]?.ausente).toBe(false);
    expect(filas[0]?.diasSinVenir).toBe(0);
  });
});

describe("filaCoincideBusqueda — roster search predicate (#239 tel-arm digit guard)", () => {
  it("a letters-only query matches by name only — never falls through to every phone", () => {
    const ana = mk("ana", {}, { nombre: "Ana López", tel: "6141234567" });
    const beto = mk("beto", {}, { nombre: "Beto Ruiz", tel: "6149876543" });
    const { filas } = derivarVistaRoster([ana, beto]);

    const hits = filas.filter((f) => filaCoincideBusqueda(f, "ana"));
    expect(hits.map((f) => f.c.id)).toEqual(["ana"]);
  });

  it("a digit query still matches by phone", () => {
    const ana = mk("ana", {}, { nombre: "Ana López", tel: "6141234567" });
    const beto = mk("beto", {}, { nombre: "Beto Ruiz", tel: "6149876543" });
    const { filas } = derivarVistaRoster([ana, beto]);

    const hits = filas.filter((f) => filaCoincideBusqueda(f, "987654"));
    expect(hits.map((f) => f.c.id)).toEqual(["beto"]);
  });

  it("opus review F2: a separator-formatted query still matches a digit-only stored tel", () => {
    const ana = mk("ana", {}, { nombre: "Ana López", tel: "6141234567" });
    const { filas } = derivarVistaRoster([ana]);

    expect(filaCoincideBusqueda(filas[0]!, "614 1234")).toBe(true);
  });
});
