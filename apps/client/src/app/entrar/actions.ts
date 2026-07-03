"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { iniciarSesion, solicitarReset } from "@gym/data/server/sesion";

/**
 * Login + forgot-password server actions (ADR-0009: email+password only; ADR-0001:
 * authorization elsewhere uses `getClaims()`, never `getSession()`). On success
 * `redirect` throws a framework control-flow signal, so nothing after it runs.
 */
export type EntrarActionState = { status: "idle" } | { status: "error"; error: string };

export async function entrarAction(
  _prev: EntrarActionState,
  formData: FormData,
): Promise<EntrarActionState> {
  const result = await iniciarSesion(
    String(formData.get("email") ?? ""),
    String(formData.get("password") ?? ""),
  );
  if (!result.ok) return { status: "error", error: result.error };
  redirect("/");
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
