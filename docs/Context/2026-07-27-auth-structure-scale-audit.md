# Auth structure + Supabase fit audit — 3,000-gym LatAm scale

**Date:** 2026-07-27
**Question asked:** is the global-auth / per-gym-roster identity structure reliable, scalable and performant enough to sell across Latin America at ≥3,000 small-to-medium gyms — and is "everything on Supabase" a safe and affordable bet?
**Method:** replication panel — 5 Opus auditors given the **byte-identical prompt** in independent contexts, plus 2 external-research agents (Supabase cost model, vendor risk). Every claim required `file:line` / migration / live-DB / URL evidence. Live prod was read **read-only** (SELECT, EXPLAIN without ANALYZE, catalog reads, advisors). Orchestrator refereed the disagreements against the live database.

---

## 1. Verdicts

| Question | Panel result | Confidence |
|---|---|---|
| **One global `auth.users` row per email** (vs per-gym accounts) | **sound-with-fixes — 5/5 unanimous.** Keep it. | High |
| **Supabase as the sole backend at 3,000 gyms** | **fit-with-mitigations — 5/5 unanimous.** Stay. | High |
| **Will Supabase cost surprise us?** | **No.** $0.40–$1.04 per gym per month at 3,000 gyms. The mail bill is larger than the database bill. | High |

Five independent auditors, same prompt, converged on the same two verdicts and the same headline reasoning. They diverged on **severity ranking**, not on direction — see §5.

---

## 2. The global-account question, answered

### Why it is right

**Per-gym accounts are not actually an available option.** Supabase GoTrue namespaces users per *project*, and `auth.users.email` is unique project-wide. "One account per gym" therefore has only three realizations, and all three are worse:

| Alternative | Why it loses |
|---|---|
| One Supabase project per gym | 3,000 projects × $10–25/mo compute floor = **$30,000–$75,000/mo before a single query**, plus 3,000 migration targets, 3,000 SMTP configs, 3,000 backup postures. Rejected by ADR-0008 ("onboarding a gym is a config act, not an infra act") and it breaks the single `apps/client` deploy that serves every gym by host. |
| Synthetic per-gym emails (`ana+red@…`) | Destroys password recovery and deliverability — the two things the entire activation rail depends on. |
| Hand-rolled identity table | Re-implementing password hashing, recovery and session rotation. Strictly worse than GoTrue. |

**And the structure it enables is correct, verified live:**

- **Authorization never comes from the account, and never from the host.** All 25 gym-scoped SELECT policies key on `gym_id IN (SELECT m.gym_id FROM gym_membership m WHERE m.user_id = (SELECT auth.uid()))` or `is_staff_of(gym_id)`. **Not one policy reads a header.** `resolveTenant` stamps `x-gym`/`x-brand` for presentation only. A global identity therefore buys an attacker nothing: `auth.uid()` alone grants zero rows anywhere.
- **The join keys are DB invariants, not conventions.** `clientes_auth_user_id_per_gym UNIQUE (gym_id, auth_user_id) WHERE auth_user_id IS NOT NULL` and `clientes_email_gym_uq UNIQUE (gym_id, lower(email))` make "one identity, N tenants, at most one roster row per tenant" a database property.
- **The claim rails are HMAC-bound** to a server-minted firma over a Vault key, with correct domain separation across the three schemes (`uid:gym_id`, `activar:v1:<codigo>`, `codigo:email`). This closed the ADR-0009 §I1 open-enrollment hole — the ADR text still describes it as open; it is not. Do not re-file it.
- **It contains the MAU meter.** Supabase bills per auth user. A member of two gyms is **1** billable MAU here and **2** under per-gym accounts. The global choice is a cost *containment* decision, not just a UX one.

### What it costs, and where that bill is unpaid

A global identity makes **"which gym is this request for?"** a runtime question that must take the host as input and reconcile it against membership. The codebase currently answers it **three different ways**:

| Resolver | Behaviour | Status |
|---|---|---|
| `resolverMiembroGym` (`packages/data/src/server/agenda-miembro.ts:140-161`) | host match, else oldest membership — its own comment calls the alternative "the `limit(1)` roulette" | ✅ correct |
| `staff_gym()` + `getOperatorGym` (`packages/data/src/server/gym.ts:49-55`) | `order by gym_id limit 1` — **ignores the host entirely** | ❌ lowest-UUID wins |
| `mi_membresia()`, `toggle_favorito_tipo()` | `where auth_user_id = v_uid limit 1` — no gym filter, no ORDER BY | ❌ non-deterministic |

