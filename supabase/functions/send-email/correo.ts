/**
 * Pure decision core for the Send Email Hook (issue #75). Every branching choice —
 * which link to mint, which OTP `type` the landing needs, which es-MX copy, which
 * From display name, and how to map a Resend outcome to an HTTP response — lives
 * HERE so vitest + tsc cover it. NO imports and NO Deno/Node APIs: the sibling
 * `index.ts` is the thin Deno shell (signature verify, gym lookup, Resend fetch)
 * and delegates all judgement to these two functions.
 *
 * Sender address is inlined (one real setting, ADR-0014 amendment #75): the sending
 * DOMAIN stays platform-owned `ibookit.lat` (Resend-verified); only the display name
 * is per-gym. Copy voice matches `mensajeInvitacion` so the invite mail and the auth
 * mail read as one platform.
 */

/** The platform sending address — one Resend-verified mailbox for every gym. */
const DIRECCION_ENVIO = "no-reply@ibookit.lat";
/** The gym-neutral display name when no gym resolves from the redirect host. */
const REMITENTE_NEUTRAL = "Notificaciones";

/** A ready-to-send auth mail plus the minted link (exposed for the tests/log). */
export interface CorreoAuth {
  from: string;
  subject: string;
  html: string;
  text: string;
  url: string;
}

export interface EntradaCorreoAuth {
  emailActionType: string;
  tokenHash: string;
  /** The 6-digit OTP counterpart of `tokenHash` (GoTrue hook payload's `email_data.token`).
   *  Rendered as a fallback code block on confirmation-type mail (see `bloqueCodigo`). */
  token: string;
  redirectTo: string;
  gymNombre: string | null;
}

/**
 * The OTP `type` the landing's `verifyOtp` needs — Supabase's blessed
 * `/auth/confirm?token_hash&type` recipe, NOT the raw action type:
 * `recovery`→"recovery", `email_change`→"email_change", everything else
 * (`signup`, `magiclink`, `email`, unknown) → "email".
 */
function tipoOtp(emailActionType: string): string {
  if (emailActionType === "recovery") return "recovery";
  if (emailActionType === "email_change") return "email_change";
  return "email";
}

/**
 * The link is minted on the GYM'S OWN host (the spam-driver fix — never
 * `${SUPABASE_URL}/auth/v1/verify`, and never the platform's global Site URL):
 * `redirectTo` must already be `https://{gym-host}/auth/confirm[?codigo=…|?next=…]`.
 * FAILS CLOSED (throws) on an empty/unparseable `redirectTo`, or on any path
 * other than exactly `/auth/confirm` — the three senders that build `redirect_to`
 * (`registro`, `entrar`, `activar`) all build that path, so anything else means
 * GoTrue clamped the value to the bare Site URL (a misprovisioned or retired
 * host — 2026-08-30 incident, FC-07/FC-10). Defaulting to the Site URL instead
 * would silently enroll the recipient into a tenant they have no relationship
 * with (#217): a loud non-send beats a mis-minted cross-tenant mail. `token_hash`
 * + `type` are appended, PRESERVING any existing query (`codigo`, `next`).
 */
function construirUrl(redirectTo: string, tokenHash: string, tipo: string): string {
  if (!redirectTo) {
    throw new Error("redirect_to vacío: no se puede enviar el correo sin un host de gym válido");
  }
  const u = new URL(redirectTo);
  if (u.pathname !== "/auth/confirm") {
    throw new Error(
      `redirect_to con ruta inesperada (${u.pathname}): solo /auth/confirm es válido — probablemente un Site URL sin ruta`,
    );
  }
  u.searchParams.set("token_hash", tokenHash);
  u.searchParams.set("type", tipo);
  return u.toString();
}

/**
 * The OTP-code fallback (2026-08-30 shield plan, fable verdict #1): a link that
 * dies to query-stripping/webview mangling/prefetch burn still leaves the
 * 6-digit code readable in the mail body. Rendered ONLY for `signup` mail
 * (fable review #6): the magiclink invite rail carries `codigo`+`firma` for the
 * invite-claim, and typing the bare 6-digit code at `/codigo` would establish a
 * session that skipped that claim — the AR-11 empty-cliente shape. Recovery and
 * email_change point at different next steps than "type this on the access
 * page". Generic wording, no URL/host: the code-entry landing is a separate,
 * later change: this hook only has to make the code visible.
 */
function bloqueCodigo(token: string, emailActionType: string): { html: string; text: string } | null {
  if (emailActionType !== "signup" || !/^\d{6}$/.test(token)) return null;
  return {
    html: `<p style="margin:20px 0 0;padding:14px 16px;background:#f5f5f4;border-radius:4px;font-size:13px;line-height:1.5;color:#44403c">¿El enlace no funciona? Escribe este código en la página de acceso: <strong style="font-size:16px;letter-spacing:2px">${token}</strong></p>`,
    text: `¿El enlace no funciona? Escribe este código en la página de acceso: ${token}`,
  };
}

/** The es-MX copy pieces per action type. `intro` weaves the gym name (when present)
 *  the way `mensajeInvitacion` does; neutral copy when null. Unknown types never
 *  error — they fall through to the generic voice. */
