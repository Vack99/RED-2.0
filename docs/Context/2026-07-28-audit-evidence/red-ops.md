# red:ops — The Organizational Ceiling

**Agent:** `red:ops` · **Date:** 2026-07-28 · **Target:** ≥3,000 LatAm gyms × 150–300 members
**Access used:** live prod `hjppxawglmukfvsgmcog` read-only (SELECT / pg_catalog / `supabase_migrations.schema_migrations`), repo at `C:/Users/Aaron/Documents/Repos/RED-2.0` (branch `main`), git history on all refs, vendor docs fetched 2026-07-28.
**Nothing written. No DDL. No migration.**

---

## 0. Headline

**The database is not what stops this business. One person is.**

Three numbers, each independently measured this session, bound the whole thing:

| Ceiling | Binds at | Measured how |
|---|---|---|
| **Support load saturates the founder** | **~135 gyms** | 169 h/mo ÷ 1.25 founder-h/gym/mo (§5) |
| **Tenant provisioning caps growth** | **~250–500 new gyms/year, forever** | 1.5–2.5 founder-hours per gym, founder-bound (§3) |
| **The product's headline feature has never worked at a real gym** | **already binding, at gym #2** | forge: 33 roster, 1 invite ever sent, **0 activated**, 26 days live (§4) |

Compare with Workflow 1's technical ceilings — `resolverMiembroGym` at 10–32 gyms, PostgREST pool at 1,000–1,500, `shared_buffers` at 340–520. The `resolverMiembroGym` fix is **three `.eq("user_id", uid)` calls, zero DDL** (`arch-authz.md` §7.1). The organizational ceilings above have no three-line fix. They are staffing and product-surface problems, and they bind in the same range as the database ones while costing 100× more to clear.

**The single most consequential finding is not on anyone's list:** there is **no operator role in this product**. Not "no UI for it" — there is no code path, and not even a seed migration, that has ever written `role = 'operator'` anywhere. A 250-member gym running two shifts has exactly one credential, and it belongs to the owner. That is verified from live prod's own `pg_proc`, not inferred (§2).

---

## 1. The mandate's core claim — verified three independent ways

**Claim under test:** *no code path creates an owner/operator membership; every `gym_membership` insert in a live RPC writes `role='member'`; the only owner insert is a seed in a migration.*

### 1.1 Repo grep — the migration corpus

```
$ grep -rn "gym_membership" supabase/migrations/*.sql | grep -i insert
20260702161010_create_gym_membership.sql:90       ← the ONLY 'owner' insert
20260705070642_reclamar_o_crear_cliente_rpc.sql:67,111
20260705082018_contract_b_drop_user_id_columns.sql:279,323
20260707030000_reclamar_create_zero_saldo.sql:42,80
20260708200002_reclamar_por_codigo_rpc.sql:82
20260710030000_reclamar_o_crear_cliente_email.sql:59,100
20260713190000_reclamar_tenant_binding.sql:81,122
20260722120000_reclamar_por_codigo_firma.sql:97
```

The one owner insert, `20260702161010_create_gym_membership.sql:90-95`, in full:

```sql
insert into public.gym_membership (user_id, gym_id, role)
select u.id, g.id, 'owner'
from auth.users u
join public.gym g on g.slug = 'forge'
where u.email = 'forge-1.0@outlook.com'
on conflict (user_id, gym_id) do nothing;
```

A hardcoded email, a hardcoded slug. Every other insert writes `'member'` — e.g. `20260722120000_reclamar_por_codigo_firma.sql:97-98`:

```sql
insert into public.gym_membership (user_id, gym_id, role)
  values (v_uid, v_gym, 'member') on conflict (user_id, gym_id) do nothing;
```

### 1.2 Whole-repo grep — and the finding the mandate did *not* ask for

```
$ grep -rn "'operator'" --include=*.sql --include=*.ts --include=*.tsx supabase apps packages \
    | grep -vi "check (role\|role in (\|\.test\.\|tests/\|// \|-- "
(0 results)
```

**Zero.** The literal `'operator'` appears in exactly three kinds of place: the CHECK constraint (`20260702161010:19`), the RLS read predicates (`role in ('owner','operator')`, 6 sites in `20260714080000_rls_uncorrelated_predicates.sql`), and denial-suite fixtures. **Nothing in this product has ever written an operator row, and there is no seed for one either.** The mandate expected "the only owner insert is a seed"; the stronger true statement is that the *operator* role has no writer at all, seed or otherwise.

### 1.3 Live production `pg_proc` — the authoritative check

Repo greps can miss a function applied by hand. So I asked the live database which of its own functions can write a membership:

```sql
select p.proname,
       pg_get_functiondef(p.oid) ilike '%insert into public.gym_membership%' as writes_membership,
       (pg_get_functiondef(p.oid) ilike '%''owner''%'
        or pg_get_functiondef(p.oid) ilike '%''operator''%') as mentions_staff_role
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind='f'
  and pg_get_functiondef(p.oid) ilike '%insert into public.gym_membership%';
```
```
reclamar_o_crear_cliente | writes_membership=t | mentions_staff_role=f
reclamar_por_codigo      | writes_membership=t | mentions_staff_role=f
```

**Exactly two of the live database's 38 `public` functions insert a membership. Neither function body contains the string `'owner'` or `'operator'`.** A companion query pattern-matching every `public` function against `insert into public.(gym|gym_domain|gym_membership)` plus the names `gym|owner|operator|staff|invit|domain|onboard|tenant|crear|alta` returned 10 functions, **none of which creates a gym, a domain, or a staff account** (`crear_plantilla` makes a message template; `preparar_invitacion` stamps a `claim_code`; the rest are predicates).

### 1.4 Live row census — the consequence

```sql
select role, count(*) n, count(distinct gym_id) gyms from public.gym_membership group by role;
--  member | 5 | 2
--  owner  | 4 | 4
```

| slug | created | owners | **operators** | members activated | roster | gym_domain rows |
|---|---|---|---|---|---|---|
| forge | 2026-07-02 | 1 | **0** | 0 | 33 | 3 |
| red | 2026-07-02 | 1 | **0** | 0 | 19 | 3 |
| forge-demo | 2026-07-02 | 1 | **0** | 1 | 22 | 4 |
| red-demo | 2026-07-06 | 1 | **0** | 4 | 42 | 4 |

**VERDICT: CONFIRMED, and understated.** Not only does no code path create an owner/operator — the *operator* role is unreachable by any means short of hand-written SQL, has never been reached, and the product ships a 7-screen admin app with no user-management screen at all (`apps/admin/src/app` route tree: `agenda`, `asistencia`, `clientes`, `clientes/[id]`, `cuenta`, `inicio`, `vender`, `login`).

