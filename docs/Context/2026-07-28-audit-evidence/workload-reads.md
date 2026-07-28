# Workload / Reads audit — per-request Postgres cost of RED 2.0's hot paths

Agent: `workload:reads`. Scope: characterize the ACTUAL per-request DB cost from the codebase
(file:line evidence) plus live EXPLAIN/index checks against prod (read-only). No writes, no DDL.

Target scale reminder: ≥3,000 gyms × 150–300 members. Revenue reference: ~300–1,500 MXN/gym/mo.

---

## 0. Method

- Every DAL function in `packages/data/src/server/*.ts` that a hot path touches was read in full;
  round-trip counts are counted from the actual `await supabase.from(...)`/`.rpc(...)` call sites,
  crediting `react`'s `cache()` memoization where the code demonstrably shares one instance
  (argument-identity dedup — confirmed by reading the `cache()` wrapper, not assumed).
- Live verification via the Supabase MCP (read-only): `pg_indexes`, `pg_stat_user_tables`,
  `pg_policies`, `pg_proc`, and `EXPLAIN` (no ANALYZE) against real prod rows. All SQL + output is
  inlined below.
- "Rows read" and "bytes" are measured at the CURRENT live scale (4 gyms / 116 clientes / 175
  ventas) and then modelled forward to 3,000×225. Modelled numbers are flagged `[MODELLED]`.

---

## 1. Root layout / tenant resolution — runs on every navigation, both apps

**File:** `packages/data/src/server/resolve-tenant.ts`, wired from `apps/client/src/proxy.ts:38-42`
and `apps/admin/src/proxy.ts:29-32`.

- `resolveTenant()` (resolve-tenant.ts:164-179) resolves `x-gym`/`x-brand` from either a
  `gym_domain→gym` host lookup or a `?gym=` slug override, running the two lookups **in
  parallel** (`Promise.all` at line 171-174) when both are needed.
- Both lookups are gated by a **60s in-process TTL cache** (`hostCache`/`slugCache`,
  resolve-tenant.ts:58-95), including **negative caching** (an unmapped host is cached too, line
  50-56). On a cache hit: **0 Postgres round trips**. On a miss: **1-2 round trips**
  (`gym_domain` select + `gym` select, resolve-tenant.ts:121-129, 185-199), both `.maybeSingle()`
  reads against the tiny `gym`/`gym_domain` tables (4 rows today; even at 3,000 gyms these tables
  stay small — this is the one axis that scales with GYM count, and 3,000 rows is nothing for a
  btree lookup).
