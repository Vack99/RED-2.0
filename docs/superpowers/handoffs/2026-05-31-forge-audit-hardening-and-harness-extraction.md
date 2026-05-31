# Handoff — Forge audit-hardening done (HIGH clusters) · atomic-writes half-applied · harness extraction is the remaining GOAL

**Date:** 2026-05-31 · **Repo:** `forge-1.0` · **Branch:** `master`
(migration branch already merged; **no remote yet**) @ `9925f52` · working tree clean
except `.mcp.json` (untracked, keep local, never commit).
**For:** a FRESH session. Two jobs: (1) resolve a live-DB↔repo drift + finish the one
half-done fix, then (2) the real prize — **extract the back-half "shipping" skill to
complete the harness**. Read the referenced artifacts; don't re-derive.

---

## ⚠️ DO THIS FIRST — live DB is AHEAD of the repo (the drift the audit warned about)

Last session deployed two atomic-write RPCs to the **live Supabase DB** (project
`hjppxawglmukfvsgmcog`, migration **`20260531211105_atomic_write_rpcs`**, visible via
`list_migrations`) but **did NOT**: mirror the SQL to `supabase/migrations/`, commit
anything, or write the regenerated types into `src/lib/supabase/database.types.ts` (its
`Functions` block is still empty in the repo). **The functions are deployed but the app
does not call them** — they're inert (`SECURITY INVOKER`, RLS applies, zero callers).

This is exactly the "repo is a follower of the live DB" failure from the audit. **Decide
first**, before anything else:

- **Option A — finish wiring (recommended).** Keep the RPCs, mirror + commit the migration,
  regen + commit types, then wire the DAL (see "Atomic writes — how to finish" below).
- **Option B — roll back.** `drop function public.registrar_venta(...) ; drop function
  public.toggle_pase(...)` via a new migration, so DB == repo with zero unused objects, and
  defer the whole atomic-writes item to its own session.

Do NOT leave it half-applied past the next session. The RPCs as deployed are the **thin**
shape (good): they do only the transaction (UPDATE clientes + INSERT venta / guarded ±1);
the stacking math stays in the tested TS domain. They were smoke-tested in a rolled-back
`authenticated` transaction (toggle ON decremented, OFF restored, venta set saldo + inserted;
all assertions passed; nothing persisted).

**The wiring snag (why it was deferred):** Supabase generates RPC params as non-nullable
(`p_clases_restantes: number`), but ilimitado clients pass `null` and `mes` packages pass
`vigencia_dias = null`. So a clean `.rpc(...)` call is a TS error. Type-honest fix: redefine
each function with `DEFAULT NULL` params (a small follow-up migration) and omit the null
args at the call site — NO `as any`. This is a money-path rewrite of `crearVenta` +
`togglePase`; that's why it wants a fresh session.

---

## The TWO GOALS (do not lose sight of these)

This whole project has always had a meta-goal beyond the app:

- **GOAL A — Forge itself:** a good-enough, production-ready, *public showcase* gym-admin app
  (es-MX, single operator). Status: **essentially done.** Migration complete + browser-verified;
  this session fixed the architecture-audit HIGH findings. Remaining: the atomic-writes wiring
  above, plus two HITL items (publish + auth toggle, below).
- **GOAL B — the HARNESS (the real prize):** Forge is the proving ground for a *repeatable
  harness that takes a `claude.ai/design` mock → a working production app*. It has two halves:
  - **Front half — `sector-map` skill: DONE/EXTRACTED** (`~/.claude/skills/sector-map`).
  - **Back half — the "shipping" skill: NOT YET EXTRACTED.** This is the outstanding work.
    It must codify: `to-prd → to-issues → to-goal` on a **local issue store**, run as vertical
    slices through an **orchestrator + TWO fresh-eyes gates** (Elegance + Senior Dev, K=1,
    commit only on YES/YES), **plus the 7 hardening lessons from this session's audit** (below).
    Source material already on disk: `docs/prompts/goal-forge-supabase-finish.md`,
    `docs/prompts/resume-forge-migration.md`, the two prior handoffs, and the audit doc.

**Aaron's explicit sequencing (2026-05-31):** *validate the output before codifying the
process*, and *fix the output first, extract second*. The HIGH fixes are done, so the bar to
start extraction is met — but he wants extraction to run in **its own clean session** for the
best output. Treat GOAL B as the headline of the next (or next-next) session.

