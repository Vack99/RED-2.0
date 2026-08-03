# Cross-tenant login on branding — cross-examination + the standard

**Date:** 2026-08-02
**Trigger:** signing into the RED admin host with a Forge admin account succeeds and renders the Forge account's real data under RED branding.
**Method:** `/cross-examine` tier 2 (7 agents: 3 analysts, red team, 2 research, coverage critic) + `/finding-the-standard` (MEASURE → RESEARCH → RULE). Every DB claim read-only against LIVE `hjppxawglmukfvsgmcog`, 2026-08-02.
**Route:** `docs/Context/2026-08-02-cross-tenant-login-route.md`

---

## The verdict in four sentences

The login succeeds because **nothing anywhere compares the gym a hostname belongs to against the gyms a session is a member of**. `apps/admin/src/proxy.ts:78` gates on `decideRedirect(authed, pathname)` — a boolean — and `apps/admin` reads `x-gym` **zero** times. No tenant data crosses: the red team built eight exploit chains and killed all eight at the read boundary, and RLS is genuinely correct for the single-gym case. But three live cross-tenant *reads* exist that have nothing to do with the host seam, and one live **write** path takes the host as its tenant — which makes "the tenant is presentation-only" literally false.

**This is a truthfulness and attribution defect on the read path, sitting on top of a host-driven tenant-enrollment write on the member path — and there is no record of whether either has already happened.**

---

## MEASURE — what is actually true here

### The seam

| Fact | Evidence |
|---|---|
| Proxy resolves tenant from `host`, stamps `x-gym`/`x-brand` | `apps/admin/src/proxy.ts:32-36`; `packages/data/src/server/resolve-tenant.ts:210-213` |
| Auth gate takes no tenant input | `apps/admin/src/proxy.ts:78` → `apps/admin/src/lib/auth.ts:13` — `decideRedirect(authed: boolean, pathname: string)` |
| `apps/admin` reads `x-gym` **zero** times | 3 grep hits, all comments; `cuenta/respaldo/route.ts:61` explicitly says *"never x-gym"* |
| Admin data gym = lowest UUID among staff memberships | `packages/data/src/server/gym.ts:49-56` — `.order("gym_id").limit(1)`; pinned by `gym.test.ts:111` |
| Same rule in SQL | `supabase/migrations/20260713190200_staff_gym_deterministic.sql:7-15` |
| Nothing at sign-in compares user to host | `apps/admin/src/app/(auth)/login/_components/login-form.tsx:57-70` — `signInWithPassword` only |
| Zero admin tests assert the crossing | `apps/admin/src/lib/auth.test.ts` — 5 cases, tenant in none; no proxy test file exists in either app |

### Scale of the defect today

- **4 gyms · 14 `gym_domain` rows · 7 admin hosts (4 production `.ibookit.lat`) · 10 accounts, every one single-gym.**
- **12 of 16 (production admin host × operator) pairs cross — 75%.**
- `red-admin.ibookit.lat` is a **live production row** (`supabase/migrations/20260709090000_ibookit_host_map.sql:20`). The defect is reachable in production, not on a dev surface.
- **0 multi-gym staff, 0 multi-gym members** live. Every multi-gym finding below is dormant, not fixed.

### Sessions do NOT cross hosts — the door is simply open everywhere

`@supabase/ssr@0.10.3` `DEFAULT_COOKIE_OPTIONS` (`dist/module/utils/constants.js:1-8`) has **no `domain` and no `secure`** key, and none of the four client-construction sites passes `cookieOptions`. Confirmed on the wire: `curl -sI https://red-admin.ibookit.lat/login` → `Set-Cookie: gym=red; Path=/; SameSite=lax`.

Cookies are host-only. The Forge admin **re-authenticated on RED's form and it was accepted.** The fix is an authz comparison, not a cookie change.

### What is genuinely fine — defended, then ranked anyway

- **`cuenta/respaldo/route.ts` is the most correct file in the seam.** Takes no gym identifier, derives from `auth.uid()`, splits 401/403 cleanly, sanitises the filename from the membership-resolved slug. **The export does not cross** — only the chrome lies.
- **Host-wins precedence works.** `resolve-tenant.ts:176-177` + the `matched` flag: a mapped customer domain cannot be `?gym=`-steered. Tested at `resolve-tenant.test.ts:116,151`.
- **`resolveBrand` fails safe.** `apps/admin/src/lib/brand.ts:17` validates `x-brand` against the registry with a `DEFAULT_BRAND` fallback.
- **The `token_overrides` CSS sink is the best-built defence in the repo.** `packages/brand/src/token-overrides.ts:36` — `z.strictObject` over 33 keys + `/^[A-Za-z0-9#%(),./ -]+$/`. Injection characters are *unrepresentable*, not filtered.
- **`gym_domain` has no write policy at all.** Default-deny + Vercel DNS verification ⇒ a hostile operator cannot map a domain. The threat the topology anticipated holds.
- **Single-gym RLS isolation is exact.** `gym2_probe.sql:123-160` proves a gym-2 operator draws folio 1001 off gym 2's counter with real gym-1 rows seeded; `scheduling_rls_denial.sql:111-141` proves 0 rows, 0 affected, denied inserts.
- **`gym_folio_counter`: RLS on, zero policies** — the only such table. Default-deny on the money counter, reachable only via `next_folio`, which gates itself with `is_staff_of`.
- **`reservar_clase` is the correct pattern** — `where c.auth_user_id = v_uid and c.gym_id = v_gym`. It is exactly what `mi_membresia` is missing.

### Cost of doing nothing, as a number

Zero data has crossed. The measured cost today is: **1 email per sale** potentially painted by the wrong brand, **12 reachable wrong-host operator pairs**, and **no way to know whether any of it happened** (see the observability finding). At the first multi-location owner it becomes money written to the wrong ledger and folio sequence.