---

## 2. Ceiling #1 — a gym is one shared password

### 2.1 What is actually missing

| Capability | Status | Evidence |
|---|---|---|
| Create an operator account | **impossible** | §1.2 — zero `'operator'` writers anywhere |
| List / revoke staff | **no screen** | admin route tree has no staff route |
| Admin password reset | **absent** | `apps/admin/.../login/_components/login-form.tsx` — `signInWithPassword` only (`:57`); `grep -n "olvid\|reset\|Recuper"` over the file returns nothing |
| Admin self-signup | **absent** | same file — no `signUp` anywhere in `apps/admin/src` |
| Per-user audit attribution | **meaningless** | `staff_gym()` derives the acting gym from `order by gym_id limit 1`; every sale is attributed to the one owner account |

### 2.2 Why this is an *organizational* ceiling, not a feature gap

A 150–300-member LatAm gym runs 05:00–22:00, seven days. That is two to three shifts. The product supports one credential. The three possible responses:

1. **Owner works every shift.** Not a business.
2. **Owner shares the password.** This is what actually happens, and it means: an ex-employee retains full access to the roster, the money ledger, and the bank details (`cobro` is owner-gated by RLS — which is now decorative, because everyone *is* the owner); the only remediation is the owner changing the password, which locks out the entire staff simultaneously; and there is no reset link, so that remediation is a founder ticket.
3. **Owner does not use the product for desk work.** The gym keeps its notebook. This is the outcome the pilot data is consistent with — 33 members, 1 invite ever, 0 activations (§4).

This also **gates every other ceiling in this document**: the email-collection and invite labour (§4) and the day-to-day desk work cannot be delegated, because there is nobody to delegate to.

**Breaks at: gym #1.** It is binding today, at four gyms, and it is invisible because all four gyms are the founder's own or a single-owner pilot.

