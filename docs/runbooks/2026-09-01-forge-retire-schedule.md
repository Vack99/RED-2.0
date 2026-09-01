# Runbook — retiring forge's never-used class schedule (history kept)

**Date authored:** 2026-09-01 · Ticket #329, spec #326 §"Data". Forge (and its demo twin) run
the **Lista** mode: no member ever books a seat (spec's live count, 2026-09-01: 50 clientes,
2 accounts, 0 member bookings ever). With #329 Part A landed, the admin desk no longer reads
`schedule_template`/`class_session` at all, so the schedule these two gyms carry is pure
dead weight — the weekly horizon cron (`roll-class-horizon`, Mondays 08:00 UTC) keeps
materializing six weeks of sessions nobody will ever see.

**This is a live-data act. DO NOT RUN without the owner's consent recorded on #329**, and run
as **service role** (Supabase SQL editor / MCP `execute_sql` / `postgres`) — RLS would refuse
the `schedule_template`/`class_session` writes to a normal authenticated caller in the first
place, and this is a cross-tenant admin act, not a staff one.

Not a migration: no schema changes, `DELETE`/`UPDATE` DML only. Run **once per gym**, `forge`
then `forge-demo`, each in its own transaction. Every statement below resolves the gym id from
`gym.slug` — **never paste a hardcoded uuid**, the two gyms' real ids are looked up at run time.

## The rule (plan-locked, spec #326 §Data)

- `schedule_template` ("plantillas"): set `is_active = false`. Not deleted — the row (and its
  `schedule_template_week`/`schedule_template_coach` children) stays for history; only the
  cron's own gating (`cron_materialize_horizon`'s outer loop selects gyms via `exists (select 1
  from schedule_template st where st.gym_id = gy.id and st.is_active)`) reads this flag.
- `class_session` ("sessions"): **delete** every row with `starts_at > now()`, scoped to the
  gym. Every **past** session (`starts_at <= now()`), every `asistencias` row, and every
  `reservation` row on a past session are untouched by construction — the `DELETE`'s `WHERE`
  never reaches them.

## Cascade facts — verified against the live FK DDL, not assumed

Three tables reference `class_session(id)`. Only one of them cascades:

| child table | FK | on delete | source |
|---|---|---|---|
| `class_session_coach` | `session_id` | **CASCADE** | `20260706120000_create_scheduling_spine.sql:83` |
| `reservation` | `class_session_id` | **RESTRICT** | `20260803130000_asistencias_reservation_restrict_delete.sql` (tightened FROM cascade — see below) |
| `asistencias` | `class_session_id` | **RESTRICT** | same migration |

