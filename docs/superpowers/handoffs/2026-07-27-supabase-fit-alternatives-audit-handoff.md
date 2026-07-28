# Handoff — Supabase fit, pricing tiers, alternatives, and structural weaknesses (3,000-gym LatAm scale)

Written 2026-07-27 by the session that recovered the previous audit from a power outage.
**This session does no implementation.** It is an audit + decision-support run. No file edits, no
migrations, no DB writes.

**Read this whole file before spawning a single agent.** Its most important content is not the
scope — it is §2 (why the last audit was too narrow) and §6 (the rules that stop this one from
returning a useless all-clear).

---

## 0. Ground truth — verify before relying on anything below

```powershell
git -C C:\Users\Aaron\Documents\Repos\RED-2.0 log --oneline -3    # expect c43111f or later
git -C C:\Users\Aaron\Documents\Repos\RED-2.0 status --short      # expect only untracked docs/
```

The Supabase MCP is bound to **LIVE PRODUCTION** (`hjppxawglmukfvsgmcog`). Read-only is fine and
expected: `execute_sql` with SELECT, `EXPLAIN` **without** ANALYZE, `pg_catalog` reads,
`get_advisors`, `get_logs`. **Any write, DDL, or `apply_migration` is forbidden in this session.**
Never `supabase link` or `db push` to prod — prod's `schema_migrations` does not recognize 56 of 78
migration filenames and a push would re-apply them, seeds included.

Scratch project `gyyujeguycxxoaqgdnjp` exists as a test bed (77 migrations applied, creds in
gitignored `docs/db-testing-throwaway-project`). **You may write to scratch.** If a claim in this
audit hinges on measured behaviour at scale, seeding scratch and measuring is in scope and
encouraged — see §5, deliverable 8.

---

## 1. What you are being asked

Aaron's words, condensed: *is Supabase really the best possible approach for this project, and is
our structure actually the best possible approach for a project like this one? Where are our main
weaknesses and what are the best alternatives? I want a clear output on pricing — how many gyms
with how many members can we handle before the first paid tier, and how much can Pro handle before
the next tier? Make sure we are not leaving anything apart.*

Product frame (settled, not up for audit): a gym-management SaaS sold across Latin America, target
**≥3,000 small-to-medium gyms**, roughly **150–300 members each**. Two Next.js apps (`admin`,
`client`) on Vercel, one multi-tenant deployment per app resolving gym by host. Members pay their
gym directly (BYO-Stripe, RED takes no cut). Revenue reference point: LatAm gym software runs
~300–1,500 MXN per gym per month.

---

## 2. Why the previous audit was too narrow — do not repeat its method

The 2026-07-27 audit (`docs/Context/2026-07-27-auth-structure-scale-audit.md`) ran **5 Opus agents
on a byte-identical prompt** in independent contexts. Aaron's critique is correct and it is a
methodological one, not a quality one:

> **Identical prompts measure reproducibility, not coverage.** Five agents agreeing tells you the
> answer is *stable*, not that it is *complete*. Everything outside that single prompt's framing was
> structurally invisible to all five runs simultaneously — and a consensus of five blind spots reads
> exactly like confidence.

That audit's own §5 half-admits it: the five runs diverged most sharply on the single most
consequential performance question, and its stated conclusion was "panels are reliable for
direction, unreliable for prioritization."

**Concrete things the identical prompt never asked, which are now in scope:**

