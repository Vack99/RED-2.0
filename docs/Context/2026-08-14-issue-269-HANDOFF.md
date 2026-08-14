# Issue #269 — session handoff (2026-08-14)

**State: BUILT + double-reviewed + gate green. Blocked on ONE owner input (fresh scratch PAT), then ~30 min of ship mechanics.** Read this file first; fall back to `docs/Context/2026-08-13-issue-269-EXECUTION-BRIEF.md` only for deep anchors — do NOT re-recon or re-review.

## Where you are

| | |
|---|---|
| Worktree | `C:\Users\Aaron\Documents\Repos\RED-2.0\.claude\worktrees\payment-correction` — resume with `EnterWorktree` → `path:` (never `name:`) |
| Branch | `payment-correction` @ `134f03d`, 4 impl commits on local main @ `dd59461`, worktree clean |
| Gate | `pnpm lint && pnpm typecheck && pnpm test` green — 93 files / 1585 tests (pre-commit hook re-proves it) |
| Session style | /caveman + /ponytail on; orchestration per CLAUDE.md caps (sonnet 35 / opus 18 / fable escalation-only) |

## What's done (all 7 ACs — do not redo)

- Migration `supabase/migrations/20260813120000_editar_eliminar_venta.sql`: `editar_venta` (INVOKER + `ventas_staff_update` policy + column grant `(monto, metodo)`, monto floor ≥1 no cap), `eliminar_venta` (DEFINER, no delete policy, delete revoked, 30d window on `created_at`, clawback with FOR-UPDATE-on-venta race fix). Brief §3.1 deviation taken and documented (header + ADR-0005 note + runbook).
- Canon regenerated; 2 denial suites wired (SUITE + rpc-coverage.json), 13 vectors incl. RED duplicate, floor, window, cross-tenant, V9/V10 null branches, grant-layer 42501 probes.
- Data layer: ficha threads venta `id` + raw fields + `folio` + `mes`; `FichaPago.metodo`→`metodoDisplay` rename; DAL `editarVenta`/`eliminarVenta` + `VentaRefusalError`; actions revalidate `/clientes` `/cuenta` `/inicio`.
- UI: tappable pago rows → `PagoSheet` (edit any age; ELIMINAR windowed, exact #267.6 preview incl. floor/ilimitado variants; volver-a-vender deep link); `MetodoEditor` lifted to `(app)/_components`.
- Two opus reviews + delta re-review: race BLOCKER + monto-cap trap found and FIXED. No open findings.

## The blocker

Scratch PAT in `docs/db-testing-throwaway-project/data` is **dead** — 401 on Management API `/v1/projects` (worked 2026-08-08; verified against both worktree and main-checkout copies, identical; hosted MCP is OAuth+live-bound, no CLI cache — no workaround exists).

**Owner: mint a fresh PAT at supabase.com/dashboard/account/tokens and paste it into `docs/db-testing-throwaway-project/data`** (worktree copy for the run; mirror to the main-checkout copy for future sessions — file is gitignored).

## Ship sequence (in order, once PAT lands)

1. Apply migration to scratch (the denial runner NEVER applies migrations on the TARGET_REF path):
   ```powershell
   $env:SUPABASE_ACCESS_TOKEN='<pat>'; node supabase/tests/apply-sql.mjs gyyujeguycxxoaqgdnjp supabase/migrations/20260813120000_editar_eliminar_venta.sql
   ```
2. ```powershell
   $env:SUPABASE_TARGET_REF='gyyujeguycxxoaqgdnjp'; $env:SUPABASE_ACCESS_TOKEN='<pat>'; pnpm test:denial
   ```
   Expect 49 suites. The 4 newest vectors (editar V3b, eliminar V9/V10, GRANT block) are **unrun SQL** — first execution is here. If a failure smells environmental (scratch may carry another session's DDL), re-run once; a real assertion FAIL → fix in worktree, re-commit, re-apply changed migration? No — migration edits before any live apply are fine: edit in place, re-run `pnpm gen:rpc-canon`, re-apply to scratch, re-run denial.
3. Fast-forward local main (from the MAIN checkout, not the worktree): `git -C C:\Users\Aaron\Documents\Repos\RED-2.0 merge --ff-only payment-correction`
4. Apply the migration to LIVE via MCP `apply_migration` (the `.mcp.json` MCP is bound to live `hjppxawglmukfvsgmcog` — deliberate at this step and ONLY this step).
5. Regenerate `packages/data/src/database.types.ts` via MCP `generate_typescript_types` — the two RPC entries were HAND-ADDED (`editar_venta`, `eliminar_venta`); diff against the regen, commit any drift (expect none — shapes were mirrored from house format).
6. Close #269 (`gh issue close 269 --comment ...`) and map #265. No edge functions touched → pre-push edge guard not in play.
7. **Push stays owner-gated** — do not push unless he asks in that conversation. Owner walk of the flow (ficha → tap pago → edit / delete preview) is the remaining HITL.

## Traps carried forward

- Denial runner refuses the live ref; never point TARGET_REF at `hjppxawglmukfvsgmcog`.
- Scratch-green ≠ live-current ([[reserva-manual-agenda-spec]]).
- NEVER `supabase link`/`db push` to prod ([[prod-migration-version-drift]]).
- `set local role authenticated` no-ops postgres-only writes inside suites — fixture writes are already all pre-role-switch; keep it that way if editing.

## Owner-owed (unchanged)

1. Fresh scratch PAT (the blocker above).
2. SAT persona-física details (nombre, RFC, régimen, domicilio fiscal, correo).
3. RED owner's remaining ~5 onboarding feedback items.
