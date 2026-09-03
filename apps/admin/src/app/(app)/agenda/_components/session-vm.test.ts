import { describe, expect, it } from "vitest";

import type { SesionAgendaDTO } from "@gym/data/server/agenda";

import {
  accionAgregar,
  aplicarAlcance,
  canceladasLinea,
  coachIdsCambiaron,
  createDraft,
  diaSemanaDe,
  draftSinCambios,
  editDraftFrom,
  esBloqueoVendible,
  esSerie,
  movidasLinea,
  semillaAlcance,
  sugerenciaVenta,
  toCardVM,
} from "./session-vm";

/**
 * The page's DTO -> card/row view model. The DAL derives a 5-value domain estado
 * (incl. `a_continuacion`); the #41 primitives take a 4-value UI estado plus an
 * orthogonal `isNext` accent, so this pure seam bridges the two — plus the coach
 * join and the ★-especial selection. Isolated + tested (the page itself is not).
 */

function dto(over: Partial<SesionAgendaDTO> = {}): SesionAgendaDTO {
  return {
    id: "s1",
    startsAt: new Date("2026-06-17T14:00:00Z"),
    duracionMin: 45,
    capacidad: 24,
    activos: 0,
    disponibles: 24,
    estado: "normal",
    tipo: "Funcional",
    esEspecial: false,
    nombreEspecial: null,
    muestraEspecial: false,
    roomId: null,
    coaches: [],
    templateId: null,
    plantilla: null,
    ...over,
  };
}

/** A session that came from a rule AND still matches it — the ordinary on-grid case.
 *  `groupDias: [3]` (jueves alone) — its value is irrelevant here; the "horario" toggle
 *  gating on group size is an editor-sheet concern, tested in editor-sheet.test.ts. */
const REGLA = { tipo: "Metcon", hora: "19:00", duracionMin: 60, capacidad: 30, coachIds: ["co1"], groupDias: [3] };

describe("toCardVM", () => {
  it("maps a_continuacion to UI estado 'normal' with isNext true", () => {
    const vm = toCardVM(dto({ estado: "a_continuacion" }), "08:15");
    expect(vm.estado).toBe("normal");
    expect(vm.isNext).toBe(true);
  });

  it.each(["normal", "casi_lleno", "lleno", "termino"] as const)(
    "passes the 4-value estado '%s' through with isNext false",
    (estado) => {
      const vm = toCardVM(dto({ estado }), "08:15");
      expect(vm.estado).toBe(estado);
      expect(vm.isNext).toBe(false);
    },
  );

  it("joins multiple coaches into a comma label and keeps their ids for the editor", () => {
    const vm = toCardVM(
      dto({ coaches: [{ id: "co1", nombre: "Marisa" }, { id: "co2", nombre: "Paty" }] }),
      "18:15",
    );
    expect(vm.coaches).toBe("Marisa, Paty");
    expect(vm.coachIds).toEqual(["co1", "co2"]);
  });

  it("renders 'Por asignar' when a session has no coaches", () => {
    expect(toCardVM(dto({ coaches: [] }), "18:15").coaches).toBe("Por asignar");
  });

  it("drives the card ★ from muestraEspecial (not raw esEspecial) but keeps esEspecial for the sheet/editor", () => {
    const vm = toCardVM(
      dto({ esEspecial: true, muestraEspecial: false, nombreEspecial: "Noche de Fuerza", estado: "a_continuacion" }),
      "18:15",
    );
    expect(vm.isSpecial).toBe(false); // suppressed while a_continuacion
    expect(vm.esEspecial).toBe(true);
    expect(vm.specialName).toBe("Noche de Fuerza");
  });

  it("carries the passed hora + booked/cap/mins/tipo through for both card and week-row rendering", () => {
    const vm = toCardVM(dto({ activos: 18, capacidad: 20, duracionMin: 60, tipo: "Metcon" }), "12:30");
    expect(vm).toMatchObject({ id: "s1", time: "12:30", mins: 60, tipo: "Metcon", booked: 18, cap: 20 });
  });

  it("carries the ABSOLUTE start as ISO — the tense predicate can't read the tz-folded hora (#238)", () => {
    expect(toCardVM(dto(), "08:00").startsAtIso).toBe("2026-06-17T14:00:00.000Z");
  });

  it("carries the generating rule through — null is a one-off, an id is a series (#243)", () => {
    expect(toCardVM(dto(), "08:00").templateId).toBeNull();
    expect(toCardVM(dto({ templateId: "tpl-1" }), "08:00").templateId).toBe("tpl-1");
  });

  it("carries the rule's OWN values, which the wide-scope editor seeds from (#243)", () => {
    expect(toCardVM(dto(), "08:00").plantilla).toBeNull();
    expect(toCardVM(dto({ templateId: "tpl-1", plantilla: REGLA }), "08:00").plantilla).toEqual(REGLA);
  });
});

