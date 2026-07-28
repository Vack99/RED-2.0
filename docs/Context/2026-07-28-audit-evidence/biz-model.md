# biz:model — Business-Model / Technical-Design Coupling

**Agent:** `biz:model` · **Date:** 2026-07-28 · **Target:** ≥3,000 LatAm gyms × 150–300 members
**Access used:** live prod `hjppxawglmukfvsgmcog` read-only (`information_schema`, `pg_constraint`), repo at
`C:/Users/Aaron/Documents/Repos/RED-2.0` (branch `main`), 4 sibling-agent audit files already on disk this
session (`red-ops.md`, `red-blastradius.md`, `arch-datamodel.md`, `model-tiers.md`) cited where reused, with
their own file:line/SQL evidence intact. **Nothing written. No DDL. No migration.**

---

## Headline

**RED has built a product that manages a gym's business, and a payment model (BYO-Stripe, no cut) that
correctly keeps it out of member money — but it has never built the one thing every SaaS needs regardless of
payment model: a representation of *its own* customer relationship with the gym.** There is no `gym.status`
column, no subscription/billing table, no suspend path, and — independently verified live — 7 of the 8
oldest tenant tables (`clientes`, `ventas`, `asistencias`, `perfil`, `cobro`, `plantillas`, `plan_feature`)
FK `gym(id)` with `NO ACTION`, so a paying gym cannot even be deleted once it has member data. The result:
RED can build, seed, and operate a gym for free indefinitely, and if a gym simply stops paying, RED has
**no supported action of any kind** to notice, prove, or stop it. This is not a scale problem. It is true
at gym #1.

## Ranked — worst first, each with the event/gym-count that bites

| # | Coupling | Bites at | Confidence |
|---|---|---|---|
| 1 | **No enforcement lever exists, and the one manual workaround doesn't work.** Gym rows can't be deleted (FK-blocked, verified live); `gym_domain` deletion doesn't revoke access because host resolution is explicitly *not* the authz boundary (`resolve-tenant.ts:38`); `gym_membership` — the actual authz boundary — has **zero DELETE/UPDATE code path anywhere in 87 migrations**, client or admin. | **The first gym that stops paying and doesn't leave voluntarily** — could be today, at 4 gyms | measured |
| 2 | **RED does not track its own billing relationship with a gym anywhere in the product.** No subscription table, no `paid_through` date, no invoice history. `cobro` (the only "billing" table) is the *gym's* bank info for collecting from *members* — nothing records what a gym owes RED. | Already true at 4 gyms; becomes operationally unmanageable manually somewhere in the same 50–135-gym band `red-ops.md §5.3` derives for support saturation | measured |
| 3 | **Data ownership at churn is contractually undefined and technically undeliverable as anything but a lossy spreadsheet.** No ToS/DPA exists anywhere in the repo (verified: `/legal` is a member-facing consent page, brand-neutral, silent on retention/export/deletion rights). The one export (`respaldo.ts`) covers 4 of 29 tables, drops every primary key, and denormalizes FKs to display names; import exists for 0 of 29. | **The first formal "give me my data" request** — possible today at 4 gyms; certain well before 3,000 at any normal SaaS churn rate | measured (export/import), asserted (churn rate) |
| 4 | **Departed gyms never leave the database, and nothing marks them departed.** 7 tables NO-ACTION-block `delete from gym` (verified live, `pg_constraint`); `gym` has no `status`/`is_active`/`deleted_at` column (verified live schema — 12 columns, none of them). At an industry-typical 20–25%/yr logo churn (labeled assumption, not RED-measured), a 3,000-gym steady state accumulates **600–750 new zombie tenants every year, forever**, each still fully live to every RLS policy and every G-scanning query the sibling audits already flagged. | Compounding from gym #1; material load by the time cumulative churn crosses low-hundreds of departed gyms | modelled |
| 5 | **The no-cut flat-fee price and the support-cost driver are decoupled — and inverted.** Infra COGS margin is genuinely excellent (≈97.2–99.4%, §5 below). But support cost priced at real SaaS benchmarks ($18–35/ticket, `red-ops.md §5.4`, fetched 2026-07-28) is **629–1,224 MXN/gym/month** at 3,000 gyms — 42% to over 400% of the 300–1,500 MXN price band, **before infra, before founder pay**. A gym with more active members generates more support load but pays RED the same flat fee — the cost driver scales with usage, the revenue driver doesn't. | Not a future event — **already true at any realistic staffing cost**; invisible today only because the founder's time is unpriced (`red-ops.md`: founder support saturates at ~135 gyms) | measured cost-per-ticket (secondary benchmark), modelled application to RED |

