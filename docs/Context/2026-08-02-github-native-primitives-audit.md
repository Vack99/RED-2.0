# GitHub-native primitives audit — the unexamined incumbent

> Resolves #193 (part of map #191). Method: `finding-the-standard` — MEASURE what is
> actually true in this repo today, RESEARCH what GitHub's own docs and history say,
> rank the incumbent honestly, never infer a number that can be queried.
> Scope: sub-issues, issue dependencies, milestones — measured live via `gh api`
> (`repo` scope). Projects v2 — researched from documentation only; live measurement
> is blocked on a missing token scope, recorded in full under §5.

## 1. MEASURE — native sub-issues + dependencies, live on this repo, today (2026-08-02)

**Both maps use native sub-issues.** `GET /issues/{n}/sub_issues` confirms map #180 has
9 children (181–189) and map #191 has 11 children (192–202) — the parent/child edges
the issue body cites are real and load-bearing, not aspirational.

**Blocking edges, recounted from source, not inherited:**

| map | children | edges claimed in #193 (dated 2026-08-01) | edges measured today, via `/dependencies/blocked_by` + `/blocking`, deduplicated |
|---|---|---|---|
| #191 | 192–202 (11) | 12 | **12 — confirmed exact.** Full edge list: 192→198, 193→198, 194→198, 195→198, 196→200, 197→201, 198→199, 198→200, 198→201, 199→202, 200→202, 201→202. |
| #180 | 181–189 (9) | 12 | **10 — one day's drift.** Full edge list: 181→187, 182→187, 183→187, 184→186, 184→187, 185→186, 185→187, 186→187, 187→188, 187→189. |

The #180 discrepancy is not a measurement error — it's the honest result of measuring a
live thing twice on different days. Both counts are internally consistent (REST's
`blocked_by` and `blocking` lists cross-check exactly, and each matches the
`issue_dependencies_summary.total_blocked_by` field independently — see below). Two
edges present on 2026-08-01 are gone today. This *strengthens* the issue's own claim
that these are load-bearing, actively-maintained data, not a static fixture someone
set once and forgot.

**The API exposes this for free, on the call the tracker already makes — with one
caveat.** `GET /repos/{owner}/{repo}/issues` (list) and `GET .../issues/{n}` (single)
both return, on every issue, with only `repo` scope (no `read:project` needed):

