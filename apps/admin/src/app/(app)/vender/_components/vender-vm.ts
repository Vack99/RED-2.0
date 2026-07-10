import { isTelValido, telDigits } from "@gym/format";

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
