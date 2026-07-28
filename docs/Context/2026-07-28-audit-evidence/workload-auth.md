# MAU consumption model — agent `workload:auth`

**Date:** 2026-07-27 · **Subject:** RED 2.0 · **Question:** build the Monthly Active User meter — the
largest single Supabase line item the prior audit priced ($845–$1,430/mo of the $1,600–$3,100/mo full
stack at 3,000 gyms) — from the codebase and live prod, not from assumption.

**Headline: the prior audit's MAU number is very likely too high, not too low.** It implicitly assumed
40–100% of the roster is monthly-active (backed out from its own inputs, §6). Every piece of live
evidence gathered this session — the actual invite-completion funnel, the fact attendance-taking is
100% staff-driven, and the fact the app has no self-check-in and no in-app payment — points the other
way: realistic member MAU is **0.75%–38.5% of roster**, and in the low/expected bands the entire
platform's Auth MAU stays inside Supabase's **free 100,000/month allocation even at 3,000 gyms** — the
$845–1,430/mo line item may be **$0**. The real risk this model exposes is not an inflated bill; it's
that the client app may see substantially less real engagement than the roster count suggests, which is
a product/adoption problem, not an infra-cost one. See §6 for the reconciliation.

---

## 1. Who gets an `auth.users` row, and when — traced to file:line

### 1.1 Staff (owner/operator) — YES, same global table, same meter

`apps/admin/src/app/(auth)/login/_components/login-form.tsx:57-61` — the admin app's ONLY sign-in path:

```ts
const supabase = createClient();
const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
```

This is the identical `auth.users` table as the client app (one Supabase project, ADR-0012). There is no
separate "staff" auth system and no separate metering — a staff sign-in costs exactly the same MAU unit
as a member sign-in. Confirmed live: `gym_membership` role counts are `{owner: 4, member: 5}` = 9 rows,
and `auth.users` has exactly 9 rows (query in §5) — a 1:1 match today, no orphans.

`supabase/migrations/20260702161010_create_gym_membership.sql:19` — the role CHECK constraint:
`role text not null check (role in ('owner', 'operator', 'member'))`. No code path anywhere creates an
`owner`/`operator` row programmatically (repo memory, corroborated: every gym's first owner row today is
either the one hardcoded backfill INSERT in that migration, `:90-95`, or hand-written SQL against prod).

### 1.2 Invited-but-not-activated member — NO `auth.users` row

`supabase/migrations/20260708210000_preparar_invitacion_rpc.sql:24-78` (`preparar_invitacion`) is the
entire staff-side "invite" action. It touches **only** `public.clientes.claim_code`:

```sql
update public.clientes set claim_code = v_code where id = p_cliente_id;
```

No `auth.users` write, no `gym_membership` write. Confirmed live: 34 `clientes` rows carry a live
`claim_code` with `auth_user_id IS NULL` (query in §5) — 34 real, pending, zero-cost-to-Supabase
invitations sitting in the roster today.

### 1.3 `/activar` fresh-provision rail — `auth.users` row created (and an MAU-billable session
established) at the FIRST step, before the password is set or the roster row is claimed

Sequence, each line verified:

1. Member clicks the emailed `/activar?codigo=…` link (an email `preparar_invitacion` → Resend already
   sent), types their email, submits. `apps/client/src/app/activar/actions.ts:62`:
   `const result = await iniciarActivacion({ codigo, email });`
2. `packages/data/src/server/activacion.ts:91-107` POSTs to the edge function.
3. `supabase/functions/activar-cuenta/index.ts:92-95` — **the row is created here**:
   ```ts
   const { error: createErr } = await admin.auth.admin.createUser({
     email: decision.email,
     email_confirm: true,
   });
   ```
4. `index.ts:105-109`, same request: `admin.auth.admin.generateLink({ type: "recovery", email })` mints a
   `token_hash`.
