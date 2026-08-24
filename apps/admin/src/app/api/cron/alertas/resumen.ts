/**
 * The pure half of the daily auth/mail alert (session-persistence analysis §D: "log-based
 * alert on `invalid_grant` spikes and on `send-email` non-2xx rates"). It holds the two log
 * queries and the decision of whether the window is worth an email — split out of route.ts
 * so the threshold and the message shape are unit-testable with no token, no network and no
 * Next request machinery, the same way `cuenta/respaldo/route.ts` keeps its handler free of
 * logic and only wires already-tested pieces.
 *
 * DIALECT: both queries run against Supabase's UNIFIED logs stream in **ClickHouse SQL** —
 * one `logs` table narrowed by `source`, nested fields read via `log_attributes['<key>']`.
 * This is deliberately NOT the older BigQuery shape (`from auth_logs cross join
 * unnest(metadata)`): the Management API marks `analytics/endpoints/logs.all` deprecated and
 * its successor `analytics/endpoints/logs` documents ClickHouse. Both strings were first run
 * against LIVE (hjppxawglmukfvsgmcog) on 2026-08-21; the auth arm's match and threshold were
 * recalibrated 2026-08-24 — see (a) below.
 */

/**
 * (a) Auth refresh-token failures in the window. GoTrue writes the failure text into the raw
 * JSON log line, so a substring match over `event_message` catches it wherever in the payload
 * it lands (no schema assumption about which key holds it). GoTrue's real refresh-failure
 * messages share the prefix `Invalid Refresh Token:` ("… Refresh Token Not Found", "… Already
 * Used"), so one anchored arm covers the family; the 2026-08-21 `invalid_grant`-only match
 * NEVER fired on live (measured 17 real failures against 0 matches, 2026-08-24) and stays only
 * for a differently-shaped surface.
 *
 * Recalibrated 2026-08-24: healthy is no longer ZERO. A single dead-session event logs one
 * BURST — the proxy fans out ~10 parallel refreshes carrying the same dead token before the
 * shed cookie lands — so the threshold (`UMBRAL_AUTH`) tolerates one isolated burst per window
 * and pages only on what a burst cannot explain: a systemic session-death regression.
 */
export const SQL_INVALID_GRANT = `select count(*) as total
from logs
where source = 'auth_logs'
  and (
    position(event_message, 'invalid_grant') > 0
    or position(event_message, 'Invalid Refresh Token') > 0
  )`;

/** One dead-session event ≈ one proxy fan-out burst (≤~10 lines). Above this = systemic. */
export const UMBRAL_AUTH = 10;

/**
 * (b) `send-email` hook invocations that did not answer 2xx. `function_edge_logs` is the
 * gateway view — it is the only source carrying both the request path and the response status
 * (`function_logs` is the function's own stdout and has neither). A 4xx/5xx here means GoTrue
 * could not hand off a recovery/invite mail, i.e. a member is silently not receiving it.
 * `toInt32OrZero` because every `log_attributes` value is a string; a missing or unparseable
 * status becomes 0 and is therefore not counted as a failure.
 */
export const SQL_SEND_EMAIL_FALLOS = `select count(*) as total
from logs
where source = 'function_edge_logs'
  and position(log_attributes['request.pathname'], '/send-email') > 0
  and toInt32OrZero(log_attributes['response.status_code']) >= 400`;

/** The doc the alert points at — the analysis that named this shield and holds the triage. */
export const DOC_ANALISIS = "docs/Context/2026-08-21-login-session-persistence-analysis.md";

/** The window both queries covered, as the ISO strings sent to the API. */
export interface Ventana {
  desde: string;
  hasta: string;
}

/** What the two queries came back with. `null` = that query did not answer; the reason is in
 *  `errores`. */
export interface ConteosAlerta {
  invalidGrant: number | null;
  sendEmailFallos: number | null;
  errores: string[];
}

/** A ready-to-send alert. `null` from `resumirAlerta` means there is nothing to say. */
export interface MensajeAlerta {
  asunto: string;
  texto: string;
  html: string;
}

const describir = (n: number | null): string => (n === null ? "sin dato" : String(n));

const escaparHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * The whole threshold: alert when auth failures exceed one fan-out burst (`UMBRAL_AUTH`),
 * when any send-email failure lands, or when a query failed.
 *
 * A failed query counts because a shield that silently stopped looking is the exact failure
 * this cron exists to prevent — an expired PAT would otherwise read as "all clear" forever.
 * Returns `null` when the window is clean, so the caller's rule is `if (alerta) send(alerta)`
 * and no unsent subject line is ever constructed.
 */
export function resumirAlerta(conteos: ConteosAlerta, ventana: Ventana): MensajeAlerta | null {
  const { invalidGrant, sendEmailFallos, errores } = conteos;
  const alertar =
    (invalidGrant ?? 0) > UMBRAL_AUTH || (sendEmailFallos ?? 0) > 0 || errores.length > 0;
  if (!alertar) return null;

  const lineas = [
    `Ventana: ${ventana.desde} → ${ventana.hasta} (UTC)`,
    `invalid_grant (auth_logs): ${describir(invalidGrant)}`,
    `send-email no-2xx (function_edge_logs): ${describir(sendEmailFallos)}`,
  ];
  if (errores.length) {
    lineas.push("", "Consultas que no respondieron:", ...errores.map((e) => `- ${e}`));
  }
  lineas.push("", `Abre ${DOC_ANALISIS} para el contexto y la ruta de diagnóstico.`);

  const texto = lineas.join("\n");
  return {
    asunto: `[iBookit] Alerta auth/correo — invalid_grant ${describir(invalidGrant)}, send-email ${describir(sendEmailFallos)}`,
    texto,
    // The body carries a remote API's error string verbatim, so it is escaped before it
    // lands in HTML — this is the one interpolation here that is not our own text.
    html: `<pre style="font:14px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap">${escaparHtml(texto)}</pre>`,
  };
}
