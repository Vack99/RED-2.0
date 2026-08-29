/** es-MX peso formatting and small text helpers. */

// Hoisted once — Intl object construction is the expensive part, so a single
// reused formatter beats `(n).toLocaleString("es-MX")` per call (js-hoist-intl).
// `pesos` is the single home for the peso string; every screen formats money
// through it (never an inline toLocaleString) so grouping/locale live in one place.
const PESO_FMT = new Intl.NumberFormat("es-MX");

/** Hoisted regexes — created once, not per call. All three are used only with
 *  `.replace`/`.split` (no `.test`/`.exec`), so the `g`-flag `lastIndex` trap
 *  does not apply. */
const NON_DIGIT = /\D/g;
const WHITESPACE = /\s+/;
const DIACRITIC = /\p{Diacritic}/gu;

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
 * Accent-insensitive search fold: lowercase + strip Unicode diacritics, so
 * "chavez" and "Chávez" fold to the same "chavez" (#224 — roster search).
 * Apply this to BOTH the typed query and the candidate text at a search
 * seam; never to a sort key — sort must stay accent-correct
 * (localeCompare), so this is search-only.
 */
export function foldDiacritics(s: string): string {
  return (s || "").normalize("NFD").replace(DIACRITIC, "").toLowerCase();
}

/**
 * Phone intake rule — the single home for "what is a valid tel".
 * A phone is OPTIONAL (#190), and a phone that IS given is EXACTLY 10 digits once
 * non-digits are stripped. This function owns only the second half; every layer
 * (form, Zod, the DB CHECK) must state that one rule, never its own. Whether
 * absence is allowed is each caller's own condition — the desk permits it, the
 * self-signup door does not — so `isTelValido` must never be widened to accept "",
 * or a half-typed number would pass everywhere.
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
 * zod schemas are the real validation authority (design 2026-07-08 §4).
 *
 * ASCII-only, both halves: Resend refuses any non-ASCII address outright (422 "The email address
 * contains non-ASCII characters"), so an accented or `ñ`-carrying address is not a stricter taste,
 * it is undeliverable — a desk operator typed `Ivanmontañez77@gmail.com` and the invite could never
 * be sent. `[!-?A-~]` is printable ASCII minus space and minus `@` (0x40), so the structure below is
 * the same local@domain.tld shape as before with the non-ASCII door closed.
 */
export function isEmailValido(raw: string): boolean {
  return /^[!-?A-~]+@[!-?A-~]+\.[!-?A-~]+$/.test(raw.trim());
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

/**
 * Pretty-print a raw MX phone string for DISPLAY — `+52 55 0000 0000`, not a bare `+` slapped on
 * whatever digits arrived (#256 review finding 5: both `apps/client/src/lib/aviso-legal.ts` and
 * the admin CUENTA preview independently did `` `+${whatsapp}` `` on `gym_contact.whatsapp`'s raw
 * E.164 digits, so the aviso de privacidad showed a member `+5216140000000` instead of a readable
 * number). Accepts `gym_contact.whatsapp`'s stored shape (bare 10-digit local, `52` + 10, or the
 * WhatsApp-style `521` + 10 mobile marker) and groups the local 10 digits `XX XXXX XXXX` — the
 * same 2-4-4 split the registro form's own phone placeholder already uses ("81 1234 5678"). Falls
 * back to `+<digits>` (today's behavior) for anything that doesn't reduce to a clean 10-digit MX
 * number, so a malformed value still displays rather than throwing.
 */
export function formatTelMx(raw: string): string {
  const digits = telDigits(raw);
  const local =
    digits.length === TEL_DIGITS
      ? digits
      : digits.startsWith("521") && digits.length === TEL_DIGITS + 3
        ? digits.slice(3)
        : digits.startsWith("52") && digits.length === TEL_DIGITS + 2
          ? digits.slice(2)
          : null;
  if (!local) return `+${digits}`;
  return `+52 ${local.slice(0, 2)} ${local.slice(2, 6)} ${local.slice(6, 10)}`;
}
