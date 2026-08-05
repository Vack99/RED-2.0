# Handoff — build queue (2026-08-04, supersedes 2026-08-04-SESSION-HANDOFF.md)

Every ruling is made, every spec is published. The next session BUILDS and CLOSES — the owner is done
deciding; do not re-open any ruling. Read the tracker, not this file, for the what: spec on **#233**,
tickets **#245** (settlement migration) → **#246** (desk UI, blocked by #245) → **#136** (weekly cron,
hardening list in its ruling comment) → **#244** (four guards; its item 1 folds into #245 if
convenient). Epic merge closes #233 #166 #167 #171 #172 #232. Session ends with an owner walk
(desk toast + class-cancel refund) and a per-push consent ask, #235-style.

## State

- **Git:** local `main` is ahead of origin with unpushed docs + test commits (another session
  committed test vectors to main mid-handoff — `git log origin/main..main` before assuming anything);
  they ride the next consented push. This worktree (`reserva-manual-agenda`) is merged and reusable,
  or start fresh from `main`.
- **Live DB:** current through `20260803140000`. `reservar_clase`/`cancelar_reserva` already take
  `(p_session_id, p_cliente_id default null)` — the epic does NOT touch them (spec pins it).
- **Scratch:** `gyyujeguycxxoaqgdnjp`, current through `20260803140000`, PAT at
  `docs/db-testing-throwaway-project/data` on main. Denial suite green there 2026-08-04.
- **pg_cron is NOT installed on live.** #136 needs `create extension` + note `cron.schedule()` is DB
  state, not migration state — scratch can't prove the job exists; keep the schedule call idempotent.
- **Deadline anchor:** red's seeded sessions end **2026-09-13** (#136 before then). forge self-heals
  weekly via the desk — nothing is on fire.

## Traps this session paid for — don't pay twice

1. **Scratch-green ≠ live-current.** The denial runner's TARGET_REF path never applies migrations.
   Bring scratch forward first (Management API `POST /database/query` with the .sql via Node `fetch` —
   PowerShell `ConvertTo-Json` mangles SQL — then stamp `supabase_migrations.schema_migrations`), and
   apply to LIVE via MCP `apply_migration` before any owner walk. #235's walk failed on exactly this.
2. **Rebase before building.** This worktree trailed main and the import-line conflict resolution
   ("take the union") resurrected a symbol main had deleted (`resumirRoster`, deleted by `f91e800`).
   On import conflicts, check what main REMOVED before unioning.
3. **Conflicting file pointers exist for `toggle_pase`.** One agent read `20260710124000` as its
   latest definition; the closed-window pardon lives in `20260729120000:512-545`. Grep for the
   truly-latest definition of each RPC before editing — latest migration wins.
4. **Worktrees don't carry `.env.local`** — copy `apps/{admin,client}/.env.local` from the main
   checkout before `pnpm dev`.
5. **PowerShell:** no heredocs — long `gh` bodies go through a temp file + `--body-file`.
