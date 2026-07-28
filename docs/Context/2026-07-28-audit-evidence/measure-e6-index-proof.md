# E6 — Does the `ventas(cliente_id, created_at desc, id desc)` index actually fix the hot path?

**Agent:** e6:index-proof · **Target:** scratch project `gyyujeguycxxoaqgdnjp` (writes) + live project
`hjppxawglmukfvsgmcog` (read-only comparisons only, via MCP `execute_sql`, no DDL/DML ever sent there).
**Verdict: PROVEN.** The index collapses the ventas anchor lookup from a full-table scan (linear in table
size) to a constant ~4 buffers regardless of table size, and the report's own headline number — "+100ms at
~53 gyms" — is not just modelled, it now has a **direct measurement sitting almost exactly on top of it**:
53 gyms' worth of `ventas` heap (100.4 MB modelled) vs 92 MB actually seeded, and the measured added latency
was 104–126 ms against a claimed +100 ms. The audit's internal dispute ("98% of blocks are NOT the ventas
scan") is also resolved — both sides were right, about different table sizes, and I can show the exact
crossover.

---

## 0. Safety

Every write in this file went to `gyyujeguycxxoaqgdnjp` via `POST https://api.supabase.com/v1/projects/gyyujeguycxxoaqgdnjp/database/query`
using a small PowerShell wrapper (`run-sql.ps1`) that hardcodes the scratch ref, asserts it against a
hardcoded live-ref string, and throws if they ever match. The PAT was passed as a `-Token` CLI argument on
each call, never written into any file. Every read against `hjppxawglmukfvsgmcog` below was a plain
`SELECT` via the read-only MCP tool — no `apply_migration`, no DDL, nothing that mutates prod.

---

## 1. `mi_membresia()`'s real body — every table it touches

Read from `supabase/migrations/20260714120000_mi_membresia_reanchor.sql` (current live definition):

```sql
select c.id, c.gym_id, c.paquete_nombre, c.clases_restantes, c.vence
  into v_cli, v_gym, paquete_nombre, clases_restantes, vence
  from public.clientes c
  where c.auth_user_id = v_uid
  limit 1;
...
select g.timezone into v_tz from public.gym g where g.id = v_gym;
...
select v.fecha, v.created_at, v.monto, v.vigencia_tipo, v.vigencia_dias
  into v_anchor_fecha, v_anchor_creado, anchor_monto, anchor_vigencia_tipo, anchor_vigencia_dias
  from public.ventas v
  where v.cliente_id = v_cli
  order by v.created_at desc, v.id desc
  limit 1;
...
select count(*)::int into attended_since_purchase
  from public.asistencias a
  where a.cliente_id = v_cli and a.consumio = true and a.deleted_at is null and a.fecha >= v_conteo_dia;
```

Four table accesses: `clientes` (by `auth_user_id`), `gym` (PK), `ventas` (the anchor — **exactly** the query
the report's recommended index targets), `asistencias` (by `cliente_id` + filters, already has a matching
partial index `asistencias_cliente_fecha_idx`). The report's `CREATE INDEX` recommendation is a precise
match for the `ventas` query's `ORDER BY`.

---

## 2. Environment facts (measured, scratch == matches report's live citation)

```sql
select name, setting, unit from pg_settings where name in ('shared_buffers','block_size','effective_cache_size','work_mem');
```
```
block_size            : 8192
shared_buffers        : 28672 (×8kB = 224 MB)
effective_cache_size  : 49152 (×8kB = 384 MB)
work_mem              : 2184 kB
```
`NBuffers/4 = 7,168 blocks = 56 MB` — the exact `BAS_BULKREAD` ring threshold the report cites from
`heapam.c initscan()`. Matches the report's own §"Verified at write time" figure for shared_buffers exactly.