**Cheapest fix:** one `invitar_operador(p_email, p_gym)` RPC (mirror `preparar_invitacion`'s shape — it already mints a code, stamps a send, and is `SECURITY DEFINER` with a `has_role(gym_id,'owner')` gate), a staff list panel in the existing `/cuenta` mega-screen, and a `resetPasswordForEmail` link on the admin login form (`packages/data/src/server/sesion.ts:45` already implements `solicitarReset` for the client app — the admin app just never links it). **Estimate: 2–3 engineer-days.** There is no cheaper high-value change in this entire audit.

---

## 3. Ceiling #2 — tenant onboarding is a founder-executed code deploy

### 3.1 What it actually takes to add gym #5, end to end

Every row below is grounded in a file, a live query, or a fetched vendor doc.

| # | Step | Surface **today** | Evidence | Founder min |
|---|---|---|---|---|
| A | Owner `auth.users` row | Supabase dashboard / `admin.createUser` — **no product path** | admin app has `signInWithPassword` only (§2.1) | 5 |
| B | `insert into public.gym` | **raw SQL vs production** | only writer in 87 migrations = `20260702150000_create_gym_tenant_spine.sql:56`, a seed. No RPC (§1.3) | 5 |
| C | owner `gym_membership` row | **raw SQL vs production** | only owner writer = `20260702161010:90-95`, hardcoded to one email (§1.1) | 3 |
| D | `gym_domain` rows ×2–4 | **raw SQL vs production** | 4 seed migrations; live gyms carry 3–4 rows each (§1.4) | 5 |
| E | Attach 2 hostnames to 2 Vercel projects + DNS verify | Vercel dashboard | limits below | 10 |
| F | **Brand module** | **TypeScript + a test edit + a deploy** | see §3.2 — this is the big one | **240–960** |
| G | Roster import, 150–300 members | **nothing exists** | see §3.3 | 60–120 |
| H | Catalog + schedule + marketing (~130–180 rows) | **`/cuenta` — genuinely self-serve** ✔ | `cuenta/page.tsx` composes 14 editors (about_value, facility, stat, faq, class_type, coach, paquetes, plantillas, cobro, perfil, mensajes, respaldo…) | 0 *(4–8 h of the owner's own time)* |
| I | Send invites, one click per member | `/clientes/[id]` REENVIAR | no batch path (§4) | 0 *(2–5 h of the owner's own time)* |

Step H deserves explicit credit: **content authoring is the one part of onboarding that is a real product surface**, and it is a good one. It is also why the technical ceilings get all the attention — the visible part of onboarding works.

### 3.2 Step F is the killer, and it is not what the docs say

`packages/brand/src/brand-id.ts:9` — the brand key is a **compiled TypeScript union**:

```ts
export type BrandId = "forge" | "red" | "base";
```

`packages/brand/src/brand.test.ts:13` is a **census tripwire**: *"ships exactly the three brands: base, forge, red"*, asserting `Object.keys(brands).sort()` equals `["base","forge","red"]`. So adding gym #5's brand means editing the union, `registry.ts`, a tokens file, **and the test that exists to stop you** — then a Vercel deploy of both apps.

The documented escape hatch is `gym.token_overrides` — a 33-key CSS map validated by a hardened Zod schema (`packages/brand/src/token-overrides.ts`), designed precisely so a gym can be branded with **data instead of code**. It is excellent work. **It is not wired.**

`apps/admin/src/lib/token-overrides.ts` in full (the client app's copy is identical):

```ts
const BASE_DEMO_OVERRIDES = {
  light: { yellow: "#7c3aed", gold: "#5b21b6" },
  dark:  { yellow: "#a78bfa", gold: "#a78bfa" },
};
export function fetchTokenOverrides(brandId: BrandId): unknown {
  return brandId === "base" ? BASE_DEMO_OVERRIDES : undefined;
}
```

It returns a hardcoded purple demo constant and **never reads the database**. Its own doc comment concedes it: *"FIXTURE (Phase 4)… Post-Phase-3 this becomes a ONE-LINE swap to read the resolved gym row's `token_overrides` jsonb."* Live confirmation that the swap never happened:

```sql
select slug, token_overrides, brand_module_id from public.gym;
-- forge      | {} | forge
-- forge-demo | {} | forge
-- red        | {} | red
-- red-demo   | {} | red
```

**All four gyms have an empty override map and a compiled `brand_module_id`. Both real gyms got a bespoke code module.** The data-driven path has zero production users. So the honest onboarding cost is not "3 INSERTs" (`arch-tenancy.md` §2.7) — **it is 3 INSERTs plus a code deploy, and that is the only pattern this team has ever executed.**

Two sub-findings while I was in there: **`room` has zero DAL references** (`grep '"room"' packages/data/src/server/*.ts` → nothing; only `room_id` passes through agenda RPC args), and live `room` count is **0 for all four gyms** — a schema table with no product surface. And there is **no import path of any kind**: `grep -niE "csv|bulk|masiv|xlsx|papaparse"` over `apps/admin/src` + `packages/data/src` finds only `respaldo`, which is **export**-only.

### 3.3 Step G: you cannot add a member without recording a sale

There is no `crearCliente`. `packages/data/src/server/clientes.ts` exposes `actualizarCliente` (edit) but no create. The admin-side create path is `registrar_venta` — the money RPC — via `/vender`'s NUEVO arm. So importing a 225-member roster from a competitor means either 225 fabricated sales through a form, or founder SQL. Repo memory records which was actually used: RED's 19 members were **seeded by the founder in SQL on 2026-07-24** (folios 1001–1019).

### 3.4 Vercel is *not* the constraint — fetched, and it clears the prior worry

`https://vercel.com/docs/limits`, fetched **2026-07-28** (page `last_updated: 2026-07-01`):

| Limit | Hobby | Pro | Enterprise |
|---|---|---|---|
| Domains per Project | 50 | **Unlimited** (soft cap 100,000/project) | Unlimited (soft cap 1,000,000) |
| **Domains creation per hour** | — | **120 per 3600 s, scope `owner`** | — |
| Project domain create/update/remove per minute | — | 100 per 60 s, scope `owner` | — |

3,000 gyms × 2 hosts = 6,000 domain entries, far inside the 100,000/project soft cap. At 120 domain-creates/hour that is **60 gyms/hour**, or 1,440/day — an order of magnitude above any human rate in this section. **This also settles the "100/hr vs 100/min" contradiction flagged in the repo's Vercel-domain memo: both are real, they are different limits, and the binding one is 120/hour team-scoped.** Vercel is clean. Say so.

### 3.5 The arithmetic

**Founder-hours per gym:**

| Path | Steps | Founder time |
|---|---|---|
| `base` brand, scripted roster (never yet executed) | A–E + G | 88–148 min = **1.5–2.5 h** |
| Bespoke brand module (the only pattern ever executed — 2 of 2 real gyms) | A–G | 5.5–18.5 h |

**Maximum sales rate the current process can absorb**, assuming a founder who does *nothing else* for 8 hours:

| Path | gyms/day (founder 100% on onboarding) | gyms/day (realistic — founder also builds, sells, supports) |
|---|---|---|
| base brand | 3.2–5.3 | **1–2** |
| bespoke brand | 0.4–1.5 | **0.3–0.5** |

**To 3,000 gyms:**

| Path | Founder-hours | Person-years of pure onboarding | Calendar at 250 working days/yr |
|---|---|---|---|
| base brand @ 2 h | 6,000 h | **2.9** | 2.3 yr at 5/day · **5.8 yr at 2/day** |
| bespoke @ 12 h | 36,000 h | **17.3** | 12+ yr |

**Read this the right way round.** To reach 3,000 gyms in three years you must provision **4 gyms every business day for three years without a break**. The process as built absorbs 1–2/day at its very best, and has demonstrated 4 gyms in 26 days.

**Breaks at:** not a gym count — a *rate*. **The process caps net new gyms at roughly 250–500/year** with a full-time human on it. It binds the first month sales exceeds ~40 gyms, which for a product priced at 300–1,500 MXN is month one of any real sales effort.

**Cheapest fix:** an `alta_gimnasio(slug, brand_name, timezone, owner_email, hostnames[])` `SECURITY DEFINER` RPC doing steps B–D in one transaction, **plus the one-line `token_overrides` DB read** that `apps/*/src/lib/token-overrides.ts` already documents as pending. Together those move a gym from "code deploy" to "form submission" and collapse A–F from 4.5–16 h to ~15 min. **Estimate: 4–6 engineer-days.** Vercel domain attachment stays manual and is fine at 120/hr.

---

## 4. Ceiling #3 — the product's headline feature has never worked at a real gym

### 4.1 The pilot data, live

```sql
select g.slug,
 count(*) filter (where c.invitacion_enviada_at is not null) invites_sent,
 min(c.invitacion_enviada_at) first_invite, max(c.invitacion_enviada_at) last_invite,
 count(*) filter (where c.auth_user_id is not null) activated,
 count(*) roster,
 count(*) filter (where c.email is null or c.email='') no_email
from public.clientes c join public.gym g on g.id=c.gym_id group by g.slug;
```

| slug | roster | **no email at all** | invites sent | first / last invite | **activated** |
|---|---|---|---|---|---|
| **forge** (real pilot, live 26 d) | 33 | **32** | **1** | 2026-07-14 / 2026-07-14 | **0** |
| **red** (real prod, live 4 d) | 19 | 0 | **0** | — | **0** |
| forge-demo (sandbox) | 22 | 19 | 2 | 07-11 / 07-22 | 1 |
| red-demo (sandbox) | 42 | 10 | 27 | 2025-07-03 / 07-24 | 4 |

**Platform: 5/116 activated = 4.3%. Across the two REAL gyms: 0 of 52.**

### 4.2 The cause is upstream of the funnel, and nobody has named it

Workflow 1 read this as an activation-funnel problem — no batch invite, manual per-ficha clicks. That is true and it is not the binding constraint. **At the flagship pilot, 32 of 33 members have no email address on file.** You cannot invite someone you cannot email. The invite funnel was never the bottleneck at forge; **data collection was**, and it produced exactly one invitable member in 26 days.

This is the shape of the real market. A LatAm gym's existing roster lives in a notebook or a WhatsApp group. Names and phones, not emails. RED's join key between the two doors is `email` and only `email` (repo memory, `member-registration-phase1-gap-audit`), so every legacy member needs an email captured, in person, one at a time, typed into a ficha.

### 4.3 The labour, priced

Per member: ask for the email, type it, save the ficha, click REENVIAR ≈ 90 s (the auto-invite arm at `packages/data/src/server/clientes.ts:455-461` fires on setting an email for an unclaimed row, so one save can cover both). Member-side completion is a separate 2-step form with a documented abandonment gap between `auth.users` creation and roster claim (`workload-auth.md` §1.3).

| Scope | Front-desk hours |
|---|---|
| One 225-member gym | **5.6 h** |
| 3,000 gyms | **16,875 h** |

That labour is unpaid by RED, uncompensated at the gym, undelegatable (§2 — there is no operator to delegate to), and delivers a member app the member has no recurring reason to open: attendance is 100% staff-marked (`packages/data/src/server/asistencia.ts:9-10` requires `requireOperator`), there is no in-app payment, and live `asistencias` (705) exceed `reservation` (463) by 52% — most gym visits never touch the app at all.

### 4.4 What this implies for the business

**It reprices the product.** RED sells at 300–1,500 MXN/mo on the premise of two apps. At 0% activation the gym is buying **one** app — an admin desk tool with a single shared login (§2) — competing against a notebook and WhatsApp, which are free and already work.

**And it detonates the one good cost finding.** `workload-auth.md` correctly projects Auth MAU at ~$0 instead of $845–1,430/mo, because measured activation is 4.3%. That is the same fact as "nobody uses the client app." **The cheapest line in the cost model is cheap because the product is not being used.** A business that fixes activation gets the $559/mo MAU bill back — which it should be delighted to pay.

**Breaks at:** already broken, at gym #2. Not a scale trigger.

**Cheapest fix, in order of leverage:** (a) make `email` a required field on the `/vender` NUEVO arm so no new member can enter the roster un-invitable — one Zod change, hours; (b) a bulk-invite action over the roster page's existing selection — but **note the mail-tier interlock**: `alt-email.md` §5.1 establishes that one shared Resend account with one domain and one API key (also the Supabase SMTP password) can be suspended account-wide by a single gym's dirty import. **Per-tenant sending subdomains are free DNS work and must land *before* any bulk path, not after.**

---

## 5. Ceiling #4 — support load, and the two runbooks that eat the founder

### 5.1 The two most common gym-desk errors are hand-written SQL against production

`docs/runbooks/venta-correction.md` — correcting a mis-sold package. Quoted from the file:

> *"An `anular_venta` RPC ships only if mis-sales prove frequent; until then, correction is an owner-run SQL recipe."*

The recipe is a `BEGIN…COMMIT` transaction that impersonates the owner via `set_config('request.jwt.claims', …)`, draws a folio with `next_folio()`, inserts a **negative-`monto` compensating `ventas` row**, updates three `clientes` balance columns to a target state the operator must supply from memory or a backup ("the stored saldo is authoritative and **not** re-derivable from the ledger (ADR-0004)"), and requires reading a verify SELECT before committing.

`docs/runbooks/duplicate-member-merge.md` — merging a duplicate member. Service-role SQL, **four** mandatory pre-checks, and an explicit cascade hazard: *"Deleting the duplicate before repointing **silently destroys** its revenue ledger + attendance history."*

Live: `select count(*) from ventas where monto < 0` → **0**. Across 175 sales the correction path has never once been exercised in production. It is unproven under real conditions and it is the path that runs when a gym's money is wrong.

The ops manual is 13 runbooks in `docs/runbooks/` and 24 handoff documents in `docs/superpowers/handoffs/`. All prose. All written by one person.

### 5.2 The model

RED's ticket-raising "user" is the **owner** — the only account holder (§2). So the unit is tickets per *gym* per month, and the drivers are structural:

| Driver | Self-serve today? |
|---|---|
| Mis-sold package / wrong price | **No** — founder SQL (`venta-correction.md`) |
| Duplicate member row | **No** — founder SQL (`duplicate-member-merge.md`) |
| Forgotten admin password | **No** — no reset link (§2.1) |
| Needs a second staff login | **No** — impossible (§1.2) |
| Needs a `room` | **No** — no DAL surface (§3.2) |
| Content / schedule / package edits | **Yes** — `/cuenta` ✔ |
| Attendance & booking questions | Yes |

A gym of 225 members generates ~225 sales/month. At a 0.5–2% desk error rate that is **1.1–4.5 SQL-surgery tickets per gym per month on the money path alone.**

Handle times: a self-serve-answerable ticket ≈ **0.25 h** (read, reply in Spanish, verify). A SQL-surgery ticket ≈ **1.0 h** (both runbooks require a snapshot, a multi-step transaction, and a verify-before-commit; 45–90 min is a fair band, 60 min the midpoint).

| Band | tickets/gym/mo | of which founder-SQL | **founder-h/gym/mo** |
|---|---|---|---|
| Low | 0.5 | 0.2 | 0.275 |
| **Expected** | **2.0** | **1.0** | **1.25** |
| High | 5.0 | 2.5 | 3.125 |

*Sanity-check against an external benchmark: MetricNet's 0.5 tickets/**user**/month for top-performing support orgs, via [fullview.io](https://www.fullview.io/blog/support-stats), searched 2026-07-28 — **secondary source, ASSERTED**. Applied per **tenant** (one owner account), 2.0/gym/mo is deliberately above it, because RED's ticket mix contains classes of issue that most SaaS resolve with a self-serve button.*

### 5.3 Founder-hours and headcount

One FTE = 169 h/month (40 h × 4.33).

| Gyms | Low | **Expected** | High |
|---|---|---|---|
| 100 | 27.5 h/mo · **0.16 FTE** | 125 h/mo · **0.74 FTE** | 313 h/mo · **1.9 FTE** |
| 1,000 | 275 h/mo · **1.6 FTE** | 1,250 h/mo · **7.4 FTE** | 3,125 h/mo · **18.5 FTE** |
| 3,000 | 825 h/mo · **4.9 FTE** | 3,750 h/mo · **22.2 FTE** | 9,375 h/mo · **55.5 FTE** |

**The founder saturates at 169 ÷ 1.25 = ~135 gyms** in the Expected band (54 gyms High, 615 Low). Working support full-time and shipping nothing.

### 5.4 The revenue check

Cost-per-ticket, fetched from [lorikeetcx.ai](https://www.lorikeetcx.ai/articles/customer-service-cost-per-ticket) **2026-07-28** (page dated 2026-07-28): **"SaaS support $18–$35"** per human-handled ticket; **"B2B support $30–$60"**; industry average **2.3 contacts per issue**.

At 3,000 gyms × 2.0 tickets/mo = **6,000 tickets/month**:

| | monthly support cost | revenue @ 300 MXN | revenue @ 1,500 MXN |
|---|---|---|---|
| @ $18/ticket (SaaS floor) | $108,000 | $48,649 | $243,243 |
| @ $35/ticket (SaaS ceiling) | $210,000 | $48,649 | $243,243 |

*(FX 18.5 MXN/USD — **ASSERTED, not fetched.** Every ratio below moves with it.)*

**At the 300 MXN price floor, the support bill alone is 2.2–4.3× total revenue.** At the 1,500 MXN ceiling it is 44–86% of revenue. And $18–35/ticket is a **floor** for RED, because half its tickets are production DB surgery by an engineer, not a rep reading a knowledge base.

**Breaks at:** ~135 gyms (founder saturation); the unit economics break at 3,000 regardless of who is doing it.

**Cheapest fix — the highest-ROI item in this document.** Convert the two runbooks into RPCs: `anular_venta` (the compensating-row transaction, already fully specified in prose) and `fusionar_clientes` (the merge, also fully specified), plus the admin password-reset link from §2. That moves the SQL-surgery share to self-serve: 2.0 tickets × 0.25 h = **0.5 h/gym/mo**, so founder saturation moves **135 → 338 gyms** and 3,000 gyms needs **8.9 FTE instead of 22.2**. **Estimate: 5–8 engineer-days.** The specifications are already written; only the code is missing.

---

## 6. Ceiling #5 — migration cadence, on-call, and the bus factor

### 6.1 Cadence, measured

```
$ ls supabase/migrations/*.sql | wc -l                                      → 87
$ git log --since="60 days ago" --date=short --pretty=%ad -- supabase/migrations | sort -u | wc -l  → 16
$ git log --since="60 days ago" --oneline -- supabase/migrations | wc -l    → 86
$ grep -l "drop function" supabase/migrations/*.sql | wc -l                 → 11
```

**87 migrations in 60 days of repo life** (first commit 2026-05-29). A schema change lands roughly **every 3.75 days**.

**`registrar_venta` — the money path — was `DROP FUNCTION`'d and recreated with a different argument list three times in five days:**

| migration | dropped signature | arity |
|---|---|---|
| `20260710121000_registrar_venta_rederive.sql:27` | `text, text, text, text, integer, text, uuid, integer, date, integer, integer, text` | **12** |
| `20260711100100_registrar_venta_personalizado.sql:29` | `text, uuid, uuid, uuid, text, text, text, boolean` | **8** |
| `20260714110000_registrar_venta_backdate.sql:50` | `text, uuid, uuid, uuid, text, text, text, boolean, text, integer, integer, boolean, integer` | **13** |

Each is a breaking wire change. Between the DROP and the matching app deploy, PostgREST answers **every sale attempt platform-wide** with PGRST202 "function not found". That the ordering is a *human* step is documented in the repo itself — commit `424e6d5`, *"clarify registrar_venta migration must be applied before app deploy"*.

### 6.2 When they landed on production, in gym local time

`supabase_migrations.schema_migrations.version` **is** the apply timestamp. Mexico City is UTC−6 year-round (no DST since 2022):

| applied (Mexico City) | migration |
|---|---|
| **Fri 2026-07-10 13:46** | `registrar_venta_rederive` — money path, DROP+CREATE |
| Fri 2026-07-10 13:48 | `toggle_pase_unify_surfaces` — attendance |
| Fri 2026-07-10 18:38 | `pasar_lista_front_desk_no_reconsume` — attendance, **evening class rush** |
| **Mon 2026-07-13 15:27** | `registrar_venta_personalizado` — money path, DROP+CREATE |
| Mon 2026-07-13 20:50 | `reclamar_tenant_binding` |
| Wed 2026-07-15 00:41 | `rls_uncorrelated_predicates` |
| Wed 2026-07-15 01:26 | `registrar_venta_backdate` — money path, DROP+CREATE |
| **Fri 2026-07-24 07:18** | `reclamar_por_codigo_firma` — activation path, **gyms opening** |

Across all 87: **62 of 87 (71%) were applied between 07:00 and 21:00 Mexico City time** — while gyms were open and selling.

### 6.3 The blast cost at 3,000 gyms

3,000 gyms × 225 sales/month = 675,000 sales/month ÷ 30 days ÷ 14 open hours = **26.8 sales/minute**.

| skew window | failed sales |
|---|---|
| 5 min | **134** |
| 30 min | **804** |
| 2 h | **3,216** |

Each is a member standing at a desk with cash in hand and an operator who cannot take it. There is **no canary** — one migration target means all 3,000 tenants at once (`arch-tenancy.md` §2.6 correctly calls the single target A's biggest strength; this is its cost).

### 6.4 The gate that does not run

`.github/workflows/ci.yml`, read in full:

```yaml
- run: pnpm lint
- run: pnpm typecheck
- run: pnpm test
- run: pnpm build
```

**`pnpm test:denial` is not there.** `grep -rn "test:denial"` across `*.yml`, `.husky/pre-commit`, and `package.json` finds it only in `package.json`'s script list and in `docs/scope-model.yaml`, where a *planned, unshipped* ticket is titled **"CI that runs the suites — machine-enforce test:denial."** The pre-commit hook is `pnpm lint && pnpm typecheck && pnpm test` — same set, no denial suite.

AGENTS.md is honest about this and explains why (the suite needs a PAT and a scratch project pre-commit cannot supply). The consequence stands regardless: **the row-level contracts of all 25 write-bearing RPCs — including the three `registrar_venta` rolls above — are verified only by a human remembering a convention.** The two machine guards that *do* run (`denial-suite-drift.test.ts`, `rpc-write-coverage.test.ts`) check **wiring**, not **running**. At a 3.75-day schema cadence, executed by one person, the convention will be skipped. That is not a character judgement; it is what conventions do.

### 6.5 Production is not rebuildable from the repository

```
prod versions (supabase_migrations.schema_migrations): 87
file versions (ls supabase/migrations):                87
MATCHING (same version in both):                       22
FILE-ONLY (file version never recorded in prod):       65
PROD-ONLY (restamped, no matching file):               65
```

**65 of 87 migration files (74.7%) are recorded in production under a version stamp that does not match their filename** — because `apply_migration` restamps at apply time. Example: `rls_uncorrelated_predicates` is file `20260714080000` and prod version `20260715064159`; `reclamar_por_codigo_firma` is file `20260722120000` and prod version `20260724131805`.

Consequences, each concrete:
- `supabase db push` would re-apply 65 migrations — **including every seed**, which would duplicate gyms, domains, catalog rows and the hardcoded owner membership. The repo memory `prod-migration-version-drift` already knows this and forbids linking; **it is now measured: 65, not "some".**
- **There is no tested rebuild path for production.** Combined with the contested Free-vs-Pro plan question (which decides whether backups exist at all — `price-compute.md` vs `model-tiers.md`), a payment-handling system may have neither backups nor a replayable schema.
- The 22-file match set is not a safe subset either; it is just the migrations whose filename happened to be authored close to their apply time.

### 6.6 Who is awake at 05:00

Commit-hour histogram, all 502 commits on `main` in the last 60 days:

```
hour: 00→36  01→32  02→10  03→1   04→1   05→2   07→3   08→8   09→14  10→19  11→28
      12→25  13→16  14→16  15→39  16→20  17→27  18→29  19→50  20→37  21→19  22→17  23→53
```

Peaks at **23:00 (53), 19:00 (50), 00:00 (36)**. **152 of 502 commits (30%) land between 22:00 and 06:00.** Mexican gyms open 05:00–06:00. **The one person who could respond at 05:00 went to bed at 01:00.**

Coverage arithmetic at 3,000 gyms: a LatAm footprint spans at least UTC−3 (Argentina, Brazil) to UTC−7 (Baja, Sonora) — a **4-hour spread**. The platform's business day therefore runs ~04:00 to ~24:00 Mexico City, **20 hours/day, 7 days/week** (gyms open weekends). One person per shift = 140 person-hours/week = **3.5 FTE minimum**; with any redundancy for holidays, illness and not being on-call alone, **5–6 FTE** — *separate from* §5's 22 FTE support headcount.

### 6.7 The bus factor is 1

```
$ git shortlog -sne --all
   349  Vack99 <d3bigwlf@gmail.com>
   156  vack99 <d3bigwlf@gmail.com>
    30  T3 Code <t3code@users.noreply.github.com>
```

**505 of 535 commits (94.4%) from one email address** under two capitalizations. The remaining 30 are a template/bot identity. 502 commits in 60 days = **8.4 commits/day sustained, seven days a week**.

That same identity, `d3bigwlf@gmail.com`, is also one of the 9 rows in `auth.users` and holds `clientes` rows in more than one gym (`workload-auth.md` §2) — **the sole engineer, the sole operator, and a production test subject are the same person.**

If that person is unavailable for two weeks, nobody can: apply a migration; correct a mis-sale; merge a duplicate member; provision a gym; reset an owner's password; or rebuild the database. Every one of those needs production SQL access plus knowledge that exists only in runbooks the same person wrote.

**Breaks at:** gym #5 for provisioning; the first vacation, illness or laptop failure for everything else. **Not a scale trigger — a calendar one.**

**Cheapest fix:** (a) put `test:denial` in CI against the already-provisioned scratch project `gyyujeguycxxoaqgdnjp` (repo memory: kept as a test bed, 77 migrations applied, 36/36 green) — **1–2 engineer-days, and the ticket is already written in `docs/scope-model.yaml`**; (b) a maintenance-window convention and a `503`-with-Spanish-copy path for the sub-minute DROP+CREATE gap — hours; (c) a documented, *rehearsed* restore into a scratch project, which also settles the Free-vs-Pro backup question — 1 day; (d) a second human with production access, which is a hiring decision, not an engineering one.

---

## 7. RANKED — the 5 worst organizational ceilings, worst first

### 1. There is no operator role. A gym is one shared password.

**Binds at: gym #1 — binding today.**
Zero `'operator'` writes exist anywhere in the repo (§1.2); live prod's `pg_proc` confirms only two functions write memberships and neither mentions a staff role (§1.3); 0 operator rows across 4 gyms (§1.4). No staff screen in the 7-route admin app, and no password-reset link on the admin login form. A 250-member two-shift gym must share the owner's credential — which also carries the bank details and the money ledger — and the only revocation is a password change that locks out everyone, requested from a founder because there is no reset link.
This gates §4 too: the invite labour cannot be delegated because there is nobody to delegate to.
**Cheapest fix: `invitar_operador` RPC + staff panel in `/cuenta` + link the existing `solicitarReset` — 2–3 engineer-days.**
**Confidence: measured.**

### 2. Support load saturates the founder at ~135 gyms, and its unit economics never work.

**Binds at: ~135 gyms (54 High band, 615 Low).**
Correcting a mis-sale and merging a duplicate member — the two most common gym-desk errors — are founder-executed SQL transactions against production (`docs/runbooks/venta-correction.md`, `duplicate-member-merge.md`), each with pre-flight snapshots, verify-before-commit, and a documented cascade hazard. Neither has ever been run in prod (0 negative-`monto` rows in 175 sales). At 2.0 tickets/gym/mo with half needing SQL surgery, that is 1.25 founder-h/gym/mo; one FTE is 169 h/mo. At 3,000 gyms: **22 FTE**, or **$108k–210k/month** at [Lorikeet's](https://www.lorikeetcx.ai/articles/customer-service-cost-per-ticket) $18–35/ticket SaaS band (fetched 2026-07-28) — **2.2–4.3× total revenue at the 300 MXN price floor.**
**Cheapest fix: `anular_venta` + `fusionar_clientes` RPCs (both fully specified in the runbooks already) + the reset link — 5–8 engineer-days. Moves saturation 135 → 338 gyms and 3,000-gym headcount 22 → 9 FTE.**
**Confidence: measured** (runbooks, live counts) **· modelled** (ticket rate, handle time) **· asserted** (external cost-per-ticket, FX).

### 3. Member activation has never worked at a real gym, and the cause is upstream of the funnel.

**Binds at: gym #2 — already broken.**
forge: 33 roster, **32 with no email at all**, **1 invite ever sent**, **0 activated**, 26 days live. red: 19 roster, 0 invites sent, 4 days live. Platform 5/116 = 4.3%; **0 of 52 across both real gyms**. Prior work blamed the missing batch-invite path; the measured cause is that you cannot invite a member whose email you never captured, and email is the sole join key between the two doors. Collecting them is 5.6 h of undelegatable front-desk labour per gym (16,875 h across 3,000), for an app the member has no recurring reason to open (attendance is 100% staff-marked; no in-app payment; live `asistencias` 705 > `reservation` 463 by 52%).
This reprices the product to a single-login desk tool competing with a notebook — and it is *why* `workload-auth.md`'s MAU bill is $0.
**Cheapest fix: require `email` on `/vender` NUEVO (hours) so no new member enters un-invitable; then a bulk-invite action — but per-tenant sending subdomains must land first (`alt-email.md` §5.1: one shared Resend account, one domain, one key that is also the Supabase SMTP password).**
**Confidence: measured.**

### 4. Tenant onboarding is a founder-executed code deploy, capping growth at ~250–500 gyms/year.

**Binds at: a rate, not a count — the first month sales exceed ~40 gyms.**
No code path creates a `gym`, a `gym_domain`, or an owner membership (§1). `token_overrides` — the designed data-driven brand path — is a **hardcoded purple fixture that never reads the database** (`apps/admin/src/lib/token-overrides.ts`), all 4 gyms have `{}`, and both real gyms got a bespoke compiled brand module guarded by a census test that asserts exactly three brands exist. No roster import of any kind (the only `.xlsx` code is export-only); the sole admin-side member-create path is the sale RPC. Result: **1.5–2.5 founder-hours/gym at best, 5.5–18.5 h on the only pattern ever executed**; 3,000 gyms = 2.9–17.3 person-years of pure provisioning.
Fairly: `/cuenta` covers content authoring well (14 editors), and **Vercel is not the constraint** — 120 domain-creates/hour, 100,000/project soft cap, fetched 2026-07-28.
**Cheapest fix: an `alta_gimnasio(…)` RPC for steps B–D + the one-line `token_overrides` DB read the code already documents as pending — 4–6 engineer-days. Collapses 4.5–16 h/gym to ~15 min.**
**Confidence: measured.**

### 5. Bus factor 1, a 3.75-day schema cadence applied during gym hours, no denial gate in CI, and an unrebuildable production database.

**Binds at: the first vacation, illness, or laptop failure — a calendar trigger, not a scale one.**
505 of 535 commits (94.4%) from one email; 8.4 commits/day sustained for 60 days; 30% of commits between 22:00 and 06:00 while gyms open at 05:00. `registrar_venta` — the money path — was DROP+CREATE'd with a different arity three times in five days (12 → 8 → 13 args), applied to prod on **Fri 13:46**, **Mon 15:27** and Wed 01:26; **62 of 87 migrations (71%) landed between 07:00 and 21:00 gym-local**. At 3,000 gyms a 5-minute schema/app skew drops **134 sales**; 30 minutes drops **804**. CI runs lint/typecheck/test/build and **not `test:denial`** — the ticket to add it is written in `docs/scope-model.yaml` and unshipped. And **65 of 87 migration files are stamped in prod under a version that does not match their filename**, so production cannot be replayed from the repository and `db push` would re-apply 65 migrations including every seed. 20-hour LatAm business day × 7 = **3.5 FTE minimum on-call, 5–6 realistic**, on top of §2's 22.
**Cheapest fix: `test:denial` in CI against the already-provisioned scratch project (1–2 days, ticket pre-written); a maintenance-window + Spanish `503` for the DROP window (hours); one rehearsed restore (1 day, also settles the Free-vs-Pro backup question); then hire.**
**Confidence: measured.**

---

## 8. Falsification — what would have to be true for me to be wrong

| Claim | What would make it wrong | Did I check? |
|---|---|---|
| No code path creates an owner/operator | An RPC applied by hand to prod, absent from the repo | **Checked, live.** `pg_proc` scan of all 38 `public` functions: exactly 2 insert a membership, neither body contains `'owner'` or `'operator'`. A second scan for `insert into public.(gym\|gym_domain)` returned nothing. |
| The operator role has *never* been used | Operator rows exist in prod | **Checked, live.** `group by role` → `{member:5, owner:4}`. Zero. |
| Branding a gym requires a code deploy | `token_overrides` is wired and just unused | **Checked.** `fetchTokenOverrides` returns a hardcoded constant, never a DB read; its own comment calls it a fixture; all 4 gyms hold `{}`; both real gyms carry a compiled `brand_module_id`. |
| forge's 0/33 is a funnel problem | Emails exist and members simply didn't complete | **Wrong as usually stated — checked.** 32 of 33 have **no email at all**, and exactly **1** invite was ever sent. It is a data-collection failure, not a drop-off. |
| Vercel constrains onboarding | A low domain cap or a tight add rate | **Checked, fetched 2026-07-28.** Unlimited domains/project on Pro (100k soft cap), 120 creates/hour. Vercel is clean; the earlier "BYO-domain queue" worry and the 100/hr-vs-100/min contradiction are both resolved. |
| `/cuenta` cannot self-serve content | It can, and I'd be inflating the onboarding cost | **Checked — it can, and I said so.** `cuenta/page.tsx` composes 14 editors. That is step H, priced at **0 founder-minutes**. |
| Production is unrebuildable | Version stamps match and `db push` is safe | **Checked, measured.** 22 of 87 match, 65 do not. |
| test:denial is not gated | It runs in CI or the hook | **Checked.** `ci.yml` read in full; `.husky/pre-commit` read; `grep` across yml/json. Absent from both. |
| Support at ~135 gyms | My ticket rate or handle time is 2–4× too high | **Not checked — this is my most fragile number.** 2.0 tickets/gym/mo and 1.0 h/SQL-ticket are modelled, calibrated only against the runbook complexity and one secondary benchmark. Zero real ticket data exists (4 gyms, one owner). Treat the 135 as ±3×; the *shape* (SQL surgery dominates the hours) is structural and does not move. |
| Onboarding is founder-bound | The owner could do steps A–F themselves | **Checked — they cannot.** A–D need production SQL, E needs Vercel access, F needs a repo commit. Only H and I are owner-executable, and I priced them as the owner's time, not the founder's. |

---

## 9. Exit triggers — the observable that reverses each "keep"

| # | Metric | Threshold | Action |
|---|---|---|---|
| **O1** | Count of `gym_membership` rows with `role='operator'` in prod | **still 0 at gym #10** | Ship `invitar_operador`. Every gym past #10 is running on a shared credential and you are one disgruntled ex-employee from a data incident with no revocation story. |
| **O2** | Founder-hours/month on support (time-tracked, not estimated) | **> 60 h/mo** (≈0.35 FTE) | You are at ~50 gyms on the Expected curve. Ship `anular_venta` + `fusionar_clientes` **now** — after this point you are hiring to do work a 5-day RPC would delete. |
| **O3** | Ratio of tickets requiring production SQL to total tickets | **> 20%** | The runbook-as-product model has failed. Freeze feature work until both surgeries are RPCs. |
| **O4** | Median founder-minutes to provision one gym (timed, 3-gym rolling median) | **> 60 min at gym #15** | Build `alta_gimnasio` + wire `token_overrides`. Below 60 min, manual is genuinely cheaper than the RPC. |
| **O5** | Activated ÷ roster at the *most mature real gym* | **< 25% at 90 days live** | The client app is not the product. Either fix email capture at the point of sale, or stop selling the member app and reprice as a desk tool. (Today: **0% at 26 days.**) |
| **O6** | Gyms with ≥1 activated member ÷ total gyms | **< 50% at gym #25** | Same call, platform-wide. (Today: 2 of 4, and both are sandboxes.) |
| **O7** | Migrations applied 07:00–21:00 gym-local, per quarter | **> 0 once gym count > 25** | Adopt a maintenance window. At 26.8 sales/min platform-wide the arithmetic stops being theoretical. |
| **O8** | `test:denial` runs per migration-bearing merge | **< 100%** for one full release cycle | Wire it into CI against the scratch project. The convention has failed as a convention; the ticket is already written. |
| **O9** | Humans with production SQL access | **still 1 at gym #50** | Hire or contract a second. At 50 gyms a two-week absence is a business-ending event, not an inconvenience. |
| **O10** | Rehearsed restores of prod into a scratch project | **0 at any gym count > 5** | Do one. It also settles the contested Free-vs-Pro plan question, which decides whether backups exist at all. |
| **O11** | Sending domains in the Resend account | **still 1 when any bulk-invite path ships** | Per-tenant subdomains are free DNS work. Shipping bulk invites on a single shared domain and a single API key (which is also the Supabase SMTP password) risks an account-wide suspension that kills invites, receipts and password resets for every gym at once (`alt-email.md` §5.1). |

---

## 10. Where I contradict or extend prior work

1. **Workflow 1 (`arch-tenancy.md` §2.7) prices tenant onboarding as "3 INSERTs, seconds."** That is the cost of the *model*, and it is right. It is not the cost of the *product as built*: `token_overrides` is a hardcoded fixture that never reads the DB, so the only demonstrated pattern is **3 INSERTs + a TypeScript union edit + a census-test edit + a Vercel deploy**, 4.5–16 h. `arch-tenancy.md` §8.5 does flag onboarding as the #5 worst property and estimates "3,000 gyms × 30 min ≈ 1,500 founder-hours" — **that is 2–24× low**, because it counts the SQL and not the brand.

2. **Workflow 1 read forge's 0/33 as an activation-funnel problem.** The measured cause is that **32 of 33 members have no email address**, and exactly one invite was ever sent. A batch-invite feature shipped tomorrow would have **one** member to send to. The binding constraint is data capture at the point of sale, not send throughput — which changes the fix from "build bulk invite" to "make email required on `/vender`", a change worth hours rather than days.

3. **The "BYO-domain onboarding queue" concern is doubly moot, and I can now say why.** No BYO domains *and* Vercel's actual limits are permissive: unlimited domains/project on Pro (100,000 soft cap), **120 domain-creates/hour team-scoped** — 60 gyms/hour, ten times any human rate here. This also resolves the 100/hr-vs-100/min contradiction the repo's Vercel memo asked someone to verify: both numbers exist (100/min per project, 120/hr per owner) and the hourly one binds.

4. **The Free-vs-Pro plan question is more urgent than a cost question.** I did not resolve it (out of lane), but §6.5 adds a second leg: **65 of 87 migrations are version-drifted, so production cannot be replayed from the repository.** If the plan is Free, there are no backups *and* no replay — a payment-handling system with neither. That combination should outrank every cost line in the synthesis.

5. **`workload-auth.md`'s "MAU is ~$0" is correct and should be read as an alarm, not a relief.** It is $0 *because* 4.3% of the roster has ever signed in. Fixing §7.3 restores a ~$559/mo platform-wide bill — which is 0.2% of floor revenue and the cheapest good news in the audit.

6. **I extend `arch-authz.md` §7.5's `staff_gym()` finding into the operator lane.** It flags `order by gym_id limit 1` as breaking for a multi-location owner. It is also why per-user attribution is unfixable today: with exactly one credential per gym, *every* sale, attendance mark and content edit is attributed to the owner regardless. The audit trail is already empty, before multi-location is even a consideration.

---

## 11. Blind spots — what I did NOT examine

1. **Zero real support-ticket data exists.** Four gyms, one of which is 4 days old, three of which are the founder's. The 2.0 tickets/gym/mo and 1.0 h/SQL-ticket in §5 are modelled from runbook complexity and one secondary benchmark. **The ~135-gym saturation point carries ±3× uncertainty.** The structural claim underneath it — that half the tickets are irreducible DB surgery — is measured and does not move with the rate.
2. **I did not time a real onboarding.** Every minute figure in §3 is a reasoned estimate against the artefacts, not a stopwatch. Provisioning one gym end-to-end with a timer running would settle §3.5 and nothing else will. My §3 numbers are also *founder-optimal*: they assume no DNS wait, no failed deploy, no back-and-forth with the gym over content.
3. **I did not price LatAm support or engineering salaries.** §5.4 uses a US-centric $18–35/ticket benchmark and an **asserted** 18.5 MXN/USD rate. Local hiring changes the absolute cost materially — though not the FTE counts, which are the harder constraint at 22 people.
4. **I did not examine churn.** Every model here counts gyms added. A 2%/month tenant churn rate at 3,000 gyms means 60 gyms/month must be *re*-provisioned just to stand still — which would make §3's rate ceiling bind harder than modelled. I have no churn data and did not invent any.
5. **I did not test the two runbooks.** `venta-correction.md` and `duplicate-member-merge.md` have never run in production (0 negative-`monto` rows in 175 sales). My 45–90-minute handle-time band is read off their step count and pre-check burden, not off an execution. They may also be *wrong* — an untested recovery procedure usually is — which would make §5 optimistic.
6. **I did not verify the LatAm timezone spread against a market plan.** §6.6's 20-hour business day assumes Argentina-to-Sonora. If the plan is Mexico-only, the on-call window shrinks to ~17 h and the minimum drops from 3.5 to ~3 FTE. Still more than one person.
7. **I did not evaluate whether the founder intends to hire, raise, or stay solo.** Every headcount number is a requirement, not a recommendation. A 22-FTE support requirement at 3,000 gyms might be the correct answer for a funded company and a fatal one for a bootstrapper — that is the owner's call, not mine, and the ranking above does not assume either.
8. **I did not examine the client-side onboarding UX** (the `/activar` two-step form's abandonment rate, Turnstile friction, magic-link deliverability on LatAm inboxes). `workload-auth.md` §1.3 documents a real abandonment gap between `auth.users` creation and roster claim; I did not measure how much of §7.3's problem lives there versus in email capture. At 32/33 missing emails it is currently moot, but it becomes the next constraint the moment email capture is fixed.
9. **I did not audit `docs/scope-model.yaml`'s planned tickets against what actually shipped.** It contains a written ticket for "CI that runs the suites" and probably others relevant to §7.5. Someone should check whether the fixes I'm recommending are already specified and merely unscheduled — as two of them turned out to be.
