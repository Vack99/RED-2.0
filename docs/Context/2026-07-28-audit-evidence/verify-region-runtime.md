# verify:region-runtime — independent verification of the claimed permanent latency tax

Date: 2026-07-28. Mandate: verify workflow-1's arch:runtime claim that the Supabase DB (Oregon)
and Vercel functions (Virginia) are cross-continent, that ~8 sequential PostgREST round trips
happen per member render, and that three repo docs falsely assert region co-location was verified.

Verdict up front: **all five sub-claims verify true**, with precision added on (d)/(e).

---

## (a) Supabase project's actual region

**Verdict: CONFIRMED us-west-2 (Oregon). High confidence — three independent, live-fetched signals agree.**

1. **DNS**: `db.hjppxawglmukfvsgmcog.supabase.co` resolves to `2600:1f13:5fd:be02:ee46:157e:2c08:36a5` (nslookup, run 2026-07-28).
2. **Live SQL, from inside the running server**: `select inet_server_addr()` against the live project via MCP returned the **identical** address: `2600:1f13:5fd:be02:ee46:157e:2c08:36a5`, port 5432, `server_version 17.6`. This is not a DNS/CDN artifact — it is the Postgres backend's own socket address.
3. **RIPEstat whois** on that /36 (fetched 2026-07-28): `route6 2600:1f13::/36`, `origin AS16509` (Amazon), `descr "Amazon EC2 PDX prefix"`. PDX = Portland, the airport-code convention AWS uses for us-west-2.
4. **ipinfo.io geolocation** on the same address (fetched 2026-07-28): `city: Boardman, region: Oregon, country: US, org: AS16509 Amazon.com, Inc.` — Boardman, OR is one of AWS's three physical us-west-2 data-center sites (public knowledge; Boardman/Umatilla/Morrow County).

Note the project's REST/Auth endpoint (`hjppxawglmukfvsgmcog.supabase.co`, no `db.` prefix) resolves to Cloudflare edge IPs (`172.64.149.246`, `104.18.38.10`) — Supabase fronts PostgREST/Auth with Cloudflare, so the app's actual HTTP calls don't take a raw AWS-backbone path end-to-end. This doesn't change the region finding (the origin is still us-west-2) but softens claim (e)'s precision — see below.

I cannot read the Supabase dashboard's "Project Settings → General → Region" field directly (no filesystem/browser access to it), so this is inference from network signals, not a first-party label. Three independent signals converging on the same physical location is about as close to certain as read-only DB access permits.

---

## (b) `vercel.json` anywhere in the repo

**Verdict: CONFIRMED — no `vercel.json` exists anywhere in the repo.**

```
find . -iname "vercel.json" -not -path "*/node_modules/*"   → zero hits (checked both the primary
  checkout and the one existing worktree, .claude/worktrees/issue-89-attendance-ledger)
```

Also checked `apps/admin/next.config.ts` and `apps/client/next.config.ts` (full contents read) — neither
declares `regions`, `preferredRegion`, or any Vercel-specific config; both are `transpilePackages` +
`typedRoutes` only. Grepped both app trees for `preferredRegion` / `regions:` / `"regions"` — zero hits.

Conclusion: nothing in-repo pins a function region. Per Vercel's own docs (fetched 2026-07-28,
`vercel.com/docs/regions`, page dated 2026-03-05): **"Vercel Functions default to running in the iad1
(Washington, D.C., USA) region... for all new projects."** Region can *only* be changed via a
`vercel.json` `regions` key, the Vercel CLI `--regions` flag, or the dashboard's Settings → Functions
→ Function Regions panel — none of which leave a trace in this repo. Absent a `vercel.json` and absent
any record that the dashboard toggle was ever touched (see (c) — the one HITL step designed to record
this was never filled in), the most defensible read is: **both Vercel projects are still on the iad1
default.** This can't be verified with 100% certainty without dashboard access, but there is no
repo-side evidence of an override, and the step that would have recorded one is confirmed blank.

---

## (c) hitl-16 and the three docs that cite it as "already recorded"

**Verdict: CONFIRMED. The source is a blank template; three other docs cite it as if it were filled in.**

