# Agent: price:compute — Supabase Compute Ladder Audit

Date: 2026-07-27. Scope per mandate: the Supabase COMPUTE ladder (instance sizes, price, RAM, vCPU,
connections, disk IOPS/throughput) plus the DISK dimension (gp3/io2, overage pricing, autoscale/growth
policy), then: which compute size does our live instance (`max_connections=60`, `shared_buffers=224MB`)
correspond to, what does it cost, and the next 3 rungs with price deltas. Ranked 5 worst properties at
the end.

All pricing fetched live via `WebFetch` against Supabase's own docs/pricing pages on 2026-07-27. Where
the fetch tool declined to reproduce a table verbatim (fair-use policy on one page), I cross-checked the
numbers against a second, independent fetch of the same figures and note where that happened.

---

## 1. The compute instance ladder (primary source: supabase.com/pricing, supabase.com/docs/guides/platform/compute-and-disk and compute-add-ons — fetched 2026-07-27)

| Instance | $/month | vCPU | RAM | Max direct DB connections | Max pooler (Supavisor) clients | Baseline IOPS | Baseline throughput |
|---|---|---|---|---|---|---|---|
| Nano (Free only) | $0 | 2-core shared, ARM | ≤0.5 GB | 60 | 200 | 500 | 11 MB/s |
| Micro | $10 | 2-core shared, ARM | 1 GB | 60 | 200 | 500 | 11 MB/s |
| Small | $15 | 2-core shared, ARM | 2 GB | 90 | 400 | 1,000 | 22 MB/s |
| Medium | $60 | 2-core shared, ARM | 4 GB | 120 | 600 | 2,000 | 43 MB/s |
| Large | $110 | 2-core dedicated, ARM | 8 GB | 160 | 800 | 3,600 | 79 MB/s |
| XL | $210 | 4-core dedicated, ARM | 16 GB | 240 | 1,000 | 6,000 | 149 MB/s |
| 2XL | $410 | 8-core dedicated, ARM | 32 GB | 380 | 1,500 | 12,000 | 297 MB/s |
| 4XL | $960 | 16-core dedicated, ARM | 64 GB | 480 | 3,000 | 20,000 | 594 MB/s |
| 8XL | $1,870 | 32-core dedicated, ARM | 128 GB | 490 | 6,000 | 40,000 | 1,188 MB/s |
| 12XL | $2,800 | 48-core dedicated, ARM | 192 GB | 500 | 9,000 | 50,000 | 1,781 MB/s |
| 16XL | $3,730 | 64-core dedicated, ARM | 256 GB | 500 | 12,000 | 80,000 | 2,375 MB/s |
| >16XL | Contact Sales | custom | custom | — | — | — | — |

Notes confirmed from the docs pages directly:
- "Nano" only exists on the **Free plan**; it is billed at the same nominal price as Micro if it ever
  appears on a paid org, and **"You cannot launch Nano instances on paid plans, only Micro and above."**
- Pro/Team plan's $25/month base **includes $10/month in compute credits, which covers one Micro
  instance** — i.e., the first Micro compute add-on is effectively "free" on top of the $25 base; any
  size above Micro is billed as (listed price − $10 credit).
- "Compute instance size changes will not change your selected disk type or disk size, but your IO
  limits may change according to what your selected compute instance size supports" (compute and disk
  are billed/managed independently).
- Direct connections cap out completely at **500** starting at 12XL ($2,800/mo) — paying the extra
  $930/mo to reach 16XL ($3,730/mo) buys **zero additional direct connections**, only more pooler
  clients, RAM and CPU.
- Downtime on a compute resize: **"Compute instance changes are usually applied with less than 2
  minutes of downtime, but can take longer depending on the underlying Cloud Provider."** Also:
  **"Compute sizes are not auto-upgraded because of the downtime incurred."** — i.e. there is no
  autoscaling for compute, ever; someone has to notice pressure and manually trigger the resize.

Fetched: https://supabase.com/pricing (2026-07-27), https://supabase.com/docs/guides/platform/compute-and-disk (2026-07-27), https://supabase.com/docs/guides/platform/compute-add-ons (2026-07-27), https://supabase.com/docs/guides/troubleshooting/how-to-change-max-database-connections-_BQ8P5 (2026-07-27, confirms the direct-connection column independently — matches).

---

## 2. The disk dimension (not touched by the previous audit)

