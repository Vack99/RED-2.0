# Handoff — Respaldo mensual: implementation kickoff

> **STATUS 2026-07-13 (later session): PLANNING DONE — do not re-run the pipeline.**
> Wayfinder fog-check found zero open decisions → map skipped per its no-fog rule (owner approved).
> Spec published as **#90** (`ready-for-agent`); tickets **#91–#95** published with native `blocked_by`
> edges (94←{91,92}, 95←{92,93,94}). **Frontier: #91 (timezone — live DST bug, first), #92, #93** — parallel-safe.
> **Next session's job: `/implement` one frontier ticket** (start #91), fresh context per ticket.
> Session rulings added: no fable-5 in subagents (quota — opus/sonnet instead); the owner provisions the
> scratch Supabase project + PAT only when the testing phase (#95) arrives — never create one unprompted;
> `supabase-fake.test-helper.ts` (in-memory vitest helper) stays and grows `.lt()`/`ltCalls`/`slug` as planned.
> **The 10 traps below remain fully in force — read them before implementing any ticket.**

**Date:** 2026-07-13
**Original job (done, see status above):** `/wayfinder` → `/to-spec` → `/to-tickets` for the **full implementation** of the
month-scoped respaldo export **and the base fixes it depends on**.
**State:** design approved by the owner. **Nothing implemented.** Docs only. `main @ fdaec14`, clean gate
(lint + typecheck + 868 tests green).

---

## Read these first — do not re-derive them

| Artifact | What it holds |
|---|---|
| `docs/superpowers/specs/2026-07-13-respaldo-mensual-design.md` | **The approved design.** Part 1 = 9 base fixes (P0). Part 2 = the feature. Part 3 = the tests that are the proof. Deferred items with named triggers. |
| `docs/FIndings/2026-07-13-respaldo-mensual-base-defects.md` | **The evidence.** 9 Opus agents, all gate-passed. Live query results, EXPLAIN output, policy text, ExcelJS memory measurements, the owner's rulings, and the retention/archival analysis. |
| `docs/adr/0006-respaldo-operational-export.md` | Needs a **dated amendment in place** (owner-approved). Its "full snapshot, no windowing" clause is what we are changing. |
| `docs/adr/0013-gym-scoped-rls-mechanism.md` | **§2 and §3 are factually wrong** and must be corrected (see trap 7). |
| `AGENTS.md` → "Database RPC contract tests" | The `pnpm test:denial` gate. **This work ships 3 migrations, so the gate applies.** |

The spec is the contract. This handoff only carries what is **not** in it.

---

## Owner rulings (settled — do not re-litigate)

1. **Picker:** months-with-data (newest first) + **`Últimos 24 meses`** as the default/no-param mode.
   Full unbounded history is **retired** — it OOMs / 413s at ~400–600k attendance rows.
   Every past month stays individually reachable via `?mes=`, so nothing is lost.
2. **`reclamar_o_crear_cliente(p_gym_id)`:** fix **now**, this release. Bind `p_gym_id` to the resolved tenant.
3. **Anon surface:** narrow `gym` with **column GRANTs** (keep the RLS policy — the pre-auth brand seam needs it).
4. **Scope:** the other staff readers (`clientes.ts`, `asistencia.ts`, `paquetes.ts`) and the ADR-0013
   correction **ride this release**. Same root cause, one line each.
5. **Retention / archival (year 3+):** **DEFERRED to its own session.** The owner proposed archiving >24mo data
   to Cloudflare R2; the analysis (findings §12) says the *index* is what fixes scaling, not archival — and
   archiving raw rows forks every read path, mints a PII breach surface, and may violate SAT's ~5-year
   retention rule. Recorded with a named trigger. **Do not build it. Do not re-open it in this session.**

**A question I asked the owner and then had to retract:** whether `metodo='pendiente'` counts as ingresos.
**It cannot exist** — `20260710120000_renewal_schema_prep.sql` re-added
`check (metodo in ('efectivo','transferencia','tarjeta'))` with no `NOT VALID`. Verified live. **3 buckets.**

---

## The 10 traps — every one of these will silently pass review

These are the things that cost this session nine agents to find. An implementer who doesn't know them will
write plausible, green, wrong code.

1. **`clientes.ts:154` and `clientes.ts:253` are CORRECT. Do not "fix" them.** Both filter **`asistencias`**,
   whose `fecha` is a **`date`** — a bare day string is an *exact* comparison there. Converting them to instant
   bounds **introduces** an off-by-one-day bug. (I got this wrong in my first brief; 5/5 agents caught it.)
2. **`ventas.fecha` is a `timestamptz`; `asistencias.fecha` is a `date`.** Same column name, two meanings. So
   ventas takes **instant** bounds (`instanteEnZona(...).toISOString()`) and asistencias takes **day-string**
   bounds — **three lines apart, deliberately asymmetric.** Nobody may "harmonize" them. Pin it with a test.
3. **Do NOT reuse `calcularResumenMes` for a closed month.** Its prior-month cutoff is
   `venta.fecha.getDate() <= diaHoy`, so exporting **February** would cut January to **Jan 28**. Current-month
   exports look fine — which is exactly how this ships broken and nobody notices until February.
4. **The `clientes` read is NOT windowed.** It stays a full roster because it is what denormalizes
   `cliente_id → nombre` on the Ventas/Asistencias sheets. The **Altas** sheet filters `created_at` **in the
   pure shaper**. Window the query and every client who joined earlier renders as `—` on their own sales.
5. **The pure fold goes in `packages/domain/src/rules.ts`** (types in `domain/types.ts`), **not** in
   `export/rows.ts`. `.dependency-cruiser.cjs` blocks `@gym/ui ✗→ @gym/data`, so a fold typed in the
   spreadsheet module **cannot be named in a future chart component's props**. Same line count. One is
   reusable; the other is a rewrite. The existing `RespaldoData` precedent (`respaldo.ts:8-14` imports its own
   return type *from the spreadsheet module*) points **straight at the wall** — don't copy it.
6. **`.eq("gym_id", gym.id)` is NOT redundant with RLS**, and it will *look* redundant. RLS answers *"may I see
   this row?"*; the export needs *"which of the rows I may see belong to the gym whose name I'm stamping on
   this file?"* — which RLS **structurally cannot** answer (its predicate is per-row-per-gym). It is a **scope
   selector, not a boundary.** ADR-0001 stands.
7. **ADR-0013 §2/§3 are wrong and actively dangerous.** They claim the RLS helper is "O(1)-per-statement" and
   say **"never unwrap `(select helper(gym_id))`."** It is **already per-row** — `(select auth.uid())` is
   uncorrelated (hoists to an InitPlan), but `(select is_staff_of(gym_id))` **references the row's column** →
   correlated SubPlan → **once per row of the whole cross-tenant table**. Live proof: `gym_membership` has
   **6 rows and 214,861 seq scans**. **If the ADR isn't corrected in the same change, the next reviewer deletes
   the `.eq()` as redundant** and the fix silently reverts.
8. **`respaldo.test.ts:96-97` (`expect(gteCalls["ventas"]).toEqual([])`) MUST change.** It is the machine-guard
   on ADR-0006's "no windowing" clause. Capping the default at 24 months means amending that ADR, which means
   amending its test. **This is the one test that is supposed to change** — it is not collateral damage, and it
   must not be worked around.
9. **`supabase-fake.test-helper.ts` has no `.lt()`** — a `.lt()` call throws in tests today. It needs `.lt()` +
   `ltCalls` (the month window's **upper** bound is otherwise unassertable) and a `slug` on the fake `gym` row.
   Named present need, not speculative.
10. **`gym.slug` has no format CHECK** and flows into `Content-Disposition` → quote/CRLF injection. **Sanitize
    at the header sink**, not at write-time. The header must not depend on a DB constraint that doesn't exist.

---

## Migrations in this work — the `test:denial` gate applies

**Three migrations**, so `pnpm test:denial` must run green against a **scratch project** before this
fast-forwards to `main` (AGENTS.md, non-negotiable):

1. **`reclamar_o_crear_cliente`** — bind `p_gym_id` to the resolved tenant. **Changes what an RPC writes** →
   needs **written-row assertions** in a denial suite (AGENTS.md's actual rule: assert the *rows written*, not
   the return value) and an entry in `supabase/tests/rpc-coverage.json`.
2. **Column GRANTs on `gym`** — `revoke select … from anon` + `grant select (<brand-seam columns>) … to anon`.
   Keeps `gym_anon_select` intact. **Verify the pre-auth host→brand lookup still works after this** — it is the
   thing that would break, and it breaks *silently* on an unmapped host.
3. **Two indexes** — `ventas (gym_id, fecha)` and `asistencias (gym_id, fecha) where deleted_at is null`.
   Index-only → changes no RPC's written rows → **no new denial assertions**, just one green run.
   **Build them now, while the tables are 41 / 268 rows.**

> ⚠️ **The Supabase MCP in `.mcp.json` is bound to LIVE PROD** (`hjppxawglmukfvsgmcog`). `apply_migration` hits
> production. There is **no scratch project by default**, and **the free tier has no backups**. Read-only
> `execute_sql` SELECTs are fine and were used extensively this session. **Create a scratch project for
> `test:denial`; never assume the MCP points at one.**

---

## Suggested skills for the next session

- **`/wayfinder`** — the owner's chosen entry point. This is a multi-session effort (9 base fixes + a feature +
  3 migrations + an ADR correction), which is exactly wayfinder's shape. **Destination:** *the respaldo mensual
  feature shipped on a base that does not leak and does not die at 40 gyms.*
- **`/to-spec`** then **`/to-tickets`** — the owner named these explicitly. The design doc is the input; it is
  already owner-approved, so to-spec should be **consolidating, not re-deciding.**
- **`keep-it-lean`** — carried this whole session. The agents' own Elegance gates killed ~10 abstractions
  (a `mesEnZona()` helper, a `requireStaff()`, a `sanitizeFilename()` util, a `metrics` package, a
  `ResumenPeriodo` range abstraction, a queue, keyset pagination, a source-scanning lint guard). **The fixes are
  four `.eq()` calls, one `.in()`, one regex, one `.order()`, six lines in `instanteEnZona`, and one GRANT.**
  Any plan that grows a new module should be treated as suspect.
- **`superpowers:writing-plans`** — if the owner wants an executable plan rather than tickets.
- **`superpowers:test-driven-development`** — trap 3 and trap 2 are exactly the bugs a test-first order catches.

**Model note:** the owner asked for **no Fable in the previous session.** That was session-scoped — **confirm
before selecting a model.** Per `CLAUDE.md`, reviews of plans/implementations want fable-5 or opus-4.8; bulk
mechanical work wants sonnet-5. This session used opus for all 9 audit agents and the output justified it.

---

## Slicing hint (not a decision — the owner has not ruled on this)

Part 1 is 9 items and touches the roster, dashboard, Agenda, and two RPCs. It is **much bigger than the feature
the owner asked for**, and the owner has explicitly not yet decided whether it lands as one change or several.
A natural cut, if one is wanted:

- **Slice A — the leak + the wall** (traps 6/7): `.eq("gym_id")` everywhere, ADR-0013 corrected, deterministic
  `getOperatorGym`, pagination tiebreakers, the two indexes. *Ships alone. Changes no user-visible number.*
- **Slice B — the RPC + anon surface**: `reclamar_o_crear_cliente` binding, `gym` column GRANTs. *Migrations,
  denial suite.*
- **Slice C — timezone correctness**: two-pass `instanteEnZona` (+ the duplicate in `rules.ts:427`),
  `resumen.ts` instant bound, the DST test suite. *Fixes a **live** Tijuana/Ciudad Juárez Agenda write bug.*
- **Slice D — the feature**: `?mes=`, the 5-sheet workbook, the picker, the 24-month cap, the slug filename,
  the ADR-0006 amendment.

**Slice C's Agenda bug is live today and independent of this feature** — it may deserve to jump the queue.

---

## Housekeeping

- **Uncommitted working-tree changes are NOT mine**: a modified `.gitignore`, a deleted
  `docs/FIndings/2026-07-08-renewal-flow-findings.md`, and an untracked
  `docs/archived-files/2026-07-08-renewal-flow-findings.md`. Looks like an intentional archive move by the
  owner. **Left untouched — resolve before branching.**
- Two commits this session, both docs-only: `7a4892c` (findings + spec), `fdaec14` (spec clarification).
- **Nothing was implemented. No branch exists yet.**
