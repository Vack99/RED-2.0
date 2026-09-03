import { NextResponse, type NextRequest } from "next/server";

import { confirmarCodigo, confirmarTokenHash } from "@gym/data/server/sesion";
import { createClient, type SupabaseServer } from "@gym/data/server/supabase";

import { reclamarEnHost } from "../../../lib/reclamo";

/**
 * Email confirmation / recovery landing (ADR-0009 / ADR-0015). The confirmation
 * email lands here EITHER with a PKCE `?code=` (default Supabase sender — ADR-0014)
 * OR with `?token_hash=&type=` (the Send Email Hook mints the link on the gym's own
 * host — #75). Whichever arm establishes the session, the post-auth handling is the
 * same:
 *
 *   • EVERY landing runs the verified-EMAIL claim in the HOST-resolved gym
 *     (server-authoritative — never `x-gym`/a client field), then honors `next`.
 *     Recovery included: the `!next` gate that used to skip it (M3) meant a
 *     reset-first member was never claimed on that mint, and the claim is
 *     link-only now (R1), so a reset cannot conjure a membership either.
 *
 * A failed/absent code or token_hash falls back to `/entrar` — with a motivo, never a
 * catch-all (see `rechazar`). `next` is constrained to a local path (no open redirect).
 */

/** The four structurally distinct ways a mailed link dies here. Each gets its own
 *  `?error=` so `/entrar` can say something true, and its own log line so the next wedge
 *  is diagnosable: the 2026-08-30 root cause is unproven precisely because this route
 *  collapsed all four into one unlogged redirect (FC-03). */
type MotivoFallo = "sin-token" | "tipo-no-soportado" | "code-rechazado" | "token-rechazado";

/** One structured line per failure exit — the shape `sesion.ts`'s senders use, the only
 *  sink that exists (no log drain anywhere in the repo). NEVER the `code`/`token_hash`
 *  values: a log line carrying either hands out a session to whoever reads it. */
function rechazar(
  request: NextRequest,
  motivo: MotivoFallo,
  tipo: string | null,
  fallo?: { error: string; code?: string | undefined; status?: number | undefined },
): NextResponse {
  console.warn(
    JSON.stringify({
      event: "confirm-fallo",
      motivo,
      tipo,
      code: fallo?.code,
      status: fallo?.status,
      error: fallo?.error,
    }),
  );
  return NextResponse.redirect(new URL(`/entrar?error=${motivo}`, request.url));
}

/** Post-auth handling shared by both session-establishing arms (`code` + `token_hash`):
 *  claim in the host gym, then land on `next` (a local path) or the panel. */
async function finalizarAuth(
  request: NextRequest,
  supabase: SupabaseServer,
  next: string | null,
): Promise<NextResponse> {
  // This is the /registro rail's own continuation, which rendered the real simplificado when
  // the gym's identity was complete — `conAviso` recomputes that HERE (never a stale
  // render-time flag) so the stamped version matches what THIS request's gym actually shows.
  await reclamarEnHost(supabase, { conAviso: true });
  return NextResponse.redirect(new URL(next ?? "/reservar", request.url));
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const nextParam = request.nextUrl.searchParams.get("next");
  // Local path only: "//host" is protocol-relative and "/\" is treated as "//"
  // by browsers/URL — both would turn `next` into an open redirect.
  const next =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") && !nextParam.startsWith("/\\")
      ? nextParam
      : null;

  if (code) {
    const supabase = await createClient();
    const exchanged = await confirmarCodigo(code, supabase);
    if (exchanged.ok) {
      return finalizarAuth(request, supabase, next);
    }
    return rechazar(request, "code-rechazado", type, exchanged);
  }

  if (tokenHash) {
    // Send Email Hook link (#75). A missing or emptied `type` no longer discards a
    // perfectly good token: every hook-minted link carries one, so its absence means the
    // URL lost a param in transit (webview/mail rewrite), and "email" is what a signup
    // confirmation — the only mail a member clicks blind — always is. A `type` that is
    // present and unusable is a different animal, and still refused below.
    const tipo = type || "email";
    if (tipo !== "email" && tipo !== "recovery" && tipo !== "email_change") {
      return rechazar(request, "tipo-no-soportado", type);
    }
    const supabase = await createClient();
    const confirmed = await confirmarTokenHash(tipo, tokenHash, supabase);
    if (confirmed.ok) {
      return finalizarAuth(request, supabase, next);
    }
    return rechazar(request, "token-rechazado", tipo, confirmed);
  }

  return rechazar(request, "sin-token", type);
}
