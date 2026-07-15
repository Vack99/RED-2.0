# T2 — The scope-model schema, format & location

> **Wayfinder asset** · resolves [T2 · Design the scope-model schema, file format & repo location](https://github.com/Vack99/RED-2.0/issues/107) (#107) on map [#105](https://github.com/Vack99/RED-2.0/issues/105) · 2026-07-14
>
> **What this is:** the decided **data shape** the gamified tracker reads — format, file location, the world → subgroup → quest schema, the hybrid-derivation rules, and the issue-binding convention. Designed *against* [T1's revealed schema shape](https://github.com/Vack99/RED-2.0/blob/main/docs/superpowers/wayfinder/2026-07-14-T1-foundation-catalogue.md), not re-derived.
>
> **Design only.** This ticket decides the schema. The actual `docs/scope-model.yaml` gets **written later** in the execution tail (`to-spec` → `to-tickets` → build); T3/T4 enumerate the quests that populate it. This doc is the spec they author against.

---

## Decisions at a glance

| Decision | Choice | Why |
|---|---|---|
| **Format** | **YAML** | Hand-authorable (comments, no braces), one tiny lib to parse, multi-line caveats via block scalars. |
| **Layout** | **One master file** | Cross-pillar `depends_on` edges resolve in one document; renderer reads one file; whole arc in one scroll. |
| **Location** | **`docs/scope-model.yaml`** (committed, in-repo) | In-repo so **agents read project status directly**; top-level so it's discoverable; provably inert. |
| **Nesting** | **world → subgroup → quest** (3 levels) | T1's natural grain. Subgroup is a **pure label**; quest is the atomic leaf. |
| **Derivation** | **emergent from field presence** (no `derivation:` tag) | Can't drift: `github` ⇒ engineering, `status` ⇒ business, both ⇒ bar + override. |
| **Status enum** | **5 stored + 2 derived** | Fewer hand-set states; the model can't contradict itself. |
| **Binding** | **ranges for frozen, per-quest label for active** | New issues auto-join a live quest by tagging in GitHub — no yaml edit. |

**Inertness — re-verified (closes the one thing T1 hand-waved):** the repo has **no Prettier, no `lint-staged`, and no `format` script anywhere** (checked `package.json`, `.husky/pre-commit`, config globs). The pre-commit hook is only `pnpm lint && pnpm typecheck && pnpm test`; `pnpm lint` = `turbo run lint:src`, scoped to workspace *packages* — `docs/` is not one. So `docs/scope-model.yaml` is **never reformatted, linted, type-checked, tested, bundled, or served**. No `.prettierignore` entry is needed (there is no Prettier). ⚠️ It must stay out of the gitignored `docs/` subpaths (`/docs/handoffs/`, `/docs/archived-files/`, the throwaway-project dirs) — `docs/scope-model.yaml` at the root is tracked and clear.

---

## The schema

### Top level

```yaml
repo: Vack99/RED-2.0                          # required — used to construct all links
destination: "RED is sellable across Latin America"   # optional — the north star, documentation
worlds: [ <World>, ... ]                      # required
```

### World

```yaml
- id: foundation          # required, unique slug
  name: Foundation        # required
  emoji: 🏗️              # optional — gamified visual
  caveats: [ <Caveat> ]   # optional — world-level open threads
  subgroups: [ <Subgroup> ]   # required
```

World progress is **rolled up from its quests by the renderer** — never hand-set.

### Subgroup — a pure grouping label

```yaml
- name: "Shared core (@gym/*)"   # required — a display heading, nothing else
  quests: [ <Quest> ]            # required
```

No status, no derivation, no caveats. (A per-subgroup bar, if ever wanted, is computed from child quests for free.)

### Quest — the atomic trackable leaf

```yaml
- id: gym-domain                 # required — globally unique; depends_on targets these
  title: "@gym/domain — pure business rules"   # required
  what: "Brand-neutral domain leaf"            # optional (recommended) — one line
  kind: gate                     # optional — omit for a normal quest; `gate` = HITL exit gate
  status: deferred               # business quests; OMIT for pure-engineering (derived from github)
  github:                        # engineering quests
    issues: [3]                  #   explicit numbers and/or "N-M" range strings
    label: quest:some-slug       #   every issue carrying this label
  evidence: [ <Evidence> ]       # optional — typed proof list
  depends_on: [ other-quest-id ] # optional — quest→quest edges (cross-pillar OK)
  caveats: [ <Caveat> ]          # optional — quest-level open threads
```

**Invariant:** every quest has `id` + `title` + **at least one of `{github, status}`** — so it is always engineering, business, or both.

### Evidence — a typed reference

```yaml
{ type: <issue|commit|branch|path|memory|url>, ref: <string>, note: <string, optional> }
```

| `type` | `ref` is | renders as |
|---|---|---|
| `issue` | issue number | `…/issues/N` — a *related* issue, **not** a bar source (that's `github`) |
| `commit` | sha | `…/commit/<sha>` |
| `branch` | branch name | `…/tree/<branch>` |
| `path` | repo-relative path | `…/blob/main/<path>` — covers migrations, ADRs, runbooks, audits, any doc |
| `memory` | memory slug | plain text (memory files live in `~/.claude`, not the repo) |
| `url` | full URL | the literal link |

### Caveat — a string, or an object when it links

```yaml
caveats:
  - "BYO-domain onboarding queue never built — the one real remaining scaling-eng piece"
  - note: "ADR-0013 §2/§3 O(1) RLS claim is false — correlated per-row SubPlan"
    ref: { type: memory, ref: adr-0013-rls-per-row-claim-is-false }
```

A caveat in the list **is** a currently-open thread — resolve it by **deleting it** (no `resolved` flag).

---

## Derivation rules (what the renderer computes)

**Status source — emergent from field presence:**

| Quest has… | Bar | Status | Meaning |
|---|---|---|---|
| `github` only | from `gh` closed/total | derived | pure **engineering** |
| `status` only | none (or hand-set) | hand-set | pure **business** |
| **both** | from `gh` | **`status` overrides** the derived label | seam / earned-ahead override |

**Auto-status from `gh`** (engineering quests): `0` closed → `todo` · some closed → `in-flight` · all closed → `shipped`.

**The 5 stored status values:** `shipped` · `in-flight` · `todo` · `deferred` (intentionally postponed) · `needs-decision` (awaiting an owner strategy call).

**The 2 derived states (never stored — computed, so they can't contradict their source):**
- **`shipped-with-open-threads`** = `status` resolves to `shipped` **and** `caveats` is non-empty → renderer shows the ⚠️ variant.
- **`blocked`** = any quest in `depends_on` is not yet `shipped`.

**Owner-action states are also derived, not stored:** *owner must decide* = `status: needs-decision` · *owner must walk* = `kind: gate` with deps shipped + own issue open (renderer shows "awaiting owner walk") · *owner-pending sub-item* = a `caveat`. (This is why there is no `owner_action` field.)

**Earned-ahead needs nothing:** a `shipped` quest placed under an ahead world (2–7) simply *is* earned-ahead — `world` is positional, `status` is independent.

---

## Issue-binding convention (how quests bind to live GitHub issues)

The binding is **authored in the quest** — issues don't know their quest; the model asserts it.

- **Frozen (shipped) quests** — their issues are closed forever, the set never grows → **enumerate once** as `issues: ["2-8"]`. Write-once, zero maintenance.
- **Active / future quests** — where new issues will land → give the quest a **per-quest label** (`label: quest:stripe-subs`). **Any issue you file and tag with it auto-joins the quest and moves the bar — no yaml edit.**
- **A new *feature* from nowhere** = a **new quest** (one ~6-line block); thereafter its label auto-collects issues.
- **A *bug*** = tag it with an existing quest's label (bar reflects it), **or** leave it as untracked GitHub noise. **The model is a coarse strategic map, not a 1:1 mirror of every issue.**

**T6 (#111) renderer requirement — the "unmapped issues" inbox:** the renderer diffs *all open repo issues* against the model and surfaces any open issue that carries no quest label and is enumerated nowhere. So nothing filed ever silently vanishes — it lands in an uncategorized pile until labeled into a quest or consciously ignored.

---

## Worked example — the Foundation world (template for T3/T4)

A representative slice using T1's real data — shows an eng quest (range), an eng quest (label), a gate, a business quest, cross-pillar `depends_on`, evidence, and caveats at both levels.

```yaml
repo: Vack99/RED-2.0
destination: "RED is sellable across Latin America"

worlds:
  - id: foundation
    name: Foundation
    emoji: 🏗️
    caveats:
      - note: "ADR-0013 §2/§3 O(1) RLS claim is false — correlated per-row SubPlan; predicate-rewrite promotion owner-pending"
        ref: { type: memory, ref: adr-0013-rls-per-row-claim-is-false }
      - "Migration version drift — supabase db push against prod is permanently unsafe (56/78 filenames unrecognized)"
    subgroups:

      - name: "Monorepo refactor (Phase 1)"
        quests:
          - id: monorepo-workspace
            title: "Turborepo + pnpm workspace + shared @gym/* core"
            what: "Behaviour-preserving monorepo conversion: workspace, domain/format/data/ui packages, boundary cutover"
            github: { issues: ["2-8"], label: monorepo-phase1-2026-06 }
            evidence:
              - { type: path, ref: docs/adr/0011-monorepo-packaging-jit-packages-cross-package-boundary.md, note: "cross-package boundary" }
              - { type: commit, ref: bc1c8d5, note: "export narrowing + 3 machine guards" }

          - id: monorepo-deploy-verify
            title: "Deploy-verify — Forge admin deploys identically from apps/admin"
            what: "Human confirmed the relocated app deploys byte-identically"
            kind: gate
            github: { issues: [9] }
            depends_on: [monorepo-workspace]

      - name: "Member self-registration (earned-ahead → World 2)"
        quests:
          - id: member-self-registration
            title: "Member self-register + email-verified claim"
            what: "Registration + atomic definer claim-by-verified-email; phone never claims"
            # Placed here as SHIPPED but its capability belongs to World 2 (Sellable Product) — earned-ahead.
            github: { issues: [26, 55], label: member-reg-invite-2026-07 }
            evidence:
              - { type: path, ref: supabase/migrations/20260710030000_reclamar_email_fix.sql, note: "email-drop fix #78" }

  # --- an AHEAD world with a needs-decision and a blocked engineering quest ---
  - id: monetization
    name: Monetization
    emoji: 💳
    subgroups:
      - name: "Subscription billing (gyms → us)"
        quests:
          - id: revenue-cut-decision
            title: "Decide the member-payment revenue model"
            what: "BYO-Stripe, no-cut is the locked strategy; the pricing/cut specifics are still an owner call"
            status: needs-decision      # business quest — hand-set, no github bar

          - id: stripe-subscriptions
            title: "Stripe subscriptions — gyms pay RED"
            status: todo
            github: { label: quest:stripe-subs }   # active quest — new issues auto-join by tagging

          - id: stripe-connect
            title: "Stripe Connect — gyms bill their own members"
            status: todo
            github: { label: quest:stripe-connect }
            depends_on: [revenue-cut-decision, stripe-subscriptions]   # cross-quest; renders as `blocked`
```

---

## For the sessions that consume this (T3 · T4 · T6)

- **T3 (#108) / T4 (#109)** — enumerate quests for worlds 2–7 against this schema. **Mark T1's ahead-world-bleed items `shipped` under their ahead world** (see T1's bleed table) — do not re-file them as todo. Use `status: needs-decision` for pricing / revenue-cut / country-order / ad-spend — capture, don't resolve.
- **T6 (#111)** — the renderer: read `docs/scope-model.yaml`, resolve every `github` block via `gh` (closed/total → bar + status), construct links from `repo`, render world → subgroup → quest with the derived states (`shipped-with-open-threads`, `blocked`, "awaiting owner walk"), and build the **unmapped-issues inbox**.