---

## 1. BYO-Stripe, no cut — implemented vs. planned, and what "no cut" costs RED

### 1.1 What is actually implemented today: nothing

```
$ grep -rniE "stripe" --include="*.ts" --include="*.tsx" --include="*.sql" apps packages supabase
→ zero hits in product code (only doc/handoff prose)
```

There is no Stripe SDK dependency, no webhook route, no `stripe_account_id` column, no Connect anything.
Confirmed against the design doc itself:
`docs/superpowers/specs/2026-07-06-member-registration-payment-strategy-design.md:80` — Phase 2 (Stripe) is
"**gated on pilot demand + MX counsel**, recorded only." Every sale today runs through `registrar_venta`
(`SECURITY INVOKER`, ADR-0005) writing a `metodo` string (`ventas.metodo` — cash/transfer/card as *labels*,
not processor integrations) with **no payment-gateway verification of any kind**. The `cobro` table
(`supabase/migrations/20260530053739_create_cobro.sql:5-16`) is the *gym's* CLABE/bank/card-acceptance info
shown to members for how to pay the gym directly — it is not RED's billing surface.

### 1.2 What "no cut" means for RED's ability to enforce payment

The design doc's own logic (`…strategy-design.md:24`) is sound on the regulatory axis: **because RED never
routes or holds member money, it avoids SAT *plataforma de intermediación* withholding and Ley Fintech/IFPE
custody obligations.** That reasoning holds up — it is a real and correctly-identified benefit.

But the same "never touch member money" design also means **RED never touches *any* money in the product at
all — including its own subscription fee.** A take-rate model would have given RED an automatic enforcement
lever for free: fail to renew a Stripe Connect subscription, and the platform's own billing state naturally
reflects it (`past_due`, `canceled`). A flat SaaS fee collected out-of-band (bank transfer, presumably —
verified no in-app collection path exists) gives RED **no such signal, no such lever, and no such record.**
Confirmed via live schema (`information_schema.columns` on `public.gym`, this session):

```
id, slug, brand_name, legal_name, timezone, brand_module_id, token_overrides,
owner_user_id, created_at, about_story, about_pull_quote, about_tagline
```

Twelve columns. None of them record payment status. This is the direct, causal price of the no-cut decision:
**RED chose to be BYO-Stripe specifically to stay out of member money, and the same architectural choice left
it with no payment rail of its own to hook enforcement onto.** That trade was not separately evaluated — the
design doc frames it entirely as a regulatory-risk decision (§3, point 3) and never revisits what it costs
the *enforcement* side.

### 1.3 Suspending a non-paying gym — verified impossible via any supported path

Three independent checks, all this session:

1. **The `gym` row cannot be deleted while it has member data.** Live `pg_constraint` query (SQL run this
   session):
   ```sql
   select conname, conrelid::regclass, confdeltype
   from pg_constraint where contype='f' and confrelid = 'public.gym'::regclass;
   ```
   Result: **7 of 27 FKs into `gym` are `NO ACTION`** — `clientes_gym_id_fkey`, `ventas_gym_id_fkey`,
   `asistencias_gym_id_fkey`, `perfil_gym_id_fkey`, `cobro_gym_id_fkey`, `plantillas_gym_id_fkey`,
   `plan_feature_gym_id_fkey`. The other 20 (`gym_domain`, `gym_membership`, `class_session`, `reservation`,
   …) cascade. Any real gym has rows in the NO-ACTION set, so `DELETE FROM gym` throws.

