/**
 * Send Email Hook (issue #75) — Supabase Edge Function that REPLACES Supabase's
 * built-in auth mailer with gym-branded mail sent through Resend.
 *
 * DEPLOY: via Supabase MCP `deploy_edge_function` with `verify_jwt: false`. The hook
 * fires PRE-JWT — there is no user session when a signup/recovery mail is queued —
 * so JWT verification is off by design; integrity is the Standard Webhooks signature
 * verified below (the shared hook secret), never a JWT. The function is inert until
 * the owner registers the hook in the dashboard (one toggle → rollback to SMTP).
 *
 * SECURITY DEPENDENCY: the minted link's host is trusted ONLY because Supabase clamps
 * `email_data.redirect_to` to the Auth Redirect-URL allow-list (runbook 72 §C). Keep
 * that allow-list host-scoped (`https://<host>/**` per gym) — never a bare
 * `https://**` — or a forged redirect_to could aim the link off-platform.
 *
 * THIN by contract: every decision (link, OTP type, copy, From, outcome→HTTP) lives
 * in the pure `correo.ts`; this Deno shell only verifies, looks up the gym, sends via
 * Resend, and maps the outcome. NEVER log token_hash / token / payload — status only.
 */
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { construirCorreoAuth, respuestaEnvio } from "./correo.ts";

// Supabase hands the hook secret as `v1,whsec_<base64>`; standardwebhooks wants the
// base64 body only. Auto-injected env: SUPABASE_URL, SUPABASE_ANON_KEY (ANON is
// enough — the gym lookup reads only anon-select `gym`/`gym_domain` rows).
const hookSecret = (Deno.env.get("SEND_EMAIL_HOOK_SECRET") ?? "").replace("v1,whsec_", "");
const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Gym display name for branding: the hostname of `redirect_to` (lowercased, exact)
 * → `gym_domain` (app='client') → `gym.brand_name`. Mirrors `resolveTenant`'s proven
 * two-step read. No match / unparseable host → null → the mail degrades to neutral
 * "Notificaciones" copy rather than failing.
 */
async function gymNombrePorHost(redirectTo: string): Promise<string | null> {
  let hostname: string;
  try {
    hostname = new URL(redirectTo).hostname.toLowerCase();
  } catch {
    return null;
  }
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data: domain } = await supabase
    .from("gym_domain")
    .select("gym_id")
    .eq("hostname", hostname)
    .eq("app", "client")
    .maybeSingle();
  if (!domain) return null;
  const { data: gym } = await supabase
    .from("gym")
    .select("brand_name")
    .eq("id", domain.gym_id)
    .maybeSingle();
  return gym?.brand_name ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json(405, { error: { http_code: 405, message: "method not allowed" } });
  }

  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);

  let parsed: {
    user: { email: string };
    email_data: {
      token_hash: string;
      redirect_to: string;
      email_action_type: string;
      site_url: string;
    };
  };
  try {
    parsed = new Webhook(hookSecret).verify(payload, headers) as typeof parsed;
  } catch {
    // Never echo the payload — an invalid signature is opaque.
    return json(401, { error: { http_code: 401, message: "invalid signature" } });
  }

  const { user, email_data } = parsed;
  const gymNombre = await gymNombrePorHost(email_data.redirect_to);

  const mail = construirCorreoAuth({
    emailActionType: email_data.email_action_type,
    tokenHash: email_data.token_hash,
    redirectTo: email_data.redirect_to,
    siteUrl: email_data.site_url,
    gymNombre,
  });

  let status: number | null = null;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: mail.from,
        to: user.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      }),
    });
    status = res.status;
  } catch {
    status = null; // network error → respuestaEnvio maps it to a 503 retry
  }

  const out = respuestaEnvio(status);
  if (status === null || status < 200 || status >= 300) {
    // Status only — never the token/payload (a drop or a retryable failure).
    console.error(`send-email: resend status ${status}`);
  }
  // Always JSON — GoTrue rejects any hook response it can't parse as JSON.
  return new Response(out.body, {
    status: out.status,
    headers: { "Content-Type": "application/json" },
  });
});