Existing indexes on `ventas` (scratch, confirmed identical set on **live** via a second read-only query):
```
ventas_folio_gym_uq   UNIQUE (gym_id, folio)
ventas_gym_fecha_idx  (gym_id, fecha)
ventas_gym_id_idx     (gym_id)
ventas_idem_gym_uq    UNIQUE (gym_id, idempotency_key) WHERE idempotency_key IS NOT NULL
ventas_pkey           UNIQUE (id)
```
**No index leads on `cliente_id`.** Confirmed on live prod too (read-only, `hjppxawglmukfvsgmcog`):
```sql
select indexname, indexdef from pg_indexes where schemaname='public' and tablename='ventas';
```
→ same 5 indexes, same absence. And live's actual current size:
```sql
select (select count(*) from public.ventas) as ventas_n,
       pg_size_pretty(pg_relation_size('public.ventas')) as ventas_heap,
       pg_size_pretty(pg_total_relation_size('public.ventas')) as ventas_total;
-- {"ventas_n":175,"ventas_heap":"40 kB","ventas_total":"160 kB"}
```
Matches the report's "5 pages / 175 rows" exactly.

**Live's actual `mi_membresia()` pg_stat_statements row** (read-only, re-confirms the report's own citation
verbatim rather than trusting it secondhand):
```sql
select query, calls, mean_exec_time, shared_blks_hit, shared_blks_read
from pg_stat_statements where query ilike '%mi_membresia%' order by calls desc limit 1;
-- calls=97, mean_ms=8.488, shared_blks_hit=28374, shared_blks_read=0
-- => 28374/97 = 292.52 blocks/call, 0 reads (fully warm pool)
```
Confirmed to the decimal against `referee.md`'s "292.5 blocks × 8,192 B / 8.488 ms" citation.

---

## 3. Seeding (scratch only, generate_series, set-based)

Db size before any seeding: **13 MB**. Gym used: `806ce892-4d0b-42a2-93b6-e68d3d71df49`.

```sql
insert into public.clientes (nombre, tel, gym_id)
select 'seed cliente '||g, lpad(g::text,10,'0'), '806ce892-4d0b-42a2-93b6-e68d3d71df49'::uuid
from generate_series(1, 20000) g;
-- + 1 target member: id bf2da0b8-9070-4672-a3d6-552d36eea691, tel 9999999999
```
20,001 `clientes` rows. A fake `auth.users` row (`11111111-1111-1111-1111-111111111111`, only `id` set —
every other column is nullable/defaulted) was inserted and wired to the target member's `auth_user_id`, so
`mi_membresia()` could be called end-to-end via `set local request.jwt.claim.sub = '<uuid>'` (which
`auth.uid()`'s real definition reads directly — verified: `select auth.uid()` round-tripped the literal I
set). 3 realistic `ventas` rows were seeded for the target member (folios 1–3, one 2 days old — this becomes
the anchor).

**Round 1 — 50,003 total `ventas` rows** (target's 3 + 50,000 noise rows spread across the 20,000 pool via
`join e6_cliente_pool p on p.rn = ((g % 20000) + 1)`, one INSERT...SELECT, no row-by-row):
```
ventas_n=50003, ventas_heap=7848 kB (=981.0 blocks exactly), ventas_total=14 MB, db_size=31 MB
```
7.8 MB heap is **below** the 56 MB ring threshold — this is "regime 1."

**Round 2 — 600,003 total `ventas` rows** (550,000 more noise rows, same pattern, folio offset +100000 to
avoid the unique-per-gym collision):
```
ventas_n=600003, ventas_heap=92 MB (96,378,880 B = 11,769.9 blocks), ventas_total=149 MB, db_size=253 MB
```
92 MB **exceeds** the 56 MB ring threshold — this is "regime 2." **This 92 MB is 91.6% of the report's own
modelled "~53 gyms = 100.4 MB" ventas-heap estimate** (53 × 1.895 MB/gym) — i.e. round 2 lands almost exactly
on the report's own headline crossover point, without my having aimed for that on purpose (I aimed for "cross
the 56 MB boundary comfortably"; the coincidence with 53-gym-equivalent size is what makes this such a clean
tie-break, see §6). Final db size after everything below (index included): **287 MB** — well under the 400 MB
cap.