/**
 * The editor's draft seeds. The load-bearing field is `alcance`: it is re-seeded on
 * EVERY open, so a "dia"/"horario" scope can never be left armed for the next card
 * the operator taps — a sticky wide scope would silently rewrite a whole schedule.
 */
describe("createDraft", () => {
  it("seeds the PRD defaults with the first tipo and no repeat days", () => {
    expect(createDraft("Fuerza")).toEqual({
      tipo: "Fuerza",
      hora: "18:00",
      duracionMin: 45,
      cupo: 24,
      coachIds: [],
      repeatDays: [false, false, false, false, false, false],
      alcance: "clase",
      isSpecial: false,
      specialName: "",
    });
  });
  it("tolerates an empty tipo catalog", () => {
    expect(createDraft("").tipo).toBe("");
  });
});

describe("editDraftFrom", () => {
  const card = toCardVM(
    dto({
      templateId: "tpl-1",
      duracionMin: 60,
      capacidad: 30,
      tipo: "Metcon",
      esEspecial: true,
      nombreEspecial: "Noche de Fuerza",
      coaches: [{ id: "co1", nombre: "Marisa" }],
    }),
    "19:00",
  );

  it("seeds the sheet from the clicked session", () => {
    expect(editDraftFrom(card)).toMatchObject({
      tipo: "Metcon",
      hora: "19:00",
      duracionMin: 60,
      cupo: 30,
      coachIds: ["co1"],
      isSpecial: true,
      specialName: "Noche de Fuerza",
    });
  });

  it("defaults the scope to this class alone, even for a session that came from a rule", () => {
    expect(editDraftFrom(card).alcance).toBe("clase");
  });

  it("leaves the weekday row empty — it is the create flow's alone", () => {
    expect(editDraftFrom(card).repeatDays).toEqual([false, false, false, false, false, false]);
  });

  it("blanks a missing special name rather than carrying null into the input", () => {
    expect(editDraftFrom(toCardVM(dto(), "19:00")).specialName).toBe("");
  });
});

/**
 * The editor's `esSerie` gate (D15, duplication-incident audit). Gated on `plantilla`, not on
 * the raw `templateId` FK — a retired template leaves `templateId` set but nulls `plantilla`
 * (packages/data agenda.ts), and offering the series toggle off the FK alone put a dead
 * "Todos los <día>" / "Todo el horario" verb in front of staff whose save then failed with
 * "Horario no encontrado o ya retirado", read as a no-op edit and re-created as a duplicate.
 */
describe("esSerie", () => {
  it("is true when the card carries its rule's live values", () => {
    const card = toCardVM(dto({ templateId: "tpl-1", plantilla: REGLA }), "19:00");
    expect(esSerie(card)).toBe(true);
  });

  it("is false for a true one-off — no template at all", () => {
    const card = toCardVM(dto(), "19:00");
    expect(esSerie(card)).toBe(false);
  });

  it("is false for a retired template — templateId survives as the raw FK, plantilla does not (D15)", () => {
    const card = toCardVM(dto({ templateId: "tpl-1", plantilla: null }), "19:00");
    expect(card.templateId).toBe("tpl-1"); // the FK is still there
    expect(esSerie(card)).toBe(false); // but the sheet must not offer a series scope over it
  });

  it("is false while no card is under edit (create mode)", () => {
    expect(esSerie(null)).toBe(false);
  });
});

/**
 * THE seed rule (#243). A wide save rewrites the RULE, so the wide arm must read the rule —
 * and a class can be attached and still off-grid, because `update_recurring_schedule` leaves the
 * one whose recomputed instant would land in the past exactly where it was. Seeding a wide save
 * from that class is how an operator who touched only the cupo reverts a whole schedule.
 */
