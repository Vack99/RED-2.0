# Paquete-swap edit — session handoff (2026-08-14)

## Session-start protocol (do this UNPROMPTED, first thing)

1. Invoke the **caveman** and **ponytail** skills immediately — the owner wants them active without asking.
2. This is an **orchestration session**: delegate per unit of work (foreground subagents, CLAUDE.md caps: sonnet 35 / opus 18 / fable escalation-only), keep the main context lean, quality via adversarial review waves. Do not work inline beyond glue/gates.
3. Worktree: `C:\Users\Aaron\Documents\Repos\RED-2.0\.claude\worktrees\payment-correction` (EnterWorktree → `path:`), branch `payment-correction`, clean @ `6c36fc9` = local `main`. Rebase over `main` before ff if it moved (it moved twice last session — docs commits, no conflicts).

## Where the feature stands (ALL shipped + LIVE, do not redo)

#269 + fast-follows are done: PagoSheet is detail-first (detalle → EDITAR → confirmar); edit = monto + método + fecha (fecha bounds: not future, ≤30d back — the alta floor was DROPPED at both doors, ruling on #266); delete = windowed 30d from `created_at` with atomic clawback + exact preview. Migrations live: `20260813120000`, `20260814120000`, `20260814130000`. Denial gate: 49/49 on the LOCAL DOCKER stack ([[local-docker-denial-path]] — scratch PAT is dead). **Not pushed** — the entire UI (sheet + fecha + all of it) deploys on the next owner-consented push.

## The NEXT task (owner, 2026-08-14, verbatim intent)

The edit currently changes the AMOUNT detached from any package — the class count is never reconsidered. Rework the edit so the operator changes the **PAQUETE** of a sale (including personalizado), not just the pricing:

1. **Package swap on an existing sale** — pick a different paquete (or personalizado) for the venta; the sale's clases/vigencia/monto follow the new package. This is structurally clawback-of-old-grant + apply-of-new-grant in ONE transaction (the `eliminar_venta` + `registrar_venta` stacking math composed — both bodies are in `supabase/functions-canonical/`, the lossy-inversion caveats in `20260813120000`'s header apply).
2. **Delete gate** — if the member has already CONSUMED classes from the sale, ELIMINAR is not available (swap remains available). ⚠️ This partially reverses ruling #267.4 ("used-classes edge: proceed and floor at zero, never blocked") — confirm scope with the owner before building.

## Design questions to settle FIRST (short ruling pass with the owner — use the AskUserQuestion picker, one decision per question, recommendations first)

- **"Consumed from this sale" is not directly derivable.** `asistencias` has no link to `ventas` (deliberate, #267.2) and the balance is a pooled running number (ADR-0004). Candidate definitions: (a) consumed-since-this-sale = asistencias with `consumio=true` after the venta's `created_at` (over-counts when older classes were in the pool); (b) balance-shortfall = `clases_restantes < sum of grants from OTHER remaining sales` (what the clawback floor would eat); (c) simplest honest proxy: gate delete when the clawback preview would floor (resulting balance would have gone negative). Lean (c)/(b) — no new schema; (a) is the most intuitive to an operator. Owner picks the meaning.
- **Swap semantics for the balance**: does swapping re-derive `clases_restantes`/`vence` as delete+re-sell would (clawback old grant, stack new grant at the sale's fecha), or only replace the sale row's package facts and adjust the balance by the delta? The delta form is the same lossy inversion — state it.
- **Monto on swap**: reset to the new paquete's precio (then still editable), or keep the stored monto? Probably reset-with-edit.
- **Window**: is swap windowed like delete (30d) or any-age like edit? Any-age swap of an old sale rewrites months-old earnings AND balance — likely window it like delete. Owner call.
- **Personalizado swap**: the custom fields (nombre/precio/clases/dias/ilimitado) need inputs in the sheet — vender's personalizado form is the precedent.

## Build anchors (verified last session)

- RPC bodies: `supabase/functions-canonical/{registrar_venta,editar_venta,eliminar_venta}.sql`; stacking block + bounds in registrar; clawback in eliminar. Any new/changed RPC: canon regen (`pnpm gen:rpc-canon`), suites asserting WRITTEN ROWS wired into SUITE + `rpc-coverage.json`, EXECUTE lockdown house lines, watch the `ventas` column-grant state (`monto, metodo, fecha` today — a swap RPC writing `paquete_nombre/clases/vigencia_*` on ventas should be SECURITY DEFINER like `eliminar_venta`, or the column grants widen; prefer DEFINER, the #269 §3.1 reasoning applies with more force).
- UI: `apps/admin/src/app/(app)/clientes/[id]/_components/pago-sheet.tsx` + `pago-sheet-vm.ts` (+tests); vender's paquete picker + personalizado form in `apps/admin/src/app/(app)/vender/_components/vender.tsx`; lifted shared pieces live in `apps/admin/src/app/(app)/_components/` (`metodo-editor.tsx`, `inicio-calendar.tsx`).
- Data: `packages/data/src/server/ventas.ts` (DAL + `VENTA_REFUSALS`), `derive.ts` (`FichaPago`), actions in `clientes/[id]/actions.ts`.
- Denial gate: local docker (stack may still be running: container `supabase_db_red-2-0`; `npx -y supabase@latest start` if not). Traps: NEVER `db reset` casually — the ambient-grant bootstrap dies with it and must be re-applied ([[local-docker-denial-path]]); apply new migrations via `docker cp` + in-container `psql -f` (never PowerShell pipes — UTF-8 mojibake); runner never applies migrations itself.
- Live apply at ship via MCP `apply_migration` (MCP is bound to LIVE — only touch it at ship time); typegen parity check after.

## Standing rules

- Commit locally + ff `main` freely; **NEVER push without the owner asking in that conversation.**
- Record ruling changes as comments on #266 (the correction-rulings thread).
- End the session wrap with ⚠️ owner-owed items.

## Owner-owed (carry forward)

1. **Push consent** — deploys ALL of the shipped-but-undeployed UI (detail-first sheet, fecha edit); then the owner walk.
2. Scratch PAT decision: mint fresh PAT or formalize the local-docker grant bootstrap as a fixture script.
3. SAT persona-física details (nombre, RFC, régimen, domicilio fiscal, correo).
