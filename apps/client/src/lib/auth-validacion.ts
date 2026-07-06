import { isTelValido } from "@gym/format";

/**
 * Pure inline-validation for the auth forms (entrar + registro + restablecer). The
 * screens render designed field errors rather than native HTML5 bubbles, so the
 * rule is this shared logic — one home, imported by the `_components` forms (a
 * screen never reaches into another screen's `_components`; ARCHITECTURE.md). Each
 * returns an es-MX error message or `null` when the value is acceptable.
 */

// Deliberately conservative: one @, a dot-delimited domain, no whitespace. The
// server (Supabase) is the real authority; this only catches obvious typos so a
// member sees "revisa el formato" instead of a failed round-trip.
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validarCorreo(email: string): string | null {
  const v = email.trim();
  if (!v) return "Escribe tu correo.";
  if (!CORREO.test(v)) return "Correo no válido. Revisa el formato.";
  return null;
}

/** Login only asks that a contraseña was typed — never leaks the length policy. */
export function validarPasswordRequerida(password: string): string | null {
  if (!password) return "Escribe tu contraseña.";
  return null;
}

/** Setting a new password enforces the 8-char floor the reset action also guards. */
export function validarPasswordNueva(password: string): string | null {
  if (password.length < 8) return "Mínimo 8 caracteres.";
  return null;
}

/** Registration's nombre — mirrors the DB's `nombre` min-3 rule so an inline pass
 *  never becomes a server-side reject. */
export function validarNombreCompleto(nombre: string): string | null {
  if (nombre.trim().length < 3) return "Escribe tu nombre completo.";
  return null;
}

/** Registration's teléfono — the +52 prefix is UX; the input is the 10-digit
 *  national number, validated by the same rule the DAL/DB use (`isTelValido`). */
export function validarTelefono(telefono: string): string | null {
  if (!isTelValido(telefono)) return "Ingresa un teléfono a 10 dígitos.";
  return null;
}