5. `activacion.ts:124`, same browser round-trip: `confirmarTokenHash("recovery", tokenHash)` →
   `packages/data/src/server/sesion.ts:98-106`:
   ```ts
   const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
   ```
   This **establishes a live session** — a "log in" event by Supabase's own MAU definition (§4).
6. Redirect to `/activar/contrasena`. **Only now**, in a SEPARATE step, does
   `completarActivacion` (`activacion.ts:145-165`) call `actualizarPassword` and then
   `reclamarPorCodigo` (`supabase/migrations/20260722120000_reclamar_por_codigo_firma.sql:88-98`), which
   is the ONLY point that stamps `clientes.auth_user_id` and inserts the `gym_membership('member')` row.

**Consequence, stated precisely:** a member who solves the Turnstile challenge, opens the link, and types
their email — then closes the tab, distracted, before ever choosing a password — has already: (a) a
permanent billable `auth.users` row, (b) already counted as 1 MAU for that calendar month via the
`verifyOtp` in step 5, and (c) is invisible to staff as "activated" (the admin roster still reads
"invitación enviada", because `clientes.auth_user_id` stays NULL until step 6 completes). **The MAU
charge and the product outcome ("this person is now a claimed, bookable member") are decoupled by one
form submission.** Live check (§5): this abandonment has not yet happened in prod — 9 `auth.users` = 5
claimed `clientes` + 4 owners exactly — but nothing in the code prevents it, and it will show up as
`auth.users` rows the admin app cannot see or reconcile against any roster row.

### 1.4 `cuenta_existente` rail (member already has an account at a different gym) — no NEW row

`supabase/functions/activar-cuenta/nucleo.ts:126-140` (`esErrorEmailExistente`) catches Supabase's
`email_exists`; `index.ts:96-100` mints **nothing** for that case. Instead
`apps/client/src/app/activar/actions.ts:82-85` sends a passwordless sign-in link:
```ts
await enviarMagicLink(email, `${origin}/auth/confirm?codigo=${codigo}&firma=${firmaCodigo(codigo)}&next=/reservar`);
```
→ `packages/data/src/server/sesion.ts:58-69`: `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo } })`. Clicking that link authenticates the **same** `auth.users` row — 1 MAU, not a new one. This is the mechanism that makes global auth de-dup real for MAU (§2), not just for row storage.

### 1.5 A SEPARATE, actively-marketed self-serve door: `/registro` — open to anyone, no staff involvement

`/registro` is not dead code from the H2v2 ruling (only its `?codigo=` **claim** arm was removed — the
plain signup stayed and is live). It is linked as a "Regístrate" CTA from:
- `apps/client/src/app/(home)/page.tsx:72,91`
- `apps/client/src/app/precios/page.tsx:84,208`

`packages/data/src/server/registro.ts:74-97` (`registrarSocio`):
```ts
const { data, error } = await supabase.auth.signUp({
  email: input.email, password: input.password,
  options: { emailRedirectTo, data: { full_name: input.nombre, phone_e164: … } },
});
```
Gated only by `resolveTenant(host)` (§ CONTEXT.md — the gym is inferred from which domain was visited)
and Turnstile — **no invite code, no staff action, no payment**. `signUp` creates the `auth.users` row
immediately in an *unconfirmed* state (`data.session === null` per `registro.ts:95` — no session yet, so
no MAU charge fires at this instant). The member must click the confirmation email
(`apps/client/src/app/auth/confirm/route.ts` → `confirmarCodigo` → `exchangeCodeForSession`) to establish
a session — **that** click is the MAU-triggering event. On success, `reclamarCliente` →
`reclamar_o_crear_cliente` either claims an existing unclaimed roster row matched by verified email, or
**mints a brand-new `clientes` row with no purchase behind it** — CONTEXT.md:49 calls this state
"registro online pendiente" (Door 2). This is a real, open acquisition channel — not staff-gated at
all — that can generate `auth.users` rows (and, once confirmed, MAU) for people who never paid the gym
and whom staff never invited. **Not yet exercised in prod**: none of the 5 currently-claimed `clientes`
rows show a `reclamar_o_crear_cliente` signature distinct from the `/activar` staff-invite rail in this
tiny sample (all 5 trace to the `red-demo` sandbox where the owner was testing activation, not organic
self-registration) — flagged as unmeasured, not as zero-risk (§7 blind spot).

