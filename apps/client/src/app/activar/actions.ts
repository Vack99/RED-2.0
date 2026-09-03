"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { iniciarActivacion } from "@gym/data/server/activacion";
import { intentarReclamoPorCodigo, parseCodigoInvitacion } from "@gym/data/server/registro";

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
 * `cuenta_existente` (the email already has an account) still gets NO server-consumable
 * token — provisioning a session for a pre-existing account with no inbox proof would let a
 * hostile operator take it over. It now sends NOTHING AT ALL and says "inicia sesión"
 * (owner ruling R2, 2026-09-03). The magic link it used to send was a second mail into the
 * same GoTrue per-address bucket the member had usually just spent at `/registro`, so the
 * rescue rail's own 60 s throttle answered 429 and the screen said "NO SALIÓ EL CORREO" —
 * two members hit exactly that on 09-01. Nothing is lost by deleting it: login now runs the
 * claim itself (`lib/reclamo.ts`), so signing in with the same address binds this gym's row
 * on that very request.
 *
 * `vincularAction` is the logged-in short-circuit (§4 Step 1): a member already signed in
 * on this device claims the invite in one click — no email, no password.
 */
export type ActivarActionState =
  | { status: "idle" }
  | { status: "yaReclamado" }
  | { status: "cuentaExistente"; correo: string }
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
    case "cuenta_existente":
      // Sends nothing. Naming the address leaks nothing here — `cuenta_existente` is the
      // premise of this branch, not a disclosure — and it is what lets the screen hand the
      // member a prefilled login instead of a second inbox errand.
      return { status: "cuentaExistente", correo: email };
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

  // Best-effort by the shared ceremony (`intentarReclamoPorCodigo` never throws): the member
  // is logged in, so a dead/already-owned code must not strand them — they reach the app
  // either way. Final review round, Important 1: no aviso is rendered on this page at all —
  // the one-click bind is a bare button, no consent text, no checkbox — so this stamps null
  // rather than a version the member never saw.
  await intentarReclamoPorCodigo(codigo, null);
  redirect("/reservar");
}
