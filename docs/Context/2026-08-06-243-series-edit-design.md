# #243 series-edit — design + 4000-gym cost model (2026-08-06)

Produced by an 8-agent opus workflow: 1 cost model (measured with EXPLAIN ANALYZE against live),
3 independent designs (lazy / domain-model / vendor-operator angles), 3 adversarial judges
(scale / money-correctness / operator-support-load), 1 synthesis. Judges split 2-1; the
adjudication is in section 1.

---

# #243 — recommendation

Vocabulary, once: a **template** is the repeating rule ("every Tuesday 19:00"); a **class_session** is one dated class ("Tue 12 Aug, 19:00"), generated from the rule. Today the app can only touch dated classes — there is no way to change or stop the rule.

## 1. The recommendation

Build **two operator verbs against the existing template row, both fanned out from an RPC** (never a trigger): `update_recurring_schedule` — "esta y las siguientes" — which UPDATEs future `class_session` rows **in place**, so every booking follows the class for free and no money moves; and `retire_recurring_schedule` — "terminar el horario" — which flips `is_active = false` and cancels each future class through the shipped `cancel_class_session`, releasing holds through the one implementation that already exists. Total DDL: **one RLS DELETE policy** on `schedule_template_coach`; no new table, column, or index. This is the VENDOR design with four grafts that the judges' kill shots make non-optional: a past-instant guard, a per-gym advisory lock, detaching hand-edited sessions, and coalescing the coach set instead of replacing it.

**Adjudication (judges split 2–1).** SCALE and OPERATOR picked VENDOR; CORRECTNESS picked MINIMAL. CORRECTNESS's own verdict then grafts an attribute-only fan-out RPC *from* VENDOR into MINIMAL — so the real disagreement is one question: does a series time-move keep bookings or refund them? VENDOR wins it, because CORRECTNESS's objection is not to keeping bookings, it is to an unguarded recomputed instant landing in the past — a one-predicate fix. MINIMAL's answer (cancel 72 bookings, hand out credits, no notification path exists) is the support call the ticket exists to prevent. MODEL is filed, not built: it drops `is_active`, and I verified `is_active` is written from three places outside `supabase/migrations/` that no guard sees (`tools/perf/seed-local.mjs`, `supabase/seeds/red-demo/sql/03_schedule.sql`, its generator).

## 2. Why it's the elegant one

- **The FK does the work.** `reservation.class_session_id` points at the row, not the time. UPDATE `class_session.starts_at` and the booking moves with it — verified end to end: `packages/data/src/server/agenda-miembro.ts:607` re-reads and re-sorts it at the new time with **zero new code**. The everyday verb touches neither `reservation` nor `clientes`.
- **`is_active` is a kill switch that was already wired at the bottom and never at the top.** `materialize_week_for_gym` already filters on it (`20260805100000:71`) and `schedule_template_active_uq` is already partial on it (`20260805110000:275-277`, so a retired slot is re-creatable by design). We add the UI wire, not the mechanism.
- **The index already exists.** `class_session_template_starts_uq (template_id, starts_at)` — the idempotency constraint from `20260706120000:71` — answers `template_id = ? and starts_at > now()` with **both columns in Index Cond** (measured 1.390 ms, rows=5). Nothing to add, and no new partial-index predicate, so Postgres's IMMUTABLE-predicate law (42P17) is never in play.
- **The fan-out lives in an RPC, and the test suite already demanded that.** `scheduling_materialization.sql` vector (4) asserts a raw `update schedule_template set start_time` never reaches an existing session. A trigger would break it; an RPC does not. **Zero existing contract vectors are rewritten.**
- **The scope control replaces dead code, not empty space.** `editor-sheet.tsx:211-244` renders a "Se repite" weekday row in edit mode that does nothing (`agenda.tsx:112` always seeds `repeatDays` empty; the edit branch of `save()` returns at `:337` before reading it). The sheet keeps three buttons, not five, and one toggle governs both the save path and the destructive path.

## 3. The 4000-gym scorecard

