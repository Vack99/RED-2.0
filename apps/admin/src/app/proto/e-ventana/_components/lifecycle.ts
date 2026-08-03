// apps/admin/src/app/proto/e-ventana/_components/lifecycle.ts — THROWAWAY
// (see ../page.tsx). Variant E's ENTIRE model, in one file, read by both
// screens so the directory and the dashboard can never disagree with each
// other about who is who.
//
// Nothing here is designed. Every threshold below was derived from public
// help-centre documentation only — no account, login, or product access to
// any vendor was used. Every rule is transcribed from
// docs/Context/2026-08-01-181-vendor-directory-segmentation.md:
//
//  · ESTADO — Fitco. `Cliente Activo` = "cuenta con una membresía activa en
//    este momento"; `Cliente Inactivo` = "en algún momento tuvo una membresía
//    activa pero actualmente no cuenta con ningún beneficio". Derived from
//    membership validity on BOTH axes — date AND session count — and Fitco has
//    no `dar de baja` verb at all (#181 D4). It renders as a per-row COLUMN
//    (`Nombre, Correo, Estado, Pago, Marcar entrada`), never as a section.
//
//  · RENOVACION_DIAS = 10 — the pre-expiry window. #181 C5 shows every vendor
//    names this surface but they do not agree on its width (Connect Gym buckets
//    today/1/3/5, CrossHero's `Caduca Pronto` is 14). The owner ruled 10 on
//    2026-08-02, and this constant is now the SINGLE source of truth for
//    "por renovar" across the whole product — see the handoff on #187.
//
//  · RECUPERAR_DIAS = 15 — Fitco `Clientes por Recuperar`, the sharpest
//    artefact in the whole scan: two arms (expired by date, days 1–15; and
//    sessions ran out, days 1–15) and a hard horizon —
//    «Después de 16 días, los clientes ya no aparecen» (#181 D6).
//
//  · AUSENTE_DIAS = 15 — TeamUp `Slipping Away`, its own example threshold,
//    corroborated by Wodify's "Clients without Sign Ins (15 Days)" (#181 D5).
//    TeamUp arbitrates the two clocks explicitly: "Customers who have an
//    active membership… can have a Slipping Away status… however, they can
//    not become 'Inactive'." Hence the `activa &&` guard below — and hence it
//    is a BADGE. #181 C3: twelve vendors model attendance recency, zero rank
//    the directory on it; the closest anyone comes is Wodify's red ring on an
//    avatar.

import type { RosterClient } from "../../_fixtures";

/** The pre-expiry window. Owner ruling 2026-08-02: 10 días, and this is the
 *  ONE predicate `por renovar` may mean anywhere in the product. */
export const RENOVACION_DIAS = 10;
/** Fitco's post-expiry horizon (`Clientes por Recuperar`). Day 16 = gone. */
export const RECUPERAR_DIAS = 15;
/** TeamUp's `Slipping Away` clock, measured on people who still HAVE a package. */
export const AUSENTE_DIAS = 15;
/** Fitco's second `Próximas Renovaciones` arm: "those with 1 session left". */
export const RENOVACION_CLASES = 1;

/** Which of the two axes ended the membership. Fitco tiers them separately and
 *  `urgenciaCliente` collapses them; that collapse is the thing this variant
 *  refuses to inherit. */
export type Eje = "fecha" | "clases";

export interface Fila {
  c: RosterClient;
  /** Fitco's `Estado` column value. */
  activa: boolean;
  /** null while `activa`. */
  eje: Eje | null;
  /** Whole days since the membership stopped being usable, on whichever axis
   *  ended it first. null while `activa`, or when the roster can't say (a spent
   *  pass on someone with no recorded visit). */
  diasDesdeFin: number | null;
  /** Tile 1 — Fitco `Próximas Renovaciones`. */
  renovar: boolean;
  /** Tile 2 — Fitco `Clientes por Recuperar`, days 1–15 only. */
  aTiempo: boolean;
  /** Past Fitco's day-16 horizon: reachable by SEARCH and nothing else. */
  fueraDeAlcance: boolean;
  /** TeamUp `Slipping Away`. Never a tier, never a count, never a sort key. */
  ausente: boolean;
}