describe("semillaAlcance", () => {
  /** The kept class: still attached to tpl-1, but sitting at LAST month's values. */
  const desfasada = toCardVM(
    dto({
      templateId: "tpl-1",
      plantilla: REGLA,
      tipo: "Funcional",
      duracionMin: 45,
      capacidad: 24,
      coaches: [{ id: "co9", nombre: "Suplente" }],
    }),
    "07:00",
  );

  it.each(["dia", "horario"] as const)("seeds the %s arm from the RULE, not from the off-grid class that was clicked", (alcance) => {
    expect(semillaAlcance(desfasada, alcance)).toEqual({
      tipo: "Metcon",
      hora: "19:00",
      duracionMin: 60,
      cupo: 30,
      coachIds: ["co1"],
    });
  });

  it("seeds the narrow arm from the clicked class — that is the row it edits", () => {
    expect(semillaAlcance(desfasada, "clase")).toEqual({
      tipo: "Funcional",
      hora: "07:00",
      duracionMin: 45,
      cupo: 24,
      coachIds: ["co9"],
    });
  });

  it.each(["dia", "horario"] as const)("is identical to 'clase' for an on-grid class — the normal case shows no visible change", (alcance) => {
    const alDia = toCardVM(
      dto({ templateId: "tpl-1", plantilla: REGLA, tipo: "Metcon", duracionMin: 60, capacidad: 30, coaches: [{ id: "co1", nombre: "Marisa" }] }),
      "19:00",
    );
    expect(semillaAlcance(alDia, alcance)).toEqual(semillaAlcance(alDia, "clase"));
  });

  it.each(["dia", "horario"] as const)("falls back to the session for a one-off, which has no rule to read", (alcance) => {
    const unica = toCardVM(dto({ tipo: "Funcional", capacidad: 24 }), "07:00");
    expect(semillaAlcance(unica, alcance)).toEqual(semillaAlcance(unica, "clase"));
  });
});

/**
 * The no-op guard (#243). A narrow save runs `edit_class_session`, which clears `template_id` —
 * so GUARDAR on an untouched series class trades an irreversible detach for nothing at all.
 */
describe("draftSinCambios", () => {
  const card = toCardVM(
    dto({ templateId: "tpl-1", plantilla: REGLA, tipo: "Metcon", duracionMin: 60, capacidad: 30, coaches: [{ id: "co1", nombre: "Marisa" }] }),
    "19:00",
  );
  const limpio = editDraftFrom(card);

  it("is true for a sheet that was opened and not touched", () => {
    expect(draftSinCambios(card, limpio)).toBe(true);
  });

  it.each([
    ["tipo", { tipo: "Funcional" }],
    ["hora", { hora: "20:00" }],
    ["duración", { duracionMin: 45 }],
    ["cupo", { cupo: 24 }],
    ["coaches", { coachIds: ["co2"] }],
    ["evento especial", { isSpecial: true }],
  ])("is false once the operator changes the %s", (_campo, patch) => {
    expect(draftSinCambios(card, { ...limpio, ...patch })).toBe(false);
  });

  it("ignores a coach re-tapped back into place — that is not a change", () => {
    expect(draftSinCambios(card, { ...limpio, coachIds: ["co1"] })).toBe(true);
  });

  it.each(["dia", "horario"] as const)("measures the WIDE scope against the rule, so a scope flip alone is still no change", (alcance) => {
    expect(draftSinCambios(card, { ...limpio, alcance })).toBe(true);
  });

  it.each(["dia", "horario"] as const)("sees the off-grid class's own values as a real change to the rule under the wide scope", (alcance) => {
    const desfasada = toCardVM(dto({ templateId: "tpl-1", plantilla: REGLA, tipo: "Metcon", duracionMin: 60, capacidad: 30, coaches: [{ id: "co1", nombre: "Marisa" }] }), "07:00");
    expect(draftSinCambios(desfasada, { ...editDraftFrom(desfasada), alcance })).toBe(false);
  });

  // D7: isSpecial/specialName are a property of ONE dated class — the wide RPCs never write
  // them, and the sheet hides the toggle once the scope isn't "clase" — so a special-flag edit
  // abandoned by flipping scope must NOT block the no-op guard and silently ride a rule-wide
  // write through instead.
  it.each(["dia", "horario"] as const)("ignores an isSpecial/specialName change under the WIDE scope (D7) — the wide RPC never writes it", (alcance) => {
    expect(draftSinCambios(card, { ...limpio, alcance, isSpecial: true, specialName: "Noche de Fuerza" })).toBe(true);
  });
});