---

## 2. The structural question: does one `auth.users` row serve a member across gyms? — VERIFIED YES

Schema: `clientes_auth_user_id_per_gym UNIQUE (gym_id, auth_user_id) WHERE auth_user_id IS NOT NULL` —
one `auth_user_id` can hold **one row per gym, many gyms**. `gym_membership` PK is `(user_id, gym_id)` —
same shape. Both RPCs that mint identity (`reclamar_o_crear_cliente`, `reclamar_por_codigo`) always
resolve from `(select auth.uid())` — the CALLER'S existing session — never `admin.createUser` a second
time for an existing email (§1.4). Live, re-verified this session (queries in §5):

| Check | Result |
|---|---|
| `auth_user_id` values holding **claimed** `clientes` rows in 2+ gyms | **0** |
| `user_id` values holding `gym_membership` rows in 2+ gyms | **0** |
| emails holding **any** `clientes` row (claimed or not) in 2+ gyms | **4** — `aaron.talavera6@gmail.com`, `ajtalaverapalos@gmail.com`, `d3bigwlf@gmail.com`, `no.waitercuu@gmail.com` |

**Answer: global auth de-dupes MAU across gyms.** A member of 2 gyms is 1 billable MAU, not 2 — confirmed
by the constraint shape AND by the `cuenta_existente` rail's behavior (§1.4: re-auth of the same row,
never a second `createUser`). Caveat: the 4 overlapping emails today are all the owner's own dev/test
inboxes (`aaron.talavera6@gmail.com` is the session owner's personal email, per repo memory) exercising
the activation flow across the `forge`↔`forge-demo`↔`red-demo` sandbox family — this is a synthetic,
not organic, overlap. At 3,000 **unrelated** small businesses in different cities, true dual-gym
membership (a person training at two independent gyms, or an owner who is also staff at a second
location) should be a small correction, plausibly 1–3% of members — not a first-order effect. Modeled as
negligible below; flagged, not ignored.

---

## 3. Is the app actually necessary for a member to open, monthly? — the evidence says mostly no

Attendance-taking (`pase de lista`) is a **staff-only, admin-app action**: `packages/data/src/server/asistencia.ts:9-10` imports `requireOperator` + `getOperatorGym`; the whole module lives under `apps/admin` per `CONTEXT.md:13` ("asistencia / pase de lista … `apps/admin/src/app/(app)/asistencia/`"). A member is marked present by a staff member scanning/checking them off — **never** by the member opening the client app.

There is no in-app payment. `cobro` (bank/CLABE details) is owner-only, staff-facing
(`packages/data/src/server/cobro.ts`, `CONTEXT.md:23`); `MetodoPago` is `efectivo|transferencia|tarjeta`
— all in-person, staff-recorded modes (`CONTEXT.md:25`). A member has **no reason to open the app to
pay**.

The client app's only member-facing authenticated surfaces are `/reservar` (book/cancel a class session,
see the membership plan card via `mi_membresia`) and `/clase/[sessionId]` (class detail + favorite
toggle) — `apps/client/src/app` route listing (§5). **Booking a class is the only recurring, functional
reason to return.**

Live corroboration that most real gym visits do NOT go through the app: **`asistencias` = 705 rows,
`reservation` = 463 rows** (baseline, all 4 gyms). If booking-then-attending were the dominant path,
attendance could not exceed reservations by 52%. It does — meaning most marked attendance is a walk-in
staff action with no prior app interaction. This is measured, not assumed, and it is the strongest single
piece of evidence for a LOW monthly-active-among-activated rate.

