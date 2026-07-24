"use server";

import { headers } from "next/headers";

import { registrarSocio } from "@gym/data/server/registro";
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
  // Plain host-scoped self-registration: the confirmation lands on `/auth/confirm`, which
  // claims by verified email (ADR-0009 fallback rail). The invite-code claim arm was removed
  // here (H2v2 option b) — the invite email now targets `/activar`, the sole invite door.
  const confirmUrl = `${origin}/auth/confirm`;
  const result = await registrarSocio(
    {
      nombre: formData.get("nombre"),
      email: formData.get("email"),
      password: formData.get("password"),
      telefono: formData.get("telefono"),
      acepta: formData.get("acepta") === "on",
    },
    { emailRedirectTo: confirmUrl },
  );

  return result.ok ? { status: "success" } : { status: "error", error: result.error };
}
