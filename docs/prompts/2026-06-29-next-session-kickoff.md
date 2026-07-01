# Next-session kickoff prompts — Multi-Gym Platform

Paste the relevant block into a **fresh session** opened on this repo. Each prompt is
self-contained (assumes zero prior context) and points at the shield docs. Do **one phase
per session**, then review before the next.

---

## ▶ Session 1 — Phase 0: ADRs (paste this first)

```
We're starting the multi-gym platform work for this repo (RED-2.0): a Next.js 16 + Supabase
single-operator gym admin app becoming a 2-app, multi-tenant Turborepo platform (an admin app
+ a member client app, re-branded per gym client: Forge #1, RED #2, more later).

READ FIRST — these are the source of truth and the shield, do not skip:
- docs/planning/2026-06-29-multi-gym-platform-roadmap.md  (phased roadmap + guardrails + sequencing principle)
- docs/planning/2026-06-29-target-data-model-and-decisions.md  (locked decisions + target schema + do-not-violate invariants)
Then skim: ARCHITECTURE.md, CONTEXT.md, docs/adr/0001-supabase-rls-no-orm.md, AGENTS.md.
(This is Next.js 16 — read node_modules/next/dist/docs/ before writing any Next code. middleware
is renamed proxy.ts, Node-only. RLS is the security boundary. Sector-first dep boundary is
enforced by .dependency-cruiser.cjs.)

TASK — Phase 0 ONLY: formalize the already-locked decisions into three ADRs in docs/adr/,
matching the house ADR format (Status / Context / Decision / Consequences), concise and
decision-focused, in es-MX domain vocabulary where relevant, consistent with ADR-0001:
- ADR-0008 — Platform architecture: shared Supabase + gym-scoped RLS; one multi-tenant Vercel
  deployment per app (admin + client); host→tenant resolution in proxy.ts; per-gym brand modules;
  Turborepo monorepo.
- ADR-0009 — Identity & member model: two-tier auth (members self-register; gyms/owners
  invited-for-now, self-serve gym onboarding deferred); operator≠member roles via
  gym_membership(user,gym,role); members CLAIM their operator-pre-created clientes row by
  email/phone match; clientes→member evolution.
- ADR-0010 — Class scheduling model: class_session uses absolute starts_at + schedule_template
  for recurrence; multi-coach via join table; occupancy is DERIVED (never stored);
  booking/attendance consumes a plan class (Ilimitado exempt; no-show on 8-class still consumes);
  asistencias gains a class_session FK.

CONSTRAINTS:
- Phase 0 produces ONLY the ADR markdown — no app code, no migrations, no package moves.
- Obey the data-model doc's §5 invariants and the roadmap's "Sequencing principle"
  (foundation-first; features as vertical slices; expand/contract migrations keeping the live
  Forge app green; TDD/RLS-test-first per slice).
- If a decision seems missing, it is in the data-model doc or is a stated 🅿️ default there —
  do NOT invent a new one; ask me.
- When done: STOP and summarize for my review before Phase 1. Do not start Phase 1.
```

---

## ▶ Session 2 — Phase 1: Monorepo refactor (behaviour-preserving)

```
Continue the multi-gym platform work (see docs/planning/2026-06-29-multi-gym-platform-roadmap.md
and docs/planning/2026-06-29-target-data-model-and-decisions.md — read both first; ADRs 0008–0010
are accepted in docs/adr/).

TASK — Phase 1 ONLY: stand up a Turborepo monorepo and move the current app to apps/admin,
extracting shared code to packages/{domain,data,ui} along the existing enforced sector boundary.
This is STRICTLY behaviour-preserving: no schema change, no feature change, still single-tenant,
single-brand.

Use the superpowers:writing-plans skill to produce a TDD, bite-sized task plan in
docs/superpowers/plans/ for THIS phase before writing code, then execute it.

EXIT CRITERIA (from the roadmap): Forge admin builds, tests, lints, and DEPLOYS identically to
today; depcruise (.dependency-cruiser.cjs) stays green; a second app can import the shared core.
Keep ADR-0001 rules intact (proxy.ts not middleware.ts, server-only DAL, getClaims()/getUser(),
never getSession()). When done: STOP and summarize for my review before Phase 2.
```

---

## Reuse for later phases

For Phase 2 onward, copy the Session 2 block and swap the TASK + EXIT CRITERIA for the target
phase row in the roadmap's phase table. Always: read the two planning docs first, run
`superpowers:writing-plans` for that single phase, honour the §5 invariants + sequencing
principle, and stop for review at the phase boundary. Phases 3/5/6 build the DB **incrementally**
(foundation → catalog/schedule → booking/subscription) via **expand/contract** migrations —
never the whole schema at once.
