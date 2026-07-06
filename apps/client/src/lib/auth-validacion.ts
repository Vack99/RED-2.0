/**
 * Pure inline-validation for the auth forms (entrar + restablecer). The screens
 * render designed field errors rather than native HTML5 bubbles, so the rule is
 * this shared logic — one home, imported by both `_components` forms (a screen
 * never reaches into another screen's `_components`; ARCHITECTURE.md). Each
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