Source, `docs/runbooks/hitl-16-vercel-deploy-verify.md:81-84`:
```
**Region co-location (5-minute check, do it while you're in both dashboards):** look up the Supabase project's
region (Supabase → Project Settings → General) and set **both** Vercel projects' function region to the matching
one (Vercel → Settings → Functions). A mismatch taxes every SSR render ~60–70ms × each sequential PostgREST
call — permanently, for every gym. Record the pair here once confirmed: `Supabase: ____ · Vercel: ____`.
```
That is the literal, unfilled template — never a value, never touched since authored. The acceptance
checklist at line 126 ("Supabase + Vercel function regions confirmed co-located and recorded (Step 3)")
is also unticked (`- [ ]`).

Three separate docs assert this was done:

1. `docs/prompts/2026-07-01-phase3-tenant-rls-kickoff.md:16` — "...docs/runbooks/hitl-16-vercel-deploy-verify.md
   (the HITL gate pattern to clone; **finding 15 region co-location is already recorded there**, step 3 +
   checklist — verify, don't redo)."
2. `docs/superpowers/plans/2026-07-05-issue28-live-cutover.md:158` — "...(hitl-16 predates the DB-backed
   resolver); **region co-location already recorded there** — verify, don't redo"
3. `docs/runbooks/hitl-28-live-cutover-deploy-verify.md:89` — "**Region co-location:** set during #16 —
   confirm the Supabase/Vercel region pair **recorded** in `hitl-16-vercel-deploy-verify.md` Step 3
   still holds. Verify, do not re-tune."

