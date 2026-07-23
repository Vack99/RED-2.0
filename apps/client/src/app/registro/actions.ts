"use server";

import { headers } from "next/headers";

import { firmaCodigo, parseCodigoInvitacion, registrarSocio } from "@gym/data/server/registro";
import { resolveTenant } from "@gym/data/server/resolve-tenant";

import { verificarTurnstile } from "../../lib/turnstile";

/**
 * Registration server action. The gym is re-resolved SERVER-SIDE from the host
 * (never a client field / the `x-gym` header — ADR-0008/0009): an unknown host
 * refuses. The email confirmation lands back on THIS host's `/auth/confirm`, where
 * the same host resolves the gym for the atomic claim. Server Functions are
 * reachable by direct POST, so this re-resolution is the authoritative gate.
 *
 * The Turnstile captcha is verified HERE, before the signUp, so the shared-project
 * auth quota can't be spammed by bots (the abuse posture the data-model doc assigns
 * to registration). A direct-POST caller that skips the widget has no valid token,
 * so the verifier fails closed and the write never happens.
 */
export type RegistroActionState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "success" };

export async function registrarAction(
  _prev: RegistroActionState,
  formData: FormData,
): Promise<RegistroActionState> {
  const h = await headers();
  const host = h.get("host");
  const tenant = await resolveTenant(host, null);
  if (!tenant) {
    return { status: "error", error: "No pudimos identificar el gimnasio de este sitio." };
  }

  const token = formData.get("cf-turnstile-response");
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const humano = await verificarTurnstile(typeof token === "string" ? token : null, ip);
  if (!humano) {
    return { status: "error", error: "No pudimos verificar que no eres un robot. Intenta de nuevo." };
  }

  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${host}`;
  // A valid invite code carries through the confirmation round trip so `/auth/confirm`
  // (or the confirmation-off path in `registrarSocio`) binds the login to the code's
  // exact paid row; junk/no code degrades to a plain signup (ADR-0015). The `firma`
  // rides alongside the code — minted server-side here (after the Turnstile gate) so the
  // firma-gated claim RPC accepts it at `/auth/confirm` (audit §3). The firma binds the
  // CODE, not the caller: it closes the direct-PostgREST (H1) and recovery-append (H2v1)
  // vectors and stops a third party swapping in a different codigo in transit (no matching
  // firma → refuse). It does NOT stop a holder of a leaked code from registering their OWN
  // inbox and claiming it here — that is the accepted ADR-0015 bearer residual (same class
  // as the /activar `vincular` short-circuit the owner opted into). Fully closing it means
  // removing this legacy claim arm (the invite email now targets /activar) or recipient-
  // binding the code — owner decision, tracked in the 2026-07-22 activation audit §3.
  const codigo = parseCodigoInvitacion(formData.get("codigo"));
  const confirmUrl = codigo
    ? `${origin}/auth/confirm?codigo=${codigo}&firma=${firmaCodigo(codigo)}`
    : `${origin}/auth/confirm`;
  const result = await registrarSocio(
    {
      nombre: formData.get("nombre"),
      email: formData.get("email"),
      password: formData.get("password"),
      telefono: formData.get("telefono"),
      acepta: formData.get("acepta") === "on",
    },
    { emailRedirectTo: confirmUrl, codigo },
  );

  return result.ok ? { status: "success" } : { status: "error", error: result.error };
}
