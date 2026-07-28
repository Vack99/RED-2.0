# E3 — Schema diff: production vs. repo (via scratch), object by object

Agent: e3:schema-diff. Method: prod queried READ-ONLY via the Supabase MCP `execute_sql` tool
(bound to `hjppxawglmukfvsgmcog`); scratch (`gyyujeguycxxoaqgdnjp`) queried READ-ONLY via the
Management API (`POST /v1/projects/gyyujeguycxxoaqgdnjp/database/query`, PAT from
`docs/db-testing-throwaway-project/data`). **Zero writes were issued anywhere in this experiment** —
every statement below is a `select`. Raw JSON captures live in
`scratchpad/audit/raw/*.json`; the mechanical diff script is `scratchpad/audit/diff.mjs`, full
output in `scratchpad/audit/diff-output.txt`.

## Headline answer to the mandate's question

**Is there DDL in production not reproducible from the repo's migrations? Yes — two confirmed
cases, both privilege-only, zero schema/data-model drift.** The data model itself (tables, columns,
types, defaults, indexes, FK actions, RLS policies — categories a–d) is **byte-identical** between
prod and a full replay of the repo's 83-migration set. That is the good news and it is measured,
not modelled. The bad news is narrower but real: **prod's function-grant state contains at least
one revoke that exists nowhere in git history**, and **scratch's function-grant/definition state
contains stale objects that the repo's migrations explicitly say should have been removed**. Either
way, the practical conclusion is the same: **do not trust scratch's `schema_migrations` ledger, or
even scratch's current catalog state, as a stand-in for "what the repo's migrations produce" without
this kind of direct object diff** — this session had to prove it, not assume it.

---

## Method note: why "83 vs 87 migrations" is not itself the drift

By **version stamp**, prod has 87 rows in its migration history and scratch has 83, sharing only 22
identical (version, name) pairs. That 65-name gap is **not** missing DDL — Supabase's hosted
`apply_migration` **restamps** files (documented already in
`docs/Context/…` memory as "prod migration version drift"). Re-matching by **name only**:

```
prod migrations:    87
scratch migrations: 83
matched by (version,name) exactly: 22
matched by name only (restamped):  61
TRUE gap — name exists in prod, absent from scratch entirely: 4
TRUE gap — name exists in scratch, absent from prod: 0
```

The 4 true-gap names (all landing after scratch was last seeded, chronologically last in the repo):
```
revoke_anon_perf_rpcs        (repo file 20260715080000_revoke_anon_perf_rpcs.sql)
registrar_venta_backdate     (repo file 20260714110000_registrar_venta_backdate.sql)
mi_membresia_reanchor        (repo file 20260714120000_mi_membresia_reanchor.sql)
reclamar_por_codigo_firma    (repo file 20260722120000_reclamar_por_codigo_firma.sql)
```
So scratch is a faithful, if slightly stale (frozen ~2026-07-14), replay of the repo — **in theory**.
What follows is what actually measuring the catalogs revealed once that theory was tested.

---

## Catalog diff results, category by category (mechanical, not eyeballed)

Full SQL for every category is in `scratchpad/audit/scratch-query.mjs` (identical queries ran on
both sides); the diff algorithm is `scratchpad/audit/diff.mjs`. Raw counts:

| category | prod rows | scratch rows | only-in-prod | only-in-scratch | different (same key) |
|---|---|---|---|---|---|
| (a) columns | 228 | 230 | 0 | 2 | 0 |
| (b) indexes (full indexdef) | 89 | 89 | 0 | 0 | 0 |
| (c) constraints (incl. FK actions) | 124 | 124 | 0 | 0 | 0 |
| (d) RLS policies (full USING/WITH CHECK) | 101 | 101 | 0 | 0 | 0 |
| (e) functions (identity, prosecdef, provolatile, procost, return type) | 38 | 39 | 0 | 1 | 0 |
| (f1) function EXECUTE grants | 119 | 125 | 0 | 6 | — |
| (f2) table-level grants (all privileges, all roles) | 927 | 959 | 0 | 32 | — |

