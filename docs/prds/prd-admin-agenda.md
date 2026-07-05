> Tracked in: https://github.com/Vack99/RED-2.0/issues/36

# PRD — Phase 5: Admin reframe + Agenda (curated catalog, scheduling, authoring)

## Problem Statement

- The client app (Phase 6) is **fully operator-driven** — but nothing operator-facing can author what members will see. No scheduling, catalog, coach, or content tables exist; today's "clases" is a per-paquete integer grant (ADR-0007), and no agenda/calendar code exists anywhere in the monorepo (verified 2026-07-05 — clean greenfield).
- The approved Agenda design (interactive mock, `RED-AdminApp-Class-Page/Agenda Week View.html`) encodes the operator's core daily workflow — schedule classes, see the day's load at a glance — but its shortcuts (stored mutable `booked` counter, weekday+string times, comma-string coaches, fixed fake clock) are exactly what ADR-0010 exists to forbid in a live multi-tenant DB.
- Admin nav still centers `vender`; the approved design gives **AGENDA** that tab slot.
- Phase 6 (booking) is blocked until the curated-catalog schema exists (roadmap dependency 5 → 6).

## Solution

Ship the admin/operator half of the class-scheduling product, to the approved mock, on the Phase-3 RLS spine and Phase-4 token contract:

1. **Curated-catalog schema (expand-only)**: `coach`, `class_type` (+ `class_type_workblock`, `class_type_bring_item`), `class_session` + `class_session_coach`, `schedule_template` (+ template default coaches), `plan` (evolves `paquetes` in place) + `plan_feature`, gym content (`about_value`, `facility`, `stat`, `faq`), `room` — every table `gym_id` + RLS per the ADR-0013 curated/showcased class (data-model §3/§4).
2. **Scheduling spine per ADR-0010**: absolute `starts_at timestamptz`; recurrence in `schedule_template` materialized to independent session rows; occupancy **derived, never stored** (zero-reservation projection until Phase 6 adds `reservation`).
3. **The Agenda page** (DÍA list + SEMANA day-grouped agenda + session editor), built to the interactive mock, brand-neutral and token-driven.
4. **Authoring surfaces under `cuenta`**: coaches, class types, plans (the paquetes editor evolves), gym content.
5. **Nav restructure**: AGENDA takes `vender`'s tab; `vender` relocates to the client ficha (primary action) + an INICIO quick-action CTA.
6. **`red-demo` gym twin** seeded per the per-brand demo model.

Outcome (roadmap exit): an operator schedules a one-off or recurring `class_session` and curates plans/coaches/content; occupancy derived; all writes gym-scoped RLS.

## User Stories

1. As an operator, I want an **Agenda** tab showing a day's classes (hora, duración, tipo, coaches, ocupación), so that I can run the floor from my phone.
2. As an operator, I want the DÍA header to show a derived summary ("6 clases · 109 reservas"), so that I see the day's load without counting.
3. As an operator, I want a SEMANA view grouping Lun–Sáb classes per day with occupancy %, so that I can spot weak or overbooked days across the week.
4. As an operator, I want to create a class with tipo, hora, duración, cupo and coaches from `+`, so that scheduled sessions exist for members to book in Phase 6.
5. As an operator, I want **Se repite** weekday toggles that create the class across several weekdays in one save, so that a recurring schedule is one action, not six.
6. As an operator, I want a recurring schedule to materialize as **independent dated sessions**, so that editing one date (a holiday move) never rewrites the whole series.
7. As an operator, I want to edit or cancel a single session, so that one-off changes stay one-off.
8. As an operator, I want to mark a session **evento especial** with a name, so that it stands out (★) on the agenda.
9. As an operator, I want to add a new **tipo de clase** from the picker, so that my catalog grows without a developer.
10. As an operator, I want to assign **multiple coaches** to one session, so that shared classes show everyone ("Marisa, Paty").
11. As an operator, I want to manage my coach roster (nombre, iniciales, rol, especialidad, bio, activo, orden), so that the client app can showcase it.
12. As an operator, I want to curate my plan catalog (precio, cupo de clases, badge, destacado, features), so that the client app's precios page is mine to author.
13. As an operator, I want to author gym content (valores, instalaciones, stats, FAQs), so that the client app's nosotros/marketing pages are operator-driven, never hardcoded.
14. As an operator, I want occupancy and session states (Terminó, Lleno, Casi lleno, A continuación) **derived live**, so that what I see is always true — never a stale stored counter.
15. As an operator, I want `vender` reachable from a cliente's ficha and an INICIO quick action, so that losing its tab doesn't slow down a sale.
16. As an operator, I want empty states ("Sin clases este día · toca + para crear una"), so that an empty agenda invites action.
17. As an operator, I want the es-MX copy verbatim from the approved mock (toasts like "Clase creada · visible en la app"), so that the product speaks the approved voice.
18. As an owner, I want every new table gym-scoped with RLS-by-membership, so that my catalog and schedule never leak to another gym.
19. As an attacker (authenticated member of gym A, or anon), I want my writes to gym B's catalog/schedule refused by the DB, so that isolation holds even if the app misroutes me.
20. As a member (Phase 6), I want to read my gym's catalog and schedule, so that booking screens can render — anon/pre-auth reads arrive in Phase 6 with the marketing pages that consume them.
21. As the platform developer, I want all week/time math tz-parameterized from `gym.timezone`, so that Mexico's four timezones render correct wall-clock agendas.
22. As the platform developer, I want branded ids for the new entities, so that cross-entity id mixups fail at compile time.
23. As the platform developer, I want the Agenda built from brand-contract tokens only, so that RED renders the same page red by host with zero code change.
24. As the Phase-6 planning session, I want `class_session`/`plan`/`coach` shapes stable and documented, so that `reservation` and `subscription` can FK onto them without rework.
25. As a preview/dev user, I want a `red-demo` gym twin with a demo membership, so that RED flows are testable without touching live forge data.
26. As the maintainer, I want migrations expand-only with a manual pre-DDL dump, so that the live free-tier DB (no PITR) is never one bad migration from data loss.
27. As a gate-checker, I want each slice's diff minimal per the design principles below, so that structure without a named present need is rejected.

