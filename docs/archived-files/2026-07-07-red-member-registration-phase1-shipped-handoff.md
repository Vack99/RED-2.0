# Handoff — Member Registration Phase 1: SHIPPED + LIVE

**Authored:** 2026-07-07 (continue 2026-07-08). **State:** Phase 1 code + DB fully live on `origin/main @ 424e6d5`; Vercel prod deploy triggered.

Full status, decisions, and what was applied: memory **`member-registration-payment-strategy`** (updated this session) — read it, don't re-derive. Both prod defects are closed: the Ilimitado free-booking hole and the two-doors duplicate-member gap.

## Next steps (in order)
1. **Confirm the Vercel deploy succeeded.** It was triggered by the push; build status wasn't visible from the session (no Vercel CLI/API here). Check the dashboard, or curl the deployed app to confirm it serves.
2. **red-demo e2e acceptance** (both onboarding directions). Steps: `docs/runbooks/member-registration-phase1-deploy.md`. Gated on the still-open **#63 Slice-0 owner items** (Supabase Auth URL config; red-demo `about_story`/`nota`/`workblock.value` seed; reach red-demo via `?gym=`) — memory `phase6-client-execution-progress`.
3. **#63 exit-gate re-walk** → unblocks #49. Runbook: `docs/runbooks/hitl-63-phase6-exit-gate.md`.

## Gotchas
- **Supabase MCP is bound to LIVE** (`hjppxawglmukfvsgmcog`), no scratch project — `apply_migration`/`execute_sql` hit prod. Memory `supabase-mcp-bound-to-live`.
- **fable-5 is out of usage credits** → run reviews on opus-4.8.
- The main checkout still holds the **prior auth-hardening session's uncommitted work** (unrelated to Phase 1, untouched). The two `docs/logs/errors1` runtime errors — client `providers.tsx` `<script>` warning and a `"Sin gym asignado"` tenant-resolution throw in `inicio/page.tsx` — belong to that work, not reviewed.

## Housekeeping
- Branch `member-registration-phase1` + worktree `RED-2.0-wt/member-registration-phase1` are fully merged into `main` → safe to `git worktree remove` (from main root) + `git branch -d`. SDD ledger: `<worktree>/.superpowers/sdd/progress.md`.
- `docs/runbooks/member-registration-phase1-deploy.md` is uncommitted in the main checkout — commit to main when convenient.

## Suggested skills
- `superpowers:verification-before-completion` — evidence before claiming deploy/e2e green.
- `run` / `verify` — drive the deployed app for the e2e walkthrough (follow the runbook; don't re-plan).