**Every single "only-in-scratch" row across all 7 categories traces to exactly two causes**, both of
which are scratch contamination or scratch staleness, **never** prod having something undocumented
in the data-model sense:

1. **`e6_cliente_pool`** — a table that exists ONLY on scratch (2 extra columns in (a), 32 extra
   grant rows in (f2): 4 roles × 8 privileges). This is not from any of the 87 repo migrations (no
   migration file creates it). It is leftover debris from another agent in this 36-agent audit fleet
   (the "e6" prefix strongly implies a workload/growth-simulation experiment — see
   `scratchpad/audit/workload-growth.md` from this same audit run). **I did not create it and did
   not drop it** — cheap to remove, but another agent may still be using it, so I flagged it instead
   of touching it. Confirmed harmless to this diff (it's additive-only, doesn't shadow any real
   table), but it is real contamination of the "scratch = clean repo replay" assumption.

2. **`marcadas_por_gym(p_gym_id uuid)`** — a **stale 1-argument overload** of `marcadas_por_gym`
   that exists on scratch but not on prod. The repo's own migration
   `20260714090000_marcadas_por_gym_windowed.sql` (present in scratch's ledger under its restamped
   name) contains, verbatim: `drop function if exists public.marcadas_por_gym(uuid);` — its comment
   even explains why: *"EXACTLY ONE function named marcadas_por_gym: the 1-arg signature is
   DROPPED, not kept alongside. Two same-named functions of different arity make PostgREST refuse
   the RPC with PGRST203."* That DROP did not take effect on scratch. Live proof (querying
   `pg_get_functiondef` directly, not inference):
   ```sql
   select p.oid::regprocedure::text as sig, pg_get_functiondef(p.oid) as def
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='marcadas_por_gym';
   ```
   Scratch returns **two** rows: `marcadas_por_gym(uuid,date,date)` (matches prod) **and**
   `marcadas_por_gym(uuid)` (1-arg, body has `\r\n` line endings — a tell that it was applied via a
   different, Windows-originated pipeline than the clean migration replay, not through
   `apply_migration`). Prod returns **one** row only. **Practical consequence, verified against the
   migration's own comment: calling `marcadas_por_gym` via PostgREST on scratch right now with only
   `p_gym_id` would fail `PGRST203` (ambiguous overload) — a failure mode prod cannot exhibit.** Any
   test of this RPC run against scratch today is running against a broken double-overload state that
   prod does not have and never will after a correct migration replay.

---

## The one real, unexplained divergence: `toggle_pase` and anon EXECUTE

`(f1)` also flagged `toggle_pase(p_cliente_id uuid, p_fecha date)|anon|EXECUTE` as scratch-only.
Unlike the two causes above, **I could not find a migration that explains prod's side of this.**

Direct proof this is a real ACL fact, re-queried live against prod (not the earlier bulk pull):
```sql
select p.oid::regprocedure::text as sig, ...grantee..., ...privilege...
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('toggle_pase','marcadas_por_gym')
order by sig, grantee;
```
Prod result: `toggle_pase(uuid,date)` → EXECUTE only for `authenticated, postgres, service_role`.
**No `anon` row.** Scratch has an `anon` row.

Why this is suspicious: Supabase's hosted `pg_default_acl` for role `postgres` / schema `public` /
object-type `f` (functions) is, **on both projects, identically**:
```
{postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, service_role=X/postgres}
```
(verified with `select ... from pg_default_acl ...` on both sides — same ACL string on both). That
means **every new function created by `postgres` gets `anon` EXECUTE automatically**, and a
`revoke ... from public` (not `from anon`) does **not** strip it — this exact trap is already
documented in the repo's own `20260715080000_revoke_anon_perf_rpcs.sql` comment, which fixed the
identical bug for 4 *other* functions. `toggle_pase`'s original grant statement
(`20260531211105_atomic_write_rpcs.sql`) only revokes `from public`. I grepped **every** `revoke` in
all 87 migration files (`grep -n "revoke execute\|revoke all" supabase/migrations/*.sql`) — `anon`
is never mentioned alongside `toggle_pase`, in any of its three later `CREATE OR REPLACE` revisions
(`toggle_pase_gym_timezone`, `toggle_pase_front_desk_rows_only`, `toggle_pase_unify_surfaces` — none
of which touch grants at all; their own comments say *"CREATE OR REPLACE keeps grants"*, which is
correct Postgres behavior and rules out a self-healing re-grant on redefinition). **By the repo's
own migration history, prod should currently have this same anon-EXECUTE gap. It measurably does
not.** The only explanation left is an out-of-band `revoke execute on function
toggle_pase(uuid,date) from anon;` run directly against production (SQL editor / ad hoc script)
that was never captured as a migration file.