- **Verdict: this seam is genuinely fine.** The TTL cache means steady-state traffic pays
  amortized ~0 queries/request regardless of request volume — it does NOT multiply across every
  request the way the mandate worried it would. Falsification check: "what would have to be true
  for this to be wrong?" — a per-INSTANCE cache (Vercel serverless = many cold instances) means
  the 60s TTL is really "60s per warm lambda", so at low/bursty traffic each new instance pays the
  1-2 round trips again. This is a real but minor cost (a few ms, tiny tables), not a scale
  breaker. Exit trigger: if `gym_domain`/`gym` ever stop being tiny (they won't — one row per
  gym/domain) or if cold-start rate rises enough that the 1-2 round trips start dominating p50
  latency (would need Vercel invocation telemetry this audit didn't pull).

- Client app root layout ALSO does its own `createClient()` + `auth.getClaims()`
  (`apps/client/src/app/layout.tsx:57-59`) for the signed-in-header affordance — this is a GoTrue
  call, not a Postgres round trip, but it duplicates the proxy's own `getClaims()` call
  (`apps/client/src/proxy.ts:79`) — 2 JWT verifications per request instead of 1. Not scored here
  since the mandate is Postgres round trips, but noted since GoTrue verification isn't free either.

- Admin `(app)` layout: `getOperatorGym()` (`packages/data/src/server/gym.ts:74-77`, resolver at
  45-72) runs **2 sequential round trips** (`gym_membership` select then `gym` select by id —
  necessarily sequential, the second depends on the first's `gym_id`) **once per request**,
  `cache()`-wrapped and keyed so every downstream DAL call in the SAME request (every admin page
  calls `getOperatorGym()` itself) shares the SAME 2 queries — confirmed by the comment at
  gym.ts:38-44 and by tracing every admin page below. This is the single most-reused round-trip
  pair in the whole admin app and it is correctly deduped.

---

## 2. Client `/reservar` + `/perfil` overlay (same server component; `?perfil=1`)

**File:** `apps/client/src/app/reservar/page.tsx:47-95`, DAL:
`packages/data/src/server/agenda-miembro.ts`.

There is no separate `/perfil` route — the perfil overlay is `getPerfilResumenMiembro`, called
from the SAME `Promise.all` as the week agenda (reservar/page.tsx:77-81). Both paths below.

Happy-path trace (signed-in member, already has a `gym_membership` row — the common case):

| step | file:line | round trips | notes |
|---|---|---|---|
| `getEsMiembro` | agenda-miembro.ts:170-174 | 1 | `gym_membership` select, `.limit(1)` — **not** `cache()`-wrapped (deliberately, for the self-heal retry) |
| `resolverMiembroGym` | agenda-miembro.ts:140-161 | 1 (shared) | `gym_membership` ⋈ `gym` PostgREST embed, `cache()`-wrapped — the 3 branches below (agenda/saldo/perfil) all call this with identical args, so `react`'s `cache()` dedupes to ONE query despite 3 call sites (confirmed by the docstring at 134-139 and by the function signature) |
| `fetchSesionesMiembro` (agenda) | agenda-miembro.ts:182-260 | 1 + 5 (parallel) + 0-1 | `class_session` select (1, line 188) → THEN `Promise.all` of `class_type`, `class_session_coach`, `reservation` (mis reservas), `fetchFavoritoId`→`fetchClienteRow`, `contarActivos` RPC (5, lines 203-217) → conditional `coach` select if `coachIds.length` (1, line 227-229) |
| `getSaldoMiembro` | agenda-miembro.ts:383-403 | 0 (shared) | reuses cached `resolverMiembroGym` + `fetchClienteRow` — genuinely free once the agenda branch has run |
| `getPerfilResumenMiembro` | agenda-miembro.ts:516-566 | 0 (shared) + `Promise.all` of 3 stages | `fetchClienteRow` (shared/cached) → `Promise.all([fetchProximasReservas, fetchMembresia, getPlanesPublicos])` (line 537-543) |
| ↳ `fetchProximasReservas` | agenda-miembro.ts:581-652 | 1 + 2 (parallel) + 0-1 | `reservation` ⋈ `class_session` embed (1, line 586) → `Promise.all([class_type, class_session_coach, favoritoId-cached])` (2 new, line 607-611) → conditional `coach` select (1, line 618-619) |
| ↳ `fetchMembresia` | agenda-miembro.ts:480-501 | 1 RPC | `mi_membresia()` — **see §5, ranked #1 finding** |
| ↳ `getPlanesPublicos` | marketing.ts:88-118 | 2 (parallel) | `paquetes` + `plan_feature`, both `.eq("gym_id", gymId)` — correctly scoped |

**Total: up to 17 Postgres round trips per `/reservar` render** (worst case, every conditional
branch hit): 1 (esMiembro) + 1 (resolverMiembroGym) + 8 (sesiones: 1+5+1 coach) + 0 (saldo) + 7
(perfil: 1+2+1 + 1 membresia + 2 planes) = 17. Best case (no coaches assigned, all purchases
inside the 30-day window) is ~13.

Most of this is well-parallelized (5 separate `Promise.all` batches), and row counts stay small
(a gym's weekly class count, the member's own handful of reservations, ~15 paquetes) — **this is
a latency tax, not a data-growth problem**: even at 3,000 members per gym, the row volumes here
don't change (a member's own week/reservations/plan are bounded, not O(gym size)). The one
exception is `mi_membresia()`'s ventas lookup — see §5 ranked #1, which IS a growth problem hiding
inside this otherwise-flat page.

**Redundancy note:** `getEsMiembro` (1 query, narrow `gym_membership` select) and
`resolverMiembroGym` (1 query, wider `gym_membership ⋈ gym` embed) both query `gym_membership`
for the same signed-in user, back to back, because `getEsMiembro` is deliberately NOT cached (the
self-heal retry needs a fresh read). This is 2 round trips to the same tiny table where 1 could
serve both purposes with a restructure — minor (cheap query, small table), not scored in the
ranking.

**Sequential-that-could-be-parallel check (mandate §c):** `getPerfilResumenMiembro` awaits
`fetchClienteRow` (line 529) BEFORE its `Promise.all` (537), but none of the 3 parallel calls
depend on `cli`. In isolation this would be an avoidable extra round trip — but because
`fetchClienteRow` is `cache()`-wrapped and the SAME call already fires (and is likely already
in-flight) from `fetchFavoritoId` inside the `getAgendaSemanaMiembro` branch of the PAGE-LEVEL
`Promise.all`, `react`'s cache almost certainly collapses these to the same underlying promise.
Flagged but not confirmed as a real extra RTT — would need request-level tracing to verify, which
this audit didn't have DB access to do (Supabase MCP has no per-request instrumentation).

---

## 3. Client `/activar` (activation)

**File:** `apps/client/src/app/activar/page.tsx:27-91`, DAL: `packages/data/src/server/registro.ts`.

Happy path (valid `?codigo=`, host matches, not yet signed in):

1. `invitacionInfo(codigo)` (registro.ts:194-204) → **1 RPC** (`invitacion_info`).
2. Cross-tenant shield (line 46-55) only fires on a HOST MISMATCH — rare, adds `resolveTenant`
   (0-2, cached) + a `construirUrlInvitacion` write-free lookup. Not on the happy path.
3. `sesionActiva` check (line 71-75) only runs `auth.getClaims()` (not Postgres) when a code +
   invitation resolved.
4. `resolveBrand()` — no DB (header read).

**Total: 0-1 Postgres round trips on the happy path.** This is the LEANEST hot path in the
audit — genuinely well-designed, worth stating plainly per the mandate's honesty rule. The actual
write (`reclamarPorCodigo`/`reclamarCliente`, 1 RPC each) happens later in
`apps/client/src/app/auth/confirm/route.ts:33-62`, on the redirect hop after email verification —
still 1 RPC, not a render-time cost.

---

## 4. Admin `/vender` (desk sale screen)

**File:** `apps/admin/src/app/(app)/vender/page.tsx:9-40`, DAL: `packages/data/src/server/clientes.ts`,
`packages/data/src/server/paquetes.ts`.

`Promise.all([searchParams, getPaquetes(), getClientesLite(), resolveBrand(), getOperatorGym()])`
(vender/page.tsx:16-22):

| call | file:line | round trips | rows |
|---|---|---|---|
| `getOperatorGym()` | gym.ts:74 | 0 (shared — already primed by the `(app)` layout's own call) | — |
| `getPaquetes()` | paquetes.ts:34-65 | 1 | 15 rows today, small (per-gym plan catalog) |
| `getClientesLite()` | clientes.ts:61-98 | 2 (parallel: `clientes` full-roster select + `ventas_count_por_cliente` RPC, lines 73-80) | **ALL of the gym's `clientes` rows, unpaginated, no `.limit()`** |
| `resolveBrand()` | apps/admin/src/lib/brand.ts | 0 | header only |

**Total: 5 Postgres round trips (3 page-specific + 2 shared from layout).** Query COUNT is lean —
the problem is what ONE of those queries returns: `getClientesLite`'s `clientes` select
(clientes.ts:74-78) has `.eq("gym_id", gym.id).order("nombre")` and **no `.limit()`/`.range()`
at all**. Confirmed by reading `apps/admin/src/app/(app)/vender/_components/vender.tsx:313`
(`const filteredClients = clientes.filter(...)`) — the ENTIRE roster is shipped to the browser as
an RSC prop and filtered CLIENT-SIDE. **Growth axis: linear in the gym's member count.**

Measured payload width (live query, columns exactly as selected by `getClientesLite`):

```sql
select gym_id, count(*) n,
  avg(pg_column_size(id)+pg_column_size(nombre)+pg_column_size(tel)+pg_column_size(paquete_nombre)
      +pg_column_size(email)+pg_column_size(invitacion_enviada_at)+pg_column_size(auth_user_id)
      +pg_column_size(created_at)) avg_row_bytes
from clientes group by gym_id;
-- gym daa1c888…: n=42, avg_row_bytes ≈ 118.7
```
`[MODELLED]` At 118.7 raw bytes/row × 300 members ≈ 35.6 KB of raw column data; PostgREST/JSON
serialization (repeated key names per row) typically adds ~2-3× over raw column bytes for this
column shape → **~70-110 KB JSON shipped to the browser on every single `/vender` page load**, at
300 members. This refetches on every navigation to `/vender` (RSC props aren't client-cached
across navigations) — a staff member opening the sell screen 20×/day ships that payload 20×/day.

---

## 5. Admin Agenda

**File:** `apps/admin/src/app/(app)/agenda/page.tsx:39-94`, DAL: `packages/data/src/server/agenda.ts`,
`packages/data/src/server/catalog.ts`.

1. `getOperatorGym()` (line 44) — 0 (shared from layout).
2. `getAgendaSemana(d)` (agenda.ts:229-263): `ensureSemanaMaterializada` RPC (1, line 237) →
   `fetchSesionesEnRango` (agenda.ts:99-162): `class_session` select (1, line 104) →
   `Promise.all([class_type, class_session_coach, contarActivos RPC])` (3, line 123-127) →
   conditional `coach` select (1, line 135-137). Subtotal: 1+1+3+1 = 6.
3. `getCoaches()` (catalog.ts:29-40) — **1, unscoped by `gym_id`** (see finding below).
4. `getClassTypes()` (catalog.ts:43-49) — **1, unscoped by `gym_id`** (see finding below).

**Total: 10 Postgres round trips (8 page-specific + 2 shared).** Rows: bounded by the gym's
weekly session count (~15-40 typical), so `getAgendaSemana` itself is constant-ish per gym.

**Finding — `getCoaches`/`getClassTypes` have no `.eq("gym_id", …)`, relying purely on RLS**
(catalog.ts:32-39, 44-48). Live-verified:

```sql
select tablename, policyname, roles, qual from pg_policies
where tablename in ('class_type','coach');
-- class_type_member_select {authenticated}: gym_id IN (SELECT m.gym_id FROM gym_membership m
--   WHERE m.user_id = (SELECT auth.uid()))
```
```sql
explain select id, name from class_type order by name;
-- Sort (cost=31.29..32.29 rows=400 width=48)
--   -> Seq Scan on class_type (cost=0.00..14.00 rows=400 width=48)
```
No index on `class_type.gym_id`/`coach.gym_id` is used because the query never supplies a
`gym_id` predicate for Postgres to push into the RLS subquery — this is EXACTLY the anti-pattern
`ARCHITECTURE.md`'s own convention warns about elsewhere ("the eq flips the correlated-SubPlan
seq scan into an index condition" — clientes.ts:65-67 comment), just not applied here. Current
table sizes: `class_type` 20 rows, `coach` 11 rows (platform-wide, 4 gyms) — trivial today.
**Growth axis: platform-wide GYM count**, not member count — `[MODELLED]` at 3,000 gyms × ~5
class types × ~3 coaches ≈ 15,000 / 9,000 rows platform-wide. Still a small table in absolute
terms (a seq scan of 15K narrow rows is sub-millisecond), so this is a real but LOW-severity
instance of the same bug class as the ventas finding below — flagged for completeness, ranked
lower because the row-count ceiling is orders of magnitude smaller.

The same unscoped pattern also exists in `getPlanesEditor`'s `plan_feature` select
(paquetes.ts:95, no `.eq("gym_id", …)`, unlike its sibling `paquetes` query on the same line
90-94) — noted but not on a page in this mandate's list (it's the admin `/cuenta` plan editor).

---

## 6. Admin cliente-detalle (`/clientes/[id]`)

**File:** `apps/admin/src/app/(app)/clientes/[id]/page.tsx:7-12`, DAL:
`packages/data/src/server/clientes.ts:285-399` (`getClienteFicha`), plus
`packages/data/src/server/roster-nav.ts` (`getVecinos`).

1. `getOperatorGym()` — 0 (shared from layout).
2. `clientes` by id (clientes.ts:297-303) — **1, awaited alone, deliberately** (comment at
   293-296: avoid firing 5 downstream reads on a 404 — a documented, reasonable tradeoff).
3. `Promise.all` of 7 (clientes.ts:311-334):
   - `asistencias` 30-day window (line 313-319) — 1, **indexed** (see below).
   - `ventas` ALL rows for this cliente, no limit (line 320-328) — 1, **UNINDEXED, unscoped** —
     **ranked #1/#2 finding, see below**.
   - `getVecinos(id, supabase)` (roster-nav.ts:49-65) — 1+ (see finding below).
   - `perfil` (1 row) — 1.
   - `listarPlantillas` — 1.
   - `getPaquetes` — 1 (gym-scoped, cached `getOperatorGym`).
   - `getCobro` — 1.
4. Conditional: if the member's most recent purchase predates the 30-day window, one more
   `asistencias` exact-count query (clientes.ts:373-380) — 1.

**Total: 10-11 Postgres round trips (8-9 page-specific + 2 shared).**

### Finding A (ranked #1 overall) — `ventas` has no usable index for a per-cliente lookup, and
### the SAME unscoped pattern is baked into `mi_membresia()`, the RPC every `/reservar` load calls

Live-verified index list for `ventas`:
```sql
select indexname, indexdef from pg_indexes where tablename='ventas';
-- ventas_folio_gym_uq (gym_id, folio)
-- ventas_gym_fecha_idx (gym_id, fecha)
-- ventas_gym_id_idx (gym_id)
-- ventas_idem_gym_uq (gym_id, idempotency_key) WHERE idempotency_key IS NOT NULL
-- ventas_pkey (id)
```
No index has `cliente_id` as a leading column — confirms the mandate's stated baseline.
`EXPLAIN` on the exact query `getClienteFicha` runs (clientes.ts:320-328):
```sql
explain select fecha, created_at, paquete_nombre, monto, metodo, clases, vigencia_tipo, vigencia_dias
from ventas where cliente_id = '3e331af0-9f50-48db-936a-b52bc596be1c'
order by created_at desc, id desc;
--  Sort (cost=7.15..7.15 rows=1 width=68)
--    Sort Key: created_at DESC, id DESC
--    -> Seq Scan on ventas  (cost=0.00..7.14 rows=1 width=68)
--          Filter: (cliente_id = '3e331af0-9f50-48db-936a-b52bc596be1c'::uuid)
```
**Seq Scan confirmed.** Worse: the SAME shape of query is the anchor-sale lookup inside
`mi_membresia()` (`supabase/migrations/20260714120000_mi_membresia_reanchor.sql:59-65`):
```sql
select v.fecha, v.created_at, v.monto, v.vigencia_tipo, v.vigencia_dias
  into ... from public.ventas v
  where v.cliente_id = v_cli
  order by v.created_at desc, v.id desc limit 1;
```
```sql
explain select v.fecha, v.created_at, v.monto, v.vigencia_tipo, v.vigencia_dias from public.ventas v
where v.cliente_id = '3e331af0-9f50-48db-936a-b52bc596be1c' order by v.created_at desc, v.id desc limit 1;
--  Limit (cost=7.15..7.15 rows=1 width=45)
--    -> Sort ... -> Seq Scan on ventas v (cost=0.00..7.14 rows=1 width=45)
--          Filter: (cliente_id = ...)
```
Also confirmed Seq Scan. `mi_membresia()` is `security definer`, called from
`fetchMembresia` (agenda-miembro.ts:484, `supabase.rpc("mi_membresia")`) inside
`getPerfilResumenMiembro` — i.e. **every `/reservar` page render by every member**. Neither query
filters by `gym_id` at all — unlike the sibling `ventas_count_por_cliente` RPC
(`20260714070000_ventas_count_por_cliente_rpc.sql:18-21`, `where gym_id = p_gym_id`, which DOES
use `ventas_gym_id_idx` and is correctly gym-scoped), these two do `where cliente_id = X` alone.
Because there's no supporting index, this is a **Seq Scan of the WHOLE `ventas` table across ALL
gyms**, not just this cliente's rows or this gym's rows — RLS narrows the VISIBLE rows after the
scan, it doesn't prune the scan itself.

**Row/size math, current → target:**
- `ventas`: 175 rows, 234 measured heap bytes/row (`pg_relation_size('ventas')/count(*)`),
  `shared_buffers` = 224 MB (live `SHOW shared_buffers`).
- `[MODELLED]` 224 MB / 234 B ≈ **~1.0M rows** is roughly where `ventas` stops comfortably fitting
  in the shared buffer pool (shared across ALL tenants — every gym's hot pages compete for the
  same 224 MB).
- `[MODELLED]` At 3,000 gyms × 225 avg members × ~1 sale/month (the product's own monthly-renewal
  design, ADR "flat-30"), platform-wide `ventas` grows ~675,000 rows/month. **The buffer-fit line
  (~1M rows) is crossed in month 2 of full-scale operation; year 1 alone reaches ~8.1M rows.**
- Confidence: the Seq Scan finding is **measured** (EXPLAIN, live). The row-count arithmetic is
  **modelled** (linear extrapolation from the stated 1 sale/member/month renewal cadence) — actual
  cadence could differ with annual/quarterly plans, which would push this out further; it could
  also come sooner if adoption front-loads faster than linear.
- **Falsification check:** "this is fine because the query returns only 1 row (`LIMIT 1` /
  small `n`)" is exactly what the ADR-0013 finding already disproved for RLS predicates — a
  narrow RESULT does not mean a narrow SCAN. Checked and confirmed via EXPLAIN above: cost scales
  with table size (`cost=0.00..7.14` at 175 rows), not with the 1-row result.
