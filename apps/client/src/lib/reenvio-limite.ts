/**
 * Per-address throttle shared by BOTH confirmation-resend doors (`/entrar`'s rescue block and
 * `/registro`'s "ya enviado" screen) — one counter, or the second door reopens what the first
 * closes. Sized against the AUTH-MAIL BUCKET
 * rather than GoTrue's own floor. The project-wide quota is one shared bucket (50/hr,
 * every gym) while GoTrue only enforces 60s per address — 60/hr from a single member,
 * above the whole platform's budget (incident 2026-08-30, FC-09). So: one send per
 * address per 5 minutes, 5 per UTC day.
 *
 * BEST-EFFORT BY CONSTRUCTION, and the limitation is the point of this note: the counter
 * lives in the serverless instance's memory, so N warm instances allow up to N× this rate
 * and a cold start forgets everything. It caps the runaway multiplier a wedged member
 * produces by hand; it is not a quota. A real ceiling needs per-gym budgets server-side
 * (shield plan §(e)) — not a bigger Map.
 */
const VENTANA_MS = 5 * 60_000;
const DIA_MS = 86_400_000;
const TOPE_DIARIO = 5;
/** The key is a caller-supplied address, so the map is unbounded input: past this size,
 *  drop the entries too old to refuse anything. */
const MAX_ENTRADAS = 1000;

const envios = new Map<string, { ultimo: number; dia: number; enviados: number }>();

/** True when a resend to `email` may go out now — and records it. False is the caller's
 *  cue to skip the send silently: the door still answers "enviado" either way. */
export function permitirReenvio(email: string, ahora: number = Date.now()): boolean {
  const clave = email.trim().toLowerCase();
  const dia = Math.floor(ahora / DIA_MS);
  const previo = envios.get(clave);
  if (previo) {
    if (ahora - previo.ultimo < VENTANA_MS) return false;
    if (previo.dia === dia && previo.enviados >= TOPE_DIARIO) return false;
  }
  if (envios.size >= MAX_ENTRADAS) {
    for (const [k, v] of envios) if (ahora - v.ultimo >= DIA_MS) envios.delete(k);
  }
  envios.set(clave, {
    ultimo: ahora,
    dia,
    enviados: previo && previo.dia === dia ? previo.enviados + 1 : 1,
  });
  return true;
}
