# Harness Learnings Ledger

**Purpose.** A running, durable capture of every lesson from building Forge that should
shape the **back-half "shipping" skill** (the architecture → working-app half of the harness;
the front half is the already-extracted `sector-map` skill). Forge is the proving ground; this
ledger is how its lessons survive across sessions so the skill is built from *accumulated,
reinforced* learnings — not reconstructed from memory.

**How to use this file (every session, not just skill-building ones):**
1. While working, when you hit a real lesson — a mistake, a gotcha, a "the harness should have
   prevented this" — note it.
2. At the **end of every session**, append a dated entry below (newest at the bottom). Keep each
   lesson as a triplet: **What happened · Why it matters · Skill implication** (how the back-half
   skill should encode/prevent it). Reference artifacts by path; don't duplicate them.
3. The **skill-creation session** (GOAL B / N+2) reads this ledger top-to-bottom as the primary
   input to `write-a-skill`, alongside the audit doc.

**Do not duplicate — reference these existing sources:**
- The architecture audit's **7 harness implications** (the structural payload):
  `docs/superpowers/audits/2026-05-31-forge-architecture-audit-learnings.md`
- The proven orchestration shape (orchestrator + 2 fresh-eyes gates, local issue store):
  `docs/prompts/goal-forge-supabase-finish.md`, `docs/prompts/resume-forge-migration.md`
- Prior cycle handoffs: `docs/superpowers/handoffs/2026-05-29-*`, `2026-05-30-*`, `2026-05-31-*`
- The `sector-map` skill (front half, the template to mirror): `~/.claude/skills/sector-map/`

---

## 2026-05-31 — architecture audit + HIGH-cluster hardening session

**Structural lessons** — captured in full in the audit doc (the 7 implications). Reference, don't
re-list. One-line reminder of the through-line: *the single enforced dependency boundary catches
import **direction**, not concept **duplication** or contract **honesty** — the back-half skill's
headline gate must add those two.*

**Process lessons:**
- **Validate the OUTPUT before codifying the PROCESS.** We almost extracted the skill on faith;
  auditing Forge's actual architecture first turned every flaw into a concrete skill gate. *Skill
  implication:* the skill should open with a "audit a reference output before trusting the
  template" step, and ship its own adversarial-audit workflow. ([[forge-validate-before-codify]])
- **Fix the output first, extract second.** Forge embodies its own lessons now, so the extracted
  skill is cut from a clean reference. *Skill implication:* document this ordering as the
  recommended way to evolve the skill from each new project.
- **Thin seam over fat when the alternative duplicates the domain.** The audit literally flagged
  "rule re-coined in two places" as finding #1; a full-plpgsql RPC would have re-coined the money
  math in SQL on the very repo that showcases that audit. We chose the thin RPC (math stays in
  tested TS). *Skill implication:* a gate — "does this change duplicate a tested domain rule in a
  second language/layer? prefer the seam that keeps it single-source."
- **Aim for good-enough that showcases the harness, not perfection.** ([[forge-good-enough-not-perfectionist]])
  *Skill implication:* the skill should calibrate every gate to the project's stated goal, not an
  abstract ideal — and say so.