---

## Ranked weaknesses, worst first

### 1. The host mints membership — "presentation-only" is literally false on the member write path
`apps/client/src/app/auth/confirm/route.ts:52-55` → `resolveTenant(host, null)` → `reclamarCliente(tenant.id)` → `packages/data/src/server/registro.ts:133` → `reclamar_o_crear_cliente(p_gym_id, p_firma)`, whose live body inserts into `clientes` **and** `gym_membership(user_id, gym_id, 'member')`.

The HMAC firma (`20260713190000_reclamar_tenant_binding.sql:61-62`) proves *the server asserted this gym* — never that *the caller has any right to it*. Since the server asserts whatever host the request arrived on, and the visitor picks the host, **the host is a tenant-granting write input.**

**Honest severity.** This is the member self-signup front door and enrolling in the gym whose site you visited is the product working. The role minted is `member` with no package and no entitlements, and the claim branch (`update ... set auth_user_id`) requires a *verified* email already on that gym's roster, so it is the intended activation rail, not takeover. What is genuinely wrong: a Forge member can edit `forge.ibookit.lat` → `red.ibookit.lat` on their own valid confirmation link (the `token_hash` arm carries no cookie or origin binding) and appear in RED's operator roster. Compounding it, `supabase/functions/send-email/correo.ts:57` — `const base = redirectTo || \`${siteUrl}/auth/confirm\`` — lands **every** gym's confirmation on RED's Site URL host when `redirect_to` is empty. That is an auto-enrollment funnel into RED's book of record, not a branding residual.

**Breaking point:** already reachable. Bound by whether any live flow omits `redirect_to` — `unmeasured — mint an admin-initiated invite/recovery without redirectTo and read the link's host`. The repo has a defensive test for exactly this fallback (`correo.test.ts:107-108`), which suggests the path is considered reachable.

### 2. `gym` is readable by every authenticated identity, including tenants' owner UUIDs
`gym_anon_select` is `FOR SELECT TO anon, authenticated USING (true)` (`20260702150000_create_tenant_spine.sql:46-48`). `20260713190100_gym_anon_column_grants.sql:14-17` narrowed the **anon** column grant and stopped there. Live `information_schema.column_privileges`: `authenticated` still holds SELECT on `legal_name`, `owner_user_id`, `created_at`.

Proven live with a fabricated `sub` holding no membership row: all 4 gyms returned, with owner `auth.users` UUIDs and one `legal_name`.

**This falsifies a load-bearing sentence in a prior audit** — `docs/Context/2026-07-27-auth-structure-scale-audit.md:35`: *"A global identity therefore buys an attacker nothing: `auth.uid()` alone grants zero rows anywhere."* It grants 4 rows and 4 owner UUIDs today, and N at N customers. The tell is in the same bullet: it audited the 25 *scoped* policies and never counted the unscoped one.

**Breaking point:** already broken; linear in customer count.

### 3. Fifteen catalog tables are `USING (true)` to anon — and the guarantee was certified false the day before
`20260706160000_phase6_anon_catalog_read.sql:31-70` creates 14 such policies; `20260706165900_create_gym_contact.sql:45-46` adds `gym_contact`. Live as `anon`, no JWT: **614 `class_session` rows across 4 gyms**, 15 `paquetes`, 11 `coach`, 3 `gym_contact`. Isolation is `.eq("gym_id", …)` in the DAL — a convention, not a policy.

`docs/health/2026-07-05-post-cutover-db-audit.md:27` certifies **"Anon reads limited to `gym` + `gym_domain` only — ✅ PASS."** The 14 policies landed **the next day** and the audit was never re-run.

**The structural finding underneath:** `tools/guards/denial-suite-drift.test.ts` and `tools/guards/rpc-write-coverage.test.ts` both key on **write RPCs**. **Nothing fails a build when a table becomes anon-readable.** The one axis that produced every confirmed cross-tenant read in this audit is the one axis with no guard.

**Defended honestly:** the same probe returned `clientes 0, ventas 0, cobro 0, gym_membership 0`. **Member PII does not cross.** The catalog does.

### 4. If this happened last month, nobody would know
- `auth.audit_log_entries` on LIVE: **0 entries, oldest `null`, newest `null`.** No sign-in history exists at all.
- **Zero** audit/event/history tables among the 29 `public` tables.
- Zero observability packages across `apps/` (`sentry|posthog|datadog|logtail|axiom|otel` → one unrelated identifier).
- Server-side logging across both apps is **one line** (`asistencia/page.tsx:58`).
- No `vercel.json` anywhere → no configured log drain, and no place a security header is set either.
- `auth.sessions` retains `ip` + `user_agent` but **no host**. The hostname exists only inside proxy request scope and is never persisted.

**Even a perfect fix ships with no way to know how many crossings preceded it.**

### 5. Sessions never expire and nothing revokes — role removal is not durable
Live `auth.sessions`: **all 6 rows have `not_after: null`**. One session created 2026-07-11 was still refreshing on 2026-08-01 — **21 days**. `jwt_expiry = 3600` bounds the access token, not the session; `enable_refresh_token_rotation = true` renews indefinitely. Sign-out exists in exactly two places, both plain client-side `supabase.auth.signOut()`; nothing calls `admin.signOut(jwt, 'global')`, nothing deletes `auth.sessions`.

RLS does cut data access at the next query when a membership row is deleted — but combined with finding 1, a removed member can re-mint their own membership by visiting `/auth/confirm` on that host.

