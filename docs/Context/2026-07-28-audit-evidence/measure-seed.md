# seed:scale — building the tiered dataset on SCRATCH (`gyyujeguycxxoaqgdnjp`)

**Agent:** seed:scale · **Target:** SCRATCH only. Every write below went through
`POST https://api.supabase.com/v1/projects/gyyujeguycxxoaqgdnjp/database/query`, asserted against the
hardcoded ref string `gyyujeguycxxoaqgdnjp` before every call (see `run.mjs` below — it aborts if the
ref doesn't match, exactly like `run-denial-suite.mjs`). No MCP write tool was ever invoked. No write
touched `hjppxawglmukfvsgmcog`.

**Result: all four requested tiers exist — 50, 100, 250, 500 gyms, cumulative — at 200 members/gym,
60% activated (real `auth.users` row + `clientes.auth_user_id` set), 12 ventas/member (1yr of monthly
renewals), 2 staff/gym. Final scratch size: 391 MB (410,274,963 bytes), measured after `ANALYZE`.
109 MB of headroom remains under the 500 MB cap. `asistencias`/`reservation` were deliberately NOT
seeded — see §5 for why.**

**Unplanned but load-bearing finding: the scratch project was NOT at its ~15 MB baseline when this
agent started. It was at 287 MB, holding two prior agents' (E1, E6) disposable test data. Both of
their own reports explicitly marked that data as droppable by a follow-up session. Reclaiming it was
the actual unlock that made all four tiers possible — see §1.**

---

## 0. Method — the runner

Every write/read below went through a small generic runner, `run.mjs`, in the same directory as this
report's raw SQL:

```js
const REF = 'gyyujeguycxxoaqgdnjp';
if (REF !== 'gyyujeguycxxoaqgdnjp') { console.error('ABORT: not scratch'); process.exit(1); }
const PAT = process.env.SB_PAT;
if (!PAT || !PAT.startsWith('sbp_')) { console.error('ABORT: missing SB_PAT'); process.exit(1); }
// ... POST { query } to https://api.supabase.com/v1/projects/${REF}/database/query, Bearer PAT
```

`SB_PAT` was exported into the shell from the gitignored `docs/db-testing-throwaway-project/data` file
immediately before each call and never written into any file or echoed to a log.

---

## 1. Starting state was NOT clean — 287 MB of prior agents' leftovers, reclaimed

`select pg_database_size(current_database())` at session start:

```json
[{"size":"287 MB","bytes":300747923}]
```

Per-table breakdown (`pg_total_relation_size`) showed why: `ventas` 183 MB / 600,003 rows, `gym_membership`
85 MB / 611,000 rows, `gym` 3,002 rows (2 real + 3,000 synthetic `slug like 'synth-gym-%'`), `clientes`
20,001 rows, plus a helper table `e6_cliente_pool` (20,000 rows) and a fake `auth.users` row. This is
agent E1's (`measure-e1-policy-merge.md`) `gym_membership`-only RLS-policy-merge test data and agent
E6's (`measure-e6-index-proof.md`) single-gym `ventas` index-proof data. **Both reports explicitly say
this is disposable** — E1: *"left dropped on scratch afterward (disposable project, noted as a leftover
in the report)"*; E6 §10: *"Not cleaned up... A follow-up session (or whoever owns scratch next) can
drop all of the above."* I am that follow-up session.

**Why I reclaimed it rather than building on top:** neither dataset matches this mandate's shape — E1's
3,000 gyms have `gym_membership` rows but zero `clientes`/`ventas`; E6's 20,001 `clientes` +
600,003 `ventas` all sit on ONE real gym (`red`, id `806ce892-...`), not distributed across many gyms —
and their reports are already written and self-contained (nothing downstream depends on the data still
existing). Leaving it in place would have consumed 273 of my ~400 MB budget for data that doesn't serve
"seed a realistic multi-gym tenant scale." I dropped it.

**Cleanup SQL** (`00-cleanup.sql`, v2 — see the finding in §1.1 for why v2, not v1):

```sql
delete from public.ventas
where gym_id = '806ce892-4d0b-42a2-93b6-e68d3d71df49'
  and (folio between 4 and 50003 or folio between 100001 and 650000);

delete from public.clientes where nombre like 'seed cliente %' or nombre = 'E6 TARGET MEMBER';
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
drop table if exists public.e6_cliente_pool;
drop index if exists public.ventas_cliente_created_id_idx;

delete from public.gym where slug like 'synth-gym-%';  -- cascades gym_membership (611,000 rows)

analyze public.gym; analyze public.gym_membership; analyze public.clientes; analyze public.ventas;
```

