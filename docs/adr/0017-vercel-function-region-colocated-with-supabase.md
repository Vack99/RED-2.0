# ADR-0017 — Vercel functions run in ONE region, colocated with Supabase (`pdx1`)

**Status:** Accepted · **Date:** 2026-08-29 · **Builds on:** [ADR-0001](0001-supabase-rls-no-orm.md) (authorization is re-evaluated in Postgres on every request — these are the round trips this ADR shortens), [ADR-0008](0008-platform-multitenant-gym-rls-brand-modules.md) (two multi-tenant deploys over ONE shared Supabase project, so there is exactly one database location to sit next to), [ADR-0011](0011-monorepo-packaging-jit-packages-cross-package-boundary.md) §7 (per-app config lives in the app, not in a `packages/config`) · **Incident:** [`docs/Context/2026-08-29-supabase-degradation-jwks-HANDOFF.md`](../Context/2026-08-29-supabase-degradation-jwks-HANDOFF.md)

## Context

2026-08-29, "everything spins forever". Grouping `edge_logs` by `request.cf.colo` settled it: **all 65 requests over 5 s in 24 h entered Cloudflare at IAD** — worst 266 s, every one returning HTTP 200 — while SJC/LHR/SIN/LAX/FRA/DFW/PDX produced **zero**. The IAD entries are AWS us-east-1 addresses, i.e. the `iad1` page functions; SJC-entering proxy traffic to the same URLs in the same minutes ran 26–91 ms. GoTrue self-reported `jwks.json` at **avg 3.9 ms** while the edge measured 266 s — so neither the origin nor our code was slow. The stalling thing was the **IAD colo → Supabase leg**.

The Supabase project is **AWS us-west-2**. Both Vercel projects were in **`iad1`** — not a choice, an inheritance: *"Washington, D.C., USA (`iad1`) … the default region for all new projects"* ([vercel.com/docs/functions/configuring-functions/region](https://vercel.com/docs/functions/configuring-functions/region), last updated 2026-08-11). A continent of separation was sitting under every render.

## Decision

1. **Both projects' functions run in one region — `pdx1` (Portland, us-west-2), the database's own region** — pinned in each app's `vercel.json` `regions` key (`apps/admin/vercel.json`, `apps/client/vercel.json`). `vercel.json` wins over the dashboard setting; the owner also set the dashboard to Portland on 2026-08-29 so the two agree rather than silently diverging.
2. **Single region, not multi-region.** Per the same doc, Hobby allows one region and Pro five, and it is explicit about the tradeoff: *"choosing regions far from those services increases latency. Select only regions close to your external services."* Every render here is **3–9 sequential DB round trips**, so the function must sit next to the database; adding a far region would put some renders back across the continent — the exact defect this closes. (Routing Middleware — `proxy.ts` — is deployed to **all** regions regardless and is not governed by `regions`.)
3. **If the Supabase project ever moves region, `regions` moves with it in the same change.** Colocation is the pin's only justification, so a stale pin is worse than no pin at all.
4. **Multi-region becomes sensible only with Supabase read replicas near users** ([read replicas](https://supabase.com/docs/guides/platform/read-replicas)) — out of scope here, and a cost decision rather than a latency one.

## Consequences

- The cross-region hop is gone — ~110 ms per call × the render's call depth, on every page of both apps. The IAD path is no longer on the render path at all. (This also closes the perf loop's open colocation item.)
- **`packages/data/src/server/fetch-shield.ts` remains the bound**, and is not made redundant by this. Colocation removes today's failing leg; it does not make the network reliable. Region pin and shield are two answers to one incident, and neither replaces the other.
- Post-deploy verification is a query, not a vibe — `edge_logs` grouped by colo, for our own server-side calls, must show **PDX/SEA only** (MCP `query_logs`, window ≤ 24 h, both timestamps explicit):

```sql
select log_attributes['request.cf.colo'] as colo, count(*) as n
from logs
where source = 'edge_logs' and log_attributes['request.headers.user_agent'] = 'node'
group by colo order by n desc
```

- Cold starts now serve Mexico from the US West coast instead of the East. Irrelevant next to the DB round trips, which dominate every render.
- **Residual, accepted: Routing Middleware (`proxy.ts`) still runs in every region.** Vercel's middleware `config` takes only `matcher` and `runtime` ([routing-middleware/api](https://vercel.com/docs/routing-middleware/api)); Next.js's `preferredRegion` is honoured on Vercel only under `runtime = 'edge'`, which a Proxy file cannot set (it throws). So a visitor whose PoP routes to `iad1` still gets `gym_id_por_host` + a token refresh (both POST, unbounded by design) over the IAD leg; `jwks.json` and the `gym` read there are shield-bounded. Post-deploy sample: 4 of 60 middleware calls (7 %) entered at IAD, none from Mexico's usual path (SJC). Not worth a workaround; revisit only if IAD middleware stalls reappear in the colo query.

## What a future reader must not undo

- Do not drop `regions` from either `vercel.json` because "the dashboard already says Portland". The dashboard is per-project state that a re-link or a new project loses silently; the committed file is the fact.
- Do not add a second region for "coverage" while a single primary database sits in us-west-2 (§2). Reach for read replicas first (§4).

## Verified 2026-08-29 (deploy of 337feb4, window 17:50–19:45Z)

- **Page functions: PDX only.** 97 server calls (`paquetes`, `class_session`, `clientes`, `asistencias`, `gym_membership`, `ventas`, the read-RPCs, `jwks.json`) — p50 44 ms, p95 210 ms, max 327 ms, **0 over 5 s**. The last IAD page-function address stream ended 17:09Z, before the deploy.
- **Everything not at PDX is middleware** (only `gym_id_por_host`, `gym`, `jwks.json`, `/auth/v1/token` appear): SJC 37, LHR 9, SIN 8, IAD 4, FRA 2 — max 1.3 s, 0 stalls.
- **Same 24 h before the deploy, for scale:** IAD 3 714 calls, **103 over 5 s**, max 266 s; PDX 474 calls, 0 stalls, p50 18 ms. During the incident hours (14:00–17:45Z) the stalls at IAD were path-agnostic but heaviest on the auth origin: `jwks.json` 51/63, `/auth/v1/token` 13/14, `gym` 4/119, `gym_id_por_host` 1/22.
- DFW's 300 calls at 17:15–17:40Z were this machine's `test:e2e` + smoke runs (Mexican residential IP), not Vercel.

Re-run: the query above, plus `countIf(toInt32OrZero(log_attributes['response.origin_time']) > 5000)` per colo. Green = PDX carries the page paths with 0 stalls; other colos show only the four middleware paths.
