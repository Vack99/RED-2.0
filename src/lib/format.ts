/** es-MX peso formatting and small text helpers. */

export function pesos(n: number | null | undefined): string {
  return "$" + (n ?? 0).toLocaleString("es-MX");
}

export function firstName(nombre: string): string {
  return (nombre || "").trim().split(/\s+/)[0] || "";
}

/** Up-to-two-letter avatar initials from a name (e.g. "Coach JC" -> "CJ"). */
export function iniciales(nombre: string): string {
  return (
    (nombre || "")
      .trim()
      .split(/\s+/)
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
  return (raw || "").replace(/\D/g, "");
}

/** True when `raw` carries exactly TEL_DIGITS digits (the canonical MX rule). */
export function isTelValido(raw: string): boolean {
  return telDigits(raw).length === TEL_DIGITS;
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
