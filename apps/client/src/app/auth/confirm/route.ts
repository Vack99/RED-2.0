import { NextResponse, type NextRequest } from "next/server";

import { getMarketingGym } from "@gym/data/server/marketing";
import {
  intentarReclamoConFirma,
  intentarReclamoPorEmail,
  parseCodigoInvitacion,
} from "@gym/data/server/registro";
import { resolveTenant } from "@gym/data/server/resolve-tenant";
import { confirmarCodigo, confirmarTokenHash } from "@gym/data/server/sesion";
import { createClient, type SupabaseServer } from "@gym/data/server/supabase";

import { avisoVersionParaGym } from "../../../lib/aviso-legal";

/**
 * Email confirmation / recovery landing (ADR-0009 / ADR-0015). The confirmation
 * email lands here EITHER with a PKCE `?code=` (default Supabase sender — ADR-0014)
 * OR with `?token_hash=&type=` (the Send Email Hook mints the link on the gym's own
 * host — #75). Whichever arm establishes the session, the post-auth handling is the
 * same:
 *
 *   • recovery (`?next=/restablecer`) → redirect there so the person sets a new
 *     password against the now-established session (NO claim);
 *   • invite signup (`?codigo=`) → run the invite-token claim (ADR-0015 primary
 *     rail): the code resolves the exact paid row and its gym — host is NOT an
 *     authz input, so no tenant lookup is needed;
 *   • plain signup → run the atomic verified-EMAIL claim in the HOST-resolved gym
 *     (server-authoritative — never `x-gym`/a client field) and land on the panel.
 *
 * A failed/absent code or token_hash falls back to `/entrar`. `next` is constrained
 * to a local path (no open redirect).
 */

/** Post-auth handling shared by both session-establishing arms (`code` + `token_hash`):
 *  honor a local `next`, else run the invite / host-email claim, then land on the panel. */
async function finalizarAuth(
  request: NextRequest,
  supabase: SupabaseServer,
  codigo: string | null,
  firma: string | null,
  next: string | null,
): Promise<NextResponse> {
  try {
    if (codigo) {
      // Invite-token claim: bind the login to the code's exact paid row + gym. The firma
      // is READ FROM THE URL and forwarded UNVERIFIED — the RPC verifies it (audit §3 H2):
      // an attacker-appended `&codigo=` on a recovery link carries no matching firma, so
      // the RPC refuses and writes nothing. The only legit link that reaches this branch
      // is the magic-link existing-account rail (`activar/actions.ts`'s `cuenta_existente`
      // case, `next=/reservar`), whose firma is minted server-side after the app-tier
      // gates. Runs even when `next` is set.
      //
      // Re-review: this rail renders no aviso anywhere upstream (the magic-link existing-
      // account rail — no consent UI, `ActivarForm` shows only email + Turnstile), so it
      // stamps an honest null, matching reservar/page.tsx and activar/actions.ts.
      await intentarReclamoConFirma(codigo, firma ?? "", null, supabase);
    } else if (!next) {
      // Fallback: claim (or create) the cliente by verified email in the host gym. Never
      // on a bare `next` recovery (a plain password reset must not claim a membership).
      const tenant = await resolveTenant(request.headers.get("host"), null);
      if (tenant) {
        // Final review round, Important 1: this is the continuation of /registro's own
        // form, which rendered the real simplificado only when the gym's identity was
        // complete — recompute that here (never trust a stale render-time flag) so the
        // stamped version matches what THIS request's gym actually shows.
        const gym = await getMarketingGym(tenant.slug);
        await intentarReclamoPorEmail(tenant.id, await avisoVersionParaGym(gym), supabase);
      }
    }
  } catch {
    // The claim itself no longer throws (the `intentar*` ceremony returns a refusal as a
    // value); this still guards the host/aviso LOOKUPS above, so a tenant or legal-identity
    // read that blows up lands the verified account on its destination instead of erroring.
  }
  return NextResponse.redirect(new URL(next ?? "/reservar", request.url));
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const codigo = parseCodigoInvitacion(request.nextUrl.searchParams.get("codigo"));
  // Forwarded to the claim RPC unverified — the RPC verifies it. An attacker-appended
  // `&codigo=` on a recovery link has no matching firma, so the RPC refuses (audit §3 H2).
  const firma = request.nextUrl.searchParams.get("firma");
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
      return finalizarAuth(request, supabase, codigo, firma, next);
    }
  } else if (tokenHash && (type === "email" || type === "recovery" || type === "email_change")) {
    // Send Email Hook link (#75): anything but the accepted OTP types falls through
    // to the error redirect below.
    const supabase = await createClient();
    const confirmed = await confirmarTokenHash(type, tokenHash, supabase);
    if (confirmed.ok) {
      return finalizarAuth(request, supabase, codigo, firma, next);
    }
  }

  return NextResponse.redirect(new URL("/entrar?error=confirmacion", request.url));
}