/**
 * The scope-toggle transform (#243 fix; defects D1/D2/D4). A flip still baselines the new
 * scope's RULE for anything the operator has NOT actually changed — the SILENT EDIT WIPE fix —
 * but "changed" is judged BY VALUE against the scope being LEFT, never by a sticky touched-flag
 * (D2): a value dialed away and corrected back by hand must re-seed like any other untouched
 * field, not freeze forever because it was momentarily dirtied. `coachIds` can't use the same
 * value test — it's a set — so a dirty multi-select rebases the operator's DELTA (added minus
 * removed) onto the new seed instead of carrying the raw array forward (D1): carrying the raw
 * array would let an off-grid session's own substitute coach silently replace the rule's coach.
 *
 * Sequence (a)/(b)/(c) plus the coach-removal case below are the mutation-tested set: with
 * `aplicarAlcance`'s body temporarily swapped for a naive "always take the new seed" full
 * re-seed (`return { ...draft, ...semillaAlcance(card, alcance), alcance }`), (a), (c) and the
 * removal test go red — confirmed by actually running it. (b) stays green under that particular
 * mutation (a blind full-reseed happens to produce the same "19:00" here); it instead
 * discriminates the EARLIER touched-Set implementation, where a value corrected back by hand
 * stayed stuck at the card's own value forever (D2) rather than re-seeding.
 */
describe("aplicarAlcance", () => {
  /** Off-grid: still attached to tpl-1, but its own values (Funcional/07:00/45/24/[co9]) have
   *  drifted from the rule's (Metcon/19:00/60/30/[co1]) — the case the delta rebase exists for. */
  const desfasada = toCardVM(
    dto({ templateId: "tpl-1", plantilla: REGLA, tipo: "Funcional", duracionMin: 45, capacidad: 24, coaches: [{ id: "co9", nombre: "Suplente" }] }),
    "07:00",
  );

  it("re-seeds every scalar field and the coach set on an ordinary toggle — nothing was touched", () => {
    const next = aplicarAlcance(desfasada, editDraftFrom(desfasada), "dia");
    expect(next).toMatchObject({ tipo: "Metcon", hora: "19:00", duracionMin: 60, cupo: 30, coachIds: ["co1"], alcance: "dia" });
  });

  it("(a) a touched hora survives the flip to 'dia'; the untouched cupo re-seeds from the rule", () => {
    const conHora = { ...editDraftFrom(desfasada), hora: "08:00" };
    const next = aplicarAlcance(desfasada, conHora, "dia");
    expect(next.hora).toBe("08:00");
    expect(next.cupo).toBe(30);
  });

  it("(b) an hora dialed away and corrected back to the clase seed still re-seeds on flip (D2)", () => {
    const overshoot = { ...editDraftFrom(desfasada), hora: "09:00" }; // wheel-picker overshoot
    const corregido = { ...overshoot, hora: "07:00" }; // corrected back BY HAND to the session's own hora
    const next = aplicarAlcance(desfasada, corregido, "dia");
    expect(next.hora).toBe("19:00"); // the rule's hora — not stuck at "07:00" nor "09:00"
  });

  it("(c) an added coach chip rebases onto the rule's set on flip — the substitute coach does not carry over (D1)", () => {
    const conChip = { ...editDraftFrom(desfasada), coachIds: ["co9", "co5"] }; // co9 = session's own substitute; co5 = the operator's new tap
    const next = aplicarAlcance(desfasada, conChip, "dia");
    expect(next.coachIds).toEqual(["co1", "co5"]); // co1 = the rule's own coach; co9 never appears
  });

  it("a removed coach chip rebases too — dropping the rule's only coach carries the drop forward (D1)", () => {
    const alDia = toCardVM(
      dto({ templateId: "tpl-1", plantilla: REGLA, tipo: "Metcon", duracionMin: 60, capacidad: 30, coaches: [{ id: "co1", nombre: "Marisa" }] }),
      "19:00",
    );
    const sinCoach = { ...editDraftFrom(alDia), coachIds: [] };
    const next = aplicarAlcance(alDia, sinCoach, "dia");
    expect(next.coachIds).toEqual([]); // the removal carries forward — not silently restored
  });
});

/**
 * Whether a series write sends its coach set at all (#243). The sheet seeds coaches
 * from the ONE clicked session, so sending them unconditionally would stamp last
 * week's substitute onto the whole schedule; the RPC leaves them alone when omitted.
 */