interface Copia {
  subject: string;
  preview: string;
  boton: string;
  cierre: string;
  intro: (gymNombre: string | null, resaltar: (s: string) => string) => string;
}

function copia(emailActionType: string): Copia {
  if (emailActionType === "signup") {
    return {
      subject: "Confirma tu cuenta",
      preview: "Confirma tu dirección para activar tu cuenta.",
      boton: "CONFIRMAR MI CUENTA",
      cierre: "Si no creaste esta cuenta, puedes ignorar este mensaje.",
      intro: (gymNombre, resaltar) =>
        gymNombre
          ? `Recibimos una solicitud para crear tu cuenta en ${resaltar(gymNombre)} con este correo. Para activarla, confirma tu dirección:`
          : "Recibimos una solicitud para crear tu cuenta con este correo. Para activarla, confirma tu dirección:",
    };
  }
  if (emailActionType === "recovery") {
    return {
      subject: "Restablece tu contraseña",
      preview: "Elige una nueva contraseña para tu cuenta.",
      boton: "RESTABLECER MI CONTRASEÑA",
      cierre: "Si no solicitaste este cambio, ignora este mensaje; tu contraseña seguirá igual.",
      intro: (gymNombre, resaltar) =>
        gymNombre
          ? `Recibimos una solicitud para restablecer la contraseña de tu cuenta de ${resaltar(gymNombre)}. Para elegir una nueva, abre este enlace:`
          : "Recibimos una solicitud para restablecer la contraseña de tu cuenta. Para elegir una nueva, abre este enlace:",
    };
  }
  return {
    subject: "Continúa en tu cuenta",
    preview: "Abre este enlace para continuar.",
    boton: "CONTINUAR",
    cierre: "Si no solicitaste esto, puedes ignorar este mensaje.",
    intro: (gymNombre, resaltar) =>
      gymNombre
        ? `Recibimos una solicitud en tu cuenta de ${resaltar(gymNombre)}. Para continuar, abre este enlace:`
        : "Recibimos una solicitud en tu cuenta. Para continuar, abre este enlace:",
  };
}

/**
 * Build the gym-branded (or neutral) auth mail + the minted link. The subject is
 * fixed per action; the gym NAME rides the body copy (never a per-gym sender
 * address — ADR-0014 amendment #75). Inline CSS only (Gmail strips `<style>`).
 */
export function construirCorreoAuth({
  emailActionType,
  tokenHash,
  token,
  redirectTo,
  gymNombre,
}: EntradaCorreoAuth): CorreoAuth {
  const tipo = tipoOtp(emailActionType);
  const url = construirUrl(redirectTo, tokenHash, tipo);
  const c = copia(emailActionType);
  const introHtml = c.intro(gymNombre, (s) => `<strong>${s}</strong>`);
  const introText = c.intro(gymNombre, (s) => s);
  const codigo = bloqueCodigo(token, emailActionType);

  const html = `<div style="display:none;max-height:0;overflow:hidden">${c.preview}</div>
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1c1917;background:#ffffff">
  <p style="font-size:16px;margin:0 0 16px">Hola,</p>
  <p style="font-size:15px;line-height:1.55;margin:0 0 24px">${introHtml}</p>
  <p style="margin:0 0 24px">
    <a href="${url}" style="display:inline-block;background:#1c1917;color:#ffffff;text-decoration:none;padding:14px 28px;font-weight:700;letter-spacing:0.4px;font-size:14px">${c.boton}</a>
  </p>
  <p style="font-size:13px;line-height:1.5;color:#78716c;margin:0 0 20px">Si el botón no funciona, copia y pega este enlace en tu navegador:<br><a href="${url}" style="color:#78716c;word-break:break-all">${url}</a></p>
  ${codigo ? codigo.html : ""}
  <p style="font-size:12px;line-height:1.5;color:#a8a29e;margin:20px 0 0">${c.cierre}</p>
</div>`;

  const text = `Hola,

${introText}

${url}
${codigo ? `\n${codigo.text}\n` : ""}
${c.cierre}`;

  return {
    from: `${gymNombre ?? REMITENTE_NEUTRAL} <${DIRECCION_ENVIO}>`,
    subject: c.subject,
    html,
    text,
    url,
  };
}

/**
 * Map a Resend send outcome to the hook's HTTP response (AC6 — a failed send must
 * not brick signup):
 *   - null (network error) / 429 / 5xx → 503 + JSON error → Supabase RETRIES (≤3×);
 *   - 2xx → 200 `{}` (sent);
 *   - any other 4xx (a config bug a retry can't fix) → 200 `{}` DROP — the hook
 *     returns success so the auth action still completes; `index.ts` logs the status.
 *
 * The 200 body is `{}`, never empty: GoTrue parses every hook response as JSON and
 * fails the WHOLE auth action (rolling back the just-created user AFTER the mail
 * went out) on a non-JSON content type — live-verified 2026-07-10.
 */
export function respuestaEnvio(resendStatus: number | null): { status: number; body: string } {
  if (resendStatus === null || resendStatus === 429 || resendStatus >= 500) {
    return {
      status: 503,
      body: JSON.stringify({ error: { http_code: 503, message: "envío temporalmente no disponible" } }),
    };
  }
  return { status: 200, body: "{}" };
}
