# verify:plan-tier — Is production Supabase on Free or Paid?

**Agent:** `verify:plan-tier` · **Date:** 2026-07-28 · **DB:** live prod `hjppxawglmukfvsgmcog`, read-only
**Question:** three Workflow-1 agents disagreed (`price-compute.md` → Free/Nano; `price-gotcha.md` → Pro;
`model-tiers.md` → leans Micro/Paid but marks CONTESTED). This settles it as far as it can be settled
without dashboard access, and shows exactly why one of the three pieces of evidence used to argue "Paid"
does not actually hold up.

---

## VERDICT

**Most probable: FREE PLAN, Nano compute. Confidence: MEDIUM (≈65%), not high.**

This is a downgrade in confidence from `price-compute.md`'s "high," because the compute-config argument
that `model-tiers.md` used to push back toward Paid turns out, on closer inspection, to be **uninformative,
not merely ambiguous** (§3). What's left is older, staler evidence than I'd like (§2), which is why this
lands at medium, not high, confidence — and why the 30-second dashboard check (§6) is worth doing today
regardless of which way you'd bet.

---

## 1. What is actually readable from SQL (measured, live, this session)

```sql
select name, setting, unit, category from pg_settings
where name in ('shared_buffers','effective_cache_size','work_mem','maintenance_work_mem',
'max_connections','max_worker_processes','max_parallel_workers','wal_level','archive_mode',
'archive_command','max_wal_senders','autovacuum_max_workers','shared_preload_libraries')
order by name;
```

| Setting | Raw | Converted |
|---|---|---|
| `shared_buffers` | 28672 (×8kB) | **224.0 MB** |
| `effective_cache_size` | 49152 (×8kB) | **384.0 MB** |
| `work_mem` | 2184 kB | 2.13 MB |
| `maintenance_work_mem` | 32768 kB | 32 MB |
| `max_connections` | 60 | — |
| `max_worker_processes` | 6 | — |
| `max_parallel_workers` | 2 | — |
| `max_wal_senders` | 5 | — |
| `autovacuum_max_workers` | 3 | — |
| `wal_level` | `logical` | — |
| `archive_mode` | `on` | — |
| `archive_command` | `/usr/bin/admin-mgr wal-push %p >> /var/log/wal-g/wal-push.log 2>&1` | WAL-G push |

Second query, run to look for anything else diagnostic:

```sql
select current_setting('server_version') pg_version, pg_size_pretty(pg_database_size(current_database())) db_size,
(select count(*) from pg_stat_activity) current_conns,
(select setting from pg_settings where name='huge_pages') huge_pages,
(select setting from pg_settings where name='track_io_timing') track_io_timing,
(select setting from pg_settings where name='log_min_duration_statement') log_min_dur,
(select setting from pg_settings where name='max_locks_per_transaction') max_locks,
(select setting from pg_settings where name='statement_timeout') stmt_timeout;
```
Result: `pg_version=17.6, db_size=15 MB, current_conns=18, huge_pages=try, track_io_timing=off,
log_min_dur=-1, max_locks=64, stmt_timeout=120000`. None of these are documented anywhere as
plan-differentiated (they read as vanilla/near-default Postgres values) — dead end, noted for completeness.

`shared_buffers=224.0 MB` and `max_connections=60` match the orchestrator's stated baseline exactly, so
the live read is consistent with what the other agents worked from.

---

## 2. The direct, non-inferential evidence (this is what actually decides it)

Unlike a Postgres GUC ratio, these are **first-hand records of an actual encountered API behaviour**, not
a guess about how a tuner would configure a box.

**AGENTS.md:60-61** (checked into the repo, still present verbatim today):
> "it needs a `SUPABASE_ACCESS_TOKEN` and a throwaway scratch project (**preview branching is Pro-gated /
> 402**; the free tier fits exactly one scratch beside live), which pre-commit can't provide."

A `402` on a branching API call is exactly the response Supabase's own docs describe for **"not offered"**
on Free — branching isn't a degraded/limited feature on Free, it's absent (`price-meters.md §1`: "Branching
… not offered" on Free vs "$0.01344/branch/hour" on Pro). This is a first-hand encountered error, not an
inference.

**Memory `phase3-rls-execution-progress` (2026-07-05):**
> "branching now Pro-gated → scratch-project suite pattern (SUPABASE_TARGET_REF); free tier = no backups
> → manual pre-gate dumps"

Same conclusion, independently phrased, same week. "Manual pre-gate dumps" is a description of *operator
behaviour that only makes sense if there is no automatic backup to rely on* — i.e., it's a second,
behavioural data point, not just a restated belief.

**Git provenance** (`git log --follow -p -- AGENTS.md`): this text was committed **2026-07-09** (commit
`0d9e7acc`, "docs(rpc-harness): record the test:denial gate contract"), and the RLS-progress memory is
dated **2026-07-05**. **Both pieces of direct evidence are ~3 weeks old relative to today.** That staleness
is the single biggest reason this verdict is "medium," not "high," confidence — see §5.

**Corroborating, weaker signal:** the 2026-07-27 handoff (`docs/superpowers/handoffs/2026-07-27-supabase-fit-alternatives-audit-handoff.md:26`)
still describes scratch project `gyyujeguycxxoaqgdnjp` as "KEPT as project test bed" — i.e., as of
yesterday the org still holds exactly **2** projects (live + scratch), which is consistent with (though
does not prove) still sitting at Free's documented **"Active projects: Limit of 2"** (`price-meters.md §1`,
sourced `supabase.com/pricing`, fetched 2026-07-27). This is neutral-to-supportive, not decisive on its
own — a Pro org could also happen to have exactly 2 projects.

