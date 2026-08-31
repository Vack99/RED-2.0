import "server-only";

/**
 * Per-address auth-mail throttle shared by ALL THREE doors that can put a confirmation
 * mail in flight — `/entrar`'s rescue resend, `/registro`'s "ya enviado" resend, and
 * `registrarSocio`'s own signUp. ONE counter, or the second door reopens what the first
 * closes: while the resend actions and the signup door kept separate maps, alternating a
 * `/registro` submit with an `/entrar` resend spent both budgets against the SAME bucket
 * and doubled what one address could take.
 *
 * Sized against the AUTH-MAIL BUCKET rather than GoTrue's own floor. The project-wide
 * quota is one shared bucket (50/hr, every gym) while GoTrue only enforces 60s per address
 * — 60/hr from a single member, above the whole platform's budget (incident 2026-08-30,
 * FC-09). So: one send per address per 5 minutes, 5 per UTC day, counted once across the
 * three doors.
 *
 * It lives in @gym/data/server (not in an app) precisely because it must be ONE counter:
 * the signup DAL and both app actions have to reach the same module-level Map, and only a
 * shared package can be that home. It is in-memory state, so it holds no I/O and no
 * secrets — but it keeps the `server-only` pill anyway (ADR-0011 §5): a client bundle that
 * imported it would silently get its own useless copy.
 *
 * BEST-EFFORT BY CONSTRUCTION, and the limitation is the point of this note: the counter
 * lives in the serverless instance's memory, so N warm instances allow up to N× this rate
 * and a cold start forgets everything. It caps the runaway multiplier a wedged member
 * produces by hand — one person resubmitting one form on one connection — not a
 * distributed attacker; that is Turnstile's job at the door and GoTrue's 60s floor
 * underneath. A real ceiling needs per-gym budgets in shared state (shield plan §(e)) —
 * not a bigger Map.
 */
const VENTANA_MS = 5 * 60_000;
const DIA_MS = 86_400_000;
const TOPE_DIARIO = 5;
/** The key is a caller-supplied address, so the map is unbounded input: past this size,
 *  drop the entries too old to refuse anything. */
const MAX_ENTRADAS = 1000;

const envios = new Map<string, { ultimo: number; dia: number; enviados: number }>();

const clavear = (email: string): string => email.trim().toLowerCase();

/** True when a send to `email` must NOT go out yet. Check-only, for the caller that cannot
 *  know whether a mail actually left until after it asks GoTrue (`registrarSocio`: an
 *  already-confirmed address is answered without any mail, so it must spend nothing). */
export function enEsperaReenvio(email: string, ahora: number = Date.now()): boolean {
  const previo = envios.get(clavear(email));
  if (previo === undefined) return false;
  if (ahora - previo.ultimo < VENTANA_MS) return true;
  return previo.dia === Math.floor(ahora / DIA_MS) && previo.enviados >= TOPE_DIARIO;
}

/** Charge one send to `email`. Only ever called once a mail really went out. */
export function registrarReenvio(email: string, ahora: number = Date.now()): void {
  const clave = clavear(email);
  const dia = Math.floor(ahora / DIA_MS);
  const previo = envios.get(clave);
  if (envios.size >= MAX_ENTRADAS) {
    for (const [otra, envio] of envios) if (ahora - envio.ultimo >= DIA_MS) envios.delete(otra);
  }
  envios.set(clave, {
    ultimo: ahora,
    dia,
    enviados: previo && previo.dia === dia ? previo.enviados + 1 : 1,
  });
}

/** True when a resend to `email` may go out now — and records it. False is the caller's
 *  cue to skip the send silently: the door still answers "enviado" either way. */
export function permitirReenvio(email: string, ahora: number = Date.now()): boolean {
  if (enEsperaReenvio(email, ahora)) return false;
  registrarReenvio(email, ahora);
  return true;
}