function clasesNum(c: RosterClient): number {
  return c.clasesRest === "ilimitado" ? Infinity : c.clasesRest;
}

export function derivar(c: RosterClient): Fila {
  const vencioFecha = c.diasRest < 0;
  const sinClases = clasesNum(c) <= 0;
  const activa = !vencioFecha && !sinClases;

  // Days elapsed on each axis, then whichever ended EARLIER wins the label —
  // a pass spent three weeks before its dates run out ended on the class axis.
  // A spent pass ends the day it was consumed, which is the last visit.
  const desdeFecha = vencioFecha ? -c.diasRest : null;
  const desdeClases = sinClases ? c.diasSinVenir : null;
  const eje: Eje | null = activa
    ? null
    : (desdeClases ?? -1) > (desdeFecha ?? -1)
      ? "clases"
      : vencioFecha
        ? "fecha"
        : "clases";
  const diasDesdeFin = activa ? null : eje === "fecha" ? desdeFecha : desdeClases;

  const dentro = diasDesdeFin != null && diasDesdeFin >= 1 && diasDesdeFin <= RECUPERAR_DIAS;

  return {
    c,
    activa,
    eje,
    diasDesdeFin,
    renovar: activa && (c.diasRest <= RENOVACION_DIAS || clasesNum(c) <= RENOVACION_CLASES),
    aTiempo: !activa && dentro,
    fueraDeAlcance: !activa && !dentro,
    // The arbitration, verbatim from TeamUp: a paid-up member can be slipping
    // away; someone without an active package can only be inactive.
    ausente: activa && c.diasSinVenir != null && c.diasSinVenir >= AUSENTE_DIAS,
  };
}

/** ORDERING, not grouping. Three keys over ONE flat list — no headers, no
 *  disclosure, nothing relocated (#181 D1 answer A: Gymflow, Glofox, Fitco and
 *  Arketa are exactly the four vendors with no declared "gone" lever, and all
 *  four keep one list where the label simply flips).
 *
 *  1. actionable first  — soonest expiry first
 *  2. then current      — soonest expiry first
 *  3. then inactive LAST, most-recently-ended first, which inverts today's
 *     `a.diasRest - b.diasRest` (the deadest row is permanently row 1). */
export function ordenar(filas: Fila[]): Fila[] {
  const grupo = (f: Fila) => (f.renovar ? 0 : f.activa ? 1 : 2);
  return filas.toSorted(
    (a, b) =>
      grupo(a) - grupo(b) ||
      (a.activa
        ? a.c.diasRest - b.c.diasRest
        : (a.diasDesdeFin ?? Infinity) - (b.diasDesdeFin ?? Infinity)),
  );
}

/** Connect Gym's `Membresías por Vencer` buckets, OBSERVED on their own
 *  product screenshot: today / tomorrow / 3 days / 5 days. Exact ranges, so
 *  they partition the tile's own set instead of nesting cumulative counts. */
export const CUBOS: { l: string; test: (d: number) => boolean }[] = [
  { l: "HOY", test: (d) => d === 0 },
  { l: "MAÑANA", test: (d) => d === 1 },
  { l: "2–3 D", test: (d) => d >= 2 && d <= 3 },
  { l: "4–5 D", test: (d) => d >= 4 && d <= 5 },
  { l: `6–${RENOVACION_DIAS} D`, test: (d) => d >= 6 && d <= RENOVACION_DIAS },
];

/** Diacritic-folded, so `chavez` finds Chávez — 13 of the live 30 are accented
 *  and today's box matches 0 of 4 (#184 defect 1). Phones match on digits, so
 *  a number pasted as "614 123 45 10" still lands. */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function digits(s: string): string {
  return s.replace(/\D/g, "");
}

export function coincide(f: Fila, q: string): boolean {
  const qf = fold(q);
  const qd = digits(q);
  return fold(f.c.nombre).includes(qf) || (qd.length > 0 && digits(f.c.tel ?? "").includes(qd));
}
