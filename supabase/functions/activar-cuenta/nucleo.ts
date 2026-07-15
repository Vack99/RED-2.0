/**
 * Pure decision core for the activation edge function (issue #131, PRD #130). Every
 * judgement — validating the untrusted POST body, verifying the tenant firma, mapping
 * the roster-row lookup to a decision, classifying a provisioning error, and shaping the
 * HTTP response — lives HERE so vitest + tsc cover it. The sibling `index.ts` is the
 * thin Deno shell (firma key from env, service-role roster lookup, admin
 * createUser/generateLink) and delegates all branching to these functions.
 *
 * NO Deno/Node APIs and NO imports beyond Web Crypto (`crypto.subtle`), which exists in
 * BOTH the Deno runtime and the vitest/node test runner — so the real HMAC digest runs
 * with no Deno import. Mirrors correo.ts (the send-email hook's core).
 */

/** Claim codes: 8 chars from the A-Z/2-9 alphabet (ADR-0015). */
const CODIGO_RE = /^[A-Z2-9]{8}$/;

/** A normalized activation request parsed from the POST body. */
export interface SolicitudActivacion {
  /** Uppercased 8-char claim code. */
  codigo: string;
  /** Lowercased, trimmed email the member typed. */
  email: string;
  /** The server-minted HMAC firma (hex). */
  firma: string;
}

/**
 * Normalize + validate the untrusted JSON body. Codigo upper-cased (and shape-checked
 * against the ADR-0015 alphabet), email lower-cased/trimmed. Returns null for anything
 * structurally broken; the shell denies a null as `firma_invalida` — a body that isn't a
 * well-formed signed request never carries a valid firma (deny by default).
 */
export function parseSolicitud(raw: unknown): SolicitudActivacion | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { codigo, email, firma } = raw as Record<string, unknown>;
  if (typeof codigo !== "string" || typeof email !== "string" || typeof firma !== "string") {
    return null;
  }
  const codigoNorm = codigo.trim().toUpperCase();
  const emailNorm = email.trim().toLowerCase();
  if (!CODIGO_RE.test(codigoNorm) || emailNorm === "" || firma === "") return null;
  return { codigo: codigoNorm, email: emailNorm, firma };
}

/** The message the firma signs: normalized `codigo:email`, colon-separated. */
function mensajeFirma(codigo: string, email: string): string {
  return `${codigo}:${email}`;
}

/** HMAC-SHA256 → lowercase hex, via Web Crypto (portable across Deno + node). */
async function hmacSha256Hex(clave: string, mensaje: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(clave),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const firma = await crypto.subtle.sign("HMAC", key, enc.encode(mensaje));
  return Array.from(new Uint8Array(firma), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verify the tenant firma. CONTRACT — the client-app server mints
 *   firma = hmacSHA256hex(key, `${codigo}:${email}`)
 * over the SAME normalized codigo (upper) + email (lower/trim) `parseSolicitud`
 * produces, with the tenant-assertion key (the mirror of the Vault
 * `tenant_assertion_key`; #93's `uid:gym_id` firma reuses the key with a different
 * message). We recompute and compare. Plain hex equality, not constant-time: extracting
 * a 256-bit digest through network jitter is not a realistic oracle and the key is
 * high-entropy — same posture as the reclamar_o_crear_cliente migration.
 */
export async function verificarFirma(
  clave: string,
  codigo: string,
  email: string,
  firma: string,
): Promise<boolean> {
  return firma === (await hmacSha256Hex(clave, mensajeFirma(codigo, email)));
}

/** The activation error taxonomy (the caller keys on these strings). */
export type ErrorActivacion =
  | "firma_invalida"
  | "codigo_invalido"
  | "ya_reclamado"
  | "sin_email"
  | "email_no_coincide";

/** The roster columns the decision reads (service-role lookup by claim_code). */
export interface FilaRoster {
  email: string | null;
  auth_user_id: string | null;
}

export type Decision =
  | { ok: true; email: string }
  | { ok: false; error: ErrorActivacion };

/**
 * The single gate: given the firma outcome, the roster row (null = no such code), and
 * the normalized typed email, decide whether to provision. Order matters — an invalid
 * firma never reveals whether a code exists; a claimed row is `ya_reclamado` regardless
 * of email. Email match is case-insensitive trim equality (the typed email is already
 * normalized; the row's is normalized here). Whether an auth account already `existente`
 * is NOT decided here — it's a provisioning-time fact the shell discovers.
 */
export function decidir(params: {
  firmaOk: boolean;
  fila: FilaRoster | null;
  email: string;
}): Decision {
  if (!params.firmaOk) return { ok: false, error: "firma_invalida" };
  const { fila, email } = params;
  if (!fila) return { ok: false, error: "codigo_invalido" };
  if (fila.auth_user_id !== null) return { ok: false, error: "ya_reclamado" };
  const filaEmail = (fila.email ?? "").trim().toLowerCase();
  if (filaEmail === "") return { ok: false, error: "sin_email" };
  if (filaEmail !== email) return { ok: false, error: "email_no_coincide" };
  return { ok: true, email: filaEmail };
}

/**
 * Existing-account pass-through: `admin.createUser` fails when the email already has an
 * account (a member of a second gym) — not an error but the existing-account path (skip
 * creation, still mint a recovery link against the existing user). Supabase marks it
 * `code === 'email_exists'` (legacy: an "already been registered" message). Any OTHER
 * createUser failure is real and the shell must surface it.
 */
export function esErrorEmailExistente(error: {
  code?: string;
  message?: string;
}): boolean {
  if (error.code === "email_exists") return true;
  const msg = (error.message ?? "").toLowerCase();
  return msg.includes("already") && msg.includes("regist");
}

/** HTTP status per error code. firma_invalida = 401 (the firma is the authn). */
const ESTADO: Record<ErrorActivacion, number> = {
  firma_invalida: 401,
  codigo_invalido: 404,
  ya_reclamado: 409,
  sin_email: 409,
  email_no_coincide: 422,
};

/**
 * Shape the final HTTP response: 200 `{ token_hash }` on success, else the decision's
 * status + `{ error }`. Mirrors respuestaEnvio (correo.ts) — a pure {status, body} the
 * shell hands straight to `new Response`.
 */
export function respuesta(
  resultado: { ok: true; tokenHash: string } | { ok: false; error: ErrorActivacion },
): { status: number; body: string } {
  if (resultado.ok) {
    return { status: 200, body: JSON.stringify({ token_hash: resultado.tokenHash }) };
  }
  return { status: ESTADO[resultado.error], body: JSON.stringify({ error: resultado.error }) };
}
