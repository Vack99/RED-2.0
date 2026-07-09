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

/** An invite code as it rides the `?codigo=` query param: 8 chars from the
 *  A-Z/2-9 alphabet (ADR-0015), case-normalized. Kept private — the edges below
 *  validate through `parseCodigoInvitacion`. */
const codigoInvitacionSchema = z.string().trim().toUpperCase().regex(/^[A-Z2-9]{8}$/);

/** Normalize + validate an invite code from an untrusted query param; `null` when
 *  it isn't a well-formed code, so every entry point (registro page, confirm route,
 *  register action) degrades to a plain signup instead of throwing on junk input. */
export function parseCodigoInvitacion(raw: unknown): string | null {
  const parsed = codigoInvitacionSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
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
  opts: { emailRedirectTo: string; codigo?: string | null },
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
  const requiereConfirmacion = data.session === null;

  // Confirmation-OFF: signUp already established a session (auto-confirmed), so no
  // `/auth/confirm` round trip runs — bind the invite here on that same client.
  // Best-effort: a failed claim never fails signup (idempotent claim rerun heals it).
  if (!requiereConfirmacion && opts.codigo) {
    try {
      await reclamarPorCodigo(opts.codigo, supabase);
    } catch {
      // swallowed — verified account stands; the code stays live for a retry.
    }
  }
  return { ok: true, requiereConfirmacion };
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

/** The invite-code claim RPC's row DTO (the gym slug for the post-claim redirect),
 *  derived from the generated types so it can't drift from the migration. */
export type ReclamoPorCodigo =
  Database["public"]["Functions"]["reclamar_por_codigo"]["Returns"][number];

/**
 * Invite-token claim (ADR-0015 primary rail). Binds the caller's verified login to
 * the EXACT paid `clientes` row the code names — the code resolves the row, the row
 * resolves the gym, so no `gymId` (or host) is passed: gym is not an authz input.
 * The definer RPC re-checks the verified email, overwrites the row email, clears the
 * code, and upserts membership; it THROWS on a dead code / already-owned row, so the
 * caller (confirm route) swallows to keep a verified account from stranding.
 */
export async function reclamarPorCodigo(
  codigo: string,
  client?: SupabaseServer,
): Promise<ReclamoPorCodigo> {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase
    .rpc("reclamar_por_codigo", { p_codigo: codigo })
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "No se pudo reclamar la invitación");
  }
  return data;
}

/** The pre-signup invite projection DTO ({gym nombre, gym slug, cliente nombre}). */
export type InvitacionInfo =
  Database["public"]["Functions"]["invitacion_info"]["Returns"][number];

/**
 * Pre-signup lookup for `/registro?codigo=` — returns the {gym, member first name}
 * identity banner for a valid unclaimed code, or `null` for an unknown/dead code
 * (the page then degrades to a plain signup). Bearer-token disclosure by design
 * (ADR-0015): holding the code reveals a first name + gym, nothing more.
 */
export async function invitacionInfo(
  codigo: string,
  client?: SupabaseServer,
): Promise<InvitacionInfo | null> {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase
    .rpc("invitacion_info", { p_codigo: codigo })
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}