describe("coachIdsCambiaron", () => {
  it("is false when the operator never touched the multi-select", () => {
    expect(coachIdsCambiaron(["co1", "co2"], ["co1", "co2"])).toBe(false);
    expect(coachIdsCambiaron([], [])).toBe(false);
  });
  it("ignores order — the multi-select appends taps, a re-tapped-back set is unchanged", () => {
    expect(coachIdsCambiaron(["co1", "co2"], ["co2", "co1"])).toBe(false);
  });
  it("is true on an added, a removed, or a swapped coach", () => {
    expect(coachIdsCambiaron(["co1"], ["co1", "co2"])).toBe(true);
    expect(coachIdsCambiaron(["co1", "co2"], ["co1"])).toBe(true);
    expect(coachIdsCambiaron(["co1"], ["co2"])).toBe(true);
  });
  it("is true when the operator clears every coach", () => {
    expect(coachIdsCambiaron(["co1"], [])).toBe(true);
  });
});

/**
 * The two series receipts. The count is what the RPC actually did — and a move can
 * legitimately rewrite fewer classes than the series holds: the ones whose new time would
 * land in the past keep their old time, and the receipt has to NAME them rather than let the
 * operator find it on the agenda (#243 §4). "horario" can skip one PER WEEKDAY in the group,
 * hence the plural arm — "dia" only ever skips 0 or 1 (only the current week can recompute
 * backwards).
 */
describe("movidasLinea", () => {
  it("counts the future classes a move actually rewrote", () => {
    expect(movidasLinea(6, 0)).toBe("6 clases futuras movidas");
  });
  it("reads singular for one, and survives a zero-move (every week already past)", () => {
    expect(movidasLinea(1, 0)).toBe("1 clase futura movida");
    expect(movidasLinea(0, 0)).toBe("0 clases futuras movidas");
  });
  it("names the class the past-instant guard left alone instead of quietly under-counting", () => {
    // "se queda como está", not "mantiene su horario": the kept class keeps EVERYTHING —
    // hora, cupo, tipo and coaches — because the move skipped it whole.
    expect(movidasLinea(5, 1)).toBe("5 clases futuras movidas · la de esta semana se queda como está");
    expect(movidasLinea(0, 1)).toBe("0 clases futuras movidas · la de esta semana se queda como está");
  });
  it("pluralizes the skipped classes for 'horario' — one skip per weekday in the group", () => {
    expect(movidasLinea(11, 2)).toBe("11 clases futuras movidas · 2 clases de esta semana se quedan como están");
    expect(movidasLinea(0, 3)).toBe("0 clases futuras movidas · 3 clases de esta semana se quedan como están");
  });
});

describe("canceladasLinea", () => {
  it("counts the cancelled classes and says the held ones came back", () => {
    expect(canceladasLinea(6)).toBe("6 clases canceladas · clases devueltas");
    expect(canceladasLinea(1)).toBe("1 clase cancelada · clases devueltas");
    expect(canceladasLinea(0)).toBe("0 clases canceladas · clases devueltas");
  });
});

/**
 * The card's own weekday (#243), Lun=0..Dom=6 — reads the LOCAL calendar date `parseDay`
 * resolves, never `card.startsAtIso`: that is an absolute instant, and an evening class can sit
 * on the far side of UTC midnight from the gym's own calendar day (2026-06-17 is a Wednesday,
 * same fixture date the rest of this file's `dto()` default uses).
 */
describe("diaSemanaDe", () => {
  it("maps Lun..Sáb to this app's 0..5 indexing (WEEKDAY_TOGGLES, groupDias)", () => {
    expect(diaSemanaDe("2026-06-15")).toBe(0); // lunes
    expect(diaSemanaDe("2026-06-17")).toBe(2); // miércoles
    expect(diaSemanaDe("2026-06-18")).toBe(3); // jueves
    expect(diaSemanaDe("2026-06-20")).toBe(5); // sábado
  });

  it("maps domingo to 6 — past this app's 0-5 class-day range, but a real calendar day", () => {
    expect(diaSemanaDe("2026-06-21")).toBe(6);
  });
});

/**
 * The tap-time branch (#238): which of the two write paths the operator's pick fires. The rule
 * itself is the domain predicate; this is the wiring in front of it — a correct rule routed to
 * the wrong callback is exactly what this catches. `ahora` is passed in because the caller
 * reads the clock INSIDE the tap handler, never at render.
 */
