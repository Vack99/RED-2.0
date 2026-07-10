/** es-MX peso formatting and small text helpers. */

// Hoisted once — Intl object construction is the expensive part, so a single
// reused formatter beats `(n).toLocaleString("es-MX")` per call (js-hoist-intl).
// `pesos` is the single home for the peso string; every screen formats money
// through it (never an inline toLocaleString) so grouping/locale live in one place.
const PESO_FMT = new Intl.NumberFormat("es-MX");

/** Hoisted regexes — created once, not per call. Both are used only with
 *  `.replace`/`.split` (no `.test`/`.exec`), so the `g`-flag `lastIndex` trap
 *  does not apply. */
const NON_DIGIT = /\D/g;
const WHITESPACE = /\s+/;

export function pesos(n: number | null | undefined): string {
  return "$" + PESO_FMT.format(n ?? 0);
}

export function firstName(nombre: string): string {
  return (nombre || "").trim().split(WHITESPACE)[0] || "";
}

/** Up-to-two-letter avatar initials from a name (e.g. "Coach JC" -> "CJ"). */
export function iniciales(nombre: string): string {
  return (
    (nombre || "")
      .trim()
      .split(WHITESPACE)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

/**
 * Phone intake rule — the single home for "what is a valid tel".
 * A valid MX mobile is EXACTLY 10 digits once non-digits are stripped. Every
 * layer (form, Zod, the DB CHECK) must state this one rule, never its own.
 */
export const TEL_DIGITS = 10;

/** Strip every non-digit character from a raw phone string. */
export function telDigits(raw: string): string {
  return (raw || "").replace(NON_DIGIT, "");
}

/** True when `raw` carries exactly TEL_DIGITS digits (the canonical MX rule). */
export function isTelValido(raw: string): boolean {
  return telDigits(raw).length === TEL_DIGITS;
}

/**
 * Email intake rule — the single home for "what does a plausible email look like", mirroring
 * `isTelValido`'s role. A pragmatic client-side gate (enables/disables a Save button); the DAL's
 * `z.string().email()` is the real validation authority (design 2026-07-08 §4 — this surface is an
 * edit, not a sale, so it validates; the sale-path `email` field (crearVentaSchema) stays deliberately unvalidated).
 */
export function isEmailValido(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim());
}

/**
 * Build a wa.me deep link (defaults to the Mexico country code, 52). Callers
 * must pass a tel already validated by isTelValido — this does not re-check
 * length, so a malformed tel yields a malformed link.
 */
export function waLink(tel: string, text: string): string {
  const digits = telDigits(tel);
  const phone = digits.startsWith("52") ? digits : "52" + digits;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
