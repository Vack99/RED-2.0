# Unbundling audit — keep Postgres, replace only Auth

**Agent:** `alt:auth-only` · **Date:** 2026-07-27/28 · **Subject:** RED 2.0 · **Scope:** price Clerk / WorkOS / Auth0 /
Better Auth / Auth.js / Keycloak / Zitadel against the MAU figures in `workload-auth.md`, then determine what breaks
in this codebase's RLS/RPC layer if `auth.uid()` is no longer native to the database, and whether the savings pay
for the migration at 100 / 1,000 / 3,000 gyms.

**Headline: the premise this mandate was built to test has already been falsified by its own required input.**
`workload-auth.md` (read as instructed) corrected the prior audit's MAU estimate from **$845–1,430/mo down to
$0–559/mo**, even at 3,000 gyms. That is the entire savings ceiling available to "replace auth to cut the MAU
bill." A real swap costs an estimated **180–280 one-time engineering hours** (itemized in §5) plus, for the two
cheapest-looking providers (Clerk, Auth0), a **larger** recurring bill than the one being escaped, because their
real cost axis at RED's shape is **organization count** (= gym count, 100–3,000, insensitive to engagement), not
MAU. Only one provider (WorkOS) has a plausible path to net-zero ongoing cost, and even there the payback period
on the migration hours is 26+ months against the best-case $559/mo ceiling. **Verdict: no, at all three scale
points** — detailed in §6.

---

## 1. Inputs taken from `workload-auth.md` (read per mandate; not re-derived)