By contrast, `docs/superpowers/audits/2026-07-01-multitenant-branding-scale-audit.md:79` (the audit
that ORIGINATED finding-15) is honest about it: "Vercel function region vs Supabase region co-location
is **unverified and recorded nowhere**." So the drift is traceable: the audit correctly said "unverified,"
a later doc (phase-3 kickoff, 2026-07-01, same day) mis-cited it as "already recorded" in hitl-16, and
two more docs (2026-07-05) propagated that error forward, instructing future humans to "verify, don't
redo" a check that was never done once. `docs/Context/2026-07-27-auth-structure-scale-audit.md:192`
(yesterday's audit) independently re-flags the same gap ("Confirm the current region and write it into
an ADR so nobody 'fixes' it later") — a fifth doc, written without citing hitl-16, arriving at the same
"still unconfirmed" conclusion. Five docs, one correct chain of reasoning, three broken citations.

---

## (d) Sequential DB round trips on the member render path

**Verdict: PARTIALLY CONFIRMED, with real precision added.** The current code (post `PERF-LOOP.md`
optimization, which closed 2026-07-14/15) is meaningfully leaner than a naive read would suggest, but a
genuine ~7-9-deep sequential chain still exists, and "~8" is a defensible midpoint, not an exaggeration.

Traced `apps/client/src/app/reservar/page.tsx` (the member booking home) end-to-end, including the
`proxy.ts` middleware that runs before it:

**`apps/client/src/proxy.ts`** runs on every navigation (matcher excludes only static assets):
- `resolveTenant()` (`packages/data/src/server/resolve-tenant.ts`): 60s in-process TTL cache, module-level.
  On a cache **hit**: 0 round trips. On a **miss** (cold Vercel function instance — routine on serverless,
  where concurrent invocations spin up separate instances that don't share the module-level `Map`):
  `gym_domain` lookup **then** (sequentially, awaited) the `gym` row lookup = **2** sequential round trips
  (`resolve-tenant.ts:121-129`, `resolveHostUncached` → `gymTenant`).
- `supabase.auth.getClaims()` (`proxy.ts:79`) — a **second, independent** `getClaims()` call, explicitly
  documented in the same file's own comment (lines 26-30) as necessary because the page-level `getClaims()`
  call is a *different* invocation that would otherwise see a stale cookie. Whether this costs a network
  round trip depends on the JWT signing-key config (next paragraph).

**`apps/client/src/app/reservar/page.tsx`**:
- `supabase.auth.getClaims()` (line 54) — the page's OWN, separate `getClaims()` call.
- `getEsMiembro(supabase)` (line 58) — 1 round trip (`gym_membership` select, distinct query shape from
  `resolverMiembroGym`, not deduped by React `cache()`).
- Then `Promise.all([getAgendaSemanaMiembro, getSaldoMiembro, getPerfilResumenMiembro])` (line 77-81) — all
  three share one `resolverMiembroGym()` call via React `cache()` (verified: `agenda-miembro.ts:140-161`,
  docstring explicitly documents this collapsed "3 independent sequential 2-query pairs (6 round trips)"
  into 1) = **1** round trip, shared.
  - **Agenda branch** (`fetchSesionesMiembro`, `agenda-miembro.ts:182-260`): `class_session` select
    (sequential, needs the row ids first) → `Promise.all(class_type, class_session_coach, reservation,
    fetchClienteRow via fetchFavoritoId, contarActivos RPC)` (5-way parallel = 1 round) → conditional
    `coachesRes` if any session has an assigned coach (typical case) = **3 sequential rounds**.
  - **Perfil branch** (`getPerfilResumenMiembro`, lines 516-566), running in parallel with the agenda
    branch: shared `fetchClienteRow` (deduped with agenda's) → `Promise.all([fetchProximasReservas,
    fetchMembresia (rpc `mi_membresia`), getPlanesPublicos])` → inside `fetchProximasReservas`
    (lines 581-652): `reservation`+`class_session` embedded select → `Promise.all(class_type,
    class_session_coach, favoritoId[cache-shared, free])` → conditional `coachesRes` = **3 sequential
    rounds**, same depth as the agenda branch, running concurrently with it (not additive).

**JWT signing-key state (governs whether each `getClaims()` costs a round trip):** `PERF-LOOP.md`
flags this explicitly as a "known unknown": *"`getClaims()` verifies locally ONLY with asymmetric
signing keys (ES*/RS* + JWKS). On the legacy HS256 secret it silently falls back to `getUser()` = one
auth-server round trip per request per app... Check the prod project's signing-key config; migrating to
asymmetric keys is a dashboard action, not code."* This was never resolved — it is still an open item in
the same file's "Ship runbook" step 5. I checked the live schema for a signal: `select table_name from
information_schema.tables where table_schema='auth'` lists 22 tables, **none named `jwks`/`jwt_keys`**
(query run against live prod via MCP, 2026-07-28) — consistent with (though not 100%-proof of) the
project never having had asymmetric JWT signing keys provisioned. Supabase's own docs confirm new
projects default to asymmetric JWTs only **from 2026-10-01 onward**; this project's `auth` schema
predates that. On the balance of evidence, **each `getClaims()` call is very likely still a network
round trip today** — and there are TWO of them per render (proxy + page), not one.

**Total sequential depth, `/reservar`, steady state (already-a-member, typical class has a coach assigned):**

| scenario | tenant-cache | JWT verify | total sequential rounds |
|---|---|---|---|
| best case | warm | local (asymmetric) | 2 (getEsMiembro+resolverMiembroGym) + 3 (branch) = **5** |
| typical/worst case | cold (fresh serverless instance) | network (legacy HS256, current live evidence) | 2(tenant)+1(proxy claims)+1(page claims)+1+1+3 = **9** |

**"~8" lands almost exactly at the upper-middle of the independently-derived 5–9 range**, and given the
live evidence (no JWKS table → likely still HS256; Vercel serverless instances routinely start cold,
so the 60s TTL cache is not a reliable warm-hit in practice) the realistic common case sits at the
**upper end (7–9)**, not the lower. Verdict: **directionally confirmed**, precise count is workload/cache-
state-dependent rather than a fixed constant, and the claim is NOT an exaggeration of the current,
already-perf-tuned code — it is close to the honest current number. (Before the 2026-07-14/15
`PERF-LOOP.md` work this would have been meaningfully higher — that document records `resolverMiembroGym`
alone going 6→2→1 round trips and `fetchProximasReservas` 2→1 across its optimization waves.)

All the rounds above genuinely run **sequentially** relative to each other within a branch (each
`await`s the previous); rounds WITHIN a `Promise.all` are genuinely parallel. This matches the
workflow-1 claim's "sequential… round trips" framing accurately — it is not describing 8 fully serial
single queries, it's 5-9 serial *waves*, several of which parallelize several queries inside them.

---

## (e) The true latency cost

**Verdict: CONFIRMED — a real, permanent, per-render tax in the hundreds of ms.**

Cross-country AWS inter-region RTT, `us-east-1` (Virginia, = Vercel's `iad1`) ↔ `us-west-2` (Oregon,
confirmed DB region), two independent sources fetched 2026-07-28:
- **AWS's own documentation** (`docs.aws.amazon.com/network-manager/.../nmip-performance-cli.html`),
  a `GetAwsNetworkPerformanceData` example querying `Source=us-east-1,Destination=us-west-2,
  Metric=aggregate-latency,Statistic=p50`: returned values **62.44–62.77 ms** across six 5-minute
  windows (example dataset, 2022-10-26, but this is AWS's own reference figure for this exact region
  pair on AWS's backbone).
- **latency.bluegoat.net** (AWS inter-region latency matrix, live-fetched 2026-07-28): **~69 ms**
  average, symmetric, for the same pair.

Using **~60–70 ms per sequential round trip** (backbone figure; the app's actual HTTP calls route through
Cloudflare in front of PostgREST/Auth — see (a) — so real figures could differ somewhat from pure
AWS-backbone numbers, but not by an order of magnitude; no more precise measured figure for the exact
Vercel↔Supabase HTTP path was available without live traffic access):

| depth | tax (×65ms center) | tax range (×60-70ms) |
|---|---|---|
| 5 rounds (best case) | 325 ms | 300–350 ms |
| 9 rounds (typical/worst case) | 585 ms | 540–630 ms |

This is a **pure network tax, additive on top of actual query/render time** — `PERF-LOOP.md`'s own
local (co-located, Docker) baseline for this exact route after full optimization is **44.1–46 ms p50**
(runs 015/016/final-confirm, "LOOP CLOSED"). If the region mismatch is real and unfixed, the honest
production number for `/reservar` is **not** ~45 ms, it's plausibly **~400-650 ms**, an order of
magnitude off from what the local gate reports — exactly the caveat `PERF-LOOP.md` itself raises three
separate times ("KNOWN UNKNOWN: region colocation is unconfirmed... determines how well these local
numbers transfer") but never resolves. Workflow-1's headline figure and the repo's own audit finding-15
estimate ("~200–400ms tax") is, if anything, **conservative** relative to my recomputation once the
actual current round-trip depth (5-9, not the finding's unstated assumption) and the measured 60-70ms
(not a lower guess) are both plugged in.

---

## (f) Cost to fix, and downtime

**Verdict: CONFIRMED CHEAP on the Vercel side; the Supabase-side migration (if ever wanted) is a real
but bounded and NOT-required undertaking.**

**The fix that actually matters — pin Vercel's function region to match Supabase's Oregon location.**
Vercel's region list (fetched 2026-07-28, `vercel.com/docs/regions`) includes `pdx1 = us-west-2,
Portland, USA` — the **same AWS region** the live DB resolves to. Per Vercel's own guidance
(`vercel.com/docs/functions/configuring-functions/region`, fetched 2026-07-28): *"Functions should be
executed in the same region as your database, or as close to it as possible, for the lowest latency."*
- Mechanism: **one line** in a new `vercel.json` per app — `{"regions": ["pdx1"]}` — or the dashboard
  toggle at Settings → Functions → Function Regions. Both apps (`apps/admin`, `apps/client`) would need
  this, since both are separate Vercel projects.
- Plan gating: **none that blocks this** — the docs' own limits table says Hobby supports a **single**
  region (which is exactly what's needed here: move the one default region from `iad1` to `pdx1`, not
  add a second one). No plan upgrade required.
- Cost: **$0**.
- Downtime: **zero** — a region change takes effect on the next deploy (Vercel's normal zero-downtime
  deploy swap), no data migration, no DNS change, no env var change.
- Effect: collapses the ~60-70ms-per-hop cross-country tax down to same-region latency — per
  `PERF-LOOP.md`'s own words, "single-digit ms — close to localhost" — which would cut the estimated
  325-630 ms tax down by roughly an order of magnitude, likely landing `/reservar` close to its already-
  measured co-located local number (~45 ms) in production too.

**The fix workflow-1's framing implicitly worried about — migrating the Supabase project itself — is
NOT required**, because the Vercel side is the one with no fixed cost (it's Vercel that's on the
default, not Supabase that's misplaced for its own reasons). If it were ever wanted anyway (e.g. to
also improve Auth/Storage or reduce Cloudflare-hop variance), the real cost would be:
- Supabase does not support in-place region change for an existing project — it requires standing up a
  **new project** in the target region and migrating data (`pg_dump`/restore or the CLI's migration
  tooling), **explicitly including the `auth` schema** (a peer doc in this repo, `docs/Context/2026-07-27-
  auth-structure-scale-audit.md:193`, already flags that `supabase db dump` excludes `auth` by default —
  a real footgun for a from-scratch region move).
- Given the measured live DB is only **15 MB** (per the shared baseline), the dump/restore itself is a
  matter of minutes, not hours — the real cost is coordination: re-pointing `NEXT_PUBLIC_SUPABASE_URL`
  + keys in **two** Vercel projects, re-verifying all 78+ migrations replay cleanly, re-provisioning
  Vault secrets (`tenant_assertion_key`), Auth SMTP/redirect-URL reconfiguration, and a short write-freeze
  cutover window (realistically tens of minutes, not a multi-day project, given the tiny data volume).
- **Not recommended as the first move** — it solves a problem the cheap Vercel-side fix already solves.

---

## Summary table

| sub-claim | verdict |
|---|---|
| (a) DB region is us-west-2 (Oregon) | **CONFIRMED**, high confidence (DNS + live `inet_server_addr()` + RIPE whois + IP geolocation, 3 independent methods agreeing) |
| (b) no `vercel.json` exists anywhere | **CONFIRMED** (repo-wide search, zero hits; no per-route `preferredRegion` either) |
| (c) 3 docs falsely cite hitl-16 as "already recorded" when it's a blank template | **CONFIRMED**, quoted file:line for the source + all 3 citing docs; a 4th doc (the audit that coined finding-15) and a 5th (yesterday's auth-structure audit) independently say "unverified" — the error is isolated to the 3 downstream docs |
| (d) ~8 sequential round trips on the member render | **PARTIALLY CONFIRMED** — traced code gives a 5-9 range depending on tenant-cache warmth and JWT signing-key state (live evidence points to the still-HS256, still-cold-cache upper end); "~8" is a fair midpoint of the CURRENT, already-perf-tuned code, not an exaggeration |
| (e) permanent latency tax, hundreds of ms | **CONFIRMED**, ~300-630 ms range (5-9 rounds × 60-70ms measured AWS backbone RTT), which is a MULTIPLE of the already-optimized local render time (44-46ms) |
| (f) fix is cheap (one-line region pin), Supabase migration not required | **CONFIRMED** — Vercel `pdx1` region pin is $0/zero-downtime/no-plan-upgrade and co-locates with the existing Supabase project; a full Supabase project migration would be a bounded (not huge, DB is 15MB) but real undertaking, and is NOT the necessary fix |

## Blind spots

- I could not directly read the Supabase dashboard's region label or the Vercel dashboard's Function
  Region setting — everything here is inferred from network/DNS/SQL signals and repo absence-of-evidence.
  A 30-second look at both dashboards would upgrade (a) and (b) from "high confidence" to "certain."
- The 60-70ms RTT figure is AWS's own inter-region **backbone** latency, not a direct measurement of the
  Vercel-function-to-Supabase-PostgREST HTTP path (which additionally traverses Cloudflare in front of
  the API). It's a reasonable order-of-magnitude proxy, not a precise measurement of THIS path.
- The JWT signing-key conclusion (still-HS256) rests on the *absence* of a `jwks`-named table in the
  live `auth` schema, which is suggestive but not a first-party "signing key type" field — I have no
  direct way to query GoTrue's own runtime config via SQL.
- I did not attempt to measure real request latency against the live deployed apps (out of scope: no
  browser/curl access to the actual Vercel deployments was exercised here) — everything is derived from
  code tracing + published/measured third-party network figures, not an end-to-end trace of a real
  `/reservar` request in production.
- `.env.local` in both apps contains live secrets (a Supabase PAT, a Resend API key, an HMAC tenant-
  assertion key) that I read while checking for a pooler connection string revealing the region. I did
  not need them and have not reproduced their values in this file; flagging only that they exist on disk
  in a gitignored file, in case that's news.
