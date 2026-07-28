# Audit evidence — 2026-07-28 Supabase fit / structure / alternatives

Working evidence behind [`../2026-07-28-supabase-fit-and-alternatives-audit.md`](../2026-07-28-supabase-fit-and-alternatives-audit.md).
40 files, ~1.3 MB. **The report is the deliverable; these are its citations.** Each file shows its own SQL and its
output, the URLs it fetched with dates, and ends with its author's declared blind spots.

Method, deliberately: **coverage, not replication.** The 2026-07-27 audit ran 5 agents on a byte-identical prompt and
returned a consensus of blind spots. Here every agent got a *distinct* mandate, then a referee settled the
disagreements and a critic asked what the whole roster missed. Read `referee.md` and `critic-coverage.md` first — they
supersede any individual file they overrule.

## Where to start

| Read this | For |
|---|---|
| `referee.md` | Every disagreement, ruled on with evidence. The most valuable single file here. |
| `critic-coverage.md` | What all 36 modelling agents missed — including the orchestrator's own error |
| `measure-*.md` (5) | **The only measured files.** Everything else is modelled. |
| `red-breakfirst.md` | One sorted table of every ceiling, by which arrives first |

## Workflow 1 — evidence sweep (19 agents)

- **Pricing mechanics** — `price-meters.md`, `price-compute.md`, `price-gotcha.md`
- **Workload measurement** — `workload-reads.md`, `workload-growth.md`, `workload-auth.md`
- **The cost model** — `model-tiers.md`
- **Structural forks** — `arch-tenancy.md`, `arch-authz.md`, `arch-datamodel.md`, `arch-api.md`, `arch-runtime.md`
- **Alternatives, priced at 100 / 1,000 / 3,000 gyms** — `alt-neon.md`, `alt-aws.md`, `alt-selfhost.md`,
  `alt-baas.md`, `alt-auth-only.md`, `alt-email.md`, `alt-exit-cost.md`

## Workflow 2 — adversarial + verification (15 agents)

- **Red team** — `red-team.md` (paid to argue it fails), `red-breakfirst.md` (every ceiling, sorted),
  `red-blastradius.md` (what takes down all 3,000 at once), `red-ops.md` (the organisational ceiling)
- **Independent verification** — `verify-plan-tier.md`, `verify-authz-ceiling.md`, `verify-region-runtime.md`,
  `verify-pricing-supabase.md`, `verify-email-ceiling.md`, `verify-datamodel-invariants.md`, `verify-math.md`
- **Context** — `legal-mx.md`, `legal-br.md`, `legal-andean.md`, `biz-model.md`

## Workflow 3 — synthesis (2 agents + the report)

`referee.md`, `critic-coverage.md`

## Workflow 4 — measurement on scratch (4 agents + direct measurement)

Run because `critic-coverage.md` found that all 36 prior agents were given read-only production and none were given
the writable scratch project — seven independently wrote *"the honest way to settle this is to seed the scratch
project and I could not."*

- `measure-e1-policy-merge.md` — **refuted a recommendation the report was making** in four places
- `measure-e3-schema-diff.md` — prod vs repo, object by object: data model identical, privilege drift real
- `measure-e6-index-proof.md` — the `ventas` index, proven rather than asserted
- `measure-seed.md` — how the 3,002-gym / 611k-row / 438 MB scratch dataset was built

Results folded into **§12** of the report. The remaining measurement agents were stopped mid-flight as wasteful once
the seeded database existed; those measurements were run directly instead and are recorded in §12.

## Caveats that apply to every file here

- **Modelled unless it says measured.** Only the `measure-*` files and §12 of the report rest on a database at scale.
- These are **agent working notes**, not edited prose. They disagree with each other on purpose — that is what
  `referee.md` is for. Where a file contradicts the report, **the report wins**; it was written after the referee ruled.
- All production access was read-only. All writes went to the disposable scratch project `gyyujeguycxxoaqgdnjp`.
