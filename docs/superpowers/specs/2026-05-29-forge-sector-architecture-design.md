# Forge — Sector-First Architecture Design

**Date:** 2026-05-29
**Status:** Approved (design); ready for implementation planning
**Author:** Aaron + Claude (research-backed)
**Supersedes/extends:** the client brief at `docs/superpowers/specs/2026-05-27-forge-gym-admin-architecture.md` (source material — distilled here, not duplicated)

---

## 1. Why this document exists

Forge today is a **frontend mock cloned from a claude.ai/design prototype**. Every screen renders off mock seed data + `localStorage` behind a thin generic store. **None of the domain rules exist yet**: selling builds a receipt but never mutates the client; attendance toggles a presence grid but never consumes a class; `estado` is a *stored* seed field, not derived; vigencia end-dates are a hardcoded lookup table; WhatsApp templates sit in seed with nothing rendering them.

The recurring failure mode this design prevents: a session picks up the mock's internals, "makes it work" on top of mock-shaped scaffolding, and the code rots into something unreadable, unnavigable, and unauditable — so more time goes to fixing the frame than building the thing.

**This document establishes a senior-grade, "readable-like-a-book", agent- and HITL-navigable architecture *before* real behavior is implemented.** It is the predecessor to `/improve-codebase-architecture`: that skill deepens working code; this one shapes a non-working mock into clean sectors first.

## 2. Goal & non-goals

**Goal:** A structure where any human or agent can open one entry document, understand the whole app, and know exactly where each concern lives — enforced by a single machine-checked boundary so it cannot silently rot.

**Non-goals (this pass):**
- Implementing the Supabase backend (next cycle — Supabase is not installed yet).
- Building auth / `proxy.ts` / login (out of scope; the brief needs only single-operator login, trivial later).
- Authoring the reusable `sector-map` skill (extracted in a later pass once this is proven — see Appendix A).
- Any visual/UX change. The structural pass is behavior-preserving; the app keeps running on mock data.

## 3. Decisions locked

| Decision | Choice | Rationale |
|---|---|---|
| Deliverable sequence | **Forge first; skill extracted later** | `write-a-skill` builds best from a proven instance, not a theory |
| Physical structure | **Route-colocated sectors + pure `src/domain` core** | Most idiomatic Next 16; routes already scream the domain; lightest, most book-readable |
| Boundary enforcement | **One dependency-cruiser rule via pre-commit hook** | Catches drift before it lands without gating a one-user app's deploys |
| Doc set | **5 artifacts, no more** | Separate cheap human *maps* from one machine *constraint*; YAGNI for a solo dev |

## 4. The SECTOR-FIRST framework (phases applied to Forge)

Six phases, each with an explicit exit criterion so any future session can resume from the artifacts — no state hidden in chat history.

| # | Phase | Output | Exit criterion |
|---|-------|--------|----------------|
| 0 | **Archaeology** | Every file classified `keep / mock-only / mixed`; the mock-isms list (§9) | every fake has a "replace-with" line |
| 1 | **Glossary** | `CONTEXT.md` — es-MX term → meaning → *type + file* | every domain noun on a screen points at a type |
| 2 | **Lock irreversibles** | 3 ADRs (§6), authored via `grill-with-docs` | nothing "decide later" that would force a rewrite |
| 3 | **Sectoring** | `ARCHITECTURE.md` sector table + dependency arrows | every `keep`/`mixed` file maps to exactly one sector; arrows acyclic |
| 4 | **Skeleton move + seam** | the folder tree (§5) + the one boundary rule + pre-commit | `pnpm lint` green, app still runs on mock, git diff = pure moves + the rule |
| 5 | **Migration backlog** | per-sector "mock→real" notes (§10) | hands off to `to-prd → to-issues → to-goal` |

The phases are **content-neutral** and the artifacts are **format-standard** — only the sector taxonomy and the one stack-specific seam shape change per project. That is what makes this extractable into a reusable skill later.

## 5. Target structure

Routes stay the screaming map; screen UI colocates under each route; the rules live in a pure, testable core; the data seam stays thin and swappable.

