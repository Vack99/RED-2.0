"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { iniciarSesion, reenviarConfirmacion, solicitarReset } from "@gym/data/server/sesion";

import { permitirReenvio } from "../../lib/reenvio-limite";

/**
 * Login + forgot-password + resend-confirmation server actions (ADR-0009: email+password
 * only; ADR-0001: authorization elsewhere uses `getClaims()`, never `getSession()`). On
 * success `redirect` throws a framework control-flow signal, so nothing after it runs.
 */
export type EntrarActionState =
  | { status: "idle" }
  | { status: "error"; error: string; noConfirmado?: boolean };

export async function entrarAction(
  _prev: EntrarActionState,
  formData: FormData,
): Promise<EntrarActionState> {
  const result = await iniciarSesion(
    String(formData.get("email") ?? ""),
    String(formData.get("password") ?? ""),
  );
  // `noConfirmado` is the one failure with a remedy on this screen — it turns the banner
  // into a resend button instead of an instruction the member cannot follow.
  if (!result.ok) {
    return { status: "error", error: result.error, noConfirmado: result.noConfirmado === true };
  }
  redirect("/reservar");
}

export type ResetActionState = { status: "idle" } | { status: "sent" };

export async function resetAction(
  _prev: ResetActionState,
  formData: FormData,
): Promise<ResetActionState> {
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  // Recovery link routes through /auth/confirm (shared PKCE exchange) → /restablecer.
  await solicitarReset(
    String(formData.get("email") ?? ""),
    `${origin}/auth/confirm?next=/restablecer`,
  );
  // Always report "sent" — never leak whether an address is registered.
  return { status: "sent" };
}

/**
 * Resend the signup confirmation mail (shield plan fix 2). Before this the only way to a
 * fresh link was re-POSTing `/registro`, which rotates the single confirmation token away
 * — the retry was the damage (FC-01/FC-02).
 *
 * Always answers "enviado": a registered address, an unregistered one, one already
 * confirmed and one the throttle just refused are indistinguishable from here, the same
 * posture `resetAction` holds. `permitirReenvio` is the app-side cap on the shared 50/hr
 * auth-mail bucket (best-effort, in-process — see its note).
 */
export type ReenviarActionState = { status: "idle" } | { status: "enviado" };

export async function reenviarAction(
  _prev: ReenviarActionState,
  formData: FormData,
): Promise<ReenviarActionState> {
  const email = String(formData.get("email") ?? "").trim();
  if (email && permitirReenvio(email)) {
    const h = await headers();
    const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
    await reenviarConfirmacion(email, `${origin}/auth/confirm`);
  }
  return { status: "enviado" };
}
