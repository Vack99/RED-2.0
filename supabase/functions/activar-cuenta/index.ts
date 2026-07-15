/**
 * Activation Edge Function (issue #131, PRD #130) — the backend door for single-email
 * member activation. Takes a claim code + the email the member typed + an HMAC firma
 * minted by the client-app server, verifies the firma, matches the typed email against
 * the unclaimed roster row, provisions the auth user (email pre-confirmed — the
 * invitation delivered to that inbox IS the verification) if absent, and returns a
 * recovery `token_hash` the client-app server action consumes to establish a session.
 *
 * DEPLOY: via Supabase MCP `deploy_edge_function` with `verify_jwt: false`. The caller
 * has no JWT (activation runs before any session exists) — the firma is the authn.
 *
 * SECRET (set per environment via `supabase secrets set` / dashboard, NEVER in git):
 *   TENANT_ASSERTION_KEY — the SAME value as the Vault `tenant_assertion_key` (#93); the
 *   client-app server signs `${codigo}:${email}` with it. SUPABASE_URL +
 *   SUPABASE_SERVICE_ROLE_KEY are auto-injected; the service-role capability lives ONLY
 *   here — the apps keep the no-service-role property.
 *
 * THIN by contract: every decision (parse, firma verify, roster→decision, provisioning
 * error class, outcome→HTTP) lives in the pure `nucleo.ts`; this shell only reads env,
 * looks up the row, calls the admin API, and maps the outcome. NEVER log the token_hash,
 * firma, or email — status/code only.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import {
  decidir,
  esErrorEmailExistente,
  parseSolicitud,
  respuesta,
  verificarFirma,
  type FilaRoster,
} from "./nucleo.ts";

const tenantKey = Deno.env.get("TENANT_ASSERTION_KEY") ?? "";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function responder(status: number, body: string): Response {
  return new Response(body, { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return responder(405, JSON.stringify({ error: "method_not_allowed" }));
  }

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    cuerpo = null;
  }
  const sol = parseSolicitud(cuerpo);
  if (!sol) {
    // Unparseable / malformed → no valid firma → deny (see parseSolicitud).
    return responder(401, JSON.stringify({ error: "firma_invalida" }));
  }

  if (tenantKey === "") {
    // Web Crypto rejects an empty HMAC key, so without this guard a missing secret
    // surfaces as an opaque 500 from the runtime. Name the misconfig instead.
    console.error("activar-cuenta: TENANT_ASSERTION_KEY ausente");
    return responder(500, JSON.stringify({ error: "error_interno" }));
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Verify the firma BEFORE touching the DB — a forged request costs no query and never
  // reveals whether a code exists.
  const firmaOk = await verificarFirma(tenantKey, sol.codigo, sol.email, sol.firma);
  let fila: FilaRoster | null = null;
  if (firmaOk) {
    const { data } = await admin
      .from("clientes")
      .select("email, auth_user_id")
      .eq("claim_code", sol.codigo)
      .maybeSingle();
    fila = data;
  }

  const decision = decidir({ firmaOk, fila, email: sol.email });
  if (!decision.ok) {
    const out = respuesta({ ok: false, error: decision.error });
    return responder(out.status, out.body);
  }

  // Provision the auth user with the email pre-confirmed. A server-consumable token is
  // minted ONLY for accounts this activation itself provisions. If the email already has
  // an account (a member of a second gym), return `cuenta_existente` and mint NOTHING —
  // handing a live session to a pre-existing account with no inbox proof would let a
  // hostile operator take it over. The caller falls to the recovery rail (inbox proof).
  const { error: createErr } = await admin.auth.admin.createUser({
    email: decision.email,
    email_confirm: true,
  });
  if (createErr) {
    if (esErrorEmailExistente(createErr)) {
      const out = respuesta({ ok: false, error: "cuenta_existente" });
      return responder(out.status, out.body);
    }
    console.error(`activar-cuenta: createUser ${createErr.code ?? createErr.status ?? "error"}`);
    return responder(500, JSON.stringify({ error: "error_interno" }));
  }

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: decision.email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkErr || !tokenHash) {
    console.error(`activar-cuenta: generateLink ${linkErr?.code ?? linkErr?.status ?? "sin token"}`);
    return responder(500, JSON.stringify({ error: "error_interno" }));
  }

  const out = respuesta({ ok: true, tokenHash });
  return responder(out.status, out.body);
});
