import { describe, expect, it } from "vitest";

import { LIBRE, type Visita } from "./marcadas";
import { ctxDesdeSesionParam, opcionesEntrada } from "./entrada";

const HOY = "2026-09-01";
const AYER = "2026-08-31";

const sesion = (id: string, hora: string, tipo: string, capacidad = 10) => ({ id, hora, tipo, capacidad });
const visita = (clienteId: string, sessionId: string | null): Visita => ({
  clienteId,
  sessionId,
  hora: null,
});

describe("opcionesEntrada — the entry step's choice list", () => {
  it("today with classes: the day's classes in order, then ACCESO LIBRE last", () => {
    const opciones = opcionesEntrada(
      HOY,
      HOY,
      [sesion("s1", "07:00", "CROSSFIT"), sesion("s2", "18:00", "YOGA")],
      [],
    );
    expect(opciones.map((o) => o.id)).toEqual(["s1", "s2", LIBRE]);
    expect(opciones.at(-1)).toEqual({ id: LIBRE, hora: "", tipo: "ACCESO LIBRE", ocupacion: null });
  });

  it("a no-class day offers only ACCESO LIBRE", () => {
    const opciones = opcionesEntrada(HOY, HOY, [], []);
    expect(opciones).toEqual([{ id: LIBRE, hora: "", tipo: "ACCESO LIBRE", ocupacion: null }]);
  });

  it("a past date offers only LIBRE even when today has classes — the desk has no other day's schedule", () => {
    const opciones = opcionesEntrada(AYER, HOY, [sesion("s1", "07:00", "CROSSFIT")], []);
    expect(opciones).toEqual([{ id: LIBRE, hora: "", tipo: "ACCESO LIBRE", ocupacion: null }]);
  });

  it("counts distinct members already marked in each class as N/M", () => {
    const visitas = [visita("c1", "s1"), visita("c2", "s1"), visita("c3", "s2")];
    const opciones = opcionesEntrada(
      HOY,
      HOY,
      [sesion("s1", "07:00", "CROSSFIT", 12), sesion("s2", "18:00", "YOGA", 8)],
      visitas,
    );
    expect(opciones[0].ocupacion).toBe("2/12");
    expect(opciones[1].ocupacion).toBe("1/8");
  });

  it("an unmarked class reads 0/capacidad, never a blank", () => {
    const opciones = opcionesEntrada(HOY, HOY, [sesion("s1", "07:00", "CROSSFIT", 12)], []);
    expect(opciones[0].ocupacion).toBe("0/12");
  });

  it("a LIBRE visit never counts toward a class's occupancy", () => {
    const visitas = [visita("c1", null)];
    const opciones = opcionesEntrada(HOY, HOY, [sesion("s1", "07:00", "CROSSFIT", 12)], visitas);
    expect(opciones[0].ocupacion).toBe("0/12");
  });
});

describe("ctxDesdeSesionParam — the deep-link skip", () => {
  const sesiones = [{ id: "s1" }, { id: "s2" }];

  it("skips to the named class when the id is one of today's", () => {
    expect(ctxDesdeSesionParam("s2", sesiones)).toBe("s2");
  });

  it("no param — the step is shown, not skipped", () => {
    expect(ctxDesdeSesionParam(undefined, sesiones)).toBeNull();
  });

  it("an unknown id (stale link, failed schedule read) falls back to the step, never a phantom context", () => {
    expect(ctxDesdeSesionParam("nope", sesiones)).toBeNull();
  });

  it("no schedule at all — any id falls back to the step", () => {
    expect(ctxDesdeSesionParam("s1", [])).toBeNull();
  });
});
