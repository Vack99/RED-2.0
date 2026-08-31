/**
 * Hourly auth/mail health cron — the alerting shield the session-persistence analysis asked
 * for (§D), widened by the 2026-08-30 auth-door incident (shield plan §3(d)). Supabase's free
 * tier has no log drains and no alerting, so an `invalid_grant` spike, a run of `send-email`
 * failures, or a member wedged between the signup and confirmation doors is invisible until
 * someone complains at the counter. Every hour this reads the project's own logs AND its
 * `auth.users` table through the Management API and mails the owner if any signal fires.
 *
 * It only wires already-tested pieces together —
 *   auth (CRON_SECRET) → config → three queries → shape (resumirAlerta) → send (resendTransport)
 * — so the thresholds and the message live in `./resumen` and every I/O path here resolves to
 * a value instead of throwing.
 *
 * AUTH: Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when that env var is set. An
 * unset secret fails CLOSED (401), never open, and the 401 body is identical either way so a
 * prober learns nothing about whether the route is armed.
 *
 * The path is also listed in `decideRedirect` (src/lib/auth.ts) and that pairing is
 * load-bearing, not tidiness: **cron invocations do not follow redirects** — a 3xx ends the
 * run, and a redirected response is not even written to the cron log. Without the exemption
 * the scheduler would collect a 307 to /login every day and the check would never execute.
 *
 * IDEMPOTENT by construction: the run only reads logs and, at worst, sends mail. Vercel's
 * cron delivery is best-effort and may duplicate a run, so the ceiling on a double-fire is a
 * duplicate alert email — there is no counter to double and no row to write twice.
 *
 * MAIL: the house server-side rail — `resendTransport()` from @gym/data/server/invitaciones,
 * the same plain-fetch Resend transport the invite and the receipt use (ADR-0014, no new
 * dependency). NOT the `send-email` edge function: that one is GoTrue's auth hook, signature-
 * verified against a Standard Webhooks payload, and is not a general mail API.
 *
 * SCHEDULE (`apps/admin/vercel.json` — JSON, so the reasoning lives here): `0 * * * *`, hourly.
 * It was daily at 12:00 UTC until 2026-08-30. Daily was indefensible once the wedge signal
 * landed: the Iván wedge sat 34h, already 3× that detection interval, and the send-email
 * fail-closed change (plan fix a5) turns a misprovisioned host into a hard signup failure that
 * a once-a-day check would sit on. `VENTANA_MS` shrank with the cadence so consecutive runs
 * still tile the timeline exactly — a 24h window read hourly would re-count and re-mail the
 * same burst 24 times.
 *
 * runtime = "nodejs": matches the app's other route handler; the work is three outbound fetches
 * plus a send, all well inside the 60s ceiling this asks for.
 */

import { resendTransport } from "@gym/data/server/invitaciones";

import {
  resumirAlerta,
  SQL_INVALID_GRANT,
  SQL_REGISTROS_ATORADOS,
  SQL_SEND_EMAIL_FALLOS,
  type ConteosAlerta,
  type RegistroAtorado,
  type Ventana,
} from "./resumen";

export const runtime = "nodejs";
export const maxDuration = 60;

const VENTANA_MS = 60 * 60 * 1000;

/**
 * The project ref the app already talks to: the subdomain of `NEXT_PUBLIC_SUPABASE_URL`
 * (`https://<ref>.supabase.co`). Derived rather than given its own env var so the cron can
 * never end up watching a different project than the one serving the app. A non-hosted URL
 * (a local stack) yields no ref and the route says so loudly instead of guessing.
 */
function refDelProyecto(): string | null {
  try {
    const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname.split(".")[0];
    return /^[a-z]{20}$/.test(ref) ? ref : null;
  } catch {
    return null;
  }
}

const textoError = (e: unknown): string =>
  typeof e === "string" ? e : JSON.stringify(e).slice(0, 200);

/**
 * Run one counting query against the unified logs stream. Never throws: a transport error, a
 * non-2xx, an `error` inside a 200 body (the endpoint answers 200 with a populated `error`
 * for a query it could not run, so `res.ok` alone is not enough to trust it) and a body
 * without a numeric total all come back as `{ total: null, error }`.
 */
async function contar(
  ref: string,
  token: string,
  sql: string,
  ventana: Ventana,
  etiqueta: string,
): Promise<{ total: number | null; error?: string }> {
  const url = new URL(`https://api.supabase.com/v1/projects/${ref}/analytics/endpoints/logs`);
  url.searchParams.set("sql", sql);
  url.searchParams.set("iso_timestamp_start", ventana.desde);
  url.searchParams.set("iso_timestamp_end", ventana.hasta);

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { total: null, error: `${etiqueta}: HTTP ${res.status}` };
    const cuerpo = (await res.json()) as { result?: { total?: number }[]; error?: unknown };
    if (cuerpo.error) return { total: null, error: `${etiqueta}: ${textoError(cuerpo.error)}` };
    const total = cuerpo.result?.[0]?.total;
    if (typeof total !== "number") return { total: null, error: `${etiqueta}: respuesta sin total` };
    return { total };
  } catch (e) {
    return { total: null, error: `${etiqueta}: ${e instanceof Error ? e.message : "error de red"}` };
  }
}