| Gap | What the last audit actually did |
|---|---|
| **Tier-boundary math** | Gave *one* cost scenario at 3,000 gyms (~$1,200–2,300/mo). Never computed where Free→Pro or Pro→Team actually fall, nor which meter binds first at each boundary. **This is Aaron's headline ask and it is simply absent.** |
| **Platform alternatives** | Compared *auth pricing only* (Firebase/Cognito/Auth0). Never priced Neon, Railway, Fly, RDS/Aurora, self-hosted Postgres, Supabase OSS, Convex, Nhost, Appwrite at the same scale points. |
| **Multi-tenancy model** | Compared exactly two options: one global `auth.users` vs per-gym accounts. **Never asked** shared-table+RLS vs schema-per-tenant vs DB-per-tenant vs sharded-pods. That is the actual structural fork. |
| **Authorization architecture** | Assumed RLS-as-authorization is correct and audited its performance. Never asked whether authorization belongs in RLS at all vs an app/service layer. |
| **API design** | Never questioned the RPC-heavy PostgREST design (34 `public` functions) vs a real service layer. |
| **Component unbundling** | Framed the choice as all-Supabase vs re-platform. Never costed "keep Postgres, replace only auth" or "keep Supabase, move only email." |
| **Compliance** | One line naming MX LFPDPPP / BR LGPD / CO Ley 1581. No data-residency analysis, no per-country obligation list, no deletion/export SLA. |
| **Measurement** | Self-admitted: "112 rows … a model, not a measurement." Asymptotic claims were reasoned from planner behaviour, never measured under load. |

**Method for this run instead: coverage, not replication.** Every agent gets a *distinct mandate*
and a *distinct lens*. No two agents receive the same prompt. Then a dedicated critic asks what the
whole roster missed, and a red team is paid to argue the architecture fails.

---

## 3. Agent budget, caps, and model delegation

**Hard caps (from Aaron):**

- **≤25 agents per workflow.**
- **≤15 `opus` (Opus 5) agents total across this session.**
- **≤35 `sonnet` (Sonnet 5) agents total across this session.**
- **No `fable` agents, ever.** Fable quota is low and reserved for the main session only.
  (See memory `fable-usage-conservation`.)

> **Interpretation note — one line to change if wrong.** I read "cap the agents to 25" as *per
> workflow*, and the 15/35 split as the *session-wide budget* (≈50 agents across ~3 workflows). If
> Aaron meant 25 total across the entire session, scale the roster in §4 down proportionally — cut
> the per-vendor sonnet agents to bundled ones first (they are the most divisible), and keep every
> opus seat.

**Delegation rule** (from `CLAUDE.md`, adapted — note Aaron specified *version 5* of both models,
so use `opus` and `sonnet`, not opus-4.8):

- **`opus`** — anything requiring judgment under ambiguity, architectural comparison, adversarial
  reasoning, refereeing disagreement, or synthesis. Also the pricing *model* (the math has to be
  right and the failure mode is confident-and-wrong).
- **`sonnet`** — bounded extraction and gathering with a clear success criterion: reading a
  specific vendor's pricing page, characterizing one workload path, measuring one thing against the
  live DB, checking one factual claim.
- **Escalate freely.** If a sonnet agent's output misses the bar, re-run it on opus without asking.
  Judging output beats respecting the price tag. Budget the caps with ~2 opus seats held in reserve
  for exactly this.

---

## 4. Suggested roster — a floor, not a ceiling

Aaron explicitly said to *leave the audit design to the agent*. Treat this roster as the minimum
coverage guarantee. **If you find uncovered territory, add agents within the caps.** If you find a
better decomposition, take it — but you must still deliver every item in §5.

### Workflow 1 — Evidence sweep (≤25 agents, mostly parallel)

