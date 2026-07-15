import type { PaqueteSeleccion } from "@gym/data/server/ventas";
import { addDays, isTelValido, parseDay, telDigits, toIsoDay } from "@gym/format";

/** The NUEVO/EXISTENTE toggle — the two sale doors. */
type Mode = "new" | "existing";

/**
 * Inline tel error for the NUEVO phone field (#48). An over-long number (>10
 * digits) is wrong the instant it is typed, so it shows immediately; a partial
 * 1–9 digits is only "wrong" once the operator has left the field (blurred).
 * Empty (0 digits) and a complete 10-digit number never error.
 */
export function telError(tel: string, blurred: boolean): string | null {
  const n = telDigits(tel).length;
  if (n > 10) return "El teléfono debe tener 10 dígitos.";
  if (blurred && n >= 1 && n < 10) return "El teléfono debe tener 10 dígitos.";
  return null;
}

/**
 * CLIENTE-section completion — the CONTINUAR enablement. NUEVO needs a ≥3-char
 * name and a valid 10-digit tel; EXISTENTE needs a picked client. Email is
 * deliberately absent from the signature: it can never gate the sale (#64 —
 * the email is the invite trigger, optional, never a blocker).
 */
export function clienteListo(
  mode: Mode,
  nombre: string,
  tel: string,
  hasExisting: boolean,
): boolean {
  return mode === "new" ? nombre.trim().length >= 3 && isTelValido(tel) : hasExisting;
}

/** The custom tile's id in `sel`. A sentinel, not a uuid — it can never collide with
 *  a real paquete id, and it keeps `sel` a single string instead of a second state. */
export const PERSONALIZADO = "__personalizado__";

/** Bounds (spec D6). Mirrored in the RPC, which is the real trust boundary — these
 *  exist so the operator learns about a typo before the round trip, not instead of it. */
export const LIMITES = {
  nombreMin: 3,
  nombreMax: 40,
  precioMin: 1,
  precioMax: 100_000,
  clasesMin: 1,
  clasesMax: 365,
  diasMin: 1,
  diasMax: 365,
} as const;

/** Backdate look-back cap (spec D1/D2): a flat 30 days — the same vocabulary the renewal flow
 *  uses, chosen to keep a backdate recent. NOT a strict Resumen-window guarantee: across a
 *  short-month (Feb) boundary a ~30-day backdate can land just before the rolling
 *  current+prior-month tile. The sale is still written to its true effective date, so its
 *  revenue is booked to that day's real calendar month and shown in that month's respaldo
 *  export. The RPC enforces the cap too (the real gate). */
export const BACKDATE_MAX_DIAS = 30;

/**
 * The earliest sold date the backdate picker allows — `max(today − 30, the client's alta)`,
 * as a gym-tz "YYYY-MM-DD". `altaIso` is the existing client's creation day; pass `null` for a
 * NUEVO sale (no alta yet — the RPC exempts a client created in the same txn, so only the
 * 30-day floor applies). Mirrors the RPC's bound 2 (cap) + bound 3 (≥ alta); the RPC is the
 * trust boundary, this only keeps an out-of-range day untappable.
 */
export function inicioMinIso(hoyIso: string, altaIso: string | null): string {
  const floor = toIsoDay(addDays(parseDay(hoyIso), -BACKDATE_MAX_DIAS));
  // ISO "YYYY-MM-DD" compares lexicographically == chronologically.
  return altaIso && altaIso > floor ? altaIso : floor;
}

/**
 * Clamp a picked sold date into `[inicioMin, hoy]` and report whether it is a real backdate.
 * The stored pick can fall out of range when the operator changes the selected client after
 * picking a date (a later alta raises the floor); rather than reset it eagerly at every client
 * set-site, the effective date silently reverts to today, so the label, preview, confirm line
 * and submit all agree on what will actually be sent.
 */
export function inicioEfectivo(
  pickIso: string,
  hoyIso: string,
  altaIso: string | null,
): { iso: string; backdate: boolean } {
  const min = inicioMinIso(hoyIso, altaIso);
  const iso = pickIso >= min && pickIso <= hoyIso ? pickIso : hoyIso;
  return { iso, backdate: iso !== hoyIso };
}

/** The form holds strings — that is what an <Input> gives you. Parsing lives here, so
 *  "12abc", "" and "750.5" all have one tested behavior instead of three at the call sites. */