```
forge-1.0/
├─ AGENTS.md                  # existing note + a 6-line SECTOR MAP pointing at ARCHITECTURE.md
├─ ARCHITECTURE.md            # ← READ FIRST: sector table + dependency arrows + "where do I add X?"
├─ CONTEXT.md                 # es-MX glossary (~10–12 terms → type + file)
├─ docs/
│  ├─ adr/                    # 0001-supabase-rls-no-orm · 0002-derived-not-stored · 0003-stacking-forfeit-dates
│  └─ superpowers/specs/      # this doc + the original brief
├─ .dependency-cruiser.cjs    # THE one rule: src/domain/** + src/lib/** ✗→ src/components/** | src/app/**
└─ src/
   ├─ app/                    # ROUTES = the screaming map (thin pages compose a screen)
   │  ├─ layout.tsx           #   single root layout (html/body + providers) — keep ONE
   │  ├─ page.tsx             #   redirect → /inicio
   │  └─ (app)/               #   authed shell (tab-bar via layout.tsx + template.tsx)
   │     ├─ inicio/      page.tsx + _components/
   │     ├─ asistencia/  page.tsx + _components/
   │     ├─ clientes/    page.tsx + [id]/page.tsx + _components/
   │     ├─ vender/      page.tsx + _components/ + _actions.ts   # ('use server', next cycle)
   │     └─ cuenta/      page.tsx + _components/
   │       # _folder = non-routable; colocates screen-specific UI next to the route that owns it
   ├─ domain/                 # PURE CORE — no React, no Supabase, no side-effects. 100% unit-testable.
   │  ├─ types.ts             #   Cliente · Paquete · Venta · Asistencia · Cobro · Plantilla · Perfil
   │  └─ rules.ts             #   stackPaquete · calcVigencia · derivarEstado · consumirClase · renderPlantilla · forfeit
   │                          #   (split into rules/<area>.ts as each earns its weight)
   ├─ lib/
   │  ├─ data/                # THE SEAM — localStorage today → Supabase DAL tomorrow, same hook shapes
   │  │  ├─ README.md         #   the swap contract (hook shapes, createStore pattern, mock→Supabase steps)
   │  │  ├─ store.ts          #   today's observable store (keep)
   │  │  └─ seed.ts           #   mock seed (mock-only — deleted at migration)
   │  ├─ supabase/            # FUTURE: client.ts (browser) · server.ts (per-request, awaits cookies())
   │  └─ date.ts · format.ts · utils.ts
   └─ components/forge/       # SHARED UI KIT (design system, presentation only)
      └─ ui · icon · brand · sheet · toaster · count-up · theme-toggle · tab-bar
```

**The enforced dependency contract (acyclic):**
`components/forge` (UI kit) → used by → `app` screens → which call → `domain` + `lib/data`. **`domain` imports nothing inward.** No route's `_components` imports another route's `_components`; cross-sector composition happens at the route.

## 6. The three ADRs (irreversibles frozen in Phase 2)

These become real files in `docs/adr/` (Nygard format: Context / Decision / Consequences; immutable + dated; superseded, never edited).

### ADR-0001 — Supabase + RLS, no ORM
supabase-js used directly; RLS (policies keyed to `(select auth.uid())`) is the primary security boundary; a `server-only` Data Access Layer shapes DTOs and houses domain-rule calls. **Records that Next 16 renamed `middleware.ts` → `proxy.ts`** so a future session does not reintroduce `middleware.ts` per stale memory. **Supabase is not installed yet** — the exact client/cookie/auth API shapes (`@supabase/ssr` `createBrowserClient`/`createServerClient`, `getAll`/`setAll`, `getClaims`) are recorded as *verify-at-implementation*, not frozen.

