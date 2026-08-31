/**
 * The pure half of the hourly auth/mail alert (session-persistence analysis §D: "log-based
 * alert on `invalid_grant` spikes and on `send-email` non-2xx rates", plus the 2026-08-30
 * wedge detector, shield plan §3(d)). It holds the three queries and the decision of whether
 * the window is worth an email — split out of route.ts so the threshold and the message shape
 * are unit-testable with no token, no network and no Next request machinery, the same way
 * `cuenta/respaldo/route.ts` keeps its handler free of logic and only wires tested pieces.
 *
 * TWO CADENCES ON ONE CRON. The wedge signal (c) is why the schedule went hourly, and it
 * pages on any run. The two LOG signals (a) and (b) keep their ORIGINAL 24h lookback and
 * their original once-a-day voice: they may only raise the alarm on the run at
 * `HORA_RESUMEN_DIARIO`. See that constant for why, and for what a rolling 24h window read
 * hourly would otherwise do.
 *
 * DIALECT — two different ones, which is the trap here. (a) and (b) run against Supabase's
 * UNIFIED logs stream in **ClickHouse SQL**: one `logs` table narrowed by `source`, nested
 * fields read via `log_attributes['<key>']`. This is deliberately NOT the older BigQuery shape
 * (`from auth_logs cross join unnest(metadata)`): the Management API marks
 * `analytics/endpoints/logs.all` deprecated and its successor `analytics/endpoints/logs`
 * documents ClickHouse. (c) is plain **Postgres**, sent to `/database/query` instead. Both
 * log strings were first run against LIVE (hjppxawglmukfvsgmcog) on 2026-08-21; the auth arm's
 * match and threshold were recalibrated 2026-08-24 — see (a) below.
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
 *
 * The window is 24h and the threshold counts against a DAY, which is what it was calibrated
 * for. The 2026-08-30 move to an hourly cadence briefly shrank it to 1h so consecutive runs
 * would tile the timeline; that silently weakened this detector, because the failure it was
 * built to catch is a slow drip — 3 or 4 lines an hour never crosses 10 inside one hour, but
 * it is 80 lines a day. The 24h lookback is back, and the re-alerting a rolling window read
 * hourly would cause is handled by `HORA_RESUMEN_DIARIO` instead of by shrinking the window.
 */
export const SQL_INVALID_GRANT = `select count(*) as total
from logs
where source = 'auth_logs'
  and (
    position(event_message, 'invalid_grant') > 0
    or position(event_message, 'Invalid Refresh Token') > 0
  )`;

/** One dead-session event ≈ one proxy fan-out burst (≤~10 lines). Above this, in a day, is
 *  more than one member's bad afternoon: systemic. */
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

/**
 * (c) Wedged registrations — shield plan §3(d). NOT a log query: this one runs against the
 * DATABASE, through the same Management API and the same `SUPABASE_ACCESS_TOKEN` the two above
 * use (`/database/query` instead of `/analytics/endpoints/logs`), which connects as `postgres`.
 * That is the whole grant posture: `registros_atorados()` is granted to nobody, so the owner —
 * i.e. this cron — is the only caller, and PostgREST cannot publish it to a member.
 *
 * It is point-in-time, not windowed: a wedge is a STATE, not an event, so unlike the two counting
 * queries it does not tile the timeline and reports the same row on every run until it is fixed.
 * That is intended — an unrepaired wedge is a person who cannot get in — and it is also why the
 * function itself carries the suppressions (sandbox addresses, and a 30-day actionability ceiling
 * on BOTH arms, so an hourly cadence cannot turn abandoned signups into a permanent alert)
 * rather than leaving them to the reader.
 */
export const SQL_REGISTROS_ATORADOS = `select correo, motivo, horas from public.registros_atorados()`;

/** The doc the alert points at — the analysis that named this shield and holds the triage. */
export const DOC_ANALISIS = "docs/Context/2026-08-21-login-session-persistence-analysis.md";

/** The incident that added the wedge signal; holds the repair recipe and the open owner actions. */
export const DOC_ATORADOS = "docs/superpowers/plans/2026-08-30-auth-door-shield-plan.md";

/** One wedged registration: a member who cannot reach the product and cannot say so. */
export interface RegistroAtorado {
  correo: string;
  /** `sin-confirmar` (the confirmation never landed) | `sin-vincular` (confirmed, never claimed). */
  motivo: string;
  horas: number;
}

/** The window the two LOG queries covered, as the ISO strings sent to the API. */
export interface Ventana {
  desde: string;
  hasta: string;
}

