# Signal inventory: everything the DB can already say about a member's life

Issue #183 (part of map #180). Every claim below names a file, table, migration, or
line — no signal is asserted from memory.

## Group 1 — already on `ClienteRosterDTO` (`getClientesRoster`, `packages/data/src/server/clientes.ts:155-195`)

| Signal | Source | True meaning | Failure mode |
|---|---|---|---|
| `estado` | `derivarEstado` (`packages/domain/src/rules.ts:106-116`) | `activo \| por_vencer \| sin_clases` from `{clases, dias}` | Only 3 tiers. `sin_clases` covers BOTH "expires today" and "expired 400 days ago" — no lapsed/churned tier exists in the domain at all (map fact, confirmed at `rules.ts:106-116`). |
| `diasRest` | `diasRestantes` (`rules.ts:77-81`) | Whole days to `vence`, negative once past | A **billing** field, not an attendance field — the map's central finding. A member who pays but never trains and a member who trains daily with the same `vence` render identically. |
| `clasesRest` | `forfeit` (`rules.ts:185-188`) applied in `derivarCliente` (`packages/data/src/server/derive.ts:36-66`) | Remaining classes, forced to 0 once `estaVencido` | Same billing-only blind spot as `diasRest`; `"ilimitado"` clients carry no class-pressure signal at all. |
| `asistEsteMes` | `asistencias_mes_por_cliente` RPC, called with `monthStartIso(hoy)` (`clientes.ts:121-123,173-176`) | Count of this-month VISITS (not member-days; visit-unit fixed by `20260729120000_reservation_truthfulness.sql:764-775`, count is `count(*)` minus `perdonada` duplicates) | **Resets to 0 on the 1st of the month by construction** (`p_desde = monthStartIso(hoy)`) — a member who trained daily through the 31st reads identically to one who never showed, for the first days of the new month. This is the exact failure mode #183 names. |
| `invitacion` (`estado`, `badge`) | `derivarInvitacion` (`packages/data/src/server/derive.ts:150-157`), fed by `email`, `invitacion_enviada_at`, `auth_user_id` — all three already selected at `clientes.ts:169` | `sin_email \| sin_invitar \| invitacion_enviada \| cuenta_activa` + an es-MX badge (appends the invite date) | None material — this is a clean derivation. **Correction to the ticket's own framing**: #183 groups "`invitacion_enviada_at`, `auth_user_id`" under group 2 ("NOT surfaced"). Reading `clientes.ts:155-195` shows this is false — both raw columns are already selected AND already folded into `invitacion` on every roster row. The doctrine may already assume invite/account state is present; nothing new is needed. |
| `pendienteOnline` | `esRegistroOnlinePendiente` (`derive.ts:163-168`) | Auth-linked (Door 2) member with no active package | Boolean only — no "how long has this online signup sat pending" duration is exposed alongside it. |
| `paquete` | Raw `paquete_nombre` (text snapshot on `clientes`, `20260530023224_create_ventas_core.sql:16`) | The CURRENT package's display label | Free-text snapshot, not a catalog reference — see group 3 (no stable tier identity). |

## Group 2 — in the DB, NOT on the roster: what it costs to add

### Last visit date per client (from `asistencias`)

**Confirmed derivable in ONE query, mirroring an existing proven pattern — not an N+1.**

`asistencias_mes_por_cliente(p_gym_id, p_desde)` (`supabase/migrations/20260729120000_reservation_truthfulness.sql:764-775`) already does exactly this shape of aggregate:

```sql
select cliente_id, count(*)::int as n
from public.asistencias
where gym_id = p_gym_id and deleted_at is null and fecha >= p_desde and not perdonada
group by cliente_id;
```

A last-visit-date RPC is the same shape with `max(fecha)` instead of `count(*)` and no lower bound:

```sql
select cliente_id, max(fecha) as ultima_visita
from public.asistencias
where gym_id = p_gym_id and deleted_at is null
group by cliente_id;
```

