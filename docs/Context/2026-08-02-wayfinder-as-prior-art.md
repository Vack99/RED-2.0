# Wayfinder as prior art — does the tracker's model match the one that already works?

> Ticket [#194](https://github.com/Vack99/RED-2.0/issues/194), part of map [#191](https://github.com/Vack99/RED-2.0/issues/191).
> Method: `finding-the-standard`. This ticket is **MEASURE-primary** — every claim below is a `gh api` /
> `git log` / `node` call against this repo, run 2026-08-02, not a memory or an inference. External
> prior art (Kanban/GTD/other trackers) is out of scope here — that angle belongs to sibling ticket
> [#195](https://github.com/Vack99/RED-2.0/issues/195) ("Gamified and visual trackers: prior art, and
> what killed them"), which had not run yet at the time of this ticket.

## Answer, up front (a ranked finding for #198 to rule on, not a lock)

**Two different systems, not the same thing at different altitude.** They share vocabulary (a unit of
work, a dependency graph, a status) because both are DAG-shaped, but they hold different invariants and
answer different questions — see §5 for the reasoning and §3 for the measured reason neither can absorb
the other as-is. This ticket is `wayfinder:research`, not `wayfinder:grilling`; the actual ruling belongs
to [#198](https://github.com/Vack99/RED-2.0/issues/198) ("THE RULING: pick the workflow model the
tracker implements"), which this finding feeds.

---

## 1. MEASURE — wayfinder's actual workflow model

Read `C:\Users\Aaron\.claude\skills\wayfinder\SKILL.md` end to end and checked it against the two live
maps rather than against its own prose.

**Vocabulary, confirmed against SKILL.md:**
- **map** = one GitHub issue labelled `wayfinder:map`; its children are the tickets.
- **ticket** = a child issue, each carrying exactly one `wayfinder:<type>` label — `research`,
  `prototype`, `grilling`, or `task`.
- **claim** = the ticket's `assignee`. An open, unassigned ticket is unclaimed; there is no separate
  claim field.
- **blocking** = the tracker's **native** dependency edge (not a body convention — RED-2.0 has native
  GitHub issue-dependency support and wayfinder uses it).
- **frontier** = open ∧ unblocked (every blocker closed) ∧ unclaimed.

**#180 "MAP — Directorio de clientes"** (charted 2026-08-01, still open):
- 9 children, #181–189. `gh api repos/Vack99/RED-2.0/issues/180/sub_issues` confirms the set.
- `issue_dependencies_summary` per child (measured 2026-08-02):

  | # | type | blocked_by (direct/total) | blocking (direct/total) | state |
  |---|---|---|---|---|
  | 181 | research | 0/0 | 1/1 | CLOSED (assignee Vack99, closed 2026-08-02T17:06:05Z) |
  | 182 | research | 0/0 | 1/1 | CLOSED (assignee Vack99, closed 17:06:06Z) |
  | 183 | research | 0/0 | 1/1 | CLOSED (assignee Vack99, closed 17:06:08Z) |
  | 184 | research | 0/0 | 2/2 | CLOSED (assignee Vack99, closed 17:06:09Z) |
  | 185 | grilling | 0/0 | 2/2 | OPEN — **on the frontier right now** |
  | 186 | grilling | 1/2 | 1/1 | OPEN, blocked |
  | 187 | grilling | 2/6 | 2/2 | OPEN, blocked (the eventual RULING ticket) |
  | 188 | research | 1/1 | 0/0 | OPEN, blocked (cross-exam before lock) |
  | 189 | prototype | 1/1 | 0/0 | OPEN, blocked |

  Every closed ticket carries a real assignee before its close timestamp — the claim protocol observed
  in the wild, not assumed from the skill doc.

**#191 "MAP — Tracker usefulness"** (this map, charted 2026-08-01, still open):
- 11 children, #192–202. `sub_issues` confirms the set; `issue_dependencies_summary` shows #192, #193,
  #194 (this ticket), #195, #196, #197 unblocked (`blocked_by: 0`) and #198 blocked_by 4,
  #199 blocked_by 1, #200 blocked_by 2, #201 blocked_by 2, #202 blocked_by 3 — the DAG converges on
  #198 THE RULING, then #199 cross-exam, then #200/#201, then #202 prototype-before-spec. This is the
  same shape `finding-the-standard`'s own "route" model describes (independent RESEARCH/MEASURE units
  feeding a blocked RULING), which is not a coincidence — wayfinder is this skill's charting mechanic.

**What kind of model is this?** Not Kanban (no columns, no WIP limit) and not GTD (no contexts, no
energy/time filters). It is closest to a **build system's task graph with a computed ready-queue** — the
unit is "a decision to make or an investigation to run," not "a task," and a ticket's exit is a
resolution comment + close, not a status transition. `#192` ("How do people actually run an issue
tracker day to day?") is the ticket that would supply an externally-sourced vocabulary for this and is
still open at time of writing — this description is my own reading of the mechanics, not #192's answer,
and should be checked against #192 once it resolves. **Named gap, not silently dropped.**

---

## 2. MEASURE — why wayfinder gets used (candidates tested, not assumed)

| candidate | verdict | evidence |
|---|---|---|
| Created at the moment of need | **confirmed** | #180 and #191 were both charted 2026-08-01, on demand, when a foggy question arrived. Contrast: `scope-model.yaml` was assembled once, up front, as a complete census (§4). |
| Has a claim protocol | **confirmed** | every closed ticket on #180 carries an assignee set before close (table above). The realm/quest model has no per-quest claim field of any kind. |
| Frontier is computed, not curated | **confirmed** | `issue_dependencies_summary` is GitHub's own computation over native edges — nobody hand-marks a ticket "next." The realm/quest model's nearest analogue, `depends_on` in `scope-model.yaml` (read by `arcade/viewmodel.mjs`'s `tileOf`, lines 31–52), is also *computed* — but over hand-typed YAML that has not moved in 18 days (§4). Same computation shape, decayed input. |
| No model to maintain, so it cannot decay | **confirmed, and independently already ruled once** — see §5 | this is the load-bearing one; RED-2.0 ruled the general form of this exact split on 2026-07-30 before #191 existed. |
| GitHub renders it natively, no second surface | **confirmed** | #180/#191 are fully readable and actionable from `gh issue view` / the GitHub UI. Zero export step, no `refresh.mjs`, no `arcade.html` render pass. This is also the direct mechanical reason the arcade cannot show wayfinder's structure today (§3) — the two systems don't share a projection step, so nothing carries wayfinder's edges into `status.js`.

All five candidates hold up under measurement. None is refuted.

---

## 3. MEASURE — what wayfinder does NOT do that the arcade does

Ran the arcade's actual `buildViewModel()` (`C:/Users/Aaron/Documents/Repos/red-tracker/arcade/viewmodel.mjs`)
against the pinned snapshot `.snapshot-2026-08-02.js` (74 quests / 202 issues, `generatedAt`
2026-08-02T22:11:37Z) rather than inferring the result:

```
total quests: 74
inbox (unmapped-open) length: 35
#191 + all 11 children (#192–202): all 12 present in the inbox — none render as a quest tile anywhere
#180 itself + its still-open children (#185–190): also all present in the inbox
```

**This is not specific to #191.** Every wayfinder map on this repo — closed or open — is invisible to
the realm/quest view once it exists as an issue, because nothing in `scope-model.yaml` binds to it. The
"map #191 landed in the unmapped inbox" fact from the ticket brief generalizes: any wayfinder map does.

Second measurement, same script: of the 74 quests, **21 carry `status: needs-decision`, and 20 of those
21 have no `github` field at all** — pure business judgment (pricing, ad spend, positioning, country
sequencing) with nothing to bind to. **35 of 74 quests total have no `github` field whatsoever.** This
exact number was already found and named in the 2026-07-30 cross-examination
(`docs/Context/2026-07-30-tracker-usefulness-cross-examination.md:254`, verbatim):

> "The 35 GitHub-less business quests are a genuine monopoly — the whole commercial arc (pricing, CFDI,
> positioning, country sequencing, unit economics, SLA) exists in exactly one place in your system, and
> it is `docs/scope-model.yaml`. Likewise the 21 `needs-decision` quests: a larger queue than the 17
> issues, drainable only by you, held nowhere else."

**A wayfinder ticket is always a GitHub issue by construction** (SKILL.md §"The Map": "Every map and
ticket is an issue"). A scope quest is explicitly *not* required to be one. That is the one capability
gap wayfinder's model cannot close without inventing something new: it has no way to represent a decision
that will never become code and was never meant to.

The realm/quest model also carries: per-realm progress percentages (`pct`/`earned`/`total` across 7
"worlds"), a nine-state tile taxonomy (`qt-cracked`/`qt-blocked`/`qt-beacon`/`qt-shipped`/`qt-walk`/
`qt-inflight`/`qt-decision`/`qt-deferred`/`qt-todo`, `viewmodel.mjs:21-51`), and caveats attached to
already-shipped work (Foundation alone carries 4). Wayfinder's ticket vocabulary has no analogue for any
of this — a ticket is open or closed, never "73% done."

---

## 4. MEASURE — handoff docs vs. `scope-model.yaml`, verified independently

`git log HEAD -- docs/scope-model.yaml` (on `main`, not `--all` — the repo also carries unrelated `t3
checkpoint` refs under `refs/t3/checkpoints/*` that inflate a naive `--all` count with off-branch noise):

```
8181f99 2026-07-15 docs(scope-model): fold in the business + eng-process audit — 18 gap quests
58c4fc4 2026-07-14 docs(scope-model): assemble the whole-arc scope model (#120)
```

**2 commits, both from map #105's own execution session, both within 24 hours of each other. Zero since
— 18+ days, and open-issue count grew 65% in just the last 2 days of that window (per #191's own
measured table).** This matches the 2026-07-30 cross-exam's independent finding verbatim
(`...cross-examination.md:80`: *"scope-model.yaml has 2 commits in its entire history"*) — confirmed
again, 3 days and dozens of commits later, still true.

`git log HEAD -- 'docs/superpowers/handoffs/*'`: **37 commits.** Adding root `HANDOFF.md`: **39.**
Grepping commit *messages* case-insensitively for "handoff" (looser — catches `docs/Context/` and
`docs/archived-files/` handoff variants too): **45.** The ticket brief's cited "38" traces to the
2026-07-30 cross-exam's own count (`...cross-examination.md:255`, *"38 handoff/kickoff commits, each
with a 'do not redo' section..."*) — I did not reproduce exactly 38 on any single path filter I tried,
but 37–45 across three different honest filters brackets it; I'm reporting the range rather than forcing
a match. The direction and order of magnitude are confirmed: **dozens of commits vs. 2, same repo, same
17-day-plus window.**

**What the two winners share, measured, not guessed:** neither is a single persistent file responsible
for staying true to a moving target. A handoff doc is written once, at one session's end, read once by
the next session, and superseded by a *new* file next time — no handoff file in the sampled log carries
more than one authoring commit. A wayfinder ticket is created once, resolved once, closed, and never
reopened for editing. Both are **write-once receipts for a bounded, already-finished unit of work** —
not rows in a ledger that's supposed to still be accurate next month. `scope-model.yaml` and the
realm/quest view are the opposite shape: *one* file, *one* model, claiming to still be the current truth
about a 74-quest, multi-month arc — and by its own commit history, nobody has touched it since the day
after it was written, because there is no forcing function that makes staying current someone's job. The
2026-07-30 finding said it about the queue specifically; it holds for both winners: **the artifact that
survives is the one with no ongoing obligation to still be right.**

---

## 5. The load-bearing question, argued from the above

**Are realms/quests and maps/tickets the same thing at different altitude, or two different systems?**

They share a shape — a named unit of work, a dependency graph over those units
(`depends_on` in YAML vs. native GitHub edges), and a computed frontier/blocked state read off that
graph. That structural resemblance is real and is why the question is worth asking rather than dismissing.

But they diverge on the two properties that determine whether an artifact decays (§2, §4), and the
divergence is not a zoom level — it's what each is *for*:

- **The realm/quest model is a census.** It is supposed to remain a complete, current inventory of the
  whole product arc, forever — including the 35 quests (§3) that have no issue and never will, because
  they're pure judgment calls, not investigations that resolve. It does not converge; it is not supposed
  to empty out. Its correctness requires someone to keep editing one file as the territory changes, and
  the measured fact is nobody does (§4) — not because of laziness, but because nothing forces it (this is
  RED-2.0's own 2026-07-30 ruling: *"the queue needs no model, so it cannot decay"* — the census is the
  half of that sentence that CAN decay, and does).
- **A wayfinder map is a bounded investigation.** It exists to answer one foggy question, decomposes into
  a DAG sized to converge, and is *done* when the DAG is empty — #105, #112, #123, #137, #153 are all
  closed, and closing them was the point. Its frontier is disposable by design: it's a queue for right
  now, not an index of everything that could ever be known.

A census that's supposed to always be current and a queue that's supposed to empty are not the same
thing rendered at two zoom levels of one design — they are two different lifecycles, and forcing one
model to do both jobs is very likely why the realm/quest view (with its `depends_on` field and its
`qt-blocked` tile) *looks* like it could subsume wayfinder, but measurably can't: 12 of 12 issues on
this repo's most recently charted map render nowhere on it (§3), and the 35 quests with no `github`
field are the mirror problem — real content wayfinder's issue-only ticket model has no slot for either.

**Recommendation for #198, ranked:** treat them as two different systems that need two different
surfaces, not one model wearing two skins. The arcade's realm/quest half should keep the census job (it
holds the 35 GitHub-less business quests — a genuine, sole-copy asset per the 2026-07-30 finding); a
second, independently-rendered view should surface the live wayfinder DAG(s) as what they are — open
maps, their frontier, their blocked tickets — computed the same way `issue_dependencies_summary` computes
it, not hand-bound into a quest. Whether that second view lives inside `arcade.html` or is wayfinder's
existing GitHub-native rendering left alone (§2's last row: GitHub already renders it, with zero
extra surface) is exactly the open question #200/#201 are chartered to answer, and is out of this
ticket's scope.

---

## 6. What this ticket did not cover (named, not silently dropped)

- **External prior art** (Kanban, GTD, other visual/gamified trackers and what killed them) — explicitly
  #195's angle, not run here.
- **#192's vocabulary** for "how people actually run a tracker day to day" — #192 was still open/unclaimed
  at time of writing; §1's characterization of wayfinder's model ("build-system task graph with a
  computed ready-queue") is this ticket's own reading and should be reconciled against #192's answer, not
  taken as that ticket's finding.
- **Exact reproduction of "38 handoff commits"** — bracketed at 37/39/45 across three honest filters
  (§4); I did not force a fourth filter to hit the exact digit.
- **A locked ruling on §5** — this is `wayfinder:research`, not `wayfinder:grilling`; the ranked finding
  above is evidence for [#198](https://github.com/Vack99/RED-2.0/issues/198) to rule on with the owner,
  not a decision made in this ticket's name.