2. **Deleting `gym_domain` — the only other lever anyone might reach for — does not revoke access.**
   `resolve-tenant.ts:34-39` documents by design: *"`slug`… NEVER an authz input (isolation is
   RLS-by-membership; ADR-0008 hinge)."* And the resolution order (`resolve-tenant.ts:164-179`) falls
   through an unmapped host to a `?gym=<slug>` **override that is validated against the live `gym` table,
   open set** — so even after deleting every `gym_domain` row for a delinquent gym, its staff and members
   can still reach full functionality from any unmapped host by appending `?gym=<slug>` to the URL, because
   their access is gated by `gym_membership` (RLS), which domain deletion never touches. The one manual
   action a support engineer might improvise **does not work.**

3. **`gym_membership` — the actual authz boundary — has no DELETE/UPDATE anywhere in the codebase.**
   ```
   $ grep -rln "delete from public.gym_membership\|update.*gym_membership.*set" supabase/migrations/*.sql
   → (no matches)
   ```
   The table's own migration says so explicitly: *"NO client writes — writes ride SECURITY DEFINER RPCs
   only"* (`20260702161010_create_gym_membership.sql:5`) — and no RPC in any of the 87 migrations ever
   issues that write. There is no revoke.

**Net: RED cannot suspend a non-paying gym today through any code path, any RPC, or any documented manual
procedure. The only route is an engineer hand-writing an unprecedented `DELETE FROM gym_membership WHERE
gym_id = …` against production, with no UI, no audit trail, no dry-run, and no product surface that has
ever exercised it.**

### 1.4 Unit economics against 300–1,500 MXN — see §5 (kept together with the cost-line analysis so the
BYO-Stripe framing and the support-cost framing aren't read as two unrelated numbers).

---

## 2. Who owns member data at churn

### 2.1 Contract: there isn't one

```
$ grep -rniE "terminos|términos|contrato|data processing|dpa\b|terms of service" docs apps
```
The only hits are (a) internal engineering prose using "contrato" to mean *"the brand token contract"* — an
API surface, not a legal document — and (b) `apps/client/src/app/legal/page.tsx`, a static, brand-neutral,
**member-facing** consent page ("Al crear una cuenta y reservar clases aceptas estos términos…", line 47-50).
It says nothing about data retention, export rights, or what happens at gym offboarding, and it is a
member↔gym-platform notice, not a RED↔gym commercial agreement. **There is no document anywhere establishing
what a gym is owed when it leaves.** "Contractually owed" is currently an open question with zero answer on
file, not a policy this audit can grade against — its own worst finding.

### 2.2 Technically: a real export exists, and it is not enough

Workflow 1's premise ("export exists for 0 of 28 tables") is **wrong** — verified independently this
session by reading the code, matching the sibling audit `red-blastradius.md §2.2`:
`apps/admin/src/app/(app)/cuenta/respaldo/route.ts` → `packages/data/src/server/respaldo.ts` →
`packages/data/src/server/export/rows.ts` produces a real, well-built `.xlsx`: gated by `requireOperator`,
gym resolved from `auth.uid()` (not the host), paginated at `PAGE = 1000` specifically so the full-history
ledgers can't silently truncate.

But as a churn deliverable it fails on the same five points `red-blastradius.md` already established, which
I confirm apply directly to "what is a departed gym owed":

