import type { PaqueteSeleccion } from "@gym/data/server/ventas";
import { addDays, foldDiacritics, isEmailValido, isTelValido, parseDay, telDigits, toIsoDay } from "@gym/format";

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
 * Inline error for the email field (NUEVO's invite target, EXISTENTE's C7 backfill).
 * Two-tier, exactly like `telError`'s `>10` arm: a HALF-TYPED ASCII address ("maria@") is
 * wrong on every keystroke, so it waits for blur; a NON-ASCII character is wrong on sight
 * and never becomes right by typing more, so it speaks immediately.
 *
 * Blur alone cannot carry it: `emailBlurred` lives in `ClienteEditor`, which
 * `AccordionSection` UNMOUNTS on collapse, so reopening CLIENTE re-seeds it to `false` and
 * a blur-only error would vanish while `clienteListo` keeps COBRAR dead with nothing but
 * "Falta cliente" — and a tap on an already-DISABLED button never fires a blur either.
 *
 * An empty field never errors: the sale does not want an email, it only refuses a bad one.
 */
export function emailError(email: string, blurred: boolean): string | null {
  const v = email.trim();
  if (v === "" || isEmailValido(v)) return null;
  // Shape errors wait for blur; a non-ASCII character shows at once.
  if (!blurred && !/[^\x20-\x7E]/.test(v)) return null;
  return "Correo inválido";
}

/**
 * CLIENTE-section completion — the CONTINUAR enablement. NUEVO needs a ≥3-char
 * name and, if a phone is typed at all, a complete one (#190 made the phone
 * optional; a half-typed 1–9 digits still blocks). EXISTENTE needs a picked
 * client. A MISSING email still never gates the sale (#64 — the email is the invite
 * trigger, optional); a TYPED one must be a well-formed ASCII address, in both modes.
 * This WIDENS spec §3.4 (decided 2026-08-29, 4b5432e): not just the `ñ` a desk operator
 * typed — which Resend refuses forever — but "maria@" too. An address that reaches
 * nobody buys an invite that can never be sent, and the operator only learns that days
 * later, from the ficha.
 */
export function clienteListo(
  mode: Mode,
  nombre: string,
  tel: string,
  hasExisting: boolean,
  email: string,
): boolean {
  if (email.trim() !== "" && !isEmailValido(email)) return false;
  return mode === "new"
    // Blank is tested on the trimmed STRING, not on the digit count, so this gate is the
    // same predicate crearVentaSchema's refine applies: a punctuation-only "-" is a typo the
    // server rejects, and enabling COBRAR on it would send the operator into a dead end.
    ? nombre.trim().length >= 3 && (tel.trim() === "" || isTelValido(tel))
    : hasExisting;
}

/**
 * NUEVO/EXISTENTE client-picker search predicate (#239): a name hit is
 * diacritic-folded on both sides; the tel arm only participates when `query`
 * carries at least one digit. Before this guard, a letters-only query (e.g.
 * "ana") stripped to "" via `telDigits`, and every string `.includes("")` —
 * so the tel arm matched EVERY client with a phone, and the picker showed the
 * full roster instead of a name-filtered one.
 */
export function pickerCoincide(c: { nombre: string; tel: string | null }, query: string): boolean {
  if (!query) return true;
  if (foldDiacritics(c.nombre).includes(foldDiacritics(query))) return true;
  const qDigits = telDigits(query);
  if (!qDigits) return false;
  return !!c.tel && telDigits(c.tel).includes(qDigits);
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
 * The earliest sold date the backdate picker allows — `today − 30`, as a gym-tz "YYYY-MM-DD".
 * Mirrors the RPC's own cap; the RPC is the trust boundary, this only keeps an out-of-range
 * day untappable. The alta floor was DROPPED (owner ruling 2026-08-14): a sale's fecha may
 * predate the client's alta, at both doors.
 */
export function inicioMinIso(hoyIso: string): string {
  return toIsoDay(addDays(parseDay(hoyIso), -BACKDATE_MAX_DIAS));
}

/**
 * Clamp a picked sold date into `[inicioMin, hoy]` and report whether it is a real backdate.
 * Defensive: `inicioPick` is UI-bounded to this same range, but a sheet left open across
 * midnight can leave a stale pick outside it once `hoy` advances — the effective date silently
 * reverts to today, so the label, preview, confirm line and submit all agree on what will
 * actually be sent.
 */
export function inicioEfectivo(pickIso: string, hoyIso: string): { iso: string; backdate: boolean } {
  const min = inicioMinIso(hoyIso);
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