/**
 * The one run a day where the two LOG signals may raise the alarm — 12:00 UTC, the slot this
 * cron held before it went hourly on 2026-08-30.
 *
 * Their window is 24h and it ROLLS: an unrepaired drip is still in the window an hour later,
 * so an ungated hourly run would mail about the same 24h of logs up to 24 times. The choices
 * were (i) shrink the window to 1h so runs tile — which is what shipped, and it cost the
 * detectors the very drip they exist to catch — (ii) remember what was already reported, which
 * needs persistent state this route deliberately has none of (it is idempotent by
 * construction), or (iii) keep the 24h window and let it speak once a day. (iii) is this.
 *
 * Derived from `ventana.hasta`, which IS the run's own clock (route.ts floors `Date.now()` to
 * the minute), so it needs no argument, no env var and no stored cursor.
 *
 * RESIDUAL, stated rather than hidden: these two signals are back to a detection latency of up
 * to 24h, exactly the latency they had by design before 2026-08-30 — the hourly cadence buys
 * nothing for them. It was never for them: it is for the wedge signal (c), a person who cannot
 * get in, and that one still pages on every run. Second residual: a cron invocation delayed
 * past the top of the hour into 13:00 UTC skips that day's digest entirely; the next day's
 * window still covers the drip, so a persistent problem is reported one day late, not lost.
 */
const HORA_RESUMEN_DIARIO = 12;

/** What the three queries came back with. `null` = that query did not answer; the reason is in
 *  `errores`. */
export interface ConteosAlerta {
  invalidGrant: number | null;
  sendEmailFallos: number | null;
  /** `null` = the wedge query did not answer. `[]` = it answered and nobody is stuck. */
  atorados: RegistroAtorado[] | null;
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
 * when any send-email failure lands, when ANY registration is wedged, or when a query failed.
 *
 * The two LOG arms only count on the daily run (`HORA_RESUMEN_DIARIO`) — their 24h window
 * rolls, so every other hour would re-report the same day. The wedge and error arms page on
 * any run: a wedge is a person locked out right now, and a query that did not answer means
 * the shield is blind right now. Both are read fresh every run, so neither is a re-report.
 *
 * The wedge arm has no tolerance band and deliberately so: `UMBRAL_AUTH` exists because one
 * member event produces a BURST of log lines, whereas one wedged member is exactly one row —
 * the count is already the number of people who cannot get in, and the suppressions that keep
 * that number honest live in `registros_atorados()` itself, not in a threshold here.
 *
 * A failed query counts because a shield that silently stopped looking is the exact failure
 * this cron exists to prevent — an expired PAT would otherwise read as "all clear" forever.
 * Returns `null` when the window is clean, so the caller's rule is `if (alerta) send(alerta)`
 * and no unsent subject line is ever constructed. The counts themselves are ALWAYS rendered
 * once something fires: a wedge alert at 03:00 still shows what the last 24h of logs held.
 */
export function resumirAlerta(conteos: ConteosAlerta, ventana: Ventana): MensajeAlerta | null {
  const { invalidGrant, sendEmailFallos, atorados, errores } = conteos;
  const turnoDiario = new Date(ventana.hasta).getUTCHours() === HORA_RESUMEN_DIARIO;
  const alertar =
    (turnoDiario && ((invalidGrant ?? 0) > UMBRAL_AUTH || (sendEmailFallos ?? 0) > 0)) ||
    (atorados?.length ?? 0) > 0 ||
    errores.length > 0;
  if (!alertar) return null;

  const lineas = [
    `Ventana: ${ventana.desde} → ${ventana.hasta} (UTC)`,
    `invalid_grant (auth_logs): ${describir(invalidGrant)}`,
    `send-email no-2xx (function_edge_logs): ${describir(sendEmailFallos)}`,
    `registros atorados (auth.users): ${describir(atorados?.length ?? null)}`,
  ];
  // Address + reason + age, one per line: without the age a wedge cannot be triaged (3h is a
  // retry, 34h is a repair), and without the address nobody can act on it at all.
  if (atorados?.length) {
    lineas.push(
      "",
      "Miembros que no pueden entrar:",
      ...atorados.map((a) => `- ${a.correo} · ${a.motivo} · ${a.horas}h`),
    );
  }
  if (errores.length) {
    lineas.push("", "Consultas que no respondieron:", ...errores.map((e) => `- ${e}`));
  }
  lineas.push("", `Abre ${DOC_ANALISIS} para el contexto y la ruta de diagnóstico.`);
  if (atorados?.length) lineas.push(`Para los atorados, ${DOC_ATORADOS} §3(d) y §4 (B1).`);

  const texto = lineas.join("\n");
  return {
    asunto: `[iBookit] Alerta auth/correo — invalid_grant ${describir(invalidGrant)}, send-email ${describir(sendEmailFallos)}, atorados ${describir(atorados?.length ?? null)}`,
    texto,
    // The body carries a remote API's error string verbatim AND member-supplied email addresses,
    // so it is escaped before it lands in HTML — the two interpolations here that are not our text.
    html: `<pre style="font:14px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap">${escaparHtml(texto)}</pre>`,
  };
}
