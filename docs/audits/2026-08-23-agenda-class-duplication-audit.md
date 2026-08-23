# Agenda / Class Duplication Audit — 2026-08-23

> **CORRECTED same day — read `2026-08-23-agenda-duplication-verdict.md` first.** Live-DB forensics
> falsified this audit's ranking: the actual generator is **two coexisting ACTIVE
> `schedule_template` rows at the same weekday+start_time** (the §1 table's "legal today" case,
> ranked last here), created 2026-08-04 before the #244 guard existed — and still legal after it,
> because `schedule_template_active_uq` keys on `class_type_id`. The recommended fix #1 below
> (NULL-template one-off index) would not have prevented a single live pair. The mechanisms below
> remain real as *secondary* vectors; the verdict doc records what actually shipped.

**Ticket:** RED staff (Narda) reports every edit of a class duplicates it; creation issues suspected around the recurrence algorithm.
**Method:** 3 full passes (structure map → deep dives: edit-path forensics / creation+recurrence / concurrency+integrity+test-gaps → adversarial verification + completeness sweep). Analysis only; no code changed. All claims verified against code with file:line; contested claims re-verified by a fresh-context adversarial agent.
**Live evidence:** screenshot — MIÉ 26 AGO (cron-owned week 1): two identical cards `07:15 · ABS · 45 min · Martin · 0/10`, top one badged **ÚNICA**, second with no badge.

---

## 1. Verdict on the ticket

**Fingerprint decoded.** The `ÚNICA` badge is `template_id === null` rendered from the DB row (agenda.tsx:578,606; session-vm.ts:50-74). The screenshot therefore shows **two real rows at the same gym-local instant: one `template_id IS NULL`, one attached to an active series**.

Ruled out first:
- **No edit path can INSERT a class.** Narrow edit = one UPDATE (+coach join rewrite) that detaches (`template_id=null`, edit_class_session.sql:46); wide edit = UPDATEs only (update_recurring_schedule.sql:57,75). Both verified line-by-line.
- **No render bug can fake the pair.** The badge derives from the stored column; `toCardVM` is 1:1; keys are unique ids; one row cannot land in two day buckets (page.tsx:80-87; agenda.ts:141-152,355-365).

So the pair requires a **NULL-template row created separately** at a slot where a materialized (attached) row already existed. Ranked mechanisms:

