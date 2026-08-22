/**
 * Daily auth/mail health cron — the alerting shield the session-persistence analysis asked
 * for (§D). Supabase's free tier has no log drains and no alerting, so an `invalid_grant`
 * spike or a run of `send-email` failures is invisible until a member complains. Once a day
 * this reads the last 24h of the project's own logs through the Management API and mails the
 * owner if either signal is nonzero.
 *
 * It only wires already-tested pieces together —
 *   auth (CRON_SECRET) → config → two log queries → shape (resumirAlerta) → send (resendTransport)
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
 * SCHEDULE (`apps/admin/vercel.json` — JSON, so the reasoning lives here): `0 12 * * *`.
 * 12:00 UTC is 05:00–06:00 across Mexico's zones, so the mail is already waiting when the
 * owner's day starts and the run itself never lands inside anyone's business hours. Mexico
 * has run without DST since 2022, so this stays put year-round. Daily also matches what the
 * data supports: the API caps a log query at a 24h window, and consecutive runs tile the
 * timeline exactly.
 *
 * runtime = "nodejs": matches the app's other route handler; the work is two outbound fetches
 * plus a send, all well inside the 60s ceiling this asks for.
 */

import { resendTransport } from "@gym/data/server/invitaciones";

import {
  resumirAlerta,
  SQL_INVALID_GRANT,
  SQL_SEND_EMAIL_FALLOS,
  type ConteosAlerta,
  type Ventana,
} from "./resumen";

export const runtime = "nodejs";
export const maxDuration = 60;

const VENTANA_MS = 24 * 60 * 60 * 1000;

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
  // rejects anything over 24h, so flooring first makes the span exactly 24h with no rounding
  // ambiguity — and consecutive daily runs tile the timeline with no gap and no overlap.
  const hasta = new Date(Math.floor(Date.now() / 60_000) * 60_000);
  const ventana: Ventana = {
    desde: new Date(hasta.getTime() - VENTANA_MS).toISOString(),
    hasta: hasta.toISOString(),
  };

  const [auth, correoHook] = await Promise.all([
    contar(ref, token, SQL_INVALID_GRANT, ventana, "invalid_grant"),
    contar(ref, token, SQL_SEND_EMAIL_FALLOS, ventana, "send-email"),
  ]);

  const conteos: ConteosAlerta = {
    invalidGrant: auth.total,
    sendEmailFallos: correoHook.total,
    errores: [auth.error, correoHook.error].filter((e): e is string => e !== undefined),
  };

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
      alerta: alerta !== null,
      correo: envio === null ? "no-requerido" : envio.ok ? "enviado" : `fallo: ${envio.error}`,
    },
    { status: fallo ? 502 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
