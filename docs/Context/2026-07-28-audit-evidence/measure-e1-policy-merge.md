# E1 — Does merging the two `gym_membership` SELECT policies restore the index? MEASURED on scratch.

**Agent:** `e1:policy-merge` · **Target:** SCRATCH `gyyujeguycxxoaqgdnjp` only (writes), read-only spot-checks
against LIVE `hjppxawglmukfvsgmcog` for the baseline shape. **All numbers below are MEASURED** (`EXPLAIN
ANALYZE`, real timings, real row counts), not modelled. Where I compare to the report's modelled numbers I
say so explicitly.

**Headline: the report's top recommendation is WRONG for the query it is meant to fix. Merging the two
`gym_membership` SELECT policies (candidate A) delivers ZERO measured improvement on the actual unfiltered
`resolverMiembroGym`-shaped read — it is statistically indistinguishable from the two-policy baseline (both
~8–11 seconds at 611,000 rows; one merged sample even ran slower). It CANNOT create an Index Scan, structurally,
regardless of merge or order, because `is_staff_of()` is not sargable. The fix that actually works is candidate
B (`.eq("user_id", uid)` at the call site) — already known from live-prod EXPLAINs, now confirmed at real scale
on scratch with a >12,000× measured speedup (8,123ms → 0.657ms) and a genuine `Index Scan` on
`gym_membership_pkey`. The report should recommend B, drop A as a "nice to have, harmless" edit or drop it
entirely, and never ship C or D.**

---

## 0. Method