- **Index**: `asistencias_gym_fecha_idx (gym_id, fecha) where deleted_at is null` (`supabase/migrations/20260713180000_respaldo_base_indexes.sql:13-14`) covers the `gym_id` filter; `asistencias_cliente_fecha_idx (cliente_id, fecha) where deleted_at is null` (`supabase/migrations/20260530031218_create_asistencias.sql:20`) additionally supports the per-client grouping. **Both indexes already exist** — no new index needed.
- **Cost difference vs. the existing monthly aggregate**: the monthly RPC is bounded to O(month) by its `fecha >= p_desde` filter (the exact point `20260713180000`'s comment makes — "turns the month window into O(month) instead of O(gym lifetime)"). A **lifetime** last-visit aggregate has no lower bound, so it scans the gym's ENTIRE `asistencias` history (still index-driven on `gym_id`, still one gym's rows only — bounded, not a cross-tenant scan — but O(gym lifetime) rather than O(month)). At current scale (map fact: 21 live clients; PERF-LOOP.md's synthetic gate scale: 5000 `asistencias` seeded rows, `PERF-LOOP.md:55`) this is cheap; it grows with gym age.
- **Verdict: one query, index-backed, cheap today. Effectively available**, not merely theoretical — it is the SAME RPC shape already shipped twice (`ventas_count_por_cliente`, `asistencias_mes_por_cliente`).

### Purchase history (from `ventas`)

- **Lifetime purchase count**: already computed by the existing `ventas_count_por_cliente(p_gym_id)` RPC (`supabase/migrations/20260714070000_ventas_count_por_cliente_rpc.sql:11-22`), already wired into `getClientesLite` (`clientes.ts:73-95`) for `primeraCompra` — but **`getClientesRoster` does not call it**. Adding it to the roster is zero new SQL, one more `Promise.all` leg using an RPC already proven at this exact scale.
- **First purchase / last purchase / total spend**: NOT shipped, but the same shape as the two existing count RPCs — `min(fecha)`, `max(fecha)`, `sum(monto)` grouped by `cliente_id`:
  ```sql
  select cliente_id, min(fecha) as primera, max(fecha) as ultima, sum(monto) as total
  from public.ventas
  where gym_id = p_gym_id
  group by cliente_id;
  ```
- **Index**: `ventas_gym_fecha_idx (gym_id, fecha)` (`supabase/migrations/20260713180000_respaldo_base_indexes.sql:10-11`) already exists and covers this exact filter/group shape.
- **Months-as-member**: not a `ventas` question at all — it is `clientes.created_at`, already selected in `getClientesLite` (`clientes.ts:76`) and `getClienteFicha` (`clientes.ts:300`) but **absent from `getClientesRoster`'s select list** (`clientes.ts:168-170` selects `id, nombre, tel, paquete_nombre, clases_restantes, vence, email, invitacion_enviada_at, auth_user_id` — no `created_at`). Cost: **free** — one extra column on an already-firing query, no new round trip, no aggregate.
- **Verdict: all of first/last purchase/total spend are one query, index-backed. Lifetime count is already computed elsewhere at zero marginal cost. Alta date is a free column add.**

### Reservation / no-show history (#162/#164/#165/#169)

`no_show` is **deliberately never stored** (`reservation` table comment, `supabase/migrations/20260706170000_create_reservation_and_reservar_clase.sql:51-53`; reaffirmed by `20260729120000_reservation_truthfulness.sql:45-47`: "no sweep, no stamp, no state to repair"). It is derived per-session, per-booking, at read time by `esNoAsistio` (`packages/domain/src/rules.ts:487-494`), consuming `ventana_arribo` — currently invoked ONLY inside a single class session's roster (`packages/data/src/server/agenda.ts:334`), never across a member's whole history.

A roster-wide "no-show count" would need a NEW aggregate — a join, not a single-table group-by:

```sql
select r.member_id, count(*)::int as n
from public.reservation r
join public.class_session cs on cs.id = r.class_session_id
where r.gym_id = p_gym_id
  and r.status = 'reservada'
  and upper(public.ventana_arribo(cs.starts_at, cs.duration_min)) <= now()
group by r.member_id;
```

This is expressible in ONE query (mirroring the `ventana_arribo`/`pasar_lista_sesion` SQL that already exists), but:

- **No supporting composite index exists.** `reservation` has `reservation_gym_id_idx`, `reservation_class_session_id_idx`, `reservation_member_id_idx`, and a partial `reservation_session_active_idx (class_session_id) where status in ('reservada','asistida')` (`20260706170000_create_reservation_and_reservar_clase.sql:65-71`) — none cover `(gym_id, status)` or `(gym_id, member_id, status)`. The filter `r.gym_id = p_gym_id and r.status = 'reservada'` would run off the single-column `gym_id` index plus a row-level filter, not an index-only scan.
- At today's scale (PERF-LOOP.md's synthetic seed: 1000 `reservation` rows vs. 14 in production, `PERF-LOOP.md:57`) this join is still small and likely cheap — but it is **qualitatively different** from the last-visit/purchase-history aggregates: those are provably cheap on EXISTING indexes; this one is derivable but **would need a new index to carry the same guarantee at scale**.
- **Verdict: derivable in one query, NOT an N+1 — but costs a join with no purpose-built index today. Label it "derivable, index work required," not "available."**

### Account / invite state

Already covered in Group 1 — this is on the roster today via `invitacion`. No cost to state (already paid for).