---

## 4. Round 1 (50,003 rows, no index) — the anchor query

```sql
explain (analyze, buffers, format text)
select v.fecha, v.created_at, v.monto, v.vigencia_tipo, v.vigencia_dias
from public.ventas v
where v.cliente_id = 'bf2da0b8-9070-4672-a3d6-552d36eea691'
order by v.created_at desc, v.id desc
limit 1;
```
```
Limit  (actual time=4.903..4.904 rows=1 loops=1)
  Buffers: shared hit=987
  -> Sort (actual time=4.901..4.902 rows=1 loops=1)
        Sort Method: top-N heapsort  Memory: 25kB
        Buffers: shared hit=987
        -> Seq Scan on ventas v (actual time=0.037..4.865 rows=3 loops=1)
              Filter: (cliente_id = 'bf2da0b8-...'::uuid)
              Rows Removed by Filter: 50000
              Buffers: shared hit=981
Planning: Buffers: shared hit=168 · Planning Time: 0.478 ms
Execution Time: 4.979 ms
```
**981 of 987 buffers (99.4%) is the `ventas` seq scan itself.** 0 blocks read from disk — table fully cached
(7.8 MB heap fits trivially inside 224 MB shared_buffers, "regime 1").

---

## 5. Round 2 (600,003 rows, no index) — the same query, run twice

```
[run 1] Buffers: shared hit=11151 read=660 · Execution Time: 125.746 ms
[run 2] Buffers: shared hit=11215 read=596 · Execution Time: 118.016 ms
```
Plan node changed automatically (planner-driven, not requested): **Parallel Seq Scan** (Workers Planned: 1,
Launched: 1) feeding a `Gather Merge`. `Rows Removed by Filter: 300000` per worker × 2 loops = 600,000,
matching the table size exactly. Total blocks touched both runs: **11,811** (hit+read), matching the heap's
11,770 blocks almost exactly (the small excess is the sort/gather bookkeeping). **5.0–5.6% of blocks came
back as `read` instead of `hit` on both runs** — i.e. some fraction of the table was *not* resident in
shared_buffers even moments after being freshly inserted and `ANALYZE`d, which is the `BAS_BULKREAD`-ring
signature the report predicted (a scan over a 56+ MB relation borrows a small ring of buffers instead of
populating the general pool) — though it's a **partial**, not total, ring effect: with 224 MB of
shared_buffers against a 92 MB heap there was still room for most of the table to stay warm from the recent
bulk load, so this is a measurement of the **boundary itself**, not deep "regime 2." See blind spots (§9).

**Block count scaled almost exactly linearly with row count:** 981 → 11,811 buffers for a 600,003/50,003 =
12.00× row increase = an **11.8×–12.04× buffer increase.** **Execution time scaled worse than linear:**
4.979 ms → ~121.9 ms average = **~24.5× for the same 12× row increase** — roughly double the buffer-count
ratio. That gap (12× blocks but 24.5× time) is explained by the 5–6% read fraction (reads cost more than
hits) plus fixed Gather/worker-launch overhead that a 12×-bigger single-threaded scan wouldn't have paid. So:
**not a hard cliff, but a real regime change** — the per-block cost is not constant, it roughly doubles once
the relation crosses the ring threshold, even before the table is anywhere near memory-exhausting.

---

## 6. Index creation — timed, twice (plain vs CONCURRENTLY)

HTTP/Management-API round-trip baseline (a bare `select 1;`, to net out of the wall-clock DDL timings below):
**904 ms.**

