import { NextResponse, type NextRequest } from "next/server";

import { reclamarCliente } from "@gym/data/server/registro";
import { resolveTenant } from "@gym/data/server/resolve-tenant";
import { confirmarCodigo } from "@gym/data/server/sesion";
import { createClient } from "@gym/data/server/supabase";

/**
 * Email confirmation / recovery landing (ADR-0009). The confirmation email lands
 * here with a PKCE `?code=` (default Supabase sender — ADR-0014). We exchange it
 * for a session, then:
 *
 *   • recovery (`?next=/restablecer`) → redirect there so the person sets a new
 *     password against the now-established session (NO claim);
 *   • signup → run the atomic verified-email claim in the HOST-resolved gym
 *     (server-authoritative — never `x-gym`/a client field) and land on the panel.
 *
 * The one shared exchange keeps both email flows on one route. A failed/absent code
 * falls back to `/entrar`. `next` is constrained to a local path (no open redirect).
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const nextParam = request.nextUrl.searchParams.get("next");
  const next = nextParam && nextParam.startsWith("/") ? nextParam : null;

  if (code) {
    const supabase = await createClient();
    const exchanged = await confirmarCodigo(code, supabase);
    if (exchanged.ok) {
      if (next) {
        return NextResponse.redirect(new URL(next, request.url));
      }
      // Signup confirmation: claim (or create) the cliente in the host-resolved gym.
      const tenant = await resolveTenant(request.headers.get("host"), null);
      if (tenant) {
        try {
          await reclamarCliente(tenant.id, supabase);
        } catch {
          // A failed claim must not strand a verified account — land on the panel;
          // the member can retry / an operator reconciles. The RPC is idempotent.
        }
      }
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return NextResponse.redirect(new URL("/entrar?error=confirmacion", request.url));
}