| Gap | Evidence | Consequence for the gym at churn |
|---|---|---|
| Covers 4 of **29** tenant tables | `respaldo.ts:177-190` — `clientes`, `ventas`, `asistencias`, `paquetes` only | The entire schedule/agenda/branding/config subgraph (`class_session`, `reservation`, `class_type`, `coach`, `schedule_template*`, `room`, `perfil`, `cobro`, `plan_feature`, `facility`, `faq`, `about_value`, `stat`, `gym_membership`, `gym_domain`, `gym` itself) is **not exportable at all** |
| Primary keys dropped | `rows.ts:174-206` | A gym cannot even re-import into a competitor's system with identity intact — the export is fit for reading, not migrating |
| FKs denormalized to display names | `rows.ts:163-164` | Two members named "Juan Pérez" become indistinguishable; **61 of 116 live `clientes` rows have no `email`** (measured, matches sibling audit) and there is no other unique key |
| Values are labels, not source data | `METODO_LABEL`/`vigenciaLabel` (`rows.ts:96-128`) | `estado`/`urgencia` are computed-at-export-time snapshots, not the underlying facts |
| Default window is 24 months, not full history | `respaldo.ts:166` | A 3-year-old gym's earliest year of revenue history requires 12+ separate manual `?mes=` downloads to recover |

**Import exists for 0 of 29 tables** — `grep -rn "readFile|xlsx.read|bulkInsert|upsert(" packages/data/src
apps/admin/src apps/client/src` returns nothing outside `respaldo.ts` itself, which only writes the export.

### 2.3 Cost of a "give me my data" request today, and at 3,000 gyms

**Today (founder-hours, not modelled — walked through directly):** an operator clicks Descargar in the
admin UI. That produces the 4-table lossy export in seconds — genuinely cheap for the *covered* data. But
"my data" as any gym owner would mean it — their full schedule config, branding, roster relationships,
member accounts — has **no button at all**. Producing it means a human with database access hand-running
24 more table-scoped `select … where gym_id = …` queries and hand-assembling the result, because no code
path does this. There is no estimate on file for that hand-run because it has never been done — it is not
a founder-hours number that has been measured, it is a **process that does not exist yet**, which is itself
worse than a slow one.

**At 3,000 gyms:** normal SaaS churn (commonly cited 5–7%/mo for SMB SaaS — **not sourced by this audit,
flagged as an industry range, not a measurement**) applied to 3,000 gyms means dozens of "give me my data"
requests **per month**, each currently requiring a founder-executed, ad-hoc, partially-manual data pull with
no established procedure, no SLA, and — because import is 0/29 anywhere, including for RED's *own* internal
recovery use — no tooling investment that would make the second request cheaper than the first. Every
request is paid in full, every time, forever, at founder-attention cost.

**Falsification check — what would make this fine?** If gyms churning off RED never actually want their
historical data (e.g., they fold, don't migrate to a competitor, or accept "screenshots of the app" as
sufficient), the gap is moot. I did not find any evidence either way — RED has zero churned gyms to date
(4 gyms, all currently live) — so this is **untested, not resolved**. The exit trigger is unambiguous: the
first real churn request that asks for data back.

---

## 3. Offboarding and deletion — the accumulation of dead tenants

### 3.1 Verified live: `gym` cannot be deleted once real

Same `pg_constraint` result as §1.3: 7 tables (`clientes`, `ventas`, `asistencias`, `perfil`, `cobro`,
`plantillas`, `plan_feature`) NO-ACTION-block deletion. This is a genuinely good safety property against
*accidental* deletion — but it is the only mechanism in play; there is no deliberate, supported deletion path
either. `gym` has no `status`/`is_active`/`deleted_at` column (verified live: 12 columns, listed §1.2, none
of them lifecycle-related).

A `cliente` row itself **can** be deleted, and doing so **cascades**: `ventas.cliente_id … on delete cascade`
(`20260530023224_create_ventas_core.sql:51`) and `asistencias.cliente_id … on delete cascade`
(`20260530031218_create_asistencias.sql:8`), both verified in the migration files. So the one deletion path
that *does* exist in the schema is the one that destroys a member's paid-revenue history and attendance
ledger as a side effect — the opposite of what a churn/offboarding flow should do, and exactly the shape
`red-team.md §3` independently derives when reasoning about the missing `anular_venta` void RPC.

### 3.2 Modelling the zombie-tenant accumulation