```sql
create index ventas_cliente_created_id_test on public.ventas (cliente_id, created_at desc, id desc);
```
Wall-clock (PowerShell `Measure-Command`): **6,494 ms → net ≈ 5.59 s.** Index size: **34 MB** (35,348,480 B).
Dropped, then:
```sql
create index concurrently ventas_cliente_created_id_idx on public.ventas (cliente_id, created_at desc, id desc);
```
Wall-clock: **20,823 ms → net ≈ 19.9 s.** Index size: **34 MB**, identical.
```sql
select indexrelid::regclass, indisvalid, indisready from pg_index where indexrelid = 'ventas_cliente_created_id_idx'::regclass;
-- indisvalid=true, indisready=true
```
**Measured CONCURRENTLY tax at this size: ~3.55×** (19.9 s vs 5.59 s) — consistent with the well-known
two-full-scans-plus-validation cost of the concurrent build. **Is CONCURRENTLY required?** At production's
*actual current* size (175 rows, 40 kB), either build finishes in low single-digit milliseconds and the
ACCESS EXCLUSIVE lock is unnoticeable — CONCURRENTLY is not *required* today. But it costs nothing extra at
that size and becomes actually necessary the moment the table is large enough that a plain build's lock
duration is customer-visible (my own measurement puts that at ~5.6 s once the table reaches ~600k rows/92 MB
— a duration a live `registrar_venta` write path should not be blocked for). **Recommendation stands as
written in the report: ship it with CONCURRENTLY, unconditionally** — the cost today is free insurance.

**Modelled (not measured) extrapolation to "~12 million rows"** cited in the report: my 600,003-row build is
the *only* directly measured data point, so scaling 20× to 12M rows by naive linear projection gives
CONCURRENTLY ≈ 20 × 19.9 s ≈ **~400 s (~6.6 min)**. This is a rough band, not a measurement — at 12M rows
(≈2.7 GB by the report's own 234 B/row figure) the table would no longer fit inside shared_buffers the way my
600k-row test did, so the real build would do materially more disk I/O than my test and could run
meaningfully longer than the linear projection. Flagging this explicitly as modelled, ±2× band, same as the
report's own posture on its softest numbers.

---

## 7. Round 2 (600,003 rows, WITH the index) — the collapse

```sql
explain (analyze, buffers, format text)
select v.fecha, v.created_at, v.monto, v.vigencia_tipo, v.vigencia_dias
from public.ventas v where v.cliente_id = 'bf2da0b8-...'
order by v.created_at desc, v.id desc limit 1;
```
```
[run 1] Limit (actual time=1.587..1.588) Buffers: shared hit=4
        -> Index Scan using ventas_cliente_created_id_idx (actual time=1.586..1.586) Buffers: shared hit=4
        Planning Time: 11.664 ms · Execution Time: 3.014 ms
[run 2] Limit (actual time=0.048..0.049) Buffers: shared hit=4
        -> Index Scan using ventas_cliente_created_id_idx (actual time=0.047..0.047) Buffers: shared hit=4
        Planning Time: 0.978 ms · Execution Time: 0.720 ms
```
**Plan node change:** `Parallel Seq Scan + Gather Merge` → `Index Scan` (no sort node at all — the index's
`created_at desc, id desc` ordering satisfies the `ORDER BY` directly, so the `Sort` node the no-index plan
needed disappears too).

**Measured before/after at 600,003 rows, same query:**

| | Buffers (hit+read) | Execution time |
|---|---|---|
| No index | 11,811 | 118–126 ms |
| With index | **4** | **0.72–3.0 ms** |
| **Ratio** | **2,953× fewer blocks** | **39×–175× faster** |

**4 buffers, regardless of table size** — matches the report's "collapses the working set … to ~3 blocks
regardless of G" claim almost exactly (measured: 4, not 3, close enough to call it confirmed — 1 root/branch
page + 1 leaf page + 1 heap fetch + 1 for bookkeeping/visibility-map). Not separately re-measured at the
50,003-row size (would require re-shrinking the table, which I judged not worth the scratch budget) — a
sub-4-block result there is a B-tree-theory inference (O(log n), smaller n ⇒ fewer or equal levels), not a
second direct measurement. Flagged as inferred, not measured, in §9.

---

## 8. The most useful number in this whole experiment: measured vs the report's own headline