### 6. `staff_gym()` is deterministic on a UUID — the money path picks a gym by coin-flip
`order by gym_id limit 1`. Stable, repeatable, semantically meaningless. `registrar_venta` stamps `v_gym := staff_gym()` then draws `next_folio(v_gym)` (`20260714110000_registrar_venta_backdate.sql:101`). A two-gym owner working the RED desk writes the cliente, the venta, **and burns a folio** in whichever gym's UUID sorts lowest. There is no gym switcher in the admin UI.

`20260702233000:16` writes the assumption down as an invariant — *"one-membership-per-login is the current platform invariant"* — which is a comment, not a constraint: `gym_membership_pkey` is `(user_id, gym_id)`, so a second row inserts freely.

**Breaking point: the first multi-location owner. Live count: 0.** `docs/Context/2026-07-27-auth-structure-scale-audit.md:208` already flagged this — *"do not sell to a multi-location owner."*

### 7. `mi_membresia()` and `toggle_favorito_tipo()` pick a tenant with a bare `LIMIT 1`, no `ORDER BY`
Live bodies, unchanged since `20260706210000` / `20260714120000:50`: `select … from clientes c where c.auth_user_id = v_uid limit 1`. `staff_gym` got a total order in #93; these never did. The pick is the planner's choice and can flip between requests.

Consequence on one screen: `agenda-miembro.ts:484` calls `mi_membresia()` (host-blind) inside `getPerfilResumenMiembro`, whose `marca`/`tz` came from the **host-reconciled** pick — gym A's agenda, timezone and brand beside gym B's balance and expiry. `toggle_favorito_tipo`'s tenant pin is correct, so it throws an unexplainable *"Tipo de clase no encontrado"* on the user's own gym's class when the planner returns the other row.

Both take **zero arguments**, so no app-layer fix is available — this is a signature change.

### 8. `agenda-miembro.ts:157` silently swallows the crossing, and passing tests lock it in
`const elegido = enHost ?? memberships[0]` — when `x-gym` names a gym the caller does not belong to, the page renders the oldest membership's gym under the foreign brand. Pinned by `agenda-miembro.test.ts:524` (*"host names a gym the caller is NOT a member of → same oldest-membership fallback"*), `:574`, and `clase-miembro.test.ts:255`.

**Unreported consequence:** the same line returns `tz: gym.timezone` (`:159`). A wrong-gym fallback renders **class times in the wrong timezone** — a member can miss a real class.

**These two tests are the entire contractual cost of a refusal-on-mismatch fix.** It is a two-test change, not a migration.

### 9. The receipt email leaves the platform painted by the host and named by the membership
`apps/admin/src/app/(app)/vender/actions.ts:53` passes `ticketPalette((await resolveBrand()).id)` — host-derived — into `enviarReciboDeVenta`, while the sender name comes from `packages/data/src/server/ventas.ts:326-327` (`gym.brandName`, membership-derived). The manual resend is explicitly split-brained: `actions.ts:79` re-resolves `brandName` from `getOperatorGym` *"so an authenticated caller can never emit platform mail branded as someone else"*, then `:86` paints that same mail with the host's palette.

A Forge operator on the RED host emits mail to a real Forge member reading **"Forge"** in RED's colours. Worse than the screen defect: a persistent, third-party-visible artifact in a member's inbox, sent after the sale is already committed.

### 10. All tenant hosts share one registrable domain — `SameSite=Lax` is a no-op between them
7/7 non-localhost `gym_domain` hostnames are `<x>.ibookit.lat`. SameSite's unit is the registrable domain, so `forge-admin` → `red-admin` is **same-site** and Lax buys zero cross-tenant protection. `httpOnly:false` on the auth cookie (`constants.js:4`) means one XSS on any `*.ibookit.lat` host can write `domain=ibookit.lat` cookies that ride to every tenant (RFC 6265 §8.6; GitPod CVE-2024-21583 is this exact chain). The `__Host-` prefix is unused and is one option object away — `@supabase/ssr` already routes `cookieOptions.name` → `storageKey`.

HSTS on the tenant hosts is **bare** (`max-age=63072000`, no `includeSubDomains`, no `preload`) while `red-2-0-admin.vercel.app` has both.

**Honest grading:** the chain needs an injection primitive nobody found, and the `gym` cookie itself holds a public slug. Ranked here for the auth-cookie shadowing reach, not the `gym` cookie.

### 11. `red-2-0-admin.vercel.app` serves the full admin login, unmapped, where `?gym=` is *not* inert
`curl -sI` → `200 OK`, and no `Set-Cookie: gym=` (compare mapped hosts, which return `gym=red`/`gym=forge`). The seed row was deleted from `gym_domain` (`20260709090000:28-33`) but never from Vercel. This is the one place ADR-0012 §28's *"structurally inert"* claim does not hold, by design. Every preview deployment has the identical shape.

### 12. Host-wins fails **open** to `?gym=` on a transient DB error
`resolve-tenant.ts:126` returns `{ matched: false }` on a PostgREST error, and `:176-178` then hands the request to the override. During any read blip, `https://forge.ibookit.lat/?gym=red` renders RED chrome on the customer's own domain and pins it in a cookie until the next good request. Self-heals within one request; the two host-authoritative writers pass `null` and fail closed.

### 13. `gym_domain.app` is a declared invariant the resolver never enforces — and filtering it breaks dev
`resolve-tenant.ts:121-125` selects on `hostname` only, never `.eq("app", …)`, despite the column existing to pin a host to a deployment. Live rows are already asymmetric: **`red` has no admin `.localhost` row; `forge` has no client `.localhost` row.** RED-admin dev works *only* because the column is unfiltered — and `docs/prds/prd-brand-system.md:71` relies on that in writing. The obvious hardening breaks the documented workflow.