ADR-0015 explicitly declared this in scope ("member-side gym resolution must reconcile against the host tenant instead of `limit(1)`") and it was paid **only on the TypeScript reader side**, never in the RPCs.

**This is the entire cost of the global-account choice. It is a day of work, not a redesign.** The verdict is not "the model is shaky" — it is "the model is right and you owe it one canonical resolver."

### Live status of the trigger (verified this session)

| Check | Result |
|---|---|
| Emails holding `clientes` rows in 2+ gyms | **4** |
| Users holding `gym_membership` in 2+ gyms | **0** |
| Users with *claimed* `clientes` rows in 2+ gyms | **0** |

**The powder is loaded and the trigger has not been pulled.** Four people already have roster rows in two gyms; the wrong-gym reads fire the moment one of them activates in both. Fix before the second gym in any one city goes live.

---

## 3. Verified-critical defects (orchestrator-confirmed against live prod)

### C1 — `ventas` has no `cliente_id` index, and the member plan card scans it

`mi_membresia()` — called on every member profile / plan-card render — runs:

```sql
from public.ventas v where v.cliente_id = v_cli order by v.created_at desc, v.id desc limit 1
```

Live `pg_indexes` on `ventas`: `ventas_pkey`, `ventas_gym_id_idx`, `ventas_folio_gym_uq`, `ventas_idem_gym_uq`, `ventas_gym_fecha_idx`. **None leads with `cliente_id`.** Every member plan-card render sequentially scans the platform-wide sales table. At 3,000 gyms that is ~10M rows/year.

```sql
create index concurrently ventas_cliente_created_idx
  on public.ventas (cliente_id, created_at desc, id desc);
```

*Only 1 of 5 auditors caught this. Verified true.*

### C2 — `clientes.auth_user_id` has no leading-column index

The only covering structure is `clientes_auth_user_id_per_gym (gym_id, auth_user_id)`. PG17 has no btree skip scan, so a lookup by `auth_user_id` alone becomes a **full index scan** over every roster row on the platform. It fires **three times per member request**: the `clientes_member_select` policy, the `reservation_member_select` subquery, and `mi_membresia()`.

```sql
create index concurrently clientes_auth_user_id_idx
  on public.clientes (auth_user_id) where auth_user_id is not null;
```

*5 of 5 auditors caught this. Flagged by Supabase's own performance advisor today.*

### C3 — the `gym_membership` OR'd policies are structurally unindexable

Two permissive SELECT policies (`gym_membership_self_select` OR `gym_membership_staff_select`) compile to `(user_id = uid) OR (SubPlan → is_staff_of())`. Postgres cannot turn an OR'd predicate with a function call into an index condition.

**Refereed live, because the panel split on this.** With `enable_seqscan = off` (a 10¹⁰ cost penalty):

```
Index Only Scan using gym_membership_pkey on gym_membership
  Filter: ((user_id = '…') OR (SubPlan 1))
```

No `Index Cond` — a **full index scan with the OR as a filter**, not a probe. The auditor who rated this "low, it'll flip to a pkey probe as the table grows" was **wrong**: it flips to a full *scan*, and the per-row SECURITY DEFINER call still fires. Cost stays O(platform), not O(tenant).

Live corroboration: `pg_stat_user_tables` shows **275,638 seq scans vs 867 index scans on a 9-row table.** Three call sites read it with no `user_id` filter at all, relying entirely on RLS: `gym.ts:49-55`, `agenda-miembro.ts:147-150`, `agenda-miembro.ts:172`.

**Fix (both halves):** add `.eq("user_id", uid)` at the call sites — that supplies a top-level indexable AND-qual so the planner prunes to 1–3 rows *before* the OR runs — and collapse the two permissive policies into one so the OR never gates the scan.

**Binds at roughly 65–330 gyms.** This is the hardest technical ceiling in the architecture and it is ~6 lines of code.

### C4 — the production backup posture

