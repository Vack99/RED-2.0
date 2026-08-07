# Handoff — #243 defects closed, ready to ship (2026-08-06, supersedes 2026-08-06-SESSION-HANDOFF.md)

Branch `worktree-reserva-manual-agenda` @ `6873ed9`. **Nothing pushed. Nothing applied to live.**
`origin/main` untouched at `5f69d84`.

## What happened

The scope call: **the move ships** — the owner barred deleting it and asked for the defects fixed.
All 7 are closed, plus a second adversarial wave (2 opus reviewers) found and closed 8 more app-side
defects. Mechanism per defect is in `6873ed9`'s commit message; the short version:

- **No advisory locks anywhere** (owner ruling on #6, implemented — kills #1 too: a lock in the move
  alone locks against nobody). Accepted race documented in the move + retire headers with its trigger.
- **Skip, not detach**: the past-instant guard leaves the un-movable class attached and byte-identical
  (`kept` OUT param). "Terminar el horario" now reaches it — the probed orphan (#4) is structurally dead.
- **Backfill** in prework detaches historically hand-moved attached rows (#2/#3); collision state
  unreachable after it, so no 23505 handler.
- `and is_active` on the pin **and** on the template UPDATE (#5 + the TOCTOU a reviewer found).
- Coach propagation to `class_session_coach` on exactly the moved ids (#7).
- **Wide scope seeds from the RULE** (new `schedule_template` embed in the agenda read) — an off-grid
  kept/stray row can no longer silently revert the series or wipe a coach change.
- All lower-severity items: honest captions/receipts, no-op save no longer detaches, detach named in
  the toast, Única badge in SEMANA, in-flight disable, per-verb fail titles, horizon empty state both views.

Gates at `6873ed9`: lint · typecheck · vitest 1369/1369 · **test:denial 45/45 on scratch**, all four
function `md5(prosrc)` verified against repo bodies, backfill invariant 0 off-grid attached rows.
Scratch `gyyujeguycxxoaqgdnjp` is fully reconciled with the edited migrations (temp script method:
Management API `/database/query`, restore shipped materializer, replay 3 files, verify md5).

## Accepted behaviors (rulings, do not re-file)

- Hand-detached one-offs (Única) survive retire — deliberate; warned at detach time, badged in both views.
- `asistida` holds stay captured on retire (settlement rule); confirm's "reservadas" is literal.
- Move/retire vs materializer race: one stray class, visible + cancellable; trigger to lock = a real report.
- Backfill has no suite vector (one-shot DML) — hand-count is in the ship checklist instead.

## Ship checklist (owner-gated)

1. **Dry-run the backfill count on live first** (read-only): run the backfill's WHERE as a `select
   count(*)` against live; expect a small number (hand-moved sessions ever). Sanity, not a gate.
2. Apply the three migrations to live **verbatim** (temp `.mjs`, never PowerShell-mangled; MCP
   `apply_migration` is fine — it IS live).
3. Owner walk: move a series (receipt shows moved · kept), retire one (balances return), narrow-edit
   → Única badge + toast, retired-template stale-tab refusal.
4. Push (both Vercel apps deploy). No `supabase/functions/**` touched — no edge deploy needed.

## Still owed (unchanged)

Settlement walk on deployed admin (see prior handoff for the script) · **first cron run Mon
2026-08-10 08:00 UTC** — check `cron.job_run_details` + `public.cron_run_log` · #230 VENTANA closeout ·
#152 Pro at 4th gym · cost-model issues #247/#248/#249 (filed, measured, not started) · ready-for-agent
queue #240/#234/#231/#222/#151/#150/#149.

## Traps (inherited)

Scratch PAT at `docs/db-testing-throwaway-project/data` (main checkout, gitignored) · runner refuses
live ref · never `supabase link`/`db push` · commit before dispatching agents that can delete ·
multi-line commits via `git commit -F`.