No code marks a gym "departed." A gym that stops paying and simply goes quiet (no explicit churn request,
no data pull, nothing) is **indistinguishable in the database from an active gym forever** — its hosts keep
resolving (until someone remembers to remove `gym_domain` rows, which per §1.3 doesn't even revoke access),
its rows keep being read by every host-resolution query, every RLS policy evaluation, every `count(*)`-style
admin metric, and every backup.

At an assumed 20–25%/yr logo churn — **labeled assumption**, the same range `alt-selfhost.md:58` already
used for member-level churn modelling in this workflow, not independently sourced here for gym-level churn
— a 3,000-gym steady-state book accumulates:

| | /yr | Cumulative @ yr 3 | Cumulative @ yr 5 |
|---|---|---|---|
| New zombie tenants (20%/yr) | 600 | 1,464 (compounding on a shrinking live base) | ~2,013 |
| New zombie tenants (25%/yr) | 750 | 1,734 | ~2,285 |

These are the *low* end of "dead" — a departed gym's `clientes`/`ventas`/`asistencias` rows never get
smaller (§3.1's cascade only fires on a per-row delete, never invoked for a bulk gym-level cleanup) and its
`class_session`/`reservation`/schedule rows (which *do* cascade on `gym` delete) never get the chance to,
because `gym` itself can't be deleted (§3.1). **The steady-state "live" row count the other audits size
compute/disk against (`arch-datamodel.md`, `model-tiers.md`) already assumes every counted gym is active —
none of those models subtract departed gyms, because there is no column to filter them by.** This means the
compute-scaling numbers elsewhere in this workflow are, if anything, mildly optimistic once churn is real:
disk and query-scan load scale with **all gyms that ever existed**, not gyms currently paying.

**Falsification check.** *What would make this a non-issue?* If RED's actual churn rate turns out near zero
(plausible for a young product with 4 gyms, all live) or if a future migration adds `gym.status` +
retroactively marks history, the accumulation stops. I did not find any evidence a status column or cleanup
job is planned — it is absent from every audit doc, PRD, and ADR I searched (`grep -rn "gym.status\|is_active"
docs/` returns only the coach/schedule-template `is_active` columns from §1.3, never `gym`).

---

## 4. The invoice at churn — billing, domain, and `auth.users`

### 4.1 Billing

There is nothing to close, because there was never anything open in the software. §1.2 already established
RED tracks no subscription state. "The invoice at churn" is, today, **entirely a conversation outside the
product** — whatever collection mechanism RED uses (bank transfer, presumably, given `cobro`'s CLABE/bank
fields are modelled for the *gym*, not for RED) leaves no trace for the platform to reconcile against. There
is no cancel-flow, no final-invoice generation, no proration logic — none of these concepts exist in the
schema or the code.

### 4.2 The domain

Per the corrected system-prompt baseline, there are **no BYO custom domains** — every host is
`*.ibookit.lat` (verified this matches `gym_domain` seed data, `20260702150000_create_gym_tenant_spine.sql:65-75`,
all Vercel-owned or `.localhost` hosts). So churn does not have to negotiate a domain handoff — the "BYO-domain
onboarding queue" risk Workflow 1 flagged is moot for the same reason it was moot on the way in. The domain
question at churn reduces to "delete the `gym_domain` rows," which — per §1.3 — is cosmetic (their host stops
resolving to that brand) but **does not revoke product access**, because domain mapping was never the authz
boundary in the first place.

### 4.3 `auth.users` — platform-global, and deleting it is not even correct

`auth.users` is one Supabase Auth table shared by the whole project — not per-gym, by construction of the
single-project multi-tenant design. The join to a gym is `gym_membership(user_id, gym_id) → role`, a
composite-PK many-to-many table (`20260702161010_create_gym_membership.sql:16-22`). **Verified live this
session** (`select user_id, count(*) from gym_membership group by user_id`): all 9 current memberships are
1-gym-each — **no multi-gym member exists in production today.** But the schema is explicitly built for it
(composite PK, not a single-gym FK), and the platform's own docs already treat multi-gym membership as a real
case worth reasoning about (`docs/Context/2026-07-27-multigym-rpc-scoping-decision-memo.md`,
`activation-rails-two-paths` memory) — this is a designed-for scenario, not a hypothetical.

That means: even if RED wanted to "delete the departed gym's members" at churn, it cannot correctly do so at
the `auth.users` level, because **a single login might be the same real person who is also an active,
paying member of a different, still-live gym.** `gym_membership.user_id … on delete cascade` off
`auth.users` (`:17`) means deleting the *auth account* would silently remove that person's membership at
**every** gym they belong to, not just the departing one — the wrong blast radius for what "offboard one
gym" should mean. The **correct** operation — delete the one `gym_membership` row for the departing gym,
leaving `auth.users` and any other gym's membership intact — is exactly the operation confirmed absent in
§1.3 (no DELETE against `gym_membership` exists anywhere in the codebase). **The one architecturally correct
cleanup action and the one enforcement action RED needs are the same missing primitive.**

---

## 5. Price vs. cost — the real gross-margin picture

### 5.1 Infra alone: excellent, and the wrong number to anchor on

Reusing `model-tiers.md §5` (fully sourced there — Supabase pricing fetched 2026-07-27, FX 1 USD = 17.48 MXN
fetched 2026-07-24 from wise.com) without re-deriving: fully-loaded (Team plan, 7-day PITR, Resend Scale
email) Supabase spend at 3,000 gyms is **$1,465.97/mo = $0.489/gym = 8.54 MXN/gym/month.**

| | 300 MXN floor | 1,500 MXN ceiling |
|---|---|---|
| Infra cost as % of revenue | 2.85% | 0.57% |
| **Implied infra-only gross margin** | **97.2%** | **99.4%** |

Taken alone, this says the business is essentially free to run. That is the number every SaaS founder wants
to see, and it is **true and correctly sourced** — but it answers "how much does the database cost," not
"what is the gross margin," because it omits the cost line that actually dominates.

### 5.2 The cost line that would have to grow — already has, it's just unpriced

`red-ops.md §5.4` (same session, same target, fetched 2026-07-28) benchmarks per-ticket support cost against
two primary sources: **lorikeetcx.ai ("SaaS support $18–$35/ticket")** and a support-load model of **2.0
tickets/gym/month** (deliberately set above MetricNet's 0.5/user/mo external benchmark, per fullview.io,
because — its own words — *"RED's ticket mix contains classes of issue that most SaaS resolve with a
self-serve button"*, and this audit's own §1–§4 findings (no gym-status flag, no billing UI, no self-serve
export, no `anular_venta`, no operator role per `red-ops.md §0`) corroborate that RED currently has **fewer**
self-serve paths than a typical SaaS, if anything understating the ticket rate).

Converting to per-gym MXN (my own arithmetic, same FX 17.48, same inputs, done for this mandate's specific
"price vs. cost" framing):

| | $/gym/mo | MXN/gym/mo | % of 300 MXN floor | % of 1,500 MXN ceiling |
|---|---|---|---|---|
| Support @ $18/ticket floor | $36.00 | 629 | **210%** | 42% |
| Support @ $35/ticket ceiling | $70.00 | 1,224 | **408%** | 82% |
| *(for scale) infra, fully loaded* | *$0.489* | *8.54* | *2.85%* | *0.57%* |

**At the 300 MXN price floor, support cost priced at real market rates is 2.1×–4.1× the entire revenue of
the gym it serves — before infra, before the founder's own time, before any Stripe processing fee (which the
gym bears directly under BYO-Stripe, so it doesn't hit RED's margin, but it's also not RED's to optimize).**
Even at the 1,500 MXN ceiling, support alone consumes 42–82% of revenue. Infra, by contrast, is 0.57–2.85% —
two orders of magnitude smaller and, per §5.1, essentially irrelevant to the real economics.

