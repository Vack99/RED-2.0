# HANDOFF 2 — Gate 0.1 execution (written 2026-08-08, end of orchestration session 2)

Continues `2026-08-08-gate0-execution-HANDOFF.md` (still valid for codebase intel + decisions).
This session executed #253 fully and #254 almost fully, and fixed a repo-level lineage split.
**Read the ledger first**: `.superpowers/sdd/2026-08-08-gate0-execution-HANDOFF/progress.md`
(git-ignored, on disk) — it names every SHA, finding, ruling, and deferred minor.

## Owner's orchestration instructions (carry these forward verbatim in spirit)

- **This is an orchestration session**: the main context coordinates only — save main-session
  context without compromising output quality. Subagent per unit of work; briefs and reports are
  FILES handed by path (never paste bodies into dispatches); issue bodies fetched straight to
  brief files via `gh ... --jq .body > file` so they never transit the controller's context.
- **Use as many agents as needed, inside the CLAUDE.md guidelines**: caps sonnet 35 / opus 18 /
  fable 0-staffed (escalation-only). This session's usage: implementers + scoped re-reviews +
  verification = sonnet; task reviews = opus; final whole-branch review = opus.
- **Don't assume information** — verify claims against the repo/issues before acting on them
  (this rule is what turned "schema drift" into the real lineage finding below).
- **Owner AFK: take the wheel, be responsible** — proceed on reversible calls with a stated
  ruling (don't ask when you have a recommendation); stop only for destructive/irreversible acts.
  Pushing and LIVE writes stay owner-gated per CLAUDE.md.
- Process used (keep it): `superpowers:subagent-driven-development` — fresh implementer per task
  → opus task review → fix rounds resumed on the SAME implementer (SendMessage) → scoped
  re-review → ledger entry. Foreground/visible agents; ONE implementer at a time (never parallel
  builds); tree committed clean before every dispatch.

## State: branch `gate0-privacy` @ `6bead52`, tree clean, NOTHING pushed

- **LINEAGE (session-critical discovery)**: local `main` (60068e3) had silently diverged —
  yesterday's docs session branched from a stale main, missing BOTH `origin/main = 3f77967`
  (#243 series-edit, incl. `20260806120000_schedule_group_prework.sql`) and branch
  `queue-batch-0807` (`aca51bd` = the 11-issue batch, never fast-forwarded). The "7 failing
  denial suites / phantom group_id drift" was exactly this. **`gate0-privacy` was rebased onto
  `aca51bd`** (zero conflicts; union verified). At ship time: `git branch -f main <branch-head>`
  — the old 60068e3 chain is unpushed duplicate docs commits, and `origin/main` then
  fast-forwards cleanly. `queue-batch-0807`'s head `dab962a` carries 2 WIP commits for OPEN
  #260/#261 — do NOT take them onto main.
- **#253 COMPLETE** (`37d3e7e` + fix `7a7fc4d`, review clean): `acuerdo_aceptacion` evidence
  table + `gym_legal` satellite + `aceptar_acuerdo` RPC — owner-gated, hashes contenido
  server-side, `accepted_by` on-delete-set-null + `accepted_by_email` snapshot, returns
  `(id, ya_existia, contenido_hash)`.
- **#254 BUILT + fix round 1 COMMITTED, re-review PENDING** (`a57ff2b` + fix `6bead52`): the
  session died right before the scoped re-review. The fix commit claims: UA/IP truncation in the
  DAL, acceptance check inside `/cuenta/respaldo` route handler, `tools/guards/anexo-legal-drift.test.ts`
  (md↔constant + pinned sha256 + version pin), warn-on-read-error, legibility/a11y/copy minors.
  Full suite 91 files / 1437 tests green per its report. **First move next session:** scoped
  re-review per the skill's `re-review-prompt.md` — FIX_BASE=`a57ff2b`, HEAD=`6bead52`, findings
  list in the ledger, report `task-254-report.md` (fix report appended at the end).
- **Scratch (`gyyujeguycxxoaqgdnjp`): repaired, ALL 46 denial files green.** A blind full
  115-file replay contaminated it mid-session (regressed function bodies, resurrected a dead
  overload); targeted repair restored it. **HARD RULE going forward: scratch is FRONTIER-ONLY —
  apply only NEW migration files, never replay the whole migrations dir.**
- **Ship-order obligation (fail-closed gate):** the #253 migration must be applied to LIVE (MCP
  `apply_migration`; MCP is bound to PROD) BEFORE any prod deploy of the admin app — the #254
  gate fails closed and would lock every gym out until the table exists. Order at ship: live
  migrations → `branch -f main` → owner-consented push.

## Remaining work, in order

1. **#254 scoped re-review** (see above) → complete the task in the ledger.
2. **#255** — brief STAGED: `.superpowers/sdd/2026-08-08-gate0-execution-HANDOFF/task-255-brief.md`.
   Controller-verified and baked into the brief: the `gym` table has NO write policies and
   `legal_name` is excluded from anon+authenticated column grants → #255 REQUIRES a migration
   (authenticated `select/update (legal_name)` grants + the FIRST update policy on `gym`,
   staff-scoped per the issue AC) + denial vectors + frontier-only scratch gate.
3. **#256** — brief STAGED: `task-256-brief.md`. Anon read axis migration (anon
   `select (legal_name)` grant + `gym_legal` anon SELECT policy per the gym_contact template);
   mind #250 (`aca51bd`) which dropped unread anon policies with suites proving the drop —
   extend those suites, don't fight them. Dispatch AFTER #255 (consumes its domain module).
4. **#257** — brief NOT yet written (blocked by #256). Consent stamps carry document version;
   precedent pointers in HANDOFF 1 (`reclamar_*` migrations, suite shape at
   `reclamar_por_codigo.sql:132,140-141`).
5. **Ship step**: final whole-branch review (opus, `requesting-code-review/code-reviewer.md`,
   MERGE_BASE=`aca51bd`, pointed at the ledger's deferred-minors/parked lines) → ONE fix wave if
   findings → apply the branch's migrations to LIVE in filename order via MCP → `branch -f main`
   → close #253–#257 with comments → handoff/memory update → push ONLY with explicit owner
   consent in-conversation.

## Small print

- Deferred minors for the final review: listed in the ledger under Tasks #253/#254.
- Owner queue untouched: #258 HITL (borradores → abogado, rollout ruling); #260/#261 WIP sits on
  `queue-batch-0807`; queue-batch's own leftovers (member-removal ruling #221/#251) unchanged.
- `pasar_lista_sesion` has a benign signature divergence on scratch only (suite passes; noted in
  ledger).
- All SDD artifacts (briefs, reports, review packages, ledger) live in
  `.superpowers/sdd/2026-08-08-gate0-execution-HANDOFF/` — git-ignored, survives on disk.
