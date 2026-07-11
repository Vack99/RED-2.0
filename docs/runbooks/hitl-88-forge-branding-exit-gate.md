# hitl-88 — Forge client branding & seed exit gate evidence log

Recorded by the 2026-07-10 orchestration session. Companion to PRD **#83** and gate issue **#88**;
pattern follows `docs/runbooks/hitl-63-phase6-exit-gate.md`.

**What shipped (all merged to `main` @ `21c83ef`, both seeds LIVE):**

| Slice | Branch @ squashed SHA | What it is |
|---|---|---|
| #84 | `slice-84-dark-brandscope` @ `a61c408` | Forge client dark-only (`defaultScheme: "dark"`), `data-brand` seam on `<html>`, 26 RED glow selectors re-scoped `.dark[data-brand="red"]` |
| #85 | `slice-85-fmark-ignition` @ `c0de378` | Shared `ForgeIgnitionMark` bar-build ignition on the landing `animate` slot + tagline "Aquí se forja tu mejor versión" |
| #86 | `slice-86-forge-seed` @ `4a9aa78` | Real-forge seed (4 formats, 21 templates, CLASE INDIVIDUAL, 2 contact channels, Nosotros content) + 7 denial suites decoupled from the forge gym (owner-expanded scope) |
| #87 | `slice-87-forge-demo-mirror` @ `45b46b9` | forge-demo mirror + 3 demo coaches + sandbox templates retired (`is_active=false`, non-destructive) + dev client host row |

**Hosts:**
- Real forge client: https://forge.ibookit.lat
- forge-demo client: **attach `forge-demo.ibookit.lat` in Vercel first** (the `gym_domain` row exists; the domain attach is this gate's step 1). Until attached, reach the twin via the client deployment with `?gym=forge-demo` (the hitl-63 red-demo pattern).
- RED client (regression): https://red.ibookit.lat

## Pre-flight — machine-verified 2026-07-10 (this session, no human walk needed)

- [x] All 4 slices closed; every slice passed both fresh-eyes gates (Elegance + Senior Dev, all YES first try; verdicts + hunks on each issue).
- [x] Merged to `main` in dependency order; full gate green on the merged tree (lint 0 errors, typecheck clean, **868/868 vitest** incl. brand census + drift/coverage guards).
- [x] Scratch `pnpm test:denial` **35/35 green** on both schema slices pre-merge (incl. triple-apply idempotency of #86); scratch projects deleted.
- [x] Pre-apply dump: `C:\Users\Aaron\Documents\RED-2.0-backups\2026-07-10-pre-forge-seed\` — 12 JSON files (11 written tables + counts baseline).
- [x] Both seeds applied live via MCP (`seed_forge_real_program_content`, `seed_forge_demo_mirror_and_coaches`); every in-migration self-assertion passed.
- [x] Post-apply counts matched expected deltas **exactly**: class_type 6→14, schedule_template 14→56 (47 active — precisely the 9 forge-demo sandbox rows flipped inactive, zero deleted), paquetes 9→11, gym_contact 1→3, coach 3→6, gym_domain 13→14; `class_session`/`asistencias` untouched. **Zero data loss.**
- [x] Advisors after apply = the pre-existing by-design baseline; nothing new introduced.
- [x] `/precios` + landing widget live-render **CLASE INDIVIDUAL $150 on top** (owner-directed `orden` 4→0 on forge + forge-demo, 2-row data edit, verified in served HTML).
- [x] `/reservar` correctly auth-gates anonymous visitors. **Note:** forge has 0 materialized sessions until the first *member* view — `ensure_week_materialized` derives the gym from the caller's membership, so the booking walk below is what materializes the program. Expected on first view: 21 sessions for the current week.

## AC1 — Vercel attach

- [ ] `forge-demo.ibookit.lat` attached to the client Vercel project and resolving
- [ ] Page loads in **forge paint** (calm gold-on-black, F-mark) — not base/neutral chrome

## AC2 — forge-demo walkthrough (the twin is the full-experience sandbox)

- [ ] **Dark-only every screen** — landing, precios, nosotros, contacto, entrar, reservar, clase detalle, mis reservas, membresía, perfil: all dark, no theme toggle, no light flash on load
- [ ] **Landing ignition** — F-mark bar-build plays on load (icon wipe → wordmark rise → shine); tagline "Aquí se forja tu mejor versión" under the logo (not "Reserva. Entrena. Avanza.")
- [ ] **Reduced-motion check** — with OS reduce-motion on, the ignition collapses to its final frame
- [ ] **Calm-gold surfaces** — reservar occupancy pips, membresía plan bar, clase roster: token-driven calm layers, **zero red/neon bleed**
- [ ] **Program bookable end-to-end** — `/reservar` as a logged-in member materializes the real program (L–V 06/07/18/19h with the day's focus, Sáb 08:00 CORE; cupo 15); book a class → balance/occupancy behave; the retired sandbox classes (Crossfit/Testing) do NOT appear in future weeks
- [ ] **Coach roster renders** — Diego Fuentes / Renata Salas / Emilio Cordero (forge-demo only)
- [ ] **Historical data intact** — past sessions/asistencias from the sandbox era still visible where history surfaces

## AC3 — real forge spot-check (data with respect; look, don't book)

- [ ] `/precios` — 4 plans, **CLASE INDIVIDUAL $150 first**, then 8 clases $799 / 12 clases $1,199 (popular) / Ilimitado $1,350
- [ ] `/contacto` — ONLY phone +52 614 370 4989 and Instagram @forge_trainingfunctional (no email/address/hours)
- [ ] `/nosotros` — story, pull-quote, tagline, 3 values, 5 facilities, 3 stats, 6 FAQs all render
- [ ] `/reservar` — real program shows (after a member view materializes it)
- [ ] **No coaches anywhere** on real forge

## AC4 — RED regression spot-check

- [ ] RED client paint **unchanged** — landing copy-reveal neon, ring ignition + RED tagline, reservar ember bar, membresía plan bar, roster pips/strobe all intact
- [ ] No forge bleed on any RED screen

## AC5 — bundle delta sanity

- [ ] #85 recorded **0 B client-JS delta** (all additions are server components, landing stays dynamic SSR) — sanity-check the deployed landing ships no new client chunk

## AC6 — verdict

- [ ] Verdict recorded below; owner copy corrections filed as **follow-ups, not blockers**
- [ ] `#88` closed → closes PRD `#83`

**Known owner corrections (follow-ups):**
- `stat` "En la forja desde **2021**" is a PLACEHOLDER — correct the founding year from admin ("Clases a la semana 21" and "Cupo por clase 15" are real, they equal the seeded program).
- Review agent-drafted copy (story / values / facilities / FAQ / tagline) in Forge's voice; edit from admin at will — seeds never clobber owner edits (`where … is null` / not-exists guards).

## Verdict

_(record date + PASS/FAIL + notes here)_