### ADR-0002 — Derived, not stored
`estado`, `vence`, `diasRest`, `asistEsteMes`, `inicial` are **computed at read** from stored facts (the client's purchase history + attendance), never persisted. This is the single biggest correction to the mock and prevents the dual-write drift the seed already exhibits.

### ADR-0003 — Stacking, forfeit & date model
The domain semantics in §7, plus: attendance is stored as **absolute Chihuahua-local calendar dates** (one row per attendance), not offsets from a `DEMO_TODAY` constant — this is what makes the brief's "enter a week at once from a written list" possible.

## 7. Domain core — confirmed rules

Pure functions in `src/domain/rules.ts`, unit-tested against the brief's worked examples (confirmed by the owner 2026-05-29):

- **`stackPaquete(actual, nuevo)`** — buying early **adds** classes and **adds** days to what remains (additive, no re-based window). *Example: 5 classes / 3 days left + an 8-class/20-day package → 13 classes / 23 days.* (Brief Q5.)
- **`calcVigencia(paquete, fechaCompra)`** — 8-class → +20 days, 12-class → +25 days from purchase date; **Ilimitado → end of the current calendar month** (brief Q1). Replaces the hardcoded `VIG_END` table.
- **`derivarEstado(cliente, hoy)`** —
  - `activo`: not expired AND (classes > 0 OR ∞)
  - `por_vencer`: **≤ 5 days left OR ≤ 2 classes left** (and not ∞)
  - `sin_clases`: expired OR classes = 0
  Replaces the stored `estado` field and the three conflicting threshold checks scattered across `clientes.tsx`, `inicio.tsx`, `cliente-detalle.tsx`, `asistencia.tsx`.
- **`consumirClase(cliente)`** — each attendance −1 class unless Ilimitado; floored at 0; reaching 0 ends the package (`sin_clases`). **Same-day duplicate attendance is allowed and consumes a class** (a class is a class).
- **`forfeit(cliente, hoy)`** — on vigencia expiry, remaining classes are forfeited (brief Q2/Q3).
- **`renderPlantilla(plantilla, contexto)`** — substitutes `{nombre} {clases} {paquete} {vence} {dias} {precios} {datos_pago} {negocio}` from cliente + paquete + cobro + perfil. Replaces the two hand-built inline WhatsApp messages and wires up the otherwise-dead `SEED_PLANTILLAS`.

## 8. Brief reconciliations

- **Brand = "FORGE"** (brief Q10). Fix the ~5 hardcoded "Forge Bootcamp" occurrences (root layout metadata, receipt footer, WhatsApp body, seed `Perfil.negocio`); store the name once and reference it.
- **`Cliente` fields:** add **optional `email`** and **optional `birthday`** (brief Q4); keep **phone required** because WhatsApp retention is the app's reason to exist (the spine). Relax `vender.tsx`'s phone validation accordingly only where it conflicts. The "phone optional (brief) vs phone is the spine (decision)" tension is noted in CONTEXT.md.

## 9. Mock-isms to replace (Phase 0 output)

| Artifact | Location | Replace with |
|---|---|---|
| Stored `estado`/`inicial`/`vence`/`asistEsteMes` | `lib/data/types.ts`, `seed.ts` (SEED_CLIENTES) | derived via `derivarEstado` / `calcVigencia` at read |
| `VIG_END` magic end-date table | `screens/vender.tsx:25` | `calcVigencia(paquete, fechaCompra)` |
| `setTimeout(700)` fake sale + random folio | `screens/vender.tsx:87–92` | real `crearVenta` server action; DB-generated folio |
| Fixed-date receipt (`28 may`, `27 MAY → 16 JUN`) | `screens/vender.tsx:109,433,508` | computed at sale time |
| `HOY` hardcoded metrics | `seed.ts:64–73` | `calcularResumenMes` over real ventas + asistencias |
| `HISTORIAL` / `PAGOS` inline arrays | `screens/cliente-detalle.tsx:21–32` | queries by `cliente_id` |
| `recientes` hardcoded list | `screens/inicio.tsx:22–27` | query: today's attendance, recent first |
| `PASE_SEED` / `ASIST_TIMES_SEED` | `seed.ts:118–135` | real `asistencia` rows; test fixtures, not prod seed |
| Offset-from-`DEMO_TODAY` attendance grid | `lib/date.ts`, `store.ts` | absolute Chihuahua-local dates per row (ADR-0003) |
| "Forge Bootcamp" string | ~5 spots | "FORGE", stored once |

## 10. Migration backlog (Phase 5 output — feeds `to-prd`)

Dependency order: **domain core first** (everything depends on it), then per sector.

1. **`domain/` (first):** extract `clientUrgency`, `VIG_END`, stored `estado` into pure rules; unit-test against brief examples. *No Supabase needed — this is real, tested functionality on day one.*
2. **`ventas`:** server action calls `stackPaquete`, persists the `venta`, **mutates the cliente** (classes+days stacked), DB folio, then `updateTag('clientes','max')` for read-your-writes. `recibo` rendering stays.
3. **`asistencia`:** `togglePase` → server action inserting/soft-deleting an `asistencia` row (absolute date) AND calling `consumirClase`. Bulk back-entry supported.
4. **`clientes`:** `estado`/`vence`/`diasRest`/`asistEsteMes` derived at read; `HISTORIAL`/`PAGOS` → queries; reactivation keeps history (no row deletion).
5. **`retencion`:** `SEED_PLANTILLAS` → `plantilla` table; `renderPlantilla` substitutes real tokens; `waLink` prefixes `+52`.
6. **`cuenta`:** `HOY` → `calcularResumenMes`; editors remain `próximamente` stubs this pass.

## 11. Next 16 + Supabase grounding (for the next cycle — verified against bundled v16.2.6 docs)

- **`middleware.ts` → `proxy.ts`** (`export async function proxy(request)`), Node runtime only. Codemod: `@next/codemod middleware-to-proxy`.
- **Async request APIs enforced:** `await cookies()`, `headers()`, `params`, `searchParams`. Any synchronous-access snippet from training data breaks.
- **Turbopack is the default** for `dev` and `build` (drop `--turbopack`; a stray `webpack` config fails the build). Forge has none — fine.
- **`next lint` removed**; flat ESLint config — Forge already uses `eslint.config.mjs`. Add `depcruise src` to the `lint` script.
- **Caching:** `revalidateTag(tag, cacheLife)` now requires the 2nd arg; **`updateTag(tag)`** gives read-your-writes (ideal post-venta/asistencia); `refresh()` from `next/cache`.
- **Data Access Layer pattern:** `server-only` query modules per sector returning DTOs; React `cache()` for per-request memoization; never pass raw rows across the boundary.
- **Server-default; push `'use client'` to the leaves.** Read in Server Components via the DAL; write via thin **Server Actions** that re-auth with `getClaims()` (page gate ≠ action gate), validate (Zod), delegate to the DAL.
- **Supabase:** `@supabase/ssr` (NOT `@supabase/auth-helpers-nextjs`); cookie adapter implements **only** `getAll`/`setAll`; `getClaims()`/`getUser()` for authz, never `getSession()` in server code; env `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (anon still works).
- **Requirements:** Node 20.9+, TS 5.1+, React 19.2 — already satisfied.

## 12. Enforcement & anti-rot

- **One dependency-cruiser rule:** `src/domain/**` and `src/lib/**` may not import `src/components/**` or `src/app/**`. Plus `no-circular` + `no-orphans` (free from `depcruise --init`).
- Wired into `pnpm lint` and a **pre-commit hook** (via the existing `setup-pre-commit` skill) — catches violations before they land, no deploy gating.
- The `@/*` alias (`tsconfig.json` `@/* → ./src/*`) stays the canonical import style so the rule pattern-matches reliably.
- **Explicitly skipped** as ceremony for one operator: CODEOWNERS, TS project references, eslint-plugin-boundaries, doc-drift CI bots, barrel/index files, per-trivial-folder READMEs, an ADR per minor choice.

## 13. Open items (verify at implementation, not now)

- Supabase client/cookie/auth API shapes — confirm against `@supabase/ssr` once installed.
- Folio scheme (sequence vs per-year reset) — decide when the `venta` table is designed.
- Whether `domain/rules.ts` stays one file or splits into `rules/<area>.ts` — split on the second real rule per area.
- Auth/login (single-operator allowlist) — separate, later cycle.

## 14. First implementation chunk (what writing-plans will plan)

The **structural pass (Phases 0–5)** + **implement and unit-test the domain core for real**. The domain core is the architectural keystone *and* the first genuine functionality, and it needs zero Supabase — so this chunk leaves the app running on mock data, with a clean sectored structure, an enforced boundary, real tested domain rules, and a migration backlog ready for `to-prd`. The Supabase build is the next cycle.

---

## Appendix A — `sector-map` skill extraction note

Once this pass proves the framework on Forge, extract a reusable skill (working name **`sector-map`**) via `write-a-skill`:
- **Trigger:** a cloned claude.ai/design frontend mock + "make it navigable/auditable before implementation."
- **Phases:** the six in §4 (content-neutral).
- **Artifacts:** `CONTEXT.md`, `ARCHITECTURE.md`, `docs/adr/*`, one depcruise rule, `lib/data/README.md`.
- **Handoff chain:** Phase 2 → `grill-with-docs` (ADRs + glossary); Phase 5 → `to-prd → to-issues → to-goal`; after real code exists → `improve-codebase-architecture` closes the loop.
- **Stack-adaptivity:** only the sector taxonomy and the one seam shape change per project (Forge: Next 16 DAL + Server Actions; a SvelteKit clone: load functions + form actions — same slot, different mechanics).

## Appendix B — Research provenance

Design backed by a 7-agent research workflow (2026-05-29): external patterns (Screaming Architecture, package-by-feature, vertical-slice lite), Next 16 grounding read from bundled `node_modules/next/dist/docs`, docs-as-map best practices, a fresh Forge inventory, and skill-ecosystem composition — then run through an adversarial critic whose catches (Supabase-not-installed, the FORGE/Forge-Bootcamp conflict, missing client fields, the offset-date mock-ism, and YAGNI trims) are folded into this design.
