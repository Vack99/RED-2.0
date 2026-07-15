"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { iniciarActivacion } from "@gym/data/server/activacion";
import { parseCodigoInvitacion } from "@gym/data/server/registro";

import { verificarTurnstile } from "../../lib/turnstile";

/**
 * Activation server action. Verifies the Turnstile captcha FIRST (fail closed — a
 * direct-POST caller skipping the widget has no valid token), then opens the
 * activation door: `iniciarActivacion` mints the firma, calls the edge function, and
 * on success establishes the session in THIS request. On success we redirect to the
 * set-password step; every expected failure is a typed state the form renders.
 *
 * The claim is NOT run here — it happens only after the password is set (#126), so an
 * abandoned activation leaves the emailed link re-usable.
 */
export type ActivarActionState =
  | { status: "idle" }
  | { status: "yaReclamado" }
  | { status: "error"; mensaje: string };

const GENERICO = "No pudimos activar tu cuenta. Intenta de nuevo.";

export async function activarAction(
  _prev: ActivarActionState,
  formData: FormData,
): Promise<ActivarActionState> {
  const codigo = parseCodigoInvitacion(formData.get("codigo"));
  if (!codigo) {
    return { status: "error", mensaje: "Esta invitación ya no es válida. Contacta a tu gimnasio." };
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
    case "codigo_invalido":
      return { status: "error", mensaje: "Esta invitación ya no es válida. Contacta a tu gimnasio." };
    default:
      return { status: "error", mensaje: GENERICO };
  }
}