**This is the direct consequence of the BYO-Stripe / no-cut decision interacting with a flat per-gym fee:**
RED's cost driver (member activity → bookings → renewals → questions → tickets) scales with how successful
and active a gym's *members* are, while RED's revenue is a flat monthly number that does not move with member
count, activity, or transaction volume. A gym that grows from 150 to 300 active members **roughly doubles
RED's support cost for that tenant while paying RED exactly the same fee.** A take-rate model would have at
least partially indexed RED's revenue to the same activity that drives its cost; the flat no-cut fee does not.

**Which cost line would have to grow, and by how much, before margin becomes a constraint?** — it does not
need to grow. At any realistic market staffing rate, it is *already* the dominant cost and, at the low end
of the stated price band, already larger than revenue. The reason this hasn't bankrupted the 4-gym present
is that the founder's support time is currently unpriced (sweat equity) — `red-ops.md §5.3` measures founder
support saturating at ~135 gyms in its Expected band (1.25 founder-h/gym/mo), which is the point this
free-labor subsidy runs out and the true cost structure above becomes a cash cost RED must either charge for
or absorb at a loss.

**Falsification check on §5.2 — what would have to be true for this to be wrong?** (a) RED's actual ticket
rate is far below 2.0/gym/mo — plausible if the product turns out simpler to operate than modelled, but every
concrete gap this workflow found (no export self-serve, no void-sale self-serve, no operator role, no
billing self-serve) points the other way. (b) RED never staffs support at market rate and the founder (or
unpaid help) absorbs it indefinitely — possible below the ~135-gym founder-saturation point, but by
definition not a scalable answer to a 3,000-gym target. (c) The cited $18–35/ticket benchmark doesn't apply
to a MXN-priced LatAm SMB product — plausible that LatAm outsourced support is cheaper than the US-anchored
benchmark; I did not find or fetch a LatAm-specific cost-per-ticket source, so this is the single most
load-bearing unverified number in this section, and the one worth re-running with a sourced local rate before
trusting the 210%/408% figures as more than an order-of-magnitude warning.

