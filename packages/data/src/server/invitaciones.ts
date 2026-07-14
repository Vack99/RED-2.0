import "server-only";

import { firstName } from "@gym/format";

import { createClient, type SupabaseServer } from "./supabase";

/**
 * Invite email send seam (ADR-0015 primary rail; issue #68). Recording a sale with an email auto-sends the
 * member a claim link to their gym's OWN client host, so their eventual login binds to the exact paid
 * `clientes` row (email becomes contact info, never the connector). Best-effort by contract: this NEVER
 * throws into the sale path — it returns a result object, and a failed send leaves the invite state
 * re-sendable (design §3, §4).
 *
 * Two seams live here, each with a real second consumer (keep-it-lean): the injectable MailTransport (its
 * test double is the second consumer; no test ever touches Resend) and `construirUrlInvitacion` (the single
 * home for the gym→client-host rule that S6's re-send reuses).
 */

/** A ready-to-send email. `to` is the recipient; `html`/`text` are the two bodies Resend accepts.
 *  `from` overrides the transport's default sender with a per-gym display name (#75 / ADR-0014
 *  amendment): the same one-domain address, the gym's name on the envelope. */
export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  from?: string;
  /** Optional file attachments in Resend's REST shape: `{ filename, content }` where `content` is the
   *  file's bytes base64-encoded. Carries the receipt PNG twin (#100); absent for plain mail. */
  attachments?: { filename: string; content: string }[];
}

/** Transport result — a discriminated object so a bad send is a value, never a throw. */
export type MailResult = { ok: true } | { ok: false; error: string };

/** The one injectable seam for sending mail (ADR-0001 injectable-client shape). The test double and the
 *  Resend transport are its two implementations; the DAL depends only on this interface. */
export interface MailTransport {
  send(msg: MailMessage): Promise<MailResult>;
}

/**
 * The production transport: a plain `fetch` to the Resend REST API — no new npm dependency. Reads its
 * config from fixed env names the S7 runbook provisions: `RESEND_API_KEY` and `RESEND_FROM` (e.g.
 * "RED <no-reply@example.com>"). Missing env → a clean 'no-configurado' failure (the sale is unaffected;
 * nothing is sent). One platform sending DOMAIN for every gym (ADR-0014, amended #75); the gym's name
 * rides the `From:` display name (`msg.from`) as well as the copy — one address, per-gym display name.
 */
export function resendTransport(): MailTransport {
  return {
    async send(msg: MailMessage): Promise<MailResult> {
      const apiKey = process.env.RESEND_API_KEY;
      const from = msg.from ?? process.env.RESEND_FROM;
      if (!apiKey || !from) return { ok: false, error: "no-configurado" };
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from,
            to: msg.to,
            subject: msg.subject,
            html: msg.html,
            text: msg.text,
            // Only send the key when there are attachments — a plain invite carries none.
            ...(msg.attachments ? { attachments: msg.attachments } : {}),
          }),
        });
        if (!res.ok) return { ok: false, error: `resend ${res.status}` };
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "error de red" };
      }
    },
  };
}

/**
 * The gym→client invite URL rule (the single home S6's re-send reuses). Primary: the gym's OWN client host
 * from the domain map — `https://{gym_domain app='client'}/registro?codigo=X`. Unmapped gym (no client row):
 * the platform default host + `?gym={slug}` so every gym's funnel works from day one — `https://{PLATFORM_
 * CLIENT_FALLBACK_HOST}/registro?gym={slug}&codigo=X`. No host and no fallback env → `null` (the caller
 * reports a clean failure; nothing is sent). `client` is injectable for tests (ADR-0001).
 */
export async function construirUrlInvitacion(
  { gymId, gymSlug, codigo }: { gymId: string; gymSlug: string; codigo: string },
  client: SupabaseServer,
): Promise<string | null> {
  // A gym may map several client hosts (dev mirror + live); order by created_at so the choice is
  // deterministic (the earliest-mapped host wins) rather than a plan-order coin flip. `.localhost`
  // rows are dev-only tenancy hosts (unreachable from a member's phone) — never an invite target:
  // red-demo's dev row predates its public host, so without this filter every demo invite carried
  // an unreachable localhost link (found live 2026-07-09).
  const { data } = await client
    .from("gym_domain")
    .select("hostname")
    .eq("gym_id", gymId)
    .eq("app", "client")
    .not("hostname", "like", "%localhost")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (data?.hostname) {
    return `https://${data.hostname}/registro?codigo=${codigo}`;
  }

  const fallback = process.env.PLATFORM_CLIENT_FALLBACK_HOST;
  if (!fallback) return null;
  return `https://${fallback}/registro?gym=${gymSlug}&codigo=${codigo}`;
}

/** es-MX, platform-voiced invite copy. The gym's NAME (never a per-gym sender) rides the subject + body
 *  per ADR-0014; the claim URL is both a button and a plain link. Simple inline styles + a text fallback. */