```json
"issue_dependencies_summary": {"blocked_by": 2, "blocking": 2, "total_blocked_by": 6, "total_blocking": 2},
"sub_issues_summary": {"completed": 0, "percent_completed": 0, "total": 0},
"parent_issue_url": "https://api.github.com/repos/Vack99/RED-2.0/issues/180"
```
(measured live on #187). `blocked_by`/`blocking` count only *open* blockers; `total_*`
counts all. GraphQL exposes the same data under `repo` scope alone — `subIssuesSummary`
and `trackedInIssues` on the `Issue` type both returned data with no scope error, unlike
every `projectsV2`/`projectItems` field tested (§5). **The `read:project` boundary sits
around Projects v2 specifically — sub-issues and dependencies are not gated behind it
at all.**

**The caveat: `refresh.mjs` doesn't call that endpoint today.** It runs
`gh issue list --json number,title,state,labels,closedAt` — the GraphQL-backed `gh`
CLI shortcut, not the raw REST list. Its supported `--json` fields are a fixed set:

```
assignees author body closed closedAt closedByPullRequestsReferences comments
createdAt id isPinned labels milestone number projectCards projectItems
reactionGroups state stateReason title updatedAt url
```

No `subIssuesSummary`, no `issueDependenciesSummary`, no `parentIssueUrl` — `gh issue
list --json` does not surface this data at all, at any scope. Reaching it means
switching `refresh.mjs`'s one call from `gh issue list --json ...` to
`gh api "repos/{owner}/{repo}/issues?state=all&per_page=100" --paginate`, which is
still one script-driven, no-live-network-at-render, `repo`-scope pull — the same
architecture, a different endpoint. This is a real, scoped, cheap change, not a new
subsystem.

**A frontier ("everything unblocked right now") is not a first-class GitHub query —
it must be computed, and the obvious shortcut is unreliable.** The Issues search
qualifier `is:blocked` exists (GA since 2025-08-21) and is documented to mark blocked
issues in the Issues tab and project boards. Tested live: `is:open is:issue is:blocked`
on this repo returns `total_count: 0`, even though #187 (open) has
`issue_dependencies_summary.blocked_by: 2` (open blockers #185, #186) at the same
moment. **Do not build the frontier on the search qualifier — it is either unindexed
or lagging.** The reliable path is the field-level ground truth: an open issue with
`issue_dependencies_summary.blocked_by === 0` *is* the frontier, computable client-side,
from data already in hand, at zero extra network cost, the moment `refresh.mjs` switches
endpoints.

## 2. MEASURE — milestones, live and re-tested against the current model

**0 milestones exist in this repo** (`GET /repos/{owner}/{repo}/milestones` → `[]`,
confirmed live). The 2026-07-30 cross-exam refuted a milestone-based progress model
because "they cover 13 of 74 quests and none of the 35 business quests." That
document does not show its arithmetic for "13," and the instruction here is explicit:
re-test, don't inherit.

Recomputed from `docs/scope-model.yaml` today: **74 quests total, 39 carry a `github`
block (issue-bound, therefore milestone-*eligible* in principle), 35 carry none**
(business-only — pricing, CFDI, positioning, country sequencing, unit economics,
support SLAs, etc.). The "35 business quests, zero milestone reach" half of the old
claim reproduces exactly. The "13" half does not reproduce from a plain
has-a-`github`-block count (that ceiling is 39, not 13) — I could not reconstruct
what narrower rule produced 13 from what the prior report shows, and I am not
inheriting it. What is defensible today: **milestones can structurally reach at most
39 of 74 quests (53%), can never reach 35 of 74 (47%), and currently reach 0.**

Even at the generous 39-quest ceiling, milestones lose to the existing
`scope-model.yaml` + `depends_on` mechanism on the one axis that matters for *this*
map's destination (an arcade the owner actually opens): the quest model already covers
**all 74**, including the 35 that will never have a GitHub issue. Adopting milestones
would not add coverage, it would add a second, narrower, currently-empty bookkeeping
surface next to the one that already works.

## 3. MEASURE — what red-tracker itself spends to approximate this

Prior baseline (2026-07-30 cross-exam, reproduced and cited by #193): **9,001 lines
of tracker code.** Recounted today: `arcade.html` (generated) 7,662 lines;
`arcade/{interior,overworld,panels,shell,viewmodel}.mjs` (runtime) 5,861 lines;
`census-a1.mjs` + `gen-arcade.mjs` + `refresh.mjs` + `index.html` 1,586 lines —
**~15,100 lines of runtime/build code**, plus 3,942 lines of `check-*.mjs` test
harnesses and a 353-line `CONTRACT.md`, for **~19,400 lines total**. The codebase
roughly doubled in the three days since the last count — real, rapid iteration, not
a discrepancy to explain away, but it means "~9,000 lines" (the number #193 quotes)
already understates current spend by about 2×.

The one-`gh`-call / no-server / `file://` design is unchanged and is the thing worth
defending: `refresh.mjs` makes exactly one network call, writes `status.js`
atomically, and the page opens by double-click with zero runtime network dependency.
That property is structurally something Projects v2 cannot offer (§4) — it is the
tracker's actual moat, not the board/filter/progress mechanics layered on top of it.

## 4. RESEARCH — Projects v2, the incumbent, ranked honestly (from documentation)

*Primary source: GitHub's own docs (docs.github.com), fetched live this session and
quoted below. This section is capability research, not a live audit of this repo's
Projects v2 usage — that part is blocked, see §5.*

**Views.** Projects v2 ships three native layouts — table, board (kanban), and
roadmap (timeline) — over the same underlying items, switchable with no rebuild.
`red-tracker` has exactly one fixed layout (the voxel world map) and would need a new
renderer per additional layout; GitHub ships three for free today.

**Custom fields.** Up to 50 fields per project — date, number, single-select,
text, iteration — attachable to any issue in the project. This is a real, generic
superset of `scope-model.yaml`'s fixed `status`/`world`/`quest` taxonomy for the
**39 issue-bound quests**. It cannot touch the other 35 — Projects v2 fields attach
to issues/PRs/drafts, and the 35 business quests have none.

**Saved filters.** Multiple views can each carry their own filter/sort/group and be
saved and reused. `red-tracker` currently has zero runtime filtering — it renders one
fixed view per refresh. On this specific axis, the incumbent is already ahead of what
was built, not behind it.

**Built-in automation.** Confirmed defaults: closing an issue or merging its PR sets
Status → Done automatically; configurable workflows can set Status → Todo on item-add,
auto-add items from a repository by filter, and auto-archive items meeting criteria.
None of this is dependency-aware or fires on custom-field values per the docs surface
read — but "an issue closes, its card moves" is exactly the kind of plumbing #201
("THE AUTOMATION CONTRACT: what creates, what completes, what the owner never
touches") is scoping from zero. GitHub already ships the closing half for free.

**Insights.** Configurable charts (pick filter + chart type) are a native, no-code
feature visible to any project viewer. `red-tracker` has no chart/insights surface at
all today.

**The constraint that matters most: Projects v2 has no offline or static-export
path.** Every doc page describes live, bidirectional sync between the project and
its source issues/PRs — nothing describes an export or a `file://`-renderable
snapshot. This was verified structurally, not just by absence-in-docs: the GraphQL
`projectsV2` fields exist and are reachable *in principle* (they returned a clean
`INSUFFICIENT_SCOPES` error, not a "field does not exist" error — see §5) — meaning
the **data** is API-reachable given the right scope, but the **views themselves**
(the board, the roadmap, the drag interactions, the insight charts) are rendered only
inside the live github.com web app. A scope grant would let a script pull Projects v2
*field values* into a static snapshot the same way `refresh.mjs` already pulls issues
— it would never let anyone export the board/roadmap/chart UI itself. That distinction
should shape any future build: don't rebuild the UI, consider only pulling the data.

**Prior art: GitHub itself already ran this experiment and the incumbent won.**
"Projects (classic)" — GitHub's earlier, simpler, column-based board — was formally
sunset through 2024–2025 (REST API removed 2025-04-01, UI removed in CLI ≥3.17
2025-06-03) in favor of Projects v2's fields-and-views model. That is a real,
GitHub-sourced post-mortem: the simpler board-only primitive lost to the
richer field-driven one, inside GitHub's own product. The failure mode on the other
side is also documented outside GitHub's own material: a Hacker News thread
("GitHub removed Classic projects and wiped my ideas without warnings," Sept 2024)
records a user losing board data they had not exported when classic was pulled.
That is direct, if informal, evidence for `red-tracker`'s one real structural
advantage over *any* hosted board — its snapshot is a file on disk the owner already
has, not a live surface that can be deprecated out from under them.

**Own prior art — the thing that already works.** The 2026-07-30 cross-exam already
identified `refresh.mjs`'s validation seam and the one-call/no-server design as the
two best-engineered pieces of this codebase, load-bearing enough to "survive any
rework." Nothing in this audit weakens that. The part of `red-tracker` worth keeping
is exactly the part Projects v2 cannot be: an artifact, not a session.

## 5. What I dropped — named, not silent

- **Live Projects v2 measurement in this repo is blocked**, exactly as #193
  anticipated. Two direct attempts, both quoted in full:
  - `gh api graphql -f query='{repository(...){ projectsV2(first:5){ nodes{ title } } } }'`
    → `"Your token has not been granted the required scopes... requires one of the
    following scopes: ['read:project']... your token has only been granted the:
    ['gist', 'read:org', 'repo', 'workflow'] scopes."`
  - `gh issue list --json number,projectItems` → identical `INSUFFICIENT_SCOPES`
    error on the `id`/`title`/`optionId`/`name` fields of `projectItems`.
  - **Unblock command, to be run interactively by the repo owner (not by an agent,
    and not attempted here per instruction):** `gh auth refresh -s read:project`.
    Once granted, §4's "what does it cost to set up" and "what does the actual board
    look like on this repo's real quests" become MEASURE questions instead of
    documentation-only RESEARCH, and are the natural next ticket.
- **The felt cost of setting up a Projects v2 board** (minutes-to-first-useful-view,
  friction of configuring 39 quests as items) is inferred from docs, not timed. Even
  with `read:project` granted, this specific sub-question needs a human at a keyboard,
  not just API scope — flagging it as a residual gap beyond the scope fix.
- **Provenance of the prior report's "13 of 74" milestone figure** could not be
  reconstructed from the source document; I recomputed independently (39/74 ceiling)
  rather than force-fit a number I couldn't derive. See §2.
- **Prior art on gamified/visual trackers generally** (what killed similar tools
  elsewhere) is explicitly issue #195's scope, not re-run here to avoid duplicating
  that ticket's job.
- **A full GraphQL field-parity audit** (exact naming of every sub-issue/dependency
  field beyond the two tested) was not exhaustively run — `subIssuesSummary` and
  `trackedInIssues` were spot-checked and both cleared scope; deeper naming questions
  are a REST-vs-GraphQL implementation detail for whoever writes the `refresh.mjs`
  change, not a blocker to this audit's verdict.

## 6. Capability table

| capability | does GitHub already do it | what the arcade would add | delta worth building? |
|---|---|---|---|
| Views (board/table/roadmap) | Yes, native, 3 layouts, live drag/drop | Fixed narrative world-map skin, works offline | **No** — don't rebuild board mechanics; the skin is the only non-duplicate part |
| Custom fields (≤50, incl. iteration) | Yes, native, for any issue in the project | Fixed `world`/`status`/`quest` taxonomy — but reaches all 74 quests, not just issue-bound ones | **No**, for the 39 issue-bound quests; **moot** for the 35 that have no issue to attach a field to |
| Saved filters | Yes, native, multi-view, reusable | None today — arcade has zero runtime filtering | **N/A** — GitHub is currently ahead here; adopt, don't rebuild |
| Built-in automation (close→Done, auto-add, auto-archive) | Yes, native, zero-code | None — #201 is scoping this from zero | **Maybe, narrow** — only for whatever #201 rules the owner must still do by hand after GitHub's defaults |
| Insights / charts | Yes, native, no-code, filter+chart-type | None | **No** |
| Sub-issues (hierarchy, progress %) | Yes, native; free on the same `issues` REST call already needed (no extra scope) | A *different* hierarchy (quest, not sub-issue) — the two are currently unrelated axes | **No new build** — just wire up the free fields |
| Issue dependencies (blocked-by/blocking) | Yes, native; 10–12 real edges measured live; free on the same call; `is:blocked` search is unreliable, field-level data is not | Currently reads **neither** (per #193); a computed frontier is trivial once the endpoint switches | **Yes — small and cheap.** Switch `refresh.mjs` from `gh issue list --json` to `gh api .../issues`, surface `issue_dependencies_summary` and `sub_issues_summary` already returned |
| Milestones | Yes, native; 0 currently exist; ceiling 39/74 quests, 0/35 business quests, ever | `scope-model.yaml` + `depends_on` already covers all 74, incl. all 35 business quests | **No** — the existing mechanism strictly dominates milestones on this map's own destination |
| Offline / `file://` / no-server render | **No — structurally cannot.** Docs describe only live bidirectional sync; no export path exists; GitHub sunset its own simpler board (`Projects classic`) rather than make it more portable | The entire point of `red-tracker` | **Yes — this is the actual moat.** Keep it; nothing above threatens it |
| The 35 business quests (no GitHub issue exists) | **No — cannot, by definition.** Projects v2 items are issues/PRs/drafts; there is nothing to attach | The only place this ontology exists at all | **Yes — the other real moat** |

## Verdict

GitHub Projects v2 is not decoration and was under-examined, not over-rated by
assumption — for the 39 issue-bound quests, it already ships views, fields, filters,
automation, and insights that `red-tracker` does not have and would cost real lines to
approximate, for zero build cost of its own. If the arcade's job were "give the
engineering half of this repo a board," Projects v2 wins outright and building more
board mechanics into the arcade would be waste.

But that is not the arcade's job. Its actual, non-duplicated value is two things
Projects v2 is structurally unable to provide at any scope level: an artifact that
opens from `file://` with no live session and can't be deprecated out from under the
owner (GitHub's own sunset of Projects classic is direct evidence that hosted board
UIs are not permanent), and a home for the 35 business quests that have no GitHub
issue and never will. Neither is a Projects v2 gap that better configuration closes —
they're outside what the primitive can represent.

Sub-issues and dependencies are the one place a real, cheap delta exists: the data
red-tracker needs (`issue_dependencies_summary`, `sub_issues_summary`) already rides
along on the same REST call it would need to make anyway, under the scope it already
has — the fix is switching one API call in `refresh.mjs`, not a new subsystem.
Milestones lose outright: even at their most generous reading they cap out below what
`scope-model.yaml` already covers.
