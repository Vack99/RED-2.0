# arch:authz — Does authorization belong in RLS at all?

**Agent:** `arch:authz` · **Date:** 2026-07-27 · **Target:** live prod `hjppxawglmukfvsgmcog`, PostgreSQL 17.6
**Access used:** read-only — `SELECT`, `EXPLAIN` without `ANALYZE`, `pg_catalog`, `get_advisors`. Every `EXPLAIN` ran inside
`begin; set local role authenticated; set local request.jwt.claims = '…'; … rollback;` so RLS was actually applied
(the MCP's default role is table owner and bypasses RLS — plans taken without the `set local role` are worthless).
**Nothing was written, no DDL, no migration.**

---

## 0. Headline

Two things, and they point in opposite directions.

1. **The brief's own premise-warning is out of date.** It says *"ADR-0013 §2/§3 asserts the gym RLS helper is
   O(1)-per-statement and forbids changing it. BOTH HALVES ARE FALSE… That ADR exists to tell reviewers to delete the
   correct fix."* The file on disk has said the opposite since **2026-07-13**. `docs/adr/0013-gym-scoped-rls-mechanism.md:29`
   is literally titled **"The helper wrap, corrected: it is per-ROW, not per-statement (corrected 2026-07-13)"**, and
   `:97-103` retracts the "never unwrap" instruction by name. The fix shipped in
   `supabase/migrations/20260714080000_rls_uncorrelated_predicates.sql`. I re-derived the plans from scratch and the
   **current** ADR text is correct on every claim it makes. See §3.

2. **The prior audit's C3 is right about the mechanism, wrong about the scope, and — on the worst query —
   15–30× too optimistic about the magnitude.** It is not an architecture-wide ceiling; it is **three TypeScript lines**.
   But those three lines bind at **~10–32 gyms** for a 50 ms budget, not 65–330. See §4.

**Verdict on the mandate question:** authorization belongs in RLS here, and the evidence is not aesthetic — it is that
**15+ write call-sites in the DAL carry no tenant predicate at all** (`update facility … where id = $1`). Under a
service-layer model each of those is a cross-tenant write hole permanently one code-review miss away. §6.

---

## 1. The incumbent, enumerated

### 1.1 Policy census

```sql
select count(*) total_policies,
       count(*) filter (where 'anon' = any(roles)) touching_anon,
       count(distinct tablename) tables_with_policies
from pg_policies where schemaname='public';
```
```
total_policies | touching_anon | tables_with_policies
      101      |      17       |         28
```

Per-table, with command split (`pg_class` + `pg_policy`):

| policies | tables | shape |
|---|---|---|
| 5 | `about_value`, `class_session_coach`, `facility`, `faq`, `gym_contact`, `plan_feature`, `stat` | 2 SEL + INS + UPD + DEL |
| 4 | `class_session`, `class_type`, `class_type_bring_item`, `class_type_workblock`, `clientes`, `coach`, `paquetes`, `plantillas`, `reservation`, `room`, `schedule_template` | 2 SEL + INS + UPD (+DEL on `plantillas`) |
| 3 | `asistencias`, `cobro`, `perfil`, `schedule_template_coach` | SEL + INS + UPD |
| 2 | `contact_message`, `gym_membership`, `schedule_template_week`, `ventas` | — |
| 1 | `gym`, `gym_domain` | anon+authenticated `using (true)` |
| **0** | `gym_folio_counter` | **RLS on, no policy → deny-all** (correct; only reachable via `next_folio()` DEFINER) |

Structural facts worth stating plainly:

- **`FOR ALL` policies: 0.** Every policy is split by command. Good — a `FOR ALL` would have silently made every
  `USING` clause double as a `WITH CHECK`.
- **RESTRICTIVE policies: 0 of 101.** All permissive. Consequence: policies compose with `OR`, so **any policy added
  in the future can only widen access, never narrow it.** There is no deny-by-default floor a mistake can hit.
- **`relforcerowsecurity` = false everywhere.** Table-owner (`postgres`) and `service_role` bypass RLS entirely.
- **DELETE is unreachable for `authenticated` on the ledgers** (`clientes`, `ventas`, `asistencias`, `reservation`,
  `class_session` have no DELETE policy). Soft-delete by construction. This is a genuine strength, quietly earned.

### 1.2 Predicate shapes — the whole vocabulary is four expressions

| # | Shape | Where | Count |
|---|---|---|---|
| S1 | `gym_id IN (SELECT m.gym_id FROM gym_membership m WHERE m.user_id = (SELECT auth.uid()))` | member SELECT | 16 |
| S2 | …same, `AND m.role = ANY('{owner,operator}')` / `= 'owner'` | staff/owner SELECT | 7 |
| S3 | `(SELECT is_staff_of(t.gym_id))` / `(SELECT has_role(t.gym_id,'owner'))` | every INSERT/UPDATE/DELETE + `gym_membership_staff_select` | 44 |
| S4 | `true` (role `anon`) | catalog/marketing | 17 |
| S5 | `auth_user_id = (SELECT auth.uid())` (clientes) · `user_id = (SELECT auth.uid())` (gym_membership) · `member_id IN (SELECT c.id FROM clientes c WHERE c.auth_user_id = (SELECT auth.uid()))` (reservation) | self-ownership | 3 |

### 1.3 The `(select auth.uid())` initplan idiom: 100% clean

```sql
select tablename, policyname from pg_policies
where schemaname='public'
  and coalesce(qual,'')||coalesce(with_check,'') ~ 'auth\.uid\(\)'
  and coalesce(qual,'')||coalesce(with_check,'') !~ '\( SELECT auth\.uid\(\)';
```
```
(0 rows)
```

**Zero bare `auth.uid()` in any of 101 policies.** Every plan I captured confirms it hoists:

```
InitPlan 2
  ->  Result  (cost=0.00..0.03 rows=1 width=16)
        Output: (COALESCE(NULLIF(current_setting('request.jwt.claim.sub'…
```

This is the one thing most Supabase codebases get wrong, and this one has it right in all 101 places. State it plainly:
**this part is not a problem and should not be touched.**
*Falsification:* it would be wrong if a policy used `auth.jwt()` or `current_setting()` unwrapped instead. Checked — no
policy references either.

---

## 2. How the gym predicate actually executes (measured)

### 2.1 S1/S2 → **hashed SubPlan**, built once per statement

```sql
begin; set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
explain (verbose, costs on)
select id, gym_id, starts_at from public.class_session where gym_id = '…aa'; rollback;
```
```
Index Scan using class_session_gym_id_idx on public.class_session  (cost=1.49..3.71 rows=1)
  Index Cond: (class_session.gym_id = '…aa'::uuid)
  Filter: (ANY (class_session.gym_id = (hashed SubPlan 4).col1))          ← HASHED
  SubPlan 4
    ->  Seq Scan on public.gym_membership m  (cost=0.07..1.34 rows=1)
          Filter: ((m.user_id = (InitPlan 1).col1) AND ((SubPlan 2) OR (m.user_id = (InitPlan 3).col1)))
          SubPlan 2 -> Result: is_staff_of(m.gym_id)
```

`(hashed SubPlan)` means: **evaluated once per statement, result hashed, per-row cost = one hash probe.** With respect
to the protected table's row count this is genuinely **O(1) per statement**.

The inner `gym_membership` scan is a seq scan *today* only because the table has 9 rows in 1 page. Force the planner's
hand and an index path exists:

```sql
… set local enable_seqscan = off;   -- 10^10 penalty
```
```
SubPlan 4
  ->  Index Only Scan using gym_membership_pkey on public.gym_membership m  (cost=0.19..1.57)
        Index Cond: (m.user_id = (InitPlan 1).col1)                        ← INDEX COND FORMS
        Filter: ((SubPlan 2) OR (m.user_id = (InitPlan 3).col1))
```

Margin at 9 rows is 1.34 vs 1.57 — razor thin. **At any realistic size the planner flips to the pkey probe on its own.**
The 25 gym-scoped SELECT policies are therefore *not* a scaling risk. That is a real, load-bearing "this is fine."

### 2.2 S3 → **correlated SubPlan**, re-evaluated per row

```sql
explain (verbose) update public.clientes set nombre = nombre where id = '…bb';
```
```
Update on public.clientes
  ->  Index Scan using clientes_pkey on public.clientes
        Index Cond: (clientes.id = '…bb'::uuid)
        Filter: ((SubPlan 7) AND ((ANY (clientes.gym_id = (hashed SubPlan 11).col1)) OR …))
        SubPlan 7  -> Result: is_staff_of(clientes.gym_id)      ← CORRELATED (USING)
        SubPlan 11 -> Seq Scan on gym_membership m_1
  SubPlan 1  -> Result: is_staff_of(clientes.gym_id)            ← CORRELATED (WITH CHECK)
  SubPlan 5  -> Seq Scan on gym_membership m
```

Not hashed, not an InitPlan — it references the outer row's `gym_id`, so it fires per row. A single-row `UPDATE`
evaluates `is_staff_of` **twice** (USING + WITH CHECK) and builds the membership hash **twice** (SubPlan 5 and 11 are
two independent scans). At 1 row that is ~4 × 17 µs ≈ 67 µs. Irrelevant. **The ADR's justification — "writes touch few
rows" — holds.** Largest write fan-out I could find is `create_recurring_schedule(p_horizon_weeks)`: ~7 weekdays ×
12 weeks = 84 INSERTs = 84 × 16.75 µs ≈ 1.4 ms. Still irrelevant.

### 2.3 The measured constant: `is_staff_of()` costs 16.75 µs per call

All three run on live prod, warm, `role authenticated`, 20,000 iterations, `clock_timestamp() - statement_timestamp()`.
(First attempt returned 4.31 ms — the planner had pruned the unused subquery column. Forcing the value into a `sum(case
when … )` fixed it. Recording the false start because it is exactly the trap that produces a bogus "RLS is free" result.)

| Probe | ms / 20,000 | µs per call (net of control) |
|---|---|---|
| A control (`sum(case when g%7=0 …)`) | 4.86 | — |
| B `public.is_staff_of(varying uuid)` | 339.93 | **16.75** |
| C equivalent inline `EXISTS` on `gym_membership` | 149.94 | **7.25** |

**The `SECURITY DEFINER` wrapper costs 9.5 µs — 2.3× the inline predicate.** Postgres never inlines a
`SECURITY DEFINER` SQL function, so every call pays full SPI/executor setup. ADR-0013 §1 is right that the definer is
*required* (an invoker helper recurses into `gym_membership`'s own RLS), so this 2.3× is the price of correctness —
but it is a price nobody has written down, and it is the multiplier on every number in §4.

Seq-scan baseline, for the same arithmetic: 1,000,000 rows through a `text = ANY(…)` filter = **394.21 ms → 0.39 µs/row**
(conservative-high; a real heap scan is cheaper than `generate_series` + array indexing).

### 2.4 Postgres does **not** reorder OR operands — 58× proven

The one experiment that decides §4's magnitude. Identical logic, operands swapped:

```sql
-- D: expensive first
… where public.is_staff_of(arr[1+(g%4)]) or g > 0;      -->  339.59 ms
-- E: cheap first
… where g > 0 or public.is_staff_of(arr[1+(g%4)]);      -->    5.78 ms
```

**58×.** The planner reorders top-level `AND` conjuncts by cost/selectivity; it does **not** reorder the arms of a
`BoolExpr OR`. Execution is left-to-right with short-circuit on the first `TRUE`.

And the live `gym_membership` plan puts the expensive arm first:

```
Filter: ((SubPlan 1) OR (gym_membership.user_id = (InitPlan 2).col1))
        └ is_staff_of(gym_membership.gym_id)
```

So for a **member** (for whom `is_staff_of` is always false) the OR evaluates `is_staff_of` on **every row scanned**
before it ever tries the cheap `user_id = uid`. The ordering is a consequence of how the two permissive policies were
created, not something you can steer from the policy names. Merging them into one policy with the cheap arm written
first makes it steerable — and worth 58× on the member path.

---

## 3. Contested claim 1 — ADR-0013 §2/§3. Settled.

**What the brief asserts:** the ADR claims O(1)-per-statement and forbids changing it; both halves false.
**What is actually on disk (read this session):**

- `docs/adr/0013-gym-scoped-rls-mechanism.md:29` — heading: *"### 2. The helper wrap, corrected: it is per-ROW, not
  per-statement (corrected 2026-07-13)"*
- `:31-38` — *"This section **originally** claimed … 'O(1)-per-statement at all-Mexico scale.' **That was false.**"*
- `:57-66` — *"**Adopted 2026-07-14** (migration `20260714080000_rls_uncorrelated_predicates.sql`). … All 25 gym-scoped
  **SELECT** predicates now use `gym_id in (select m.gym_id …)`, a hashed InitPlan built once per statement
  (asistencias 42→3ms, clientes 3.8→0.3ms) … INSERT/UPDATE/DELETE predicates keep the correlated helper form (writes
  touch few rows), and `gym_membership_staff_select` keeps the DEFINER helper — an inline self-read … would recurse."*
- `:99-103` — the "never unwrap" instruction is explicitly retracted: *"that rested on the false §2 claim."*
- Migration file confirmed present: `supabase/migrations/20260714080000_rls_uncorrelated_predicates.sql`.

**What is precisely true, from my own plans (not inherited):**

| Assertion | Status |
|---|---|
| The **original** (pre-2026-07-13) ADR-0013 §2 O(1) claim was false | **TRUE** — S3 is a correlated SubPlan (§2.2) |
| The **current** ADR-0013 forbids changing the mechanism | **FALSE** — it *documents having already changed it* |
| SELECT policies are O(1) per statement w.r.t. the protected table | **TRUE** — `(hashed SubPlan)`, §2.1 |
| Write policies are per-row | **TRUE**, and correctly justified — §2.2 |
| `gym_membership_staff_select` must keep the DEFINER helper (recursion) | **TRUE** — inlining `gym_membership` inside its own policy recurses |

**Consequence for this audit and for the repo:** the memory item
`adr-0013-rls-per-row-claim-is-false.md` and the warning in this brief are **stale by two weeks and should be retired.**
They are now actively harmful: an agent acting on "ADR-0013 tells reviewers to delete the correct fix" would go looking
for a fix to restore that is already in production, and could revert `20260714080000`. That migration is worth
42 ms → 3 ms on a 5,000-row `asistencias` statement.

*What would have to be true for me to be wrong:* that the working tree differs from `main`. `git status` shows
`docs/adr/` clean (only untracked files in `docs/Context/` and `docs/superpowers/`), and the migration is committed.

---

## 4. Contested claim 2 — the `gym_membership` OR-scan. Confirmed, rescoped, and worse than stated.

**The prior audit (`2026-07-27-auth-structure-scale-audit.md:96-113`) said:** structurally unindexable, no `Index Cond`
forms, cost stays O(platform), *"binds at roughly 65–330 gyms. This is the hardest technical ceiling in the architecture."*

### 4.1 Mechanism — CONFIRMED

Unfiltered read of `gym_membership`, with `enable_seqscan=off` (10¹⁰ penalty):

```
Seq Scan on public.gym_membership  (cost=10000000000.03..10000000001.30 rows=1)
  Filter: ((SubPlan 1) OR (gym_membership.user_id = (InitPlan 2).col1))
  SubPlan 1 -> Result: is_staff_of(gym_membership.gym_id)
```

The planner takes a 10¹⁰ cost hit rather than use an index. **No index path exists for the unfiltered shape.** Confirmed.

Add the AND-qual the fix proposes:

```sql
… select user_id, gym_id, role from public.gym_membership where user_id = '…001';
```
```
Index Scan using gym_membership_pkey on public.gym_membership  (cost=0.16..2.64)
  Index Cond: (gym_membership.user_id = '…001'::uuid)
  Filter: ((SubPlan 1) OR (gym_membership.user_id = (InitPlan 2).col1))
```

Bounded probe. **The proposed `.eq("user_id", uid)` fix works, and needs zero DDL** — `gym_membership_pkey` is
`btree (user_id, gym_id)`, so `user_id` is already the leading column.

### 4.2 Scope — REFUTED as stated

The prior audit generalised this to the architecture ("cost stays O(platform), not O(tenant)"). It does not. The 23
S1/S2 policies embed their **own** `m.user_id = (select auth.uid())` inside the subquery, which is a top-level AND-qual
*within that subquery* and forms an `Index Cond` (§2.1, `enable_seqscan=off` on `class_session`). The OR only degenerates
when **the calling query supplies no `user_id` predicate**. Exactly three call sites do that:

| # | Call site | Query | Runs on |
|---|---|---|---|
| Q1 | `packages/data/src/server/agenda-miembro.ts:147-150` (`resolverMiembroGym`) | `select gym_id, created_at, gym(…) order by created_at` — **no user filter, no role filter, no limit** | every member page |
| Q2 | `packages/data/src/server/agenda-miembro.ts:172` (`getEsMiembro`) | `select gym_id limit 1` — no user filter | `/reservar`, deliberately not `cache()`d |
| Q3 | `packages/data/src/server/gym.ts:49-55` (`getOperatorGym`) | `.in("role",["owner","operator"]).order("gym_id").limit(1)` | every admin request |

`gym.ts:25-26` says so out loud: *"`gym_membership`'s RLS self-read policy already scopes the read to the caller
(ADR-0013 §4), so no explicit `user_id` filter is added here."* That comment is the bug.

### 4.3 Their "live corroboration" is a misreading

They cite *"275,638 seq scans vs 867 index scans on a 9-row table"* as proof of a structural problem. Current numbers:

```sql
select relname, seq_scan, seq_tup_read, idx_scan, n_live_tup, pg_relation_size(relid)
from pg_stat_user_tables where relname='gym_membership';
```
```
gym_membership | 276019 | 695572 | 867 | 9 | 8192 bytes
```

`gym_membership` is **one 8 KB page**. A seq scan of one page is the cheapest plan that exists; the planner is correct
and would be wrong to do anything else. `seq_tup_read/seq_scan = 2.52` — these scans read 2.5 rows each, not 9. That
counter measures **how often `is_staff_of` is called** (~276k times), which is a frequency fact, not a plan pathology.
Using it as evidence of an indexing problem is invalid.

### 4.4 Magnitude — recomputed from measured constants

Inputs, all measured this session: `c_helper = 16.75 µs` (§2.3), `c_scan = 0.39 µs/row` (§2.3, conservative-high),
`is_staff_of` evaluated **before** `user_id = uid` in the OR (§2.4).
`m` = `gym_membership` rows per gym = activated members + staff. Live activation is early (116 `clientes` → 9
memberships), so I model maturity: `m_low = 92` (60% of 150 + 2), `m_mid = 137` (60% of 225 + 2), `m_high = 302`
(100% of 300 + 2).

| Query | Cost model | 50 ms (repo's own budget) | 250 ms | 1 s | @ 3,000 gyms |
|---|---|---|---|---|---|
| **Q1 `resolverMiembroGym`** — no prefilter, helper fires on every row | `g·m·(c_scan+c_helper)` = `g·m·17.14 µs` | **10 gyms** (m=302) · **21** (137) · **32** (92) | 52 · 107 · 158 | 207 · 426 · 634 | **4.6 – 15.5 s** |
| **Q2 `getEsMiembro`** — `limit 1`, stops at first match (~m·g/2 rows) | `g·m/2·17.14 µs` | 19 · 43 · 63 | 97 · 213 · 317 | 387 · 853 · 1,269 | 2.3 – 7.8 s |
| **Q3 `getOperatorGym`** — role prefilter runs first, helper fires on staff rows only (s=2) | `g·(m·0.39 + 2·16.75) µs` | **331** (m=302) · **575** (137) · **720** (92) | 1,654 · 2,877 · 3,602 | 6.6k · 11.5k · 14.4k | 0.45 – 0.7 s |

Read across:

- **Q3 is where "65–330 gyms" lands** — my 331 at the pessimistic end matches theirs; theirs is 2–10× pessimistic at the
  realistic end. Fine.
- **Q1 is 15–30× worse than anything they modelled** and they did not distinguish it. It has no role prefilter, no
  `LIMIT`, and it runs on the **member** path where `is_staff_of` returns false for every row, so the OR pays the
  expensive arm on 100% of rows. **Q1 is the true first ceiling: ~10–32 gyms at a 50 ms budget, ~200–640 at 1 s.**
- At 3,000 gyms Q1 alone burns **4.6–15.5 CPU-seconds per member page load** on a box with `max_connections = 60`.
  Sixty concurrent member page loads is total saturation. The platform stops long before the row count is interesting.

**So: the finding is real, they under-called the worst query, and over-called its architectural scope.** Both errors
matter. Calling it architecture-wide invites a redesign; the actual fix is three `.eq("user_id", uid)` calls, zero DDL,
plus one policy merge.

**Is it "the first hard ceiling in the entire architecture"?** Within my mandate — yes; nothing else in the authz layer
binds below ~1,000 gyms. Outside it I can't say (other agents own indexes, mail, connections).

### 4.5 The second half nobody has costed: OR-operand order

Even after `.eq("user_id", uid)`, the OR still evaluates `is_staff_of` first on every row the index returns. For a
single-gym member that's 1 row → 17 µs, irrelevant. For a **staff user of a large gym** reading their gym's roster of
memberships, it's every row of that gym. Merging the two permissive `gym_membership` SELECT policies into one with the
cheap arm written first is worth the measured 58× (§2.4) and is the difference between a controllable and an
uncontrollable evaluation order. Cheap, and nobody has proposed it.

---

## 5. `SECURITY DEFINER` surface

`pg_proc` for `public`, `prokind='f'`: **38 functions — 18 `SECURITY DEFINER`, 20 `SECURITY INVOKER`.**
(`AGENTS.md` says "the 34 `public` functions"; the count has drifted by 4. Minor, but the doc is used as a coverage
denominator by `tools/guards/rpc-write-coverage.test.ts`.)

### 5.1 Definer functions and who can call them

| Function | anon EXEC | writes | authz check in body |
|---|---|---|---|
| `is_staff_of`, `is_member_of`, `has_role`, `staff_gym` | no | no | *are* the check |
| `mi_membresia`, `roster_clase`, `contar_reservas_activas`, `invitacion_info` | `invitacion_info` **yes** | no | uid / helper / bearer code |
| `reservar_clase`, `cancelar_reserva`, `toggle_favorito_tipo` | no | yes | `auth.uid()` + gym derived from the named row |
| `reclamar_o_crear_cliente`, `reclamar_por_codigo` | no | yes | `auth.uid()` + HMAC firma |
| `preparar_invitacion`, `marcar_invitacion_enviada`, `next_folio` | no | yes | `is_staff_of` / `has_role` |
| `enviar_mensaje_contacto` | **yes** | yes | none (rate limit on a **caller-supplied** `p_ip`) |
| `rls_auto_enable` | no | no | event trigger; `postgres`+`service_role` only |

Two Supabase advisor WARNs, both real and both already known: `enviar_mensaje_contacto` and `invitacion_info` are
anon-callable definers. `invitacion_info` is bearer-code-gated by design. `enviar_mensaje_contacto` is the one with no
authz at all — covered by another agent's lane, noted here for completeness because it is a definer.

### 5.2 The leak the advisors do **not** flag: leftover `anon` EXECUTE on five invoker writers

```
cancel_class_session         | anon=X | writes
create_class_session         | anon=X | writes
create_recurring_schedule    | anon=X | writes
edit_class_session           | anon=X | writes
ensure_week_materialized     | anon=X | writes
```

These are `SECURITY INVOKER`, so RLS applies as `anon`, and each opens with a staff check — e.g.

```sql
CREATE OR REPLACE FUNCTION public.cancel_class_session(p_session_id uuid) …
begin
  if public.staff_gym() is null then raise exception 'No autorizado'; end if;
  update public.class_session set cancelled_at = now()
   where id = p_session_id and cancelled_at is null;   -- RLS scopes to is_staff_of(gym_id)
```

For `anon`, `staff_gym()` returns null → raises. **Not a hole today.** It is the `pg_default_acl` leak
(`{postgres=X, anon=X, authenticated=X, service_role=X}` on fresh `CREATE`) that the definer migrations remembered to
`REVOKE` and these five did not. Two layers deep instead of three, on five write paths. Free to fix.

### 5.3 What that `cancel_class_session` body actually proves

`update … where id = p_session_id` — **no gym predicate anywhere in the statement.** The only thing preventing operator
of gym A from cancelling gym B's class is `class_session_staff_update USING ((SELECT is_staff_of(gym_id)))`. The comment
says so. This is the single strongest piece of evidence in the whole audit for keeping RLS, and it is not an isolated case.

---

## 6. The three peers, judged on the same evidence

### The decisive fact

`grep -rn 'SERVICE_ROLE|service_role|createClient'` across the repo: the **only** service-role client is
`supabase/functions/activar-cuenta/index.ts:36`. Neither Next.js app holds one. Every DAL read and write in
`apps/admin` and `apps/client` goes through `packages/data/src/server/supabase.ts` → user-JWT client → **RLS applies**.

And the DAL leans on that. Every content-editing write filters by primary key only:

```
packages/data/src/server/facilities.ts:71     .update({…}).eq("id", input.id)
packages/data/src/server/facilities.ts:83     .delete().eq("id", input.id)
packages/data/src/server/facilities.ts:96     .update({ sort_order: index }).eq("id", id)
packages/data/src/server/about-values.ts:71,83,96      "
packages/data/src/server/faqs.ts:68,80,93               "
packages/data/src/server/stats.ts:65,77,90              "
packages/data/src/server/coach.ts:113,132,144           "
packages/data/src/server/class-type.ts:145,208,218      "
packages/data/src/server/mensajes.ts:49                 "
```

**Not one carries `.eq("gym_id", …)`.** Fifteen-plus statements whose entire tenant boundary is the RLS `USING` clause.

### (A) RLS-as-authorization — the incumbent

- **For:** the 15+ pk-only writes above; five RPCs that write with no tenant predicate (§5.3); 101 policies enforced
  below the app, so a Server Action, a route handler and a future agent-written DAL function all get the same answer.
- **Against:** the correlated write shape costs 16.75 µs/row and the planner models it at **0.26 cost units** — it does
  not know the function is expensive, so it will happily choose plans that call it a million times (that is precisely
  how Q1 in §4.4 happens). `ALTER FUNCTION public.is_staff_of(uuid) COST 500` would let the planner avoid those plans.
  Nobody has proposed this. *(Modelled — the right COST value needs a calibration run; the direction is unambiguous.)*
- **Against:** **denial is silent.** `.update(…).eq("id", …)` with no `.select()` returns success with zero rows on an
  RLS denial. `class-type.ts:208`, `class-type.ts:218`, `coach.ts:132`, `coach.ts:144`, `about-values.ts:96`,
  `faqs.ts:93`, `stats.ts:90`, `facilities.ts:96` all do exactly this. (`facilities.ts:71-77`, `about-values.ts:69-75`,
  `faqs.ts:66-72`, `stats.ts:63-69` get it right — they `.select("id")` and throw on empty.) An authorization system
  whose failure mode is *"looks like it worked"* is a weak one, and it means a cross-tenant attempt leaves no trace.

### (B) App/service-layer authorization, DB trusts a scoped connection

Judged without deference to the incumbent — and it still loses, on three measurements:

1. **Adopting it requires introducing a service-role client into the Next apps.** That single line deletes all 101
   policies at once. The blast radius of the migration is the entire dataset, and the failure mode is silent
   (over-permission never throws).
2. **It converts 15+ existing statements into cross-tenant write holes on day one.** Each needs a hand-added
   `.eq("gym_id", gymId)` and each stays one refactor away from losing it again, forever, in a repo where agents write
   code. The repo has machine guards for dependency direction, denial-suite wiring and RPC write coverage — it has
   **no** guard that a write carries a tenant predicate, and `docs/Context/2026-07-27-multigym-rpc-scoping-decision-memo.md:334`
   already notes that such a guard is brittle enough to be deferred.
3. **It buys ~17 µs per statement.** That is the entire measured saving on the S1/S2 read path (§2.1), and ~34–67 µs on
   a single-row write (§2.2). Nothing in §4 is caused by RLS *being* the authorization layer; it is caused by three
   queries that forgot a `WHERE`. Option (B) is a redesign priced at a rounding error.

**(B) is already shipped on one surface, though, and that is worth saying:** the 17 `using (true)` anon policies mean
that for unauthenticated traffic RLS provides **zero** tenant isolation. Measured:

```sql
begin; set local role anon;
select count(distinct gym_id), count(*) from public.class_type; rollback;
-->  distinct_gyms = 4 | rows_visible = 20
```

`anon` sees every gym's catalog. The only thing scoping a marketing page to one tenant is the app's `.eq("gym_id", …)`
derived from the host — which ADR-0008 forbids as a *boundary* and permits only as presentation. The data is public by
design (class names, coaches, prices), with two exceptions worth naming: `gym_domain` `using (true)` is the **complete
customer list**, and `gym` likewise. So the repo already runs a two-regime authz model, and the regime with no login is
the one with no DB enforcement.

### (C) Hybrid — RLS backstop, app primary

This is what the repo already *is*, and what ADR-0013 §2 already says out loud: *"RLS answers 'may I see this row?'; the
`.eq` answers 'which of the rows I may see belong to this gym?'"* The staff **read** path carries `.eq("gym_id", …)`
consistently. The staff **write** path does not (§6, list above) — so today it is (C) for reads and (A) for writes.

**That asymmetry is not a bug, it is the right allocation:** reads are the high-fan-out path where the `.eq` buys an
index condition, writes are single-row where RLS costs 34 µs and buys the whole boundary. Leave it.

### Verdict

**Keep (A)+(C). Do not evaluate (B) again without new evidence.**

**Exit trigger — the observable that reverses this:** instrument `pg_stat_statements` (or `auto_explain`) for
`is_staff_of` / `has_role` / `is_member_of` total execution time as a share of total DB time. **Revisit if RLS-helper
time exceeds 15% of total DB exec time at p95, or if any single statement's `gym_membership`-derived predicate exceeds
25 ms.** Today those are ~0% and ~0.15 ms respectively. Secondary trigger: if a service-role client is ever needed in
either Next app for an unrelated reason, the (B) question reopens immediately — because the boundary is gone anyway and
the cost calculus changes.

**Falsification of "keep":** (A) would be wrong if — (i) no statement relied on RLS for tenant scope. Checked: 15+ do.
(ii) RLS cost dominated request latency. Measured: hashed shape is one 17 µs lookup per statement. (iii) a service-role
client already existed in the apps, making RLS decorative. Checked: it does not. All three checks came back against (B).

---

## 7. The 5 worst things about the current authz model, worst first

### 1. Three DAL reads query `gym_membership` with no `user_id` predicate — platform-wide seq scan with a per-row `SECURITY DEFINER` call
**Breaks at ~10–32 gyms** (50 ms budget) on `resolverMiembroGym`; ~200–640 gyms at 1 s; 4.6–15.5 s at 3,000 gyms.
`packages/data/src/server/agenda-miembro.ts:147-150`, `:172`, `packages/data/src/server/gym.ts:49-55`.
Evidence: live `EXPLAIN` (§4.1) + 16.75 µs/call measured (§2.3) + OR-order 58× (§2.4).
Fix: `.eq("user_id", uid)` at three call sites. **Zero DDL** — `gym_membership_pkey` already leads on `user_id`.
`gym.ts:25-26` documents the wrong reasoning that caused it; delete that comment with the fix.
**Confidence: measured** (constants), **modelled** (extrapolation to gym counts).

### 2. Postgres never reorders OR operands, and the `gym_membership` policies are in the wrong order
Two permissive SELECT policies compile to `(is_staff_of(gym_id)) OR (user_id = uid)` — expensive arm first, on the
member path where it is always false. **58× measured** (339.59 ms vs 5.78 ms, §2.4). Order is a byproduct of policy
creation order, not steerable from outside. Survives fix #1 (it just multiplies a smaller row count).
Fix: merge into one policy with `user_id = (select auth.uid())` written first.
**Breaks at:** any gym whose staff reads its own membership roster — ~1,000 members/gym before it is visible on its own.
**Confidence: measured.**

### 3. Authorization denial is silent on ~8 write paths
`.update()/.delete().eq("id", …)` with no `.select()` → an RLS denial returns success with 0 rows.
`class-type.ts:208`, `class-type.ts:218`, `coach.ts:132`, `coach.ts:144`, `about-values.ts:96`, `faqs.ts:93`,
`stats.ts:90`, `facilities.ts:96`. Four sibling functions in the same files do it correctly (`.select("id")` + throw),
so this is drift, not design. **Breaks at gym #2** — it needs two tenants and one wrong id, not scale. Consequence is
not a leak (the write is correctly blocked) but a lie to the operator and no audit trace of the attempt.
**Confidence: measured** (read the call sites).

### 4. The `anon` surface has no DB-side tenant boundary — 17 `using (true)` policies
Measured: `set local role anon; select count(distinct gym_id) from class_type` → **4 of 4 gyms.** Tenant scoping for
every unauthenticated page is app-side `.eq("gym_id", …)` from the host — the exact thing ADR-0008 forbids as a
boundary. Mostly public data, with two exceptions: `gym_domain` and `gym` are `using (true)` for anon+authenticated and
together are **the complete customer list** (host → gym → brand). **Breaks at:** reputationally at ~50 gyms (a
competitor scrapes your customer list from `/rest/v1/gym_domain`); functionally never.
**Confidence: measured.**

### 5. Tenant *identity* for staff is `min(gym_id)`, there is no deny-by-default floor, and the planner thinks the helper is free
Three separate soft spots that share a root — nothing in the model pins "which tenant am I acting as":
- `staff_gym()` = `order by gym_id limit 1`. `registrar_venta` (SECURITY INVOKER, the money path) derives its gym from
  it. A two-location owner's sale lands in the lowest-UUID gym's ledger and folio sequence. **Breaks at the first
  multi-location customer** — 1 gym owner, not 3,000 gyms. (Already filed; re-confirmed here as an *authz* defect, not
  just a UX one — it is the tenant identity of a write.)
- **0 of 101 policies are RESTRICTIVE.** Every policy composes with `OR`. There is no floor a future permissive policy
  cannot raise. **Breaks at:** the first policy written by someone who has not read all 101.
- `is_staff_of` carries the default `procost = 100` → planner cost `0.26`, against **16.75 µs measured**. The planner
  does not know it is expensive, which is *mechanically why* #1 happens. `ALTER FUNCTION … COST <n>` is the lever and
  nobody has pulled it. **Confidence: procost/measurement = measured; the right COST value = modelled.**

---

## 8. What is genuinely sound (stated plainly, then ranked anyway)

Per rule 7, these are real and I checked them rather than assuming:

- **`(select auth.uid())` in 101/101 policies. Zero bare calls.** Verified by catalog query and by every plan showing
  an `InitPlan`. This is the single most common Supabase RLS mistake and it is absent here.
- **No `FOR ALL` policies.** All 101 split by command, so no `USING` clause accidentally serves as a `WITH CHECK`.
- **The 2026-07-14 uncorrelated-predicate rewrite was the right call and is working.** `(hashed SubPlan)` confirmed on
  `class_session`, `clientes`, `reservation`. Do not revert it. Do not "simplify" it back to `is_staff_of`.
- **`SECURITY DEFINER` on the helpers is required, not incidental** — an invoker helper recurses into
  `gym_membership`'s own RLS. ADR-0013 §1 is correct; the 2.3× measured overhead (§2.3) is the price and it is worth it.
- **`gym_folio_counter`: RLS on, zero policies = deny-all**, reachable only through `next_folio()`. The advisor flags it
  INFO; it is correct as built and should stay.
- **No DELETE policy on the ledgers.** Soft-delete is enforced by the absence of a policy, not by convention.
- **No service-role client in either app.** The boundary is not quietly bypassed anywhere in `apps/`.

Ranked against §7, all of this sits below every item there — but none of it should be touched, and #3 in this list is
the one most at risk of being "cleaned up" by someone reading the stale memory item.

---

## 9. Evidence index

Every SQL statement in this report was executed against live prod this session, read-only. Key artefacts:

| § | What | Result |
|---|---|---|
| 1.1 | `pg_policies` census | 101 policies / 28 tables / 17 anon / 0 restrictive / 0 FOR ALL |
| 1.3 | bare `auth.uid()` scan | 0 rows |
| 2.1 | `EXPLAIN` `class_session` as authenticated | `(hashed SubPlan 4)` |
| 2.1 | same, `enable_seqscan=off` | `Index Only Scan … Index Cond: (m.user_id = (InitPlan 1).col1)` |
| 2.2 | `EXPLAIN UPDATE clientes` | `SubPlan 7 -> is_staff_of(clientes.gym_id)` ×2 (USING + WITH CHECK) |
| 2.3 | `is_staff_of` × 20,000 | 339.93 ms vs 4.86 ms control → **16.75 µs/call** |
| 2.3 | inline `EXISTS` × 20,000 | 149.94 ms → **7.25 µs/call** (definer wrapper = 2.3×) |
| 2.3 | 1M-row text-ANY scan | 394.21 ms → **0.39 µs/row** |
| 2.4 | OR operand order D vs E | **339.59 ms vs 5.78 ms — 58×** |
| 4.1 | unfiltered `gym_membership`, `enable_seqscan=off` | `Seq Scan (cost=10000000000.03…)` — no index path |
| 4.1 | filtered `where user_id=…` | `Index Cond: (user_id = …)` |
| 4.3 | `pg_stat_user_tables` | `gym_membership`: 276,019 seq / 695,572 tup / 9 rows / **8192 bytes = 1 page** |
| 5 | `pg_proc` census | 38 functions, 18 definer; 5 invoker writers hold stray `anon=X` |
| 6 | `set local role anon; select … class_type` | 4 distinct gyms, 20 rows |
| 3 | `docs/adr/0013-gym-scoped-rls-mechanism.md:29,31-38,57-66,97-103` | ADR self-corrected 2026-07-13, fix shipped 2026-07-14 |
| 4.1 | `pg_index` on `gym_membership` | `pkey btree (user_id, gym_id)` + `gym_id_idx` — no DDL needed for fix #1 |

---

## 10. Blind spots — what I did NOT examine

1. **I did not measure anything at scale.** Every constant is from a 9-row `gym_membership` and a 116-row `clientes`,
   fully cached in 224 MB of `shared_buffers`. All gym-count break-points in §4.4 are **extrapolations from measured
   per-call constants**, not observations. The honest way to settle them is to seed the scratch project
   (`gyyujeguycxxoaqgdnjp`) to ~500k `gym_membership` rows and re-run Q1/Q2/Q3. I expect the seq-scan term to get
   *worse* than my model (cold pages, index depth), not better — but I did not prove it.
2. **`EXPLAIN ANALYZE` was forbidden**, so I have no `loops=` counts and no actual-vs-estimated row comparison. The
   claim "`is_staff_of` fires on every row of Q1" rests on plan text ordering + the D/E experiment, not on a loop count.
3. **I did not audit the `WITH CHECK` clauses for correctness**, only for shape and cost. Whether every INSERT policy's
   `WITH CHECK` actually prevents stamping a foreign `gym_id` is unverified — I read the expression, not the denial suite.
4. **`auth` and `storage` schema policies** — not enumerated. I looked only at `public`.
5. **PostgREST's own authorization layer** — `db-pre-request`, `pgrst.db_plan_enabled`, exposed schemas, the
   `/rest/v1/` column-level grants. A column-level `GRANT` narrowing (recommended by the prior audit for the anon
   surface) is unexamined; I don't know what `information_schema.column_privileges` says for `anon`.
6. **Whether `x-gym` ever reaches a predicate.** I confirmed no *policy* reads a header, but I did not trace every DAL
   function to prove the `gymId` it passes to `.eq("gym_id", …)` is always host-reconciled rather than
   caller-supplied. That is the (C)-hybrid's actual attack surface and it needs its own pass.
7. **The denial suite's coverage of the OR/order behaviour.** `supabase/tests/` was not read. Nothing I found would be
   caught by a suite that asserts row visibility, since all §7 items are performance or ergonomics, not visibility —
   but I did not verify that.
8. **JWT-claims RLS as a fourth peer.** ADR-0013 rejects it on staleness and says "do not relitigate." I honoured that
   and did not price it. If someone wants it priced, the number that matters is what a custom-access-token hook costs
   per sign-in versus the 17 µs/statement it saves — and at 17 µs the answer is almost certainly still no.