## Implementation Decisions

All decisions below were locked at the 2026-07-05 kickoff (shields: roadmap Phase-5 row, data-model §4/§5/§6, ADR-0010, the interactive mock digest). Cited, not restated — read ADR-0008/0009/0010/0013 alongside this PRD.

- **(a) `plan` evolves `paquetes` in place (expand-only), reusing live columns** — confirmed by a 2026-07-05 elegance + senior-dev review; per-column map is binding:
  - **Reuse, do not duplicate**: `clases` IS the class quota (NULL = ilimitado already, `paquetes_clases_ck`, `consumirClase` guard stays the single source — no `class_quota`, no `is_unlimited`); `popular` IS the featured flag (per-gym `paquetes_one_popular` invariant stays — no `is_featured`); `precio` (whole pesos, the `registrar_venta` money path) stays the price truth — **no `price_cents`** until a payment rework repoints the sale RPC end-to-end (deferred).
  - **Add (new, marketing-only)**: `code` (`unique(gym_id, code)`, per the Phase-3 re-key pattern), `name` + `subtitle` (free-text marketing copy — **distinct from the grant-derived `nombre`**, which stays derived and receipt-facing per ADR-0007; `name` never feeds `crearVenta`), `badge` (display string, distinct from the `popular` boolean), `cadence` (billing-cadence display label, declared **orthogonal** to the `vigencia_tipo`/`vigencia_dias` access window — `actualizar_paquete`'s pinned `vigencia_dias=30` is untouched), + child `plan_feature`.
  - No rename, no second table (the Phase-3 `clientes` precedent; keeps `paquetes.id` stable for Phase-6's `subscription.plan_id` FK — option 2's id-remapping hazard is why it was rejected). The live vender/saldo/stacking flow is untouched.
- **(b) RLS classes per table.** Curated/showcased class (ADR-0013 predicate: operator/owner write via `is_staff_of`, gym-member read via `is_member_of`) on all new tables; `paquetes` already has member read (Phase 3). **Anon read is DEFERRED to Phase 6** — it lands with the client marketing pages that consume it, recorded then as the conscious "catalog pricing is public" decision (ADR-0013 anticipated this riding Phases 5/6; shipping it consumer-less would expose every gym's pricing early for nothing). The `rls_auto_enable` trigger stays on.
- **(c) Recurrence = template + idempotent materialization.** "Se repite" on **create** runs one atomic RPC: insert `schedule_template` (+ default coaches) and materialize `class_session` rows (+ coach joins) for the visible horizon. Viewing a future week ensures materialization for that week via the same idempotent RPC (unique guard on `(template_id, starts_at)`) — never read-time expansion (ADR-0010). **Editing an existing session never fans out** (mock behavior; sessions independent once written); a template governs only sessions materialized after it.
- **(d) Occupancy in Phase 5 = the derived mechanism at zero.** `reservation` lands in Phase 6; the occupancy projection (`capacity − count(active reservations)`) ships now and reads 0 active reservations, so summaries render "N clases · 0 reservas" honestly. Time-driven states (Terminó, A continuación) derive from `starts_at` + now(tz); count-driven states (Lleno, Casi lleno ≥ 0.85) derive from the projection and are exercised by fixture tests until Phase 6 feeds them.
- **(e) Editor semantics = mock, coaches = catalog.** Bounds are business rules (confirmed by data-model §4): duración ∈ {30, 45, 60, 75, 90}, cupo 4–40, hora 05:00–22:45 in 15-min steps, defaults 18:00 / 45 min / cupo 24. The mock's free-text coach field is **discarded**: coach selection is a multi-select over the `coach` catalog → `class_session_coach` rows (invariant §5.4); no coach chosen renders "Por asignar" (display only, no fake rows). The tipo picker's `+` inserts a real `class_type`. Evento especial toggle → `is_special`/`special_name` (empty name → "Especial").
- **(f) SEMANA is a day-grouped agenda list, not a time grid.** Group header (day number + weekday + "N clases · X%"), tappable class rows (time · status dot · tipo ★ · count), week footer "Semana · X% ocupación", empty day "Sin clases". There is **no HOY button** (the mock has none — "Hoy" is the navigator's relative label). Date strip is Lun–Sáb, swipeable, arrows step ±1 day (DÍA, wrapping) / ±1 week (SEMANA).
- **(g) Quick-glance sheet ships without the roster.** Card tap opens the sheet (time, tipo, coaches, cupo, availability line, edit pencil). "Ver lista" / "Pasar lista" / walk-in "Agregar" **defer to Phase 6** (they need `reservation`); the ASIST badge feed goes with them.
- **(h) Nav restructure.** `TABS`: `agenda` replaces `vender` (INICIO · CLIENTES · ASIST · AGENDA · CUENTA). `vender` relocates: primary action on the cliente ficha + quick-action CTA on INICIO — the flow itself is untouched. Both land in the same slice as the tab swap (no commit ships a dropped-but-unreachable vender).
- **(i) Authoring under `cuenta`.** Coaches, class types (+ workblocks/bring-items), plans (the existing paquetes editor evolves), gym content — all as cuenta sub-pages following the existing sector pattern. `room`: table + nullable `class_session.room_id` only, **no authoring UI** (§6 parked default, single room).
- **(j) Brand-neutral by construction.** Accent = `var(--yellow)` etc. from the brand contract; the mock's Forge gold is paint, not spec. `@gym/brand` untouched.
- **(k) Timezone.** All week/date math tz-parameterized through `@gym/format` (never reads a gym row); pages resolve tz via the operator's gym. Sessions store the absolute instant; the agenda renders wall-clock in gym tz.
- **(l) Branded ids** minted for `coach`, `class_type`, `class_session`, `schedule_template`, `room` (plan keeps the existing paquete id — same row).
- **(m) `red-demo` seed.** A `red-demo` gym twin (+ demo operator membership, demo catalog rows) per the per-brand demo model, so Phase-5 verification never mutates live forge data.

### Suggested slice decomposition

Guidance only — /to-issues owns the final cut. Every schema slice: denial-test-first, expand-only, pre-DDL dump.

- **S0 — Catalog schema spine**: `coach`, `class_type` (+children), `room`, branded ids, RLS + denial tests, types regen. No UI. *(sonnet; supabase-postgres-best-practices)*
- **S1 — Scheduling schema**: `class_session` + `class_session_coach`, `schedule_template` (+ default coaches), materialization RPC (idempotent), RLS + denial tests. Blocked by S0. *(the highest-stakes schema slice)*
- **S2 — Plan evolution**: paquetes expand per the (a) column map + `plan_feature`; plan editor evolution under cuenta. Blocked by S0 (ids only). *(touches the live sales table — care; no RLS change)*
- **S3 — Gym content schema + authoring**: `about_value`/`facility`/`stat`/`faq` + cuenta sub-pages. No blockers.
- **S4 — Domain rules + format (pure)**: estado-sesión derivation, occupancy math, materialization spec, agenda/relative-label formatting (tz-param). No blockers (turn-1 ready). *(TDD showcase slice)*
- **S5 — Agenda DAL**: day/week readers (ensure-materialized), session/template mutation seams (Zod + RPC). Blocked by S1, S4.
- **S6 — Agenda UI primitives**: wheel picker (generalize clases-picker), swipeable date strip, session card, week group, editor sheet — fixture-driven. No schema blockers. *(frontend-design; taste ≥ 7 model)*
- **S7 — Agenda page**: DÍA + SEMANA + editor + quick-glance wired to the DAL; nav restructure + vender relocation (h). Blocked by S5, S6.
- **S8 — Coach + class-type authoring** under cuenta. Blocked by S0.
- **S9 — `red-demo` seed + phase evidence**. Blocked by S0–S2.
- **S-HITL — Visual fidelity sign-off** (Agenda vs interactive mock, on-device), live smoke on the forge host, red-demo login check. Terminal, labeled `hitl`.

### Design principles

This work favors YAGNI and KISS: ship the minimum diff that satisfies the acceptance criteria and nothing more. Reject any interface, generic, dependency injection, or extracted "shared" / base module with a single caller in this diff — DRY and SOLID do not justify structure the criteria do not require, and premature abstraction fails YAGNI. Prefer a little duplication over the wrong abstraction. Any deliberate exception must name its concrete present need; unnamed single-caller abstraction is a failure.

**Named present-need exceptions (Phase 5):** branded ids for the five new entities (cross-entity id mixups are the compile-time failure they exist to catch); `schedule_template` as a separate table (ADR-0010 locked — recurrence is not a session column); `plan_feature` / `class_type_workblock` / `class_type_bring_item` child tables (ordered display lists the mock renders); the idempotent materialization RPC (atomicity per ADR-0005 — template insert + session fan-out is one write). Anything beyond this list — a scheduling "engine", a generic CRUD factory for catalog tables, a calendar abstraction serving one page — fails the gate.

## Testing Decisions

- **TDD per slice, denial-test-FIRST**: the cross-tenant denial test for a policy is written and recorded failing/green BEFORE the policy it guards, inside every RLS slice.
- Good tests exercise **external behavior** (what an operator/member/attacker can do), never implementation details.
- **Modules under test**: `@gym/domain` scheduling rules (estado-sesión, occupancy, materialization spec — prior art: vigencia/saldo/urgencia tests), `@gym/format` agenda formatting (tz-param — prior art: existing format tests), the RLS denial suite (runs on a throwaway free project via `SUPABASE_TARGET_REF` + the branch-refusing `apply-sql.mjs` — Supabase branching is Pro-gated), atomic RPCs (materialization idempotency, session CRUD, plan writes), Zod mutation schemas.
- UI primitives and admin pages: fresh-eyes gates + existing shield suites (lint, typecheck, depcruise, docs-guard) — no component tests (kickoff decision).
- **Live-DB safety**: manual pre-migration dump before ANY live DDL (free tier = no backups; evidence pattern `docs/runbooks/hitl-28-evidence.md`); `get_advisors` after every policy/function migration; Forge green at every commit.

## Out of Scope

- **Booking and everything member-transactional** → Phase 6: `reservation`, `subscription`, roster panel (Ver lista / Pasar lista / walk-in Agregar), the ASIST badge feed, member stats views, the 12 client screens.
- **Payments** — UI-only posture stands (§6 parked default); nothing wired. `price_cents` and any `registrar_venta` repoint ride that future rework.
- **Anon-read RLS on the catalog** → Phase 6 (decision b).
- **#35 RED-admin go-live** → Phase 7 (parked; commented).
- **`paquetes` rename/contract** to a literal `plan` table name — expand only; any contract waits until Phase 6 proves the catalog shape.
- **Multi-room authoring**, notification automation, self-serve gym onboarding (§6 parked defaults).

## Further Notes

- **Pinned Phase-6 interface**: the shapes of `class_session`, `class_session_coach`, `plan` (evolved paquetes), `coach` are the contract Phase 6 FKs onto (`reservation.class_session_id`, `subscription.plan_id`). Phase 6 may cite S1/S2's issue numbers as blockers — expected inbound edges.
- **No parallel initiative**: Phase 5 runs alone (no Phase-3/4-style cross-initiative fence needed). `@gym/brand` remains frozen regardless — scheduling carries no brand seam.
- **HITL list**: the terminal visual-fidelity + live-smoke slice; every pre-DDL dump approval rides the schema slices' evidence.
- **Docs-guard timing**: any ARCHITECTURE/CONTEXT row citing a new path lands in the same commit that creates the path.
- **Coordination**: initiative label `platform-phase5-agenda-2026-07` + `ready-for-agent`; stacked branches, main never touched; the human fast-forwards the reviewed stack to main in dependency order afterward (solo-main workflow).