**This is not what the spec text says ("delete forge's sessions … their walk-in reservation
rows cascade") — that line describes the schema as it stood before 2026-08-03.** Owner ruling
2026-08-03 (epic #203 slice 4) tightened `reservation.class_session_id` and
`asistencias.class_session_id` from `ON DELETE CASCADE` to `ON DELETE RESTRICT` specifically so
a hard-deleted session can no longer silently destroy attendance history — the same migration's
own header documents the live incident (`red-demo`'s teardown script) that this rule exists to
prevent. `asistencias.reservation_id → reservation(id)` is also `RESTRICT` since the same
migration, which is why a future session's reservation rows must be gone before its attendance
rows even could be (moot here — see below).

Consequence for this recipe: **a future `class_session` with any `reservation` or `asistencias`
row still attached refuses the delete outright** (Postgres raises a foreign-key violation; it
does not cascade the child away). In practice this is expected to be zero for both gyms —
`reservar_clase` already refuses on a `booking_enabled = false` gym (`supabase/functions-canonical/reservar_clase.sql:69`,
since `20260826120100_gym_booking_enabled.sql`), so no member reservation can land on forge, and
`asistencias` is only ever written for a session that has already started (never a future one)
— but the pre-check below proves it rather than assumes it, and the write transaction's own
guard halts (rather than partially executes) if that ever stops being true.

`class_session_coach` needs no guard: it cascades cleanly, and it carries no history of its own
(it is a pure link row — who was assigned to teach a session that no longer exists is not a fact
worth keeping once the session is gone).

## Pre-checks — run first, record every count

One block per gym. Substitute `'forge'` → `'forge-demo'` for the second run.

```sql
-- ── forge — pre-checks ──────────────────────────────────────────────────────────
-- 1. plantillas by is_active
select is_active, count(*) as n
  from public.schedule_template
 where gym_id = (select id from public.gym where slug = 'forge')
 group by is_active
 order by is_active;

-- 2. sessions: future vs past (the axis the delete will use)
select (starts_at > now()) as future, count(*) as n
  from public.class_session
 where gym_id = (select id from public.gym where slug = 'forge')
 group by (starts_at > now());

-- 3. reservation rows tied to FUTURE sessions — must be 0, or the delete below halts
select count(*) as n
  from public.reservation r
  join public.class_session cs on cs.id = r.class_session_id
 where cs.gym_id = (select id from public.gym where slug = 'forge')
   and cs.starts_at > now();

-- 4. asistencias rows tied to FUTURE sessions — must be 0, or the delete below halts
select count(*) as n
  from public.asistencias a
  join public.class_session cs on cs.id = a.class_session_id
 where cs.gym_id = (select id from public.gym where slug = 'forge')
   and cs.starts_at > now();

-- 5. baseline to diff the post-check against: PAST sessions + all-time attendance,
--    which the write below must leave byte-identical
select
  (select count(*) from public.class_session
    where gym_id = (select id from public.gym where slug = 'forge')
      and starts_at <= now())                                   as sesiones_pasadas,
  (select count(*) from public.asistencias
    where gym_id = (select id from public.gym where slug = 'forge'))  as asistencias_total,
  (select count(*) from public.reservation r
     join public.class_session cs on cs.id = r.class_session_id
    where cs.gym_id = (select id from public.gym where slug = 'forge')
      and cs.starts_at <= now())                                  as reservas_pasadas;
```

Record all five results (and their `forge-demo` counterparts) on #329 before writing anything.
Checks 3 and 4 must read `n = 0` — if either doesn't, **stop and re-plan** (do not proceed to
the write transaction; the guard inside it would halt anyway, but a nonzero pre-check means the
"future sessions are always empty" assumption above is false for this gym and needs a human
decision, not a blind retry).

## The write — one transaction per gym

```sql
-- ── forge — retire the schedule ─────────────────────────────────────────────────
begin;

-- Hard guard, not an assumption: re-proves pre-checks 3/4 INSIDE the transaction
-- (closes the TOCTOU gap between recording the pre-check and running this) and
-- turns a would-be FK violation into a legible halt.
do $$
declare v_gym uuid := (select id from public.gym where slug = 'forge');
begin
  if exists (
    select 1 from public.reservation r
    join public.class_session cs on cs.id = r.class_session_id
    where cs.gym_id = v_gym and cs.starts_at > now()
  ) then
    raise exception 'HALT: forge has a future reservation — resolve before deleting sessions';
  end if;
  if exists (
    select 1 from public.asistencias a
    join public.class_session cs on cs.id = a.class_session_id
    where cs.gym_id = v_gym and cs.starts_at > now()
  ) then
    raise exception 'HALT: forge has a future attendance row — resolve before deleting sessions';
  end if;
end $$;

-- Plantillas inactive: the cron's own gym-selection predicate then excludes forge
-- from every future run (cron_materialize_horizon's `exists (... st.is_active)`).
-- History (schedule_template_week / schedule_template_coach rows) is untouched —
-- this is an UPDATE, not a DELETE.
update public.schedule_template
   set is_active = false
 where gym_id = (select id from public.gym where slug = 'forge')
   and is_active = true;

-- Future sessions gone. class_session_coach cascades (verified above, no guard
-- needed); reservation/asistencias are RESTRICT and the DO block above already
-- proved there is nothing there to violate it. Past sessions (starts_at <= now())
-- are never touched — they are outside this WHERE clause, not merely unintended.
delete from public.class_session
 where gym_id = (select id from public.gym where slug = 'forge')
   and starts_at > now();

commit;
```

## Post-checks — prove the shape, not just "it ran"

```sql
-- ── forge — post-checks ─────────────────────────────────────────────────────────
-- 1. every plantilla inactive
select count(*) filter (where is_active) as still_active, count(*) as total
  from public.schedule_template
 where gym_id = (select id from public.gym where slug = 'forge');
-- expect: still_active = 0

-- 2. future sessions = 0
select count(*) as n
  from public.class_session
 where gym_id = (select id from public.gym where slug = 'forge')
   and starts_at > now();
-- expect: n = 0

-- 3. past sessions unchanged — must equal pre-check block's `sesiones_pasadas`
select count(*) as n
  from public.class_session
 where gym_id = (select id from public.gym where slug = 'forge')
   and starts_at <= now();

-- 4. attendance unchanged — must equal pre-check block's `asistencias_total`
--    (no asistencias row was ever in scope for the delete, so this is really
--    proving the WHERE clause did what it says, not a migration of data)
select count(*) as n
  from public.asistencias
 where gym_id = (select id from public.gym where slug = 'forge');

-- 5. past reservations unchanged — must equal pre-check block's `reservas_pasadas`
select count(*) as n
  from public.reservation r
  join public.class_session cs on cs.id = r.class_session_id
 where cs.gym_id = (select id from public.gym where slug = 'forge')
   and cs.starts_at <= now();
```

Repeat pre-check → write → post-check for `forge-demo` in its own transaction. Do not batch
both gyms into one transaction — a halt on one must not block the other, and a partial success
is easier to reason about per gym than a mixed rollback.

## Part 4 — the weekly horizon cron needs no code change, only a verification

`roll-class-horizon` (`supabase/migrations/20260805100000_class_horizon_autoroll.sql`,
refined `20260808210100_horizon_frontier_pass_and_prune.sql`) runs `cron_materialize_horizon()`
every **Monday 08:00 UTC** via `pg_cron` (`select cron.schedule('roll-class-horizon', '0 8 * *
1', 'select public.cron_materialize_horizon();')`). Its outer loop is:

```sql
for g in
  select gy.id, gy.timezone
    from public.gym gy
   where exists (
     select 1 from public.schedule_template st where st.gym_id = gy.id and st.is_active
   )
   order by gy.id
loop …
```

Once every `schedule_template` row for a gym has `is_active = false`, that gym's `exists (…)`
is false and the loop **never selects it** — no materialization, no `schedule_template_week`
claim, nothing. This needed no change: "inactive plantillas materialise nothing" was already
true of the function as written (spec's own §Data note); this runbook only makes it true FOR
forge/forge-demo by flipping the flag.

**Verify after the next run** (the first Monday 08:00 UTC on/after this runbook executes —
`2026-09-07` for a 2026-09-01 run), acceptance criterion #4 on #329:

```sql
select gym_id, slug, brand_name, future_sessions, horizon_ends
  from public.gym_horizon_depth
 where slug in ('forge', 'forge-demo');
```

Expect `future_sessions = 0` and `horizon_ends = NULL` for both rows, unchanged from
immediately after this runbook ran (the view is the ops "did the cron die" detector —
`20260805100000` §6 — so a **nonzero** row here after the Monday run means either a plantilla
was reactivated for that gym, or something outside this recipe re-created a future session).
Cross-check `public.cron_run_log` (`job = 'roll-class-horizon'`) for that run's summary line: its
`gyms=` count should no longer include forge/forge-demo now that their `exists (...)` predicate
is false.

## Do NOT

- Run this without the owner's consent recorded on #329 — it is a live write against real
  gyms, not a scratch/local exercise.
- Delete `schedule_template` rows — they are set `is_active = false`, never removed; deleting
  them would cascade-delete `schedule_template_week`/`schedule_template_coach` history for no
  reason the spec asks for.
- Widen the `class_session` delete beyond `starts_at > now()` — a past session, however idle,
  carries real attendance and must never be touched by this recipe.
- Skip the pre-check / DO-block guard because "it's always zero in practice" — the guard is
  what turns that assumption into a proof, and the whole reason `RESTRICT` replaced `CASCADE`
  on 2026-08-03 was a prior silent-destruction incident (`20260803130000`'s own header).
- Batch `forge` and `forge-demo` into a single transaction.