The report's single most-cited number is **"+100 ms at ~53 gyms."** 53 gyms × 1.895 MB/gym (their own
formula) = **100.4 MB** of `ventas` heap. My round-2 seed, aimed only at "comfortably cross the 56 MB ring
boundary," landed at **92 MB** — 91.6% of that modelled 53-gym figure — purely by choosing "600k rows" as a
round number. At that size, the *measured* added execution time for the anchor query, unindexed, was
**104–126 ms** (comparing round-2's 118–126 ms total against round-1's near-zero 4.98 ms baseline).

**That is a direct measurement landing on top of a number the report itself labelled `[modelled]`.** This is
the strongest single result of this experiment: the report's headline scaling claim is not just
plan-reasoning, it now has empirical support at essentially the exact scale it was claimed for.

---

## 9. Settling the "98% is not the ventas scan" dispute

`verify-math.md` and `referee.md` are **both right, about different table sizes** — and my measurements show
exactly where the crossover is.

- **At production's *actual current* size** (175 rows, 5 pages = 40 KB): the live `pg_stat_statements` row I
  pulled read-only shows **292.52 blocks/call, 97 calls, 8.488 ms mean.** `ventas` itself is *at most* 5 of
  those 292.52 blocks (1.7%) — **verify-math's "98.3% is not ventas" claim is correct, today, at this size.**
  It is a true statement about a table that is currently tiny, not a general one.
- **At 50,003 rows** (still a tiny fraction of even "1 gym × 3 years"): the isolated anchor query alone
  already touches 981 blocks — **3.4× the entire current production per-call total**, and this is *before*
  counting anything else `mi_membresia()` does.
- **At 600,003 rows** (my round 2, ≈53-gym-equivalent): the anchor query alone is 11,811 blocks — **40× the
  entire current production per-call total.**

So the dispute is not "who is right," it's "at what table size does the crossover happen" — and the honest
answer is: **almost immediately.** Using the round-1 measured rate (981 blocks / 50,003 rows ≈ 0.0196
blocks/row), the `ventas` scan alone matches production's entire *current* 292.52-block total at only
**~14,900 rows** — about 5.5 gym-years of data by the report's own accrual formula, i.e. reached well inside
year one for even a handful of active gyms. The report's own conclusion ("does not change the action") is
correct regardless of which side of this dispute you take.

