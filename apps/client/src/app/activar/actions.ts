"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { iniciarActivacion } from "@gym/data/server/activacion";
import { firmaCodigo, parseCodigoInvitacion, reclamarPorCodigo } from "@gym/data/server/registro";
import { enviarMagicLink } from "@gym/data/server/sesion";

import { verificarTurnstile } from "../../lib/turnstile";

/**
 * Activation server actions. `activarAction` verifies the Turnstile captcha FIRST (fail
 * closed — a direct-POST caller skipping the widget has no valid token), then opens the
 * activation door: `iniciarActivacion` mints the firma, calls the edge function, and
 * on success establishes the session in THIS request. On success we redirect to the
 * set-password step; every expected failure is a typed state the form renders.
 *
 * The claim is NOT run here — it happens only after the password is set (#126), so an
 * abandoned activation leaves the emailed link re-usable.
 *
 * `cuenta_existente` (the email already has an account) is the one path that gets NO
 * server-consumable token — provisioning a session for a pre-existing account with no
 * inbox proof would let a hostile operator take it over. Instead we send that account a
 * passwordless SIGN-IN link (audit 2026-07-22 §4 — never a password reset); clicking it
 * proves the inbox, binds this gym's membership (codigo+firma) at `/auth/confirm`, and
 * lands on `/reservar`, password untouched.
 *
 * `vincularAction` is the logged-in short-circuit (§4 Step 1): a member already signed in
 * on this device claims the invite in one click — no email, no password.
 */
export type ActivarActionState =
  | { status: "idle" }
  | { status: "yaReclamado" }
  | { status: "cuentaExistente" }
  | { status: "error"; mensaje: string; login?: boolean };

const GENERICO = "No pudimos activar tu cuenta. Intenta de nuevo.";

export async function activarAction(
  _prev: ActivarActionState,
  formData: FormData,
): Promise<ActivarActionState> {
  const codigo = parseCodigoInvitacion(formData.get("codigo"));
  if (!codigo) {
    return {
      status: "error",
      mensaje: "Esta invitación ya no es válida. Contacta a tu gimnasio.",
      login: true,
    };
  }
  const email = String(formData.get("email") ?? "");

  const h = await headers();
  const token = formData.get("cf-turnstile-response");
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const humano = await verificarTurnstile(typeof token === "string" ? token : null, ip);
  if (!humano) {
    return { status: "error", mensaje: "No pudimos verificar que no eres un robot. Intenta de nuevo." };
  }

  const result = await iniciarActivacion({ codigo, email });
  if (result.ok) {
    redirect(`/activar/contrasena?codigo=${codigo}`);
  }

  switch (result.error) {
    case "email_no_coincide":
      return {
        status: "error",
        mensaje: "Ese correo no coincide con el que registró tu gimnasio. Verifícalo con tu gimnasio.",
      };
    case "ya_reclamado":
      return { status: "yaReclamado" };
    case "cuenta_existente": {
      // No token was minted (inbox proof required). Send a passwordless SIGN-IN link
      // (audit §4) — never a password reset — pointed at /auth/confirm, which binds this
      // gym's membership (codigo+firma) on the verified session and lands on /reservar.
      // The firma is minted here and rides the link so the firma-gated claim accepts it
      // (TENANT_ASSERTION_KEY is present — iniciarActivacion just used it to reach here).
      const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
      await enviarMagicLink(
        email,
        `${origin}/auth/confirm?codigo=${codigo}&firma=${firmaCodigo(codigo)}&next=/reservar`,
      );
      return { status: "cuentaExistente" };
    }
    case "codigo_invalido":
      return {
        status: "error",
        mensaje: "Esta invitación ya no es válida. Contacta a tu gimnasio.",
        login: true,
      };
    default:
      return { status: "error", mensaje: GENERICO };
  }
}

/** §4 Step 1 (audit 2026-07-22): the logged-in short-circuit. A member already signed in
 *  on this device claims the invite in ONE click — no email, no password. Turnstile-gated
 *  like `activarAction` (server actions are directly POST-reachable); on success the
 *  firma-gated claim binds the code's paid row to the CURRENT session and lands on
 *  /reservar. A claim hiccup (dead / already-owned code) never strands a logged-in member
 *  — redirect in regardless, mirroring `finalizarAuth`. */
export type VincularActionState = { status: "idle" } | { status: "error"; mensaje: string };

export async function vincularAction(
  _prev: VincularActionState,
  formData: FormData,
): Promise<VincularActionState> {
  const codigo = parseCodigoInvitacion(formData.get("codigo"));
  if (!codigo) {
    return { status: "error", mensaje: "Esta invitación ya no es válida. Contacta a tu gimnasio." };
  }

  const h = await headers();
  const token = formData.get("cf-turnstile-response");
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const humano = await verificarTurnstile(typeof token === "string" ? token : null, ip);
  if (!humano) {
    return { status: "error", mensaje: "No pudimos verificar que no eres un robot. Intenta de nuevo." };
  }

  try {
    await reclamarPorCodigo(codigo, firmaCodigo(codigo));
  } catch {
    // Swallowed (mirrors finalizarAuth): the member is logged in; a dead/already-owned
    // code must not strand them — they reach the app either way.
  }
  redirect("/reservar");
}
