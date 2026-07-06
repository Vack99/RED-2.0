"use server";

import { redirect } from "next/navigation";

import { actualizarPassword } from "@gym/data/server/sesion";

/**
 * Set a new password against the recovery session established by the reset link
 * (exchanged at /auth/confirm before landing here). On success redirect to the panel.
 */
export type RestablecerActionState = { status: "idle" } | { status: "error"; error: string };

export async function restablecerAction(
  _prev: RestablecerActionState,
  formData: FormData,
): Promise<RestablecerActionState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) {
    return { status: "error", error: "La contraseña debe tener al menos 8 caracteres." };
  }
  const result = await actualizarPassword(password);
  if (!result.ok) return { status: "error", error: result.error };
  redirect("/reservar");
}