Fetched from https://supabase.com/pricing and https://supabase.com/docs/guides/platform/compute-and-disk, 2026-07-27.

| Disk type | Included | Overage $/GB-mo | Included IOPS | Overage $/IOPS-mo | Included throughput | Overage $/MB/s-mo | Max size |
|---|---|---|---|---|---|---|---|
| gp3 (General Purpose) | 8 GB | $0.125 | 3,000 | $0.024 | 125 MB/s | $0.095 | 16 TB |
| io2 (High Performance) | not documented on the fetched pages (defaults to provisioned) | $0.195/GB-mo | provisioned, no free tier stated | $0.119/IOPS-mo | scales automatically with provisioned IOPS | — | 60 TB |

**Growth/autoscale policy** (from a second WebSearch of Supabase's own docs/dashboard changelog, corroborated by the compute-and-disk page's statement that disk can only grow, cross-checked 2026-07-27):
- Autoscaling triggers when disk usage hits **90%** of the currently allocated size.
- The automatic resize adds **an additional 50%** of current size, **capped at +200 GB per event**.
- **"You can increase disk size but cannot decrease it."** — disk growth is a **one-way ratchet**, no
  shrink path except a full project migration (dump/restore into a new, smaller-disk project).
- Disk attributes (size/IOPS/throughput) can be modified **up to 4 times within a rolling 24-hour
  window** — a soft rate-limit on manual tuning, not a specific "minimum billing window," but it does
  mean you cannot correct an autoscale-triggered jump and immediately re-shrink-equivalent within the
  same day even if you wanted to (and you can't shrink at all regardless).
- I could not get a directly-quoted number for how long a disk-size resize itself takes to complete
  (as opposed to compute resize's documented "<2 min"); Supabase's docs did not state this on the pages
  I fetched. Flagged as an open question below, not asserted.

---

## 3. Which compute size is our live instance actually on?

Live query against the production project (hjppxawglmukfvsgmcog), executed via `mcp__supabase__execute_sql`, 2026-07-27:

```sql
select name, setting, unit, source from pg_settings
where name in ('max_connections','shared_buffers','effective_cache_size','work_mem',
'maintenance_work_mem','max_parallel_workers','max_worker_processes','max_wal_size',
'autovacuum_max_workers','wal_buffers','max_parallel_workers_per_gather')
order by name;
```
Result (abbreviated to the load-bearing rows):
```
max_connections            = 60
shared_buffers             = 28672 (×8kB) = 229,376 KB = 224.0 MB   <- matches baseline exactly
effective_cache_size       = 49152 (×8kB) = 393,216 KB = 384 MB
work_mem                   = 2184 KB ≈ 2.13 MB
maintenance_work_mem       = 32768 KB = 32 MB
wal_buffers                = 492 (×8kB) ≈ 3.84 MB
max_parallel_workers       = 2
max_worker_processes       = 6
max_wal_size                = 1024 MB
```

**On `max_connections` + `shared_buffers` alone, this is NOT distinguishable between Nano and Micro** —
Supabase's own docs publish **identical** direct-connection (60) and pooler (200) ceilings for both
tiers (confirmed via the troubleshooting connections page, fetched 2026-07-27), and Supabase does not
publish a `shared_buffers`-by-tier table anywhere I could find (checked the compute-add-ons page and
searched; not published). So the Postgres settings alone leave Nano vs. Micro genuinely ambiguous —
saying "this proves Micro" from the SQL alone would be an unsupported claim.

**What resolves the ambiguity is the repo's own primary-source text, not the SQL.** `AGENTS.md` (checked
into this repo) states, describing the `test:denial` gate: *"it needs a `SUPABASE_ACCESS_TOKEN` and a
throwaway scratch project (**preview branching is Pro-gated / 402**; the free tier fits exactly one
scratch beside live)."* An HTTP 402 on branching only happens when the org is **not** on a paid plan —
branching is a Pro-plan feature. "The free tier fits exactly one scratch beside live" states directly
that the **live (production) project itself sits on a Free-tier org's two-project allowance**. This is
independently corroborated by prior-session memory ("Phase 3 RLS execution progress": *"free tier = no
backups → manual pre-gate dumps"*, stated about the live project needing manual dumps because it has no
automatic backups — a Free-plan characteristic; Pro includes 7-day backup retention per the pricing page
fetched above).

Per Supabase's own plan rules (pricing page, fetched 2026-07-27): **Free-plan projects run on Nano
compute, and paid orgs cannot even launch a Nano instance** — Nano is exclusively a Free-plan artifact.

**Conclusion: the live production database is on Nano compute, $0/month, under Supabase's Free plan —
not a paid Micro instance.** Confidence: high on the org-plan fact (two independent primary-source
citations from this repo/session), but I flag explicitly that I have no MCP-exposed way to read the
Supabase org's billing/plan field directly from SQL — this is inferred from documented text, not queried
from a billing API. **Exit trigger / falsification check: open the Supabase dashboard's Billing page for
this org.** If it says "Pro," this entire finding is wrong and the instance is a $10/mo (net $0 after
credit) Micro instead of $0/mo Nano — everything else in §1/§2 is unaffected either way, but §5 finding
#1 below would need to be withdrawn. I could not perform this check myself (no billing-API MCP tool was
available to me; only Postgres SQL access).