---

## What shipped THIS session (9 commits on `master`, all gates green)

Baseline was `3d270b7`. In order:
| Commit | What |
|---|---|
| `7181773` | fix(vender): phone auto-advance required full 10 digits (the operator-found bug) |
| `894090c` | chore(harden): removed dead `format.ts#clasesLabel`; marked migration verified+merged |
| `87e77c9` | chore(repo): tracked the workflow docs (handoffs + `docs/prompts/`); gitignored `.mcp.json` |
| `27240c8` | **audit cluster 1** — homed `baseParaStack` + `urgenciaCliente` (+`NivelUrgencia`/`Urgencia`) in `src/domain`; removed the inline forfeit ternary in `ventas.ts` + the `CL_DAYS/CL_CLS` engine from `clientes.tsx` |
| `20fdfb6` | **audit cluster 2** — removed the 3 inert `revalidateTag` no-ops; documented (app) reads are intentionally dynamic |
| `6bf0fd8` | **audit cluster 3** — added `typecheck` script + `pnpm@11.0.9` pin; `.github/workflows/ci.yml`; pre-commit now runs lint+typecheck+test |
| `976fc60` | **audit cluster 4** — reconciled `CONTEXT.md`/`domain/types.ts`/`MIGRATION.md` with code (the deleted-file drift) |
| `d1f3f66` | docs: committed the architecture-audit learnings doc |
| `6db2023` | refactor(auth): extracted pure `decideRedirect` from `proxy.ts` + unit test |
| `9925f52` | fix(security): REVOKE EXECUTE on `rls_auto_enable` from anon/authenticated (migration `20260531210445`, mirrored) |

Branch-tip gates (re-verified): **`pnpm lint`** clean (69 modules) · **`pnpm typecheck`** clean
· **`pnpm test`** 60/60 (was 45; +`baseParaStack`/`urgenciaCliente`/`decideRedirect` cases) ·
**`pnpm build`** clean. `get_advisors(security)` now reports **only** the leaked-password item
(both SECURITY DEFINER WARNs cleared by the REVOKE).

---

## The audit (read it — it IS the harness-improvement spec)

`docs/superpowers/audits/2026-05-31-forge-architecture-audit-learnings.md` — full record of an
adversarial architecture audit (improve-codebase-architecture run as a workflow: 8 lenses →
per-finding skeptic verify → completeness critic → synthesis; **41/42 findings confirmed**).
Verdict: **structure "good", is_best_possible = FALSE**. Recurring weakness: the ONE enforced
boundary checks import **direction**, not concept **duplication** or contract **honesty**.

It contains **7 harness implications** as what-we-got-wrong / why / how-to-improve triplets.
**These are the payload to bake into the back-half skill** (GOAL B). Summary:
1. Per-slice **concept-duplication gate** (grep screens for branch logic on domain quantities; flag rules re-coined outside `src/domain`).
2. **Docs-as-assertions**: glossary path linter; deletion-test copy-pasted "protocol" lines; cleanup-slice text sweep for deleted paths.
3. **Slice-done = typecheck+test+build green in CI**, never lint-only; security claims need an executing test.
4. **Keep the DAL seam injectable** through mock→real (default-arg client) so it stays testable.
5. **ADR consequence-clauses → per-slice gates** (a "no-X" decision must land the removed responsibility in one named seam).
6. **Stack-aware default rule set** for sector-map (e.g. Next App Router: client ✗→ server-only DAL); formatter/threshold-home gate.
7. **Migrations are the canonical provisioner**; per-DB-slice definer/grant audit; `get_advisors` is blocking. *(This session already lived #7's pain — see the drift above.)*

Status of the audit's "recommended changes before extraction": **HIGH cluster DONE** (clusters
1–4 + decideRedirect + the REVOKE). **MEDIUM remaining:** atomic writes (half-applied, above),
cross-tenant RLS denial tests, and the optional LOW polish (consolidate formatters, collapse
`isoDay`/`toIsoDay`, list `fecha.ts` in ARCHITECTURE.md, ts-prune/knip).

---

## HITL items (need Aaron — I cannot do these)