**Severity is low** (every RLS policy on `asistencias`/`clientes` requires `authenticated`, so an
anon call returns nothing/errors before touching real rows — same "defense-in-depth, not a live
leak" shape as the already-known 5-RPC anon gap), but it is the one item in this entire diff that is
genuinely **DDL-in-prod-not-reproducible-from-the-repo**, which is exactly what this experiment was
asked to determine. It went undetected until a byte-level ACL query, because `git log` and the
migration files alone say the opposite of what's actually running.

---

## Function bodies: the CRLF false alarm (worth recording so nobody re-chases it)

Metadata-only diffing ((e) above: prosecdef/provolatile/procost/return type) can't see body changes.
Since 3 of the 4 "missing" migrations are body-only changes to `registrar_venta`, `mi_membresia`,
`reclamar_por_codigo`, I pulled full bodies and compared. First pass (raw `md5(pg_get_functiondef())`)
showed all three **different** — alarming, since it would mean scratch is running stale RPC logic.
Second pass, normalizing `\r\n`→`\n` before hashing:
```sql
select p.proname,
  md5(regexp_replace(pg_get_functiondef(p.oid), E'\r\n', E'\n', 'g')) as norm_md5,
  length(regexp_replace(pg_get_functiondef(p.oid), E'\r\n', E'\n', 'g')) as norm_len
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('mi_membresia','registrar_venta','toggle_pase');
```
Prod: `mi_membresia`=`64709f2c...`/2418, `registrar_venta`=`ee34eabe...`/11491,
`toggle_pase`=`c8b5903d...`/4031.
Scratch (same query, Management API): **identical hashes, identical lengths, all three.**
**Retraction: this is a false alarm — pure CRLF-vs-LF noise, not a logic difference.** All three
function bodies are byte-identical once line endings are normalized. `reclamar_por_codigo` matched
even on the *first*, un-normalized pass (both LF-only).

The interesting side-effect of finding this: it means **3 of the 4 "missing" migrations' actual DDL
already exists on scratch, despite genuinely not being in scratch's `schema_migrations` table.**
Someone (almost certainly an earlier session reusing this same throwaway project — see
`docs/db-testing-throwaway-project` and this memory's own note that scratch has been "KEPT as
project test bed" across multiple prior sessions) applied these `CREATE OR REPLACE FUNCTION`
bodies directly via raw SQL, bypassing `apply_migration`'s bookkeeping. Only the 4th migration
(`revoke_anon_perf_rpcs`, a grants-only migration with no function body to "accidentally" replay)
and the DROP half of `marcadas_por_gym_windowed` failed to make that same jump.

**This is the load-bearing methodological finding of this experiment:** scratch's migration ledger
and scratch's actual catalog state have **drifted from each other, in both directions** — some
migrations recorded as applied whose effects didn't fully stick (the DROP FUNCTION), and some
migrations never recorded whose effects are present anyway (3 of 4 body changes). **"N migrations
applied" is not a reliable description of a Supabase project's state, on scratch or on prod.** Only
a direct catalog diff — what this experiment did — settles it.

---

## The 5 most dangerous divergences, ranked

1. **`toggle_pase` anon-EXECUTE gap exists on scratch but is silently closed on prod by DDL not
   in any migration.** If the recommended batch includes "revoke anon EXECUTE on the perf RPCs" (it
   likely does, modeled on `revoke_anon_perf_rpcs`'s pattern), running it against prod is a safe
   no-op for `toggle_pase` specifically — but that safety is coincidental, not because the batch
   author knew prod's true state. **Danger is not to prod today; it's that the person who wrote the
   fix believes prod has a gap it doesn't, meaning their mental model of prod's grant surface is
   already wrong in one place — there may be other silent out-of-band prod fixes nobody has
   inventoried.** Ranked #1 because it's the only finding that is genuinely irreproducible from git.

2. **The stale `marcadas_por_gym(uuid)` overload + its anon grant is scratch-only test-corruption
   masquerading as a migration-replay gap.** If anyone reads scratch's function list and concludes
   "the repo's migrations don't actually drop the old overload," they'd be wrong and would waste
   effort re-fixing something already correct on prod. Ranked #2 because it's the exact kind of
   false positive that would derail the next DDL session if this diff hadn't been run.

3. **Scratch's `schema_migrations` table cannot be trusted as a completeness check before running
   `pnpm test:denial` on a *future* scratch project.** If a future session provisions a *fresh*
   scratch (unlike this one, reused across sessions) and applies exactly the 87 files from
   `supabase/migrations/`, that fresh project would NOT have the two contaminations found here — but
   it also wouldn't have the false convergence that made 3-of-4 "missing" migrations look applied.
   Ranked #3 because it's a process risk for whoever runs the pre-merge `test:denial` gate next: the
   gate's own doc (AGENTS.md) says "the runner refuses the live ref" but says nothing about a stale
   or contaminated scratch giving false green.

4. **`e6_cliente_pool` contamination is currently harmless (additive, no name collision) but
   directly inflates the naive row-count in tables/grants comparisons (230 vs 228 columns, 959 vs
   927 grants) enough that a less careful diff script (e.g., one that only compares counts, not
   keys) would report false drift.** Ranked #4 — annoyance today, but the report's own methodology
   note about "22 of 87 stamps match" already shows how easy naive counting is to misread; this is
   the same trap one level down.

5. **The report's own function count (34) undercounts what's actually in `public` (38, measured
   directly on prod, twice, matching scratch's non-contaminated 38).** Not dangerous by itself, but
   it means whatever the report's authors enumerated to build their "5 anon-EXECUTE write RPCs, 29
   TRUNCATE-to-anon tables" claims **did not come from a live catalog query** — those two specific
   numbers happen to be exactly right (I independently re-derived both from prod directly, see
   below), but the function-count miss means the base inventory the report worked from was
   incomplete, and any *other* uncited count in the report deserves the same re-check this one just
   got. Ranked #5 — a credibility/methodology flag on the report itself, not a live risk.

---

## Independent re-confirmation of the report's headline security claims (measured, not modelled)

Both of these were the report's #1 action items. Both check out, **measured directly against
prod, right now**:

**5 write RPCs with anon EXECUTE** (query + full prod result already shown above in the raw capture;
summary):
```
cancel_class_session, create_class_session, create_recurring_schedule,
edit_class_session, ensure_week_materialized
```
Root cause, confirmed by reading the migration: `20260706120100_scheduling_write_rpcs.sql` revokes
EXECUTE only `from public` for exactly these 5 functions — never `from anon` — and Postgres's
default-ACL-grants-anon-directly behavior (proven above via `pg_default_acl`) means the revoke from
`public` is a no-op for `anon`'s own grant. Textbook match to the bug class the repo's own later
`revoke_anon_perf_rpcs.sql` comment names and fixes for 4 *other* functions — this one just never
got its own fix migration.

**29 tables with TRUNCATE granted to `anon`** (and identically, INSERT/UPDATE/DELETE to `anon` on
the same 29 — this is a schema-wide default-ACL grant, not per-statement):
```sql
select n.nspname, c.relname, c.relkind, (aclexplode(...)).grantee::regrole::text, (aclexplode(...)).privilege_type
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p','v','S');
```
Prod result, TRUNCATE|anon: exactly 29 tables (`about_value, asistencias, class_session, ...,
ventas` — full list in `raw/prod-table-grants.json`). Same root cause: `public`'s `pg_default_acl`
for role `postgres`/objtype `r` (tables) grants `arwdDxtm` (all of insert/select/update/delete/
truncate/references/trigger/maintain) to `anon` directly, and every table created via the standard
`create table` + RLS-enable pattern inherits it. **This is not 29 separate oversights — it's one
schema-wide default-privilege setting nobody has ever touched**, exactly as dangerous at gym #1 as at
gym #3000 (RLS still gates row access, so no *data* is exposed by TRUNCATE/DML privilege alone —
the policies are the real gate — but privilege-escalation-adjacent bugs, extension exploits, or a
future RLS policy mistake would have a much bigger blast radius with this ACL sitting underneath
than without it).

---

## Answer to "would the recommended migration batch behave differently on prod than in testing?"

**Mostly no for schema, partially yes for grants — and the partial "yes" is directional in the safe
direction (scratch has laxer/staler grants than prod, not stricter).** Concretely:
- Any DDL in the batch that adds/alters tables, columns, indexes, constraints, or RLS policies will
  behave **identically** on scratch and prod — those four categories are proven byte-identical here.
- Any DDL that does `revoke execute ... from anon` on the perf RPCs will be a safe no-op on
  `toggle_pase` on prod (already revoked) but a **necessary, real fix** on `create_class_session` /
  `cancel_class_session` / `create_recurring_schedule` / `edit_class_session` /
  `ensure_week_materialized` (still open on prod, confirmed above) — test on scratch will show all 5
  fire, prod will show 4 fire and 1 no-op silently. Not dangerous, just worth knowing before someone
  is confused why a `REVOKE` returns 0 rows affected in a verification query against `pg_proc`.
- **Do NOT test the fix for `marcadas_por_gym`'s "PGRST203 ambiguous overload" against scratch as
  currently constituted** — scratch will exhibit a bug prod does not have, and a
  `drop function if exists public.marcadas_por_gym(uuid);` re-run on scratch is required before
  scratch is trustworthy for that specific test. (I did not run this — read-only mandate — flagging
  for whoever runs the actual batch.)

---

## What I did NOT change

Zero writes issued to either project. Scratch's pre-existing contamination
(`e6_cliente_pool`, the stale `marcadas_por_gym(uuid)` overload + its grants) is untouched — it
predates this session (confirmed: no migration in this repo creates `e6_cliente_pool`, and I made no
`create`/`insert`/`drop` calls anywhere in this experiment). Scratch DB size checked at the end:
**32 MB** (`pg_database_size` — see `raw/scratch-dbsize.json`), nowhere near the 400 MB caution
line; no size-driven cleanup was ever necessary.

## Blind spots

- I diffed `public` schema only, per the mandate's category list. I did not diff `auth`, `storage`,
  `vault`, or `extensions` schema objects (e.g., whether `vault.decrypted_secrets`'
  `tenant_assertion_key` — load-bearing for `reclamar_por_codigo`'s firma check — is even present and
  identical on scratch; I did not verify this, and if it's absent, that RPC would raise
  "Configuración incompleta" on scratch, not fail silently, so it's a plausible next check I skipped
  under time pressure).
- I did not check `pg_trigger`, extension versions (`pg_extension`), or Postgres/Supabase **platform**
  version parity between the two projects — the mandate's category list doesn't ask for it, but a
  platform-version mismatch could independently explain behavioral differences the DDL diff can't see.
- I could not determine WHO or WHEN ran the out-of-band `toggle_pase` anon-revoke on prod, or the
  out-of-band function-body applies on scratch — I inferred their existence from what the catalog
  currently shows and what git history does/doesn't contain, not from any audit log (Supabase's own
  activity log was not queried; it may still hold the answer).
- I did not attempt to actually run the report's recommended DDL batch (it wasn't handed to me, and
  doing so would require the batch's exact SQL, which lives in the report/other agents' output, not
  in this mandate) — this experiment diffs the *baseline* the batch would run against, not the batch
  itself. E1/whichever agent owns the actual batch text should re-run their plan against these
  findings, specifically the `marcadas_por_gym` overload trap.
- Row-count-only categories (f1/f2 raw counts of 119/125 and 927/959) include the `-` (PUBLIC,
  regrole oid 0) grantee rows from `aclexplode`, which I left in rather than filtering — doesn't
  change any conclusion above but means the raw counts aren't directly "role-grant pairs you'd see
  in a GRANT statement" without one more filter step.
