# Handoff — settlement epic shipped (2026-08-05, supersedes 2026-08-04-BUILD-QUEUE-HANDOFF.md)

**Session setup: invoke `/ponytail` and `/caveman` first** — the owner runs these sessions lazy-first
and terse; skills before any other action.

The 2026-08-04 build queue is DONE and PUSHED @ `5f69d84`: #245 → #246 → #136 → #244 built, denial
44/44 on scratch, opus adversarial review round closed (2 real defects found + fixed), all 3
migrations applied to LIVE and verified md5(prosrc)-identical to scratch, epic merge closed **#233
#245 #246 #136 #244 #166 #167 #171 #172 #232**. Vercel deployed both apps off the push. Nothing in
the epic is half-done; this session is HITL walks + whatever the owner picks next.

## HITL queue (owner-facing, in order of freshness)

1. **Settlement walk (this epic's exit gate, not an issue).** Deployed admin app, demo gym:
   - Desk tap finite member → toast **DESCONTADA**; ilimitado → **GRATIS**; roster-mark a booked
     member → **RESERVA**; ficha LIBRE mark shows the same receipt word.
   - Book a member into a future class (balance −1), Agenda-cancel the class → toast "Reservas
     canceladas y clases devueltas", balance +1.
   - Counter-facing ruling consequence to confirm he's seen: expired member who missed their booking
     is now refused at the door (`Paquete vencido`) — the pardon is dead. 24 of 52 live clientes are
     expired-with-balance, so this WILL come up at the counter.
2. **First scheduled cron run — Mon 2026-08-10 08:00 UTC.** The fn is proven (manual fleet pass ran
   on live: `gyms=4 created=290 errors=0`) but the JOB firing on schedule is not. After Monday:
   `select status, return_message from cron.job_run_details order by start_time desc limit 3;` and
   `select * from public.cron_run_log order by ran_at desc;` — expect `succeeded` + a summary row.
3. **#243 (hitl)** — series-edit path. Now slightly hotter: #244's duplicate-template unique index
   refuses re-creation, and until #243 ships there is NO in-app way to retire/replace a recurring
   class (review finding F8, accepted ship-with).
4. **#230 (hitl)** — VENTANA closeout walk (pre-existing, unrelated to this epic).
5. **#152 (hitl)** — Pro tier at 4th gym (standing trigger, not urgent).

## Small leftovers from the review (none blocking, file or fold into next touch)

- **F17:** Agenda roster tap consumes no receipt — `pasarListaSesion`'s `resultado` is plumbed but
  unused on that surface; desk + ficha show it. One-liner if the owner wants it there too.
- **F12:** `database.types.ts` pre-existing nullability drift (`hora`/`session_id`/`clases_restantes`
  typed non-null; wrappers re-declare `| null` correctly). Regen from live will reproduce `resultado`
  (hand-edit matches); regen when next touching types.
- **F9:** the autoroll suite's poisoned-ledger-claim vector is vacuous (the tz fault now raises
  before the claim); a true mid-loop-fault vector needs fault injection — noted, not built.
- `pasarListaSesion` wrapper has zero vitest coverage (pre-existing gap, flagged by the #246 agent).

## Ready-for-agent queue (tracker is the source of truth; owner picks)

#240 (roster 1000-row cap) · #234 (ventana_arribo hard-coded 90min) · #231 (desk SSR clock) ·
#222 (VENTANA spec E) · #151 / #150 / #149 (mail + activation hardening) · #190 shows OPEN with
ready-for-agent despite the 2026-08-01 "shipped" memory — reconcile against the tracker before
building anything there. #220/#221 live in the t3 fork planning space (epic #203), not this repo's
queue.

## State

- **Git:** origin/main == local main == `5f69d84`. Worktree `reserva-manual-agenda` merged +
  reusable (branch == main; `apps/{admin,client}/.env.local` already copied in).
- **Live DB:** current through `20260805110000_scheduling_guards`. pg_cron installed; job
  `roll-class-horizon` (`0 8 * * 1`) active; every gym at ~6-week horizon; `public.cron_run_log` +
  `public.gym_horizon_depth` are the ops surfaces (job_run_details carries only the command tag).
- **Scratch:** `gyyujeguycxxoaqgdnjp` current through `20260805110000`, denial 44/44 green
  2026-08-05. PAT at `docs/db-testing-throwaway-project/data` on main (gitignored — worktrees don't
  have it).
- **Do NOT:** re-apply this epic's migrations to live, re-run the first fleet pass, or `supabase
  link`/`db push` (version drift — live stamps differ from filenames by design; compare by NAME).

## Traps this session paid for — don't pay twice

1. **Supabase fires the pg_cron after-create grant hook even on `create extension IF NOT EXISTS`**
   when the extension is already installed → `2BP01 dependent privileges exist` kills the whole
   atomic batch on re-apply. The guard (pg_extension existence check DO block) in
   `20260805100000:242-250` is load-bearing — measured, documented in-file.
2. **pg_cron discards a job's return value.** `job_run_details.return_message` = command tag
   (`'1 row'`), never the SELECT's result — measured with a probe job. Summaries must self-persist
   (that's why `cron_run_log` exists). Don't "simplify" it away.
3. **Apply migrations to live VERBATIM.** Trimmed in-body comments land in `prosrc` and break
   repo↔live md5 comparison (the review's verification technique). Cost a reconciliation pass this
   session. When using MCP `apply_migration`, paste the exact file.
4. **Multi-line git commit messages with inner double quotes break PowerShell→git argument passing**
   even in here-strings — write the message to a temp file, `git commit -F <file>`.
5. **The scratch PAT does NOT reach the live project** (403 on Management API) — MCP is the only
   live path; scratch-only for the Node-fetch route.
6. (Inherited, still true) PowerShell mangles SQL through `ConvertTo-Json` — Management API calls go
   through temp Node `.mjs` scripts. Long `gh` bodies → temp file + `--body-file`.