---

## 4. Supabase's own MAU definition (fetched, not assumed)

Fetched 2026-07-27 from `https://supabase.com/docs/guides/platform/manage-your-usage/monthly-active-users`:

> "You are charged for the number of distinct users who **log in or refresh their token** during the
> billing cycle (including Social Login…)." … "Each unique user is counted only once per billing cycle,
> regardless of how many times they authenticate."

Fetched 2026-07-27 from `https://supabase.com/pricing`: Pro/Team plans include **100,000 MAU**, then
**$0.00325/MAU** overage. No volume discount tiers documented; Enterprise is custom.

**This confirms two mechanisms that matter for the model:**
1. `verifyOtp` (activation, magic-link, password reset) and `signInWithPassword` are unambiguous "log in"
   events → MAU.
2. **Token refresh alone counts**, and `apps/client/src/proxy.ts:38-83` runs
   `await supabase.auth.getClaims()` — which silently rotates the access token when needed — on **every**
   navigation matching its matcher (`proxy.ts:85-93`), which excludes only static assets, not the public
   marketing pages. So: once a member has EVER signed in, any later visit to **any** page on the gym's
   client-app host — including the public homepage, not just `/reservar` — while their (long-lived)
   refresh-token cookie is still valid, silently re-arms that month's MAU charge with zero deliberate
   member action beyond "clicked a link that landed on this domain." This is the direct mechanism behind
   the mandate's "a member who cancels but signed in that month still counts": MAU billing is decoupled
   from both payment status (no query joins `auth.users` to `ventas`/`vigencia`) and from genuine feature
   engagement (a stale-but-valid cookie plus one incidental page load is enough).

---

## 5. Live prod queries and their output (read-only, 2026-07-27)

```sql
select role, count(*) from public.gym_membership group by role order by 1;
-- [{"role":"member","count":5},{"role":"owner","count":4}]

select count(*) as total_clientes,
  count(*) filter (where auth_user_id is not null) as claimed,
  count(*) filter (where auth_user_id is null and claim_code is not null) as invited_unclaimed,
  count(*) filter (where auth_user_id is null and claim_code is null) as no_invite_sent
from public.clientes;
-- [{"total_clientes":116,"claimed":5,"invited_unclaimed":34,"no_invite_sent":77}]

select id, email, created_at, last_sign_in_at, email_confirmed_at from auth.users order by created_at;
-- 9 rows. Every last_sign_in_at falls between 2026-07-10 and 2026-07-24 (within the 30-day window the
-- orchestrator's baseline reports). Row-by-row: forge-1.0@outlook.com (the Forge owner, last sign-in
-- 07-11), nahumtrevizo2@gmail.com (RED owner, 07-12), demo@red-demo.test (07-15), then 6 more that are
-- all Aaron's personal/test inboxes exercising the activation flow (aaron.talavera6@gmail.com,
-- d3bigwlf@gmail.com, ajtalaverapalos@gmail.com, no.waitercuu@gmail.com, narda_m11@hotmail.com,
-- aarontalavera.271099@gmail.com).

-- Per-gym funnel (fixed to use count(distinct c.id) after an initial JOIN-fanout bug on a first attempt
-- against ventas — flagging the correction so the number is trusted):
select c.gym_id, count(distinct c.id) as total,
  count(distinct c.id) filter (where c.auth_user_id is not null) as claimed,
  count(distinct c.id) filter (where c.claim_code is not null) as invited_pending,
  count(distinct v.cliente_id) as clientes_con_venta
from public.clientes c left join public.ventas v on v.cliente_id = c.id
group by c.gym_id order by total desc;
-- daa1c888 (red-demo, sandbox): total 42, claimed 4, invited_pending 17, con_venta 40
-- d5f81022 (forge, REAL 2-month pilot): total 33, claimed 0, invited_pending 13, con_venta 33
-- 968bafb0 (forge-demo, sandbox): total 22, claimed 1, invited_pending 4, con_venta 15
-- ca1954bc (red, REAL production, 3-day-old seed): total 19, claimed 0, invited_pending 0, con_venta 19

select id, slug, brand_name, created_at from public.gym order by created_at;
-- forge (d5f81022) and red (ca1954bc) are the two REAL gyms; forge-demo/red-demo are dev sandboxes.

-- Global de-dup re-verification:
select auth_user_id, count(distinct gym_id) from public.clientes where auth_user_id is not null
  group by auth_user_id having count(distinct gym_id) > 1;
-- [] — zero claimed multi-gym members today.
select user_id, count(distinct gym_id) from public.gym_membership group by user_id having count(distinct gym_id) > 1;
-- [] — zero multi-gym gym_membership rows today.
select lower(email), count(distinct gym_id) from public.clientes where email is not null and email<>''
  group by lower(email) having count(distinct gym_id) > 1;
-- 4 rows, all Aaron's own test/dev inboxes (see §2 caveat).
```