describe("accionAgregar", () => {
  const INICIO = "2026-06-17T14:00:00.000Z";

  it("books while the class has not started — the phone call for tomorrow's class", () => {
    expect(accionAgregar(INICIO, new Date("2026-06-16T20:00:00.000Z"))).toBe("reservar");
    expect(accionAgregar(INICIO, new Date("2026-06-17T12:00:00.000Z"))).toBe("reservar");
  });

  it("still books inside the ±90-min arrival window (owner ruling 2026-09-02)", () => {
    // The old rule flipped to "pase" at 12:30Z. An early arrival is now booked, then marked
    // present — the arrival window keeps owning the pasa-lista preselect, not this button.
    expect(accionAgregar(INICIO, new Date("2026-06-17T12:30:00.000Z"))).toBe("reservar");
    expect(accionAgregar(INICIO, new Date("2026-06-17T13:00:00.000Z"))).toBe("reservar");
  });

  it("books up to the last instant before the class starts", () => {
    expect(accionAgregar(INICIO, new Date("2026-06-17T13:59:00.000Z"))).toBe("reservar");
    expect(accionAgregar(INICIO, new Date("2026-06-17T13:59:59.999Z"))).toBe("reservar");
  });

  it("records a visita from the START instant on — the RPC's own 'La clase ya comenzó' edge", () => {
    expect(accionAgregar(INICIO, new Date("2026-06-17T14:00:00.000Z"))).toBe("pase");
    expect(accionAgregar(INICIO, new Date("2026-06-17T14:00:00.001Z"))).toBe("pase");
  });

  it("a tap AFTER the start under a stale RESERVA label still checks in — never a false booking", () => {
    // The sheet was rendered at 13:59 (label: AGREGAR RESERVA) and tapped at 14:01.
    expect(accionAgregar(INICIO, new Date("2026-06-17T14:01:00.000Z"))).toBe("pase");
  });

  it("stays on the check-in side long past the class — the branch never wraps back", () => {
    expect(accionAgregar(INICIO, new Date("2026-06-18T09:00:00.000Z"))).toBe("pase");
  });
});

/**
 * Which refusals a SALE fixes (#235 story 10). The strings are our own `raise exception` literals,
 * so exact match is the contract — and the negative cases are what matter: offering VENDER on a
 * full class or a duplicate booking sends the operator to charge a member for nothing.
 */
describe("esBloqueoVendible", () => {
  it("catches both sellable walls — an empty balance and a lapsed vigencia", () => {
    expect(esBloqueoVendible("Sin clases disponibles")).toBe(true);
    expect(esBloqueoVendible("Paquete vencido")).toBe(true);
  });

  it.each([
    "Clase llena",
    "Ya reservaste esta clase",
    "La clase ya comenzó",
    "No autorizado",
    "Cliente no encontrado",
  ])("refuses '%s' — no paquete on earth changes that fact", (error) => {
    expect(esBloqueoVendible(error)).toBe(false);
  });

  it("is exact, never fuzzy: an empty string and a near-miss are both no", () => {
    expect(esBloqueoVendible("")).toBe(false);
    expect(esBloqueoVendible("paquete vencido")).toBe(false);
  });
});

/**
 * The blocked pick's bridge (#235 story 10) — and this IS the line's visibility: `null` renders
 * nothing. Both halves must hold, because each failure mode is its own bug: a non-sellable refusal
 * would sell against a full class, and an unnamed member would offer an anonymous VENDER.
 */
describe("sugerenciaVenta", () => {
  const MARISA = { id: "c1", nombre: "Marisa Rangel" };

  it("names the blocked member and deep-links the sale that unblocks them (#77)", () => {
    expect(sugerenciaVenta("Sin clases disponibles", MARISA)).toEqual({
      nombre: "Marisa Rangel",
      href: "/vender?cliente=c1",
    });
  });

  it("bridges an expired package the same way — one wall, one answer", () => {
    expect(sugerenciaVenta("Paquete vencido", MARISA)?.href).toBe("/vender?cliente=c1");
  });

  it("stays silent on a refusal a sale cannot fix", () => {
    expect(sugerenciaVenta("Clase llena", MARISA)).toBeNull();
  });

  it("stays silent when the picker can no longer name the member", () => {
    expect(sugerenciaVenta("Paquete vencido", undefined)).toBeNull();
  });
});