File exists and was read in full: `docs/Context/2026-07-27-auth-structure-scale-audit.md`'s companion
`workload-auth.md` was supplied at
`C:/Users/Aaron/AppData/Local/Temp/claude/.../scratchpad/audit/workload-auth.md`. Its §6 aggregate table
(225-member average roster, the platform's own stated 150–300 range) is the reference this mandate specifies:

| Gyms | Low MAU total | Expected MAU total | High MAU total |
|---|---|---|---|
| 100 | ≈ 270 | ≈ 2,563 | ≈ 9,063 |
| 1,000 | ≈ 2,688 | ≈ 25,625 | ≈ 90,625 |
| 3,000 | ≈ 8,063 | ≈ 76,875 | ≈ 271,875 |

Native Supabase cost at these figures (Pro/Team: 100,000 MAU included, then $0.00325/MAU overage — fetched
2026-07-27 from `https://supabase.com/pricing`, corroborated 2026-07-28): **$0 at every cell except 3,000-gyms ×
High**, where 271,875 − 100,000 = 171,875 × $0.00325 = **$558.59/mo** (≈ $0.19/gym/mo). This is the number every
alternative below is being judged against — not the prior audit's $845–1,430/mo, which `workload-auth.md`
demonstrated required 40–100% platform-wide monthly engagement with no evidentiary basis.

---

## 2. Provider pricing — primary-source, fetch-dated

All fetched 2026-07-27/28 this session via `WebFetch` against the vendor's own pricing page unless marked
otherwise. Where a page redirected to JS-rendered content or a slider, that is stated and the number is marked
lower-confidence.

### 2.1 Supabase native Auth / Third-Party Auth (the baseline + the "official" swap path)

- MAU: 100,000 included (Pro/Team), then **$0.00325/MAU**. Free tier: 50,000. (`supabase.com/pricing`)
- **Third-Party MAU (TP-MAU) — the mechanism for plugging in an external provider while keeping RLS — is billed
  at the IDENTICAL rate and quota: 100,000 included, then $0.00325/TP-MAU** (`supabase.com/docs/guides/platform/
  manage-your-usage/monthly-active-users-third-party`, fetched 2026-07-27). **This is the single most important
  pricing fact in this report: the "officially supported" unbundling path saves $0 on the metric it exists to
  cut**, because Supabase meters a third-party login exactly like a native one.
- **"It is not possible to disable Supabase Auth at this time"** (`supabase.com/docs/guides/auth/third-party/
  overview`, fetched 2026-07-27, quoted verbatim). You cannot even remove the native GoTrue cost line by
  switching — you can only add a second, equally-priced meter next to it.
- Supported partners are a **closed list of five**: Clerk, Firebase Auth, Auth0, AWS Cognito, WorkOS
  (`supabase.com/docs/guides/auth/third-party/overview`, fetched 2026-07-28, quoted: *"Supabase has first-class
  support for these third-party authentication providers:"* followed by exactly those five). **No generic
  custom-OIDC registration is documented.** This directly determines which of the mandate's seven providers can
  even keep RLS working on hosted Supabase — see §4.4.

### 2.2 Clerk — `clerk.com/pricing`, fetched 2026-07-28

| Item | Value |
|---|---|
| Base plans | Hobby $0 · **Pro $25/mo** · Business $300/mo · Enterprise custom |
| MRU ("Monthly Retained User" — only counts if the user returns ≥24h after signup, a *stricter* metric than Supabase's MAU) | 50,000 free, then **$0.02** (50,001–100,000) → $0.018 (100,001–1M) → $0.015 (1M–10M) → $0.012 (10M+) |
| MRO ("Monthly Retained Organization") | **100 free**, then $1.00 (101–1,000) → $0.90 (1,001–10,000) → $0.75 (10,001–100,000) → $0.60 (100,001+) |
| Unlocking MRO tiers past 100 | requires the **Enhanced B2B Authentication add-on, $100/mo** ($85/mo annual) |
| Magic link / email code | Included free on every tier (confirmed: "Email codes: Yes/Yes/Yes", "Email links: Yes/Yes/Yes") |
| Custom SMTP / per-tenant branded email | Not documented on the pricing page — not confirmed either way |

**Gyms map 1:1 to Clerk Organizations.** This is the load-bearing fact for Clerk's cost at RED's scale: the meter
that actually binds is **gym count**, not engagement.

### 2.3 WorkOS AuthKit — `workos.com/pricing`, fetched 2026-07-28

| Item | Value |
|---|---|
| MAU | **First 1,000,000 free**, then $2,500/mo per additional 1M |
| SSO connections (NOT required for RED's shape — no gym brings its own enterprise IdP) | $125/ea (1–15), volume-discounted, custom above 201 |
| Directory Sync | same connection-based pricing as SSO |
| Audit log streaming / retention | $125/mo per SIEM connection; $99/mo per 1M events retained |
| "Organizations" cost as a bare multi-tenancy construct (no SSO/Directory Sync attached) | **Not stated on the pricing page either way** — attempted two further fetches (`workos.com/docs/user-management/pricing`, `workos.com/docs/authkit`), both returned redirects/stubs with no pricing content. **Unconfirmed — flagged as a blind spot (§8), not assumed free.** |

Even at the mandate's own **High** band at 3,000 gyms (271,875 MAU), this is **well inside the 1M free MAU
tier** — the only provider of the seven where every cell of the pricing matrix in §3 is $0 on the MAU axis,
*if* Organizations carry no separate charge.

### 2.4 Auth0 — `auth0.com/pricing`, fetched 2026-07-28, cross-checked against a secondary aggregator (flagged as such)

| Item | Value (primary fetch) |
|---|---|
| Free tier | 25,000 MAU, identical B2C/B2B, no card required |
| B2C Essentials | $35/mo @ 500 MAU baseline; example given: 1,000 MAU = $70/mo |
| B2C Professional | $240/mo baseline |
| B2B Essentials | $150/mo @ 500 MAU baseline |
| B2B Professional | $800/mo baseline |
| Organizations (multi-tenancy) | **5 free · 10 on paid B2C tiers · "Unlimited" only on B2B tiers** |
| Passwordless / magic link | Included free and on paid tiers |

**RED needs 100–3,000 organizations.** Every B2C tier caps at 10 — structurally unusable past 10 gyms. **Only
the B2B tiers give unlimited organizations**, and B2B Professional's disclosed base is **$800/mo before a single
MAU is counted** — a fixed floor driven by gym count, exactly like Clerk's MRO tier, not by the MAU figures this
mandate asked to price against.

A secondary source (`auth0pricing.com`, **not** Auth0's own site — cited only to flag a discrepancy, not trusted)
claims "free to 7,500 MAU" and "$0.07/additional MAU beyond Professional's 1,000 MAU baseline." This conflicts
with the directly-fetched 25,000-MAU free-tier figure. **Marked ASSERTED / low-confidence**: Auth0's own pricing
page is a JS slider whose full tier ladder above the disclosed anchor points could not be fetched as static
content this session. The B2B-tier-floor finding above (5/8) does not depend on this uncertain number and is
high-confidence on its own.

### 2.5 Better Auth — `better-auth.com/pricing` + `/docs/plugins/organization`, fetched 2026-07-28

**Free, open source, $0 licensing regardless of MAU** — confirmed verbatim: *"The Better Auth framework is free
and open source. Pricing below is for our managed infrastructure."* The "managed infrastructure" tiers (Starter
free / Pro $20mo / Enterprise custom) price **audit logs, security-detection events, enterprise SSO connections
($50/mo/connection beyond the first), and transactional email/SMS ($0.001/email, $0.09/SMS)** — none of which
gate core auth or MAU. An **`organization` plugin ships in core** (`better-auth/plugins`, no enterprise flag),
confirmed to support members/teams/roles/invitations. **The developer supplies their own email transport** for
invitation/magic-link sends (docs: *"we first need to provide `sendInvitationEmail`"*) — RED already has this
(Resend + custom SMTP, ADR-0014), so this is not new work, but it is not "free" in the sense of zero engineering
either.

**Not on Supabase's third-party-auth partner list (§2.1).** See §4.4 for what this means for RLS.

### 2.6 Auth.js (NextAuth) — `authjs.dev`, fetched 2026-07-28

**Free, open source, no MAU pricing** — confirmed: *"Free and open source."* No built-in magic-link/email
provider was found in the fetched homepage content (Auth.js does ship an Email provider in its broader docs per
general framework knowledge, **not independently re-verified this session** — flagged). No built-in
organizations/multi-tenancy concept — confirmed absent from the fetched content; multi-tenancy would be
hand-built on top, same shape as `gym_membership` today but without the two years of ADR-driven correctness work
already sunk into that table (ADR-0009, ADR-0015).

**Not on Supabase's third-party-auth partner list.**

### 2.7 Keycloak — `keycloak.org`, fetched 2026-07-28

**Open source, self-hosted only.** Confirmed: *"Keycloak is a Cloud Native Computing Foundation incubation
project."* No managed cloud product from the Keycloak project itself was found (Red Hat's commercial "RHBK"
build is a separate paid product, not fetched/priced this session — out of scope, since the mandate named
"Keycloak," not Red Hat's build). $0 licensing; cost is entirely your own hosting/ops effort. Multi-tenancy in
Keycloak is conventionally realm-based (one realm per tenant) — **this specific claim is general
identity-engineering knowledge, not fetched this session**, and 3,000-realm operational scaling (admin console,
backup/restore per realm) is a known pain point in the Keycloak community that was not independently verified
here — flagged as a blind spot.

**Not on Supabase's third-party-auth partner list.**

### 2.8 Zitadel — `zitadel.com/pricing`, fetched 2026-07-28

| Item | Value |
|---|---|
| Free | **100 Daily Active Users** (DAU, not MAU), unlimited organizations, $0/mo |
| Pro | $100/mo, 25,000 DAU included |
| Enterprise | Custom, unlimited DAU, cloud or self-hosted |
| Self-hosted (open source) | Available, $0 licensing (same OSS-vs-managed shape as Keycloak) |

**Zitadel bills DAU, not MAU** — a structurally different, stricter metric that `workload-auth.md`'s model does
not produce (that document derives MAU only). Converting the §1 MAU figures to a DAU estimate requires an
assumption this session has no live data for; I did not force one into the headline pricing table (§3) to avoid
manufacturing a number rule 6 would flag. **Bounding estimate only, explicitly modelled**: if roughly 5–15% of a
month's distinct active users are active on any *given* day (a low-frequency-app assumption consistent with
`workload-auth.md`'s own finding that most engagement is a single monthly booking check, not daily habitual use),
Expected-band DAU would run **≈130–380 at 100 gyms, ≈1,300–3,800 at 1,000 gyms, ≈3,800–11,500 at 3,000 gyms** —
which would mean the **free 100-DAU tier is exceeded almost everywhere**, and the $100/mo Pro tier (25,000 DAU)
comfortably covers all three scale points at Expected engagement. **This is a model, not a measurement — flagged
§8.**

---

## 3. Cost comparison — Expected-engagement band, all fetched/computed above

| Gyms (Expected MAU) | Supabase native | Supabase TP-Auth (any partner) | Clerk | Auth0 | WorkOS | Better Auth / Auth.js / Keycloak / Zitadel(self-host) |
|---|---|---|---|---|---|---|
| 100 (2,563) | **$0** | **$0** (+ $0 nothing saved) | $0 MAU + $0 org (≤100) — **$0** if Pro plan not required, else **$25/mo** | $0 MAU but capped at 10 orgs (B2C) — **unusable past 10 gyms without B2B tier ($150–800/mo floor)** | **$0** (well under 1M) — Organizations cost unconfirmed | **$0 vendor fee**, but not RLS-pluggable (§4.4) |
| 1,000 (25,625) | **$0** | **$0** | $0 MAU + **≈$900 org fee + $100 add-on ≈ $1,000/mo** | B2B floor **$150–800+/mo** just for org count | **$0** (well under 1M) — Organizations cost unconfirmed | **$0 vendor fee**, not RLS-pluggable |
| 3,000 (76,875) | **$0** | **$0** | $0 MAU (<50k... wait 76,875>50k: **≈$538/mo MRU overage**) + **≈$2,700 org fee + $100 add-on ≈ $3,338/mo total** | B2B floor **$150–800+/mo**, likely custom-quote territory at this MAU per the (low-confidence) secondary source | **$0** (well under 1M) — Organizations cost unconfirmed | **$0 vendor fee**, not RLS-pluggable |
| 3,000 × **High** (271,875) | **≈$559/mo** | **≈$559/mo** | MRU: 50k free + 50k@$0.02 + 171,875@$0.018 ≈ **$4,094/mo**, + org fee ≈$2,800/mo ⇒ **≈$6,894/mo total** | B2B, likely 5-figure/mo per industry commentary (unverified primary) | **≈$0/mo** (still <1M) — Organizations cost unconfirmed | not RLS-pluggable |

**Reading the table:** Clerk and Auth0 are **more expensive than Supabase at every single cell**, before counting
migration cost, because their pricing binds on **organization count** (fixed at 100–3,000 for RED, regardless of
engagement) rather than on MAU (the thing that stays low per `workload-auth.md`). The Supabase-native column is
never worse than any paid competitor. WorkOS is the only provider that could plausibly beat Supabase's worst case
($559/mo → $0), and only in the one cell (3,000 gyms × High) where Supabase charges anything at all — everywhere
else it's a $0-vs-$0 tie that doesn't justify a migration.

---

## 4. What breaks: `auth.uid()` is not portable — measured against live prod + the actual RLS/RPC bodies

### 4.1 Live surface area (read-only, PostgreSQL 17.6, 2026-07-27/28)

```sql
select count(*) from pg_policies where schemaname='public';
-- 101 total policies, all tables

select count(*) from pg_policies where schemaname='public'
  and (qual ilike '%auth.uid()%' or with_check ilike '%auth.uid()%');
-- 28  -- policies with auth.uid() DIRECTLY in their predicate text (via pg_policy.polqual/polwithcheck)

select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosecdef;
-- 18  -- SECURITY DEFINER functions in public

select p.proname, p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosrc ilike '%auth.uid()%' order by p.proname;
-- 22 rows: actualizar_cliente, actualizar_paquete, actualizar_paquete_marketing, actualizar_plantilla,
-- cancelar_reserva, crear_plantilla, eliminar_plantilla, has_role, is_member_of, is_staff_of,
-- marcar_invitacion_enviada, mi_membresia, pasar_lista_sesion, preparar_invitacion, reclamar_o_crear_cliente,
-- reclamar_por_codigo, reservar_clase, sembrar_plantillas_default, set_plan_features, staff_gym,
-- toggle_favorito_tipo, toggle_pase
```

The 28 policies with `auth.uid()` directly in the predicate span every member/staff-facing table:
`about_value`, `asistencias`, `class_session(+coach)`, `class_type(+bring_item+workblock)`, `clientes` (×2),
`coach`, `cobro`, `contact_message`, `facility`, `faq`, `gym_contact`, `gym_membership`, `paquetes`, `perfil`,
`plan_feature`, `plantillas`, `reservation` (×2), `room`, `schedule_template(+coach+week)`, `stat`, `ventas` —
confirmed via `pg_policy`/`pg_class` join this session. The 22 functions cover every RPC the client and admin
apps call for identity resolution, booking, favorites, invitation, claim, and CRM writes. **This is not a small
surface: it is essentially the entire authorization spine of both apps.**

This matches (and is more granular than) ADR-0013 §1's own framing: three membership-keyed
`SECURITY DEFINER` helpers (`is_member_of`, `is_staff_of`, `has_role`, plus `staff_gym`) are **the one home of the
membership rule** (`docs/adr/0013-gym-scoped-rls-mechanism.md:13-27`), which is a genuine mitigating property —
see §7's honest "what's fine" note.

### 4.2 The type problem, confirmed from a vendor's own migration guide, not inferred

`auth.uid()` returns a native Postgres `uuid`, sourced from `auth.users.id` (a Supabase-generated UUID). Every
third-party provider in this mandate issues its **own string-shaped user ID** — Clerk (`user_xxxxx`), Auth0
(`auth0|xxxxx`), Firebase (a Firebase UID string), WorkOS (`user_01H...`), Cognito (a sub string), Zitadel, and
whatever Better Auth/Auth.js/Keycloak are configured to emit. **None of these are Postgres UUIDs.**

Confirmed via Clerk's own official Supabase integration guide (`clerk.com/docs/guides/development/integrations/
databases/supabase`, fetched 2026-07-28, quoted verbatim):

```sql
create table tasks(
  id serial primary key,
  name text not null,
  user_id text not null default auth.jwt()->>'sub'   -- NOT auth.uid(), NOT uuid
);

create policy "User can view their own tasks" on "public"."tasks"
  for select to authenticated
  using (((select auth.jwt()->>'sub') = (user_id)::text));  -- NOT auth.uid()
```

**This is not a config change — it is a type-and-predicate rewrite that touches every identity-keyed column in
the schema.** Concretely, at minimum:

- `gym_membership.user_id` (uuid, half the PK `(user_id, gym_id)`, `supabase/migrations/20260702161010_create_gym_membership.sql`) → `text`.
- `clientes.auth_user_id` (uuid, the load-bearing `clientes_auth_user_id_per_gym UNIQUE (gym_id, auth_user_id) WHERE auth_user_id IS NOT NULL` — the exact index the multigym-rpc-scoping memo calls a "LOAD-BEARING PRECONDITION" for `mi_membresia`/`toggle_favorito_tipo` determinism) → `text`.
- All **28** policies' `auth.uid()` → `(select auth.jwt()->>'sub')`, and every comparison against a uuid column recast to `text`.
- All **22** function bodies' `v_uid uuid := (select auth.uid())` declarations (and every downstream join/compare using `v_uid`) → `text`.
- Every index built over these columns (`gym_membership_pkey`, `clientes_auth_user_id_per_gym`, plus whatever `ventas_cliente_created_idx`/`clientes_auth_user_id_idx` land from the two prior sessions' recommended fixes) redefined on the new type.
- `packages/data/src/database.types.ts` regenerated (uuid→string is a smaller TS-level change, but every call site that treats `auth_user_id`/`user_id` as a UUID-shaped value needs re-auditing).

None of this is exotic engineering — but it is **not** the "swap the SDK, keep the SQL" story a first pass at
"unbundle auth" suggests. It is a full pass over the tenant-isolation boundary that two prior sessions
(auth-structure-scale-audit, multigym-rpc-scoping-decision-memo) each independently spent significant effort
verifying line-by-line.

### 4.3 The activation/session architecture is Supabase-admin-API-specific, not just RLS-specific

Beyond RLS, the entire invite→activate→claim rail (ADR-0009 amendment 2026-07-15, ADR-0015) is built on
Supabase GoTrue's admin surface, confirmed by file:line in `workload-auth.md` §1.3 and re-checked this session:

- `supabase/functions/activar-cuenta/index.ts:92-95` — `admin.auth.admin.createUser({ email, email_confirm: true })`
- `index.ts:105-109` — `admin.auth.admin.generateLink({ type: "recovery", email })`
- `packages/data/src/server/sesion.ts` — `supabase.auth.verifyOtp`, `signInWithPassword`, `signInWithOtp`
- `packages/data/src/server/registro.ts:74-97` — `supabase.auth.signUp`
- `apps/client/src/proxy.ts:38-83` and `apps/admin/src/proxy.ts` — both run `supabase.auth.getClaims()` on every
  navigation to silently rotate the session token (confirmed this session via grep — both proxies use it, closing
  the blind spot `workload-auth.md` §9 flagged about not having checked the admin proxy).

Every one of these has a *different* vendor-specific equivalent (Clerk's `backend.users.createUser` +
`clerkMiddleware()`, Auth0's Management API, WorkOS's User Management API + AuthKit hosted UI, etc.) — this is a
**from-scratch reimplementation** of the pre-confirmed-account provisioning flow that ADR-0009's 2026-07-15
amendment describes as closing a real security hole (an unsolicited-session vector) after careful design work,
not a mechanical port.

### 4.4 Four of the seven named providers have no supported path to keep RLS at all

Cross-referencing §2.1's closed five-partner list against the mandate's seven providers:

| Provider | On Supabase's Third-Party-Auth list? | RLS-preserving path on **hosted** Supabase |
|---|---|---|
| Clerk | Yes | Supported (§4.2's rewrite still required) |
| Auth0 | Yes | Supported (same rewrite) |
| WorkOS | Yes | Supported (same rewrite) |
| Firebase (not asked for, but note it's on the list) | Yes | Supported |
| AWS Cognito (ditto) | Yes | Supported |
| **Better Auth** | **No** | **None found this session** |
| **Auth.js** | **No** | **None found this session** |
| **Keycloak** | **No** | **None found this session** |
| **Zitadel** | **No** | **None found this session** |

For the four unsupported providers, the only two options are: **(a) abandon RLS** — move every one of the 25+
gym-scoped policies' logic into application-layer `.eq("gym_id", …)` checks at every one of the dozens of
`packages/data/src/server/*.ts` call sites, with **no database-level backstop** if one is missed, which is
precisely the failure class AGENTS.md's `rpc-write-coverage` guard and issues #78/#80 exist to catch — or
**(b) self-host Postgres/PostgREST outside Supabase**, which is a materially bigger move than "keep Postgres,
replace only auth" (it also replaces the managed-Postgres layer this mandate says to keep). **Neither option was
priced in the migration-hour estimate below** because both are a different, larger mandate — flagged, not costed.

---

## 5. Migration cost estimate — hours, itemized (modelled, not measured; no work was implemented this session)

Scoped to the **best case**: one of the five officially-supported providers, RLS kept, no re-architecture.

| Task | Hours (range) | Basis |
|---|---|---|
| Rewrite 28 RLS policies (`auth.uid()` → `auth.jwt()->>'sub'`, uuid→text casts) + re-verify each against the existing denial suite | 30–45 | §4.1 count; ADR-0013's "one home" helper pattern caps this below a naive per-policy estimate |
| Rewrite 22 function bodies (4 helpers + 18 RPCs, several multi-statement: `mi_membresia`, `reservar_clase`, `cancelar_reserva`, `reclamar_o_crear_cliente`, `reclamar_por_codigo`) + AGENTS.md-mandated written-row suite assertions per write RPC | 45–65 | §4.1 count; AGENTS.md's "a migration that changes what an RPC writes ships with a written-row assertion" applies to every one of these |
| Column type migrations (`gym_membership.user_id`, `clientes.auth_user_id`: uuid→text) incl. re-deriving `clientes_auth_user_id_per_gym` and the PK, expand/contract style per this repo's own convention | 16–24 | §4.2 |
| Activation/session/registration rewrite: `activar-cuenta` edge function, `sesion.ts`, `registro.ts`, both apps' `proxy.ts` middleware, against the new provider's SDK | 40–60 | §4.3 |
| Per-gym branded transactional email re-wiring (no named provider naturally supports 100–3,000 independently-branded tenant senders the way ADR-0014's custom-SMTP-per-brand setup does; likely means disabling vendor default emails and routing raw tokens through the existing Resend pipeline) | 16–24 | §2 feature notes; ADR-0014 |
| `database.types.ts` regen + TS call-site fixes (8+ confirmed `getClaims`/`getUser` sites, `packages/data/src/server/_auth.ts`, `sesion.ts`, `resolve-tenant.ts`) | 8–12 | grep this session, 31 files touching auth imports, 8 confirmed `getClaims`/`getUser` call sites incl. both proxies |
| Denial-suite (`supabase/tests/`) fixture rewrite — every seeded `auth.users` row + `request.jwt.claims` shape changes from a Supabase-shaped JWT to the new provider's claim shape, across all suites the `test:denial` gate runs | 30–45 | AGENTS.md's coverage-gate description; this is the widest blast-radius single item |
| End-to-end QA regression (login, activation, magic link, booking, staff walk-in) + ADR amendments (0001, 0009, 0013 all assume native Supabase auth) | 20–30 | judgment call, consistent with the scope above |
| **Total** | **≈205–305 hours** | sum; call it **≈180–280 hrs** allowing for the itemized ranges' natural overlap on shared context-switching |

This is a **one-time cost of roughly 5–7 weeks of one engineer's full-time work**, not the "day of work" the
prior session's canonical-gym-resolver fix required — this is a different order of magnitude because it touches
the tenant-isolation boundary itself, not a caller convention on top of it.

---

## 6. Verdict per scale point — does the MAU saving pay for the migration?

| Scale | Native Supabase MAU cost (all 3 bands) | Best-case alternative ongoing cost | Migration cost | Verdict |
|---|---|---|---|---|
| **100 gyms** | **$0** (Low/Expected/High all under 100k) | $0 (WorkOS) to $3,338/mo (Clerk at High) | 180–280 hrs | **NO.** There is nothing to save. Every alternative is break-even at best, most are strictly worse, and none of the seven providers changes a $0 bill to a lower one. |
| **1,000 gyms** | **$0** (High band 90,625 still under 100k) | $0 (WorkOS) to ~$1,000+/mo (Clerk org fee) to $150–800+/mo floor (Auth0 B2B) | 180–280 hrs | **NO.** Identical reasoning — the free quota absorbs even this mandate's own High-engagement scenario. |
| **3,000 gyms** | **$0 (Low/Expected) to ≈$559/mo (High only)** | $0 (WorkOS, unconfirmed org pricing) to ~$3,435+/mo (Clerk) to likely 4–5 figures/mo (Auth0 B2B at this MAU, low-confidence) | 180–280 hrs | **NO, with one narrow exception that still fails on payback math.** Only the High band (which itself requires a structural fix — auto-fire invites at sale, per `workload-auth.md` §6 — that RED does not have) exposes any dollar figure to save, and it is capped at $559/mo. Even against WorkOS's best-case $0, at a conservative $75/hr blended engineering cost the 180–280 hr rewrite is **$13,500–$21,000 one-time**, a **24–37 month payback period** against the maximum possible $559/mo saving — before pricing the operational risk of a from-scratch rebuild of the activation rail ADR-0009/0015 spent two correction cycles hardening. |

**Exit trigger (rule 4) — what would reverse this verdict:**
1. Supabase shrinks the included MAU/TP-MAU quota materially below ~80,000 on Pro/Team (the auth-structure-scale
   audit's vendor-risk section already flags "budget for upward pricing drift and at least one more gating
   change" as a live risk — this has not happened yet, but re-run this analysis the day it does).
2. Live, **measured** (not modelled) member MAU at any real gym exceeds ~30% of roster for two consecutive
   months — i.e., the High band in `workload-auth.md` proves to be the realistic case, not the ceiling case, on
   real data rather than the reasoned-but-unmeasured defenses in that document's §6 table.
3. RED ships a feature that structurally requires **daily** engagement (in-app payment, self-check-in, streaks)
   — this would also push Zitadel's DAU-based pricing (§2.8) into relevance and change that provider's ranking.

None of these three conditions is currently true; this verdict should be re-run, not assumed permanent, if any of
them becomes true.

---

## 7. What's actually fine here — stated plainly (rule 7)

- **The membership rule already has exactly one home** (ADR-0013 §1: `is_member_of`/`is_staff_of`/`has_role`/
  `staff_gym`), which is precisely the property that keeps the migration-hour estimate in §5 from being far
  larger — a less disciplined codebase with the membership check inlined into 28 bespoke policies instead of 4
  helpers would cost meaningfully more to migrate. This is a real, evidence-backed asset the current architecture
  built, and it should be credited, not just audited for defects.
- **Supabase's own MAU pricing is not the threat** this mandate was built to find — `workload-auth.md`'s
  correction from $845–1,430/mo down to $0–559/mo holds up under this session's independent read of the same
  Supabase pricing/docs pages, fetched fresh rather than trusted from the prior document.
- **The "swap auth to save money" instinct is a reasonable one to test** — it was worth actually pricing seven
  providers and reading the vendor's own migration guide rather than asserting "auth is expensive" from
  reputation. The instinct just doesn't survive contact with this specific codebase's numbers.

---

## 8. Blind spots — what this session did not examine

- **WorkOS's "Organizations" pricing was not confirmed free.** Three fetch attempts (`workos.com/pricing`,
  `/docs/user-management/pricing`, `/docs/authkit`) either omitted the topic or returned a redirect stub. WorkOS
  is the one provider whose entire "no-cost swap" case in §3/§6 rests on this being free — if it turns out to
  carry a per-organization charge at RED's 100–3,000-gym scale, the one scenario where this mandate's premise
  could theoretically hold (3,000 gyms × High band) collapses too. **Verify directly with WorkOS sales/docs
  before acting on this report's WorkOS numbers.**
- **Whether hosted Supabase exposes a raw/generic PostgREST JWT-secret or JWKS config outside the five-partner
  dashboard UI was not tested against a live project** (this session was read-only and could not open the Auth
  settings dashboard or attempt a config change). I inferred "no generic custom-OIDC path" from documentation
  silence, which is weaker than a direct negative test — this is the load-bearing assumption behind §4.4's claim
  that Better Auth/Auth.js/Keycloak/Zitadel-self-hosted can't keep RLS on hosted Supabase.
- **The "abandon RLS, move to app-tier authorization" path was named but not costed.** It is very likely larger
  than the 180–280 hr estimate in §5 (it has to replicate all 25+ policies as hand-written checks with no DB
  backstop, at every call site) but I did not build an itemized estimate for it — that is a different mandate's
  worth of work.
- **Auth0's pricing above its two disclosed anchor points (500 MAU / 1,000 MAU) was not independently fetched**
  — the page renders a JS pricing slider that static WebFetch cannot drive. The B2B-tier-floor finding (§2.4,
  independent of this uncertainty) is solid; the higher-volume MAU figures are not.
- **Zitadel's DAU:MAU conversion is a stated model, not a measurement** — `workload-auth.md` does not produce a
  DAU figure for this platform, and this session did not attempt to derive one from live session/token-refresh
  timestamps (which would require access this read-only session didn't use for that purpose).
- **No vendor-risk / uptime / SLA comparison was done for Clerk, WorkOS, Auth0, or the self-hosted options** —
  the auth-structure-scale audit did this work for Supabase (control-plane degradation windows, no-SLA-below-
  Enterprise); an equivalent pass for the alternatives was out of this mandate's scope but would matter if a
  future session weighs "worse pricing but better reliability" tradeoffs.
- **Better Auth / Auth.js / Keycloak / Zitadel's actual multi-tenancy operational cost at 3,000 tenants** (realm
  count in Keycloak, org count in the others) was reasoned about, not load-tested or verified against any
  vendor's own scale documentation.