| # | Mechanism | Fit |
|---|---|---|
| 1 | **Hand-create over an existing series slot.** `create_class_session` is a blind INSERT — no collision check, no idempotency; NULL-template rows are exempt from the only unique key `(template_id, starts_at)` (20260706120000:18-21,71). The create sheet is visually identical to the editor and `+ Nueva clase` is offered even on occupied slots (agenda.tsx:649-656). "I went to change the 07:15 class and now there are two" — deterministic, matches "every time". | ★★★ |
| 2 | **Create double-tap / silent-failure retry** (D2/D3 below) — mints two NULL-template twins (both ÚNICA). Explains the *creation* complaints; produces a slightly different fingerprint (both ÚNICA). | ★★ |
| 3 | **Narrow-edit detach → re-create.** Every real narrow edit detaches; receipt even says "ahora es Única" (agenda.tsx:455). Staffer dislikes the result, re-creates the slot → pair. Matches the words literally; two-step. | ★★ |
| 4 | **Documented accepted race:** materializer × wide-edit/retire write-skew stamps "a single stray class" at the old slot. The migration header literally sets the trigger: *"The trigger to add locking is an actual report of one"* (20260806100000:116-126; 20260806100100:32-41; lock pair cut 20260806090000:6-16). **This ticket is that report.** Produces attached+attached (old+new times), not the exact screenshot pair. | ★★ |
| 5 | **Cron-outage heal** doubles hand-created rows (claim-what's-missing ignores NULL-template rows; cron_materialize_horizon.sql:45-58). Sub-case of #1. | ★ |

**Discriminator:** `created_at` ordering + `template_id` of the pair (SQL in §4). Both rows attached with different times → mechanism 4. NULL+attached → 1/3/5. Both NULL, created seconds apart → 2.

---

## 2. Verified defects

### S1 — Duplication family (ticket-critical)

- **D1 · No server-side dedup on one-off create.** Blind INSERT (create_class_session.sql:17-19); no idempotency token, no collision check, no past-instant guard; unique key exempts NULLs by design (20260706120000:18-21,71).
- **D2 · Double-submit window on touch.** Guard is closure-state `busy` + `disabled={pending}` (agenda.tsx:402,417; editor-sheet.tsx:524-525) — both need a React re-render between taps. `onSave` is a plain async `onClick`, not a form action: two fast taps fire two concurrent POSTs. The asistencia desk guards with a **ref** (`inFlight.current`, asistencia.tsx:405-420) precisely because state guards race; the agenda doesn't.
- **D3 · Silent failed save → retry duplicates.** `save()`/`cancelClass()` are `try/finally` with **no catch** (agenda.tsx:418-486): a rejected action (network drop, function error, timeout after the RPC committed) renders nothing — no toast, editor stays open, draft intact. The inevitable second tap re-runs `create_class_session`; nothing in the DB refuses it. Complete UI-side duplication mechanism.
- **D4 · Accepted write-skew race (documented, unlocked).** No calendar writer takes any lock. Materializer pass that reads a template before `update_recurring_schedule`/`retire_recurring_schedule` commits can claim a not-yet-claimed week and stamp the OLD slot — stray class on the calendar (20260806100000:116-126, 20260806100100:32-41). Owner ruling deferred fixing until "an actual report of one".
- **D5 · Cron-outage heal doubles hand-created rows** (see §1.5). Inside weeks 0..5 an outage looks like genuinely free days; the `SIN_GENERAR` banner only covers >+26 (page.tsx:72).

### S2 — Money / member impact

- **D6 · RC×CCS stranded credit.** `reservar_clase` checks `cancelled_at` (:29-31) **before** taking the session advisory lock (:103); `cancel_class_session` takes no lock. Cancel committing between read and insert → fresh `reservada` + credit consumed on a cancelled class whose release already ran. Escape hatch exists but is silent: `cancelar_reserva` never checks `cancelled_at` (20260806130000:133-137).
- **D7 · PL×CCS strand (corrected interleaving).** `pasar_lista_sesion` flips reservation status unconditionally by id — no `and status='reservada'` (pasar_lista_sesion.sql:100; contrast cancelar_reserva's guarded flip 20260806130000:189). Strand occurs when PL's flip commits **before** CCS's release CTE: the `asistida` row is exempt from release (:97, rationale :80-83) and `cancelar_reserva` refuses non-`reservada` forever → credit captured, unreleasable.
- **D8 · Duplicated pair hits members directly:** two independent bookable targets (per-id locks/dup-checks) → double charge; uncancelled ghost forfeits a credit (past classes can't be cancelled → manual money fix); rosters/occupancy split across rows.
- **D9 · Wrong-twin targeting at the desk.** `sesionMasCercana` tie-breaks by list order (rules.ts:504-508) over rows ordered by `starts_at` with no tie-break (marcadas.ts:219-221) → for a pair, either twin can win per load. Booking on twin A + desk tap walks-in against twin B; A later reads "No asistió". Real credits involved.

### S3 — Staff-facing correctness

- **D10 · Special fields silently dropped on recurring create.** Editor renders "Evento especial" during create (editor-sheet.tsx:489-520; alcance forced "clase" at :320, `puedeAmpliarAlcance` needs isEdit :61-63); recurring payload omits both fields (agenda.tsx:458-467); schema, RPC, and `schedule_template` have no such columns (agenda.ts:548-556; 20260805110000:288-296; materialize inserts `is_special` default false, materialize_week_for_gym.sql:44-45). Success toast anyway.
- **D11 · Phantom past instances.** Mid-week recurring create materializes this week's already-elapsed weekdays (loop starts at current Monday, create_recurring_schedule.sql:41-46; no `starts_at > now()` filter, materialize_week_for_gym.sql:41-47; backward clamp admits current week :20-24). Cancel refuses past ('La clase ya pasó', cancel_class_session.sql:23-24); retire only touches future (retire_recurring_schedule.sql:31) → permanent, visible, uncancellable phantoms counted in summaries.
- **D12 · Narrow-edit detach is a silent one-way door** on the most reflex-prone button (edit_class_session.sql:46). Mitigations: no-op guard (session-vm.ts:195-208) + receipt copy. Any touched field → detach, forever.
- **D13 · Retire aborts wholesale if a class starts mid-loop.** `starts_at > now()` snapshotted once (20260806100100:73-77); inner cancel raises 'La clase ya comenzó' (20260806130000:64-70) → whole retire rolls back. Operator pressing "Terminar" during a class of that schedule gets an unexplained hard failure.
- **D14 · Wide-scope special-only change silently blocked.** Guard forces `especialSinCambios=true` when `alcance !== "clase"` (session-vm.ts:197-199) while `aplicarAlcance` rides `isSpecial/specialName` through (:144-153). Save path just closes the editor — no toast (agenda.tsx:406-408).
- **D15 · Series controls offered for retired-template cards.** `templateId` mapped regardless of `is_active` (agenda.ts:228) while `plantilla` nulls (agenda.ts:233-246) → wide edit/cancel hits 'Horario no encontrado o ya retirado' (update_recurring_schedule.sql:30). Staff read it as "my edit did nothing" → re-create → duplication vector.
- **D16 · Past-dated one-off create allowed, then irreversible** (no temporal guard in create; cancel refuses past).
- **D17 · Occupancy seam confusion (documented owner ruling):** staff counts include walk-ins (ocupacion.ts:23-33), booking gate excludes them (contar_reservas_activas_miembro.sql:5) → card can read 16/15 while members still book.
- **D18 · Recurring create is all-or-nothing** on a single weekday collision (total rollback with a single-day-named refusal; 20260805110000:282-287).
- **D19 · Ambient date on narrow save:** `fecha: selectedIso` (agenda.tsx:444) — a glance/editor left open across a strip tap **moves** the class to the selected day. Relocation, not duplication — but reads as "my class vanished".
- **D20 · Roster picker state persists across different classes' quick-glance sheets** (session-roster.tsx:147-148; sheet never unmounts, agenda.tsx:698).
- **D21 · Sunday week-anchor divergence TS↔SQL (latent):** `inicioSemana` puts Domingo in the following week (format/src/date.ts:146-150); SQL normalizers put it in the preceding ISO week (20260805100000:66; 20260808210000:43). On a gym-local Sunday the browse-fill skip-window can silently skip one far week until Monday's cron.

### Refuted during the adversarial pass (do **not** "fix" these)

- **R1 · tz-change 23505 brick — refuted.** The move-CTE re-anchor is Monday-anchored and self-healing (`f(d+7)=f(d)+7`; two rows of one template can't fold into one ISO week under real offset shifts). The missing unique_violation handler on the fan-out is defensive hardening only (invariant proven at 20260806100000:80-92).
- **R2 · "Empty far weeks invite hand-creates" — refuted in practice.** Weeks 6..26 fill on browse, awaited before the read (agenda.ts:304-310, :348-352); banner beyond +26 (page.tsx:72). No staff-visible week is empty, banner-less, and creatable — except via D21 or an RPC failure.
- **R3 · Pure render duplication — impossible** (badge from DB column; 1:1 mapping; unique keys).
- **R4 · Route/RSC staleness — clean.** searchParams-driven reads, no cache directives; Next 16 template.tsx does not remount on search-param change (node_modules/next/dist/docs template.md:65).

---

## 3. Test blind spots (vs the repo's own written-rows rule)

- **No concurrency vectors anywhere** — ledger/advisory serialization claims are inferred, never raced (two connections).
- **No create-collision or double-submit vector** for `create_class_session` (only positive control + denials, scheduling_rls_denial.sql:303-323).
- `scheduling_materialization.sql:109-110` — deactivate asserted via return value only (soft violation of the written-rows rule).
- No tz-change-with-attached-rows vector; no RC×CCS / PL×CCS interleave; no booking-onto-cancelled vector; no mark-on-cancelled-class refusal (behavior currently allowed); no dual-staff `staff_gym()` lowest-gym_id tenancy vector; retire abort tested only via synthetic trigger, not the natural mid-loop race; pg_cron job firing is live-only (declared out of scope, class_horizon_autoroll.sql:66-69).

---

## 4. Live-DB diagnostics (read-only) to close the ticket

`class_session` has **no `updated_at`** — use `created_at` / `cancelled_at`.

```sql
-- Q1: the pair (per gym; tz from gym row)
select cs.id, cs.template_id,                      -- NULL ⇒ one-off/ÚNICA
       cs.starts_at, (cs.starts_at at time zone g.timezone) as local_start,
       cs.cancelled_at, cs.created_at,
       (cs.created_at at time zone g.timezone)::time as created_local
from public.class_session cs join public.gym g on g.id = cs.gym_id
where (cs.starts_at at time zone g.timezone)::timestamp >= '2026-08-26 07:00'
  and (cs.starts_at at time zone g.timezone)::timestamp <  '2026-08-26 07:30'
order by cs.created_at;
```

| Q1 pattern | Mechanism |
|---|---|
| both `template_id` NULL, `created_at` seconds apart | D1/D2/D3 — double-submit / silent-retry |
| one NULL + one attached | §1.1/§1.3/§1.5 — hand-create over series (gap between `created_at` ≈ vanish→notice) |
| two different non-NULL template_ids | two competing rules materialized the same instant (legal today; check retired predecessor) |

```sql
-- Q2: templates at that slot   -- Q3: ledger claims for week Mon 2026-08-24
select t.id, t.is_active, t.weekday, t.start_time, t.group_id, t.created_at
from public.schedule_template t
where t.gym_id = '<gym>' and t.start_time = '07:15'::time;
select * from public.schedule_template_week
where template_id in ('<ids>') and week_start between '2026-08-10' and '2026-09-07';

-- Q4: cron history that Monday
select ran_at, summary from public.cron_run_log
where ran_at between '2026-08-24 00:00Z' and '2026-08-25 00:00Z';

-- Q5: exposure — bookings/attendance on both ids
select r.class_session_id, r.status, r.is_walk_in, r.consumio, c.nombre, c.clases_restantes
from public.reservation r join public.clientes c on c.id = r.member_id
where r.class_session_id in ('<id1>','<id2>');
select class_session_id, cliente_id, consumio, perdonada from public.asistencias
where class_session_id in ('<id1>','<id2>');
```

Decision: Q5 bookings split across both ids → members affected; cancel the ghost **before** its start to auto-release+refund its holders (cancel_class_session.sql:50-59); after start it's a manual credit fix.

---

## 5. Recommended fixes (direction only — prioritized)

1. **Server-side dedup for one-offs:** partial unique index `(gym_id, class_type_id, starts_at) WHERE template_id IS NULL AND cancelled_at IS NULL` + friendly Spanish 23505 handler in `create_class_session`. Closes D1, and the DB side of D2/D3/§1.1/§1.5 outright.
2. **Client in-flight lock + catch:** ref-based guard (mirror `inFlight.current`, asistencia.tsx:405-420) and a `catch` around `save()`/`cancelClass()` with a failure toast. Closes D2/D3.
3. **Add the lock pair** for series verbs ↔ materializers (advisory xact lock keyed on template/gym+week) — the repo's own declared trigger ("an actual report of one") has now fired. Closes D4/D5.
4. **Create-vs-edit UX:** warn or block `+ Nueva clase` when the selected day+hora already has a class; visually distinguish create from edit. Kills the #1 staff trap.
5. **Special fields on recurring create:** support them (add to template) or hide the toggle when weekdays > 0. Closes D10.
6. **Past guards:** reject past-dated one-off creates; start the create horizon loop at max(current week, today) so elapsed weekdays don't phantom-materialize. Closes D11/D16.
7. **Guarded flips/locks in booking paths:** `and status='reservada'` in pasar_lista_sesion's booked branch; re-read `cancelled_at` inside `reservar_clase`'s lock (or take the lock before the read). Closes D6/D7.
8. **Retire resilience:** skip (not abort) classes whose start elapses mid-loop. Closes D13.
9. **Retired-template cards:** gate series verbs on `plantilla` presence, not raw `templateId`. Closes D15.
10. **Smaller:** toast for the silently-blocked wide-scope special save (D14); per-weekday outcomes on recurring create (D18); echo the card's own date into the editor instead of `selectedIso` (D19); reset roster picker on close (D20); unify Sunday week-anchor + pin with a test (D21).
11. **Perf (non-blocking):** early ledger `exists` check before view-time materialization RPC; `ORDER BY id` in the materializer loop (deadlock → agenda 500, rare); embed/parallelize the fifth sequential coach-name round trip on the hot read.
12. **Tests:** add vectors per §3, prioritizing create-collision, double-submit, and the two credit races.

---

*Passes: P1 structure maps (2 agents) · P2 deep dives (creation/recurrence, concurrency/integrity/test-gaps, edit-path forensics) · P3 adversarial verification (V1-V10, 8 confirmed / 2 corrected) + completeness sweep (10 surfaces). Every defect above survived verification or carries its correction inline.*