Live: `max_connections=60`, `shared_buffers=224MB`, `effective_cache_size=384MB` — entry-tier compute. `archive_mode=on` with wal-g, so PITR is *mechanically* available, but **whether retention is purchased is not readable from SQL.** Meanwhile `ADR-0006:86` and `CONTEXT.md` both assert "Supabase PITR owns DR" — an assertion with no verification step attached, and repo memory from the Phase-3 cutover records "free tier = no backups → manual pre-gate dumps."

Four live gyms with 171 sales and 699 attendance records. **Open the dashboard today and confirm the plan and the PITR retention window.** If it is not purchased, buy it before gym #5 — then run one restore drill and record the RTO. Amend ADR-0006 so the DR claim matches what is actually paid for; a false DR assertion in a locked ADR is how a team discovers it has no backups *during* the incident.

---

## 4. Cost — the fear is pointed at the wrong vendor

Modelled independently by three agents against live-calibrated row sizes (measured: ~450–600 B/row all-in; 15 MB DB across 4 gyms).

**At 3,000 gyms × 150–300 members:**

| Line | Monthly |
|---|---|
| Supabase Pro plan | $25 |
| Compute (XL–2XL) | $210–$410 |
| Auth MAU overage (~360k–450k MAU @ $0.00325 over 100k included) | $845–$1,430 |
| PITR (7–14 day) | $100–$200 |
| Storage (~45 GB) | ~$5 |
| Egress | $7–$135 |
| **Supabase subtotal** | **~$1,200–$2,300** |
| Vercel | $270–$560 |
| **Email (Resend Scale + dedicated IP)** | **$385–$1,150** |
| **Full stack** | **~$1,600–$3,100/mo** |
| **Per gym** | **$0.53–$1.04 (≈ 9–18 MXN)** |

Against LatAm gym-software pricing of roughly 300–1,500 MXN/gym/month, infrastructure is **~1–3% of revenue.** The "Supabase monetizes wherever they can" instinct is a good instinct aimed at the wrong target:

- **Supabase Auth is the *cheapest* managed auth at this scale**, not the most expensive: ~$2,950/mo at 1M MAU vs Firebase ~$4,415, Cognito Essentials ~$14,850, Auth0 $10,000+. Switching providers to save money would *increase* the bill in every managed case.
- **Three of Supabase's most expensive meters are simply unused** — Realtime ($10/1,000 peak connections), Storage, and edge-function fan-out. Verified: zero `.channel(`/`postgres_changes`/`storage.from(` anywhere in the repo.
- **Egress never binds**, because every read is server-side: Supabase ships PostgREST JSON to Vercel, not to browsers.
- **The largest single vendor line at 3,000 gyms is Resend, not Supabase.**

**Where Supabase pricing genuinely can bite** (step functions you control, not creep): PITR at $100/mo per 7-day window; read replicas billed at *full* instance price each; SOC2 / ISO 27001 / audit logs / 28-day log retention are **Team-only ($599)**; uptime SLA is **Enterprise-only** — Free, Pro and Team carry *no uptime commitment whatsoever*. Treat **Team, not Pro, as the real floor** once you hold 1M consumers' PII. And there is precedent for re-tiering: branching went paid, which this repo already absorbed (`SUPABASE_TARGET_REF` scratch pattern).

---

## 5. Panel convergence — what 5 identical prompts actually produced

**Unanimous (5/5), independently derived:**

1. Keep one global account per email; per-gym accounts are worse — same three arguments, same order.
2. Supabase is a fit with mitigations; no re-platforming indicated.
3. `clientes.auth_user_id` missing index.
4. `mi_membresia()` returns an arbitrary gym's balance for a multi-gym member.
5. Staff pinned to `min(gym_id)`, no gym switcher — multi-location owners cannot be served.
6. Cost is not the threat: $0.40–$1.04/gym/mo.
7. **Serverless connection exhaustion does not apply here** — everything is PostgREST over HTTP; Vercel opens zero Postgres connections. (Worth stating plainly: this is the single most commonly feared serverless failure mode, and this stack is structurally immune.)
8. Auth email is one project-wide bucket + one Resend account/domain/key = shared blast radius across all tenants.
9. No account-deletion and no email-change path (LFPDPPP/LGPD exposure).
10. Leaked-password protection is off.
11. Anon catalog policies are `using (true)`, flat across every tenant.
12. One project = one blast radius; the backup posture is the biggest reliability exposure.

**Where they diverged — the useful part:**