## Group 3 — not captured at all

| Signal | Evidence it is absent |
|---|---|
| **Freeze / hold** | The ONLY occurrence of "congelar" in the schema is copy inside a seeded WhatsApp FAQ template (`supabase/migrations/20260706160100_seed_red_demo_client_and_content.sql:65-66`) — a canned answer telling members they CAN ask to freeze. No `congelado`/`hold_desde`/`hold_hasta` column exists anywhere in `supabase/migrations/`. The policy is marketed; the data model does not implement it. |
| **Cancellation reason** | `reservation.status` has a `cancelada` state (`20260706170000...sql:51-55`) and `cancelar_reserva` (`20260706180000_cancelar_reserva.sql`) writes `cancelled_at`, but there is no reason/motive column anywhere on `reservation`, `ventas`, or `clientes`. A booking cancellation is capturable; WHY is not. |
| **Membership tier identity** | `clientes.paquete_nombre` (`20260530023224_create_ventas_core.sql:16`) is a **free-text display snapshot**, not a foreign key to `paquetes`. `paquetes` (`create_ventas_core.sql:25-38`) is a per-gym catalog, but nothing on `clientes` or `ventas` references a `paquetes.id` — each `ventas` row snapshots its OWN `paquete_nombre`/`clases`/`vigencia_tipo`/`vigencia_dias` (`create_ventas_core.sql:48-62`) independently of the catalog row that may since have changed or been deleted. There is no stable "this member is on the Ilimitado tier" identity to query — only the latest sale's text snapshot. |
| **Lead-before-customer** | `contact_message` (`supabase/migrations/20260706170100_create_contact_message.sql:27-36`) is a genuine pre-customer intake table (anon prospect submits `nombre`/`correo`/`mensaje`), but it has **no `cliente_id` column and no join to `clientes`** — it is a marketing inbox, structurally disconnected from the member lifecycle. A prospect who later becomes a member leaves no linked trail. |
| **Last contacted / staff notes** | No `nota`/`contactado_at`/similar column on `clientes` anywhere in `supabase/migrations/`. (`paquetes.nota` exists — `20260706220000_red_remediation_schema_touches.sql:18` — but that is a per-PLAN marketing note for the public Precios page, unrelated to a per-member record.) |

## Group 4 — cost against the sub-50ms budget (perf work at `f2301fc` / `PERF-LOOP.md`)

`admin/clientes` is one of the 19 gated routes and has the **least headroom of any passing route**. Measured at the repo's own synthetic worst-case seed (500 `clientes`, 3000 `ventas`, 5000 `asistencias` — `PERF-LOOP.md:53-55`, chosen because "production is a demo-scale dataset" and a per-row cost needs a bigger fixture to show up, `PERF-LOOP.md:59-61`):

- Baseline: **65.8 ms FAIL** (`PERF-LOOP.md:101`), with only the raw 500-row `clientes` select + the whole month's `asistencias` rows pulled and counted in JS (`PERF-LOOP.md:136`).
- After the grouped-aggregate RPCs shipped (`ventas_count_por_cliente` + `asistencias_mes_por_cliente`, `20260714070000`): **67.4 ms, barely moved** (`PERF-LOOP.md:272`) — "cost is the 500-row select itself + RLS, not the count leg."
- After RLS uncorrelated-policy rewrite: **61.5 ms** (`PERF-LOOP.md:273`).
- After proxy-cache dedup: **58.4 ms, still the ONLY FAIL** at that point in the loop (`PERF-LOOP.md:274`) — attributed to "SSR+flight of 500 rows" (`PERF-LOOP.md:235`).
- Only PASSED (**27.3 ms**) after a PRODUCT change — windowed initial SSR (`ROSTER_WINDOW=50`, `useRevealedWindow`, `apps/admin/src/app/(app)/clientes/_components/clientes.tsx:85`) — cutting rendered rows, not query count (`PERF-LOOP.md:275`).

**Reading for #183**: the route's margin under 50 ms at 500-row scale is currently ~23 ms, and that margin was bought by a UI change (windowing), not headroom in the data layer. Any new per-client signal added to `getClientesRoster`:

- **One more grouped-aggregate RPC leg (last-visit, purchase history)** joins the same `Promise.all` the roster read already runs (`clientes.ts:165-177`) — this is exactly the shape that took the existing `asistencias_mes_por_cliente` leg from "the whole month's rows in JS" to a sub-5ms grouped count. **Cheap**, by direct analogy to a measured, shipped change.
- **A per-row / N+1 query (500 individual "last visit" or "no-show count" lookups, one per client)** is not hypothetical risk — it is the SAME shape PERF-LOOP.md's baseline already measured and rejected (the pre-`20260714070000` `ventas(count)` embed, "evaluated once PER row of the 500-cliente roster," `clientes.ts:70-72` comment) at **102 ms** of cost on `vender` alone (`PERF-LOOP.md:272`, `-102.4` after removing it). **Any group-2 signal implemented as a per-row query is not "slow" — it puts the route back at or above its pre-loop FAIL baseline. Label it effectively unavailable under this repo's current budget.**
- **The no-show aggregate's join** (reservation ⋈ class_session, no purpose-built index) is the one group-2 signal whose cost is not yet provably cheap — it would need to be measured under `pnpm perf` before being assumed safe, unlike last-visit and purchase-history which mirror an already-measured, already-cheap RPC shape exactly.

## Group 5 — tenancy check

Every read above is scoped by an explicit `p_gym_id` parameter passed from `getOperatorGym(supabase)` (`clientes.ts:158`), matching the two existing RPCs' signature (`ventas_count_por_cliente(p_gym_id uuid)`, `asistencias_mes_por_cliente(p_gym_id uuid, p_desde date)`) and this repo's stated convention that `.eq("gym_id", …)` / `p_gym_id` is a scope selector on every staff read (`clientes.ts:64-67` comment, spec 2026-07-13 §1.1). All four candidate tables carry a direct `gym_id` column (`ventas_gym_id_idx`, `asistencias_gym_id_idx` — `supabase/migrations/20260702161613_gym_id_expand_tenant_tables.sql:246-247`; `reservation_gym_id_idx` — `20260706170000...sql:65`), so a gym-scoped aggregate never needs to join through `clientes` to find its tenant boundary.

**None of the group-2 signals repeats the known multi-gym RPC roulette bug class** (`mi_membresia` / `toggle_favorito_tipo` resolving a member's row by `auth_user_id` alone with no gym filter, memory `multigym-rpc-roulette.md`) — that bug is specific to CLIENT-side, single-row RPCs that resolve identity from `auth.uid()`. Every roster signal here is an ADMIN-side, staff-authenticated, already-gym-scoped aggregate (`p_gym_id` explicit, never inferred from the caller's own membership), the same shape as the two RPCs already shipped and already denial-tested. **The one thing to flag for whoever writes these RPCs**: follow the existing `p_gym_id`-parameter convention exactly — do NOT resolve the gym from `auth.uid()` inside the new function, which is precisely the pattern that produced the roulette bug on the client side.

## Closing list

**The doctrine may freely assume:**
- Roster-wide **last visit date per client is ONE query**, index-backed on existing indexes (`asistencias_gym_fecha_idx`, `asistencias_cliente_fecha_idx`) — not an N+1, cheap at current and near-term scale.
- Roster-wide **first purchase / last purchase / total spend per client is ONE query**, index-backed on the existing `ventas_gym_fecha_idx` — same shape as the two RPCs already shipped.
- **Lifetime purchase count** is already computed (`ventas_count_por_cliente`) and just needs wiring into `getClientesRoster` — zero new SQL.
- **Months-as-member / alta date** is a free column add (`clientes.created_at` already fetched elsewhere, absent only from the roster's own select).
- **Invite/account state** (`invitacion.estado`, badge, claimed-or-not) is already on every roster row today — nothing new to build.
- Every one of the above can be gym-scoped exactly like the two existing aggregate RPCs (`p_gym_id` parameter, direct `gym_id` column on the source table) — no cross-tenant risk by construction.

**The doctrine must NOT assume:**
- That any group-2 signal is free to add as a **per-row fetch**. This repo already measured that exact mistake (the pre-perf-loop `ventas(count)` embed) costing ~100 ms at 500-row scale; a per-client N+1 for last-visit or no-show would push `admin/clientes` back over its 50 ms gate, which currently holds by only ~23 ms of margin bought via UI windowing, not data-layer headroom.
- That **no-show / reservation history** is as cheap as last-visit or purchase history — it requires a NEW join (`reservation` ⋈ `class_session`) with no purpose-built composite index today, and must be perf-measured (`pnpm perf`) before the doctrine treats it as available.
- That **freeze/hold, cancellation reason, membership-tier identity, lead-before-customer linkage, or staff notes/last-contacted** exist in any form — none of these are captured anywhere in `supabase/migrations/`. A doctrine that requires them requires new schema (a stored fact, the ADR-0002 exception the map already flags as only-in-play-if-needed) — this ticket does not propose that schema, only names the gap.
- That a stored `baja`/`archivado`/lapsed flag is needed to answer THIS ticket's questions — every group-2 signal above is answerable at read time from existing tables; nothing here requires a new stored column by itself. (Whether the doctrine ITSELF later decides a human-declared "gone" state is worth storing is map #180's open question, not this ticket's.)