| axis | delta |
|---|---|
| **Monday cron pass** (41 s warm, 528k ledger claims) | **+0 statements, +0 rows.** One `pg_advisory_xact_lock_shared(gym)` per `materialize_week_for_gym` call = 24,000 × ~1 µs ≈ **+0.02 s on 41 s**. Retired templates leave the `where is_active` loop entirely: **−18.1 µs per retirement per pass**. Net ≈ zero, trending cheaper. |
| **Agenda/asistencia page view** (240k/day; 0.84 ms DB under a 5–25 ms PostgREST hop) | **+0 round trips, +0 statements.** `template_id` joins the existing `.select()` at `agenda.ts:105` (+16 B/row, ~20 rows/week ≈ 320 B on the wire). +1 advisory lock: no row lock, **no XID**, no WAL, no multixact — unlike `FOR SHARE`, which would mint ~5 M tuple locks/day. Cost-model risk #3 untouched. |
| **New index(es)** | **None.** Existing `class_session_template_starts_uq` serves the series access path; `reservation_session_active_idx` serves the refund walk. No predicate legality question arises because no new predicate ships. |
| **Storage** | **+0 columns, +0 tables, +0 permanent rows per edit** (in place). Retire *reduces* growth: each week not materialized is −387 B (`class_session`) −174 B (ledger). Only new object is one RLS policy. Cost-model risk #2 unaffected. |
| **Write cost** | edit: ~13 rows typical, ≤110 worst case, **0 to `clientes`**. retire: 5–6 `cancel_class_session` + ~48 `reservation` + ~48 `clientes`; ceiling drops from 2,080 to **1,040** once the browse clamp is tightened (slice 1). Frequency ≈ **0.003 calls/s fleet-wide**. |

## 4. What it does to already-booked future classes

Two verbs, two answers, and the discriminator is plain: **does the class still happen?**

