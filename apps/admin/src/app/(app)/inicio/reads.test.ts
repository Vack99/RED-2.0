import { describe, expect, it, vi } from "vitest";

import type { AgendaSemanaDTO, SesionAgendaDTO } from "@gym/data/server/agenda";
import { addDays, inicioSemana, parseDay, toIsoDay } from "@gym/format";

import { leerProximoDia } from "./reads";

/**
 * `leerProximoDia`'s week-read rewrite (review follow-up, #328): the up-to-7
 * sequential `getAgendaDia` calls became at most two `getAgendaSemana` reads, so this
 * asserts the OUTCOME the day-by-day loop used to guarantee — a class within the
 * `HORIZONTE_PROXIMO_DIA` window is found, one strictly past it is not — now against
 * the week-shaped read. The day-by-day BEHAVIOUR (hero pick, tense, rows) stays
 * covered by `./_components/inicio-vm.test.ts`; this is the seam that replaced the loop.
 */

const getAgendaSemana = vi.fn();
vi.mock("@gym/data/server/agenda", () => ({
  getAgendaSemana: (...args: unknown[]) => getAgendaSemana(...args),
}));

const DUMMY_SESSION: Omit<SesionAgendaDTO, "id" | "startsAt"> = {
  duracionMin: 60,
  capacidad: 14,
  activos: 0,
  disponibles: 14,
  estado: "normal",
  tipo: "Functional",
  esEspecial: false,
  nombreEspecial: null,
  muestraEspecial: false,
  roomId: null,
  coaches: [],
  templateId: null,
  plantilla: null,
};

function sesion(id: string, fecha: Date): SesionAgendaDTO {
  return { id, startsAt: fecha, ...DUMMY_SESSION };
}

/** A `getAgendaSemana`-shaped week: six Lun–Sáb days, sessions only on `conClase`. */
function semanaDe(lunes: Date, conClase: Date[]): AgendaSemanaDTO {
  const dias = Array.from({ length: 6 }, (_, i) => {
    const fecha = addDays(lunes, i);
    const propia = conClase.filter((f) => f.getTime() === fecha.getTime());
    const sesiones = propia.map((f, j) => sesion(`s-${toIsoDay(f)}-${j}`, f));
    return { fecha, sesiones, resumen: { clases: sesiones.length, reservas: 0 }, ratioOcupacion: 0 };
  });
  return { lunes, dias, resumenSemana: { clases: 0, reservas: 0, ratioOcupacion: 0 } };
}

// Wednesday — the SAME day `derivarFechaHeader`'s own test pins ("2 DE SEPTIEMBRE" 2026).
const HOY_ISO = "2026-09-02";
const HOY = parseDay(HOY_ISO);

function stubSemanas(conClase: Date[]) {
  getAgendaSemana.mockClear();
  getAgendaSemana.mockImplementation(async (fechaIso: string) => {
    const lunes = inicioSemana(parseDay(fechaIso));
    return semanaDe(lunes, conClase);
  });
}

describe("leerProximoDia — week-read (review follow-up)", () => {
  it("a class on day 3 is found, inside the current week's own Sábado — one week read", async () => {
    const dia3 = addDays(HOY, 3); // 2026-09-05, Sábado — still HOY's own week
    stubSemanas([dia3]);

    const proximo = await leerProximoDia(HOY_ISO);

    expect(proximo?.fecha).toBe(toIsoDay(dia3));
    expect(proximo?.sesiones).toHaveLength(1);
    expect(getAgendaSemana).toHaveBeenCalledTimes(1); // no second week needed
  });

  it("a class on day 8 is OUTSIDE the 7-day bound and is never returned, even though the second week's own read reaches it", async () => {
    const dia8 = addDays(HOY, 8); // 2026-09-10 — inside the fetched second week, past the bound
    stubSemanas([dia8]);

    const proximo = await leerProximoDia(HOY_ISO);

    expect(proximo).toBeNull();
    expect(getAgendaSemana).toHaveBeenCalledTimes(2); // the window DOES spill into next week…
    // …but day 8 itself is filtered out, not merely absent from the fetched data.
    const segundaSemanaArg: string = getAgendaSemana.mock.calls[1][0];
    expect(parseDay(segundaSemanaArg).getTime()).toBeLessThanOrEqual(dia8.getTime());
  });
});