**Track A — Supabase pricing mechanics and tier boundaries** *(Aaron's headline ask)*

| Agent | Model | Mandate |
|---|---|---|
| `price:meters` | sonnet | Every Supabase meter and every tier limit from **primary sources only** (supabase.com/pricing, docs, billing FAQ). Free / Pro / Team / Enterprise: what is included, overage rate per unit, and what is hard-capped vs soft-billed. Cite URLs. |
| `price:compute` | sonnet | The compute ladder — every instance size, price, RAM/CPU/connection limits, and what triggers a resize. Include disk (gp3 vs io2), IOPS, and throughput billing, which the last audit ignored entirely. |
| `price:gotcha` | sonnet | Hunt the *step functions*: PITR pricing per window, read-replica billing, branching, log retention, MAU definition edge cases (does a member who logs in once/month count?), Team-only features, and any meter that bills on peak rather than average. |
| `workload:reads` | sonnet | Characterize actual per-request cost from the codebase: queries per render for the hot paths (`/perfil`, `/reservar`, admin desk, Agenda), RPC calls per action, payload sizes. Feeds the model. Evidence = `file:line`. |
| `workload:growth` | sonnet | Measure row growth per member per month against **live prod** (`ventas`, `asistencias`, `reservations`, `clientes`) and bytes-per-row. Live baseline: 4 gyms, 112 `clientes` (5 claimed), 171 `ventas`, 699 `asistencias`, ~15 MB total. Derive per-gym-per-month growth honestly, and state the sampling error from such a small base. |
| `workload:auth` | sonnet | MAU consumption model. How many distinct auth users per gym actually sign in per month? Members vs staff. Include the seasonal/churn pattern for gyms. This drives the biggest Supabase line item. |
| **`model:tiers`** | **opus** | **The headline deliverable.** Build the calculator: given G gyms × M members, compute every meter's consumption and output which tier is required and **which meter binds first**. Must answer in Aaron's own units: "you can run N gyms at M members each on Free"; "Pro carries you to N gyms, and the meter that breaks it is X." Show the formula, not just the answer. |

**Track B — Alternatives, priced at the same scale points**

Every Track B agent prices its option at **three scale points: 100, 1,000, and 3,000 gyms**, using
the same workload figures Track A derives, and states migration cost from *where we actually are*.

| Agent | Model | Mandate |
|---|---|---|
| `alt:neon-postgres` | sonnet | Neon + Railway + Fly Postgres. Serverless-Postgres pricing model, autoscaling, branching, connection handling. |
| `alt:aws` | sonnet | RDS / Aurora (incl. Serverless v2). Real total cost including backups, IOPS, multi-AZ, egress — the lines that make AWS quotes wrong. |
| `alt:selfhost` | sonnet | Self-hosted Postgres and self-hosted Supabase OSS on a VPS/Hetzner-class box. Include the honest ops burden: patching, backups, on-call, and who does it in a solo-founder company. |
| `alt:baas` | sonnet | Firebase/Firestore, Convex, Nhost, Appwrite. Where each breaks for a relational, multi-tenant, money-handling domain. |
| `alt:auth-only` | sonnet | **Unbundling — keep Postgres, replace only auth.** Clerk, WorkOS, Better Auth, Auth.js, Keycloak, Zitadel. Price per MAU at all three scale points and state what breaks in RLS when `auth.uid()` is no longer native. This is frequently the real answer and the last audit never asked it. |
| `alt:email` | sonnet | The mail tier, which the last audit found is the **largest single vendor line** at 3,000 gyms (Resend ~$385–1,150/mo). Resend vs SES vs Postmark vs Mailgun at LatAm volumes, deliverability and dedicated-IP economics, and per-tenant blast radius. |
| **`alt:exit-cost`** | **opus** | Quantify lock-in in hours, per component. Prior finding to verify, not trust: only 6 files import `@supabase/*`, with one leak at ~8 `auth.getClaims()` call sites. What is the cheapest reversibility investment available *today*, and what does it buy? |

**Track C — Is the structure right?** *(the fork the last audit never took)*

| Agent | Model | Mandate |
|---|---|---|
| **`arch:tenancy`** | **opus** | Shared-table + RLS *vs* schema-per-tenant *vs* DB-per-tenant *vs* sharded pods of N gyms. Cost, isolation, blast radius, per-tenant restore, noisy-neighbour, migration ergonomics at 3,000 tenants. What do comparable multi-tenant SaaS actually run at this tenant count? **The current model is the incumbent, not the default — make it win on evidence.** |
| **`arch:authz`** | **opus** | Does authorization belong in RLS at all? RLS-as-authz vs app/service-layer authz vs hybrid. Include the measured cost of the current policies. ⚠️ `ADR-0013` §2/§3 claims the gym RLS helper is O(1)-per-statement and forbids changing it — **both claims are false** (it is a correlated SubPlan, evaluated per row). Do not trust that ADR; it exists to tell reviewers to delete the correct fix. |
| **`arch:datamodel`** | **opus** | Is `clientes` / `gym_membership` / `ventas` the right shape? Identity vs membership vs roster separation, the per-gym-roster-row model, money/ledger modelling, soft-delete and history. Where will this schema fight the product in 18 months? |
| **`arch:api`** | **opus** | 34 `public` RPCs over PostgREST vs a real service layer. Versioning, contract testing, deploy coupling, the "return value is not the contract, the written rows are" rule (#78/#80), and whether the denial-suite convention scales as a permanent testing strategy. |
| **`arch:runtime`** | **opus** | Next.js on Vercel, server-side-everything, zero Realtime, zero Storage. Is that right at 3,000 gyms? Include egress topology, region choice (prior finding: `us-east-1` right, `sa-east-1` a trap), cold starts, and the shared per-IP rate-limit pools. |

### Workflow 2 — Adversarial pass (≤25 agents)

| Agent | Model | Mandate |
|---|---|---|
| **`red:team`** | **opus** | **Paid to argue the architecture fails before 3,000 gyms.** Build the strongest honest case for "this needs to change now." You are not asked to be fair; you are asked to be strong. The synthesizer will discount you appropriately. |
| **`red:breakfirst`** | **opus** | For every component, find **the number at which it breaks** — gyms, members, MAU, rows, connections, requests/sec, domains, emails/day. Output a table of breaking points sorted by which arrives first. Every component has one; "it scales fine" is not an acceptable cell. |
| **`red:blastradius`** | **opus** | One project = one blast radius. What takes down all 3,000 gyms simultaneously? What is the per-tenant recovery story when one gym loses data (physical PITR structurally cannot roll back one tenant without the other 2,999)? What is the actual RTO, measured not assumed? |
| **`red:ops`** | **opus** | The organizational ceiling. No code path creates an `owner`/`operator` membership — every gym today is hand-written SQL against production. Prior estimate: ~1,500 founder-hours at 3,000 gyms. Also support load, migration cadence, on-call for a solo founder. |
| `legal:mx` / `legal:br` / `legal:andean` | sonnet ×3 | LFPDPPP (MX), LGPD (BR), Ley 1581 (CO) + AR/CL. Data residency, deletion and export SLAs, breach notification, consent for the marketing surfaces, and what a gym-as-data-controller relationship requires contractually. Prior audit gave this one line. |
| `biz:model` | sonnet | Business-model coupling: BYO-Stripe, who owns member data at churn, export obligations, and what happens to the invoice if a gym leaves. |
| `verify:*` | sonnet ×4–6 | Fact-check the highest-consequence claims from Workflow 1 — **especially every pricing number**, each against primary sources, independently of the agent that produced it. Pricing is where a confident hallucination does the most damage. |
| **`verify:math`** | **opus** | Independently re-derive the tier-boundary model from the raw workload figures without looking at `model:tiers`' arithmetic. If the two disagree, that disagreement goes in the dissent log and gets refereed. |

### Workflow 3 — Synthesis (≤6 agents)

| Agent | Model | Mandate |
|---|---|---|
| **`critic:coverage`** | **opus** | Read every finding and answer only: **what did this entire roster fail to examine?** Which vendor was not priced, which structural option not considered, which claim rests on assertion, which question of Aaron's is not yet answered in his own units? Its output is the next round of work. |
| **`referee`** | **opus** | Resolve every disagreement against live prod / primary sources. Where it cannot resolve, say so and record both positions with their evidence. |
| **`synth`** | **opus** | Produce the final report per §5. |

Reserve the remaining opus seats for escalation and a second `critic:coverage` round if the first
finds something material.

---

## 5. Required deliverables — the report is incomplete without every one

Write to `docs/Context/2026-07-28-supabase-fit-and-alternatives-audit.md` (adjust date).

1. **The tier calculator.** A table keyed on gyms × members, showing each meter's consumption and
   the required tier. It must contain these two sentences filled in with real numbers:
   *"You can run **N** gyms averaging **M** members on the Free tier; the meter that ends it is
   **X**."* and *"Pro carries you to **N** gyms averaging **M** members; the meter that ends it is
   **X**, and the next step costs **$Y**."* Show the formula and its inputs so Aaron can re-run it
   when the product changes.
2. **A cost curve, not a point estimate** — total monthly infrastructure at 100 / 500 / 1,000 /
   3,000 gyms, broken out per vendor and per meter, plus per-gym cost and per-gym cost as a
   percentage of the 300–1,500 MXN revenue reference.
3. **Ranked weakness list — minimum 10, ordered worst-first.** Each entry: what it is, evidence
   (`file:line` / migration / live-DB / URL), the scale at which it bites, blast radius, cost to
   fix now vs later. **A forced ranking is mandatory even if the top entry is mild** — see §6.
4. **Alternatives matrix** at all three scale points: option, monthly cost, migration cost in
   hours, what improves, what gets worse, and the honest verdict.
5. **Structural verdict** on each of the four Track C questions — and for every "keep it," a
   **named condition under which you would leave.** A "keep" with no exit trigger is an
   unfalsifiable opinion and does not count as a finding.
6. **Migration-trigger table.** For each component: the exact observable metric and threshold that
   says *change this now*. This is the single most useful artifact for a founder who has just been
   told to keep everything.
7. **Dissent log.** Where agents disagreed, what each claimed, how the referee settled it, and what
   remains unsettled. The previous audit's most valuable paragraph was its dissent section.
8. **Confidence and measurement gaps.** What is measured, what is modelled, what is asserted. For
   anything load-bearing that is only modelled, say what experiment on the scratch project would
   settle it — and if it is cheap, **run it** and report real numbers.
9. **Owner-input list.** Facts not readable from SQL that Aaron must confirm in a dashboard —
   carried over unresolved from the last audit: the current Supabase plan, whether PITR retention
   is actually purchased, and the current region. A DR claim nobody verified is how a team finds
   out it has no backups during the incident.

---

## 6. The rules that stop this returning a useless all-clear

Aaron: *"make sure to help me with this, not just give me answers that tell me nothing is wrong,
that should be impossible."*

He is right that a clean bill of health is a non-answer. But the fix is **not** to instruct agents
to find problems — that produces invented findings, which is worse than useless because it burns
the credibility of the real ones. The fix is to change the *shape of the question* so that useful
content is produced whether or not anything is broken. Put these in every agent prompt:

1. **Forced ranking, not verdicts.** Never ask "is X okay?" — that answers "yes." Ask "**rank the
   5 worst things about X, worst first**." A ranking always produces content, and the top entry is
   informative even when its absolute severity is low. This single change does most of the work.
2. **Breaking points, not adequacy.** Never "does this scale?" Always "**at what number does this
   break, and which one arrives first?**" Every component has a breaking point. "It scales fine" is
   a refusal to answer, not an answer.
3. **Falsification.** Every "keep it" must ship with "**what would have to be true for this to be
   wrong**" — and then the agent goes and checks whether that thing is true.
4. **Exit triggers are mandatory.** Any recommendation to keep a component must name the observable
   condition that would reverse it. See §5.6.
5. **The incumbent does not get the default.** The current architecture is a *candidate*, evaluated
   on the same evidence standard as every alternative. It does not win by being already built.
6. **No claim without evidence.** `file:line`, migration name, live-DB query output, or a primary
   source URL. Vendor pricing from the vendor's own page, never from memory — pricing is the single
   most likely thing to be confidently wrong, and it is the thing Aaron most needs correct.
7. **State what you did not examine.** Every agent's output ends with its own blind spots. That
   list is what `critic:coverage` eats.
8. **Honesty overrides all of the above.** If a component is genuinely sound, say so plainly and
   show the evidence — then rank it against the others anyway. A report padded with manufactured
   findings is a worse outcome than "this part is fine," and Aaron will act on these numbers.

---

## 7. Prior work — read as input to challenge, not as settled fact

Both are **untracked** on disk; commit them or they are one power cycle from gone.

- `docs/Context/2026-07-27-auth-structure-scale-audit.md` — the 5-identical-prompt audit. Its
  verdicts (keep global auth; Supabase is a fit; ~$0.53–1.04/gym/mo) are the **hypotheses this
  session tests**, not its premises. Its §7 ordered-actions list is useful; its §4 cost table is
  the thing most in need of replacement.
- `docs/Context/2026-07-27-multigym-rpc-scoping-decision-memo.md` — recovered from the outage. A
  7-agent tournament on gym-scoping `mi_membresia` / `toggle_favorito_tipo`. Relevant here for two
  independently verified live findings: **no index on `ventas.cliente_id`** (seq scan on every
  `/perfil` render) and **a denial-suite anon vector that cannot fail**
  (`mi_membresia_rules.sql:115-123` sets `role anon` before the JWT claims, so the body raises
  `'No autenticado'` first and the test reports green even if anon held EXECUTE).

**Live baseline, verified 2026-07-27** (re-verify — it will have moved):

| Fact | Value |
|---|---|
| Postgres | 17.6 |
| Gyms live | 4 |
| `clientes` | 112 rows (5 with `auth_user_id` set) |
| `ventas` / `asistencias` | 171 / 699 |
| Total DB size | ~15 MB |
| Compute | `max_connections=60`, `shared_buffers=224MB`, `effective_cache_size=384MB` |
| Emails in `clientes` rows across 2+ gyms | 4 |
| Users with `gym_membership` in 2+ gyms | 0 |
| Realtime / Storage / edge fan-out | unused — verified zero `.channel(` / `postgres_changes` / `storage.from(` in repo |

**Two contested claims to settle rather than inherit:**

- `ADR-0013` §2/§3 asserts the gym RLS helper is O(1)-per-statement and forbids changing it. **Both
  halves are false** — it compiles to a correlated SubPlan evaluated per row. The last audit
  refereed this live with `enable_seqscan=off` and found no `Index Cond` forms on `gym_membership`.
- The last audit rated the `gym_membership` OR-policy scan **critical** on a 2-vs-1-vs-2 split. It
  claims this binds at ~65–330 gyms, which would make it the **first hard ceiling in the entire
  architecture**. If true it belongs at the top of the ranked weakness list; verify it
  independently rather than importing the verdict.

---

## 8. Session shape

1. Read §2 and §6 before designing anything.
2. Read the two prior docs in §7 — to challenge, not to adopt.
3. Establish the live baseline yourself (cheap, ~5 read-only queries).
4. Workflow 1 (evidence sweep) → read results → Workflow 2 (adversarial) → read results →
   Workflow 3 (synthesis). **Stay in the loop between workflows** — do not chain them blind.
5. If `critic:coverage` finds material gaps and budget remains, run one more round. Say so if you
   ran out of budget instead of quietly truncating.
6. Write the report per §5, then a short memory entry, then report to Aaron in his units: gyms and
   members, pesos and dollars, and what to do first.

**Do not implement anything.** Aaron returns to the originating session afterward to prepare a
separate handoff for the implementation work.
