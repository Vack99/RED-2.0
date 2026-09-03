"use server";

import { redirect } from "next/navigation";

import { confirmarCodigoDeCorreo } from "@gym/data/server/sesion";

/**
 * The OTP-code door (2026-08-30 shield plan, fable verdict #1). The confirmation mail
 * prints a 6-digit code beside the link; typing it here verifies the same OTP the link
 * would have redeemed, so a member whose link died — stripped query, in-app-webview
 * rewrite, a prefetcher burning the single-use token_hash, the wrong host's cookie jar —
 * still gets in by hand.
 *
 * On success we land on `/reservar` rather than re-running the claim here: that page
 * already re-runs the idempotent claim (`lib/reclamo.ts`) for a session with no membership
 * in the gym in effect, so the self-heal has exactly one home.
 *
 * Every refusal is ONE message. A code that is wrong, expired, already spent, or belongs
 * to an address with no account must be indistinguishable — otherwise this door becomes
 * the enumeration oracle `/entrar` refuses to be.
 */
export type CodigoActionState = { status: "idle" } | { status: "error"; error: string };

const RECHAZADO =
  "Ese código no es válido o ya expiró. Pide un correo nuevo y usa el código más reciente.";

export async function codigoAction(
  _prev: CodigoActionState,
  formData: FormData,
): Promise<CodigoActionState> {
  const email = String(formData.get("email") ?? "").trim();
  // Members paste the code with spaces around it, and mail clients turn it into a link
  // often enough that a stray character is normal input, not an attack.
  const codigo = String(formData.get("codigo") ?? "").replace(/\D/g, "");
  if (!email || codigo.length !== 6) return { status: "error", error: RECHAZADO };

  const result = await confirmarCodigoDeCorreo(email, codigo);
  if (!result.ok) return { status: "error", error: RECHAZADO };
  redirect("/reservar");
}