export function mensajeInvitacion({
  nombre,
  gymNombre,
  email,
  url,
}: {
  nombre: string;
  gymNombre: string;
  email: string;
  url: string;
}): MailMessage {
  const subject = `Tu gimnasio ${gymNombre} te invita a su app`;
  const saludo = firstName(nombre) || "Hola";

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1c1917;background:#ffffff">
  <p style="font-size:16px;margin:0 0 16px">Hola ${saludo}:</p>
  <p style="font-size:15px;line-height:1.55;margin:0 0 20px">Tu gimnasio <strong>${gymNombre}</strong> te invita a activar tu cuenta en su app, donde puedes reservar tus clases y ver tu paquete.</p>
  <p style="margin:0 0 24px">
    <a href="${url}" style="display:inline-block;background:#1c1917;color:#ffffff;text-decoration:none;padding:14px 28px;font-weight:700;letter-spacing:0.4px;font-size:14px">ACTIVAR MI CUENTA</a>
  </p>
  <p style="font-size:13px;line-height:1.5;color:#78716c;margin:0 0 20px">O abre este enlace:<br><a href="${url}" style="color:#78716c">${url}</a></p>
  <p style="font-size:12px;line-height:1.5;color:#a8a29e;margin:0">Este enlace es personal: al usarlo, tu cuenta queda ligada a tu registro en ${gymNombre}.</p>
</div>`;

  const text = `Hola ${saludo}:

Tu gimnasio ${gymNombre} te invita a activar tu cuenta en su app, donde puedes reservar tus clases y ver tu paquete.

Activa tu cuenta aquí:
${url}

Este enlace es personal: al usarlo, tu cuenta queda ligada a tu registro en ${gymNombre}.`;

  return { to: email, subject, html, text };
}

/**
 * Per-gym `From:` display name (#75 / ADR-0014 amendment). The sending ADDRESS is
 * shared — extracted from `RESEND_FROM`'s `Name <addr>` shape (the `<…>` part, else the
 * whole string) — while the DISPLAY NAME becomes the gym's, so the invite mail and the
 * hook's auth mail read as one platform per gym (no two-senders split). No `RESEND_FROM`
 * → `undefined` (the transport reports `no-configurado`); empty gym name → the neutral
 * `RESEND_FROM` unchanged.
 */
export function remitenteConNombre(gymNombre: string, resendFrom: string | undefined): string | undefined {
  if (!resendFrom) return undefined;
  if (!gymNombre) return resendFrom;
  const match = resendFrom.match(/<(.+)>/);
  const address = match ? match[1] : resendFrom;
  return `${gymNombre} <${address}>`;
}

/** enviarInvitacion outcome — a value, never a throw. `ok:false` carries a machine `motivo` the caller
 *  maps to the recibo's invite state (design §3). */
export type EnvioResult =
  | { ok: true; email: string; codigo: string }
  | { ok: false; motivo: "sin-email" | "sin-host" | "envio-fallido" | "error"; error?: string };

/**
 * Send (or re-send) a member's invite email. Ensures the claim code + reads the send payload
 * (`preparar_invitacion`), builds the URL, sends via the injectable transport, and stamps
 * `invitacion_enviada_at` ONLY on transport success (`marcar_invitacion_enviada`). Best-effort: every
 * failure path returns `ok:false` and the whole body is wrapped so a sale can call this without a guard —
 * it can never throw. `transport`/`client` are injectable for tests (ADR-0001).
 */
export async function enviarInvitacion(
  input: { clienteId: string },
  opts: { transport?: MailTransport; client?: SupabaseServer } = {},
): Promise<EnvioResult> {
  const transport = opts.transport ?? resendTransport();
  try {
    const supabase = opts.client ?? (await createClient());

    const { data, error } = await supabase
      .rpc("preparar_invitacion", { p_cliente_id: input.clienteId })
      .single();
    if (error || !data) return { ok: false, motivo: "error", error: error?.message };

    const { codigo, email, nombre, gym_slug, gym_nombre, gym_id } = data;
    if (!email) return { ok: false, motivo: "sin-email" };

    const url = await construirUrlInvitacion({ gymId: gym_id, gymSlug: gym_slug, codigo }, supabase);
    if (!url) return { ok: false, motivo: "sin-host" };

    const mensaje = mensajeInvitacion({ nombre, gymNombre: gym_nombre, email, url });
    mensaje.from = remitenteConNombre(gym_nombre, process.env.RESEND_FROM);
    const envio = await transport.send(mensaje);
    if (!envio.ok) return { ok: false, motivo: "envio-fallido", error: envio.error };

    // Transport confirmed → record the send (best-effort: a stamp hiccup only re-invites later).
    await supabase.rpc("marcar_invitacion_enviada", { p_cliente_id: input.clienteId });
    return { ok: true, email, codigo };
  } catch (e) {
    return { ok: false, motivo: "error", error: e instanceof Error ? e.message : String(e) };
  }
}