Result (30,024 ms wall clock for the v2 run):
```json
[{"t":"gym","c":2},{"t":"gym_membership","c":0},{"t":"clientes","c":0},{"t":"ventas","c":0},{"t":"auth.users","c":0}]
```

### 1.1 A finding, not just a cleanup step: DELETE order matters when you also drop the index the cascade needs

**First attempt failed.** My original cleanup dropped `ventas_cliente_created_id_idx` (E6's proof
index — see §5 for why it needs to go) *before* deleting the 20,001 `clientes` rows that cascade-delete
(`ON DELETE CASCADE`) into `ventas`. Deleting a parent row with no supporting child index forces Postgres
to re-derive the cascade delete as a per-row scan; over 20,001 parent deletes against a 600,003-row
child table with the index just dropped, it never finished:

```
FAILED (400) after 120883ms:
{"message":"Failed to run sql query: ERROR:  57014: canceling statement due to statement timeout
CONTEXT:  SQL statement \"DELETE FROM ONLY \"public\".\"ventas\" WHERE $1 OPERATOR(pg_catalog.=) \"cliente_id\"\"\n"}
```
Confirms a **~120s server-side `statement_timeout`** on whatever role the Management API executes as —
not documented anywhere I found, discovered empirically. **Fix:** delete the `ventas` rows directly by
their still-indexed `(gym_id, folio)` unique key first, then delete `clientes` (cascade now finds
nothing), then drop the test index last. v2 (above) ran in 30s.

### 1.2 A second finding: `DELETE` does not shrink `pg_database_size` — only `VACUUM FULL` does, and plain `VACUUM` needs a single-statement call

After the v2 cleanup's row counts all read zero, `pg_database_size` still read **252 MB**
(`{"size":"252 MB","bytes":264318099}`) — `DELETE` marks tuples dead, it doesn't return pages to the OS.
I ran `VACUUM FULL` per touched table, each as its own standalone single-statement call:

```
vacuum full public.ventas;          -- OK, 2,689 ms
vacuum full public.clientes;        -- OK, 1,258 ms
vacuum full public.gym_membership;  -- OK,   844 ms
vacuum full public.gym;             -- OK,   796 ms
vacuum full auth.users;             -- OK,   897 ms
```
`pg_database_size` after: **13 MB** (`13,593,747` bytes) — matches E6's own cited pre-seed baseline
exactly, confirming both agents were measuring the same true empty-schema floor.

**A plain (non-FULL) `VACUUM` bundled into the same multi-statement call as other cleanup work failed
with a raw `ECONNRESET`/`fetch failed`** the first time I tried it (no clean SQL error surfaced — a
Management-API-level failure, not a Postgres one). Re-isolated afterward: the real cause is that
**any multi-statement call to this endpoint runs as an implicit transaction block**, and `VACUUM` (plain
or `FULL`) cannot run inside one:
```sql
-- as one of several statements in a call: 
vacuum public.gym; select 1 as ok;
-- ERROR: 25001: VACUUM cannot run inside a transaction block
-- (clean 400, this time -- the earlier ECONNRESET on the same underlying error is itself a minor API-quirk worth flagging)
```
```sql
-- as the ONLY statement in a call:
vacuum public.gym;
-- OK, 0 rows -- succeeds
```
**Actionable for every future scratch session:** `VACUUM`/`VACUUM FULL` must be their own standalone
API call, never batched with other SQL. `VACUUM FULL` is what actually recovers `pg_database_size`
toward the 500 MB cap — `DELETE` alone will make row counts read zero while the byte total barely moves,
which would have burned my whole budget on phantom space if I'd trusted row counts instead of re-checking
`pg_database_size` directly.

---

## 2. Schema facts checked before seeding (so the seed respects every constraint)