| Item | Split | Referee call |
|---|---|---|
| `gym_membership` OR-scan severity | 2× **critical**, 1× **low**, 2× didn't flag | **Critical confirmed.** Live `enable_seqscan=off` EXPLAIN proves no index condition forms. The "low" rating was wrong. |
| `ventas.cliente_id` missing index | 1× **critical**, 1× aside, 3× missed | **Critical confirmed.** It is inside `mi_membresia()`. |
| Activation can mint a pre-confirmed global account for an unowned email | 1× **high**, 1× **medium**, 3× didn't flag | Real. Bounded by Turnstile + firma + email-match, but revisit before onboarding operators you have not personally vetted. |
| No self-serve gym/staff provisioning ("hardest ceiling, ~1,500 founder-hours") | **1 of 5** | Real and under-rated by the rest. Organizational, not technical. |
| `resolveTenant` cache: 500 entries, FIFO, thrashes at ~143 gyms | **1 of 5** | Real, ~2-line fix (raise to ~10,000, switch to LRU). |
| `enviar_mensaje_contacto` rate limit keys on a **caller-supplied** `p_ip` | 2 of 5 | Real. Rotate the parameter → unlimited rows into any gym's inbox. |
| Turnstile falls back to Cloudflare's always-passes test secret when the env var is missing | 2 of 5 | Real. Fails **open**, invisibly. Make it throw in production. |
| Compute tier identification | Free/Nano vs Micro | Same action either way: confirm plan + PITR in the dashboard. |

**Read of the replication result:** the *verdicts* are robust — five independent runs agreed on direction with no dissent, which is the strongest signal in this report. The *severity rankings* are not reproducible: the two runs of the same prompt slot disagreed most sharply on the single most consequential performance question. **Panels are reliable for direction, unreliable for prioritization.** Never take a single agent's severity ordering as fact — which is exactly why the referee pass exists.

---

## 6. Vendor risk (external research)