- **Exit trigger:** add `create index ventas_cliente_id_idx on ventas(cliente_id)` (or
  `(cliente_id, created_at desc)` to also serve the anchor-sale ORDER BY) and re-run these two
  EXPLAINs — reverse the finding once both show an Index Scan.

### Finding B — `getVecinos` (swipe prev/next) is a full ordered scan of the gym's ENTIRE roster,
### on every ficha view

`roster-nav.ts:49-65`: pages through `clientes.select("id").eq("gym_id", gym.id).order("nombre")`
in blocks of 1,000 (the `PAGE` constant, line 7, chosen to defeat PostgREST's ~1000-row response
cap) just to compute one prev-id/next-id pair (`vecinosDe`, line 34-40, a linear `indexOf` over
the full id array). At today's scale (≤300 members/gym) this is 1 round trip returning up to 300
`id` values (~cheap, ~10 KB) — but it is doing O(n) work (full roster fetch + linear scan) for an
O(1) problem (Postgres can answer "next row after this one in `nombre` order" directly via
`nombre > $current ORDER BY nombre LIMIT 1` against the existing `clientes_gym_id_idx`+sort, no
full scan). **Growth axis: linear in gym member count**; crosses into a SECOND round trip only
past 1,000 members/gym (well above the 150-300 target, so not an immediate round-trip-count
problem) but the bytes-scanned-per-ficha-view keeps growing regardless.