---

## 3. Why the "compute settings prove Micro/Paid" argument does NOT hold up

`model-tiers.md §3, §9.3` argued shared_buffers=224MB "is 44% of a Nano's 0.5GB RAM — a setting no tuner
would choose... and 22% of a Micro's 1GB, which is textbook [25%]," concluding this "leans Micro/paid."
I re-derived this and it does not survive scrutiny, for two independent reasons:

**(a) The two GUCs point in opposite directions against the "which tier looks tuned" test.**

| Ratio | vs Nano (0.5 GB) | vs Micro (1 GB) | Standard guideline |
|---|---|---|---|
| `shared_buffers` / RAM | 43.75% | **21.9%** | ~25% (`price-meters.md` cites the same 0.25×RAM rule of thumb) — Micro looks "textbook" |
| `effective_cache_size` / RAM | **75%** | 37.5% | 50–75% typical | Nano looks "textbook" |

If Supabase individually tuned each tier's `postgresql.conf` to its own RAM ceiling, you'd expect **both**
ratios to point the same direction. They don't — one metric looks like a well-tuned Micro, the other looks
like a well-tuned Nano. A single config that is simultaneously "textbook" for one tier's RAM on one setting
and "textbook" for the *other* tier's RAM on a different setting is not evidence of per-tier tuning; it's
the signature of **one fixed config value applied to both tiers**, which happens to sit at a plausible
fraction of *either* RAM ceiling depending which GUC you look at.

**(b) Nano and Micro publish identical specs on every other dimension I could check**, which is the
positive case for (a)'s hypothesis. From `price-compute.md §1` (fetched from `supabase.com/docs/guides/platform/compute-and-disk`
and independently re-fetched by me this session, same numbers both times):

| Instance | Direct DB conns | Pooler (Supavisor) clients | Baseline IOPS | Baseline throughput |
|---|---|---|---|---|
| **Nano (free)** | 60 | 200 | 500 | 11 MB/s |
| **Micro** | 60 | 200 | 500 | 11 MB/s |

Every published number is **identical** between Nano and Micro except the price ($0 vs $10/mo) and the
RAM ceiling ("up to 0.5 GB" vs "1 GB" — note the hedging "up to" on Nano specifically, consistent with a
soft/burstable cgroup ceiling on the *same* underlying container class, not a physically different box).
The simplest explanation consistent with all of this is that **Nano is a Micro container with a lower
memory ceiling and free billing, not a separately-tuned smaller instance** — which means `shared_buffers`
being 224 MB is exactly what you'd expect to see **regardless of which one this project is on**, because
it's plausibly the same fixed value Supabase ships for both.

**Conclusion: live Postgres settings cannot distinguish Nano from Micro here.** This isn't a new
ambiguity — `price-compute.md §3` said as much ("Postgres settings alone leave Nano vs. Micro genuinely
ambiguous... saying 'this proves Micro' from the SQL alone would be an unsupported claim") — but this
session goes further and shows the ambiguity is actually **structural** (shared template), not just "we
don't have enough data." `model-tiers.md`'s attempt to break the tie with the ratio argument doesn't
survive being checked against its own second GUC.

**And `price-gotcha.md`'s "Pro" claim is circular, not independent.** Reading its Finding #4 in full: "the
tier RED runs on today **per the auth-structure audit**" — it is *importing* the prior 2026-07-27 audit's
unverified cost-table assumption ("Supabase Pro plan | $25", `auth-structure-scale-audit.md:131`), not
independently checking billing. That prior audit never verified the plan either — it's an assumption two
levels removed from any actual check. This is worth stating plainly because otherwise it reads as if two
independent agents corroborated "Pro" — they didn't; there is exactly one lineage of "Pro" assertions, and
it traces to nobody having looked.

`archive_mode=on` with an active `wal-g wal-push` command is **also not decisive**, for a similar reason:
Supabase's own engineering blog ("Continuous PostgreSQL Backups using WAL-G," `supabase.com/blog/continuous-postgresql-backup-walg`,
referenced via search 2026-07-28) describes WAL-G as core platform infrastructure — "on a daily basis,
WAL-G takes a snapshot of the database and sends it to Supabase's storage servers" — which plausibly runs
on **every** project regardless of tier, for the platform's own internal crash-recovery/replica-provisioning
needs. What differs by plan is very likely *retention and customer-facing exposure* (a "Backups" tab that
shows something, vs. one that says "Upgrade to Pro"), not whether the WAL archiver process itself is
switched on. I could not find a primary source stating archive_mode is Free-tier-disabled, and would
guess it is not. Treat this GUC as background noise, not a signal, in either direction.

