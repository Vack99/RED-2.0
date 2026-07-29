import { describe, expect, it } from "vitest";

import { ctxDe, LIBRE, personasEn, reservaAtribuible, sesionCercana, setVisita, visitaDe, type Visita } from "./marcadas";

const visita = (clienteId: string, sessionId: string | null, hora: string | null): Visita => ({
  clienteId,
  sessionId,
  hora,
});

describe("setVisita — the one state model, every day", () => {
  it("appends a visit in the selected context", () => {
    const next = setVisita([], "s1", "c1", true, "07:10");
    expect(next).toEqual([{ clienteId: "c1", sessionId: "s1", hora: "07:10" }]);
  });

  it("records ACCESO LIBRE as a null sessionId, not a magic string", () => {
    const [v] = setVisita([], LIBRE, "c1", true, "07:10");
    expect(v.sessionId).toBeNull();
    expect(ctxDe(v)).toBe(LIBRE);
  });

  it("lets ONE member hold visits in TWO contexts the same day (the whole of #89)", () => {
    const libre = setVisita([], LIBRE, "c1", true, "07:10");
    const ambas = setVisita(libre, "s9", "c1", true, "18:05");
    expect(ambas).toHaveLength(2);
    expect(visitaDe(ambas, LIBRE, "c1")?.hora).toBe("07:10");
    expect(visitaDe(ambas, "s9", "c1")?.hora).toBe("18:05");
  });

  it("removes only the visit in THAT context, leaving the other standing", () => {
    const ambas = setVisita(setVisita([], LIBRE, "c1", true, "07:10"), "s9", "c1", true, "18:05");
    const next = setVisita(ambas, "s9", "c1", false, null);
    expect(next).toEqual([{ clienteId: "c1", sessionId: null, hora: "07:10" }]);
  });

  it("re-marking replaces the hora in place (the server's time lands on the optimistic row)", () => {
    const optimista = setVisita([], "s1", "c1", true, null);
    const reconciliado = setVisita(optimista, "s1", "c1", true, "07:10");
    expect(reconciliado).toHaveLength(1);
    expect(reconciliado[0].hora).toBe("07:10");
  });

  it("keeps a back-dated mark's null hora — the untimed placeholder a past day renders", () => {
    const next = setVisita([], LIBRE, "c1", true, null);
    expect(next).toEqual([{ clienteId: "c1", sessionId: null, hora: null }]);
  });

  it("is idempotent when removing a visit that is absent", () => {
    const cur = [visita("c2", null, "07:10")];
    expect(setVisita(cur, LIBRE, "c1", false, null)).toEqual(cur);
  });

  it("does not mutate the input list", () => {
    const cur = [visita("c1", null, "07:10")];
    const next = setVisita(cur, "s1", "c1", true, "18:05");
    expect(cur).toHaveLength(1);
    expect(next).not.toBe(cur);
  });

  it("leaves other members untouched", () => {
    const otra = visita("c9", null, "06:00");
    const next = setVisita([otra], LIBRE, "c1", true, "07:10");
    expect(next[0]).toBe(otra);
  });
});

describe("personasEn — the day dot counts DISTINCT members, not rows", () => {
  it("counts a member's two visits once", () => {
    expect(personasEn([visita("c1", null, "07:10"), visita("c1", "s9", "18:05")])).toBe(1);
  });

  it("is 0 for an empty day", () => {
    expect(personasEn([])).toBe(0);
  });
});

describe("sesionCercana — the opening context", () => {
  const ahora = new Date("2026-07-28T18:00:00.000Z");
  const sesion = (id: string, offsetMin: number) => ({
    id,
    startsAt: new Date(ahora.getTime() + offsetMin * 60_000),
  });

  it("falls back to ACCESO LIBRE with no schedule — Forge's screen", () => {
    expect(sesionCercana([], ahora)).toBe(LIBRE);
  });

  it("opens on the class nearest now, before or after it", () => {
    expect(sesionCercana([sesion("early", -70), sesion("soon", 20)], ahora)).toBe("soon");
    expect(sesionCercana([sesion("just-past", -10), sesion("later", 45)], ahora)).toBe("just-past");
  });

  it("falls back to ACCESO LIBRE when every class is outside the 90-minute window", () => {
    expect(sesionCercana([sesion("morning", -200), sesion("night", 240)], ahora)).toBe(LIBRE);
  });

  it("compares absolute instants, so a class exactly 90 minutes out still opens", () => {
    expect(sesionCercana([sesion("edge", 90)], ahora)).toBe("edge");
    expect(sesionCercana([sesion("beyond", 91)], ahora)).toBe(LIBRE);
  });
});

describe("reservaAtribuible — what the RESERVA chip is allowed to promise", () => {
  const ahora = new Date("2026-07-29T18:00:00.000Z");
  const sesion = (id: string, offsetMin: number) => ({
    id,
    startsAt: new Date(ahora.getTime() + offsetMin * 60_000),
  });
  const reserva = (clienteId: string, status = "reservada", isWalkIn = false) => ({
    clienteId,
    status,
    isWalkIn,
  });

  it("names the booking a LIBRE tap would be attributed to", () => {
    const mapa = reservaAtribuible([sesion("s1", 20)], { s1: [reserva("c1")] }, ahora);
    expect(mapa).toEqual({ c1: "s1" });
  });

  it("skips an ALREADY-MARKED booking — that tap refuses ('Ya marcada'), it does not attribute", () => {
    const mapa = reservaAtribuible([sesion("s1", 20)], { s1: [reserva("c1", "asistida")] }, ahora);
    expect(mapa).toEqual({});
  });

  it("skips a walk-in booking — the RPC's money guard keeps those off the delegation path", () => {
    const mapa = reservaAtribuible(
      [sesion("s1", 20)],
      { s1: [reserva("c1", "reservada", true)] },
      ahora,
    );
    expect(mapa).toEqual({});
  });

  it("breaks a double-booking by absolute distance from now, not by schedule order — the RPC's own tie-break", () => {
    const mapa = reservaAtribuible(
      [sesion("early", -70), sesion("soon", 20)],
      { early: [reserva("c1")], soon: [reserva("c1")] },
      ahora,
    );
    expect(mapa).toEqual({ c1: "soon" });
  });

  it("is empty for a gym with no schedule, and for a session nobody booked", () => {
    expect(reservaAtribuible([], {}, ahora)).toEqual({});
    expect(reservaAtribuible([sesion("s1", 20)], {}, ahora)).toEqual({});
  });
});
