// apps/admin/src/app/proto/_fixtures.ts
//
// THROWAWAY — see apps/admin/src/app/proto/page.tsx. Single source of roster
// data for every /proto variant (hard rule #5: no variant may define its own
// roster, or the comparison is worthless).
//
// Reproduces RED's measured LIVE shape, verified against prod 2026-08-01/02
// (docs/Context/2026-08-01-184-clientes-cross-examination.md +
// -185-forge-operator-week.md, map #180): 30 members, 13 expired (-44…-8
// días, every one of them on Mensualidad Ilimitada — #184 finding 6), 5 spent
// one-off passes (0 clases, days still on the clock — NOT renewal targets),
// exactly 4 genuinely actionable (1-7 días left on a live package — "the real
// queue is 4, not 22"), and ONE Hector-shaped row: ilimitado, paid up, 12
// días left, unseen for 24 — the single real risk today's page renders calm
// (#185). Running the real derivarEstado/urgenciaCliente over this data
// reproduces the docs' own measured numbers almost exactly: 10 vigentes, 19
// crítico + 3 urgente ("por renovar" = 22, header sums to 32 of 30, k=2).

import { addDays, fmtShort, iniciales, isoDay } from "@gym/format";
import { derivarEstado } from "@gym/domain/rules";
import type { Clases } from "@gym/domain/types";
import type { ClienteRosterDTO } from "@gym/data/server/clientes";

/** ClienteRosterDTO plus the two attendance-recency facts the lifecycle
 *  doctrine needs but the roster DTO doesn't ship today (#183 signal
 *  inventory: last-visit is one query away, not yet wired to the roster). */
export interface RosterClient extends ClienteRosterDTO {
  /** Whole days since the last visit, or null if never attended. */
  diasSinVenir: number | null;
  /** ISO ("YYYY-MM-DD") date of the last visit, or null if never attended. */
  ultimaVisita: string | null;
}

// Fixed anchor so every variant renders the IDENTICAL roster regardless of
// the day it's opened. diasRest/diasSinVenir are already-computed fields
// here, exactly like the real DTO — nothing below is derived from a live
// clock.
const HOY = new Date(2026, 7, 2); // 2026-08-02

function vence(diasRest: number): string {
  return fmtShort(addDays(HOY, diasRest));
}

function visita(diasSinVenir: number | null): string | null {
  return diasSinVenir == null ? null : isoDay(addDays(HOY, -diasSinVenir));
}

const ILIMITADO = "Mensualidad Ilimitada";
const CLASE_SUELTA = "Clase Individual";

type Invite = RosterClient["invitacion"];
const SIN_INVITAR: Invite = { estado: "sin_invitar", badge: "Sin invitar" };

interface Seed {
  id: string;
  nombre: string;
  tel: string;
  clases: Clases;
  paquete: string;
  diasRest: number;
  diasSinVenir: number | null;
  asistEsteMes: number;
  invitacion?: Invite;
}

