import "server-only";

import { createHmac } from "node:crypto";

import { confirmarTokenHash } from "./sesion";
import { type SupabaseServer } from "./supabase";

/**
 * Single-email member activation DAL (PRD #130, issue #132). The client-app side of
 * the activation door: `iniciarActivacion` mints the tenant firma, calls the
 * `activar-cuenta` edge function (issue #131), and — on success — consumes the
 * returned recovery `token_hash` to establish a live session in the SAME request. The
 * privileged provisioning (createUser/generateLink) lives ONLY in the edge function's
 * environment — the apps keep the no-service-role property (ADR/#126).
 *
 * Ordering (the #126 ruling): the claim NEVER runs in `iniciarActivacion` — it waits
 * for the set-password step (#133), so an abandoned activation leaves the claim code
 * intact and the emailed link re-usable. `client` is injectable for tests (ADR-0001).
 */

/** The activation error taxonomy the form keys on. The first five mirror the edge
 *  function's codes (nucleo.ts `ErrorActivacion`); `error_interno` folds together
 *  405/500, a network failure, a missing token, and a failed session verify — every
 *  path where the member should just retry. */
export type ErrorActivacion =
  | "firma_invalida"
  | "codigo_invalido"
  | "ya_reclamado"
  | "sin_email"
  | "email_no_coincide"
  | "error_interno";

/** The edge codes that map through 1:1 (everything else collapses to error_interno). */
const CODIGOS_EDGE: ReadonlySet<string> = new Set<ErrorActivacion>([
  "firma_invalida",
  "codigo_invalido",
  "ya_reclamado",
  "sin_email",
  "email_no_coincide",
]);

/** Discriminated result — expected failures are values, never throws, so the action
 *  renders one message surface. `ok:true` means the session cookies are now set. */
export type IniciarActivacionResultado =
  | { ok: true }
  | { ok: false; error: ErrorActivacion };

/**
 * The tenant firma the edge function verifies (contract in nucleo.ts): HMAC-SHA256
 * over the NORMALIZED `${codigo}:${email}` — codigo upper-cased, email
 * lower-cased/trimmed, lowercase hex — with the tenant-assertion key only the server
 * and the edge function hold (#93's `uid:gym_id` firma reuses the same key, different
 * message). Normalizes here so the digest matches whatever the caller passed in.
 */
export function firmaActivacion(codigo: string, email: string): string {
  const key = process.env.TENANT_ASSERTION_KEY;
  if (!key) throw new Error("TENANT_ASSERTION_KEY no configurada");
  const mensaje = `${codigo.trim().toUpperCase()}:${email.trim().toLowerCase()}`;
  return createHmac("sha256", key).update(mensaje).digest("hex");
}

/**
 * Open the activation door: normalize the inputs, mint the firma, POST to the
 * `activar-cuenta` edge function, and — on 200 — consume the recovery `token_hash`
 * via the existing token-hash session path (`confirmarTokenHash`), establishing the
 * session cookies. Every expected outcome is a typed value; a network/parse failure
 * or a failed verify folds to `error_interno`. NEVER runs the claim (that waits for
 * the set-password step — see the module note). `fetchFn`/`client` inject for tests
 * (ADR-0001); prod uses global `fetch` + the per-request cached client.
 */
export async function iniciarActivacion(
  input: { codigo: string; email: string },
  opts: { fetchFn?: typeof fetch; client?: SupabaseServer } = {},
): Promise<IniciarActivacionResultado> {
  const codigo = input.codigo.trim().toUpperCase();
  const email = input.email.trim().toLowerCase();

  let firma: string;
  try {
    firma = firmaActivacion(codigo, email);
  } catch {
    return { ok: false, error: "error_interno" };
  }

  const doFetch = opts.fetchFn ?? fetch;
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/activar-cuenta`;
  // verify_jwt:false on the function, but the Supabase gateway still expects the
  // publishable apikey (the same header supabase-js's functions.invoke sends).
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

  let tokenHash: string;
  try {
    const res = await doFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anon,
        Authorization: `Bearer ${anon}`,
      },
      body: JSON.stringify({ codigo, email, firma }),
    });
    if (!res.ok) {
      const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null;
      const codigoError = cuerpo?.error ?? "";
      return {
        ok: false,
        error: CODIGOS_EDGE.has(codigoError) ? (codigoError as ErrorActivacion) : "error_interno",
      };
    }
    const cuerpo = (await res.json().catch(() => null)) as { token_hash?: string } | null;
    if (!cuerpo?.token_hash) return { ok: false, error: "error_interno" };
    tokenHash = cuerpo.token_hash;
  } catch {
    return { ok: false, error: "error_interno" };
  }

  // Consume the recovery token → session cookies, same path the Send Email Hook uses.
  const sesion = await confirmarTokenHash("recovery", tokenHash, opts.client);
  return sesion.ok ? { ok: true } : { ok: false, error: "error_interno" };
}