### Finding C — the "ship the whole roster" pattern is not isolated to `/vender`

The SAME full-roster-no-`.limit()` shape recurs 3 times across the admin app's daily-use screens,
confirmed by call-site grep:

| DAL fn | file:line (def) | caller | page |
|---|---|---|---|
| `getClientesLite` | clientes.ts:61-98 | `vender/page.tsx:19` | `/vender` |
| `getClientesRoster` | clientes.ts:155-195 | `clientes/page.tsx:10` | `/clientes` (directory) |
| `getClientesParaPase` | clientes.ts:104-119 | `asistencia/page.tsx:10` | `/asistencia` (pase de lista) |

All three: `.from("clientes").select(...).eq("gym_id", gym.id).order("nombre")`, no `.limit()`,
followed by client-side filtering. This is the SAME growth-with-member-count pattern in triplicate
across the three highest-traffic staff screens (sell, browse roster, take attendance) — every one
of them re-ships the full member list on every visit.

---

## 7. Summary table

| path | queries/render (happy path) | rows read (today, live) | est. bytes (today → 300 members `[MODELLED]`) | growth axis |
|---|---|---|---|---|
| root layout + tenant resolution | 0-2 (60s TTL-cached; effectively 0 amortized) | 0-2 rows | <1 KB | **constant** — genuinely fine |
| admin `(app)` layout — `getOperatorGym` | 2 (once/request, shared by every page) | 2 rows | <1 KB | constant |
| client `/reservar` + `/perfil` | up to 17 | ~10-40 rows | ~5-15 KB | mostly constant; `mi_membresia()`'s ventas lookup is **platform-wide unindexed** |
| client `/activar` | 0-1 | 0-1 rows | <1 KB | constant — leanest page audited |
| admin `/vender` | 5 (3 page + 2 shared) | 42 rows today → 300 `[MODELLED]` | ~9 KB today → ~70-110 KB `[MODELLED]` | **per-member** (full roster, client-filtered) |
| admin Agenda | 10 (8 page + 2 shared) | ~15-40 sessions + 31 catalog rows | ~5-10 KB | mostly constant; `getCoaches`/`getClassTypes` unscoped (**per-gym-count**, low severity today) |
| admin cliente-detalle | 10-11 (8-9 page + 2 shared) | 30d asistencias + ALL of member's ventas + ALL gym clientes (neighbors) | ~5-20 KB + roster scan | **per-member-history** (ventas unbounded) + **per-gym-members** (getVecinos) + **platform-wide unindexed ventas seq scan** |