---

## 4. What this means for the three-way disagreement

| Agent | Verdict | What it actually rests on | Standing after this check |
|---|---|---|---|
| `price-compute.md` | Free/Nano | AGENTS.md 402 + "no backups" memory (§2 above) | **Holds** — direct evidence, correctly caveated as inference-from-text, appropriately flagged its own confidence as not billing-API-verified |
| `price-gotcha.md` | Pro | Imported the prior audit's unverified cost-table line | **Does not hold** — circular, not an independent check (§3) |
| `model-tiers.md` | Leans Micro/Paid, CONTESTED | `shared_buffers` ratio vs Nano's RAM | **Does not hold** — the ratio argument is contradicted by its own sibling GUC and by Nano/Micro sharing identical published specs everywhere else (§3) |

Once the "Pro" and "leans Paid" arguments are set aside as unsupported, the only evidence that survives
scrutiny is `price-compute.md`'s original reasoning — which is why the verdict lands on **Free**, at
**medium** rather than high confidence, purely because that evidence is three weeks old and I have no way
to confirm nothing changed since (§5).

---

## 5. Why "medium," not "high," confidence

1. The two direct-evidence citations (§2) are dated **2026-07-05** and **2026-07-09** — roughly three
   weeks before this audit. Zero commits or memory entries anywhere in the repo's ~50-entry memory log
   mention a plan upgrade, a `$25/mo Pro subscription` starting, or any billing-page interaction since.
   Absence of a recorded upgrade is suggestive (this project's memory logs are unusually granular about
   operational changes) but is not proof nothing changed.
2. No MCP tool exposes Supabase's billing/organization-plan field. `execute_sql` reaches Postgres only;
   plan is an account-level fact that lives outside the database.
3. The compute-settings signal, which could have independently corroborated or refuted §2, turned out to
   be structurally uninformative (§3) rather than merely inconclusive — so there is no second independent
   line of live evidence to cross-check against, only the one from three weeks ago.

**Falsification check (Rule 3): what would have to be true for "Free" to be wrong?** Someone would have
had to open the Supabase dashboard and click Upgrade to Pro sometime between 2026-07-09 and today, for a
reason not recorded anywhere in commits, memory, or the docs tree. That is possible — solo founders do
things they don't always write down — but it is not the way to bet given how consistently this repo's
memory captures operational changes (compute, migrations, deploys, even a JWT-signing-key TODO) elsewhere.

---

## 6. What the owner must click to confirm this in 30 seconds

1. Open the Supabase dashboard for project `hjppxawglmukfvsgmcog`.
2. Either: **Organization Settings → Billing** and read the plan name at the top ("Free" / "Pro" / "Team"),
   **or**: **Project → Database → Backups** — if it shows a list of scheduled daily backups with a 7-day
   retention window, that's Pro; if it shows an upsell ("Upgrade to enable backups"), that's Free.
3. While there, note whether **PITR** is separately enabled (it is a distinct toggle from "on Pro," costs
   extra, and per `price-gotcha.md §5a` requires ≥Small compute) — this is a second fact, not implied by
   the plan name alone.

This single click resolves more than any further read-only SQL or web research can.

---

## 7. Backup/PITR posture, log retention, and the largest risk — BOTH cases, no hedging

### If FREE (my best-probability case)

| | |
|---|---|
| **Backups** | **None.** No automatic daily backups, no PITR available at any price. Supabase's own recommendation for Free projects: run `supabase db dump` manually and store it off-platform (fetched from `supabase.com/docs/guides/platform/backups`, 2026-07-27/28). |
| **Log retention** | 1 day DB/API logs, 1 hour Auth audit logs (`supabase.com/pricing`, fetched 2026-07-27). |
| **Largest single risk** | A bad migration, an accidental `DELETE`/`UPDATE` without a `WHERE`, or the kind of live-seed script this repo has already run more than once (`docs/superpowers/handoffs/2026-07-20-red-gym-seed-members-handoff.md`) has **zero vendor-side recovery path**. This project already holds real member PII and real sales/payment records for 4 live gyms (116 clientes, 175 ventas). A full-table mistake today is not "roll back to this morning" — it is gone, permanently, unless a manual `pg_dump` happens to exist from before the mistake and happens to include the `auth` schema (⚠️ `supabase db dump` **excludes `auth` by default** — noted independently in `docs/Context/2026-07-27-auth-structure-scale-audit.md:193`, worth re-flagging here since it compounds a Free-tier "no backups" situation with a manual-dump blind spot even if dumps *are* being taken). |

