"use server";

import { headers } from "next/headers";

import { permitirReenvio } from "@gym/data/server/reenvio-limite";
import { registrarSocio } from "@gym/data/server/registro";
import { resolveTenant } from "@gym/data/server/resolve-tenant";
import { reenviarConfirmacion } from "@gym/data/server/sesion";

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
  /** A first confirmation mail is on its way. */
  | { status: "success" }
  /** The address is already confirmed — nothing was sent; the door is `/entrar`. */
  | { status: "cuentaExistente" }
  /** A pending signup already existed, so this send replaced the previous link. */
  | { status: "yaEnviado" };

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

  // The three outcomes stay apart all the way to the screen: collapsing them into one
  // "Revisa tu correo" is what left a member resubmitting this form until every link she
  // held was dead (incident 2026-08-30, FC-02/FC-18).
  if (!result.ok) return { status: "error", error: result.error };
  if (result.estado === "cuentaExistente") return { status: "cuentaExistente" };
  if (result.estado === "yaEnviado") return { status: "yaEnviado" };
  return { status: "success" };
}

export type ReenvioActionState = { status: "idle" } | { status: "enviado" };

/**
 * Resend the signup confirmation for the address the member just typed — the control the
 * "abre el más reciente" screen offers instead of resubmitting the whole form (which is
 * what rotates the link). Reports "enviado" unconditionally, the same posture `resetAction`
 * takes: the answer must not reveal whether an address is registered.
 *
 * Gated by the same `permitirReenvio` counter `/entrar`'s resend AND `registrarSocio`'s own
 * signUp spend (`@gym/data/server/reenvio-limite`) — this action has no Turnstile and Server
 * Functions are reachable by direct POST, so without it a scripted loop against one known
 * address would spend the shared 50/hr auth-mail bucket AND rotate that member's live
 * confirmation link every minute (FC-02/FC-09 turned into a remote weapon). A refused send
 * still answers "enviado".
 */
export async function reenviarConfirmacionAction(
  _prev: ReenvioActionState,
  formData: FormData,
): Promise<ReenvioActionState> {
  const email = String(formData.get("email") ?? "").trim();
  if (email && permitirReenvio(email)) {
    const h = await headers();
    const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
    await reenviarConfirmacion(email, `${origin}/auth/confirm`);
  }
  return { status: "enviado" };
}