const SEEDS: Seed[] = [
  // ── 13 expired, all ilimitado (#184 finding 6: every expired RED row is
  //    on Mensualidad Ilimitada) — diasRest -44…-8. ──
  { id: "f-01", nombre: "María Fernanda López", tel: "", clases: "ilimitado", paquete: ILIMITADO, diasRest: -44, diasSinVenir: 49, asistEsteMes: 0 },
  { id: "f-02", nombre: "Jaime Hernandez", tel: "6141234501", clases: "ilimitado", paquete: ILIMITADO, diasRest: -41, diasSinVenir: 45, asistEsteMes: 0 },
  { id: "f-03", nombre: "Alejandro Peña", tel: "6141234502", clases: "ilimitado", paquete: ILIMITADO, diasRest: -38, diasSinVenir: 44, asistEsteMes: 0 },
  { id: "f-04", nombre: "Carlos Ramirez", tel: "", clases: "ilimitado", paquete: ILIMITADO, diasRest: -35, diasSinVenir: null, asistEsteMes: 0 },
  { id: "f-05", nombre: "Iván González", tel: "6141234503", clases: "ilimitado", paquete: ILIMITADO, diasRest: -32, diasSinVenir: 38, asistEsteMes: 0 },
  { id: "f-06", nombre: "Miguel Torres", tel: "6141234504", clases: "ilimitado", paquete: ILIMITADO, diasRest: -29, diasSinVenir: 33, asistEsteMes: 0 },
  { id: "f-07", nombre: "Itzel Sáenz", tel: "", clases: "ilimitado", paquete: ILIMITADO, diasRest: -26, diasSinVenir: 30, asistEsteMes: 0 },
  { id: "f-08", nombre: "Fernando Castro", tel: "6141234505", clases: "ilimitado", paquete: ILIMITADO, diasRest: -23, diasSinVenir: 29, asistEsteMes: 0 },
  { id: "f-09", nombre: "Andrés Nuñez", tel: "6141234506", clases: "ilimitado", paquete: ILIMITADO, diasRest: -20, diasSinVenir: 23, asistEsteMes: 0 },
  { id: "f-10", nombre: "Patricia Flores", tel: "", clases: "ilimitado", paquete: ILIMITADO, diasRest: -17, diasSinVenir: null, asistEsteMes: 0 },
  { id: "f-11", nombre: "Yesenia Núñez", tel: "6141234507", clases: "ilimitado", paquete: ILIMITADO, diasRest: -14, diasSinVenir: 17, asistEsteMes: 0 },
  { id: "f-12", nombre: "Gabriel Ortiz", tel: "6141234508", clases: "ilimitado", paquete: ILIMITADO, diasRest: -11, diasSinVenir: 14, asistEsteMes: 0 },
  { id: "f-13", nombre: "Raúl Ávila", tel: "6141234509", clases: "ilimitado", paquete: ILIMITADO, diasRest: -8, diasSinVenir: 11, asistEsteMes: 0 },

  // ── 5 spent one-off passes: 0 clases, days still on the clock. NOT
  //    renewal targets (#184 §0) — they were never members. ──
  { id: "f-14", nombre: "Brenda Chávez", tel: "6141234510", clases: 0, paquete: CLASE_SUELTA, diasRest: 18, diasSinVenir: 12, asistEsteMes: 0 },
  { id: "f-15", nombre: "Adrián Muñoz", tel: "6141234511", clases: 0, paquete: CLASE_SUELTA, diasRest: 15, diasSinVenir: 15, asistEsteMes: 0 },
  { id: "f-16", nombre: "Laura Sanchez", tel: "6141234512", clases: 0, paquete: CLASE_SUELTA, diasRest: 17, diasSinVenir: 13, asistEsteMes: 0 },
  { id: "f-17", nombre: "Monica Reyes", tel: "", clases: 0, paquete: CLASE_SUELTA, diasRest: 20, diasSinVenir: 10, asistEsteMes: 0 },
  { id: "f-18", nombre: "Ricardo Vargas", tel: "", clases: 0, paquete: CLASE_SUELTA, diasRest: 22, diasSinVenir: 8, asistEsteMes: 0 },

  // ── The real queue: 4 genuinely actionable rows, 1-7 días left on a live
  //    ilimitado package (#184: "the real queue is 4, not 22"). ──
  { id: "f-19", nombre: "Diana Hernández", tel: "6141234513", clases: "ilimitado", paquete: ILIMITADO, diasRest: 1, diasSinVenir: 0, asistEsteMes: 10, invitacion: { estado: "cuenta_activa", badge: "Cuenta activa" } },
  { id: "f-20", nombre: "Verónica Barrera", tel: "6141234514", clases: "ilimitado", paquete: ILIMITADO, diasRest: 4, diasSinVenir: 1, asistEsteMes: 9 },
  { id: "f-21", nombre: "Sofía Rodríguez", tel: "", clases: "ilimitado", paquete: ILIMITADO, diasRest: 6, diasSinVenir: 2, asistEsteMes: 8 },
  { id: "f-22", nombre: "Roberto Dominguez", tel: "6141234515", clases: "ilimitado", paquete: ILIMITADO, diasRest: 7, diasSinVenir: 3, asistEsteMes: 11, invitacion: { estado: "invitacion_enviada", badge: "Invitada 20 jul" } },

  // ── Pronto (8-14 días). Hector is the map's whole point: ilimitado, paid
  //    up, 12 días left, unseen for 24 — and it renders CALM today. ──
  { id: "f-23", nombre: "Hector Delgado", tel: "6141234516", clases: "ilimitado", paquete: ILIMITADO, diasRest: 12, diasSinVenir: 24, asistEsteMes: 0 },
  { id: "f-24", nombre: "Guadalupe Márquez", tel: "6141234517", clases: "ilimitado", paquete: ILIMITADO, diasRest: 9, diasSinVenir: 2, asistEsteMes: 9 },
  { id: "f-25", nombre: "Daniela Morales", tel: "", clases: "ilimitado", paquete: ILIMITADO, diasRest: 10, diasSinVenir: 4, asistEsteMes: 8 },
  { id: "f-26", nombre: "Eduardo Salazar", tel: "6141234518", clases: "ilimitado", paquete: ILIMITADO, diasRest: 13, diasSinVenir: 5, asistEsteMes: 7 },

  // ── Comfortably active, ilimitado, > 14 días left. ──
  { id: "f-27", nombre: "Karla Jimenez", tel: "6141234519", clases: "ilimitado", paquete: ILIMITADO, diasRest: 20, diasSinVenir: 3, asistEsteMes: 7, invitacion: { estado: "cuenta_activa", badge: "Cuenta activa" } },
  { id: "f-28", nombre: "Francisco Aguilar", tel: "", clases: "ilimitado", paquete: ILIMITADO, diasRest: 25, diasSinVenir: 1, asistEsteMes: 9 },
  { id: "f-29", nombre: "Beatriz Cordero", tel: "6141234520", clases: "ilimitado", paquete: ILIMITADO, diasRest: 28, diasSinVenir: 6, asistEsteMes: 6 },
  { id: "f-30", nombre: "Sergio Paredes", tel: "6141234521", clases: "ilimitado", paquete: ILIMITADO, diasRest: 30, diasSinVenir: 2, asistEsteMes: 8, invitacion: { estado: "invitacion_enviada", badge: "Invitada 05 jul" } },
];

