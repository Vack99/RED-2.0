"use server";

import { headers } from "next/headers";

import { registrarSocio } from "@gym/data/server/registro";
import { resolveTenant } from "@gym/data/server/resolve-tenant";

/**
 * Registration server action. The gym is re-resolved SERVER-SIDE from the host
 * (never a client field / the `x-gym` header — ADR-0008/0009): an unknown host
 * refuses. The email confirmation lands back on THIS host's `/auth/confirm`, where
 * the same host resolves the gym for the atomic claim. Server Functions are
 * reachable by direct POST, so this re-resolution is the authoritative gate.
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

  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${host}`;
  const result = await registrarSocio(
    {
      nombre: formData.get("nombre"),
      email: formData.get("email"),
      password: formData.get("password"),
      telefono: formData.get("telefono"),
      acepta: formData.get("acepta") === "on",
    },
    { emailRedirectTo: `${origin}/auth/confirm` },
  );

  return result.ok ? { status: "success" } : { status: "error", error: result.error };
}