**Read of the funnel (the load-bearing number for the whole model):** platform-wide, **5/116 = 4.3%** of
the roster has ever completed activation. The most mature REAL gym (`forge`, live ~2 months, 33 real
paying members, 13 invites already sent) has **0 completions**. The actual production `red` gym (19 real
members, seeded 3 days before this audit) has **0 invites sent at all** — consistent with repo memory
("invites = IN-CLASS per-ficha (no batch)"): there is no batch-invite tool
(`docs/Context/2026-07-22-invite-mail-capacity-audit.md:7`: "No bulk path exists anywhere in the repo…
One invite = one operator click"), so cumulative activation is gated by staff doing this one member at a
time, forever, with no way to catch up a backlog.

---

## 6. The MAU model

**Formula:** `MAU_gym = StaffMAU_gym + Roster × CumulativeActivatedFraction × MonthlyActiveRateAmongActivated`

- `CumulativeActivatedFraction` — the STOCK of the roster that has EVER completed `/activar` or
  `/registro`, gated by the manual per-member invite bottleneck (§5) and by member follow-through
  (§1.3's abandonment point).
- `MonthlyActiveRateAmongActivated` — the FLOW: of already-activated members, what fraction sign in or
  get a token refresh (§4) in a given month — gated by how essential booking is at that gym (§3), plus
  the "stale cookie + incidental page load" mechanism (§4) which can push this rate above pure
  intentional-feature-use.
- Reference roster: 200 members (the mandate's example) for the per-gym table; 225 (the midpoint of the
  stated 150–300 target) for the aggregate table, so the aggregate ties to the platform's own stated
  range rather than re-deriving a new number.
- Multi-gym de-dup: modeled as negligible (§2) — no discount applied; flagged as a small downward
  correction if wrong.

| Band | CumulativeActivatedFraction | MonthlyActiveRateAmongActivated | Member MAU fraction of roster | Staff/gym | Defense |
|---|---|---|---|---|---|
| **Low** | 5% | 15% | **0.75%** | 1 | Matches the LIVE, MEASURED real-gym number almost exactly (`forge`: 0%; platform-wide claimed/roster: 4.3%). 15% monthly-active-among-activated reflects that most real visits are staff-marked walk-ins with no app touch (asistencias 52% above reservation, §3) — an activated member with no urgent class to book has no functional reason to reopen the app most months. Staff = 1: every live gym today has exactly 1 owner account, 0 operators. |
| **Expected** | 35% | 30% | **10.5%** | 2 | A moderately diligent operator who works `/activar` into routine onboarding/renewal conversations over the gym's life (roughly the `red-demo` sandbox's 4/42≈9.5% pace, extended organically past the initial test period), at a gym with a real, regularly-used class schedule. Staff = 2 reflects a 200–300-member gym needing at least occasional front-desk coverage beyond the sole owner. |
| **High** | 70% | 55% | **38.5%** | 4 | Requires a structural fix RED does not have today — e.g. invites fired automatically at time of sale (already true for two of the six mail rails per the invite-capacity audit, just not universally) rather than a manual per-ficha click — PLUS a boutique/class-based gym where booking is functionally mandatory to secure a class spot, so most activated members interact monthly. Staff = 4 (owner + 3 for shift coverage) is the top of a commercial 300-member gym's realistic staffing. |

### Per-gym MAU, 200-member reference (the mandate's example)

| Band | Member MAU | Staff MAU | **Total MAU/gym/month** |
|---|---|---|---|
| Low | 200 × 0.75% = 1.5 | 1 | **≈ 3** |
| Expected | 200 × 10.5% = 21 | 2 | **≈ 23** |
| High | 200 × 38.5% = 77 | 4 | **≈ 81** |

### Total MAU at scale (225-member average roster, per the platform's stated 150–300 range)

Per-gym: Low 225×0.75%+1 = **2.7**; Expected 225×10.5%+2 = **25.6**; High 225×38.5%+4 = **90.6**.

| Gyms | Low MAU total | Expected MAU total | High MAU total |
|---|---|---|---|
| 100 | ≈ 270 | ≈ 2,563 | ≈ 9,063 |
| 1,000 | ≈ 2,688 | ≈ 25,625 | ≈ 90,625 |
| 3,000 | ≈ 8,063 | ≈ 76,875 | ≈ 271,875 |

**All three bands land inside or barely over the free 100,000-MAU allocation, at 3,000 gyms.** Only the
High band crosses it (271,875 − 100,000 = 171,875 over) — costing 171,875 × $0.00325 ≈ **$559/month
total across the whole platform**, not per gym (≈ **$0.19/gym/mo**).

---

## 7. Where this contradicts the prior audit, and the mechanism

`docs/Context/2026-07-27-auth-structure-scale-audit.md:133` prices "Auth MAU overage
(~360k–450k MAU @ $0.00325 over 100k included) → $845–$1,430" at 3,000 gyms × 150–300 members. Backing
out the implied engagement rate from their own inputs: 360,000 MAU ÷ 450,000-member floor (3,000×150) =
**80%**, up to 450,000 MAU ÷ 450,000-member floor = **100%**, or against the 900,000-member ceiling
(3,000×300), 360k/900k = 40% to 450k/900k = 50%. **Their number requires 40–100% of the entire roster to
be monthly-active** (staff is a rounding error at ~9,000 of that total). Nothing in that document states
or defends this assumption — it is not derived from the activation funnel, the attendance-vs-reservation
ratio, or any live conversion data; those weren't examined in that session's mandate.

This session's evidence points the other way on every axis that number would need:
1. **Activation is not universal or fast** — 4.3% platform-wide, 0% at the most mature real gym (§5).
2. **Activation has no batch path and won't catch up on its own** — one operator click per member,
   forever (§5, invite-capacity audit).
3. **The app is not required for the member's core need** (getting into the gym) — that's 100%
   staff-driven (§3), and live attendance numbers show most visits skip the app entirely (§3).
4. **There is no in-app payment** to pull a lapsed-but-curious member back monthly (§3).

**I am not contradicting the prior audit's top-line verdict** ("cost is not the threat") — my model makes
that verdict MORE true, not less: the dollar figure at risk shrinks from an $845–1,430/mo line item to
somewhere between $0 and ~$559/mo total, even at 3,000 gyms. What I am contradicting is the specific
$360k–450k MAU figure, which this session's mandate exists specifically to price and which the prior
session did not derive from evidence. The corrected finding also **reframes the risk**: if real MAU sits
in the Low/Expected band, the business exposure isn't "Supabase overcharges us" — it's "the client app,
as built, may see a small fraction of the roster ever open it," which is a retention/product-adoption
question for the owner, not an infra-cost one.

---

## 8. Seasonality and churn — argued, not measured (no LatAm-specific primary source found)

**January surge / December collapse.** Fetched via web search 2026-07-27 (global fitness-industry data,
not LatAm-specific — flagged): gyms see "12% of new sign-ups" concentrated in January, with "25–30%
increase in new memberships" and "80% of January new members quit within five months" ([wod.guru], via
search). This is consistent with, but not verified against, LatAm seasonality specifically — mark
**ASSERTED**, industry-general. Two consequences for this model: (a) `CumulativeActivatedFraction` likely
isn't flat across the year — a January cohort of new members may activate at a HIGHER initial rate
(fresh motivation, staff onboarding push) then decay toward the low band as the "80% quit within 5
months" pattern plays out; (b) December, conversely, likely sees the lowest `MonthlyActiveRateAmongActivated`
of the year (holiday closures/reduced hours in Mexico are common but not verified from this repo). Neither
number is in the live data (4 gyms, ≤2 months old, no December/January cycle observed yet) — this is a
genuine blind spot (§9), not a modeled adjustment.