function build(seed: Seed): RosterClient {
  const { clases: clasesRest, diasRest } = seed;
  return {
    id: seed.id,
    nombre: seed.nombre,
    tel: seed.tel,
    inicial: iniciales(seed.nombre),
    paquete: seed.paquete,
    estado: derivarEstado({ clases: clasesRest, dias: diasRest }),
    diasRest,
    venceDisplay: vence(diasRest),
    clasesRest,
    clasesRestLabel: clasesRest === "ilimitado" ? "∞" : String(clasesRest),
    asistEsteMes: seed.asistEsteMes,
    invitacion: seed.invitacion ?? SIN_INVITAR,
    pendienteOnline: false,
    diasSinVenir: seed.diasSinVenir,
    ultimaVisita: visita(seed.diasSinVenir),
  };
}

/** RED's measured live shape (30 members) — see file header. Every /proto
 *  variant renders THIS array; never define a second roster. */
export const ROSTER_30: RosterClient[] = SEEDS.map(build);

/** Scale check (map #180: "judge any doctrine at 30 and at 500"). Cycles the
 *  same 30 profiles so every proportion holds exactly, re-suffixing
 *  id/nombre past the first cycle so rows stay unique. */
export function makeRoster(n: number): RosterClient[] {
  return Array.from({ length: n }, (_, i) => {
    const base = ROSTER_30[i % ROSTER_30.length];
    const cycle = Math.floor(i / ROSTER_30.length);
    return cycle === 0 ? base : { ...base, id: `${base.id}-${cycle}`, nombre: `${base.nombre} (${cycle + 1})` };
  });
}