- **"Esta y las siguientes" (move/edit) — the class still happens, just later. The booking moves with it.** We rewrite the dated class's time; the booking row still points at that same class. Nobody is un-booked, nobody is charged again, nobody is refunded. Zero rows written to `reservation` or `clientes`. In the member's app the class simply shows the new time.
- **"Terminar el horario" (stop it) — the class stops existing, so every held class is given back.** Each future class is cancelled through the same function the single-class cancel already uses, which sets each booking to `cancelada` and adds the class back to that member's balance — but only where the booking actually consumed one (`consumio = true`) and the member is on a finite plan; unlimited members are never touched. Already-attended classes stay attended and are never re-credited. Nothing in the past is touched by either verb.
- **The member is not notified, by either verb.** There is no queued/bulk email path anywhere in the product and the shared bounce budget binds first — the in-app view is correct immediately; the push does not exist. That is a known, accepted gap, not an oversight.
- **The guard that makes this safe** (CORRECTNESS's kill shot): a series move recomputes each class's instant, and an *earlier* time can drag today's class into the past — where **both** release paths are permanently shut (`20260804150000:195` and `20260803140000:290` both raise `La clase ya comenzó`), silently destroying every hold on it. So the fan-out only moves a class whose **new** instant is still in the future; any class that cannot legally move is **detached from the rule** (`template_id = null`, becoming a one-off at its original time) and named in the receipt.

## 5. The build

**1 — Safety pre-work (no feature).** Migration `20260806090000_series_edit_prework.sql`: `create or replace materialize_week_for_gym` adding `perform pg_advisory_xact_lock_shared(hashtextextended(p_gym_id::text,0))` before the template loop (`20260805100000:69-72` reads templates with a plain unlocked SELECT — a concurrent retire otherwise leaves a live, bookable orphan class in an unclaimed week that no future pass can ever remove); `create or replace edit_class_session` adding `template_id = null` to its SET list (`20260706120100:208` deliberately preserves it today — that is the stomp). App: `packages/data/src/server/agenda.ts:207` clamp `+1 year` → `+26 weeks`, which is where the retire blast radius is actually bounded; update `agenda.test.ts:296-306`. **Tests:** extend `supabase/tests/scheduling_materialization.sql` — after `edit_class_session` moves a materialized session assert `template_id is null` **and** `ensure_week_materialized` for that week still adds **0** rows. **Must not break:** vector (5) (moved-session non-resurrection — the ledger claim, not `template_id`, is what holds), vectors (1)(2) idempotence, `class_horizon_autoroll.sql`.

**2 — `update_recurring_schedule`.** Migration `20260806100000_update_recurring_schedule.sql`. `(p_template_id, p_class_type_id, p_weekday int default null, p_start_time, p_duration_min, p_capacity, p_coach_ids uuid[] default null) returns int`. SECURITY INVOKER, `set search_path to ''`. Guards copied verbatim from `create_recurring_schedule` (`20260805110000:311-320`). Writes: `schedule_template` (wrapped `exception when unique_violation` → the identical Spanish sentence `Ya existe un horario activo para esta clase el % a las %`, so the vocabulary does not fork); `schedule_template_coach` **only when `p_coach_ids is not null`** (SCALE's graft: `editDraftFrom` seeds `coachIds` from the *clicked session*, so an unconditional replace writes last week's substitute onto the whole series); then one UPDATE over `template_id = ? and starts_at > now() and cancelled_at is null` recomputing `starts_at = ((date_trunc('week',(starts_at at time zone tz)::timestamp)::date + coalesce(p_weekday, weekday)) + p_start_time) at time zone tz` **and** `... > now()`; a second UPDATE sets `template_id = null` on the future rows the guard excluded. Weekday 0..5 all sit inside the same ISO week, so a weekday move never crosses a ledger claim. **Tests:** new `supabase/tests/recurring_series_edit.sql` (register in `run-denial-suite.mjs` SUITE + `rpc-coverage.json`, or both `tools/guards/` tests fail). Assert *written rows*, with values distinct from the seed (`19:00/45/24` → `20:00/60/30`): per-session `(starts_at at time zone tz)::time`, `duration_min`, `capacity`, `class_type_id`; past + cancelled sessions byte-identical; **`reservation.status` still `reservada` and `clases_restantes` numerically unchanged** (the settlement assertion); coach set replaced only when passed; the past-instant guard leaves that row's `starts_at` unchanged with `template_id is null`; and MINIMAL's R5 shape — on the duplicate refusal, `start_time`, every `starts_at`, every `status` and every balance byte-identical. **Must not break:** vector (4), vector (6).

**3 — `retire_recurring_schedule`.** Same migration file or `20260806100100`. `(p_template_id) returns int`. `staff_gym()` null → `No autorizado`; `pg_advisory_xact_lock(hashtextextended(gym::text,0))` (exclusive, pairs with slice 1); `update schedule_template set is_active = false where id = ? and is_active`, `if not found then raise 'Horario no encontrado o ya retirado'` — which is what makes a double-tap unable to reach the refund; then `for r in select id from class_session where template_id = ? and starts_at > now() and cancelled_at is null order by starts_at loop perform cancel_class_session(r.id)`. **Never copy the refund body.** **Tests:** in the same suite — `is_active = false`; every future non-cancelled session `cancelled_at is not null`, past one `null`; booked member's balance **exactly +1, once**; unlimited member still `null`; the `asistida` row still `asistida`; MODEL's vector 4 (`ensure_week_materialized` for weeks 0..5 each return **0** afterwards, and the slot then accepts a fresh `create_recurring_schedule`); second call raises with **no** balance moving twice; abort-path vector — a mid-loop raise leaves **zero** balances moved. Plus `scheduling_rls_denial.sql`: gym-B staff on a gym-A template → same sentence, **zero** rows written across `schedule_template`/`class_session`/`reservation`/`clientes`. **Must not break:** `cancel_class_session_release.sql`, vector (3).

**4 — Plumb the series into the client.** `packages/data/src/server/agenda.ts:105` add `template_id` to the select; `SesionRaw` (`:83-94`), `SesionAgendaDTO` (`:40-57`), `toDTO`, plus `apps/admin/.../agenda/_components/session-vm.ts:14-37,39-61` carry `templateId: string | null` (today the client literally cannot tell a generated class from a one-off). Add `actualizarHorarioRecurrente` / `retirarHorarioRecurrente` after `crearHorarioRecurrente` (`:436-460`), same zod + `ejecutar` + `requireOperator` shape; two thin passthroughs in `agenda/actions.ts:39`. **Tests:** vitest on the DTO mapping; no new suite.

**5 — The sheet.** `editor-sheet.tsx:211-244` — when `isEdit && esSerie`, the dead weekday row becomes `ALCANCE DEL CAMBIO · [Solo esta clase] [Esta y las siguientes]` (`draft.alcance`, default **"Solo esta clase"**, reset on every open at `agenda.tsx:105-116`), reusing the toggles' existing styling. Caption for `serie`: *"Cambia esta clase y las futuras. Las pasadas no se tocan. Las reservas se mueven con la clase."* The one destructive button at `:282-291` switches label+handler with the toggle: `Cancelar esta clase` → **`Terminar el horario`** (not "Dejar de repetir" — it understates a six-week cancellation), gated by the house `window.confirm` pattern already used at `gym-content-sheet.tsx:162/262/359/454` and `plantillas-sheet.tsx:49`: *"Se cancelarán todas las clases futuras de este horario y se devolverán las clases reservadas. No se puede deshacer."* Wire `agenda.tsx:288-291, 323-338, 370-380, 562-575`; both RPCs return `int`, so `afterWrite` prints `N clases futuras movidas` / `N clases canceladas · clases devueltas`. Badge the **one-off**, not the repeating class (at 21 templates a "repeats" glyph is on ~100% of cards and carries no information; the exception is the informative one) — one conditional in `session-card.tsx`. Cupo shrink below current bookings: **warn in the sheet, do not refuse** — refusing traps an operator who has one booking six weeks out.

## 6. Open owner rulings

**Q1 — "Terminar el horario": does it also cancel classes that are already imminent?** (a) Cancel every future class including tomorrow's fully-booked one, one tap, one confirm. (b) Stop from a date the operator picks. **Recommendation: (a).** (b) needs a date picker the edit sheet does not have, and a template with a live-but-uncancelled tail is a class that keeps taking bookings for a schedule you deleted. The confirm sentence carries the weight.

**Q2 — Tighten the agenda browse clamp from +1 year to +26 weeks?** This is the only real bound on the retire fan-out: every proposal leans on it, and it is a *client-side* guard on a *different* code path. Tightening halves the worst case (2,080 → 1,040 `clientes` row locks) and caps the deepest hole a badly-timed browse can dig. Cost: staff can no longer page 12 months ahead. **Recommendation: yes.**

Defaulted, not asked: bookings move with a series move (2 of 3 judges, and the member read path re-reads it for free); no member notification (no queue exists); no preflight count in the confirm dialog (the count arrives in the receipt; a new read RPC for a modal string is not worth it); weekday move ships in the RPC but not in the UI (the fan-out expression needs the weekday anyway — it is the same line count either way).

## 7. Deliberately cut

| cut | trigger to add it |
|---|---|
| MODEL's `vigencia daterange` + `btree_gist` (validity as a range) | An operator actually asks for a future-dated end ("Yoga termina el 1 de octubre") — the one thing `is_active` genuinely cannot express. Even then take MODEL's own closing variant (**keep `is_active`, add `valido_hasta date`**), not the column-drop: `is_active` is written from three files outside `supabase/migrations/` that no guard replays. |
| A "Horarios" / series-list screen | A template whose next class falls outside the browsable horizon (a seasonal series with no card to tap), or a second real operator asking. The week view *is* the list at 21 templates. |
| The weekday control in the edit sheet | First request. The RPC already takes `p_weekday`; the control is one line passing the toggled index. |
| Member notification on a move or retire | A real email queue with retry exists. Do not send mail from a schedule write. |
| Re-booking members onto the moved/re-created classes | Operators report members losing spots on a small time shift. |
| An "un-retire" verb | Never — re-creating at the same slot *is* the un-retire; `schedule_template_active_uq` is partial on `is_active` precisely so that works. |
| Refusing a cupo shrink below current bookings | Never — `reservar_clase` already blocks *new* bookings and the sheet already renders `Clase llena · sin lugares`. Warn only. |
| Set-based refund inside retire (instead of the `cancel_class_session` loop) | p95 retire > ~1 s, or a desk lock-wait report. Keeps one implementation of hold-release until then. |
| Ledger prune, `i=5`-only cron, removing `ensure_week_materialized` from the hot path | Separate issues (cost-model risks #1–#3). Named so they are seen, not missed. |

---

# Appendix — the measured cost model

# Quantitative cost model — recurring-class spine at 4000 gyms

All timings measured on **live** (Postgres 17.6, `shared_buffers`=224 MB, `effective_cache_size`=384 MB, `max_connections`=60, `statement_timeout`=120000 ms → Supabase Micro/Small class), warm cache, single connection. Measurement method: plpgsql `DO` blocks timed with `clock_timestamp()` and terminated by `RAISE EXCEPTION`, so nothing committed.

## 0. Measured baseline (live, 4 gyms)

| metric | value |
|---|---|
| gyms / active templates / class_session / reservation | 4 / 86 / 994 / 489 |
| ledger rows / distinct weeks | 986 / 15 (2026-06-01 → 2026-09-07) = **65.7 rows per week** |
| active templates per gym | red 24, forge 21, forge-demo 21, red-demo 20 |
| heap+index bytes/row: class_session / ledger / reservation / class_session_coach | 140+247 / 83+91 / 160+374 / 91+167 |
| coach rows per session | 539/994 = 0.54 |

**Three primitive costs, measured:**

| primitive | measurement | per-op |
|---|---|---|
| cold 6-week write pass, 4 gyms | 516 sessions created in **188.60 ms** | **365.5 µs/session, 47 ms/gym** |
| conflicting `INSERT…ON CONFLICT DO NOTHING` | 1,720 in **31.11 ms** | **18.1 µs** |
| pure ledger read probe (plpgsql+SPI) | 10,320 in **190.86 ms** | **18.5 µs** |
| `is_staff_of(gym)` | 5,000 in **89.12 ms** | **17.85 µs** |

**The single most load-bearing measurement:** across those 1,720 conflicting inserts, `pg_current_xact_id_if_assigned()` returned `NONE` **before and after**. A fully-idempotent materialization pass assigns **no XID at all** — no heap tuple, no speculative token, no index entry, no WAL, no dead tuple, no vacuum debt. It is an arbiter-index probe and a bail, costing the same 18 µs as a plain `SELECT` probe.

---

## 1. Cardinality at 4000 gyms

**Assumption A1 — active templates/gym = 22** (range 12–36). Live mean is 21.5, median 21, and `forge` (the only real operator, MEMORY: *owner-is-dev-not-operator*) runs 21 — a ~3.5 classes/day × 6-day grid, not 5×6. Low bound 12 = 2/day × 6; high 36 = 6/day × 6. Sunday is structurally unrepresentable (`check weekday between 0 and 5`, `20260706120000_create_scheduling_spine.sql:40`).

| quantity | arithmetic | value (low–high) |
|---|---|---|
| fleet active templates | 4000 × 22 | **88,000** (48k–144k) |
| ledger claims attempted per Monday pass | 4000 × 6 weeks × 22 | **528,000** |
| …of which can produce a row | 4000 × **1** week × 22 | **88,000** |
| …provably redundant | 5/6 | **440,000 = 83.3%** |
| class_session rows/year | 88,000 × 52 | **4.58 M** |
| class_session rows @ 3 yr | 4.58 M × 3 | **13.7 M** |
| ledger rows/year | identical rate (1/template/week) | **4.58 M**; @3yr **13.7 M** |

**Only the newest week (`i=5`) is new.** The other five were claimed by last Monday's pass. This is the central arithmetic fact of the whole model.

**Storage** (measured bytes/row, no bloat allowance):

- class_session: 4.58 M × 387 B = **1.77 GB/yr** → **5.3 GB @ 3 yr**
- class_session_coach: 4.58 M × 0.54 × 258 B = 0.64 GB/yr → **1.9 GB @ 3 yr**
- schedule_template_week: 4.58 M × 174 B = 0.80 GB/yr → **2.4 GB @ 3 yr**
- **spine subtotal @ 3 yr ≈ 9.6 GB**
- reservations (not the spine, but rides it): at 6 bookings/session, 27.5 M rows/yr × 534 B = **14.7 GB/yr** — dwarfs everything above.

**Prune: confirmed absent, by design.** `grep -rn "delete from public.schedule_template_week\|delete from public.class_session" supabase/migrations/` returns **zero hits**. `20260706130000_materialization_week_guard.sql:20` states it outright: *"delete policy — a guard row is written once and never changes."* The table has member-select and staff-insert policies only (`:33-38`, re-issued `20260714080000:143-144`); **there is no DELETE policy and no retention job.** `class_session` is additionally delete-RESTRICTed by attendance FKs (`20260803130000_asistencias_reservation_restrict_delete.sql`). Both tables are append-only forever.

---

## 2. The Monday cron pass at 4000 gyms

Structure: `cron_materialize_horizon()` (`20260805100000_class_horizon_autoroll.sql:168-218`) — one pg_cron job (`roll-class-horizon`, `0 8 * * 1`, verified live: `cron.job` jobid=1, active=true), one statement, serial nested loop `gym → i in 0..5 → materialize_week_for_gym → per-template row loop` (`:66-96`).

**Statement count per pass at 4000 gyms:**

```
gym scan (1 query, EXISTS-filtered)                            1
per gym:  select timezone                                  4,000
          6 × materialize_week_for_gym                    24,000  (SPI calls)
per template-week: 1 ledger INSERT..ON CONFLICT          528,000
                   1 session INSERT..ON CONFLICT          88,000  (only when ledger claim is new)
                   1 coach INSERT..SELECT                  88,000
cron_run_log insert                                            1
                                                        ─────────
                                                       ~732,000 statements
```

**Wall clock, steady state (only week i=5 new):**

```
per gym = 22 new sessions × 365.5 µs   =  8.04 ms
        + 110 conflicting claims × 18.1 µs =  1.99 ms
        + gym/tz/subxid overhead        ≈  0.2  ms
                                        = 10.2 ms/gym   (measured-consistent: 188.6ms/4 gyms all-cold ÷ 6 ≈ 7.9ms + 2.0ms)

4000 gyms × 10.2 ms = 41 s  warm
```

**Timeout headroom:** `statement_timeout = 120000 ms`, measured on live. Budget at 4000 gyms = **30 ms/gym**. Warm cost is 10.2 ms. **The pass survives a 3× cache-miss degradation and no more.** At 13.7 M class_session rows the six indexes on it total ~3.4 GB against 224 MB of `shared_buffers` (<7% resident); every insert dirties a random leaf in six indexes. A 3–10× multiplier is the normal regime there → **120–410 s → the pass times out.**

**Gym count at which one job stops fitting:**
- warm-cache ceiling: 120 s / 10.2 ms = **~11,900 gyms**
- realistic 5× cold-cache ceiling: **~2,400 gyms**
- the file's own estimate (`:159-165`) is "~20–50 ms/gym → ~2,400–6,000 gyms; shard before ~2,000". My measurement is **47 ms/gym for the all-cold case** — the top of their range. **Their lower bound (2,400) is the right one; the 6,000 is optimistic. 4000 gyms is already past the line the file itself draws.**

**Subtransaction cost — say plainly: this does NOT reach the subxid-overflow regime, at any gym count.** The `begin…exception when others` (`:196-215`) is opened and closed *serially*, so nesting depth is always **1** and the backend's `PGPROC_MAX_CACHED_SUBXIDS = 64` cache never holds more than one entry. Suboverflow, `pg_subtrans` lookups on snapshot checks, and the `SubtransSLRU` contention that follows are all triggered by *concurrently open* subxids, not by their lifetime count. Not a risk here.

What the 4000 subtransactions actually cost:
- 4000 XIDs consumed per pass (each writing subxact calls `GetCurrentTransactionId`) = 208 k XIDs/yr against a 2³¹ budget — **irrelevant**.
- ResourceOwner/snapshot bookkeeping ~5–20 µs each = **20–80 ms total** — **irrelevant**.

**The one real transactional cost is not the subtransactions:** the whole pass is a single top-level transaction holding one snapshot for 41 s (warm) to 7 min (cold). For that window it pins the fleet-wide vacuum horizon and `pg_xact`. Survivable, but it is a Monday-morning vacuum stall that grows linearly with gym count.

---

## 3. The view-time materialization call — the highest-frequency call in the spine

Path: `packages/data/src/server/agenda.ts:205-210`, clamped at `:206-208` to `[this week's Monday, +1 year]` (outside that range the RPC is **not** called at all — verified by `agenda.test.ts:296-306`). Called from `getAgendaDia:223` and `getAgendaSemana:248`.

Live callers:
- `apps/admin/src/app/(app)/agenda/page.tsx:49` → `getAgendaSemana`
- `apps/admin/src/app/(app)/asistencia/page.tsx:35` → `getAgendaDia` — **the desk screen**, the highest-traffic surface in the product (forge runs 8:1 pasa-lista:ventas)
- re-fired by `router.refresh()` after every agenda mutation (`agenda.tsx:234, 299`) and by `revalidatePath("/asistencia")` (`clientes/[id]/actions.ts:32`)
- the member app does **not** materialize (`packages/data/src/server/agenda-miembro.ts:336`: *"NEVER materializes"*)

**Cost of an already-materialized week — answering the question directly:** it is a **no-op INSERT with an index probe, and nothing else**. Measured: `xid_after = NONE`. No row lock (there is no conflicting *concurrent* inserter to lock on — the arbiter check finds a *committed* tuple and returns), **no XID burned**, **no index bloat**, no WAL, no dead tuple.

```
22 templates × 18.1 µs (conflicting claim)          = 0.40 ms
+ RLS: WITH CHECK is (SELECT is_staff_of(row.gym_id)) — CORRELATED
  → per-row SubPlan (the ADR-0013 correction), 22 × 17.85 µs = 0.39 ms
+ schedule_template index scan (22 rows) + gym tz lookup  ≈ 0.05 ms
                                                   ────────────
DB work per call                                     ≈ 0.84 ms
```

**Fleet volume.** Assumption A2: 60 agenda/asistencia page loads per gym per operating day (the desk re-renders on every mark) → 4000 × 60 = **240,000 calls/day ≈ 2.8/s mean, 10–15/s at the 08:00 and 18:00 class peaks.**

```
240,000 × 0.84 ms = 202 s of DB time/day = 0.23% of one core.
```

**Verdict: fine as database load, a hidden tax as latency.** The 0.84 ms of DB work is buried under a full extra PostgREST round trip — `supabase.rpc(...)` at `agenda.ts:209` is a separate HTTP request and a separate transaction, **5–25 ms**, i.e. **10–30× the work it performs**, taken *serially before* the read at `:225`/`:250`. That is p50 latency on the one screen with a person standing at it, 240,000 times a day, to discover 99.98% of the time that there is nothing to do.

And its remaining job is narrow. Since #136 shipped, the cron holds a 6-week horizon for every gym, and `create_recurring_schedule` materializes its own 6 weeks inline (`20260805110000_scheduling_guards.sql:339-345`). What is left for the view-time call: (a) self-healing a gym whose per-gym subtransaction errored, and (b) on-demand materialization when staff browse past week 6 (the `+1 year` clamp allows it). Neither needs to happen **on the current week**, which is the week it asks for on essentially every call.

---

## 4. Blast radius of a series-level write

**Bounded, and structurally so — not statistically.** A template is one `(weekday, start_time)` pair, so it produces at most **one dated class per week**. The bound is therefore exactly "number of materialized future weeks."

| | class_session rows | reservation rows |
|---|---|---|
| typical (6-week horizon) | **5–6** — measured: the sampled live template returned exactly **rows=5** | ~1.0/session live (demo data); real box at 6–12 fill → **~48** |
| worst case (staff browsed to the `+1 year` clamp, `agenda.ts:207`) | **52** | 52 × capacity 40 (`20260706120000:43`) = **2,080** |

Measured cost of *finding* them: **1.390 ms execution** for the full two-level query. Planning Time 4.896 ms > Execution Time — the query is small enough that the planner dominates.

**Contrast: a series write that fans out to bookings.** `cancel_class_session` per session (`20260804150000_settlement_hold_capture_forfeit.sql:195-228`) refuses if `v_starts <= now()`, then walks every active reservation and refunds each `consumio` hold by incrementing `clientes.clases_restantes`. Fanned across a series:

```
template-only retire :        1 UPDATE   (schedule_template.is_active)
+ future sessions    :     6–52 UPDATEs (class_session)
+ bookings           :   48–2080 UPDATEs (reservation)
+ refunds            :   48–2080 UPDATEs (clientes)   ← the contended table
```

Still bounded (`sessions × capacity ≤ 2,080`), but 2–3 orders of magnitude larger, and the `clientes` leg is the only part with a genuine contention story: `clientes` is touched by every sale, every visit and every booking, and a member holding reservations across six weeks of the same series takes six serial row updates inside one long transaction, blocking concurrent desk writes on that member for its duration. The difference is a 2 ms statement versus a multi-second transaction holding row locks on the hottest table in the schema.

---

## 5. Indexes

**`where template_id = ? and starts_at > now()` — the index already exists. Nothing to add.**

`class_session_template_starts_uq` = `CREATE UNIQUE INDEX ... USING btree (template_id, starts_at)`, created as the idempotency constraint at `20260706120000_create_scheduling_spine.sql:71`. Measured plan:

```
Bitmap Heap Scan on class_session (actual rows=5)  Buffers: shared hit=6
  ->  Bitmap Index Scan on class_session_template_starts_uq (actual 1.973 ms, rows=5)
        Index Cond: ((template_id = …) AND (starts_at > now()))
```

**Both** columns land in `Index Cond`, not a Filter — leading equality column + trailing range column is the textbook shape. The materialization guard doubles as the series-scoped access path for free. (`template_id` is nullable for one-offs; btree indexes NULLs, so the index also serves `template_id is null` and carries a modest amount of one-off dead weight.)

**Retire path's reservation lookup — also already covered.**

`reservation_session_active_idx ON reservation (class_session_id) WHERE status IN ('reservada','asistida')` (`20260706170000_create_reservation_and_reservar_clase.sql:70-71`). Measured plan:

```
Nested Loop (actual 1.284 ms)
  -> Bitmap Index Scan on class_session_template_starts_uq (rows=5)
  -> Index Scan using reservation_session_active_idx (loops=5)
       Index Cond: (class_session_id = cs.id)
```

Partial, so it stays small as cancelled rows accumulate. `reservation_class_session_id_idx` (`:66`) is redundant for this query but serves the FK.

**No new index is required for a series-scoped write path.** That is the one unambiguously good result here.

**Gaps that do exist:**
- `schedule_template_week` has PK `(template_id, week_start)` + a `gym_id` index (`20260706130000:28,31`) — **no index supports `delete where week_start < x`**, which would seq-scan a 13.7 M-row table. Moot today (no prune exists), load-bearing the day one is added.
- `gym_horizon_depth` (`20260805100000:288-296`) LEFT JOINs all of `class_session` fleet-wide with `starts_at > now() and cancelled_at is null` → 528 k future rows at 4000 gyms, grouped by gym. A seconds-long ops query run by a human. Acceptable; naming it so it isn't a surprise.

---

## Top 3 scale risks in this spine as it stands today

**1 — The Monday cron is one serial statement under a 120 s timeout, and 83% of its work is provably redundant. Bites at ~2,400–3,500 gyms cold-cache (~11,900 warm); i.e. 4000 gyms is already past it.**
528,000 ledger claims per pass, of which only 88,000 can produce a row, because five of the six weeks were claimed last Monday. Warm arithmetic gives 41 s against a 120 s cap — 3× headroom, consumed entirely by the cache-miss regime that arrives with table size, not gym count. `20260805100000:159-165` names the exit (shard by `hashtextextended(id::text,0) % N`) and says do it before ~2,000 gyms. There is a cheaper first move it does not name: materialize only `i=5` on the weekly pass and cut 83% of the statements before sharding anything. Failure mode is near-silent — the statement times out, every gym after the `order by gy.id` cutoff silently gets no new week, and the only detectors are `gym_horizon_depth` (unpolled) and a member finding an empty week.

**2 — Unbounded append on `class_session` + `schedule_template_week`, no prune, no partition, no delete path. Bites at ~1,500–2,000 gyms after year two; compounding at 4000.**
4.58 M rows/yr each; 13.7 M each at 3 years; ~9.6 GB for the spine before ~15 GB/yr of reservations. `class_session` deletes are RESTRICTed by attendance FKs (`20260803130000`) so there is no escape hatch, and the ledger has no DELETE policy *by design* (`20260706130000:20`) with zero delete statements anywhere in `supabase/migrations/`. The bite is not disk — it is that six indexes on a 13.7 M-row table stop fitting in 224 MB of `shared_buffers`, which is precisely the mechanism that turns risk #1's 41 s into 7 minutes. The ledger is the tractable half: the cron only ever asks for `[this Monday, +5 weeks]`, so rows older than ~2 weeks are unreachable dead weight — but pruning them must first reconcile the view-time `+1 year` clamp at `agenda.ts:207`, which lets a human ask for week 40.

**3 — `ensure_week_materialized` on the hot path is a 5–25 ms serial round trip on the desk screen that, post-#136, has almost no work left to do. Bites at any gym count — it is live at 4 today.**
Measured DB cost of an already-materialized week is 0.84 ms and **zero XIDs** (`pg_current_xact_id_if_assigned() = NONE` across 1,720 conflicting claims) — 202 s of DB time/day across 4000 gyms, genuinely nothing. The cost is the extra PostgREST round trip taken *before* the read on `asistencia/page.tsx:35` and `agenda/page.tsx:49`, re-fired by every `router.refresh()` (`agenda.tsx:234,299`) and every `revalidatePath("/asistencia")` (`clientes/[id]/actions.ts:32`) — ~240,000/day, ~10–15/s at class peaks, 10–30× more latency than work. Its residual value is self-healing a cron-skipped gym and on-demand browse past week 6; neither requires firing on the current week, which is what it does on essentially every call.