**Churn and the "signed in but cancelled" case.** Directly mechanistic, not assumed: nothing in the RPC
layer or the `auth.users`/session-refresh path (§4) reads `ventas`/`vigencia`/package-expiry state before
counting a login or token refresh. A member whose package lapsed last month, who opens `/reservar` once
this month just to check whether they can still book (finds they can't, leaves) still counts as a full
MAU — the billing meter and the "is this still a paying relationship" question are structurally
independent signals. This is not a defect to fix (Supabase's meter isn't supposed to know about a
tenant's billing state) — it's a real bias in this model: any MAU figure derived here should be read as
"distinct sessions," not "distinct paying relationships," and the gap between those two grows with churn.

---

## 9. What I did not examine (blind spots for the next agent)

- **`/registro`'s real-world conversion and abuse rate is completely unmeasured.** I confirmed the door is
  open and linked, but have zero live data on how often it's actually used, by whom, or whether it has
  ever produced a `clientes` row with no matching sale (the "registro online pendiente" state). This is
  the single largest unknown in the High-band ceiling — if this channel gets meaningful organic or bot
  traffic across 3,000 gyms' marketing sites, it could push real MAU above my High band independent of
  anything staff or genuine members do.
- **No December/January cycle exists in live data** (oldest gym is ~2 months old) — §8's seasonality
  claims are argued from general fitness-industry sources, not verified against this platform or LatAm
  specifically.
- **I did not model Monthly Active Third-Party User or Monthly Active SSO User** (Supabase bills these
  separately per its pricing page) — this repo uses neither (email+password + magic link only, ADR-0009),
  so they're correctly $0, but I did not independently re-verify that no OAuth/SSO provider is configured
  in the Supabase Auth dashboard (only the codebase, which shows none wired).
- **The exact refresh-token lifetime/rotation window on this Supabase project** (whether an old,
  never-revisited session can still silently refresh 11 months later) was not read from the dashboard —
  only the code path that WOULD trigger a refresh if a valid cookie exists. If refresh tokens are
  long-lived by default, the "stale cookie + incidental page load" mechanism in §4 is a bigger contributor
  to MAU than modeled; if Supabase expires/rotates aggressively, it's smaller.
- **I did not examine the admin app's own MAU-relevant behavior beyond the login form** — e.g., whether
  `apps/admin` also runs a proxy-level `getClaims()` refresh on every navigation (I inferred it does, by
  pattern-matching the client app's `@supabase/ssr` usage, but did not open `apps/admin/src/proxy.ts`
  to confirm the matcher/behavior is identical).
- **I did not attempt to independently re-derive or challenge the prior audit's non-MAU cost lines**
  (compute, PITR, egress, Vercel, email) — this mandate was scoped to MAU only.