### 14. `actualizar_paquete` demotes `popular` across every gym the caller staffs
`20260605130000:29` — `update paquetes set popular = false where popular and id <> p_id`. The comment says *"RLS owner-scoped"*; RLS scopes it to the caller's **membership set**. One click marking a RED package popular un-features Forge's flagship. Dormant at 0 multi-gym staff.

### 15. Smaller, confirmed, ranked below the fold
- **`enviar_mensaje_contacto`'s rate limit is opt-in by the caller** — `if p_ip is not null` (`20260706170100:88`), granted to `anon`. A direct PostgREST call omitting `p_ip` skips it entirely, into any gym by slug.
- **`reservation_member_select` has no gym predicate** (`20260706170000:96-97`) — a policy-level fix, unlike 7.
- **`invitacion_info(p_codigo)` is an unauthenticated oracle** — no firma, no rate limit; returns gym + invitee name. Its sibling `reclamar_por_codigo` was hardened in `20260722120000`; this one was not. Codespace 34⁸ ≈ 1.8×10¹², so enumeration is not the threat — offline validation of a leaked code is.
- **`requireOperator` is not an operator check** — `packages/data/src/server/_auth.ts:18-21` checks only `claims.sub`, while `cuenta/respaldo/route.ts:13-16` documents it as *"throws on a missing operator claim."* No exploit (the real gate is two lines later), but it is the sentence a reviewer would trust while deleting the line that works.
- **Deleting a gym frees its hostname.** `gym_domain_gym_id_fkey` is `CASCADE` while `clientes`/`ventas`/`cobro` are `NO ACTION`. A gym with clients cannot be deleted (good), but any successful delete frees a unique hostname for re-insertion under a different `gym_id`, with no audit row and a ≤60s cache lag. Re-pointing a live customer hostname is one INSERT.
- **Nothing tells an operator which URL is theirs.** Grep for `red-admin.ibookit|forge-admin.ibookit` across `docs/` returns only internal engineering artifacts. There is no operator onboarding doc, no welcome email, no bookmark handoff. **The control currently preventing this defect in production is an operator remembering the correct hostname** — undocumented, untested, unowned.
- **The `/proto` auth bypass is uncommitted, and so is what it protects.** `apps/admin/src/proxy.ts:71-78` skips the auth gate for `/proto*` when `NODE_ENV !== 'production'`. `apps/admin/src/app/proto/` exists as **untracked** WIP (wayfinder #189 — `_shell.tsx`, `_fixtures.ts`, and 5 variant routes), so the bypass is live in dev for real routes. Inert in production (the pages 404 under a production build, and Vercel builds previews with `NODE_ENV=production`). Its stated deletion condition is **not** yet satisfied. Side effect worth knowing: `tools/guards/client-seam.test.ts` fails on `proto/_shell.tsx` while that WIP sits in the tree, which blocks every commit through the pre-commit hook.

---

## RESEARCH — what the world already knows

### The standard: there is no standard claim, but there is a named concept and a named antipattern

- **No OIDC/OAuth standard claim for the tenant in effect.** RFC 9068 §2.2's mandatory claims are `iss, exp, aud, sub, client_id, iat, jti` — no tenant. `org_id` is Auth0-proprietary. OIDC Enterprise Extensions 1.0 §2.2 *does* define a `tenant` claim, but it is **draft-01 (2025-09-25) with Security, Privacy and IANA sections marked "To be completed."** Not adoptable.
- **The only spec-standard mechanism is audience restriction** — RFC 8707 §2 + RFC 9068 §4 (*"The JWT access token MUST be rejected if `aud` does not contain a resource indicator of the current resource server"*). That means audience-per-tenant or project-per-tenant.
- **The concept is named "tenant context"** (Azure Architecture Center, OWASP Multi-Tenant Cheat Sheet §1) or **"SaaS identity"** (AWS SaaS Lens: *"This merging of the user identity with the tenant identity is referred to as a SaaS identity"*).
- **This exact failure has a name.** Azure's identity antipatterns page calls it **"User and tenant conflation."**

**What the standard forbids — the single most on-point sentence found anywhere**, from Azure's *Map requests to tenants*:

> *"if your application uses a custom domain name to map requests to the tenant, then your application must still check that each request received by the application is authorized for that tenant. **Even though the request includes a domain name or other tenant identifier, it doesn't mean you should automatically grant access.**"*

Supporting: OWASP ASVS 5.0 §8.4.1 (L2) — *"multi-tenant applications use cross-tenant controls to ensure consumer operations will never affect tenants with which they do not have permissions to interact"*; OWASP Multi-Tenant Cheat Sheet — *"Establish tenant context early in the request lifecycle (middleware/interceptor)"*; Entra claims validation — *"Never allow data in one tenant to be accessed from another tenant."*

### RED-2.0 is already inside a sanctioned pattern and simply skips the verify step

Azure documents **two** sanctioned approaches. The second, verbatim:

> **"Application-based authorization"** — *"make the identity system agnostic to tenant identifiers and roles… tokens don't include a tenant identifier claim. A separate list or database maintains tenant access records. **The application tier uses this list to verify whether the user is authorized to access the tenant data.**"*

That is exactly this architecture. **This is not an architecture change — it is a missing check in an architecture Microsoft endorses.**

### The incumbent: Supabase cannot fix this for you

- **Supabase has no multi-tenancy guide at all.** Their B2B SaaS page's whole answer is *"RLS enforces tenant isolation at the database layer… No custom middleware, no tenant-routing code."*
- **The Custom Access Token Hook cannot carry the host.** Its documented event payload is exactly `user_id`, `claims`, `authentication_method`. It *can* put a membership **set** in the token (and it does fire on `token_refresh`); it structurally **cannot** know which hostname a request arrived on. It is an optimization of the request-layer fix, not a substitute — and its claims can be up to the configured JWT TTL stale (Supabase's recommended default is 1 hour).
- **No Supabase document states where the shared-project model stops working.** Searched four ways plus their own docs search API twice. Recorded as a gap, not inferred.

### Prior art: nine vendors, zero silently serve

| Product | Behaviour on tenant mismatch |
|---|---|
| **Atlassian** | *"This process of login here will only be able to redirect you to a Cloud site where you have permissions to access it."* |
| **Slack** | Per-workspace sessions; a workspace you're not in → "doesn't have an account on this workspace" → invite/request |
| **Zendesk** | *"use the correct sign-in page for the subdomain of the account you want to enter."* |
| **GitHub EMU** | Hardest line — a managed user is a *different account*; docs name the leak risk of switching |
| **Salesforce** | Made per-org domains **mandatory** (Enhanced Domains); org may *"Prevent login from login.salesforce.com"* |
| **Shopify / Stripe / Notion / Vercel** | Single host + explicit switcher |

**The invariant is the membership check, not the URL shape.** Vendors disagree about subdomain-vs-path; none skips the comparison. Clerk documents this exact bug as a known failure mode of `organizationSyncOptions`: if the org can't be activated, *"the previously Active Organization will remain unchanged"* and the app must catch it — their answer is `notFound()` or an org picker.

**On refuse vs redirect:** no standard prescribes the status code (searched ASVS 5.0 V8, the Authorization and Multi-Tenant cheat sheets). Auth0 says *"rejected as unauthorized"* for a named-and-wrong org and a **picker** for ambiguous; Clerk says 404 or picker. **No source recommends auto-redirect** to the correct tenant host, and no source treats serving data under the wrong brand as acceptable — the nearest treatment (Azure's dangling-DNS section) frames brand/tenant mismatch as a **credential-harvesting surface**: *"If the attacker sets up their Contoso tenant with Fabrikam's branding, employees might be fooled into accessing the site and providing sensitive data."*

### Post-mortems — confirmed, same class

- **Wiz "BingBang" (2023)** — the best citation for this defect: *"Multi-tenant applications… allow any Azure tenant to issue an OAuth token for them. Therefore, app developers must inspect the tokens within their code and decide which user should be allowed to log in."* Result: ***25% of all multi-tenant apps scanned were vulnerable to authentication bypass.*** Identity says "valid user"; nobody asks "valid *for this tenant*."
- **CVE-2025-14986 (Temporal, "masked namespace")** — the closest structural analogue: the outer request passes authorization for one namespace while an inner operation runs under another.
- **nOAuth** (still 9% of Entra gallery apps in 2025), **CVE-2025-55241** (Entra Actor tokens, CVSS 9.8/10.0 — *"did not adequately validate the originating tenant"*), **Okta cross-tenant impersonation (2023)**, **GitPod cookie-tossing CVE-2024-21583**.
- **Discarded as wrong class:** ChaosDB, CosmosEscape, Capsule CVE-2025-55205 — infrastructure escapes, not context confusion. They argue for keeping isolation in Postgres (which ADR-0008 does) and say nothing about host↔session reconciliation.
- **Could not confirm:** "Super FabriXss" (zero retrieved results — do not cite); any Auth0/Clerk/WorkOS advisory about missing organization checks (none found in two searches); a public bounty report matching this exact shape.

### Counter-evidence — the case against the obvious fix, found deliberately

Microsoft documents, end to end, a scenario where **domain mapping itself becomes the privilege grant**: an attacker names their tenant `fabrikam`, onboards `invoices.fabrikam.com`, and CNAME validation succeeds. Mitigations include *"Prohibit the reuse of tenant identifiers"* and per-onboarding random TXT.

Applied here: `resolve-tenant.ts:121-129` maps hostname → `gym_domain` → `gym_id` with **no ownership-proof column**. If the host became authoritative for authz, `gym_domain` becomes a privilege table — and per finding 15, a freed hostname is one INSERT from re-pointing. **This is the exact failure ADR-0008 pre-empted, and it is why the fix must reconcile without making the host authoritative.**

### Our own prior art — and why the client pattern never reached the admin

It is not laziness; it is a structural asymmetry the repo already wrote down.

- **Client:** the tenant decision happens where the host is visible — `agenda-miembro.ts:140-161`, TypeScript, `x-gym` in hand.
- **Admin:** the tenant decision happens where the host is **invisible** — `staff_gym()` runs in Postgres. `20260713190000_reclamar_tenant_binding.sql:8-10` says it outright: *"the tenant is resolved from the HOST on the server (ADR-0008) and **Postgres cannot observe the host**."*

`staff_gym()` is not missing a host check — it is **structurally incapable** of one. And its tiebreak is worse: the client falls back to *oldest membership* (human-meaningful), the admin to *lowest UUID* (meaningless). Second asymmetry: a multi-gym member is normal and a wrong pick is a cosmetic read; a multi-gym staffer is rare and a wrong pick **writes money to the wrong tenant**.

**The better internal precedent is `activar`, not `resolverMiembroGym`.** `apps/client/src/app/activar/page.tsx:46` hard-refuses a host↔gym mismatch, citing ADR-0008/0009 in its own docblock — the only refusal in the repo. It can afford strictness because both licensing properties exist: an authoritative answer, **and** a constructible inverse map (`invitaciones.ts:86-112` already derives a gym's host from `gym_domain where app='client'` — the admin equivalent is the same query with `'admin'`). Atlassian's documented behaviour is verbatim this.

---

## The ADR on trial

**ADR-0008 is RIGHT on the boundary and WRONG on the vocabulary, and the vocabulary is what cost.**

On the question it poses — *may the host widen authorization?* — the ADR is right, the read path matches it, and eight attack chains failed to falsify it. `docs/adr/0008…:36` even predicts this exact symptom as proof the boundary holds: *"spoofing the RED host changes the brand they see, not the rows the database returns."* **Do not overturn ADR-0008.**

But it wrote *"the tenant is presentation-only"* when the true statement is *"the tenant may not WIDEN authorization."* The stronger sentence also forbids **narrowing** — and that prohibition is already violated twice for correctness (`reservar/page.tsx:76`, whose comment has to pre-empt the objection: *"Host stays presentation-only — it only picks among the caller's own memberships"*; and CONTEXT.md:68-70, which concedes the host is server-authoritative for a new row's `gym_id`). The result is **four gym-pickers with three different rules**, one of them non-deterministic.

**The amendment — one sentence, no policy changes required:**

> *The tenant-in-effect is a server-derived request property that may only NARROW to a tenant the caller already holds a `gym_membership` row for, never widen; it is derived from the host reconciled against membership; and when the host names no membership of the caller, the app refuses rather than guesses.*

Compatible with all 96 existing policies. Deletes three of the four ad-hoc pickers. Generalises the exception CONTEXT.md already concedes. Closes findings 6, 8, 9. Closes none of 2, 3, 4 — those are separate work, and finding 3 is the more urgent half.

### Substitution test on the defence

Sentences defending the current design that stay true if you swap this system for any other multi-tenant app — i.e. they were never support about *this* system:

| Quote | Location |
|---|---|
| *"A request's tenant header/host is attacker-influenced UX metadata… It decides nothing about which rows a session may read or write."* | `docs/adr/0008…:35` |
| *"the RLS-by-membership boundary *is* the isolation, and it holds even if `proxy.ts` is wrong or bypassed."* | `docs/adr/0008…:37` — and now partly false (findings 2, 3) |
| *"one shared DB and two deployments are a shared blast radius, which is exactly why the RLS-by-membership boundary is non-negotiable."* | `docs/adr/0008…:41` |
| *"inlining them at build time is correct, not a leak of per-tenant config."* | `docs/adr/0008…:47` — **this is the sentence that stops you asking what the shared `anon` role can read.** Findings 3 and the `gym_domain` census are downstream of it. |
| *"A global identity therefore buys an attacker nothing: `auth.uid()` alone grants zero rows anywhere."* | `2026-07-27-auth-structure-scale-audit.md:35` — **false**, proven live |
| *"Anon reads limited to `gym` + `gym_domain` only — ✅ PASS"* | `docs/health/2026-07-05…:27` — true on its date, falsified the next day |
| *"El host resuelve presentación y UX, no autorización"* | `CONTEXT.md:66` |

Sentences that **pass** and should be kept verbatim: `docs/adr/0008…:36` (the RED-host-spoofing sentence — names a specific outcome in this system) and ADR-0013:98-102 (*"Never delete a reader's `.eq("gym_id", …)` as 'redundant with RLS'"* — names the mechanism, the failure, and the false belief it corrects).

---

## Breaking-point table

| Component | Breaks at | Bound by |
|---|---|---|
| Host mints membership (member door) | **Already reachable** | `auth/confirm/route.ts:52` + `correo.ts:57` Site-URL fallback |
| `gym` cross-tenant read | **Already broken** — 4 owner UUIDs today, N at N customers | un-narrowed `authenticated` column grant |
| Anon catalog scrape | **Already broken** — 614 sessions / 15 plans / 11 coaches across 4 gyms | 15 `USING(true)` policies + the build-inlined publishable key |
| `gym_domain` customer census | **Already broken** — 14 rows | `gym_domain_anon_select`, no column narrowing |
| Sign-in observability | **Already zero** — `auth.audit_log_entries` empty | free-tier retention; no log drain; host never persisted |
| `staff_gym()` / `getOperatorGym` pick | **The 1st staff user with 2 gyms.** Live: 0 | `order by gym_id limit 1`, no request-scoped tenant, no switcher |
| `mi_membresia` / `toggle_favorito_tipo` | **The 1st member with `clientes` rows in 2 gyms.** Live: 0. Breaks *intermittently* — no ORDER BY | bare `LIMIT 1` |
| Session revocation | **The 1st operator you need to remove.** Sessions observed alive 21 days, `not_after: null` | no global sign-out, no `auth.sessions` deletion |
| Tenant TTL cache | **>500 distinct hostnames per instance per 60s ≈ 250 active gyms** | `CACHE_MAX_ENTRIES = 500`, insert-order FIFO (`set` on an existing key does not refresh order) |
| Origin isolation | **The 1st content injection or subdomain takeover under `ibookit.lat`**; separately, the 1st BYO customer domain | one shared registrable domain; no `__Host-`; bare HSTS |
| Auth-mail brand pinning | **The 1st wildcard entry** in the Auth Redirect-URL allow-list | a dashboard setting, invisible to code review |
| Anon-exposure guard | **Already broken — it does not exist** | both machine guards key on write RPCs only |
| Vercel domain ceiling | Hobby 50 / Pro–Enterprise 5–10k | *modelled — this repo's prior verdict, not re-verified* |

---

## Exit triggers for every keep-verdict

- **Keep ADR-0008's hinge (host never widens authorization).** *Exit trigger:* a policy or RPC anywhere reads a header, `current_setting`, or a caller-supplied gym without a membership check or an HMAC firma — **count must stay at 0**; re-check on every migration that touches a policy.
- **Keep the shared Supabase project.** *Exit trigger:* `undecided — how much per-tenant blast-radius is tolerable before splitting projects? The owner draws that line.* The measurable half: revisit if any customer contractually requires data residency or a tenant-scoped breach notification.
- **Keep `host` over `x-forwarded-host`.** *Exit trigger:* any proxy (Cloudflare, self-hosted) is inserted in front of Vercel. Add a guard test asserting `host === x-forwarded-host` so this fails loudly instead of silently.
- **Keep host-only cookies (no `Domain`).** *Exit trigger:* anyone proposes cross-app SSO between the admin and client deploys. That proposal is the trigger; it inherits cookie tossing across every tenant.
- **Keep the client's oldest-membership fallback on the client app only.** *Exit trigger:* the 1st member holding `clientes` rows in 2 gyms — at which point the timezone consequence (finding 8) becomes a missed class.
- **Keep the single Vercel deploy per app.** *Exit trigger:* gym count passes ~250 (the TTL cache breaking point), or the 1st customer needing a per-tenant rollback.

---

## Confidence ledger

| Claim | Basis |
|---|---|
| Auth gate takes no tenant input; `apps/admin` reads `x-gym` zero times | **measured** — `proxy.ts:78`, `auth.ts:13`, 3 grep hits all comments |
| Cookies host-only; session does not cross hosts | **measured** — `@supabase/ssr` source + live `curl -sI` |
| `gym.legal_name`/`owner_user_id` readable by any authenticated identity | **measured** — live `column_privileges` + a fabricated-`sub` query returning 4 rows |
| 614 `class_session` rows scrapeable as anon across 4 gyms | **measured** — live query as `anon` |
| `auth.audit_log_entries` is empty | **measured** — live query |
| Sessions have `not_after: null`; one observed alive 21 days | **measured** — live `auth.sessions` |
| Host mints `gym_membership` via `reclamar_o_crear_cliente` | **measured** — `route.ts:52` → `registro.ts:133` → live `pg_proc.prosrc` |
| 0 multi-gym staff, 0 multi-gym members | **measured** — live `having count(*) > 1` returned empty |
| A refusal-on-mismatch costs exactly 2 test changes | **measured** — grep across all `*.test.ts*` for `x-gym\|hostGym\|resolveTenant` → 3 files, 2 pinning assertions |
| TTL cache breaks at ~250 active gyms | **modelled** — 500 entries ÷ 2 hosts/gym; not load-tested |
| 12 of 16 host×operator pairs cross | **modelled** — 4 production admin hosts × 4 staff users, minus the 4 correct pairs |
| A URL-edited confirmation link enrolls a member in the wrong gym | **modelled** — the code path is measured; the end-to-end request was not executed |
| Vercel `host` is unspoofable by a client | **asserted from the vendor** — vendor doc states what `host` contains on a normal visit, not mismatch behaviour |
| The live Auth redirect allow-list is host-scoped | **asserted** — the runbook prescribes it; the dashboard was not read |
| The hosted project's auth rate limits | **asserted** — `config.toml` is the LOCAL stack and does not describe the hosted project |

---

## Could not determine — and the experiment that settles each

| Question | Experiment |
|---|---|
| Has a crossing already happened in production? | Unanswerable today. Stamp `x-gym` alongside the membership-resolved gym at `getOperatorGym` and log the disagreement; then wait. |
| Does the live Auth Redirect-URL allow-list contain a wildcard? | Dashboard → Auth → URL Configuration. Assert no entry is broader than `https://<one-host>/**`. |
| Does any live flow mint a link with an empty `redirect_to`? | Trigger an admin-initiated invite/recovery without `redirectTo` and read the minted link's host. |
| Is `red-2-0-admin.vercel.app` still assigned to the admin project, and are previews protected? | Vercel dashboard → Domains + Deployment Protection. |
| Do `gym_domain` rows reconcile against Vercel's attached-domain list? | A script diffing `gym_domain.hostname` against the Vercel Domains API per project. |
| Which duplicate does Next 16's `RequestCookies` return under a tossed cookie name? | A request carrying both a host-only and a `domain=ibookit.lat` `sb-…-auth-token`; log which one `getClaims()` validates. |
| Does Vercel normalize a `Host` header that disagrees with TLS SNI? | `curl --resolve forge-admin.ibookit.lat:443:<red-ip> -H 'Host: red-admin.ibookit.lat'` and read the returned `Set-Cookie: gym=`. |
| What are the hosted project's real auth rate limits? | Supabase Management API or dashboard — `config.toml` will not answer it. |
| Is `mi_membresia`'s planner-chosen row stable in practice? | A two-`clientes` user + `EXPLAIN` across a re-analyze. |

---

## Owner-input list — facts no agent can derive

1. **Is a Forge operator ever expected to reach the RED admin host?** (Decides refuse vs. redirect vs. picker.)
2. **How much per-tenant blast radius is tolerable before splitting Supabase projects?** No evidence settles this — it is a line you draw.
3. **Do you want the operator refusal to name the correct host** ("go to forge-admin.ibookit.lat") or stay opaque? Naming it is friendlier and leaks which tenants a session belongs to across a boundary.
4. **Is the anon catalog exposure (finding 3) intended?** Marketing pages are public per gym; bulk cross-gym enumeration may or may not be acceptable to you.
5. **Which of the three live read exposures (2, 3, and the `gym_domain` census) do you consider in scope for this cycle?** They are independent of the login defect.

---

## Dissent log

- **RED TEAM vs. COVERAGE CRITIC on the headline.** The red team graded the defect COSMETIC after killing eight chains at the read boundary. The coverage critic proved the roster examined only reads and that `auth/confirm/route.ts:52` feeds the host into a membership-creating write. **The critic is right about the mechanism** — verified independently at `route.ts:52` → `registro.ts:133` → the live function body. **The critic overstated the severity:** the role minted is `member` with no package, the claim branch requires a *verified* email already on that gym's roster (the intended activation rail), and self-enrollment in the gym whose site you visited is the product. Recorded verdict: the mechanism falsifies "presentation-only" and the roster's "8 chains killed" framing; it does not establish a breach. The real cost is roster pollution and the `correo.ts:57` funnel.
- **ANALYST-APPSEAM vs. ANALYST-RLS on function count.** 34 (AGENTS.md) vs. 41 (live catalog). The live count governs; AGENTS.md is stale.
- **ANALYST-APPSEAM vs. RESEARCH-PRIORART on the client fallback.** APPSEAM read it as a locked design (passing tests). PRIORART ranked it the wrong default to export. Both hold: keep it on the client (unmapped hosts are legitimate there), do not export it to admin.

---

## Blind spots — what this audit did NOT examine

1. **Nobody ran either app or reproduced the defect.** Every claim is static analysis plus read-only DB queries. The settling reproduction: sign in as the Forge staff user on `red-admin.ibookit.lat` and screenshot `/inicio`.
2. **No real HTTP request reached PostgREST.** DB claims used `set local role` + `set_config('request.jwt.claims')` inside rolled-back transactions — that models the role switch, not PostgREST's header handling, `pre-request` hooks, or pool role state.
3. **Dashboard state is entirely unread** — Auth URL configuration, Vercel domain assignment, preview protection, WAF, rate limits, log retention.
4. **`service_role` key custody was not audited.** A leaked service key voids the grading on every finding here.
5. **Not read in full:** the `activar-cuenta` edge function body, `cancelar_reserva`, `pasar_lista_sesion`, `toggle_pase`, and the `@gym/ui` / `@gym/brand` module internals.
6. **The published standards do not address this exact shape** — brand/tenant divergence *with data isolation intact*. Every recommendation here extrapolates from adjacent rules (Azure's request-validation rule, the dangling-DNS phishing framing). That is a gap in the literature, not in the search.
7. **Multi-gym behaviour is entirely un-exercised in production.** Live population: 0. Every multi-gym claim is read from code and SQL, never observed.
8. **DNS/registrar posture for `ibookit.lat`** — dangling records, subdomain-takeover surface, CAA/DMARC. Finding 10 turns on it.
9. **No number for the per-request membership lookup at scale.** Azure warns tenant-mapping logic runs on every request; this codebase has no measurement.
10. **Not run at all:** NIST SP 800-series, ISO 27017, CSA CCM, SOC 2 criteria, the AWS Tenant Isolation Strategies PDF. Judged lower yield than the sources used.

---

## Draft audit

- **Cut** *"This is a critical security vulnerability requiring immediate remediation."* — Rule 5 (cite or drop it) + Rule 7 (adequacy without a number). No live user holds two memberships and no data crossed; replaced with the dormancy counts and the trigger conditions.
- **Cut** *"RLS is generally well-implemented across the schema."* — Rule 1 (rank, don't rate). Replaced with the specific defended items in *What is genuinely fine*, each with its policy or test quoted, then ranked anyway.
- **Cut** *"`staff_gym()` is non-deterministic for multi-gym staff."* — Rule 5. Factually wrong: `order by gym_id` makes it fully deterministic. Rewrote to the sharper and more damning claim — deterministic **on a UUID**, i.e. stable and meaningless.
- **Cut** *"the `SECURITY DEFINER` functions are the higher-risk surface."* — Rule 5. The sweep shows the split is orthogonal to this bug class; `registrar_venta`, the money path, is `INVOKER`.
- **Rewrote** *"This could cause confusion for operators."* → *"12 of 16 host×operator pairs cross — 75%."* — Rule 2 (name the number).
- **Rewrote** *"Multi-gym operators may eventually be affected."* → *"the first multi-location owner; live count 0."* — Rule 3 (a trigger with no numeral is not a trigger).
- **Cut** *"the fix is straightforward."* — Rule 2. Replaced with the split verdict: reads are an app-layer change available today; writes are a schema change across 8 RPCs; the refusal itself costs 2 test edits.
- **Cut** *"Super FabriXss (CVE-2023-23383) was an Azure cross-tenant finding."* — Rule 5. Zero retrieved results; moved to could-not-confirm rather than cited from recall.
- **Cut** *"Every major identity vendor returns 403 when the tenant doesn't match."* — Rule 5. On fetching: Auth0 says "unauthorized", Clerk says 404-or-picker, no standard names a code.
- **Cut** *"OIDC defines an `org_id` claim."* — Rule 5. RFC 9068 §2.2 defines no such claim; `org_id` is Auth0-proprietary.
- **Cut** *"Redirecting to the user's correct tenant host is the friendly, standard answer."* — Rule 5. No source recommends auto-redirect; downgraded with the open-redirect concern named and moved to the owner-input list.
- **Cut** *"Every major SaaS has abandoned per-tenant subdomains."* — Rule 4 (substitution) + Rule 5. Directly contradicted by Salesforce making them mandatory.
- **Rewrote** the ChaosDB/CosmosEscape citations from evidence into a *discarded, wrong class* bucket — Rule 5 + M2. They are infrastructure escapes; citing them here would be padding.
- **Rewrote** the coverage critic's Gap-1 severity from *"converts the defect from attribution to breach"* to the graded version in finding 1 — M2 (honesty outranks severity). The mechanism verified; the breach framing did not survive the check that the minted role carries no entitlements and the claim branch requires a verified email.
- **Cut** *"`getOperatorGym` being host-blind is a UX gap, not an isolation gap."* — M2 in the other direction. Isolation is intact; *attribution* is not, and a sale written to the wrong ledger and folio sequence is a correctness defect in the money path.
- **Cut** a paragraph re-explaining what RLS is before quoting the predicates, and a recap of the TTL cache implementation — Rule 7 (restates without adding).
- **Not triggered:** ranked list under the tier floor (15 entries vs. a floor of 8); an all-tagged output establishing nothing (the measured column of the confidence ledger carries 9 live-verified claims).
