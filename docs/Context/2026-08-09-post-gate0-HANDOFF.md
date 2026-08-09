# HANDOFF — post-Gate 0.1 (written 2026-08-09, end of orchestration session 3)

Gate 0.1 (#252) is SHIPPED. This handoff is the next session's starting point: state first, then the
standing instructions to run under (same as sessions 1–3), then the open queue.

## State: main = origin/main = `ec58d03`, everything pushed, migrations LIVE

- `gate0-privacy` fully landed: #253–#257 built, task-reviewed (opus), fix-looped, final
  whole-branch review (opus) passed with all fixes; branch rebased onto the horizon batch that had
  reached origin/main meanwhile (zero conflicts, duplicate gate0 docs commits auto-dropped).
- All 4 migrations applied to LIVE **before** the deploy (the #254 gate fails closed — that
  ordering is why): acuerdo spine `20260808120000`, legal_name staff update `130000`, gym_legal
  anon read `140000`, privacy_aviso_version `150000`. Live verified post-apply: single RPC
  signatures, 7 policies, anon `gym_legal` read = exactly the 4 aviso columns. `database.types.ts`
  regen-checked against live.
- Gates at ship: vitest 1509/1509, lint/typecheck clean, denial **47/47** on scratch
  (`gyyujeguycxxoaqgdnjp` — carries ALL migrations incl. horizon's; still the test bed).
- Settled semantics — do not relitigate, never "fix" by backfill: `clientes.privacy_aviso_version`
  is written ONLY when the rendered aviso was complete for that gym; the no-aviso rails (reservar
  retry, vincular, cuenta_existente magic-link) stamp null; historical rows stay null.
  `AVISO_PRIVACIDAD_VERSION` is drift-pinned — any template text edit must bump it.
- Live aviso activation is DATA-blocked, not code-blocked: forge/forge-demo have `gym_contact.email`
  NULL, red has no `gym_contact` row → those gyms serve the generic fallback (honest). #262 is the
  unlock. SDD workspace for the gate0 plan was deleted (skill's finish step) — git history + issue
  close comments are the record.

## Standing instructions (carry forward verbatim in spirit — owner restated them at handoff time)

- **Orchestration scope**: the main context COORDINATES ONLY — save controller tokens without
  compromising output quality. Subagent per unit of work; briefs and reports are FILES handed by
  path (never paste bodies into dispatches); issue bodies go straight to brief files via
  `gh issue view N --json body --jq .body > file` so they never transit the controller's context.
- **Skills in force**: `/ponytail` (laziest solution that works — stdlib before custom, one line
  before fifty), `/keep-it-lean` (every abstraction/branch/sentence earns its keep in the current
  diff), `/caveman` for controller communication (lead with the outcome, 1–3 lines, no filler —
  the owner called a long writeup "a fucking bible" once; don't be that).
- **Process**: `superpowers:subagent-driven-development` — fresh implementer per task → opus task
  review → fix rounds → scoped re-review → ledger entry in the plan's `.superpowers/sdd/` workspace.
  ONE implementer at a time, never parallel builds; tree committed clean before every dispatch.
- **Models** (CLAUDE.md caps: sonnet 35 / opus 18 / fable 0-staffed): implementers + scoped
  re-reviews + verification = sonnet; task reviews + final whole-branch review = opus; fable
  escalation-only per the Fable rule.
- **Agents FOREGROUND, one at a time.** Session-3 lesson (twice-burned): `SendMessage` resumes run
  in background and DIE when the owner restarts the app — fix rounds go to FRESH foreground
  dispatches carrying brief + report + findings paths; the report file is the persistent memory.
- **Don't assume — verify** claims against repo/issues/live before acting (this session it turned
  "just ff main" into the rebase, and caught the fabricated-version stamps).
- **Owner AFK: take the wheel** — proceed on reversible calls with a stated ruling; don't ask when
  you have a recommendation; decision questions that DO need the owner go in the AskUserQuestion
  picker, alone, never under a wall of findings. **Push and LIVE writes stay owner-gated** —
  consent covers only the specific act it was given for, in-conversation.
- **Scratch is FRONTIER-ONLY** — apply only NEW migration files, never replay the migrations dir.
  RPC signature changes: DROP the exact old signature first (defaulted-param `create or replace`
  leaves a live overload — bit this project twice).

## Open queue (next session picks from here)

1. **#262** gym_contact admin editor (`ready-for-agent`) — Gate 0.1's real exit dependency: until
   it ships (or the owner hand-seeds forge's email + red's row), no real gym reaches a complete
   member-facing aviso. CUENTA settings-sheet pattern, staff RLS already exists (#53).
2. **#263** /legal heading hierarchy (`ready-for-agent`) — restore §1–§6 headings after the
   markdown strip; small, member-facing.
3. **#258** owner HITL — borradores → abogado, rollout ruling. Gates the epic's done-when, not
   builds. The ARCO plazos (20/15) and every "0.1-borrador" text ride on it.
4. Cron first-run check was due Mon 08-10 (#243 series-edit + horizon frontier) — verify the
   materializer ran clean on live before assuming.
5. Standing leftovers (older memory): member-removal ruling #221/#251; #220/#221 t3 tickets;
   pending owner walks (#178).
6. Next gate on the ladder: `docs/gates/gates-0-to-5.md` — owner picks when Gate 0 loose ends
   (#258/#262) close.

Pipeline for anything big/foggy: wayfinder → to-spec → to-tickets → subagent-driven implement.
