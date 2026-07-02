import "server-only";

import { z } from "zod";

import { isTelValido, telDigits } from "@gym/format";

import type { Database } from "../database.types";
import { createClient, type SupabaseServer } from "./supabase";

/**
 * Member self-registration + verified-email claim DAL (ADR-0009 as amended
 * 2026-07-02). The write seam behind the client app's unstyled `/registro` +
 * `/auth/confirm` flow: `registrarSocio` signs the person up (email+password) and
 * stashes their OWN name + phone in the auth user's metadata; the atomic definer
 * RPC `reclamar_o_crear_cliente` (invoked post-verification by `reclamarCliente`)
 * matches their VERIFIED email to an unclaimed `cliente` in the host-resolved gym
 * — else mints a fresh one — and writes the `gym_membership(member)` row in one
 * transaction. The gym is NEVER a field here: it is re-resolved server-side from
 * the host and passed to the RPC (ADR-0008/0009 server-authoritative gym).
 */

// One required checkbox stamps BOTH terms + privacy acceptance (ADR-0009); the DB
// rules it mirrors: nombre NOT NULL, tel = 10 digits (clientes_tel_10_digits_ck).
export const registroSchema = z.object({
  nombre: z.string().trim().min(3, "El nombre es demasiado corto"),
  email: z.string().trim().email("Correo inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  telefono: z.string().refine(isTelValido, "Teléfono inválido (10 dígitos)"),
  acepta: z
    .boolean()
    .refine((v) => v === true, "Debes aceptar los términos y el aviso de privacidad"),
});

export type RegistroInput = z.infer<typeof registroSchema>;

/** MX national 10-digit number → E.164 (`+52` + the stripped digits). */
export function telefonoAE164(telefono: string): string {
  return `+52${telDigits(telefono)}`;
}

/** The claim RPC's row DTO, DERIVED from the generated types so it cannot drift
 *  from the migration's `returns table(cliente_id, reclamado)`. */
export type ReclamoCliente =
  Database["public"]["Functions"]["reclamar_o_crear_cliente"]["Returns"][number];

/** signUp outcome — a discriminated result so the action renders one message
 *  surface without throwing on the expected validation/duplicate paths. */
export type RegistroResultado =
  | { ok: true; requiereConfirmacion: boolean }
  | { ok: false; error: string };

/**
 * Self-register a socio. Validates the intake, then `signUp` with the person's
 * name + E.164 phone in `options.data` (→ `auth.users.raw_user_meta_data`, which
 * the claim RPC reads on the create path). Confirm-email-required means no session
 * exists until verification, so `requiereConfirmacion` is `session === null`.
 * `client` is injectable for tests (ADR-0001).
 */
export async function registrarSocio(
  raw: unknown,
  opts: { emailRedirectTo: string },
  client?: SupabaseServer,
): Promise<RegistroResultado> {
  const parsed = registroSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const input = parsed.data;
  const supabase = client ?? (await createClient());

  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: opts.emailRedirectTo,
      data: { full_name: input.nombre, phone_e164: telefonoAE164(input.telefono) },
    },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, requiereConfirmacion: data.session === null };
}

/**
 * Post-verification claim-or-create. `gymId` is the caller's host-resolved tenant,
 * passed by the confirm route — NEVER a client field (ADR-0009). The RPC re-checks
 * `email_confirmed_at` (defense-in-depth), matches on VERIFIED email only (phone
 * never claims; ambiguous → create), and commits the member membership atomically.
 */
export async function reclamarCliente(
  gymId: string,
  client?: SupabaseServer,
): Promise<ReclamoCliente> {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase
    .rpc("reclamar_o_crear_cliente", { p_gym_id: gymId })
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "No se pudo completar el registro");
  }
  return data;
}