1. **Publish to GitHub.** Repo not yet created/pushed (the auto-classifier blocks me from a bulk
   push to a new public destination). Aaron runs:
   `! gh repo create vack99/forge --public --source=. --remote=origin --push`
   (chosen name `forge`; `.mcp.json` is gitignored so it won't leak). `gh` is authed as `Vack99`.
2. **Enable leaked-password protection** — Supabase dashboard → Auth → Password security
   (HaveIBeenPwned). The only remaining security advisor; one click.

---

## Operational notes / gotchas (learned or reconfirmed this session)

- **Commit messages: use `git commit -F .commitmsg`** (write the message to a temp file, commit,
  delete it). PowerShell here-strings (`@'...'@`) repeatedly mangled multi-line `-m` messages into
  bogus pathspecs. The `-F` file approach worked every time. (Add this to the harness.)
- **`packageManager` must be `pnpm@11.0.9`**, matching the pnpm-11 `pnpm-workspace.yaml` (which has
  only an `allowBuilds` field, no `packages:`). Pinning `pnpm@9.x` breaks every script with
  `ERROR packages field missing or empty`. Local pnpm is 11.0.9, node 24.
- **Don't over-batch tool calls.** When one call in a parallel batch fails, the harness cancels all
  siblings — produces a scary wall of "Cancelled…" that looks like many failures but is one. Keep
  DB/commit steps in small batches.
- **Supabase MCP**: it's live; `apply_migration` is classifier-gated (needs explicit user OK for
  the live/public DB each time). After any DDL: mirror SQL to `supabase/migrations/<version>_<name>.sql`
  (version from `list_migrations`), regen types into `database.types.ts`, run `get_advisors(security)`.
- Earlier-cycle gotchas still apply (Next 16 `proxy.ts`/`await cookies()`/`getClaims()`;
  Chihuahua dates via `src/lib/fecha.ts`; `forgeToast` tones success|warning|info; never run
  `husky` with an argument). Enforced boundary: `src/domain`+`src/lib` ✗→ `src/components`+`src/app`.

---

## Atomic writes — how to finish (if Option A)

The deployed RPCs (in the live DB now): `registrar_venta(p_cliente_id, p_nombre, p_tel,
p_clases_restantes, p_vence, p_paquete_nombre, p_clases, p_vigencia_tipo, p_vigencia_dias,
p_monto, p_metodo) returns (folio, cliente_id)` and `toggle_pase(p_cliente_id, p_fecha) returns
(present, hora)`. To finish:
1. New migration: redefine both with `DEFAULT NULL` on the nullable params (`p_clases_restantes`,
   `p_clases`, `p_vigencia_dias`) so the generated TS types allow omitting them; re-`grant execute
   ... to authenticated` / `revoke ... from anon, public`. Apply → mirror BOTH RPC migrations to
   `supabase/migrations/` → regen + write `database.types.ts`.
2. Rewrite `src/lib/data/ventas.ts#crearVenta`: keep the TS domain math (`baseParaStack` +
   `stackPaquete`, compute `nuevoSaldo`/`nuevoVence`), then ONE `supabase.rpc("registrar_venta",
   {...})` instead of the separate UPDATE + INSERT. Map ilimitado→null at the boundary as today.
3. Rewrite `src/lib/data/asistencia.ts#togglePase` to a single `supabase.rpc("toggle_pase", {...})`;
   the SQL already does the on/off decision + guarded decrement + Chihuahua-local `hora`.
4. Write **ADR-0005** (atomic write seam: why RPCs, the thin-vs-fat decision, the single-operator
   concurrency context from ADR-0004). Smoke-test each RPC in a rolled-back txn via `execute_sql`.
   `pnpm lint && typecheck && test && build`. Re-verify the sale + attendance flows in the browser
   (`! pnpm dev`) — it's the money path. Commit per step with `-F`.

---

## Suggested skills for the next session
- For the drift + atomic writes: plain edits + the per-step verify discipline above; `superpowers:systematic-debugging` if the RPC wiring misbehaves.
- For **GOAL B**: `superpowers:brainstorming` (shape the skill first — there was an unanswered
  framing question: is the back-half a gate-layer ON `to-goal`, a standalone twin of `sector-map`,
  or an enhancement of `to-goal` itself?), then `write-a-skill`. Compose with the audit's 7
  implications as the skill's gates.
- `verify` / `superpowers:finishing-a-development-branch` as needed.

**First actions next session:** (1) `list_migrations` + read this handoff; (2) resolve the
atomic-writes drift (Option A or B); (3) then start GOAL B in a clean context. Do NOT publish or
toggle auth — those are Aaron's HITL calls.