Live corroborating data point: `pg_database_size` = 15 MB (matches baseline exactly); current
`pg_stat_activity` connection count = **12 of 60** in use. Breaking this down by `application_name`:
2× `postgrest` (authenticator role), 2× unnamed `supabase_admin`, 1× `postgres_exporter`, 1× `pg_cron
scheduler`, 1× `pg_net`, 1× `mgmt-api` (this MCP session), 5× unnamed/null. **All 12 are Supabase
platform-internal connections — zero are traceable to `apps/admin` or `apps/client` directly.** A grep
of `packages/data` (the sole DB-access layer per `ARCHITECTURE.md`'s boundary) found no `postgres://`,
`pg.Pool`, or raw `Client(` usage anywhere in production code — only in `supabase/tests/*.sql` (test
fixtures) and planning docs. Both apps talk to Postgres exclusively via `@supabase/supabase-js`
(PostgREST REST/RPC over HTTPS), never the raw wire protocol. **This means the naive "12/60 already used
at 4 gyms → 60 exhausts at ~20 gyms" extrapolation is FALSE** (checked per rule 3): those 12 connections
are fixed platform overhead that does not scale with gym or member count. The real per-request
concurrency ceiling for this app's actual traffic pattern is **PostgREST's own internal `db-pool`
setting** (a Supabase API-config value, separate from `max_connections`), which I could not find
published as a per-compute-tier table anywhere (searched; Supabase's own community discussions confirm
it's independently configurable but don't publish tier defaults). This is a genuine blind spot, not a
resolved number — see §6.

---

## 4. Next 3 rungs up from current (Nano, $0/mo)

| Rung | Instance | Nominal $/mo | Effective $/mo (after Pro's $10 credit, on top of the mandatory $25 Pro base) | RAM | Direct conn | Pooler conn |
|---|---|---|---|---|---|---|
| 0 (current) | Nano | $0 | — (Free plan, no Pro base) | ≤0.5 GB | 60 | 200 |
| 1 | Micro | $10 | **$25** (credit fully offsets it; this is the mandatory first paid rung — you cannot buy Small directly from Free without first crossing the Pro-base $25) | 1 GB | 60 | 200 |
| 2 | Small | $15 | **$30** ($25 base + $15 − $10 credit) | 2 GB | 90 | 400 |
| 3 | Medium | $60 | **$75** ($25 base + $60 − $10 credit) | 4 GB | 120 | 600 |

Price delta rung-to-rung: Nano→Micro = **+$25/mo** (the org-plan jump, not the compute jump — this is
the real first cliff, see §5). Micro→Small = **+$5/mo** net. Small→Medium = **+$45/mo** net (a 1.5×
sticker jump on compute, but RAM only 2×) — this is the second, sharper cliff (§5).

---

## 5. Five worst properties of this ladder, ranked worst first

**1. The production database is currently running on the $0 Free plan (Nano), which means no
point-in-time recovery, no automatic backups (manual dumps only per the repo's own operational notes),
1-day log retention, and enrollment in Free plan's documented "projects paused after 1 week of
inactivity" policy — while already processing real member payments through gym-operated BYO-Stripe
integrations across paying customers.**
This is not a future scaling problem; it is a live operational-risk finding about *today's* state,
surfaced by a mandate that was scoped to "the compute ladder" and happened to reveal the tier
identification itself was the finding. Falsification check performed: I could not directly query
billing-plan from SQL, so I relied on two independent primary-source citations already in this repo
(`AGENTS.md`'s 402-branching note, and prior-session memory's "free tier = no backups" note) — both
point the same direction. Exit trigger: a 30-second look at the Supabase dashboard Billing page settles
this definitively; if it says Pro, withdraw this finding and treat the instance as Micro ($10 nominal /
$0 net under the Pro credit) instead — the backups/log-retention/pause risks then disappear, but the
$0-cost basis in the previous audit's "$0.53–1.04/gym/mo" model would need to be reconciled against an
already-paid $25/mo Pro base either way.

**2. Disk growth is a one-way ratchet: "You can increase disk size but cannot decrease it," and the
default autoscale policy is aggressive — triggers at 90% full, jumps +50% (capped +200GB) per event.**
A single bad migration, an unbounded backfill/seed script, or index bloat from a forgotten `VACUUM` can
permanently inflate the paid disk bill with no path back down short of a full dump/restore into a new
project. At $0.125/GB-mo (gp3) this is cheap per-incident, but it compounds silently over the project's
life with zero automatic remediation — every accidental spike is permanent. Breaks at: the first time
disk usage crosses 90% of allocation, which (per §6 below) could be as early as low hundreds of gyms
depending on real per-member accumulation, not the 3,000-gym target.

**3. Cliff-shaped $/GB pricing on the compute ladder — the "obvious next tier" is sometimes the worst
deal per GB.** Computed directly from §1's official numbers:
Micro $10.00/GB, Small $7.50/GB, **Medium $15.00/GB** (a 2× jump in $/GB from Small), Large $13.75/GB,
XL $13.125/GB, 2XL $12.81/GB, **4XL $15.00/GB** (spikes again from 2XL's $12.81/GB), 8XL $14.61/GB, 12XL
$14.58/GB, 16XL $14.57/GB. A team scaling gym count in real time and naively "bumping one tier" at the
Small→Medium boundary pays 4× more sticker price ($15→$60) for RAM that costs *more* per GB than what
they were already paying — Large (8GB, $110) is a strictly better $/GB deal than Medium (4GB, $60) and
sits one rung further away.

**4. The direct-connection ceiling is a red herring for this app's actual bottleneck, and the real
ceiling is unmeasured.** `apps/admin` and `apps/client` use exclusively `@supabase/supabase-js`
(confirmed via grep — zero raw `postgres://`/`pg.Pool` in `packages/data`), so all traffic funnels
through PostgREST, not the `max_connections=60` (or even Supavisor's 200-pooler-client) ceiling
published in §1. PostgREST maintains its **own** internal `db-pool` setting, independently configurable,
whose per-compute-tier default is **not published anywhere in Supabase's docs** (searched; only that it
exists and is user-tunable). Live evidence: PostgREST currently holds only 2 of the 12 active
connections while serving all app traffic for the whole project. This is a genuine unknown that the
published compute ladder does not answer — the ladder's headline connection numbers are not the number
that will actually throttle this specific app's request concurrency at scale.

**5. Compute never autoscales, and every resize is a discrete manual step with real downtime — while
disk autoscales silently and irreversibly.** "Compute sizes are not auto-upgraded because of the
downtime incurred" and a resize takes "usually... less than 2 minutes... but can take longer depending
on the underlying Cloud Provider." Given the shared-multi-tenant-compute-plane design (one Postgres
instance for every gym, per `ARCHITECTURE.md`/ADR-0012 — no per-gym isolation), a capacity-planning miss
converts into a simultaneous outage window for every gym transacting at that moment, and recovering
requires someone to notice pressure (connection saturation, CPU/RAM exhaustion) and manually trigger the
resize — there is no automatic safety net on the compute axis the way there is (over-aggressively) on
disk.

**Honesty note (rule 7):** the ladder is not uniformly bad. From Large upward (8 GB→256 GB), $/GB stays
in a tight $13.13–$14.61 band — no further nasty cliffs once past Medium/4XL — and the raw gp3 disk
overage price ($0.125/GB-mo, 8 GB included free) is not obviously predatory on its face (no
externally-fetched AWS EBS baseline was compared here, so I'm not asserting a margin number, just noting
the sticker price is not exotic). If this project genuinely needs to reach Large/XL for RAM headroom, the
per-GB economics there are fine; the traps are specifically at the Free→Paid transition (finding #1) and
the Small→Medium step (finding #3), not at the top of the ladder.

---

## 6. The 500 MB Free-tier database cap: when does storage alone force an exit, independent of finding #1?

Free-plan database size cap, per pricing page fetched 2026-07-27: **500 MB**. Modeled from live baseline
bytes/row and row counts (all figures given in the mandate/baseline, cross-checked against `pg_database_size`
= 15 MB measured live):

Member-linked rows (scale with member count): clientes 1,483 B/row, ventas 936 B/row, asistencias 558
B/row, reservation 602 B/row. At current 116 clientes: (172,028+163,800+393,390+278,726) B = 1,007,944 B
→ **8,689 B/cliente** at today's accumulation ratio.

Gym-linked rows (scale with gym count, not member count): class_session 613 B/row × 548 = 335,924 B;
schedule_template_week (bytes/row not separately given in the baseline — estimated at the class_session
rate as the closest proxy, flagged as an assumption) × 544 ≈ 333,472 B. Total ≈ 669,396 B / 4 gyms ≈
**167,349 B/gym**.

Overhead (everything else — catalogs, extension schemas for the 10 preloaded extensions, `auth.*`,
indexes/tables not in the baseline list): 15 MB − 1.6 MB measured content ≈ **13.4 MB**, treated as
roughly fixed for this estimate.

At N gyms × M=225 avg members (midpoint of the 150–300 target), **holding today's per-member
accumulation ratio constant**:
```
budget = 500 MB − 13.4 MB overhead ≈ 487 MB ≈ 510,888,000 B
per-gym marginal = 225 × 8,689 B + 167,349 B ≈ 2,122,419 B/gym
N_break = 510,888,000 / 2,122,419 ≈ 240.7 gyms
```
**≈240 gyms** (at 225 avg members each) exhausts the Free plan's 500 MB cap under a constant-density
model — about **8% of the 3,000-gym target**. This is explicitly an **optimistic upper bound**: real
`asistencias`/`ventas`/`reservation` rows accumulate with account *tenure*, not just member count, and
today's ratio is measured from a very young dataset (the RED gym seed is weeks old per session memory).
A mature multi-year tenant will have a materially higher bytes/member ratio than this snapshot, so the
true breaking point is very likely **lower than 240 gyms**, not higher. Either way: the storage cap alone
— completely independent of finding #1's backup/pause/log-retention risks — already forces an exit from
Free tier at a small fraction of the target scale.

---

## Blind spots — what I did not examine

- **Could not directly verify the org's billing plan.** No MCP tool exposed Supabase's billing/plan API;
  the Nano/Free conclusion in §3/§5#1 rests on two textual primary-source citations from this repo/session,
  not a queried billing field. This is the single highest-value thing for the owner to check directly.
- **PostgREST's actual `db-pool` value and its scaling behavior per compute tier** — flagged in §5#4 as
  unpublished by Supabase and unmeasured by me; I did not attempt a load test against the live project
  (correctly out of scope — this session is read-only, no writes/DDL, and a load test risks impacting a
  live production database serving real gyms).
- **io2 included-GB baseline** — I could not get a citation for whether io2 has any included-GB
  allowance the way gp3 does (8 GB); the pages I fetched only gave the overage rate ($0.195/GB-mo). Not
  asserted either way.
- **Exact disk-resize duration** (as distinct from compute-resize's documented "<2 min") — not found on
  the pages I fetched; Supabase may not publish this.
- **No comparison against AWS's own raw EBS pricing** to quantify Supabase's margin on gp3/io2 overage —
  deliberately not asserted since I did not fetch an AWS pricing page this session (rule 6 requires a
  fetched primary source for every price claim; I chose not to speculate rather than cite from memory).
- **schedule_template_week's actual bytes/row** was not given in the mandate's baseline and I estimated
  it from `class_session`'s rate as a proxy in §6 — flagged inline, could be materially wrong in either
  direction.
- I did not cross-reference this ladder against the companion audits (`auth-structure-scale-audit.md`,
  `multigym-rpc-scoping-decision-memo.md`) beyond reading their existence — no attempt to reconcile my
  $0/mo Nano finding against whatever cost basis the prior audit used for its "$0.53–1.04/gym/mo" figure;
  that reconciliation is the synthesizer's job, not mine, per my mandate.