---

## Blind spots

1. **I did not fetch a LatAm-specific cost-per-support-ticket source.** §5.2's central number reuses a
   US-anchored SaaS benchmark (`red-ops.md`, lorikeetcx.ai) via my own MXN conversion. If real LatAm
   outsourced/BPO support runs at, say, $5–8/ticket instead of $18–35, the 210%/408%-of-revenue framing drops
   to a still-uncomfortable but non-catastrophic ~35–70% at the 300 MXN floor. The directional finding (support,
   not infra, is the real cost line) survives; the exact multiple does not.
2. **I did not independently verify the 20–25%/yr gym-level churn assumption used in §3.2** — it is borrowed
   from a member-level churn figure elsewhere in this workflow (`alt-selfhost.md:58`), not sourced for
   *tenant* churn specifically, and gym-level (logo) churn for B2B SaaS is typically far lower than
   member-level churn. The zombie-accumulation *mechanism* (verified live via `pg_constraint`) is solid; the
   *rate* at which it fills up is a labeled guess.
3. **I did not test what actually happens today if a support engineer runs the unprecedented
   `DELETE FROM gym_membership WHERE gym_id = X`** against a real gym (correctly out of scope — this session
   is read-only against live prod). I inferred from the schema (no downstream FK depends on `gym_membership`
   existing) that it would be safe and sufficient, but this is reasoning from `pg_constraint`, not an executed
   test.
4. **I did not check whether RED's actual off-system billing process (bank transfer, presumably) has any
   external record-keeping** — a spreadsheet, an accounting tool, a bank statement RED already reconciles
   manually. §1/§4's finding is specifically that **the product** has no representation of this, which is
   true regardless, but "RED has zero visibility into who's paid" would be a stronger and possibly false claim
   if a founder-maintained spreadsheet already exists outside the repo. I have no way to check that from this
   environment.
5. **I did not model what a *correct* fix costs.** This report identifies that the enforcement primitive
   (revoke one `gym_membership` row) and the offboarding primitive (mark a gym departed without deleting its
   history) are the same missing piece, but I did not scope the engineering effort to build it — that is a
   natural fast-follow for a planning agent, not this audit.
