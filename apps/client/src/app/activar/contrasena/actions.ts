"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { completarActivacion } from "@gym/data/server/activacion";
import { getMarketingGym } from "@gym/data/server/marketing";
import { parseCodigoInvitacion } from "@gym/data/server/registro";

import { avisoVersionParaGym } from "../../../lib/aviso-legal";

/**
 * Finish activation (issue #133): validate the intake (8-char password + confirm match
 * + terms/privacy gate, parity with self-registration), set the password on the
 * established session, THEN claim the paid roster row, and redirect into the app.
 *
 * A claim failure never surfaces here — `completarActivacion` swallows it (the member is
 * logged in; the code stays live), so an already-claimed re-entry is a success path. No
 * live session (`sin_sesion`) bounces back to the door.
 */
export type ActivarContrasenaActionState =
  | { status: "idle" }
  | { status: "error"; error: string };

export async function activarContrasenaAction(
  _prev: ActivarContrasenaActionState,
  formData: FormData,
): Promise<ActivarContrasenaActionState> {
  const password = String(formData.get("password") ?? "");
  const confirmar = String(formData.get("confirmar") ?? "");
  const acepta = formData.get("acepta") === "on";
  const codigo = parseCodigoInvitacion(formData.get("codigo"));

  if (password.length < 8) {
    return { status: "error", error: "La contraseña debe tener al menos 8 caracteres." };
  }
  if (password !== confirmar) {
    return { status: "error", error: "Las contraseñas no coinciden." };
  }
  if (!acepta) {
    return { status: "error", error: "Debes aceptar los términos y el aviso de privacidad." };
  }
  if (!codigo) {
    return { status: "error", error: "Esta invitación ya no es válida. Contacta a tu gimnasio." };
  }

  // Final review round, Important 1: this page rendered the real simplificado only when the
  // gym's legal identity was complete (activar/contrasena/page.tsx) — recompute that here
  // (never trust a stale render-time flag) via the same host lookup the page itself used, so
  // the stamped version matches what THIS request's gym actually showed.
  const hostGym = (await headers()).get("x-gym");
  const gym = hostGym ? await getMarketingGym(hostGym) : null;
  const result = await completarActivacion({ password, codigo, avisoVersion: await avisoVersionParaGym(gym) });
  if (!result.ok) {
    if (result.error === "sin_sesion") {
      redirect(`/activar?codigo=${codigo}`);
    }
    return { status: "error", error: result.error };
  }
  redirect("/reservar");
}