### If PRO (the less-probable case, but the one that matters if wrong)

| | |
|---|---|
| **Backups** | 7-day rolling daily physical backups, included. Gives an RPO of **up to ~24 hours** (last night's snapshot) — not continuous. |
| **PITR** | **Not automatic on Pro.** It's a separate paid add-on (`price-gotcha.md §5a`: 7d≈$100/mo, 14d≈$200/mo, 28d≈$400/mo) that **also requires ≥Small compute** (~$15/mo minimum, since Micro/Nano don't qualify) and, per Supabase's own docs, **enabling PITR turns off Daily Backups** — it replaces them, it doesn't add to them. So "on Pro" alone does not mean point-in-time recovery exists; it has to be separately purchased and someone has to have crossed the compute-tier gate to enable it. |
| **Log retention** | 7 days DB/API + Auth audit logs. |
| **Largest single risk** | Even in the best sub-case (daily backups active, PITR not purchased), RPO is ~24 hours, and — per the prior audit's vendor-risk section (`auth-structure-scale-audit.md §6`, external research) — Supabase's own control plane (project creation, resize, **restore**, PITR, backups) was "degraded across multiple regions for roughly two of the eight weeks preceding" that audit. A backup mechanism whose *restore* path has itself had recent multi-day regional outages is not a mechanism anyone should trust without having actually exercised it. And structurally, whether Free or Pro: Supabase-managed backups/PITR restore the **whole project** — there is no per-`gym_id` restore. Recovering gym #5's mistake would roll back gyms #1–4 too. |

### The risk that is identical in both cases, and is arguably the real finding here

**Nobody has run a restore drill, in either scenario, and nothing in this repo assigns ownership of that.**
`docs/adr/0006-respaldo-operational-export.md:17` asserts "Forge already has real DR: Supabase owns
point-in-time recovery of the database" as a settled premise — with no verification step attached, no date,
and (per §3–5 above) an assertion that is very likely simply **false** under the more-probable Free-plan
case, and even under Pro is true only if PITR was separately purchased, which nothing in this repo confirms.
An untested backup is not a backup regardless of which plan this turns out to be. The system is already
processing real member payments for real people. The highest-leverage single action available today is not
a code change — it's the 30-second dashboard check in §6, followed (if Pro-and-no-PITR, or if Free) by
actually buying the retention window and running one real restore against a scratch project, with the RTO
written down somewhere durable — because right now `docs/adr/0006` states a DR guarantee that has never
been tested and, on the more probable reading of the evidence, does not currently exist at all.

---

## 8. Blind spots — what I did not/could not examine

- **No billing-API MCP tool exists.** This entire verdict is inference from repo text + a Postgres GUC
  ratio that I ended up showing is uninformative. It is explicitly *not* a queried fact. The dashboard
  check in §6 is not a formality — it is the only way to actually know.
- **I did not test the "pauses after 7 days idle" Free-tier behaviour**, deliberately — this project has
  had continuous MCP + application traffic (I added 18 more `pg_stat_activity` connections just running
  this audit), so it would never trip that test regardless of plan, and deliberately idling a live
  payment-processing production database for a week to test a hypothesis would be reckless. Not attempted,
  correctly out of scope.
- **I could not verify Pro's actual "Active projects" limit** — `price-meters.md §1` found it "not
  documented" in Supabase's own pricing table for Pro (only Free's "Limit of 2" is stated). The "org still
  has exactly 2 projects" observation in §2 is therefore weak corroboration, not proof, since I don't know
  whether 2 would also be unremarkable on Pro.
- **I did not check whether `archive_mode=on` is genuinely universal across Supabase's fleet** — I
  reasoned from one blog post describing WAL-G as platform infrastructure and could not find a primary
  source stating explicitly "this GUC is identical on Free." Flagged in §3 as the weakest link in that
  paragraph specifically, even though it doesn't change the overall verdict either way.
- **I did not re-derive or challenge the cost-model numbers** (`model-tiers.md`'s $17/mo meter bill, the
  compute-ladder G² finding, etc.) — those stand or fall independently of the plan-tier question and are
  out of this mandate's scope.
- **Three weeks is my own uncertainty window, and I have no way to shrink it further from here.** If this
  matters enough to act on before the owner opens the dashboard, the safe assumption to build a runbook
  around is "no backups exist," because that is true in the more-probable case and merely over-cautious
  (not wrong) in the less-probable one.