Built a `01-seed.sql`-seeded scratch copy of `gym_membership`: **3,000 synthetic gyms** (`gym.slug like
'synth-gym-%'`, real rows, satisfies the real `gym_id` FK) **× ~200 members + 1 owner + 1 operator each**,
plus one deliberately oversized gym (+5,000 extra members) to test the staff-roster-read case, for **611,000
total `gym_membership` rows**. The `user_id → auth.users` FK was **dropped** (not disabled — disabling the
internal RI trigger needs superuser, which the Management-API role isn't) to avoid seeding 611,000 real
`auth.users` rows; this is harmless for RLS-predicate testing and is the one structural leftover on scratch
(noted again in §7). Confirmed via `pg_policies` that scratch's live two policies are byte-identical to prod's
(same `qual` text) before touching anything.

Every `EXPLAIN (ANALYZE)` below ran inside `begin; select set_config('request.jwt.claims', …); set local role
authenticated; …; rollback;` — the same pattern `supabase/tests/*.sql` uses — so RLS was genuinely enforced,
not bypassed by the Management API's owner-role connection.

Two test identities: a **member** of a normal-sized gym (`c92b2599-…`, gym with ~200 members) and the **owner**
of the oversized gym (`9e6c4e52-…`, gym with 5,202 members) — covering both "member reads own gym" (Q1's real
shape) and "staff reads own roster" (the report's §7-item-#2 scenario).

---

## 1. Baseline — reproduce the current (live) two-policy plan on real data

Live policies, confirmed identical to prod:
```sql
select policyname, permissive, roles, cmd, qual from pg_policies where tablename='gym_membership';
-- gym_membership_self_select  | PERMISSIVE | {authenticated} | SELECT | (user_id = ( SELECT auth.uid() AS uid))
-- gym_membership_staff_select | PERMISSIVE | {authenticated} | SELECT | ( SELECT is_staff_of(gym_membership.gym_id) AS is_staff_of)
```

Query (mirrors `resolverMiembroGym` / `getOperatorGym`'s shape — no `WHERE`, RLS supplies the only predicate):
```sql
explain (analyze, verbose, buffers, timing, summary)
select gym_id, created_at from public.gym_membership order by created_at asc;
```

**As MEMBER** (611,000 rows in table):
```
Sort (actual time=8103.036..8103.076 rows=1 loops=1)
  ->  Seq Scan on public.gym_membership (actual time=3.205..8101.101 rows=1 loops=1)
        Filter: ((SubPlan 1) OR (gym_membership.user_id = (InitPlan 2).col1))
        Rows Removed by Filter: 610999
        SubPlan 1
          ->  Result (actual time=0.013..0.013 rows=1 loops=611000)
                Output: is_staff_of(gym_membership.gym_id)
Execution Time: 8122.998 ms
```
`is_staff_of()` fires **611,000 times** — every row, confirmed by `loops=611000` (this is the loop-count evidence
the prior reports explicitly said they couldn't get without `ANALYZE`). Repeated 2 more times for noise: **8,123
/ 10,501 / 10,550 ms** (mean 9,725ms, ~15.9µs/call — same order of magnitude as `arch-authz.md`'s independently
measured 16.75µs/call).

**As STAFF** (owner of the 5,202-row gym): same mechanism, `is_staff_of` still fires **611,000 times** (not
bounded to their own gym — the OR forces evaluation on every row regardless of caller type):
```
Seq Scan (actual time=0.595..8925.614 rows=5202 loops=1)
  Filter: ((SubPlan 1) OR (user_id = (InitPlan 2).col1))
  SubPlan 1 -> Result (actual time=0.014..0.014 rows=1 loops=611000)
Execution Time: 8944.036 ms
```
Repeated: **8,925 / 11,202 ms**. **Confirms the mechanism identically for both member and staff callers** — this
matters for §2.

---

## 2. Candidate A — merge into ONE policy, cheap arm (`user_id=uid`) first

```sql
drop policy gym_membership_self_select on public.gym_membership;
drop policy gym_membership_staff_select on public.gym_membership;
create policy gym_membership_select_merged on public.gym_membership
for select to authenticated
using ( (user_id = (select auth.uid())) or is_staff_of(gym_id) );
```

Re-ran the identical unfiltered query, 3× as member, 2× as staff:

| Run | Member (ms) | Staff (ms) |
|---|---|---|
| 1 | 24,982 | 16,594 |
| 2 | 9,484 | 13,660 |
| 3 | 8,806 | — |
| baseline range (2-policy) | 8,123–10,550 | 8,925–11,202 |

**Plan shape, both cases, unchanged in kind**: still `Seq Scan`, `Filter: ((user_id=uid) OR is_staff_of(gym_id))`,
`Rows Removed by Filter: 610999` / `605798` — **no Index Scan, no Index Only Scan, ever.** `is_staff_of` fires on
essentially every row either way.

**Why merging cannot help here, derived and then confirmed empirically:** `is_staff_of(gym_id)` is not sargable
(no index can satisfy a function-call predicate), so an OR against it forces a full scan **regardless of
operand order** — reordering can only skip the *expensive* arm when the *cheap* arm is frequently `TRUE`. The
`58×` figure in `arch-authz.md §2.4` was measured on a synthetic predicate (`g > 0`, unconditionally true) — not
analogous to the real cheap arm (`user_id = <one specific uuid>`), which is `TRUE` for exactly 1–2 rows out of
611,000. Short-circuiting on 1–2 rows out of 611,000 is statistical noise, not a 58× win, and the measurements
above confirm it: **3 of 5 merged samples fall inside the un-merged baseline's own noise band, and 2 fall well
above it. Nothing here supports "merging restores the index" or "merging delivers the 58× win" — both claims in
the report are false for the query they're meant to fix.**

**Verdict on A: NO measured benefit. Do not ship on its own. The report's characterization of this as "the
difference between a controllable and uncontrollable evaluation order" worth pursuing is not supported by
measurement on the query that matters (Q1/Q1b/Q2 — the unfiltered reads). It might still be defensible as a
zero-cost tidiness commit (one policy instead of two, functionally equivalent), but it is not a performance fix
and should not be sold as one.**

---

## 3. Candidate B — `.eq("user_id", uid)` at the call site

Reverted to the original two-policy shape (unmerged — B doesn't touch RLS at all), then added the predicate the
report says the TypeScript call sites are missing:
```sql
explain (analyze, verbose, buffers, timing, summary)
select gym_id, created_at from public.gym_membership
where user_id = 'c92b2599-2252-44b9-ad9e-eee7ceb8ff34'   -- member
order by created_at asc;
```
```
Sort (actual time=0.588..0.589 rows=1 loops=1)
  ->  Index Scan using gym_membership_pkey on public.gym_membership (actual time=0.545..0.546 rows=1 loops=1)
        Index Cond: (gym_membership.user_id = 'c92b2599-…'::uuid)
        Filter: ((SubPlan 1) OR (user_id = (InitPlan 2).col1))
        Buffers: shared hit=85
Execution Time: 0.657 ms
```
Same result for the staff identity (`Execution Time: 0.678 ms`, `Index Scan using gym_membership_pkey`,
`Buffers: shared hit=85`, `InitPlan … (never executed)` — the redundant `user_id=uid` in the residual OR filter
is skipped entirely because the Index Cond already satisfied it).

**Measured speedup: 8,123ms → 0.657ms = 12,364× (conservative floor, using baseline's minimum sample);
up to ~38,000× against the merged config's worst sample (24,982ms).** `Buffers: shared hit=85` vs
`shared hit=1,839,002` for the unfiltered scan — a real `Index Scan`, the planner's own choice at 611,000 rows
(no `enable_seqscan=off` hint needed), confirmed at realistic scale, not just the 9-row live table.

**Verdict on B: this is the fix. Zero DDL (confirmed: `gym_membership_pkey` already leads on `user_id` on
scratch, matching prod), ~3 lines of TypeScript per call site, and it is the only candidate that changes the
plan shape at all.**

---

## 4. Candidate C — rewrite `is_staff_of` as a plain SQL, STABLE, non-definer, "inlinable" function

```sql
create or replace function public.is_staff_of_inline(p_gym uuid)
returns boolean language sql stable cost 10
as $$
  select exists (
    select 1 from public.gym_membership
    where user_id = (select auth.uid()) and gym_id = p_gym and role in ('owner','operator')
  );
$$;
```

**4.1 — Does it actually inline? No.** Isolated the question with two extra probes:
- `trivial_true(gym_id)` (`select true`, no subquery) — **did inline**, in fact constant-folded away entirely
  (`Index Only Scan …` with no `Filter` clause at all — the WHOLE predicate vanished). Confirms the inlining
  machinery itself works in this instance.
- `gym_exists_check(gym_id)` (`select exists(select 1 from public.gym g where g.id=p_gym)` — EXISTS against an
  **unrelated** table, no self-reference) — **did NOT inline**: `Filter: gym_exists_check(gym_membership.gym_id)`
  appears as an opaque `FuncExpr`, exactly like `is_staff_of_inline`.

**This settles it: the EXISTS-subquery shape itself is what blocks Postgres's automatic SQL-function inlining,
independent of `SECURITY DEFINER` and independent of self-reference.** Removing `SECURITY DEFINER` from
`is_staff_of` does **not** make it inlinable, contrary to the premise of candidate C as stated. The report's
"nobody has proposed rewriting it as inlinable" framing implies this is achievable with a body shape like the
current one; it is not.

**4.2 — Applied to the real `gym_membership` policy anyway, does it recurse?** Surprisingly, **no** —
```sql
create policy gym_membership_select_fixc on public.gym_membership
for select to authenticated
using ( (user_id = (select auth.uid())) or public.is_staff_of_inline(gym_id) );
```
```sql
select count(*) from public.gym_membership;   -- as the oversized-gym owner
-- 5202   (correct — matches their gym's true roster size, no error)
```
It works, but **only by accident**: `is_staff_of_inline`'s inner query is `WHERE user_id = (select auth.uid())
AND gym_id = p_gym` — every row it can possibly return already has `user_id = caller`, which trivially satisfies
the *cheap* arm of the very policy being evaluated, so the OR short-circuits before ever re-entering
`is_staff_of_inline`. This is a property of *this specific function body*, not a Postgres safety guarantee — a
future edit that loses this self-limiting shape (e.g., checking membership by role only, without pinning
`user_id`) would silently reintroduce either a runtime stack-depth crash or a correctness bug, **and there is no
static safety net once `SECURITY DEFINER` is removed** — see §4.3 for the proof the static guard is bypassed,
not satisfied.

**4.3 — Performance measured, not assumed:**
```
As member: Execution Time: 9238.687 ms   (Filter: … OR is_staff_of_inline(gym_id), still Seq Scan)
As staff:  Execution Time: 9015.345 ms
```
**Statistically indistinguishable from the un-merged baseline (8,123–11,202ms band).** The `cost 10` annotation
changed the *planner's cost estimate* dramatically (`cost=28626.50` vs `cost=172211.50`) but changed **zero**
actual execution behavior, because there is still no alternative plan available — miscalibrating `procost` only
matters when a competing plan exists to switch to.

**Verdict on C: DOA as stated.** It does not inline (the premise is false for this body shape), it does not
improve measured performance (same Seq Scan, same wall-clock band), and dropping `SECURITY DEFINER` removes the
one thing (RLS bypass) that made the original safe from recursion — replacing it with a fragile, undocumented,
data-shape-dependent accident. If this pattern were reused on the other 44 S3-shaped write policies (which also
call `is_staff_of`), each would now *also* pay full RLS re-evaluation on `gym_membership` inside every call,
strictly more expensive than today's DEFINER bypass. **Do not ship.**

---

## 5. Candidate D — RESTRICTIVE split, or a raw EXISTS instead of the function

**5a. Raw EXISTS (no function, no DEFINER) — hard failure, exactly as ADR-0013 predicts:**
```sql
create policy gym_membership_select_exists on public.gym_membership
for select to authenticated
using (
  (user_id = (select auth.uid()))
  or exists (select 1 from public.gym_membership gm2
             where gm2.gym_id = gym_membership.gym_id
               and gm2.user_id = (select auth.uid())
               and gm2.role in ('owner','operator'))
);
-- then: select count(*) from public.gym_membership;  (as staff)
```
```
ERROR:  42P17: infinite recursion detected in policy for relation "gym_membership"
```
**Confirmed, reproducibly.** Note the asymmetry with §4.2: writing the *identical logical check* as a raw
`EXISTS` in the policy body trips Postgres's **static, rewrite-time** recursion guard immediately; hiding the
same logic behind a plain function call (§4.2) evades that same guard because the rewriter doesn't inspect
function bodies — and then survives at runtime only by the accident described in §4.2. **This is not a viable
fix shape for `gym_membership` at all** — full stop, unrunnable.

**5b. RESTRICTIVE policy pair — compiles and runs, but is a correctness regression, not a performance fix:**
```sql
create policy gym_membership_self_select on public.gym_membership
for select to authenticated using (user_id = (select auth.uid()));
create policy gym_membership_staff_select_restrictive on public.gym_membership
as restrictive for select to authenticated using (is_staff_of(gym_id));
```
```sql
select count(*) from public.gym_membership;  -- as the 5,202-member gym's owner
-- visible_rows: 1
```
**The owner who could see 5,202 rows under the current OR-semantics can now see exactly 1 (their own row).**
RESTRICTIVE policies AND together with the permissive set, so the effective predicate became `user_id=uid AND
is_staff_of(gym_id)` — staff can no longer see other members' rows at all. **This silently deletes the entire
staff-roster feature.** It is not a subtler version of the same fix; it is a different, wrong, access-control
model. Measured, not inferred: 5,202 → 1, confirmed live on scratch.

**Verdict on D: both variants fail. The EXISTS variant doesn't run; the RESTRICTIVE variant runs and breaks
production correctness. Neither should ever reach a migration.**

---

## 6. Ranking — measured effect, most to least

| Rank | Fix | Measured effect | Ship? |
|---|---|---|---|
| **1** | **B** — `.eq("user_id", uid)` at 3–4 call sites | **12,364×–38,000× measured speedup**; genuine `Index Scan`, zero DDL | **YES — this is the fix** |
| 2 | A — merge policies, cheap-arm-first | **No measured improvement** (statistically inside baseline's own noise band; 2 of 5 samples above it); never produces an Index Scan | Optional zero-risk tidiness only; **not a performance fix, do not present it as one** |
| 3 | C — non-definer "inlinable" `is_staff_of` | Does not inline (proven); no measured speedup (same Seq Scan, same wall-clock band); "works" only by an undocumented, fragile accident that removes the static recursion guard | **NO** |
| 4 | D (RESTRICTIVE) | Compiles, runs, **silently deletes staff roster visibility** (5,202→1 measured) | **NO — correctness regression** |
| 4 | D (raw EXISTS) | **`ERROR 42P17: infinite recursion detected in policy`** — does not run at all | **NO — doesn't compile logically** |

**What the report should say instead of what it currently says:** drop the "merge the two policies" line from
the recommended-fix list, or demote it to an optional cosmetic cleanup explicitly labeled as *not* delivering
the claimed 58× win. The load-bearing fix is B alone. Section 8.3's framing — "the policy merge is unproven,
run it on scratch first" — undersold how badly it fails: it isn't merely unproven, it's **measured and refuted**
for the query it was meant to fix.

---

## 7. What I left on scratch (disposable, but stated per the mandate)

- `public.gym_membership`: **611,000 rows** across `3,002` gyms (2 real + 3,000 synthetic `slug like
  'synth-gym-%'`), one oversized gym with 5,202 members. `pg_database_size` = **287 MB** (well under the 400MB
  soft cap; 113MB headroom remained).
- `public.gym`: 3,000 synthetic rows added (`brand_module_id='forge'`, no real brand dependency).
- `gym_membership_user_id_fkey` **dropped** and **not re-added** — synthetic `user_id`s do not exist in
  `auth.users`. Harmless for further RLS/plan testing on this table; would matter if a future agent needs FK
  integrity on `gym_membership.user_id` specifically.
- Final policy state on `gym_membership`: restored to **byte-identical to the two-policy production shape**
  (`gym_membership_self_select` + `gym_membership_staff_select`, confirmed via `pg_policies` re-check).
- All throwaway test functions (`trivial_true`, `gym_exists_check`, `is_staff_of_inline`) were dropped after use.
- No changes were made to LIVE (`hjppxawglmukfvsgmcog`) at any point — no MCP write tool was invoked, and every
  write in this session went through the `database/query` Management API endpoint against
  `gyyujeguycxxoaqgdnjp` only, asserted in `scratch-query.mjs` before every call.

---

## 8. Blind spots

1. **The instance is noisy.** Baseline samples ranged 8.1–11.2s and merged-A samples ranged 8.8–25.0s on the
   *same* query against the *same* data — a ~3× spread run-to-run on this shared ARM Micro instance. I used 2–3
   samples per condition, enough to show A is not a clear win (most samples overlap the baseline band) but not
   enough to bound A's true mean tightly. B's result (0.6ms vs 8,000+ms) is two-plus orders of magnitude larger
   than this noise floor, so it is not in doubt; A's null result is directionally solid but would benefit from a
   10+ sample run if anyone wants a tighter confidence interval.
2. **I did not measure candidate B combined with candidate A** (merged policy + `.eq` predicate together) —
   expected to be identical to B alone (the residual OR only touches 1–2 rows either way once the index scan
   narrows the input), but not empirically confirmed.
3. **Synthetic data, not live-shaped.** `user_id`s are random UUIDs with no real `auth.users` rows, uniform
   ~200-per-gym distribution, no skew, no multi-gym members. Real production skew (some gyms much larger, some
   users in 2+ gyms) could change B's win margin slightly (still expected to remain 3–4 orders of magnitude) but
   wasn't tested.
4. **I did not test candidate C or D's write-path implications** (`WITH CHECK` clauses, INSERT/UPDATE policies)
   — this experiment is scoped to the SELECT-policy merge question only, per the mandate.
5. **JIT and parallel-worker settings** were left at scratch's defaults; I did not check whether they differ
   from prod's configuration, which could shift absolute timings (though not the relative ranking — B's win is
   structural, not tuning-dependent).