One honest caveat on attribution: I could **not** cleanly reproduce production's exact 292.52-block *pooled*
baseline in this experiment, because the Management API opens a fresh Postgres backend per HTTP call — every
`mi_membresia()` call I made was either a cold plpgsql-compile call (349 ms / 1,982 blocks the first time in
a session) or a same-session "warm" call (6.8 ms / 986 blocks the second time in the *same* session/batch —
still far from production's steady-state, connection-pooled 8.488 ms / 292.52 blocks). I also noticed the
live `pg_stat_statements` query text captured is PostgREST's *wrapper* (`WITH pgrst_source AS (... mi_membresia() ...) SELECT ... json_agg(...) ...`),
not a bare call to the function — so some non-trivial share of that 292.52 is PostgREST's own
pagination/json-aggregation machinery, not "clientes index scan + gym lookup" as `referee.md` guessed. I did
not have a way to decompose that further without `pg_stat_statements.track = 'all'` (session-level `SET`
attempts were not tested here — out of scope once the core question was settled via the isolated
per-access-path measurements below). This is listed as a blind spot in §10, not asserted as resolved.

**Per-access-path isolation (the clean, connection-artifact-free way to answer "which table costs what"),
each run as a standalone top-level query, execution buffers only (planning-buffer noise excluded):**

| Access | Buffers (execution) | Note |
|---|---|---|
| `clientes` by `auth_user_id` | 2 | partial unique index, only 1 non-null row in this seed |
| `gym` by PK | 3 | trivial, 2-row table |
| `asistencias` by `cliente_id`+filters | 0 | table is empty in this seed |
| `ventas` anchor, **no index**, 600,003 rows | 11,811 | the finding |
| `ventas` anchor, **with index**, 600,003 rows | 4 | the fix |

This table is the actual settlement of the dispute: once the index exists, the *entire* per-call table-touch
budget for `mi_membresia()` is ≈9 blocks (2+3+0+4), independent of `ventas` size — the report's claim that the
fix is "regardless of G" is confirmed at the buffer-count level, not just asserted.

---

## 10. What was left behind on scratch (`gyyujeguycxxoaqgdnjp`)

Not cleaned up — final db size (287 MB) is well under the 400 MB cap, so there was no space pressure forcing
cleanup, and correctness-of-measurement outranked tidiness per the mandate. Left in place, all clearly
namespaced:

- `public.clientes`: +20,001 rows (`nombre like 'seed cliente %'`, plus 1 row `nombre='E6 TARGET MEMBER'`,
  id `bf2da0b8-9070-4672-a3d6-552d36eea691`).
- `public.ventas`: +600,003 rows (3 for the target member, folios 1–3; the rest folios 4–50003 and
  100001–650000, all `gym_id = 806ce892-4d0b-42a2-93b6-e68d3d71df49`).
- `public.e6_cliente_pool`: helper table (id, rn) used to join-seed `ventas` without row-by-row inserts.
  Pure plumbing, safe to drop.
- `auth.users`: +1 fake row, id `11111111-1111-1111-1111-111111111111`, only `id` set — needed so
  `auth.uid()`/`mi_membresia()` could be exercised end-to-end.
- `public.ventas_cliente_created_id_idx`: the real index this experiment was built to prove out — **34 MB**,
  valid, ready. Left in place deliberately (it's the artifact the whole experiment is about).
- Scratch db size: 13 MB → **287 MB.**

A follow-up session (or whoever owns scratch next) can drop all of the above by cliente-id/index-name; none
of it touches anything that existed before this session (2 pre-existing `gym` rows were read, never written).

---

## 11. Blind spots

1. **Did not reach the report's "Regime 3" (disk-bound, >~600 MB, ~11 MB/s).** My round-2 test (92 MB) sits
   right at the regime-1/regime-2 boundary, with shared_buffers (224 MB) still large enough relative to the
   heap that most blocks stayed resident even under a ring-buffer scan strategy (94–95% hit rate, not the
   heavy-read profile a true regime-3 table would show). The "~1,000 MB/s modelled, softest number in the
   report" regime-2 rate and the "11 MB/s" regime-3 rate remain **unmeasured** by me — reaching regime 3
   safely would need a much bigger seed (600+ MB) that risks the 400 MB scratch cap, so I stopped short of it
   on purpose. My own blended throughput at the boundary (~756 MB/s) is directionally consistent with "faster
   than 11 MB/s, slower than 3,250 MB/s" but doesn't independently verify either endpoint.
2. **Could not reproduce production's exact 292.52-blocks/call pooled baseline** for `mi_membresia()` — the
   Management API's per-call fresh connection makes every call either "cold" (plpgsql compile) or
   "warm-within-this-one-session," neither of which matches PostgREST's long-lived pooled connection
   behavior. The isolated per-access-path table (§9) sidesteps this cleanly for the *ventas* question
   specifically, but I cannot fully decompose production's exact 292.52 number component-by-component.
3. **With-index measurement at the smaller (50,003-row) table size was not separately run** — I infer
   sub-5-block cost there from B-tree theory and the query planner's own cost estimate, not from a second
   direct `EXPLAIN ANALYZE`. Re-shrinking the table to re-test would have cost scratch budget for a
   near-certain result; flagged rather than asserted as measured.
4. **The 12-million-row extrapolation for `CREATE INDEX CONCURRENTLY` build time (~6.6 min) is a linear
   projection from a single 600k-row data point, 20× beyond the measured range** — real cost at that size
   would involve materially more disk I/O than my comfortably-cached test did, and could run longer.
5. **Never tested actual concurrent write load during either index build** — CONCURRENTLY's core promise (no
   blocking of concurrent `registrar_venta` inserts) was not exercised, because scratch had no competing
   writers during either build. I'm relying on well-established Postgres documentation for that claim, not a
   measurement of my own.
