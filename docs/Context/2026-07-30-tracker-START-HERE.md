# Tracker work — start here (2026-07-30)

Three documents came out of one session. Read this page, then open the one you need.

| doc | what it is | feed it to |
|---|---|---|
| **this page** | orientation + open decisions | every session |
| `2026-07-30-tracker-usefulness-cross-examination.md` (44 KB) | diagnosis: 12 ranked defects, 18 refuted, the owner rulings of record, blind spots | any session touching the tracker |
| `2026-07-30-tracker-growth-design.md` (56 KB) | one fix, fully specified: procedural realms, gate migration, agent filing contract, build order S0–S7 | the growth session |
| `2026-07-30-growth-prototype/` | working, gate-verified prototype for S2 | the growth session |

They overlap by ~0. The cross-exam is *what is wrong*; the growth design is *how one thing gets fixed*.

---

## The one-line state

The tracker renders **closed history**. 16 of 17 open issues bind to nothing, because outside Foundation
every binding key is a label that was never created on GitHub. Separately, every structural gate pin reds
when the project grows — which is why `docs/scope-model.yaml` has 2 commits in its entire history.
**The tracker punishes its own growth, so nobody grew it.**

Neither problem is in the renderer. Two sessions of panel work were spent below the wrong layer.

## Rulings already made (do not relitigate)

- **R1 — procedural realms.** A new realm/quest/issue must render with no hand art, no gate edit, no code
  edit. *Achievable and cheap: verified prototype, 311 assertions pass, parity sha1 intact, +46 lines.*
- **R2 — agents create quests (option B).** When an agent files an issue that fits no quest, it creates the
  quest and reports afterwards. Blocked until the gates stop reding on growth.
- **D2 — credit shipped work, but never as terrain.** Unbound closed issues are unattributable by
  definition; crediting them as fog-clearing would light realms that did not earn it. Counts and ledger
  entries only.
- **D3 — delete the 28 ghost `quest:*` labels.** *Not* the 7 working keys — those hold Foundation's bars.

## Decisions still open — these block work

1. **D1 — does a panel row show what an issue SAYS, or only that it exists?** `refresh.mjs` fetches no
   `body`, so `SPEC-panel-arbol.md` §8 claims job 5 while its own out-of-scope clause forbids the change
   that would deliver it. **Both clauses are in the same document.** Either add `body` (open issues only;
   67,643 → ~121,000 bytes, +0.26 s) or strike job 5. **This blocks the panel walk.**
2. **D4 — do the frozen census pins stay?** If they do, **closing #105 reds the build.** #105 is the issue
   held open for your "in use" walk, so this bites the moment you walk it.
3. **Can an agent create a *realm*, or only a *quest*?** The growth design says quest yes, realm no. Given
   "prioritize tactical use," this may be wrong. §10 of that doc.
4. Three more in growth-design §10 (map re-lay on realm add, ~12-realm ceiling, lake ownership).

## Sequencing — there is a live collision

A session is executing `PLAN-panel-arbol.md`, past Task 3. Its file set is `viewmodel.mjs`,
`check-viewmodel.mjs`, `check-interior.mjs`, `panels.mjs`, `check-panels.mjs`, `shell.mjs`, `CONTRACT.md`.

- **S0 and S1 of the growth build touch those same files — do not run them concurrently.** Sequence after
  the panel plan, or fold S0 into panel Task 1.
- **S2 + S3 (the overworld derivation) are fully independent** and can start now. The panel plan touches
  neither `overworld.mjs` nor `check-overworld.mjs`.

**If a session runs short, S0 alone is the highest-value step** — it converts the tracker from punishing
progress to absorbing it, for quests and issues, which is 100% of the growth that will happen this quarter.
Realm #8 is not imminent.

## Two things that will mislead you

- **`check-overworld.mjs` is a false green.** It never reads `status.js` — it drives from a 7-entry `FROZEN`
  literal inside the gate (`:22-30`). It passes 311 assertions against an 8-realm model it cannot draw.
- **`check-emit` currently FAILS.** Stale-only: `arcade.html` is 314,554 B on disk vs 318,770 B fresh — the
  panel session's uncommitted edits. Not a defect.

## What none of this fixes

**Growth ≠ usefulness.** 17 open issues ÷ 74 quests = 0.22 per quest. Binding every issue perfectly still
leaves 74 rows of which ~15 hold anything actionable. The ÁRBOL panel's inbox + wait-axis is the usefulness
work. Do not report the growth build as an answer to the #176 walk failure.
