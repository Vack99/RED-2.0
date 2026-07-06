"use server";

import { headers } from "next/headers";

import { enviarMensajeContacto } from "@gym/data/server/marketing";
import { resolveTenant } from "@gym/data/server/resolve-tenant";

import { verificarTurnstile } from "../../lib/turnstile";

/**
 * Contact-form intake action. The gym is re-resolved SERVER-SIDE from the host (never a client field —
 * ADR-0012), so a spoofed slug cannot redirect a lead. Order: cheap field validation → captcha verify →
 * the guarded RPC (which owns the per-IP rate limit). Field errors mirror the mock's inline messages;
 * everything else collapses to one friendly error (no internals leaked).
 */
const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type ContactoActionState =
  | { status: "idle" }
  | { status: "invalid"; fields: { nombre?: boolean; correo?: boolean; mensaje?: boolean } }
  | { status: "error"; error: string }
  | { status: "success" };

export async function enviarContactoAction(
  _prev: ContactoActionState,
  formData: FormData,
): Promise<ContactoActionState> {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const correo = String(formData.get("correo") ?? "").trim();
  const mensaje = String(formData.get("mensaje") ?? "").trim();
  const token = formData.get("cf-turnstile-response");

  const fields = {
    nombre: nombre.length < 2,
    correo: !emailRe.test(correo),
    mensaje: mensaje.length < 4,
  };
  if (fields.nombre || fields.correo || fields.mensaje) {
    return { status: "invalid", fields };
  }

  const h = await headers();
  const tenant = await resolveTenant(h.get("host"), null);
  if (!tenant) {
    return { status: "error", error: "No pudimos identificar el gimnasio de este sitio." };
  }

  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || null;

  const captchaOk = await verificarTurnstile(typeof token === "string" ? token : null, ip);
  if (!captchaOk) {
    return { status: "error", error: "No pudimos verificar que no eres un robot. Intenta de nuevo." };
  }

  try {
    await enviarMensajeContacto({ gymSlug: tenant.slug, nombre, correo, mensaje, ip });
  } catch {
    return { status: "error", error: "No pudimos enviar tu mensaje. Intenta de nuevo en un momento." };
  }

  return { status: "success" };
}