**Operational gotchas (bake into the skill's "execution mechanics"):**
- **Commit messages: `git commit -F <file>`, never a multi-line `-m` here-string.** PowerShell
  `@'...'@` repeatedly mangled messages into bogus pathspecs (failed commits). The `-F` temp-file
  approach worked every time.
- **`packageManager` must match the on-disk pnpm/workspace.** Pinning `pnpm@9.x` against a pnpm-11
  `pnpm-workspace.yaml` (which has only `allowBuilds`, no `packages:`) breaks every script with
  `ERROR packages field missing or empty`. Pin to the actual local version (here `pnpm@11.0.9`).
  ([[forge-pnpm-add-prefer-offline]])
- **Don't over-batch tool calls.** When one call in a parallel batch fails, the harness cancels all
  siblings — a wall of "Cancelled…" that looks like many failures but is one. Keep DB/commit/verify
  steps in small batches.
- **After ANY live-DB DDL: immediately mirror SQL → `supabase/migrations/`, regen + write
  `database.types.ts`, run `get_advisors`, and commit — in the same step.** We deployed RPCs and
  stopped, creating a live-DB↔repo drift (the audit's own finding #7, lived in real time). *Skill
  implication:* make "mirror + regen + advisor + commit" an atomic, non-skippable sub-step of any
  schema slice; a slice with applied-but-unmirrored DDL is NOT done.
- **Classifier-gated actions are HITL by design:** bulk push to a new public repo, and DDL on a
  live/public DB, each need explicit operator authorization. *Skill implication:* the skill should
  mark these as operator-gated checkpoints, not agent-autonomous steps.

## 2026-06-01 — atomic-writes wiring (Option A): finishing the deployed-but-inert RPCs

Session N+1's STEP 1: resolve the live-DB↔repo drift by wiring the two atomic-write RPCs
(`registrar_venta`, `toggle_pase`). Done + verified; 5 commits on `master` (`cc9c427` →
`b3b9fe9`). Gates green throughout (lint 69 modules · typecheck · test 60/60 · build 10 pages);
`get_advisors(security)` still only the leaked-password item. Lessons, as triplets:

**Verification / correctness lessons:**
- **A silently-wrong tool name fails OPEN, not closed.** Early calls used bare `execute_sql` /
  `apply_migration` (the real names are `mcp__supabase__*`). They returned "No such tool available"
  — easy to skim past — and I'd already *written a migration file reconstructing the RPC bodies from
  memory*. That guess was wrong on real columns (`user_id` not `perfil_id`; no `ultima_visita`;
  `asistencias` soft-delete). *Skill implication:* before authoring ANY mirror/derived artifact from
  a remote source, the source fetch must have **succeeded with returned data** — never reconstruct a
  function/schema from memory when the canonical text is one `pg_get_functiondef` away. Gate:
  "mirror = verbatim from a confirmed read, never from inference."
- **Tests assert against the system's OWN truth, not a plausible proxy.** Two smoke-test failures
  were the *test's* fault, not the code's: (1) I seeded the JWT `sub` with `perfil.id`, but RLS +
  the FK key on `auth.users.id` — `perfil` has a separate `user_id`; (2) I used the DB's UTC
  `current_date` as "today", but `toggle_pase` correctly stamps `hora` only for *Chihuahua-local*
  today (UTC was already tomorrow at ~01:30Z). Both looked like RPC bugs. *Skill implication:* when
  a money-path test fails, first falsify the test fixture (identity, clock, tenant) against the real
  system before touching the code; bake the project's tz + auth-identity facts into the test
  template. ([[forge-validate-before-codify]])
- **Smoke-test the seam in a rolled-back txn on the REAL schema + REAL identity before wiring.**
  `begin; set local role authenticated; set request.jwt.claims …; <assert with RAISE>; rollback;`
  proved every case (new/existing client, finite/ilimitado/mes, toggle on/off, back-dated,
  zero-balance guard) against prod data at zero cost and zero writes. This is the executing-test
  the audit's finding #3 demands. *Skill implication:* ship this rolled-back-assert pattern as the
  default DB-behavior test when no local Docker/pgTAP harness exists.

**Canonical-provisioner lessons (finding #7, lived twice more):**
- **Repo migration VERSIONS must equal prod's `schema_migrations` exactly — filename is the key.**
  I applied DDL via MCP (which auto-versions, e.g. `…010843`) and separately wrote a repo file with
  a guessed name (`…011045`). Merge/push key off the version string, so a mismatch = prod re-runs or
  diverges. Fix: read `list_migrations` and name the repo file with the SAME version. *Skill
  implication:* "apply → immediately read back the assigned version → write the repo file under that
  exact version" is one atomic step; never name a migration file by guess.
- **The from-scratch rebuild proof catches gaps `get_advisors` can't.** Replaying the whole repo
  migration set into a throwaway schema (empty → asserted object count) exposed that the
  `rls_auto_enable` SECURITY DEFINER event-trigger guard lived ONLY in prod (created out of band) —
  yet a migration *revoked* on it. A clean build would have failed at the revoke and shipped without
  the auto-RLS guard. No advisor flags a missing-create; only a rebuild does. *Skill implication:*
  make "replay all migrations from empty and assert the object set" a blocking gate of any
  schema-touching slice — it's the only check that proves the repo (not the live DB) is the source
  of truth. Without local Docker, a rolled-back replay into a `_rebuild` schema is the fallback.
- **DROP+CREATE silently re-grants Supabase default privileges (incl. `anon`).** Reordering
  `registrar_venta`'s params required DROP+CREATE; that re-granted EXECUTE to `anon` on the
  money-path RPC. `get_advisors` did NOT flag it; my own grant-diff query did. *Skill implication:*
  after any function DROP+CREATE, re-assert the grant set (and diff against a sibling function);
  treat "default privileges re-applied" as a known post-condition to scrub.

**Process / mechanics lessons:**
- **`git add -A` swept an uncommitted `.commitmsg` into the tree.** The `-F` temp-file commit habit
  (good, from last session) + a broad `git add -A` = the message file got committed. Fix: `.commitmsg`
  is now gitignored. *Skill implication:* the `-F` pattern must pair with **gitignoring** the temp
  file (or staging explicit paths, never `-A`).
- **Verify the committed ARTIFACT verbatim, not just the logic.** My first RLS test file mixed psql
  `\set` (won't run via MCP) with `current_setting()`. I re-ran the exact file bytes through
  `execute_sql` to confirm it passes as-written. *Skill implication:* a test artifact isn't "done"
  until its literal on-disk content has been executed green by the path it documents.
- **The thin-RPC choice keeps the domain single-sourced — but the TS↔SQL twin is now a real seam to
  watch.** `consumirClase` (TS) and `toggle_pase`'s guarded decrement (SQL) state the same rule in
  two languages. We kept both (live path needs the SQL transaction) and cross-linked their docstrings
  rather than deleting the tested TS. *Skill implication:* when a tested domain rule is necessarily
  mirrored into a seam (SQL/edge), require a bi-directional doc link + a "keep in lockstep" note — the
  honesty the audit's finding #1 is about. ([[forge-harness-audit-lessons]])

**Still open for Aaron (HITL, unchanged from the handoff):** publish to GitHub
(`gh repo create vack99/forge --public --source=. --remote=origin --push`); enable leaked-password
protection in the Supabase dashboard. **N+2 remains the skill-extraction session** — this ledger is
its input.

<!-- Append the next session's entry below this line. -->
