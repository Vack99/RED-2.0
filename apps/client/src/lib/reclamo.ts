import "server-only";

import { headers } from "next/headers";

import { getMarketingGym } from "@gym/data/server/marketing";
import { intentarReclamoPorEmail } from "@gym/data/server/registro";
import { resolveTenant } from "@gym/data/server/resolve-tenant";
import type { SupabaseServer } from "@gym/data/server/supabase";

import { avisoVersionParaGym } from "./aviso-legal";

/**
 * El reclamo EN CADA SESIÓN — the one claim-on-mint call site every door shares
 * (design 2026-09-03 §3, A1/A2; owner ruling R2).
 *
 * The identity key is the VERIFIED email, so the moment a session is minted the platform
 * knows who this is and can bind this gym's roster row. Before this the bind ran at exactly
 * ONE moment (`/auth/confirm`'s plain-signup arm, and only when no `next` rode the URL), so
 * password login, password recovery and `/codigo` minted sessions that claimed nothing —
 * and a miss was permanent and silent (M1/M3; the 09-03 hand-link by SQL).
 *
 * Since the claim RPC is LINK-ONLY (R1 — it may bind an existing unclaimed row of THIS gym
 * and nothing else), running it at every mint cannot mint a phantom cliente or a
 * `gym_membership` in a gym a query string named. That is the red team's §4 ship-gate, and
 * it is what makes "everywhere" safe rather than merely aggressive.
 *
 * FAIL-SOFT by construction: `intentarReclamoPorEmail` already returns a refusal as a VALUE,
 * and the tenant/aviso LOOKUPS are wrapped, so nothing here can keep a verified member from
 * landing. Returns whether a claim actually ran green, which is only ever used to decide
 * whether re-reading the membership is worth a round trip.
 */
export async function reclamarEnHost(
  supabase: SupabaseServer,
  opts: { conAviso?: boolean } = {},
): Promise<boolean> {
  try {
    const tenant = await resolveTenant((await headers()).get("host"), null);
    // No `gym_domain` row matched (previews, the bare `.vercel.app`, plain dev): there is no
    // gym in effect, so there is nothing to claim into. Never a default gym (ADR-0008/0009).
    if (!tenant) return false;
    // `conAviso` only where the door RENDERED the aviso (the /registro → confirm rail).
    // A login or a self-heal shows no consent text, so it stamps an honest null rather than
    // fabricating evidence for text the member never saw (#257, final review Important 1).
    const avisoVersion = opts.conAviso
      ? await avisoVersionParaGym(await getMarketingGym(tenant.slug))
      : null;
    const resultado = await intentarReclamoPorEmail(tenant.id, avisoVersion, supabase);
    if (!resultado.ok) {
      // The only sink this repo has (no log drain — design §6 BP4). Never the address.
      console.warn(JSON.stringify({ event: "reclamo-fallo", motivo: resultado.motivo }));
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
