# HITL Runbook — Issue #72: Resend live (auth SMTP + invite mail, domain DNS, env vars, Auth URLs)

**Issue:** https://github.com/Vack99/RED-2.0/issues/72 · **Parent:** #64 · **Decisions:** [ADR-0014](../adr/0014-custom-smtp-platform-sender.md) (one platform sender) · [ADR-0015](../adr/0015-invite-token-claim.md) (Resend's duo role) · **Design:** [`docs/superpowers/specs/2026-07-08-member-registration-invite-token-design.md`](../superpowers/specs/2026-07-08-member-registration-invite-token-design.md) §7 · **Label:** `hitl`

This is an **owner-executed, agent-prepared** runbook: every step is a dashboard/DNS action a human performs, each paired with its own verification. Nothing here changes code — the code contract it provisions already shipped (S1 #65, S2 #68, S4 #69 on `main`).

**Resend now serves two roles** (ADR-0015), both wired here:
1. **Supabase custom SMTP** for auth mail — signup-confirmation + password-reset (realizes ADR-0014; subsumes #27's mechanism).
2. **Resend REST API from the admin app** for the invite email itself — `enviarInvitacion` runs in `apps/admin/src/app/(app)/vender/actions.ts`, so its env vars live on the **admin** Vercel project, not client.

> **Supersedes `docs/runbooks/smtp-resend.md` (#27).** That runbook covered SMTP-only. This one absorbs it and adds the invite-mail env vars, the migration deploy, and the Auth-URL config that closes the #63 Slice-0 leftover. Where a value was already flagged there, it is re-flagged here.

**Project ref:** `hjppxawglmukfvsgmcog` · **Supabase URL:** `https://hjppxawglmukfvsgmcog.supabase.co`
**Sending domain:** `ibookit.lat` (SPF/DKIM/DMARC verified live — §A done)
**Known hosts** (post-`ibookit.lat` cutover, `6cf921c`; the `*.vercel.app` hosts are no longer in `gym_domain`):

| gym | client host | admin host |
|---|---|---|
| red | `red.ibookit.lat` | `red-admin.ibookit.lat` |
| forge | `forge.ibookit.lat` | `forge-admin.ibookit.lat` |
| red-demo | `red-demo.ibookit.lat` | `red-demo-admin.ibookit.lat` |
| forge-demo | `forge-demo.ibookit.lat` | `forge-demo-admin.ibookit.lat` |

`app.ibookit.lat` is **unmapped** — the host where `?gym=<slug>` resolves (the fallback funnel).

## OWNER-DECIDE inputs — all RESOLVED (2026-07-09)

| Input | Used in | Value |
|---|---|---|
| Platform sending domain | A, B, D | **`ibookit.lat`** — platform-owned, gym-neutral (ADR-0014). SPF/DKIM/DMARC verified live. |
| Sender name | B, D | **`iBookit`** — the platform brand, never a gym's. Matches the sending domain, so the `From:` line and the link domain agree. |
| Auth email rate limit | B2 | **`50`/hour** — clears the ~member-#30 wall; one runaway hour still cannot spend more than half Resend's free 100/day. |
| `PLATFORM_CLIENT_FALLBACK_HOST` | D | **`app.ibookit.lat`** — unmapped in `gym_domain`, which is precisely why `?gym=<slug>` resolves there. |

Execute the sections **in order** (A→G): DNS before SMTP, SMTP before templates, migrations before the verification walk.

---

## A. Resend — sending domain + API key

Account exists. Goal: a **verified** gym-neutral sending domain and a send-capable API key.

- [ ] **A1. Add the sending domain.** Resend dashboard → **Domains → Add Domain** → enter `ibookit.lat`.
  - *Verify:* the domain appears with status **Not Verified** and a DNS-records panel.
- [ ] **A2. Add the DNS records at your registrar.** Resend shows the exact values — copy them literally (they are per-domain/region). Shape:

  | Type | Host / Name | Value (shape) | Purpose |
  |------|-------------|---------------|---------|
  | TXT  | `send` | `v=spf1 include:amazonses.com ~all` | SPF |
  | TXT / CNAME | `resend._domainkey` (+ any siblings Resend lists) | Resend-provided DKIM key(s) | **DKIM — must PASS** |
  | MX   | `send` | `feedback-smtp.<region>.amazonses.com` (priority 10) | bounce/feedback |
  | TXT  | `_dmarc` | `v=DMARC1; p=none;` | DMARC (recommended) |

  - *Where to read the values:* Resend → Domains → your domain → the **DNS Records** table is the source of truth; ignore the shapes above if they differ.
  - *Verify:* all records saved at the registrar; `dig TXT send.ibookit.lat` (and the DKIM host) return the Resend values. **Typical DNS propagation: minutes to a few hours** (respect the registrar's TTL, often 3600s).
- [ ] **A3. Verify the domain in Resend.** Domains → your domain → **Verify**. Poll until status = **Verified**.
  - *Verify:* status reads **Verified** (green). **Auth mail and invite mail both bounce until this is green — do not proceed to B/D delivery until verified.**
- [ ] **A4. Create the API key.** Resend → **API Keys → Create** → permission **Sending access** (send-only; it does not need domain/read scope). Copy the `re_…` secret once.
  - *Verify:* key created, scope shows **Sending access**. Store it for §B (SMTP password) and §D (`RESEND_API_KEY`) — the same key serves both roles.

> **Testing vs real domain:** Resend's shared `onboarding@resend.dev` sender works **only** to your own account address and is unverified — fine for a first smoke test, wrong for the acceptance gate. All real verification in §F must use the **verified `ibookit.lat` sender**, because deliverability + SPF/DKIM headers are exactly what the gate records.

---

## B. Supabase ↔ Resend — custom SMTP for AUTH mail

Routes Supabase's signup-confirmation + password-reset mail through Resend's SMTP relay. Sender = the **platform-owned** address (ADR-0014), gym-neutral.

- [ ] **B1. Enable custom SMTP.** Dashboard → project `hjppxawglmukfvsgmcog` → **Authentication → Emails → SMTP Settings** → enable **Custom SMTP**:

  | Field | Value |
  |-------|-------|
  | Sender email | `no-reply@ibookit.lat` (ADR-0014 pins the `no-reply` mailbox) |
  | Sender name | `iBookit` — the platform brand, gym-neutral by construction |
  | Host | `smtp.resend.com` |
  | Port | `465` |
  | Username | `resend` |
  | Password | the `re_…` API key from **A4** (SMTP only sends — the send-only scope is correct) |
  | Minimum interval between emails | leave default |

  - *Verify:* settings save without a validation error; the sender address matches the verified domain from **A3**.
- [ ] **B2. Raise the auth email rate limit.** Dashboard → **Authentication → Rate Limits → Rate limit for sending emails**. Post-SMTP the default is **30/hour** — raise to a sane production floor.
  - **DECIDED: `50`/hour.** Clears the ~member-#30 wall the audit hit, while one runaway hour still cannot spend more than half of Resend's free-tier **100 emails/day, 3,000/month** ceiling. Revisit before a real onboarding burst or a paid Resend plan.
  - *Verify:* the saved value reads `50` — above 2/hour, and ≤ what Resend's plan can deliver in a day.
- [ ] **B3. Rewrite the two auth templates (es-MX, gym-neutral, platform-voiced).** Dashboard → **Authentication → Emails → Templates**. Edit **Confirm signup** and **Reset Password**. Per ADR-0014: no gym name, no brand color, plain accessible HTML, keep `{{ .ConfirmationURL }}` intact.

  Checklist per template:
  - [ ] Subject rewritten es-MX, brand-free.
  - [ ] Body es-MX, addresses the member neutrally ("Hola,"), no gym name/logo.
  - [ ] `{{ .ConfirmationURL }}` present as both a button and a copy-paste link.
  - [ ] "If you didn't request this" reassurance line included.

  **Confirm signup** — Subject `Confirma tu cuenta`:
  ```html
  <p>Hola,</p>
  <p>Recibimos una solicitud para crear tu cuenta con este correo. Para activarla, confirma tu dirección:</p>
  <p><a href="{{ .ConfirmationURL }}">Confirmar mi cuenta</a></p>
  <p>Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
  <p>{{ .ConfirmationURL }}</p>
  <p>Si no creaste esta cuenta, puedes ignorar este mensaje.</p>
  ```

  **Reset Password** — Subject `Restablece tu contraseña`:
  ```html
  <p>Hola,</p>
  <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta. Para elegir una nueva, abre este enlace:</p>
  <p><a href="{{ .ConfirmationURL }}">Restablecer mi contraseña</a></p>
  <p>Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
  <p>{{ .ConfirmationURL }}</p>
  <p>Si no solicitaste este cambio, ignora este mensaje; tu contraseña seguirá igual.</p>
  ```
  - *Verify:* both templates saved; a "send test email" (if the dashboard offers it) lands with the new copy. Full delivery is checked in §F.

---

## C. Supabase Auth — URL configuration (closes the #63 Slice-0 leftover)

The confirmation + recovery links Supabase mails must be **allow-listed**, or the click dead-ends. The client app builds each redirect from the **request host** (`${origin}/auth/confirm` — see `apps/client/src/app/registro/actions.ts` + `entrar/actions.ts`), so **every client host** must be listed.

- [ ] **C1. Set the Site URL.** Dashboard → **Authentication → URL Configuration → Site URL**: the primary client host — `https://red.ibookit.lat`.
  - *Verify:* saved; it is a client host (never the admin host), and it is **mapped** in `gym_domain` — the old `red-2-0-client.vercel.app` is now unmapped, so a Site-URL fallback landing there resolves **no tenant** (`DEFAULT_BRAND`).
- [ ] **C2. Add the redirect allow-list.** Same page → **Redirect URLs** → add one wildcard entry per client host:
  - `https://red.ibookit.lat/**`
  - `https://forge.ibookit.lat/**`
  - `https://red-demo.ibookit.lat/**` — *already verified live*: a recovery click resolved `/verify → 303` from this host (auth logs, 2026-07-09).
  - `https://forge-demo.ibookit.lat/**`
  - `https://app.ibookit.lat/**` (unmapped fallback host — the `?gym=<slug>` invite funnel lands here)
  - `http://localhost:3000/**` (client dev — `next dev` default port; keep only if you confirm/reset against local)
  - one `https://<host>/**` line for **each future gym's BYO client domain** as it onboards.
  - *Path pattern in play:* the links resolve to `…/auth/confirm?code=<pkce>` (signup), `…/auth/confirm?codigo=<invite>` (invite claim), and `…/auth/confirm?next=/restablecer` (password reset → lands on `/restablecer`). A single `/**` per host covers all three; if you prefer explicit paths, allow `…/auth/confirm` and `…/restablecer`.
  - *Verify:* each active client host has a matching entry (a click from §F resolves instead of erroring `redirect_to not allowed`).

---

## D. Vercel env vars

`enviarInvitacion` runs in the **admin** app (`apps/admin/.../vender/actions.ts`), so all three invite-mail vars go on the **admin** Vercel project. The **client** project needs **no** new var for this slice.

- [ ] **D1. Set the three admin-project env vars.** Vercel → project **`red-2-0-admin`** → **Settings → Environment Variables** → scope **Production** (add Preview if you test on previews):

  | Name | Value | Notes |
  |------|-------|-------|
  | `RESEND_API_KEY` | the `re_…` key from **A4** | the invite REST call authenticates with this; missing → a clean `no-configurado` skip (sale unaffected) |
  | `RESEND_FROM` | `iBookit <no-reply@ibookit.lat>` | **"Name &lt;addr&gt;" format** the code parses verbatim (see `resendTransport`); gym-neutral name, same domain as §B |
  | `PLATFORM_CLIENT_FALLBACK_HOST` | a client host (see caveat) | hostname only, **no scheme** — the code prepends `https://`; used to build `https://<host>/registro?gym=<slug>&codigo=<code>` for gyms with no mapped client host |

  - *Verify:* the three vars show under Production with non-empty values; `RESEND_FROM` matches `Name <addr>` (angle brackets present).
- [ ] **D2. Redeploy the admin app** so the new env is bound (Vercel env changes need a fresh deploy). Deployments → **Redeploy** the latest Production build.
  - *Verify:* the redeploy shows the new env in its build; a subsequent sale-with-email attempts a send (proven in §F).

> **PLATFORM_CLIENT_FALLBACK_HOST — RESOLVED: `app.ibookit.lat`.** The fallback is only used when a gym has **no** `gym_domain` client row; the URL relies on `?gym=<slug>` being honored. Per `resolveTenant` (`packages/data/src/server/resolve-tenant.ts`), precedence is **host → `?gym=` → null**, so a *mapped* host makes the override structurally inert. `app.ibookit.lat` is **unmapped** in `gym_domain`, which is exactly why `?gym=` resolves there. Set it as a hostname only, no scheme. Gyms that DO have a mapped client host never hit this var.

---

## E. DB deploy — the staged invite-rail migrations

Six migrations are committed on `main` but **not yet applied to live** (the MCP targets prod; see memory `supabase-mcp-bound-to-live`). Apply **in timestamp order** via the phase-1 mechanism (`member-registration-phase1-deploy.md`): **MCP `apply_migration`, not `supabase db push`** — a local↔live history divergence makes a plain push skip out-of-order files. All six are additive/idempotent (expand-only, Forge-safe), so ordering is safe but should still be honored.

- [ ] **E1. Pre-gate dump** (free tier has no PITR) — manual dump per Phase-3 practice → `C:\Users\Aaron\Documents\RED-2.0-backups\`.
  - *Verify:* a fresh dump file exists, dated today.
- [ ] **E2. Apply the six migrations in order** via MCP `apply_migration`:
  1. `20260708190000_drop_set_notificaciones.sql` — drops the orphaned `set_notificaciones` RPC (one-way; the client toggle + its DAL already went in the same slice).
  2. `20260708200000_clientes_claim_code.sql` — adds `clientes.claim_code` + `invitacion_enviada_at` (+ partial unique index).
  3. `20260708200001_registrar_venta_generate_claim_code.sql` — `registrar_venta` mints the code inline (signature unchanged; `create or replace`).
  4. `20260708200002_reclamar_por_codigo_rpc.sql` — the primary claim-by-code rail (SECURITY DEFINER).
  5. `20260708200003_invitacion_info_rpc.sql` — pre-signup `{gym, nombre}` lookup.
  6. `20260708210000_preparar_invitacion_rpc.sql` — `preparar_invitacion` + `marcar_invitacion_enviada` (staff-gated).
  - *Verify:* each `apply_migration` returns success; `list_migrations` shows all six recorded live.
- [ ] **E3. Advisor check.** MCP `get_advisors` (security) after the DDL.
  - *Verify:* no new missing-RLS / mutable-search-path finding.
- [ ] **E4. Regenerate DB types + commit.** MCP `generate_typescript_types` → overwrite `packages/data/src/database.types.ts`, then commit. **This removes the stale `set_notificaciones` typing** that S8's report noted stays in the live types until the drop applies.
  - *Verify:* the regenerated file **drops** `set_notificaciones` and **adds** `claim_code` / `invitacion_enviada_at` on `clientes` plus the new RPCs (`reclamar_por_codigo`, `invitacion_info`, `preparar_invitacion`, `marcar_invitacion_enviada`); `pnpm typecheck` green; committed to `main`.

---

## F. Verification — real-inbox evidence (the acceptance gate)

Per ADR-0014/#72: deliverability is **observed on a real inbox with headers recorded**, not asserted. Use an address you control. Run against a **test gym** (forge-demo, or red-demo via `?gym=red-demo`) so no real member is touched.

**Invite mail (Resend API path)**
- [ ] Record a **real sale with your email** on a test gym in the admin app → the recibo reports the invite state.
  - *Evidence:* [ ] invite email **received**; **From** = `iBookit <no-reply@ibookit.lat>`; body carries the **gym's name** in the copy (ADR-0014); the claim link points at the gym's **own client host** (or `…/registro?gym=<slug>&codigo=…` for an unmapped gym) with the correct `codigo`.
- [ ] Open the claim link → `/registro` shows "Invitación de {gym} para {nombre}" → complete signup.
  - *Evidence:* [ ] the login binds to the paid row (balance/history visible), code is single-use (a second open is dead).

**Signup confirmation (auth SMTP path)**
- [ ] Self-register a fresh member on a test-gym client host.
  - *Evidence:* [ ] confirmation email received from `no-reply@ibookit.lat`; [ ] link resolves (allow-listed per §C) and **establishes a session** (lands authenticated on `/reservar`).

**Password reset (auth SMTP path)**
- [ ] Trigger "forgot password" from `/entrar`.
  - *Evidence:* [ ] reset email received; [ ] link lands on `/restablecer` with a live recovery session; [ ] new password works.

**Headers**
- [ ] View raw headers on any one received message.
  - *Evidence:* [ ] `Authentication-Results:` shows **`spf=pass`** and **`dkim=pass`**; record the header block in the issue.

- [ ] All green → comment the header evidence on **#72** and check its acceptance criteria.

---

## G. Rollback / failure notes — what still works if a step fails

The system degrades gracefully by design; no single step here can brick a sale or an existing login.

- **Domain not yet verified (A3) / SMTP misconfigured (B):** auth mail falls back to Supabase's **built-in dev mailer (~2/hour)** — slow and spam-prone but not dead; existing sessions unaffected. Fix DNS/SMTP and re-verify; no code change.
- **`RESEND_API_KEY`/`RESEND_FROM` unset or wrong (D):** `resendTransport` returns `no-configurado` and `enviarInvitacion` returns `ok:false` — **the sale still completes**; the member's invite state stays `sin invitación`, **re-sendable** later via REENVIAR. Invite send is best-effort by contract (ADR-0015): a sale never fails because mail failed.
- **`PLATFORM_CLIENT_FALLBACK_HOST` unset (D):** invites for **mapped** gyms are unaffected (they use their own `gym_domain` host); only **unmapped** gyms get `ok:false` (`sin-host`) — again re-sendable once set.
- **Redirect URL missing (C):** the auth email still sends, but the click errors `redirect_to not allowed`. Add the host to the allow-list and re-click — no re-send of the sale needed.
- **Migrations not yet applied (E):** the app code is already live-tolerant (best-effort send, idempotent claim), but the invite rail can't mint/claim codes until E2 lands. Apply-first per the deploy note; the drop of `set_notificaciones` (E2.1) is one-way — the pre-gate dump (E1) is the rollback.
- **Rate limit set too high vs Resend quota (B2):** excess auth mail silently fails at Resend once the daily cap hits; lower the Supabase limit or upgrade the Resend plan. No data risk.

---

## Reference (secrets-free)

- **Vendor:** Resend — SMTP `smtp.resend.com:465`, user `resend`; REST `https://api.resend.com/emails`. One mail vendor platform-wide (ADR-0006 + ADR-0014).
- **Sending domain:** `ibookit.lat` (gym-neutral) · **Sender:** `no-reply@ibookit.lat` · **name:** `iBookit` (OWNER-DECIDE).
- **Admin env (Vercel `red-2-0-admin`):** `RESEND_API_KEY` · `RESEND_FROM="<name> <addr>"` · `PLATFORM_CLIENT_FALLBACK_HOST=app.ibookit.lat` (hostname only).
- **Auth rate limit:** post-SMTP default is 30/hr; keep ≤ ~50/hr so an hourly burst cannot outrun Resend's free 100/day cap.
- **Site URL:** `https://red.ibookit.lat` · **Redirect allow-list:** one `https://<client-host>/**` per gym.
- **Migrations:** the six `20260708…` files, MCP `apply_migration`, then `generate_typescript_types` → `packages/data/src/database.types.ts`.