/**
 * The wedge signal (shield plan §3(d)). Same host, same PAT, different endpoint: `database/query`
 * runs plain SQL as `postgres`, which is the ONLY role `registros_atorados()` is executable by —
 * EXECUTE is revoked from public/anon/authenticated and re-granted to nobody, so the function is
 * unreachable from PostgREST and from both apps.
 *
 * Never throws, same contract as `contar`: an unusable answer is `{ filas: null, error }`, which
 * `resumirAlerta` treats as a reason to page rather than as all-clear. The rows are shape-checked
 * one by one — a schema drift that renamed a column must read as "the detector stopped working",
 * not as an alert body full of `undefined`.
 */
async function consultarAtorados(
  ref: string,
  token: string,
): Promise<{ filas: RegistroAtorado[] | null; error?: string }> {
  const etiqueta = "registros-atorados";
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: SQL_REGISTROS_ATORADOS }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { filas: null, error: `${etiqueta}: HTTP ${res.status}` };
    const cuerpo: unknown = await res.json();
    if (!Array.isArray(cuerpo)) return { filas: null, error: `${etiqueta}: respuesta sin filas` };
    const filas = cuerpo.filter(
      (f): f is RegistroAtorado =>
        typeof (f as RegistroAtorado)?.correo === "string" &&
        typeof (f as RegistroAtorado)?.motivo === "string" &&
        typeof (f as RegistroAtorado)?.horas === "number",
    );
    if (filas.length !== cuerpo.length) {
      return { filas: null, error: `${etiqueta}: fila con forma inesperada` };
    }
    return { filas };
  } catch (e) {
    return { filas: null, error: `${etiqueta}: ${e instanceof Error ? e.message : "error de red"}` };
  }
}

export async function GET(request: Request): Promise<Response> {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || request.headers.get("authorization") !== `Bearer ${secreto}`) {
    return new Response("No autorizado", { status: 401 });
  }

  // Past the secret, a misconfigured shield is worse than no shield: it must never answer
  // 200 "all clear" while missing the token it needs to look. Names only, never values.
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const destino = process.env.ALERT_EMAIL;
  const ref = refDelProyecto();
  if (!token || !destino || !ref) {
    const falta = [
      token ? null : "SUPABASE_ACCESS_TOKEN",
      destino ? null : "ALERT_EMAIL",
      ref ? null : "NEXT_PUBLIC_SUPABASE_URL (ref de proyecto no derivable)",
    ].filter((n): n is string => n !== null);
    return Response.json(
      { error: `Falta configurar: ${falta.join(", ")}` },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Both ends floored to the minute: the API rounds the range to the nearest minute and
  // rejects anything over 24h, so flooring first makes the span exactly `VENTANA_MS` with no
  // rounding ambiguity — and consecutive hourly runs tile the timeline with no gap and no
  // overlap. Only the two LOG queries take this window; the wedge query is point-in-time.
  const hasta = new Date(Math.floor(Date.now() / 60_000) * 60_000);
  const ventana: Ventana = {
    desde: new Date(hasta.getTime() - VENTANA_MS).toISOString(),
    hasta: hasta.toISOString(),
  };

  const [auth, correoHook, atorados] = await Promise.all([
    contar(ref, token, SQL_INVALID_GRANT, ventana, "invalid_grant"),
    contar(ref, token, SQL_SEND_EMAIL_FALLOS, ventana, "send-email"),
    consultarAtorados(ref, token),
  ]);

  const conteos: ConteosAlerta = {
    invalidGrant: auth.total,
    sendEmailFallos: correoHook.total,
    atorados: atorados.filas,
    errores: [auth.error, correoHook.error, atorados.error].filter(
      (e): e is string => e !== undefined,
    ),
  };

  // The non-Resend leg of the wedge signal (plan §3(d) "Channel"): the same counts land in the
  // Vercel runtime log AND in this route's own JSON, so the detector does not die with the thing
  // it detects — FC-08's single Resend key backs the alert mail AND every rail the alert is about.
  // Deliberately no addresses on either: the counts, the two shapes and the worst age are enough
  // to know something is wrong and go read the mail (or run the RPC), and a member's address in a
  // log line is the LM-7 leak. Written every run, clean or not — a signal that only appears when
  // it is bad cannot be distinguished from a signal that stopped running.
  const atoradosResumen = {
    total: conteos.atorados?.length ?? null,
    sinConfirmar: conteos.atorados?.filter((a) => a.motivo === "sin-confirmar").length ?? null,
    sinVincular: conteos.atorados?.filter((a) => a.motivo === "sin-vincular").length ?? null,
    horasMax: conteos.atorados?.length ? Math.max(...conteos.atorados.map((a) => a.horas)) : 0,
  };
  console.warn(JSON.stringify({ evento: "registros-atorados", ...atoradosResumen }));

  const alerta = resumirAlerta(conteos, ventana);
  const envio = alerta
    ? await resendTransport().send({
        to: destino,
        subject: alerta.asunto,
        text: alerta.texto,
        html: alerta.html,
      })
    : null;

  // 502 whenever the run did not do its job — a query that never answered, or an alert that
  // was shaped but could not be mailed. Vercel's cron log then shows a failed invocation
  // instead of a green tick over a check that saw nothing, or told no one.
  const fallo = conteos.errores.length > 0 || envio?.ok === false;

  return Response.json(
    {
      ventana,
      ...conteos,
      atorados: atoradosResumen,
      alerta: alerta !== null,
      correo: envio === null ? "no-requerido" : envio.ok ? "enviado" : `fallo: ${envio.error}`,
    },
    { status: fallo ? 502 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