Pulled live from `information_schema.columns`, `pg_constraint`, and `pg_indexes` on scratch (not assumed
from the repo, since scratch may have drifted — it already had, per E1's dropped FK, confirmed below):

- `clientes_gym_id_fkey` → `gym(id)`, `clientes_auth_user_id_fkey` → `auth.users(id) ON DELETE SET NULL`
  — **enforced**, confirmed by triggering it (§3.1).
- `clientes_email_gym_uq` — `UNIQUE (gym_id, lower(email)) WHERE email IS NOT NULL` — **present**.
- `clientes_auth_user_id_per_gym` — `UNIQUE (gym_id, auth_user_id) WHERE auth_user_id IS NOT NULL` —
  **present**.
- `clientes_tel_10_digits_ck` — `CHECK (char_length(regexp_replace(tel,'\D','','g')) = 10)`.
- `ventas_folio_gym_uq` — `UNIQUE (gym_id, folio)`; `ventas_idem_gym_uq` — partial unique on
  `idempotency_key` (left NULL throughout, so never exercised).
- `ventas_vigencia_tipo_check` — `IN ('dias','mes')`; `ventas_metodo_check` — `IN ('efectivo',
  'transferencia','tarjeta')`.
- `gym_membership_pkey` — `(user_id, gym_id)`; `gym_membership_role_check` — `IN ('owner','operator',
  'member')`.
- **`gym_membership_user_id_fkey` is ABSENT** — confirmed by querying `pg_constraint` directly (not in
  the list of 4 FKs `gym_membership` actually has: only `gym_membership_gym_id_fkey` remains). This is
  E1's leftover, dropped for their RLS test and never restored. **Inherited, not something I did** — I
  designed around it (staff `gym_membership` rows use synthetic `user_id`s with no `auth.users` row,
  same posture E1 already established; only the *member* `gym_membership` rows, which mirror an
  activated `clientes.auth_user_id`, happen to have a real backing `auth.users` row).
- `auth.users` — only 3 columns are `NOT NULL`: `id`, `is_sso_user` (default `false`), `is_anonymous`
  (default `false`). A minimal `insert into auth.users (id) values (...)` is valid — confirmed by
  querying `information_schema.columns where is_nullable='NO'` before assuming.
- `asistencias`/`reservation` FKs cascade from both `clientes` and `class_session` — not exercised (§5).

---

## 3. The seed design (what "200 members, 60% activated" means concretely)

Per gym, per tier, all ids **deterministic** (`'a0000000-...-'||lpad(g*1000+m,12,'0')` etc.) so every
INSERT is self-contained — no temp tables, no cross-call state, safe against the Management API opening
a fresh connection per HTTP call (a blind spot E6 flagged; sidestepped entirely here):

| Table | Rows/gym | Rule |
|---|---|---|
| `clientes` | 200 | `nombre`, 10-digit synthetic `tel`; `email` set for 110/200 (~55%, roughly matching prod's measured ~47% coverage); `auth_user_id` set for 120/200 (60%) |
| `auth.users` | 120 | one row per activated member, `id` only, inserted *before* `clientes` (FK checks immediately, no deferred constraint — first attempt without this ordering failed, see §3.1) |
| `gym_membership` | 122 | 120 `member` rows (`user_id = clientes.auth_user_id`) + 1 `owner` + 1 `operator` (synthetic `user_id`, no `auth.users` row — see §2) |
| `ventas` | 2,400 | 12/member × 200 members (**all** members transact, activated or not — matches prod, where a sale doesn't require the buyer to have a login) |
| `asistencias`, `reservation` | 0 | not seeded, see §5 |

`created_at` on `clientes` is spread across ~360 days per gym (`m`=1 oldest, `m`=200 newest), so the
**low-activation (4.3%) regime is a documented, reproducible nested slice of the 60% high-activation
seed** — no second gym population needed, per the mandate's own "seed high and let measurers filter"
option:
```sql
select * from clientes where gym_id = <g> and auth_user_id is not null
order by created_at asc limit ceil(0.043 * 200);   -- = 9 rows, verified below
```

### 3.1 A finding: insert order matters for the same reason cleanup order did

First tier-1 attempt inserted `clientes` (with `auth_user_id` already set) *before* `auth.users`:
```
FAILED (400) after 1042ms:
{"message":"...ERROR:  23503: insert or update on table \"clientes\" violates foreign key constraint
\"clientes_auth_user_id_fkey\"\nDETAIL:  Key (auth_user_id)=(b0000000-...-000000001001) is not present
in table \"users\".\n"}
```
Reordered (`auth.users` insert moved before `clientes`) and reran — the whole multi-statement call is one
implicit transaction (§1.2), so the first failed attempt's `gym` inserts rolled back too; safe to just
rerun from a clean slate, confirmed by the tier-1 row counts matching exactly (below).

---

## 4. Tier-by-tier results — MEASURED

Generator: `gen-tier.mjs LO HI` emits the SQL for gym numbers `LO..HI` (new gyms only, additive).
Ranges: tier1 `1-50`, tier2 `51-100`, tier3 `101-250`, tier4 `251-500` (cumulative totals 50/100/250/500).
`ANALYZE` ran on all five seeded relations at the end of every tier (`measure.sql`).

| Tier | New gyms | Cumulative gyms | Seed wall-clock | `clientes` | `ventas` | `gym_membership` | `auth.users` |
|---|---|---|---|---|---|---|---|
| 1 | 1–50 | 52* | 7.60 s | 10,000 | 120,000 | 6,100 | 6,000 |
| 2 | 51–100 | 102* | 8.17 s | 20,000 | 240,000 | 12,200 | 12,000 |
| 3 | 101–250 | 252* | 26.19 s | 50,000 | 600,000 | 30,500 | 30,000 |
| 4 | 251–500 | 502* | 50.56 s | 100,000 | 1,200,000 | 61,000 | 60,000 |

*+2 for the pre-existing real `red`/`forge` gyms.

### Per-table bytes, measured after each tier's `ANALYZE` (`pg_total_relation_size` / `pg_relation_size`)

| Tier | `ventas` total (heap) | `clientes` total (heap) | `gym_membership` total (heap) | `auth.users` total (heap) | `gym` total | **DB size** |
|---|---|---|---|---|---|---|
| 1 (52 gyms) | 33 MB (18 MB) | 5,696 kB (3,072 kB) | 1,016 kB (464 kB) | 1,136 kB (400 kB) | 80 kB | **54 MB** |
| 2 (102 gyms) | 66 MB (37 MB) | 7,216 kB (3,072 kB) | 1,928 kB (920 kB) | 2,040 kB (800 kB) | 88 kB | **90 MB** |
| 3 (252 gyms) | 165 MB (92 MB) | 15 MB (7,672 kB) | 4,688 kB (2,288 kB) | 4,816 kB (2,000 kB) | 128 kB | **202 MB** |
| 4 (502 gyms) | 330 MB (184 MB) | 30 MB (15 MB) | 9,272 kB (4,568 kB) | 9,448 kB (4,000 kB) | 200 kB | **391 MB** |

**`ventas` scales cleanly linearly** with row count throughout (18→37→92→184 MB heap for
120k→240k→600k→1,200k rows — each doubling of rows almost exactly doubles heap bytes: 157.3 B/row
heap-only, stable across two orders of magnitude). **`clientes` does NOT scale linearly at small N** —
5,696 kB→7,216 kB for a doubling of rows (10k→20k) is only +26.7%, not +100%; by tier 3→4 (50k→100k) it's
much closer to linear (15 MB→30 MB, exactly 2×). Read as: small-table fixed overhead (index metapages,
partial-index bookkeeping) dominates below ~20k rows and washes out above it — a real, measured artifact
of *this* table's index shape (6 indexes incl. 3 partial uniques), not a general claim about Postgres.

**Tier 3's `ventas` heap (92 MB / 600,000 rows) landed on the exact same number E6 measured independently**
(92 MB / 600,003 rows, a single-gym artifact) — cross-validating both experiments' methodology even
though the two datasets are shaped completely differently (500-gym spread here vs. one-gym concentration
there). Good agreement, not a coincidence of round numbers: both are set-based `INSERT...SELECT` at the
same total row count, and `ventas`' per-row byte cost is independent of how the rows are distributed
across gyms.

### Final state (Tier 4 = the full mandate: 500 gyms, cumulative)

```json
{"gym":502,"gym_membership":61000,"clientes":100000,"ventas":1200000,"auth.users":60000}
```
```json
{"db_size":"391 MB","db_bytes":410274963}
```
**All four requested tiers (50/100/250/500) were reached. 109 MB of headroom remains under the 500 MB
cap** (391 MB used, vs. the mandate's own ~400 MB soft target — landed just under it without needing to
stop early).

### 4.1 Verification queries — the seed does what it claims

Activation count per gym, and the documented low-regime nested slice, both checked on `seed-gym-1`:
```sql
select count(*) from clientes where gym_id=(select id from gym where slug='seed-gym-1') and auth_user_id is not null;
-- 120  (60% of 200, exact)

select count(*) from (
  select id from clientes where gym_id=(select id from gym where slug='seed-gym-1') and auth_user_id is not null
  order by created_at asc limit ceil(0.043*200)
) s;
-- 9  (= ceil(0.043*200), confirms the nested-slice technique works as documented)
```
`gym_membership` role distribution, whole table:
```json
[{"role":"member","count":60000},{"role":"operator","count":500},{"role":"owner","count":500}]
```
`60,000 = 500 gyms × 120 activated` exactly. No cliente_id-leading index exists on `ventas` (confirms the
deliberate drop in §5 held):
```sql
select indexname from pg_indexes where tablename='ventas' and indexname like '%cliente%';
-- 0 rows
```

### 4.2 A bonus measurement, at real 500-gym scale (not just to validate the seed — this is a new data point)

The `mi_membresia()` anchor query, run directly against the full 1,200,000-row `ventas` table (no index,
matching prod's actual current state):
```sql
explain (analyze, buffers)
select fecha, created_at, monto, vigencia_tipo, vigencia_dias from ventas
where cliente_id = 'a0000000-0000-0000-0000-000000250001'
order by created_at desc, id desc limit 1;
```
```
Parallel Seq Scan on ventas (actual time=200.256..497.486 rows=6 loops=2)
  Filter: (cliente_id = ...)  Rows Removed by Filter: 599994  (×2 workers ≈ 1,199,988 ≈ table size)
  Buffers: shared hit=12302 read=11231
Execution Time: 540.969 ms
```
**541 ms at 500 gyms / 1.2M total rows (multi-tenant-distributed, not E6's single-gym concentration).**
This is a genuinely new measured point past the report's own "~53 gyms → +100 ms" and E6's "~53-gym-
equivalent → 104-126 ms" — both single-gym-shaped tests. At full realistic 500-gym scale the same
unindexed anchor query is **already ~5× the report's own headline number.** I flag this as a bonus,
not this agent's core mandate (a downstream measurement agent should own the systematic regime-2/3
sweep) — but it's sitting right here in the data I built, and it materially strengthens the "ship the
index" recommendation the report already makes, so I'm reporting it rather than leaving it for someone
else to notice.

---

## 5. What was deliberately NOT seeded, and why

**`asistencias` and `reservation` were left at 0 rows.** The mandate ranks them lowest priority ("skip
what does not serve a measurement") and names them "the biggest" — correctly: at the report's own
5.3 visits/member/month cadence, 500 gyms × 200 members × 12 months × 5.3 ≈ **6.36 million** `asistencias`
rows, which would dwarf the entire budget already spent on `ventas` (which itself needed 1.2M rows for
330 MB). With 109 MB of headroom remaining after Tier 4, there is room for a *small, single-tier* sample
if a downstream agent specifically needs `asistencias`/`reservation` shape — but seeding it "a little"
across all four tiers would not produce a usable ceiling measurement (the whole point of a tiered seed is
comparing regimes at the SAME density across G), and seeding it fully would blow the cap. No named
ceiling in the audit report specifically targets `asistencias`/`reservation` scan cost the way it does
`ventas.cliente_id` and the `gym_membership` OR-policy — both of which are now fully seeded and directly
measurable. I judged the trade honest and correctly prioritized; flagging it loudly rather than silently
skipping it.

**`ventas_cliente_created_id_idx` (E6's proof index) was dropped, not reused.** Prod does not have this
index. Leaving it in place would have made every downstream `ventas.cliente_id` measurement against this
seed *artificially fast* — hiding the exact ceiling this dataset exists to reproduce. §4.2 confirms the
drop held and the unindexed scan behaves as expected at scale.

**`gym_membership_user_id_fkey` was left dropped** (inherited from E1, not restored). Restoring it would
require either backfilling `auth.users` rows for all 1,000 synthetic staff accounts (cheap, ~$0 marginal
cost in disk) or accepting it stays absent for those rows specifically. I did not restore it because nothing in this mandate
exercises `gym_membership.user_id → auth.users` referential integrity — only `clientes.auth_user_id`'s
FK is ever hit by prod's real code paths (`mi_membresia()` reads `clientes.auth_user_id`, not
`gym_membership.user_id`, to resolve identity) — but a downstream agent testing `gym_membership` FK
behavior specifically should know this constraint is NOT enforced on scratch right now, unlike prod.

---

## 6. What's left on scratch for downstream measurement agents

- `public.gym`: 500 new rows, `slug like 'seed-gym-%'` (1-500), `brand_module_id` alternating
  `forge`/`red`, plus the 2 pre-existing real gyms (`red`, `forge`) untouched.
- `public.clientes`: 100,000 rows, deterministic id `a0000000-0000-0000-0000-<12-digit gnum*1000+m>`.
  60% (`m<=120`) have `auth_user_id` set; 55% (`m<=110`) have `email` set. `created_at` spread over
  ~360 days/gym, oldest-first — this ordering is what makes the 4.3%-regime nested slice work.
- `auth.users`: +60,000 rows, id `b0000000-...`, matching the activated `clientes.auth_user_id`s 1:1.
  Only `id` is set — every other column is default/NULL.
- `public.gym_membership`: +61,000 rows. 60,000 `member` (user_id = the matching activated cliente's
  `auth_user_id`), 500 `owner` (`c0000000-...`), 500 `operator` (`d0000000-...`) — the latter two have
  NO backing `auth.users` row (harmless, the FK is already absent — see §5).
  `gym_membership_user_id_fkey` remains dropped.
  `gym_membership_gym_id_fkey` remains `ON DELETE CASCADE` and intact.
- `public.ventas`: +1,200,000 rows, `folio` 1-2400 per gym (unique per `(gym_id,folio)`), 12/member,
  spread over the trailing 12 months from `now()`. `idempotency_key` is NULL throughout (never
  exercised the partial-unique constraint on purpose — no downstream mandate named it).
- `ventas_cliente_created_id_idx`: **dropped**, not recreated — deliberate, see §5.
- `public.asistencias`, `public.reservation`: untouched, 0 seed rows.
- Scratch db size: **391 MB** (started this session at 287 MB of *different* leftover data, dropped to
  13 MB after cleanup, built back up to 391 MB with this tier's data). **109 MB of headroom remains.**
- Helper scripts left in `.../scratchpad/seed/`: `run.mjs` (generic runner), `gen-tier.mjs` (tier SQL
  generator, reusable if a future agent wants a 5th tier or a different density), `00-cleanup.sql`,
  `measure.sql`, `sizes.sql`, `tier1-4.sql` (generated, exact SQL actually run).

---

## 7. Blind spots

1. **Member density is uniform (200/gym) and activation is a clean 60% cut, not a realistic
   distribution.** Real prod almost certainly has skew — some gyms much larger than others, activation
   clustering by cohort/invite-drive timing rather than a smooth 60/40 split. This seed is deliberately
   uniform so tier-to-tier comparisons isolate the effect of `G` alone; it will understate any ceiling
   that's sensitive to skew (e.g., one whale gym with 5,000 members, which E1's own seed *did* test in
   isolation for a different question).
2. **The low-activation (4.3%) regime is a nested *slice* of the 60% seed, not an independently-seeded
   population.** It reproduces the right *count* per gym for a `clientes`-side filter, but `gym_membership`
   itself was only ever populated at the 60% density — there is no separately-sized `gym_membership` table
   to compare a true 4.3%-activation *row count* against. If a future measurement needs the OR-policy
   ceiling specifically AT 4.3% `gym_membership` density (not just 4.3% of `clientes` filtered post-hoc),
   that's a different, unseeded population.
3. **`ventas.fecha`/`created_at` distribution is a flat 12-month sawtooth per member (`k*30` days back),
   not a realistic renewal-timing distribution** (no seasonality, no late-renewal drift, no cancellations).
   Fine for a raw table-size/scan-cost ceiling test; not fine if a downstream agent wants to test
   time-windowed query performance (`getResumenMes`-shaped month-boundary queries) — the data has no
   month-boundary clustering to stress that shape specifically.
4. **I did not re-verify RLS behavior against this new dataset** (E1 already proved the `gym_membership`
   policy mechanics on a differently-shaped 611k-row set; I didn't re-run that experiment against this
   500-gym/61k-row set specifically). If a downstream agent wants the OR-policy timing at exactly *this*
   tier's row counts, that measurement hasn't been taken yet — only the `ventas` anchor query (§4.2) was
   spot-checked here.
5. **The `statement_timeout` value itself (§1.1) was inferred from a single 120,883 ms failure, not
   directly read from `pg_settings`** — I know it's "close to 120s" empirically, not the exact configured
   number, and did not check whether it's a role-level, session-level, or Management-API-imposed limit.