- **Data plane is strong; control plane is not.** 90-day component uptime: Database 100%, Auth 99.99%. But **project creation, resize, restore, PITR and backups were degraded across multiple regions for roughly two of the eight weeks preceding this audit.** Two consequences: multi-project sharding **cannot be an emergency lever** (you can't reliably create a project when you urgently need one), and **Supabase-managed PITR cannot be your only backup.**
- **The worst realistic event:** 2026-02-12, us-east-2, **3h42m, every service dark** (an internal deploy enabled AWS VPC Block Public Access region-wide). At 3,000 gyms that is every front desk in the country unable to check members in through a morning peak — with **no uptime SLA at all** below Enterprise.
- **Region: `us-east-1` is right; `sa-east-1` is the trap.** São Paulo *reads* as the LatAm-native choice but is ~7,400 km from Mexico City with traffic that characteristically hairpins through Miami — plausibly 140–200 ms vs 40–80 ms to Virginia. São Paulo earns a place only as a read replica if Brazil/Southern Cone becomes material revenue. **Confirm the current region and write it into an ADR so nobody "fixes" it later.**
- **Lock-in is moderate and mostly reversible.** Postgres — where the domain value lives — is fully portable via `pg_dump`, and bcrypt hashes in `auth.users.encrypted_password` import into every mainstream target in Modular Crypt Format without forcing password resets. ⚠️ **`supabase db dump` excludes the `auth` schema by default** — a team that "took a backup" via the CLI has silently not backed up its users. Dump `auth` explicitly.
- **This repo is unusually well-seamed for an exit:** only **6 files** import `@supabase/*`, with auth funnelled through `packages/data/src/server/sesion.ts`. The one leak is `auth.getClaims()` at ~8 app-level call sites. Routing those through a single `getSessionClaims()` accessor in `@gym/data` is hours of work and converts a 1–3 month auth migration into a contained one. Highest leverage-per-hour item available.
- **Vendor stability: strong.** $500M Series F at $10.5B (June 2026, GIC-led, Stripe's second cheque), ~$170M ARR, independent, no acquisition. Five-year going-concern risk is low. Budget for upward pricing drift and at least one more gating change.

---

## 7. Ordered actions

### NOW — this week
1. **Two indexes.** `ventas (cliente_id, created_at desc, id desc)` and `clientes (auth_user_id) where auth_user_id is not null`. Free today at 112 rows; impossible to schedule calmly at 900k.
2. **Confirm plan + PITR in the dashboard**, buy them if absent, run one restore drill, record the RTO, and amend `ADR-0006:86` to match reality.
3. **Turn on leaked-password protection** (one toggle) and **upgrade Resend Free → Pro ($20)** — that $20 removes the 100/day and 3,000/month walls.
4. **`.eq("user_id", uid)`** on the three unfiltered `gym_membership` reads, and collapse its two permissive SELECT policies into one.

### BEFORE 100 GYMS
5. **One canonical gym resolver.** `p_gym_id` on `mi_membresia()` and `toggle_favorito_tipo()`; `getOperatorGym` reads `x-gym` reconciled against staff memberships with a picker when >1; `registrar_venta` takes a validated `p_gym_id` instead of `staff_gym()`. Ship with a denial-suite assertion seeding one auth user in two gyms. **Until this ships, do not sell to a multi-location owner** — their sales are stamped to the wrong tenant's ledger and folio sequence.
6. **Make gym/staff onboarding a product surface.** No code path anywhere creates an `owner`/`operator` membership; every gym today is hand-written SQL against production. At 3,000 gyms × 30 min that is ~1,500 founder-hours and a standing production-write risk.
7. **Mail hardening:** honor `retry-after` on 429 in `resendTransport` (currently discarded, and a quota wall reads to the operator as "bad address"); two-wave sends for hand-transcribed rosters against the 4% account-level bounce threshold.
8. **Fail-closed Turnstile** — throw in production when `TURNSTILE_SECRET_KEY` is missing instead of falling back to the always-passes test secret. Fix `enviar_mensaje_contacto` to read the IP server-side.

### BEFORE 250–1,000 GYMS
9. `resolveTenant` cache → ~10,000 entries with LRU eviction (thrashes at ~143 gyms).
10. **Get auth off the shared Vercel egress pool.** Move token refresh + `verifyOtp` to the browser so the per-IP budgets (1,800/hr refresh, 360/hr verification) are spent per member. Instrument GoTrue 429s **now** so the decision is made on measurement.
11. **Per-tenant restore path.** Physical PITR structurally cannot answer "one tenant lost data" without rolling back the other 2,999. Build a per-`gym_id` logical extract/reimport, round-tripped against the demo twin.
12. **Independent off-Supabase backups** (nightly `pg_dump` to a separate cloud account, **including the `auth` schema**) — non-negotiable given the mid-2026 multi-day control-plane degradations of PITR itself.
13. **Account deletion + email-change flows.** MX LFPDPPP ARCO, BR LGPD art.18, CO Ley 1581. Today a member who loses their email address is permanently locked out.
14. **Narrow the anon surface** — column-grant treatment on the remaining 16 flat tables, and drop `gym_domain`'s anon policy (it is the complete customer list).
15. **Close the `getClaims()` seam** into one `@gym/data` accessor — hours of work, keeps the exit cheap.
16. **Degraded-mode check-in.** Cache validated claims briefly and let attendance queue locally. Converts a 34-minute auth blip from 3,000 simultaneous support calls into a visible-but-working degradation. Highest reliability-per-dollar move available, and far cheaper than migrating auth.

### BEFORE 3,000 GYMS
17. Team plan ($599) for SOC2 / audit logs / 28-day retention; compute ladder Large → XL; read replica for member reads; rehearse the sharding seam on `resolveTenant` **ahead of need** (project creation is not a reactive lever).

---

## 8. Bottom line

**The structure is right. Keep it.** One global account per email with per-gym `clientes` rows joined through `gym_membership` is the correct shape for this product, and the alternative is not merely worse — it is largely unavailable on Supabase and would cost 30–75× more in infrastructure alone. Five independent auditors reached that conclusion with no dissent.

**Supabase is the right substrate, and cost is not what threatens this business.** At ~1–3% of revenue, the database bill is noise. The instinct to distrust vendor monetization is sound, but the exposures that matter here are *reliability* ones — the backup posture today, the shared email bucket, and one blast radius with no SLA below Enterprise — not the invoice.

**What you owe is a day of work on one canonical gym resolver, two `CREATE INDEX` statements, and a billing decision about backups.** None of that is a redesign. The architecture carries 3,000 gyms; the implementation currently has four unpaid debts and every one of them is cheap while the platform is small.
