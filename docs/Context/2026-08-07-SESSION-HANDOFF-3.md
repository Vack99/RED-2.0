# Handoff — #243 SHIPPED (2026-08-07, supersedes 2026-08-06-SESSION-HANDOFF-2.md)

Branch `worktree-reserva-manual-agenda` @ `c05c2d8`, pushed to `main` this session. **All 6
migrations LIVE and md5-verified. Denial 45/45 on scratch. Owner walked everything green.**

## What shipped

The 2026-08-06 handoff's 3 migrations, plus the owner walk's findings, closed in three commits:

- `ba84ed5` — **the horario group**: the walk proved the real gap was the model ("repetir N días"
  mints N per-weekday templates; the verbs touched one). Kid-test ruling → tri-scope:
  Solo esta clase / Todos los «día» / Todo el horario, over `schedule_template.group_id`
  (backfill key gym+tipo+hora+dur+cupo+created_at; seeds force the params key; the one live
  split — the owner's Sat 22:30 test move — is named and accepted). `p_all_days` on both verbs,
  one transaction, summed receipts. `edit_class_session` refuses cancelled targets and
  future→past moves. UI dirty-tracking kills the silent edit-wipe on scope toggle.
- `709f8e6` — review wave (2 opus): the SYMMETRIC hold guard (past→future move re-armed
  forfeited holds — credit minted from a no-show; now 'No se puede mover al futuro una clase
  que ya pasó con reservas'), coach DELTA rebase on scope flip, dirty-by-value, retired
  templates detach the card, backfill vector 14a, anchor-race raise.
- `c05c2d8` — re-walk item 4: cancel refusals get their tense right ('La clase ya pasó' once
  fully over, 'ya comenzó' only while running; gates + refund bodies byte-identical). Sheet
  hides the narrow cancel on past cards.

Walk verdicts that were NOT bugs (verified in live rows, do not re-file): retire cancelled all
6 weeks (one stamp); the booking rode the move (client tab was stale); a hand-detached Única
card offers no scope toggle by design. The stranded hold `ac581df6` from the walk's past-move
test was released on live (+1 credit).

## Still owed (unchanged from prior handoffs)

Settlement walk on DEPLOYED admin · **first cron run Mon 2026-08-10 08:00 UTC** — check
`cron.job_run_details` + `public.cron_run_log` · #230 VENTANA closeout · #152 Pro at 4th gym ·
cost-model #247/#248/#249 · ready-for-agent queue #240/#234/#231/#222/#151/#150/#149.

## Cleanup notes

- The main checkout's local `main` is behind — `git pull` from there (push went branch→origin/main).
- This worktree can be removed after the session: `git worktree remove reserva-manual-agenda`
  (from the main checkout; branch is fully merged).
- Scratch `gyyujeguycxxoaqgdnjp` KEPT as the denial test bed, fully reconciled with all 6
  migrations.