export interface CustomForm {
  nombre: string;
  precio: string;
  clases: string;
  ilimitado: boolean;
  dias: string;
}

export const CUSTOM_VACIO: CustomForm = {
  nombre: "",
  precio: "",
  clases: "",
  ilimitado: false,
  dias: "",
};

export interface CustomErrors {
  nombre: string | null;
  precio: string | null;
  clases: string | null;
  dias: string | null;
}

/** Strict positive integer parse: rejects "", "abc", "750.5", "-1" and "1e3". */
function entero(s: string): number | null {
  const t = s.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : null;
}

function rangoError(s: string, min: number, max: number, etiqueta: string): string | null {
  const n = entero(s);
  if (n === null) return `${etiqueta} debe ser un número entero.`;
  if (n < min || n > max) return `${etiqueta} debe estar entre ${min} y ${max}.`;
  return null;
}

/**
 * Per-field errors for the PERSONALIZADO form. A field that is still empty and has
 * not been blurred stays quiet — the operator should not be scolded for a field they
 * have not reached yet. Same discipline as telError (#48).
 *
 * The `clases` field is skipped entirely when `ilimitado` is on: it is not merely
 * optional then, it is meaningless (a null grant IS the ilimitado value).
 */
export function customErrors(
  f: CustomForm,
  blurred: Partial<Record<keyof CustomErrors, boolean>>,
): CustomErrors {
  const quieto = (campo: keyof CustomErrors, valor: string) =>
    valor.trim() === "" && !blurred[campo];

  const nombre = (() => {
    if (quieto("nombre", f.nombre)) return null;
    const n = f.nombre.trim().length;
    if (n < LIMITES.nombreMin || n > LIMITES.nombreMax)
      return `El nombre debe tener entre ${LIMITES.nombreMin} y ${LIMITES.nombreMax} caracteres.`;
    return null;
  })();

  const precio = quieto("precio", f.precio)
    ? null
    : rangoError(f.precio, LIMITES.precioMin, LIMITES.precioMax, "El precio");

  const clases = f.ilimitado
    ? null
    : quieto("clases", f.clases)
      ? null
      : rangoError(f.clases, LIMITES.clasesMin, LIMITES.clasesMax, "El número de clases");

  const dias = quieto("dias", f.dias)
    ? null
    : rangoError(f.dias, LIMITES.diasMin, LIMITES.diasMax, "La vigencia");

  return { nombre, precio, clases, dias };
}

/** Complete AND in bounds — the COBRAR gate for a custom package. Checks every field
 *  as though blurred, so an untouched empty form is invalid (not merely quiet). */
export function customValido(f: CustomForm): boolean {
  const e = customErrors(f, { nombre: true, precio: true, clases: true, dias: true });
  return !e.nombre && !e.precio && !e.clases && !e.dias;
}

/** PAQUETE-section completion. A registered plan is done the moment it is picked; the
 *  custom tile is done only once its form validates. */
export function paqueteListo(sel: string | null, f: CustomForm): boolean {
  if (sel === PERSONALIZADO) return customValido(f);
  return !!sel;
}

/** The one price the footer renders — CountUp and the COBRAR label read this for both
 *  branches. Null renders the "$—" placeholder. */
export function precioSeleccionado(
  sel: string | null,
  precioPaq: number | null,
  f: CustomForm,
): number | null {
  if (sel === PERSONALIZADO) return customValido(f) ? entero(f.precio) : null;
  return precioPaq;
}

/** The wire payload. Only call with a form that `customValido` accepts — the non-null
 *  assertions below are safe exactly then, and zod re-checks at the server boundary.
 *
 *  Return type is the "personalizado" arm, not the full `PaqueteSeleccion` union — the
 *  literal `tipo` below always narrows there, and callers that read `.nombre`/`.clases`
 *  directly (as the tests do) get that without an extra guard. Still structurally
 *  assignable anywhere a `PaqueteSeleccion` is expected. */
export function customSeleccion(f: CustomForm): Extract<PaqueteSeleccion, { tipo: "personalizado" }> {
  return {
    tipo: "personalizado",
    nombre: f.nombre.trim(),
    precio: entero(f.precio)!,
    clases: f.ilimitado ? null : entero(f.clases)!,
    dias: entero(f.dias)!,
  };
}
