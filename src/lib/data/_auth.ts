import "server-only";

import type { SupabaseServer } from "@/lib/supabase/server";

/**
 * The DAL's operator-auth guard. A leading underscore keeps this out of the
 * sector vocabulary (it's plumbing, not a domain noun) — the `_components`
 * convention in the app dir, applied to the data seam.
 *
 * RLS is the hard authorization boundary (ADR-0001); this is the cheap
 * defense-in-depth presence check the money-path writers share. Authorize with
 * `getClaims()`, never `getSession()`.
 *
 * Returns the operator user id (the claim `sub`). A writer that only needs the
 * presence check (the RPC stamps the operator server-side via SECURITY INVOKER)
 * can call it for the throw and ignore the return.
 */
export async function requireOperator(supabase: SupabaseServer): Promise<string> {
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) throw new Error("No autenticado");
  return claims.claims.sub;
}