---

## 8. Ranked worst 5 (worst first)

**1. `mi_membresia()` RPC's unindexed, gym-unscoped `ventas` lookup — hit on EVERY member's
`/reservar` page load.** This is the highest-FREQUENCY occurrence of the seq-scan bug (every
member, every booking-home visit — the client app's single most-used page) landing on a
platform-wide table with no supporting index. Measured: `EXPLAIN` shows `Seq Scan on ventas`
(migration `20260714120000_mi_membresia_reanchor.sql:59-65`; confirmed live above). **Breaks at:**
`[MODELLED]` ~1M platform-wide `ventas` rows (the 224 MB `shared_buffers`-fit line, computed from
the LIVE `234 B/row` heap width) — reached in month 2 of full 3,000-gym operation at the product's
own ~1 sale/member/month renewal cadence; every gym's buffer-cache locality degrades from this
one query shape well before that, since it's the shared pool. Confidence: seq-scan existence =
measured; row-count timeline = modelled. Exit trigger: `create index on ventas(cliente_id,
created_at desc, id desc)` — re-run the EXPLAIN above and confirm an Index Scan replaces it.

**2. The identical unindexed `ventas.cliente_id` seq scan inside `getClienteFicha`
(admin cliente-detalle).** Same root cause and same fix as #1, one query
(clientes.ts:320-328), lower frequency (staff-only, one click per ficha view vs. every member's
booking-home) but the SAME table, same missing index, same platform-wide scan — degrades in
lockstep with #1. Ranked below #1 purely on call frequency, not severity.

**3. Triplicated "ship the whole roster" pattern — `getClientesLite`/`getClientesRoster`/
`getClientesParaPase`, each a full unpaginated `clientes` scan client-filtered in the browser,
on `/vender`, `/clientes`, and `/asistencia` respectively.** Not yet a round-trip-count problem at
150-300 members/gym (stays at 1 round trip until >1,000 rows), but IS a real and growing
bytes-over-the-wire + browser-memory cost: `[MODELLED]` ~70-110 KB JSON per page load at 300
members, on THREE of the highest-traffic staff screens, re-fetched on every navigation (no
client-side cache across RSC navigations). **Breaks at:** JSON payload size becomes
user-noticeable (mobile connections, the admin app is phone-width per its own layout,
`(app)/layout.tsx:37`) somewhere past a few hundred members — `[MODELLED]`, not measured, since
this audit could not safely seed 1,000+ live clientes rows to time it. A genuine second-order
break is >1,000 members/gym, where `getVecinos` (used by cliente-detalle, same table) starts
needing a SECOND round trip per its `PAGE=1000` pagination loop (roster-nav.ts:52-63).

**4. `getVecinos`'s full-roster scan for a 2-value prev/next lookup, on every cliente-detalle
view.** Architecturally the same class of bug as #3 (O(n) roster fetch for an O(1) answerable
question) but isolated to one page and one purpose; ranked below #3 because it's a single call
site rather than a triplicated pattern, and its byte cost is smaller (only the `id` column).
**Breaks at:** >1,000 members/gym for the round-trip count (PostgREST's page cap), continuous
bytes-scanned growth below that.

**5. `getCoaches`/`getClassTypes` (admin Agenda) reading with no `.eq("gym_id", …)`, relying on a
correlated-subquery RLS policy to filter a platform-wide table.** Confirmed via `EXPLAIN` (`Seq
Scan on class_type`) and `pg_policies` (the `authenticated`-role policy is a correlated `gym_id IN
(SELECT …)`, the exact shape the prior multitenant audit flagged as O(rows), not O(1), per row).
Ranked last because the absolute table sizes stay small even at full target scale
(`[MODELLED]` ~15,000 `class_type` / ~9,000 `coach` rows platform-wide at 3,000 gyms × ~5/3 rows
each) — a seq scan over 15K narrow rows is sub-millisecond. Included for completeness and because
it is hit on every Agenda load (a staff daily-use screen), not because it currently threatens
latency.

**Honest inclusion, not ranked (rule #7 — genuinely fine, said plainly):** the host→tenant
resolution seam (§1) does NOT multiply across every request the way the mandate worried — the
60s TTL cache (with negative caching) keeps it amortized-constant, and the underlying
`gym`/`gym_domain` tables stay tiny even at 3,000 gyms. `/activar` (§3) is the leanest, best-
designed hot path in the audit: 0-1 round trips on the happy path. Both are stated here so the
ranking above doesn't read as "everything is broken" — most of the codebase's DAL is genuinely
careful about `.eq("gym_id", …)` scoping (see the `ventas_count_por_cliente`/
`asistencias_mes_por_cliente` RPCs, which explicitly replaced correlated per-row embeds with
grouped DB-side counts — clientes.ts:70-72, 162-164 comments) — the findings above are the
exceptions to an otherwise-deliberate pattern, not the norm.

---

## 9. Blind spots (what this audit did NOT examine)

- **No load testing.** Every "breaks at N" number for data-growth findings is `[MODELLED]`
  (linear extrapolation from live row widths + the stated shared_buffers), not measured under
  concurrent load — this audit was read-only against a 4-gym/116-clientes prod database and
  explicitly forbidden from writing rows or DDL. A real seq-scan latency curve (vs. row count,
  vs. concurrent QPS) needs a scratch project with seeded data, which this session did not build.
- **Connection-pool / Supavisor pooling behavior** under the 17-round-trip `/reservar` fan-out at
  concurrent load was not modelled — this audit counted round trips per render, not how they
  interact with `max_connections=60` under many simultaneous members hitting `/reservar`. That's
  a distinct "connections" axis another agent's mandate likely owns.
- **Vercel-function-to-Supabase network latency** (region colocation) was not measured here — the
  17-round-trip count on `/reservar` is a query-count fact; whether each round trip costs 5ms or
  50ms depends on colocation, which prior work (`perf-50ms-loop` memory) flagged as still open.
- **Write paths were not characterized** — `registrar_venta`, `reservar_clase`,
  `pasar_lista_sesion`, and other RPCs mentioned in passing were read only far enough to confirm
  they're RPCs, not analyzed for their own write-side row/lock cost. Out of this mandate's scope
  (reads), but the ventas-index finding above (§6 Finding A) will ALSO affect any write path that
  does a per-cliente ventas lookup before writing (e.g. duplicate/idempotency checks) — not
  verified either way.
- **Client-side re-fetch behavior** (does the Vender/Clientes/Asistencia client component ever
  re-fetch the roster via a server action after the initial RSC load, e.g. after a mutation?) was
  not traced into the `_components/*.tsx` client islands beyond confirming the initial prop shape
  and the `.filter()` call site — a mutation-triggered `router.refresh()` would re-run the FULL
  page-level `Promise.all` including the whole-roster fetch again; not confirmed either way.
- **`clase/[sessionId]`, `confirmada/[sessionId]`, and admin `/asistencia` pase-de-lista roster
  view** were read only tangentially (via `getSesionRoster`/`getClientesParaPase` call sites) —
  not in this mandate's named path list, so not given a full trace. `getSesionRoster`
  (agenda.ts:290-327) itself calls `getClientesParaPase` internally, so it inherits Finding C's
  full-roster-scan cost on every "pasar lista" sheet open, which is worth another agent's look.
- **Storage/Realtime/edge functions**: confirmed zero usage per the mandate's own baseline
  (unused), not re-verified independently here.
