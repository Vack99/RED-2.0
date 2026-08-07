# Cross-examination — is the RED tracker on a path to being USEFUL?

> Run 2026-07-30. 13 agents: 8 deliberately-diverse lenses -> 4 adversarial skeptics -> 1 synthesis.
> 76 raw findings, merged to 12 survivors + 18 refuted. 974,920 subagent tokens, 132 tool calls.
> Method: /cross-examine (rank-don't-rate, name-the-number, cite-or-drop, incumbent-is-a-candidate).
> READ-ONLY review — no tracker file was modified. The concurrent session owns red-tracker/.

## Owner rulings — 2026-07-30, on the §1 decision set

**D1 (issue body in-skin) — UNRULED. Blocks Task 1.** Until it is answered, `SPEC-panel-arbol.md` §8's
claim that the arcade answers job 5 ("read the full description without leaving the skin") is false,
and §2 Step 2 cannot start. Either add `body` to `refresh.mjs:164` and amend SPEC's "no `refresh.mjs`
change" clause, or strike job 5 from §8. Both clauses cannot stand.

**D2 (credit for unbound shipped work) — YES, but the mechanism is constrained.** Owner, verbatim:

> yes it should credit, but finding the right way is crucial, if we make it clear the fog/clouds from
> a realm that has nothing to do with the issues cleared we are going to be misleading the hole
> tracker completelly

**The constraint this imposes, and why it binds:** the 41 unbound closed issues are *unattributable by
definition* — unbound means no quest and therefore no realm. Crediting them as terrain would clear fog
and light buildings in realms that did not earn them. That makes the map lie in the **flattering**
direction, which is strictly worse than the current under-reporting: an owner who cannot trust a
cleared realm cannot trust any of them.

**Therefore: unattributed progress may be surfaced as a COUNT or a ledger entry, and must never clear
fog, light a building, or move a realm percentage.** This kills the blind-credit reading of finding 3
and confirms its stated fix (a `SIN ARCHIVAR · 41` count, not a list, not terrain). Any future proposal
to credit unbound work must show its attribution or stay off the map.

**D3 (issue↔quest binding) — MAP ONLY.** Delete the 28 dead `quest:*` declarations. **MAP** answers
*how far to the destination* from the quest model; **QUEUE** answers *what's next* from open issues.
One data source, two views, no shared row unit. The queue needs no model, so it cannot decay.
This voids finding 5's "install it properly" branch and the auto-bind-on-initiative-label branch.

*D2 and D3 are consistent: with binding deleted, no closed issue can ever be attributed to a realm, so
credit is permanently non-terrain. That is the intended end state, not a gap.*

**D4 (frozen census pins) and D5 (#175 comment correction) — unruled**; see §1. D4 gates the panel
build (closing #105 reds `realm-pct`).

## Later rulings, same session — these supersede D3 in part

**R1 — the overworld must be procedural.** Owner, verbatim:

> the realms should be saved as structures, the path as a repeatable at some point, everysingle resource
> actually prepared for when a new realm, quest or issue or whatever is added into the tracker is
> correctly showcased in the tracker.

Adding a realm/quest/issue must render with **no hand-authored art, no gate edit, no code edit**.
The constraint that makes this hard: the hand-keyed tables are *why the arcade looks good*
(`DENSITY.foundation = [1.00,1.30,false]` vs `DENSITY['growth-reach'] = [1.70,0.15,false]` are tuned
per-realm character). The design must make them **seeds/overrides over a generative fallback**, not
delete them — a new realm must look intentional on first render, and the existing 7 must stay
byte-identical so the 4 parity sha1s survive.

**R2 — agents bind at filing time and create quests when nothing fits (option B).** Owner: *"lets
prioritize tactical use."* The agent creates the quest and reports afterwards; the owner re-rules later
if they disagree. Rationale: every issue in this repo is agent-filed, so binding is a filing-time
responsibility, not owner curation. Compliance under the curation model was 0 of 84.

**Consequence for D3.** D3 ("map only — delete the dead binding") was ruled before the mechanism was
understood. R2 supersedes its *no-binding* half: binding comes back, automated. What survives from D3
is the cleanup — the 28 ghost `quest:*` labels declared in the model but never created on GitHub.

**Correction to §4 finding 5.** It states "28 declared labels appear on zero issues," which reads as
though all 35 are dead. Measured: **7 of the 35 exist on GitHub and bind 71 issues correctly**
(the phase/initiative labels); **28 are ghosts**. Outside Foundation every binding key is a ghost —
that is why nothing new maps. Separately, 3 real initiative labels
(`loading-screens-2026-07`, `single-email-activation-2026-07`, `forge-client-branding-2026-07`) carry
17 issues and are *not declared in the model*, so they credit nothing. Deleting all binding would
collapse Foundation's bars — see §6, F20/F28.

**Growth verdict (measured this session).** `index.html` is fully generic (`model.worlds.forEach` :791,
`model.worlds.map(worldHtml)` :851) — an 8th realm renders with zero edits. `arcade/overworld.mjs` is
hand-keyed by literal realm id in five structures (`BIOME` :43, `DENSITY` :55, `MAINLAND`/`JOURNEY` :299,
`PASS` :317, `FLIPS` :325) and **cannot draw a realm it has no entry for**. Every structural gate pin
(`EXPECT_QUESTS=74`, `EXPECT_SUBGROUPS=32`, worlds===7 ×3) reds when the project grows — which is why
`scope-model.yaml` has 2 commits in its entire history.

---

## Decisions of record — main session, not the agents

**`/wayfinder`: declined.** The surviving route is three `gh` label calls, one field in `refresh.mjs`,
one gate's pins split, then the existing `PLAN-panel-arbol.md`. That is a session, not a map, and
charting one relitigates the ÁRBOL ruling made 2026-07-30 16:52.

**Correction of record — `HANDOFF-tracker-skins.md` §5.0 is wrong.** It says `index.html` "contains
**zero** `github.com` links (`grep -c` → 0)" and concludes "neither skin does the tactical job".
The grep undercounts: the URL is assembled from a template at `index.html:498`
(`ghIssueUrl = (n) => ...`), which has 5 call sites feeding 9 anchor templates — the skin links every
open issue. §5.0's conclusion does not survive it. The expedition inbox is the one surface that
already does the job; port it, don't replace it.

**Re-verified here after the report landed:** `check-viewmodel.mjs:21` pins
`EXPECT_PCT = [71, 25, 18, 27, 30, 33, 0]` with the RAISE at `:37`; `SPEC-panel-arbol.md` (17:04) and
`PLAN-panel-arbol.md` (61,915 B, 17:17) exist and supersede §5.3.

---

# Cross-examination: is the tracker missing too many nails to be useful?

**Answer: yes — but not the nails the eight lenses were pointed at.** The tracker is blind to 16 of 17 open issues, and that hole is already being closed by work written *after* the lenses were briefed. The hole that survives the fix is different and smaller: the panel about to be built can show you *which* issues exist and *who* they wait on, but it cannot show you *what any of them says*. You will still leave for GitHub on every item. That is one field in one file.

---

## 0. The situation moved under the review — read this first

All 76 findings cross-examine `HANDOFF-tracker-skins.md` §5.3. Two documents supersede it, both written the same afternoon:

| file | mtime | status |
|---|---|---|
| `red-tracker/NOTES-panel-prototype.md` | 16:52 | owner walked 3 live prototypes, **chose variant B (ÁRBOL)** |
| `red-tracker/SPEC-panel-arbol.md` | 17:04 | "Supersedes §5.3… **Owner-approved 2026-07-30**" |
| `red-tracker/PLAN-panel-arbol.md` | 17:17 | 61,915 bytes, 8 tasks, executable |

*(measured — `ls -la`, files read this session)*

The spec **already adopts** what nine findings independently recommended: a pinned inbox, per-quest `openIssues`, a `wait = OWNER|AGENT|TRIAGE` axis derived from `hitl`/`ready-for-agent`, six label-based chips replacing the five status chips, walking decoupled from reading, panel default-open, and five job-shaped gates. F7, F34, F35, F36, F64, F67, F68, F70, F72 and F74 are **correct critiques of a dead spec whose fixes are already law**.

Two skeptics found this independently. Neither found the plan. What follows is scoped to what survives into the approved documents.

---

## 1. DECISION SET — only you can answer these

**D1. Does a panel row have to show what an issue *says*, or only that it exists?**
- *Show it* → `refresh.mjs` gains `body` (open issues only, stripped from closed). Measured cost: 1 field, 1 ternary, ~0.26s slower refresh, `status.js` 67,643 → ~121,000 bytes. It breaks the spec's own written "No `refresh.mjs` change" clause, which you must amend.
- *Don't* → strike job 5 ("Read the full description without leaving the skin") from SPEC §8's claim that the arcade answers 1–8. The tracker stays a bookmark list: every "what next" decision costs a round trip to github.com, ~16 of them today.
- **You cannot have both clauses.** They are in the same document. (§2, finding 1.)

**D2. Does the map get credit for shipped work it isn't bound to?**
- *Yes* → 41 closed issues (four whole releases: loading-screens, single-email-activation, reservation-truthfulness, the arcade itself) currently credit nothing. The spec's inbox is `state === OPEN` only, so they stay invisible after it ships.
- *No* → accept that every percentage on the map under-reports the distance travelled, permanently and increasingly. Under your own model ("the trophy is the project, the game is buildings built"), this is the error pointing the wrong way.

**D3. Do you want issue↔quest binding at all, or is the quest model a destination map only?**
- *Binding* → someone must apply a label on every filed issue. Measured compliance to date: **0 of 84** issues filed since the model was written. And even at 100% compliance, 17 open issues over 74 quests = 0.22 per quest, so ≥57 rows stay empty forever.
- *Map only* → delete the 28 dead `quest:*` declarations, stop pretending the bars track the frontier, and let the inbox be the queue. This is what the arithmetic supports and what the spec de facto chose.

**D4. Does the frozen census gate stay byte-for-byte?**
- *Stays* (SPEC §1's written commitment) → **closing #105 turns your build red.** #105 is the tracker's own acceptance gate. Foundation goes 10/14 = 71% → 11/14 = 79% against a pinned `EXPECT_PCT[0] = 71`. Shipping breaks the test suite, and the cheap repair is re-freezing the numbers — which is exactly how 63 statuses froze in the first place.
- *Derives* → structural pins stay literal (74 quests / 32 subgroups / 7 worlds); census pins become internal-consistency assertions (`pct === round(earned/total*100)`). Costs one edit before the panel build; unblocks four other fixes.

**D5. Is a 5-line correction to #175 worth doing before anything is posted?**
The draft comment queued for #175 says index.html "has zero GitHub links". It renders ~69 anchors and links **every one of the 17 open issues**. `grep -c "github.com" index.html` returns 1 because the URL is assembled from a template at `index.html:498-499`. PLAN Step 8 already flags this — confirm it, so a false premise never enters the decision record.

---

## 2. RECOMMENDED ROUTE — earliest step first, ordered by usefulness-per-hour

**Step 1 — 30 seconds, no code, do it today.** Label `#166 #167 #168`. Three issues carry no labels at all, filed 2026-07-29 in one batch. Two are live billing defects: *"Late roster-marking charges the wrong package"* and *"attended_since_purchase undercounts by design"*. They are invisible in the arcade, untagged in the other skin, and 2 days old. This report spent 76 findings on a tracker and one paragraph on the production money bug the tracker failed to surface. Fix the bug's visibility before fixing the surface.

**Step 2 — one line, before the panel build.** Add `body` (open-only) + `createdAt,updatedAt` to `refresh.mjs:164`, and amend SPEC's out-of-scope clause. This is the only change that makes SPEC §8's own claim true. Do it *before* Task 1, not after, or the panel ships and fails its walk on the same axis for the third time.

**Step 3 — before the panel build.** Split `check-viewmodel.mjs`'s pins (D4). Otherwise Task 1's first green run is followed by a red suite the moment you close #105.

**Step 4 — the panel build.** Execute `PLAN-panel-arbol.md` as written, plus one amendment: the inbox row must expand to the issue body, not just link out. That is where 16 of 17 live items are.

**Step 5 — after the walk, not before.** Extract the shared derivation (`core/tracker-core.mjs`). Justified now, not speculatively: the two skins **already disagree** about 5 quests, and the panel prototype wrote copy #5 of the derivation this afternoon and said so in writing.

**Do not do first:** milestones (covers 13 of 74 quests, none of the last 100 issues), a local write server, saved views, effort estimates, a scheduled weekly nudge, a status.prev.js archive, or a `next:` list in the yaml. All were proposed; none clears the bar at 17 open issues.

---

## 3. The three gating adjudications

### (i) Is the §5.3 proposal the right next build? — **AMENDED, and it already is.**
§5.3 as the lenses read it is dead. `SPEC-panel-arbol.md` is its owner-approved successor and it is a materially better spec: it adds the inbox (the fix nine findings demanded), reads the labels both skins throw away, and gates the partition. Two amendments before Task 1: **(a)** `refresh.mjs` gains `body`+dates, or §8's job-5 claim is struck; **(b)** SPEC §1's "census stays byte-for-byte" is replaced with derived consistency assertions. Everything else in the plan should be executed as written.

### (ii) "The data is already there — this is rendering work, not a data change." — **FALSE, and still false in the approved documents.**
`status.js` carries exactly `{closedAt, labels, number, state, title}` on 179 of 179 issues (measured, no exceptions). The plan's `issueRow(c)` renders a wait tag, `#N`, and the title. `questBody(q)` renders `q.what` — the 147-character hand-written quest blurb, average, against 3,110-character issue bodies. For the 16 inbox issues there is no quest and therefore no `what` at all: the panel will show a title and an arrow out. The claim is **true for the labels/inbox/wait-axis half** (those are genuinely in the snapshot — nine findings correctly sized that at ~30 lines) and **false for the reading half**, which is the half you asked for by name in §5.2.

### (iii) Skin contract: document, gate suite, or shared module? — **All three, in this order: shared module → gate suite → the document as a by-product.**
- A **document alone cannot hold.** Proof from inside this project: `arcade/CONTRACT.md` is 216 lines of pinned interfaces and module ownership, and the newest file in its own directory re-implemented the derivation anyway and admitted it in writing ("copied, not improved"). That is six copies before skin #3 is specified.
- The **gate suite must be a new kind of gate.** Copying the arcade's pattern imports a suite that reds when the project advances (D4). The distinction to write down and enforce: **PARITY gates** (frozen sha1s, frozen census) are per-skin regression locks and must never be cited as job coverage; **JOB gates** assert relations true for *any* snapshot ("every open issue appears in exactly one of a quest's openIssues or the inbox", "blocked quests name their blockers", "both skins agree per-quest"). SPEC §6 already writes five job gates — it is half-implemented; name the split explicitly.
- The **module is what makes the gates possible.** The eight jobs are interrogative and ungatable as prose; over a shared core they become set-containment assertions that pass or fail today with no judgement.

---

## 4. Ranked findings — merged, worst first

Every number below is measured unless tagged. Duplicates merged; refuted items are in §6.

---

**1. The approved spec promises reading and the plan cannot deliver it — job 5 is unmet for 16 of 17 open issues.**
SPEC §8: *"`arcade.html` after this spec answers 1–8"*, where job 5 is *"Read the full description without leaving the skin."* SPEC "Out of scope": *"No `refresh.mjs` or `scope-model.yaml` change."* `PLAN` line 338's `issueRow(c)` renders `[wait tag] #N [title]`. Line 354's `questBody(q)` renders `q.what`. No issue body exists anywhere in the pipeline.
**Breaking point: n=1 — the first inbox row you open.** 16 of 17 open issues are in the inbox, which has no quest and therefore not even a blurb. Ratio: 10,861 chars of hand-written quest blurbs (74 × avg 147) rendered, against 52,862 chars across the 17 open issue bodies hidden — 21:1 per item.
**The §7 framing lesson is repeating one layer deeper: the spec was graded against itself.** Fix: `refresh.mjs:164` → `number,title,state,labels,closedAt,body,createdAt,updatedAt`, then `i.state === 'OPEN' ? i.body : undefined` before serialising. Measured: 67,643 → ~121,000 bytes, +0.26s. Drop `url` (derivable) and `assignees` (solo repo, none exist).

**2. Closing #105 turns the tracker's own build red — and the spec pins that in place.**
`check-viewmodel.mjs:21` pins `EXPECT_PCT = [71,25,18,27,30,33,0]` and RAISEs on deviation. Foundation holds 14 quests; `scope-tracker` carries no hand status and its only open bound issue is #105. Closing it → 11/14 = 79% ≠ 71 → `realm-pct` fails. #105 is the issue held open for your "in use" walk. SPEC §1 commits: *"check-viewmodel's frozen census stays byte-for-byte."*
**Breaking point: n=1 issue, and it is the named one.** Reproduced independently by two skeptics; pins and quest counts verified by me this session.
**Why it outranks its severity:** the repair path of least resistance is re-pinning the numbers, which is the same mechanism that froze 63 statuses. A gate that reds on progress teaches you to mute gates.

**3. The model froze at issue #122 — 57 issues bind to nothing, and the spec fixes only the open half.**
Max enumerated issue in `scope-model.yaml` = 122; repo high = 179. Unbound: **57 total — 41 CLOSED, 16 OPEN** (measured this session). `git log -- docs/scope-model.yaml` returns 2 commits ever, newest 2026-07-15. Rate: ~3.8 issues/day of drift.
The spec's inbox is `state === OPEN`, so the 41 closed stay silent: four entire shipped releases credit no bar. **The error points the flattering way** — the map says you are further from the destination than you are, which directly contradicts "the trophy is the project."
**Breaking point: crossed on 2026-07-16 at issue #123; 57 issues later it is 31.8% of repo history.** Cheapest fix: a `SIN ARCHIVAR · 41` **count**, not a list — 41 rows of finished work is noise. Do not hand-add ranges: any binding edit moves `closed/total` and re-baselines the census, and `refresh.mjs:135-137` `die()`s writing *nothing* on a double-bound number, taking the tracker offline rather than degrading it.

**4. A hand-typed string outranks live GitHub on 63 of 74 quests, and both checkable cases are wrong.**
`arcade/viewmodel.mjs:215` — `q.status || ghStatus(gh) || 'todo'` (identical at `index.html:555-557`). Measured: 63 hand statuses, 11 GitHub-derived, of which 10 resolve `shipped` — **the map's single live-driven tile is #105, the tracker's own map issue.** Per world: foundation 3/14 hand-typed; the other six realms 8/8, 11/11, 15/15, 10/10, 9/9, 7/7 — **100%**. Nothing you do in GitHub can move six of seven realms.
Both quests where the sources can be compared disagree: `backdate-sold-date` reads `in-flight` with #112–#118 all closed (13 days); `attendance-ledger-ruling` reads `needs-decision` with #89 closed. **2 of 2 = a 100% error rate on every claim the map makes that can be checked.**
**Fix — take the version that breaks no gate:** expose *both* `status` and `githubStatus` plus a `stale` flag and render the disagreement. A bare precedence flip moves realm percentages and reds `realm-pct` + `realm-beacons`, so it must ship with finding 2's fix or not at all. The stale-flag gate starts failing at 2, which is the correct starting state.

**5. The `quest:*` binding was never installed — 28 declared labels do not exist on the repo.**
`gh label list --limit 200` returns 29 labels; **zero** are quest-prefixed. `scope-model.yaml` declares 35 labels, of which 28 are `quest:*` (all absent) and 7 are legacy phase labels (all present, all on closed issues). Verified this session: **28 declared labels appear on zero issues.** README's headline growth path — *"Tag an issue with a quest's `quest:*` label — it auto-joins, no edit"* — has never been executable.
Compliance since the model shipped: **0 of 84 issues.** The rule is documented in `docs/superpowers/wayfinder/*.md` (a wayfinding archive nothing reads at file-time) and appears **zero times** in `CLAUDE.md`, `AGENTS.md`, `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md` — the four files on the filing path, one of which mandates the *inverse* convention (a fresh initiative label per effort, never reused).
**Consequence nobody else caught:** a composer link prefilled with `?labels=quest:observability` cannot apply a label that does not exist, so every issue created from the panel lands straight in the inbox — the write path would make the pile worse.
**Do not create the 28 labels.** Delete the dead declarations. If binding is wanted later, the only proposal that costs you nothing is teaching `refresh.mjs` to treat any `*-YYYY-MM` initiative label as a binding key — which would have auto-bound `loading-screens-2026-07`, `single-email-activation-2026-07` and `forge-client-branding-2026-07` with zero action. *(Note the hidden cost: auto-created quests fail four pinned gates — `world-count`, `quest-total`, `subgroup-total`, `shortlabel-overrides-coverage` — so it is blocked behind finding 2's fix.)*

**6. Three open issues carry no label at all, and two are live billing defects.**
`#166 #167 #168` — labels `[]`, all filed 2026-07-29 within seconds of each other, from one analysis session. Titles: *"Late roster-marking charges the wrong package"*, *"attended_since_purchase undercounts by design"*, *"Same-context repeat visits need UI + undo"*. The rest split 5 `hitl` / 8 `ready-for-agent`; `#105` carries only `wayfinder:map`.
**Breaking point: 4 of 17 (24%) of the open set is unroutable today**, and the failure mode ("an analysis session dumps issues and nobody triages") recurs every analysis session — including this one.
Two actions, unbundled: label them now (three `gh issue edit` calls); and make the spec's `TRIAGE` bucket **structurally unfilterable**, which SPEC §3 does not currently state — its `TODO` chip always-matches, which is not the same guarantee.

**7. 74 quest rows against a steady-state of ~17 open issues — ≥57 rows are empty forever.**
0.22 open issues per quest. Throughput: 84 issues created in 16 days at an 81% same-window close rate; modelled steady-state open ≈ 17, matching the observed 17. **Even at 100% labelling compliance the majority of rows hold nothing.**
This is the arithmetic that kills every "label harder" fix in the report, and it is the honest justification for the spec's shape: the **MAP** answers *how far to the destination* from the quest model; the **QUEUE** answers *what's next* from open issues; one data source, two views, no shared row unit. The queue view needs no model at all, which is why it cannot decay. *(modelled — inputs measured: 74 quests, 17 open, 84 created since 2026-07-14.)*

**8. The default skin never shows how old its data is.**
`track.bat:15` runs `start "" arcade.html`. `generatedAt` appears in `arcade.html` at exactly three sites — a destructure, a return, and a localStorage baseline — and is **rendered zero times**. `index.html:831` renders it, with no escalation by age. Neither skin re-fetches (0 `fetch`/XHR/EventSource in both).
**Breaking point: 0 hours.** A 10-minute-old and a two-week-old snapshot render pixel-identical in the skin the launcher opens. A stale map that admits it is stale costs a refresh; one that doesn't costs a session. Reuse `index.html`'s existing `relTime`, seat it in unscaled chrome (the scaled badge layer is gated at one transient node and forbidden from covering tiles), amber past 2h. *Adjacent rot:* `README.md:13-14` still says `track.bat` opens `index.html`.

**9. The derivation exists in six copies, and two skins already disagree about the same fact on 5 quests.**
Copies at `index.html:501-581`, `census-a1.mjs:22-66`, `proto-a8-interior/gen-data-a8.mjs:22-47`, `arcade/viewmodel.mjs:11-52+188-228`, `PROTOTYPE-panel.html:196,210`, plus a sixth range-expander in `refresh.mjs:47`. `viewmodel.mjs:6` names three of its own prior homes in a comment; `NOTES-panel-prototype.md` admits copy #5 verbatim.
The drift is no longer hypothetical: `index.html:573` gates threads on `status === "shipped"`; `viewmodel.mjs:34/51` does not. **Five quests render a different AVISOS answer depending on which skin you open** — `platform-commercial-site`, `member-payments-online`, `caching-perf-strategy`, `sales-demo-motion`, `local-payment-methods` (7% of the map, reproduced by three separate agents).
**"They both are the tracker" is currently false at the fact level.** The cheapest new assertion in the whole review is a cross-skin equality gate, and it fails today. *Cheaper than feared:* `gen-arcade.mjs` discovers its module graph by following relative imports, so a core is inlined into `arcade.html` with zero build config and no second script tag.

**10. No write path, and job 8 is claimed and forbidden in the same document.**
SPEC §8 asserts the arcade answers 1–8 (job 8 = "Create a new issue"); SPEC "Out of scope" says "No write path beyond a link to GitHub's issue composer". `file://` permits navigation out and nothing else — 0 `fetch`, 0 XHR, 0 EventSource in both skins, and `status.js` loads as a classic `<script>` precisely because that is what an opaque origin allows.
The composer link alone is **net-negative**: the created issue is invisible to the page that made it, and (finding 5) lands unmapped, so the inbox goes 16 → 17. It converts "cannot create issues" into "creates issues that vanish". Ship a ~10-line dirty-flag banner with it, or downgrade job 8 in §8 explicitly. Do not build a local server — it breaks the no-server promise and turns a one-gesture launcher into a process you manage.

**11. `createdAt`/`updatedAt` are free and unfetched — but worth less than three lenses claimed.**
Cost: +12,530 bytes (+18.5%), the cheapest field in the audit. **12 of 17 open issues have `createdAt === updatedAt`** — untouched since filing. But the decay argument does not survive measurement: max open-issue age is **15 days** (#105), median 1 day, 11 of 17 filed within 48 hours, against the 30-day threshold the staleness argument itself cites. And issue number is **perfectly monotonic with createdAt** across all 17, while `index.html:809` already sorts by `b.number - a.number` — so the age ordering already exists and is already rendered. Add the fields for a readable badge; strike the "backlog is rotting" framing. **This backlog is churning, not rotting.**

**12. The queued #175 comment contains a false statement about the working skin.**
The draft says `index.html` "has zero GitHub links". It renders ~69 anchors — 13 quest links, ~40 evidence links, 16 inbox rows — reaching 49 distinct issues **including all 17 open ones**. `grep -c "github.com" index.html` = 1 because the URL is built from a template at `index.html:498-499` (verified this session). PLAN Step 8 already catches it. **The correction flips the remedy's direction** from "replace both skins" to "port the working inbox into the arcade" — which is what the spec chose anyway.

---

## 5. Genuinely sound — with evidence, ranked against the rest

Ranked below the findings above, because none of them is what's costing you a session — but three of them are load-bearing and must survive the rework.

1. **`refresh.mjs`'s validation seam is the best engineering in the tool.** It rejects duplicate quest ids, an issue bound by two quests, malformed ranges (`start > end`), unresolvable `depends_on` targets and invalid status strings — naming the offender and exiting non-zero **without writing `status.js`** — then writes temp-then-rename so a crash cannot tear the snapshot. `track.bat` checks `errorlevel` and refuses to open a stale page. A malformed model cannot render as nonsense, and an offline run cannot silently serve a stale view. Its only hole is label existence, and that hole is unfixable within the one-call design (from a single `gh issue list`, "exists but unused" and "does not exist" are the same observation).
2. **The historical half of the map is completely trustworthy.** Every enumerated Foundation bar matches reality: 9/9, 7/7, 12/12, 7/7, 12/12, 16/16, 19/19, 18/18. The problem is exclusively at the frontier.
3. **The one-`gh`-call, no-network-at-render, `file://` design is right and should survive any rework.** 1.03s for all 179 issues, one npm dependency, one double-click to launch. Two proposals in this report casually traded that launcher for a managed process; nobody priced what that costs a solo owner. It is an asset, not a limitation to route around.
4. **`index.html`'s unmapped inbox is the single most useful surface in either skin and the handoff misjudged it.** It computes open ∧ unbound ∧ unlabelled, renders all 16 with number, title, real labels and a working link, and states the right invariant. It is the only place in the entire tracker where the `hitl`/`ready-for-agent` distinction reaches the screen. Its gaps are ordering and position, not capability.
5. **The `AVISOS` honesty discipline is real engineering.** Caveat texts are rendered verbatim with attribution; the two counts are kept separate and labelled by source; the fallback arm refuses to render "no hay avisos" when texts are missing and says where they live instead; `buildDistrictModel` counts caveat *texts* not caveat-bearing quests, with a comment explaining that the other choice would under-report. That is a codebase that takes not-over-claiming seriously.
6. **The gate machinery is good; what it asserts is the problem.** Assertions are mutation-proved, they RAISE with named failures, and `check-panels.mjs` is a 1,092-line headless DOM-stub harness across all 7 realms. That is exactly the machinery a cross-skin job gate needs.
7. **The 35 GitHub-less business quests are a genuine monopoly** — the whole commercial arc (pricing, CFDI, positioning, country sequencing, unit economics, SLA) exists in exactly one place in your system, and it is `docs/scope-model.yaml`. Likewise the **21 `needs-decision` quests**: a larger queue than the 17 issues, drainable only by you, held nowhere else. SPEC §3's `TE TOCA A TI` chip is the first thing in this project's history that points at them — and nobody evaluated it.
8. **The handoff discipline is why the loop works without the tracker.** 38 handoff/kickoff commits, each with a "do not redo" section, an ordered next-steps section, and — in the 2026-07-30 case — an explicit trap list naming four ways the next session's test would produce a confident false result. Any tracker proposal should be measured against *that* artifact, not against the other skin.

---

## 6. Refuted — criticisms that could not be supported, logged and cut

| finding | why it is cut |
|---|---|
| **F56** beacons/earned divergence | **Measured false.** `viewmodel.mjs:275` maps over the *built* worlds array, so `q.status` there is already `effectiveStatus`. Beacons === earned for all six non-foundation worlds (2/2, 2/2, 4/4, 3/3, 3/3, 0/0). The predicted "realm climbs to 100% with zero beacons" cannot occur. |
| **F43** "neither skin persists a visit marker" | False. `arcade/shell.mjs:16` defines `LASTSEEN_KEY = 'arcade.lastSeen'`; `:910-912` writes `{generatedAt, worlds}` on every load. The substrate exists; only the issue-set diff is missing. |
| **F13** AVISOS = comments | AVISOS has never been comment-based — it reads quest `caveatTexts` in the handoff, the spec, and both skins. The 93%-hit-rate consequence targets a feature nobody proposed. *(Its cost measurements survive as a reason to rule `comments` out permanently: 17.9× payload, ~4.3× wall time.)* |
| **F16** "what did I touch / my branch's issues" | Manufactured requirement — absent from your four asks and all eight jobs. Fails substitution: true of every issue tracker. |
| **F18** "how big is this" | Same. Its own conclusion is "drop it from scope" — it concludes it is not a finding. |
| **F44** saved views | Fails the need test at n=17. You have not used the six chips that do not yet exist. |
| **F45** WIP limits / effort estimates | The 35/18 agent caps are a per-session spend budget, not a backlog property. 74 more hand-typed strings joining the 63 that froze. Self-refuting ("hasn't bitten yet"). |
| **F46** scheduled weekly triage nudge | Rot premise contradicted: 68 issues created and 162 of 179 closed in the window. The unmapped count is monotonic because the *binding* is dead, not from neglect — a nudge binds nothing. Sourced to a vendor blog, not primary. |
| **F11's** lazy per-row fetch | Architecturally impossible from `file://` (0 fetch capability, verified). It also prices all 179 bodies against a feature that needs 17. |
| **F75's** second `gh` call | Identical output to the one-call strip, but breaks the pipeline's stated single-call invariant. Two mechanisms, same result — the one that breaks a constraint loses. |
| **F20/F28-step-4** "delete the `github.issues` ranges" | **Self-refuting.** Those 13 quests are the *only* source of GitHub-derived status; 11 carry no hand status. Deleting them collapses foundation's earned count and reds `realm-pct` on all seven realms. |
| **F26's** "2.3× slower" | `--state all` vs `--state open` are different queries and the bars require closed issues. 0.5s once per launcher double-click is not a defect. *(Its machinery-ratio point survives.)* |
| **F2/F29's** "documented nowhere in the repo" | False — 33 hits across four tracked files, incl. `docs/superpowers/wayfinder/2026-07-14-T2-scope-model-schema.md:133` stating the auto-join rule verbatim. The conclusion survives on corrected evidence: absent from all four *filing-path* docs (verified 0/0/0/0). This strengthens the case *against* documenting it again — in-repo documentation already existed for 16 days and produced 0/84. |
| **F48's** "exactly one quest renders in-flight" | Two do (`backdate-sold-date` hand-typed, `scope-tracker` derived). Supporting facts survive; headline sentence does not. |
| **F25's** substitution kill on the progress argument | Overreaches. Milestones can only hold GitHub issues; they cover 13 of 74 quests and none of the 35 business quests. They replace *part* of the tracker. |
| **F21's** "29 quest labels" | 28. (35 declared − 7 legacy.) Immaterial to the conclusion. |
| **F17's** "8 of 17 untouched" | 12 of 17. Correction in the finding's favour. |
| **F52's** 75.4 KB baseline / 7.9× | `status.js` is 67,643 bytes on disk. The ratio is 8.9×. |

---

## 7. Confidence ledger

**Measured by me this session:** the superseding spec and plan exist and their contents (file reads); `issueRow` renders title-only and `questBody` renders `q.what` (PLAN:184, 338, 354); 179 issues / 17 open / 3 unlabelled / 5 `hitl` / 8 `ready-for-agent`; 74 quests / 63 hand statuses / 35 with no `github` block / 14 foundation quests; max enumerated issue 122; 57 unbound (41 closed, 16 open); 35 declared labels of which 28 appear on zero issues; `EXPECT_PCT = [71,…]` pinned with RAISE; `grep -c "github.com" index.html` = 1 against `ghIssueUrl` at `:499`.

**Measured by lenses and reproduced by ≥2 skeptics:** all 179 issue records carry exactly `{closedAt, labels, number, state, title}`; body payload 529,504 bytes all / 53,344 open-only → `status.js` ~121,628; `gh issue list --state open` 0.48–0.52s; refresh 1.03–1.10s baseline, +0.26s with `body`; 9,001 lines of tracker code; `arcade.html` 299,613 bytes against a 614,400 cap with `status.js` ungated; 0 milestones; 0 native issue-dependency edges across 17 open issues; 0 sub-issue parents on all 16 unmapped; closing #105 reds `realm-pct` (two independent simulations); the 5 divergent AVISOS quests (three independent derivations); 69 anchors in `index.html` reaching 49 distinct issues.

**Modelled:** steady-state open population ≈17 and the ≥77%-empty-rows conclusion (inputs measured); the ~2,100px inbox scroll; the ~40–50-open-issue point where one screen stops working; core-extraction line counts.

**Asserted, not sourced:** that the owner has not opened the tracker in 15 days (inferred from #105's `updatedAt`, zero handoff citations, and zero `scope-model.yaml` commits — no direct observation); that the ordering `SIN TRIAGE → TE TOCA A TI → LISTO PARA AGENTE` matches how you actually prioritise; that beauty is currently *met* (the #176 walk failed on usefulness, not looks — which implies the aesthetic passed, but nobody looked at a rendered page).

---

## 8. Could not determine — and the experiment that settles each

| open question | experiment |
|---|---|
| **Has the tracker ever actually been opened?** The single most load-bearing premise in this review, and every argument for it is a proxy. | Read `localStorage['arcade.lastSeen']` from your Chrome profile — `shell.mjs:910` has been writing `{generatedAt, worlds}` on every load since the arcade shipped. One key, dated, first-party. Also: `status.js` mtime history between 2026-07-15 and 2026-07-29. |
| **Does 17 open issues need a tool at all?** | Track the open count weekly for 4 weeks. If it never trends past 25, the honest build is "add `body` + dates, port the inbox, render the timestamp, stop." |
| **Can a `file://` page reach `api.github.com`?** GitHub's REST API sends permissive CORS. If yes, the whole write-path analysis is wrong and gets cheaper. | Open `arcade.html`, console: `fetch('https://api.github.com/repos/Vack99/RED-2.0')`. |
| **Does the composer URL silently drop a nonexistent label?** | Open `/issues/new?labels=quest:observability` once and look. |
| **Would the labels have been applied if they existed?** No counterfactual exists — the mechanism was never installable. | Create the 28, add the line to `issue-tracker.md`, measure over the next 20 issues. *(Not recommended — finding 7's arithmetic says the payoff is capped regardless.)* |
| **Does the panel's `panel-inbox-partition` gate pass vacuously?** Today 16 of 17 open issues land in the inbox, so the partition is nearly trivial. | Mutation-prove it against a synthetic snapshot where a quest binds an open issue. PLAN §6 already warns "watch for vacuous passes" — hold it to that. |
| **What does the tracker cost end-to-end?** Only the `gh` call was timed (1.03s). YAML validation + 299 KB parse + first paint are unmeasured. | Time `track.bat` from double-click to readable page. |

---

## 9. Blind spots — what this whole evaluation did not examine

- **Nobody opened either skin in a browser.** All eight lenses read source. Every claim about what appears on screen, how it feels, how far you scroll, and whether it is beautiful is inferred. The one constraint you named as non-negotiable — "I will not use an ugly tool" — was assessed by nobody, and three findings proposed reductions that would destroy the visual layer while a fourth argued aesthetics is its only surviving justification.
- **Nobody priced doing nothing.** 76 findings, ~60 proposed fixes, zero estimates of the cost of inaction. In the 15 days the tracker has been broken you shipped 68 issues, closed 162 of 179, and landed five releases. The measured cost of the breakage this month is **zero**. Every severity claim should have been stated against that baseline.
- **Nobody costed your attention against n=17.** Against seventeen items that fit on one screen, the report proposed a headless core, a dual-emit packaging gate, a local write server, a scheduled agent, a saved-view primitive, effort estimates, 28 labels, milestones, a snapshot archive, a URL state contract, and a skin-check harness. "Is *any* build justified at this scale?" was asked by nobody.
- **Nobody asked what happens when a quest is *done*.** All 76 findings attack the read path. The only way to mark a quest built is to hand-edit `scope-model.yaml`, which has happened twice in the file's history. Under your own model, the one moment that should feel earned is the one that requires opening a text editor. The 61 quests carrying the business arc have no mechanism at all.
- **Nobody pinned the snapshot.** `status.js` was rewritten at 16:40 by a concurrent session and is overwritten with no archive. Every lens mixed two clocks — counts from the snapshot, timings and labels from live `gh` — without declaring which. Reproducibility of this review rests on a file nobody copied. Cost of the fix: one `cp`.
- **`red-tracker/` has no test script and is not a git repo.** `package.json`'s only script is `refresh`; the six gates run only when a human types the command. Every lens treated "gates must stay green" as hard; it is an unautomated convention. That makes every fix cheaper than assumed *and* means gate rot is invisible.
- **Unexamined surfaces:** GitHub Projects v2 (token lacks `read:project`); `arcade/overworld.mjs` and `interior.mjs` (125 KB, unread by any lens); the 162 closed issues as evidence of what prioritisation looked like when binding worked; whether `index.html`'s derivation diverges from the arcade beyond the 5 AVISOS quests; the ~50 other `docs/Context` files; and the eight lenses did not read each other.
- **A second honesty bug in the shared derivation that only one skeptic caught:** `index.html:549` and `viewmodel.mjs:211` both return `'todo'` when `gh.closed === 0` with open issues bound. A quest with eleven bound issues, all open and all in flight, renders identically to one nobody has started. Same one-line class of fix as the `total === 0` sibling. Latent today only because `scope-tracker` happens to be 10/11 closed.

---

## 10. Exit triggers — every "keep" in this report carries one

| keep | exit trigger |
|---|---|
| The tracker at all | **#105 still OPEN on 2026-08-31** (32 days from now) → the acceptance walk has not happened in 47 days; cut the issue-tracking half and keep `scope-model.yaml` as a committed strategy doc. |
| The quest model / business arc | **Re-read on 2026-10-31: if `scope-model.yaml` still has ≤3 lifetime commits AND ≥18 of the 21 `needs-decision` quests are unchanged** → the business arc is a document, not a tracker; move it to `docs/` and delete the 35 questless rows. |
| The arcade's visual layer | **`arcade.lastSeen` shows <3 opens in the 14 days after the panel ships** → the aesthetic is not buying adoption; freeze the arcade and put the reading surface in the cheaper skin. |
| The ÁRBOL plan | **A second post-build walk fails on usefulness** → no further skin work for 30 days; the problem is not the renderer. |
| One-`gh`-call `file://` design | **Refresh wall time exceeds 3.0s** (today 1.03s) or a second job needs a live origin → revisit `serve.mjs`. |
| `status.js` in one omnibus payload | **Exceeds 250,000 bytes** (today 67,643; ~121,000 after `body`) → add a size cap to `check-emit`, which today stats `arcade.html` only. |
| Quest-level `depends_on` as the sole BLOQUEADO source | **GitHub's native tracked-issue edge count exceeds 0 on ≥5 open issues** (today 0/17) → migrate to the native field. |
| The frozen structural pins (74/32/7) | *undecided — the census pins must become derived assertions (D4), but whether the structural pins also derive is a question only the OWNER can answer, because it trades "the model cannot change silently" against "the model can grow without a gate edit."* |
| Deferring the core extraction until after the walk | **A third copy of the derivation is written, or the cross-skin divergence exceeds 5 quests** → extract immediately; the drift is compounding. |

---

## 11. Draft audit

Swept my own text for the six shapes. Four caught, quoted with the rule:

1. **Adequacy claim with no number.** Cut: *"The validation seam is solid engineering."* — replaced with the enumerated list of what it rejects and the temp-then-rename write, because "solid" is a rating, not a rank or a measurement. **(Rule 1: adequacy claim with no number.)**
2. **Keep with no numeral exit trigger.** Cut: *"Keep the arcade's visual layer — that is the part that earns its keep."* — a bare keep. Replaced with the `arcade.lastSeen` <3-opens-in-14-days trigger in §10. The structural-pins row is the one keep I could not set a threshold for, and it is tagged `undecided` and routed to you rather than given a number I invented. **(Rule 2.)**
3. **Support that survives the substitution test.** Cut: *"The tracker's cost is code volume — 9,001 lines wrapping one API call."* Swap "RED tracker" for any game-styled UI and the sentence still holds, so it was never support about this subject. Kept only the specific consequence: gates that red on progress cost a rewrite per owner ruling. Also cut the whole "gh CLI does 5 of 8 jobs in 0.5s, adopt the incumbent" thread as a *recommendation* — it fails the same test the moment you note that `refresh.mjs` **is** `gh issue list`, so "adopt the incumbent" describes the existing architecture. **(Rule 3.)**
4. **Load-bearing claim with neither a source nor an escape tag.** Cut: *"The owner has not opened the tracker in 15 days."* — stated flatly in my first draft, it is an inference from three proxies with no direct observation. Moved to the ledger's `asserted` row and paired with the `arcade.lastSeen` experiment in §8. **(Rule 4.)**

**Not caught:** rule 5 — the ranked list holds 12 findings, above the floor of 5, so no count-and-reason line is owed. Rule 6 — this evaluation is not a research plan. It **established**, by direct measurement this session: `status.js` carries no issue body on 179 of 179 records; the plan's `issueRow(c)` renders exactly `[wait][#N][title]` and `questBody(q)` renders `q.what`; 28 of 35 declared quest labels appear on zero issues; 57 issues bind to nothing (41 closed, 16 open) against an enumerated ceiling of #122; `EXPECT_PCT[0] = 71` is pinned against a foundation of 14 quests whose 11th earns on #105's closure. Those are facts, not questions.