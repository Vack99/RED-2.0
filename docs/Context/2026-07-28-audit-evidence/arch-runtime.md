# arch:runtime — the Vercel/Next runtime topology at 3,000 gyms

**Agent:** `arch:runtime` · **Date:** 2026-07-27 · **Mode:** read-only against live prod (`hjppxawglmukfvsgmcog`) + primary vendor docs fetched today.

**Headline:** Vercel Functions execute in **`iad1` (Washington DC / us-east-1)**. The Postgres database is in **us-west-2 (Oregon)**. Both facts are measured, not inferred. Every one of roughly **8 sequential PostgREST round trips** in a member page render crosses the continent. The repo's own runbook predicted this exact tax ("~60–70ms × each sequential PostgREST call — permanently, for every gym"), left a blank to record the region pair, and **the blank was never filled** — while three later documents cite it as "already recorded, verify don't redo."

The prior audit's premise "`us-east-1` is right; `sa-east-1` is the trap" is **half wrong**. It correctly rejected São Paulo, then assumed the database was already in us-east-1. It is not.

---

## 0. Method and evidence standard

Everything below is one of: a live SQL result printed verbatim, an HTTP response header captured today, a `file:line` in this repo, or a vendor page I fetched today with the URL and date. Where I could not isolate a number externally I say so and mark it **MODELLED** or **ASSERTED**. Nothing is stated from memory — in particular no pricing.

---

## 1. REGION — measured, and it is wrong

### 1.1 Where the functions run

```
$ curl -sS -o /dev/null -D - https://red.ibookit.lat/
HTTP/1.1 200 OK
Server: Vercel
X-Vercel-Cache: MISS
Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate
X-Vercel-Id: sfo1::iad1::kjkqq-1785217127831-324a88d1323b

$ curl -sS -o /dev/null -D - https://forge.ibookit.lat/
X-Vercel-Id: sfo1::iad1::9755q-1785217131786-916bbcea0886
```

`X-Vercel-Id` is `<edge-PoP>::<function-region>::<id>`. `sfo1` is the CDN PoP nearest my test client; **`iad1` is the compute region**. Both the RED and Forge hosts (same client deployment) execute in `iad1`.

That is the Vercel default, not a decision:

> "By default, Vercel Functions execute in *Washington, D.C., USA* (`iad1`) **for all new projects**"
> — https://vercel.com/docs/functions/configuring-functions/region (fetched 2026-07-27)

And nothing in this repo overrides it. There is **no `vercel.json` anywhere in the repository**:

```
$ find . -name "vercel.json" -not -path "*/node_modules/*"
(no output)
```

There is no `preferredRegion` export either — the only runtime directive in the entire codebase is one `runtime = "nodejs"`:

```
$ grep -rn "preferredRegion|export const runtime|maxDuration" apps/ packages/
apps/admin/src/app/(app)/cuenta/respaldo/route.ts:25:export const runtime = "nodejs"; // ExcelJS needs Node, not edge
```

### 1.2 Where the database runs

Live prod, direct DB host:

```sql
select inet_server_addr()::text, current_setting('server_version'),
       current_setting('max_connections'), current_setting('shared_buffers');
-- 2600:1f13:5fd:be02:ee46:157e:2c08:36a5/128 | 17.6 | 60 | 224MB
```

```
$ nslookup db.hjppxawglmukfvsgmcog.supabase.co
Name:    db.hjppxawglmukfvsgmcog.supabase.co
Address: 2600:1f13:5fd:be02:ee46:157e:2c08:36a5
```

Geolocation of that address (https://ipinfo.io/2600:1f13:5fd:be02:ee46:157e:2c08:36a5/json, fetched 2026-07-27):

```json
{"ip":"2600:1f13:5fd:be02:ee46:157e:2c08:36a5","city":"Boardman","region":"Oregon",
 "country":"US","org":"AS16509 Amazon.com, Inc.","aws_region_hint":"us-west-2",
 "timezone":"America/Los_Angeles"}
```

Boardman, Oregon is the AWS `us-west-2` datacenter town. Three independent corroborations:

| Signal | Evidence |
|---|---|
| Geolocation | Boardman OR, AS16509 (Amazon), `us-west-2` hint |
| Adjacent AWS allocation | `2600:1f14::/36` is documented as `us-west-2`; `2600:1f13::/36` is the neighbouring allocation |
| **This repo's own record** | `docs/superpowers/handoffs/2026-07-10-issues-81-82-kickoff.md:34` — "Create a throwaway free project (org `ncozakjylxhzemtvxnop`, **region `us-west-2`**)". Supabase creates projects in the org's region. Prod is in that org. |

**Falsification attempted, finding survives.** For this to be wrong, either (a) the dashboard function region had been changed to a west-coast region — the `X-Vercel-Id` header proves it has not; or (b) the DB is actually in Virginia — the direct-host IPv6 geolocates to Oregon and the org's own default region is recorded in-repo as `us-west-2`. Residual risk: ipinfo's `aws_region_hint` is a derived field. It is corroborated twice independently. **Confidence: high.**

### 1.3 The documentation lie chain

`docs/runbooks/hitl-16-vercel-deploy-verify.md:82-84`:

> "look up the Supabase project's region (Supabase → Project Settings → General) and set **both** Vercel projects' function region to the matching one... A mismatch taxes every SSR render ~60–70ms × each sequential PostgREST call — permanently, for every gym. Record the pair here once confirmed: `Supabase: ____ · Vercel: ____`."

**The blanks are still blank.** Yet:

- `docs/runbooks/hitl-28-live-cutover-deploy-verify.md:89` — "Region co-location: set during #16 — confirm the Supabase/Vercel region pair recorded in `hitl-16` Step 3 still holds. **Verify, do not re-tune.**"
- `docs/superpowers/plans/2026-07-05-issue28-live-cutover.md:158` — "region co-location already recorded there — **verify, don't redo**"
- `docs/prompts/2026-07-01-phase3-tenant-rls-kickoff.md:16` — "finding 15 region co-location is already recorded there, step 3 + checklist — **verify, don't redo**"

Three documents instruct a future reader not to redo a check that was never done, against a runbook with an empty field. The 2026-07-01 audit rated it "minor... 5-minute check" (`docs/superpowers/audits/2026-07-01-multitenant-branding-scale-audit.md:79`) and it then propagated as completed.

### 1.4 How many round trips pay the tax

Sequential depth of `/reservar` (the member hot path), derived from source:

| # | Call | File:line | Depth |
|---|---|---|---|
| 1 | `gym_domain` lookup by hostname | `packages/data/src/server/resolve-tenant.ts:121-125` | 1 |
| 2 | `gym` lookup by id (**awaited after #1**) | `resolve-tenant.ts:128` → `:190-194` | 2 |
| — | `gym` lookup by slug (parallel with #1) | `resolve-tenant.ts:171-174` | — |
| 3 | `getEsMiembro` → `gym_membership` | `apps/client/src/app/reservar/page.tsx:56` → `agenda-miembro.ts:172` | 3 |
| 4–8 | `Promise.all([agenda, saldo, perfil])`, deepest arm = `getPerfilResumenMiembro`: `resolverMiembroGym` → `fetchClienteRow` → `Promise.all([reservas(→3 deep), membresia, catalogo])` | `reservar/page.tsx:76-80`; `agenda-miembro.ts:521-537, 586-619` | 8 |

**≈ 8 sequential round trips; ≈ 20–23 total PostgREST requests per render.**

Physics floor for `iad1` ↔ `us-west-2`: great-circle ≈ 3,900 km, ×2, at ~200,000 km/s in fibre → **≈ 39 ms minimum RTT**. Real-world AWS inter-region is typically 60–75 ms. Co-located would be ~1–5 ms.

**MODELLED cost: 8 × 40–70 ms = 320–560 ms of avoidable latency on every member page render, at every scale, forever.**

### 1.5 What I could NOT measure — stated plainly

I measured live TTFB from my own machine, 10 samples per route:

```
/legal   : 0.655 0.375 0.398 0.425 0.341 0.339 0.346 0.342 0.336 0.408   (min 0.336)
/entrar  : 0.339 0.352 0.456 0.452 0.369 0.331 0.342 0.364 0.343 0.342   (min 0.331)
/        : 0.374 0.344 0.342 0.357 0.350 0.336 0.377 0.347 0.354 0.390   (min 0.336)
/precios : 0.348 0.352 0.371 0.361 0.362 0.351 0.352 0.347 0.356 0.364   (min 0.347)
```

**These deltas are inside my own network noise and do NOT confirm the per-RTT tax.** The anon routes I can reach issue few sequential queries, the 60 s `resolveTenant` cache was warm across my samples, and my client→`sfo1` leg varies ±100 ms. The floor of ~335 ms across all four routes is real and is the proxy + function overhead, but I could not isolate the DB leg from outside.

**The region placement is measured. The millisecond cost is modelled.** The honest instruction is: add one `server-timing` header around the DAL calls and read the actual number before and after pinning the region. Do not take my 320–560 ms as gospel; take the *placement* as fact.

### 1.6 The fix, and the tradeoff

| Option | Cost | Effect |
|---|---|---|
| **Pin Vercel functions to `pdx1`** (Portland, = us-west-2) | one dashboard setting or 3 lines of `vercel.json`, zero downtime, $0 | removes the cross-region hop entirely. Adds ~15–30 ms on the *user→function* leg for Mexican users (MEX→PDX ≈ 3,600 km vs MEX→IAD ≈ 3,000 km) — paid **once**, versus 8× saved. Net strongly positive. |
| Migrate Supabase project to `us-east-1` | project migration + downtime; region change is not documented as a self-serve operation on https://supabase.com/docs/guides/platform/regions (fetched 2026-07-27) | best steady state for a Mexico-first product (IAD is the closer US region to MEX), but expensive to execute |
| Do nothing | $0 | the tax compounds with every sequential query added |

Supabase has **no Mexico region**. `sa-east-1` (São Paulo) exists — the prior audit is right that it is a trap for a Mexico-first product. Do not go there.

---

## 2. VERCEL LIMITS AND PRICING — primary sources, fetched 2026-07-27

### 2.1 The custom-domain ceiling — the prior "100/hr vs 100/min contradiction" resolved

There is **no contradiction**. They are two different limits on two different endpoints, both from https://vercel.com/docs/limits (fetched 2026-07-27):

| Description | Limit | Duration | Scope |
|---|---|---|---|
| Project domain creation, update, or remove per minute | **100** | 60 s | `owner` |
| Domains creation per hour | **120** | 3600 s | `owner` |

The first is attaching a domain **to a project**; the second is creating a domain **on the team**. `owner` scope = **team-wide, not per project**. The binding constraint for bulk provisioning is therefore **120 domains/hour across the whole account**.

And the per-project cap, from the same page:

> | | Hobby | Pro | Enterprise |
> | Domains per Project | 50 | Unlimited\* | Unlimited\* |
>
> "\*To prevent abuse, Vercel implements soft limits of **100,000 domains per project for the Pro plan** and **1,000,000 domains for the Enterprise plan**. These limits are flexible and can be increased upon request."

**Verdict on the prior "Hobby blocked @50 / only eng piece = a rate-limited BYO-domain onboarding queue" finding:** the Hobby-50 half is confirmed correct. The "rate-limited onboarding queue" half is **largely moot for this product as built**, for a reason nobody in the prior work noticed.

### 2.2 There are no BYO custom domains — and that changes everything

Live `gym_domain` today:

```sql
select hostname, app from public.gym_domain order by app, hostname;
```
```
forge-admin.ibookit.lat        admin
forge-demo-admin.ibookit.lat   admin
forge-demo.localhost           admin
forge.localhost                admin
red-admin.ibookit.lat          admin
red-demo-admin.ibookit.lat     admin
red-demo.localhost             admin
forge-demo-client.localhost    client
forge-demo.ibookit.lat         client
forge.ibookit.lat              client
red-demo-client.localhost      client
red-demo.ibookit.lat           client
red.ibookit.lat                client
red.localhost                  client
```

Every production host is a **subdomain of one apex the platform owns, `ibookit.lat`**. There is not one customer-owned domain, and **no code anywhere provisions a domain**:

```
$ grep -rn "api.vercel.com|VERCEL_TOKEN|projects/.*/domains" apps/ packages/ tools/ supabase/
(no output)
```

Every host is a hand-written `gym_domain` INSERT plus a hand-added Vercel domain. `apps/admin/src/proxy.ts:20` says the quiet part out loud: *"a one-row `gym_domain` insert + a provisioned host, zero mechanism"*.

Because all hosts sit under one apex, **the correct answer is a wildcard, not a queue**. From https://vercel.com/docs/domains/working-with-domains/add-a-domain (fetched 2026-07-27):

> "You can also use your **custom domain** as a **wildcard domain** by prefixing it with `*.`... If using your custom domain as a wildcard domain, you **must use the nameservers method for verification**."

A wildcard costs **zero** domain-API calls, zero rate limit, zero certificates per gym. 3,000 gyms would be free.

**And the current naming convention structurally forbids it.** A wildcard covers exactly one label. `*.ibookit.lat` on the *client* project would also match `red-admin.ibookit.lat` and `forge-admin.ibookit.lat` — stealing the admin hosts from the admin project. A Vercel domain attaches to one project. So with today's `<gym>` / `<gym>-admin` scheme you **must** create 2 explicit domain records per gym:

- 3,000 client + 3,000 admin = **6,000 domain records**
- at 120/hour team-wide = **50 hours of continuous provisioning** for a backfill
- with **zero automation written**

**The fix is a rename, not a queue:** `<gym>.ibookit.lat` → `*.ibookit.lat` on the client project, and `<gym>-admin.ibookit.lat` → `<gym>.admin.ibookit.lat` → `*.admin.ibookit.lat` on the admin project. Two wildcards, disjoint, most-specific-match wins. Cost: a `gym_domain.hostname` data migration and a DNS/nameserver move. Result: per-gym domain provisioning drops to **zero forever**.

**Exit trigger for "wildcards are enough":** the moment the product sells a gym its own domain (`crossfitpolanco.mx`), the wildcard stops covering it and the 120/hr limit plus per-domain TLS issuance become real. At that point build the queue. Not before.

⚠️ **ASSERTED, not verified:** at 6,000 explicit subdomains under one registered domain, Let's Encrypt's "certificates per registered domain" limit could bind unless Vercel batches SANs or holds an allowlist exemption. I did not fetch Let's Encrypt's current rate-limit page and I am not going to state a number from memory. If the wildcard rename does not happen, **verify this with Vercel support before gym #200**.

### 2.3 Everything else Vercel

https://vercel.com/docs/limits + https://vercel.com/pricing (both fetched 2026-07-27):

| Limit | Hobby | Pro | Enterprise |
|---|---|---|---|
| Projects | 200 | Unlimited | Unlimited |
| Deployments/day | 100 | 6,000 | Custom |
| Deployments/hour | 100 | 450 | 1,800 |
| Build time per deployment | 45 min | 45 min | 45 min |
| Concurrent builds | 1 | up to 500 | Custom |
| Routes per deployment | 2,048 | 2,048 | Custom |
| Function regions | 1 | 5 | All |
| Runtime log retention | 1 h | **1 day** | 3 days |
| Env vars per environment | 1,000 | 1,000 | 1,000 (64 KB total) |

**None of these bind at 3,000 gyms.** The app has 22 routes (`find apps/*/src/app -name page.tsx | wc -l` → 22) against a 2,048 route cap; builds are per-deploy not per-gym; the architecture is explicitly one deployment for all tenants. Build minutes do not scale with gym count — that is the whole point of the host-resolution design and it is correct.

The one that will annoy: **1-day runtime log retention on Pro.** Debugging a Tuesday-morning incident on Thursday is impossible. Team ($599) buys 28 days.

Pro pricing: **"$20/user/month"** with **"$20 of included usage credit"**; Enterprise is "Custom".

### 2.4 Cost at 3,000 gyms — my own model, inputs stated

**Inputs (MODELLED — change these and the answer changes):**
- 3,000 gyms × 225 members = 675,000 members; 60% monthly-active = 405,000 MAU
- member: 12 sessions/month × 3.5 page views = 42 renders/member/month → **17.0M**
- admin: 8.1M check-ins/month (225 × 12 × 3,000), each = 1 action + 1 `router.refresh()` full re-render = 16.2M, plus ~1.5M staff navigation → **17.7M**
- **total ≈ 35M dynamic renders/month**
- ~50 KB compressed HTML/RSC per render; ~3 CDN requests per render
- Mexico traffic prices at US rates (`iad1`/`sfo1`) — Vercel has **no Mexico PoP** in its regional-pricing list

| Meter | Volume | Rate (iad1) | Monthly |
|---|---|---|---|
| Edge Requests | 105M (10M incl.) | $2.00/1M | **$190** |
| Function Invocations | 35M | $0.60/1M | **$21** |
| Fast Data Transfer | 2.25 TB (1 TB incl.) | $0.15/GB | **$188** |
| Fast Origin Transfer | 1.75 TB (×2 for middleware, see below) | $0.06/GB | **$105–210** |
| Active CPU | ~390 CPU-hr | $0.128/hr | **$50** |
| Provisioned Memory | ~2,600–7,800 GB-hr | $0.0106/GB-hr | **$27–82** |
| Seats | 1–2 | $20 | **$20–40** |
| | | **TOTAL** | **≈ $600–850/mo** |

**≈ $0.20–$0.28 per gym per month (≈ 4–5 MXN).** Against 300–1,500 MXN/gym/mo revenue that is **0.3%–1.6%**. Vercel is not a cost risk.

**I contradict the prior audit's "Vercel $270–$560".** I get 1.5× higher, and the gap is almost entirely **Edge Requests**, which the prior model appears to have under-weighted. Note also Vercel's own warning at https://vercel.com/docs/manage-cdn-usage (fetched 2026-07-27):

> "If using Middleware, it is possible to accrue **Fast Origin Transfer twice for a single Function request**. To prevent this, you want to only run Middleware when necessary."

`apps/client/src/proxy.ts:85-92` already sets a matcher excluding `_next/static`, `_next/image` and image extensions. **That optimization is already done and it is correct.** Credit where due.

### 2.5 The LatAm expansion premium — nobody has costed this

Prices are charged by **where the request originates**. https://vercel.com/docs/pricing/regional-pricing/gru1 (fetched 2026-07-27) vs `iad1`:

| Meter | iad1 (Mexico traffic routes here) | gru1 (São Paulo) | Multiple |
|---|---|---|---|
| Fast Data Transfer | $0.15/GB | **$0.22/GB** | 1.47× |
| Edge Requests | $2.00/1M | **$3.20/1M** | 1.60× |
| Fast Origin Transfer | $0.06/GB | **$0.41/GB** | **6.83×** |
| Edge Request CPU Duration | $0.30/hr | $0.48/hr | 1.60× |

**Brazil traffic costs 1.5–6.8× more on the same architecture.** Fast Origin Transfer — the meter that server-side-everything maxes out — is the one with the 6.8× multiple. Expanding to Brazil roughly **doubles** the Vercel bill for the same volume. Still small in absolute terms (~$1,200–1,700/mo), but it is a real and previously uncounted step function.

---

## 3. COLD STARTS AND CONNECTION HANDLING — the good news, told honestly

### 3.1 Vercel opens ZERO Postgres connections. `max_connections=60` is a red herring for the app tier.

Live, from prod:

```sql
select application_name, client_addr::text, usename, state, count(*)
from pg_stat_activity group by 1,2,3,4 order by 5 desc;
```
```
""                | null      | null            | null   | 5
""                | ::1/128   | supabase_admin  | idle   | 1
""                | null      | supabase_admin  | null   | 1
mgmt-api          | 2600:1f1c:...             | postgres | active | 1
postgrest         | ::1/128   | authenticator   | idle   | 1
pg_cron scheduler | null      | supabase_admin  | null   | 1
postgres_exporter | ::1/128   | supabase_admin  | idle   | 1
pg_net 0.20.3     | null      | supabase_admin  | idle   | 1
```

`postgrest` connects from **`::1/128` — localhost**. PostgREST runs *on the database host*. Vercel talks HTTP to PostgREST; it never opens a Postgres socket. **The single most-feared serverless failure mode — connection exhaustion — is structurally impossible here.** The prior audit's point 7 is confirmed, and it deserves more credit than it got: this is the correct architecture for serverless.

**Falsification: what would have to be true for this to be wrong?** Some code path would have to open a direct `pg` connection. Checked — the only Postgres clients in the repo are `@supabase/supabase-js` and `@supabase/ssr` (`packages/data/package.json:47-48`), both HTTP. `@supabase/supabase-js@2.106.2`, `@supabase/ssr@0.10.3`. No `pg`, no `postgres.js`, no Drizzle, no Prisma. **Finding holds.**

**The real serialization point is PostgREST's own pool, not `max_connections`.** Compute tier (https://supabase.com/docs/guides/platform/compute-and-disk, fetched 2026-07-27): `max_connections=60` matches **Nano or Micro**; `shared_buffers=224MB` + `effective_cache_size=384MB` sum to 608 MB, which exceeds Nano's 0.5 GB — so this is almost certainly **Micro (1 GB, 2 shared cores, ~$10/mo)**. At 3,000 gyms the ladder runs Micro → XL (240 conn, $210) → 2XL (380 conn, $410). That is a purchase, not a redesign.

### 3.2 Cold starts

The two Vercel projects were created around 2026-06/07 (repo memory: "#16 hitl deploy-verify LIVE-VERIFIED 2026-07-01"). Per https://vercel.com/docs/fluid-compute (fetched 2026-07-27):

> "As of April 23, 2025, fluid compute is **enabled by default for new projects**."

So Fluid is almost certainly on, which buys **bytecode caching** ("only applied to production environments"), **function pre-warming on production deployments**, **in-function concurrency** (multiple invocations share one instance — ideal for this I/O-bound workload), and **AZ failover**. Default/max duration under Fluid on Pro is **300 s / 800 s**.

⚠️ **Unverified — I cannot read the dashboard.** `"fluid": true` is not in a `vercel.json` because there is no `vercel.json`. If Fluid is somehow off, the project falls back to the pre-2025 table (Pro: 15 s default / 300 s max) and pays microVM cold starts on every idle instance. **Check the toggle; then pin it in `vercel.json` so it is reviewable.**

**Cold starts are not the risk here anyway** — the risk is that Fluid's Active-CPU billing model is what makes 8 cross-region round trips *cheap to Vercel* (you pay CPU, not I/O wait) while being *expensive to the member* (wall-clock latency). Fluid hides the region mistake from the invoice. It does not hide it from the user.

---

## 4. THE SHARED RATE-LIMIT POOLS — the sharpest ceiling in the runtime

### 4.1 100% of auth is server-side. This is the crux.

```
$ grep -rn "verifyOtp|exchangeCodeForSession|signInWithOtp|signInWithPassword|resetPasswordForEmail" apps/ packages/
packages/data/src/server/sesion.ts:26:   signInWithPassword
packages/data/src/server/sesion.ts:45:   resetPasswordForEmail
packages/data/src/server/sesion.ts:64:   signInWithOtp
packages/data/src/server/sesion.ts:82:   exchangeCodeForSession
packages/data/src/server/sesion.ts:104:  verifyOtp
apps/admin/src/app/(auth)/login/_components/login-form.tsx:58: signInWithPassword  (browser)
```

`sesion.ts:1` is `import "server-only"`. **Every member auth call runs in a Vercel function.** A browser factory exists (`packages/data/src/client.ts`) but is used for auth in exactly one place — the *admin* login form. The client app has **zero** browser Supabase usage:

```
$ grep -rn "from \"@gym/data\"" --include="*.tsx" apps/client/src | grep -i client
(no output)
```

And the token refresh is server-side too, by design — `apps/client/src/proxy.ts:79`:

```ts
// The call itself (result unused) is what triggers the refresh
await supabase.auth.getClaims();
```

### 4.2 The budgets these calls spend

https://supabase.com/docs/guides/auth/rate-limits (fetched 2026-07-27):

| Endpoint | Limit | Scope | Configurable |
|---|---|---|---|
| `/auth/v1/token` (refresh) | **1,800 / hour** (bursts to 30) | **per IP address** | No |
| `/auth/v1/verify` | **360 / hour** (bursts to 30) | **per IP address** | No |
| `/auth/v1/otp` | **30 / hour** default | **project-wide** | Yes |
| `/auth/v1/signup`, `/recover`, `/user` email sends | 2/hour built-in provider | **project-wide** | Custom SMTP only |
| `/auth/v1/factors/*` MFA | 15/hour | per IP | No |
| Anonymous sign-ins | 30/hour | per IP | No |

Because every one of these fires from a Vercel function, **"per IP" means "per Vercel egress NAT IP", shared across all 3,000 gyms.**

### 4.3 And the standard fix makes it strictly worse

https://vercel.com/docs/networking/static-ips (fetched 2026-07-27):

> "**Static egress**: All outbound traffic routes through shared **static IP pairs**"
> Pricing: "$100.00/month per project, plus Private Data Transfer"
> "Static IPs (region-specific) **don't apply to middleware** (which are deployed at the edge)."

Buying Static IPs would funnel all 3,000 gyms' auth traffic through **two** IPs — a hard ceiling of 3,600 refreshes/hour and 720 verifications/hour for the entire platform — and would not even cover the proxy, which is where the refresh happens. **The $100/mo "fix" is a trap here.** Dedicated egress requires Secure Compute (Enterprise, custom pricing).

On Pro without Static IPs, the egress IP set is **shared AWS NAT, undocumented, uncounted, and unguaranteed to stay the same size**. Which means **the platform's auth ceiling is set by a number no one is allowed to know and Vercel may change without notice.**

### 4.4 Breaking points — computed

**BP-A — token refresh.** JWT lifetime default 3,600 s → one refresh per active session-hour.

```
gyms_per_egress_IP = 1,800 refresh/hr ÷ (members_per_gym × peak_hour_active_fraction)
                   = 1,800 ÷ (225 × 0.15)
                   = 1,800 ÷ 33.75
                   ≈ 53 gyms per egress IP
```

3,000 gyms needs **≥ 57 distinct Vercel egress IPs sustained through the evening peak**. Unknown and unguaranteed. With Static IPs bought: **2 IPs ≈ 107 gyms, hard stop.**

**BP-B — `/auth/v1/verify` at 360/hr per IP.** This is the activation/confirm door — every invited member walks it exactly once. A gym launching emails ~225 invites; if 100 click within the first hour that is 100 verifications. Shared with every password reset and email confirmation platform-wide.

```
concurrent_gym_launches_per_hour_per_IP = 360 ÷ 100 ≈ 3.6
```

**Breaks at ~3 simultaneous gym launches per hour per egress IP.** For a business whose growth motion is onboarding gyms, the onboarding path is the tightest budget in the stack.

**BP-C — `/auth/v1/otp` at 30/hour, PROJECT-WIDE.** Not per IP. Not per gym. One bucket for all 3,000 tenants. This is the magic-link rail — `enviarMagicLink` (`sesion.ts:58-69`), which the activation audit established is one of the two live activation paths (the `cuenta_existente` rail).

**If this is still at its documented default of 30/hour, the entire platform can send 30 magic links per hour, forever, regardless of gym count.** That breaks at *gym #1 of any real launch*.

⚠️ **I could not read the configured value** — it lives in the dashboard's Auth → Rate Limits panel and is not exposed to SQL or to the public `/auth/v1/settings` endpoint. **This is the single highest-priority thing to go look at today.** It is one field. It is also project-wide, so raising it does not fix the blast-radius property: one gym's launch or one attacker still drains all 3,000 gyms' budget, and there is **no per-gym metering, no backpressure and no 429 instrumentation anywhere in the repo.**

### 4.5 One genuine positive: asymmetric JWTs are live

```
$ curl https://hjppxawglmukfvsgmcog.supabase.co/auth/v1/.well-known/jwks.json
{"keys":[{"alg":"ES256","crv":"P-256","kty":"EC","use":"sig","key_ops":["verify"],
  "kid":"76da07da-65ca-404a-a1ab-00c3d0b59d38","x":"WmTwZR8rVIGrBbU2NZuH3Nxx6DjEbyum9Hy9u2a7g6E",
  "y":"2BVPEIE-tDazZdvF-rt03hfOcYD6F5YYQ7Wq22na9e4"}]}
```

Non-empty `keys`, **ES256**. So `getClaims()` verifies the token **locally against a cached JWKS** — it does *not* make a network call to GoTrue on every request. Had this still been the legacy HS256 shared secret, the proxy would fire a `/auth/v1/user` round trip on every single navigation and BP-A would already be breached at ~50 gyms.

**This is the single best runtime decision in the stack and it is load-bearing.** It converts a per-request auth round trip into a per-hour one.

**Exit trigger:** if anyone disables JWT signing keys or reverts to the legacy secret, the refresh ceiling in BP-A applies to **every page view** instead of every session-hour — a ~40× increase in `/auth/v1/*` traffic. Treat the signing-key setting as a production invariant and put it in an ADR.

---

## 5. THE PROXY HOT PATH — two defects found

### 5.1 A wasted `gym`-by-slug lookup on every request from every returning visitor

`apps/client/src/proxy.ts:39-41`:

```ts
const override =
  request.nextUrl.searchParams.get("gym") ?? request.cookies.get("gym")?.value ?? null;
const tenant = await resolveTenant(request.headers.get("host"), override);
```

and `apps/client/src/proxy.ts:81`:

```ts
if (tenant) response.cookies.set("gym", tenant.slug, { path: "/", sameSite: "lax" });
```

The proxy **sets the `gym` cookie on every tenant-resolved response**. Therefore every subsequent request from that visitor arrives with `gym=<slug>` and `override` is non-null. And `resolve-tenant.ts:171-174`:

```ts
const [hostResolution, overrideTenant] = await Promise.all([
  cachedHost(client, hostname),
  override ? cachedSlug(client, override) : Promise.resolve(null),
]);
if (hostResolution.matched) return hostResolution.tenant;   // ← override discarded
```

On a mapped host, `matched` is always true and `overrideTenant` is **always thrown away**. The file's own docblock says *"on a mapped customer domain the override is structurally inert"* (`resolve-tenant.ts:158-159`) — it is inert in *effect*, but the query still executes. It runs in parallel so it costs no wall-clock latency, but it is **a wasted `gym` SELECT on 100% of returning traffic**: ~35M unnecessary PostgREST requests/month at 3,000 gyms, all hitting the same shared Micro instance.

**Fix:** skip the slug arm when the host already matched, or only honour the override from `searchParams` (the cookie can never legitimately beat a mapped host). Roughly 2 lines.

### 5.2 The tenant cache saturates at 500 gyms, and it is per-isolate

`resolve-tenant.ts:58-59, 81-87`:

```ts
const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 500;
// ...
if (!this.map.has(key) && this.map.size >= CACHE_MAX_ENTRIES) {
  const oldest = this.map.keys().next().value;   // FIFO, not LRU
  if (oldest !== undefined) this.map.delete(oldest);
}
```

**I contradict the prior audit's "thrashes at ~143 gyms."** I cannot derive 143 from this code. `hostCache` and `slugCache` are *separate* 500-entry caches (`:94-95`), and each gym contributes exactly one host entry per app. The correct number is:

**Breaking point: 500 gyms per isolate.** Below 500 the working set fits and only the 60 s TTL causes misses; above 500, FIFO evicts live entries and the hit rate degrades continuously.

But the sharper problem is **per-isolate**, not the constant. This is a module-level `Map` in a proxy. There is no shared cache. Every Vercel isolate/instance starts cold and must re-learn the mapping, and each cold miss costs **2 sequential cross-region round trips** (`gym_domain` → `gym`, `:121-128`, the second awaited on the first). At 3,000 gyms across many isolates the effective hit rate is far below what a single-process reading of this code suggests.

**Fixes, cheapest first:** (a) make the two `resolve-tenant.ts:121-128` lookups **one** query with an embedded select (`gym_domain?select=gym(id,slug,brand_module_id)`) — halves the cold-path depth for free; (b) raise `CACHE_MAX_ENTRIES` to ~10,000 and switch FIFO→LRU; (c) at ≥500 gyms move the mapping to Vercel Edge Config (reads $0.003/1K per https://vercel.com/docs/limits) — the host→gym map is public, tiny, and changes only on gym onboarding, which is the textbook Edge Config workload.

**Exit trigger for "keep the in-process cache":** gym count > 400, **or** p95 TTFB on a mapped host rises above 400 ms. Instrument the cache hit rate before deciding — right now nobody can see it.

---

## 6. ZERO REALTIME — confirmed, and it is being paid for in `router.refresh()`

### 6.1 It really is zero

```
$ grep -rn "\.channel\(|postgres_changes|storage\.from\(|realtime" apps/ packages/ | wc -l
0
$ grep -rn "setInterval|refetchInterval|useSWR" apps/ packages/
(no matches — no polling either)
```

Confirmed: no Realtime, no Storage, no polling.

### 6.2 What is used instead

**26+ `router.refresh()` call sites** across the admin app (`agenda.tsx:215,240`; `cliente-detalle.tsx:58`; `class-type-editor.tsx:62,128,141,224`; `gym-content-sheet.tsx:155,166,221,255,266,318,352,363,413,447,458`; `coach-editor.tsx:54`; `coaches-sheet.tsx:40,50`; …).

That is the live-update mechanism: **every state change triggers a full RSC re-render of the page** — which means all of that page's sequential DB round trips, plus an RSC payload over Fast Origin Transfer *and* Fast Data Transfer, plus another cross-region hop chain.

At the front desk, taking attendance for a class of 20 is 20 writes and 20 full agenda re-renders. Platform-wide: 8.1M check-ins/month × 2 invocations × ~8 round trips ≈ **130M PostgREST requests/month generated purely by the refresh-after-write pattern.**

A Realtime frame carrying the same information is ~200 bytes and zero DB round trips.

### 6.3 Will Realtime be forced? Yes — and cost it correctly

The product already contains the two canonical Realtime shapes: **live derived occupancy** on the member booking week (`reservar/page.tsx` docblock: *"the Lun–Sáb week of real sessions with live derived occupancy"*) and the front-desk attendance board. Both are currently correct-on-render and stale-thereafter. Two members booking the last spot simultaneously see stale counts.

Cost of adopting it, from https://supabase.com/pricing (fetched 2026-07-27) — Pro includes **500 peak connections** then **$10 per 1,000**, and **5M messages** then **$2.50 per million**:

| Design | Peak connections | Messages/month | Connection cost | Message cost | **Total** |
|---|---|---|---|---|---|
| Per-**session** channels (careful) | 3,000 boards + ~6,000 members ≈ 9,000 | 13M events × 6 fan-out ≈ 78M | $85 | $183 | **≈ $270/mo** |
| Per-**gym** channel (naive) | same ≈ 9,000–12,000 | 13M × 50 ≈ 650M | $85–115 | $1,613 | **≈ $1,700/mo** |

**I contradict the prior audit here.** It named Realtime's price as "$10/1,000 peak connections" and treated connections as the meter. **The connection meter is the cheap one — $85/mo at 3,000 gyms. The message meter is 2–19× larger and is the one that scales with fan-out design.** A naive whole-gym channel costs **6× more than the entire Vercel bill**.

**Verdict: keep zero-Realtime for now.** It is the right call at 4 gyms and it keeps three expensive meters at zero.
**Exit trigger:** the first double-booking incident report, **or** admin `router.refresh()` volume exceeding ~2M/month, **or** any product commitment to a live attendance board. When it flips, the design decision that matters is **channel granularity, decided before the first `.channel()` call** — per-`class_session`, never per-gym. Write that constraint down now, while it costs nothing.

---

## 7. EGRESS TOPOLOGY — who pays for what

From https://vercel.com/docs/manage-cdn-usage (fetched 2026-07-27):

> "**Fast Data Transfer**: Data sent between the CDN and the visitor's device."
> "**Fast Origin Transfer**: Data sent between the CDN and Vercel Functions."
> "**CDN Requests**: Requests the CDN processes." (billed as **Edge Requests**)

Notably, **outbound function→external-API traffic is not a Vercel meter.** The bytes a Vercel function pulls from Supabase are not billed by Vercel. They *are* billed by Supabase as egress: **250 GB included on Pro, then $0.09/GB** (https://supabase.com/pricing, fetched 2026-07-27).

```
Browser ──[Fast Data Transfer, Vercel $0.15/GB]──> CDN
CDN ──[Fast Origin Transfer, Vercel $0.06/GB]──> Function
Function ──[unbilled by Vercel]──> Cloudflare ──> PostgREST (Oregon)
PostgREST ──[Supabase egress $0.09/GB]──> Function
```

**Supabase egress at 3,000 gyms (MODELLED):** 35M renders × ~8 queries × ~2.5 KB JSON ≈ **700 GB/month**. (700 − 250) × $0.09 = **≈ $41/mo**. Not a threat.

**But I contradict the prior audit's reasoning.** It says: *"Egress never binds, because every read is server-side: Supabase ships PostgREST JSON to Vercel, not to browsers."* The conclusion is right; the reason is wrong, and the wrong reason matters.

Server-side-everything does **not** reduce Supabase egress — the same JSON leaves Supabase either way, once per query. What it does is:
1. **Remove all client-side caching.** `Cache-Control: private, no-cache, no-store` on every response (measured above) plus `X-Vercel-Cache: MISS`. A browser-fetch architecture with SWR/React Query would serve repeat views from the client and cut Supabase egress. Server-side-everything guarantees a fresh DB hit for every view.
2. **Add a second billed hop.** The JSON becomes HTML that must cross Fast Origin Transfer *and* Fast Data Transfer. The rendered HTML is typically **larger** than the JSON that produced it.

So server-side rendering is **more** total transfer, not less — it is just that Vercel's leg is where the cost lands, and Vercel's leg is cheap in `iad1`. In `gru1` it is 6.8× as expensive.

**Verdict: keep server-side-everything.** It is right for the security posture (RLS enforced server-side, no key surface), it is why connection exhaustion is impossible, and the absolute numbers are trivial. But keep it for the *correct* reasons.
**Exit trigger:** Supabase egress > 2 TB/month, **or** Vercel Fast Origin Transfer > $300/month, **or** Brazil exceeding 25% of traffic (the 6.8× `gru1` Fast Origin Transfer multiplier).

---

## 8. VERDICT

**The runtime topology is right. The runtime configuration is wrong, and nobody can see it.**

Server-side-everything on one multi-tenant deployment per app, gym resolved by host, is the correct shape for this product at 3,000 gyms. It makes Postgres connection exhaustion structurally impossible (proven: PostgREST connects from `::1`), it keeps three expensive Supabase meters at zero, and at ~$600–850/mo Vercel is **0.3%–1.6% of revenue**. Nothing about the *architecture* needs to change to carry 3,000 gyms.

What is wrong is that **the entire runtime is configured in a dashboard, versioned nowhere, and reviewed by no one.** There is no `vercel.json`. The region was never pinned, the check to pin it was never performed, and three documents assert it was. That single unexamined default puts the compute 3,900 km from the data on a stack that makes ~8 sequential round trips per member page render.

**Primary exit trigger (the whole verdict reverses on this):** if instrumented `server-timing` shows the DAL leg of a member render exceeds **150 ms of pure network wait**, the region placement is costing more than every other runtime item combined and must be fixed before any other runtime work is funded.

**Secondary exit triggers:** GoTrue 429s appear in logs at any rate (→ BP-A/B/C are live, move auth to the browser); gym count > 400 (→ tenant cache); Realtime message volume projected > 100M/mo (→ channel granularity decision); Brazil > 25% of traffic (→ `gru1` premium).

---

## 9. THE 5 WORST PROPERTIES OF THIS RUNTIME, WORST FIRST

### 1. Compute in `iad1`, database in `us-west-2` — a cross-continent hop on all ~8 sequential round trips per render
`X-Vercel-Id: sfo1::iad1::…` (measured today) vs `db.…supabase.co` → `2600:1f13:…` → Boardman, Oregon (measured today). No `vercel.json`, no `preferredRegion`, no ADR. `hitl-16-vercel-deploy-verify.md:82-84` predicted the exact tax and left its blank unfilled; three documents then cited it as done. **Breaks at: gym #1 — it is already breaking, and it compounds with every sequential query added.** Fix: one dashboard setting (`pdx1`), $0, zero downtime.

### 2. Every auth call is server-side, so Supabase's per-IP budgets are spent from Vercel's shared, undocumented NAT — and the paid fix makes it worse
`packages/data/src/server/sesion.ts` is `server-only`; `apps/client/src/proxy.ts:79` refreshes tokens in the function. `/auth/v1/token` = 1,800/hr **per IP**, `/auth/v1/verify` = 360/hr **per IP**. Vercel does not document or guarantee its Pro egress IP count; Static IPs ($100/mo) route everything through an IP **pair** and explicitly do not cover middleware. **Breaks at: ~53 gyms per egress IP for refresh; ~3 simultaneous gym launches/hour per IP for activation; a hard ~107 gyms if Static IPs are ever purchased.** The ceiling is set by a number nobody is permitted to know.

### 3. `/auth/v1/otp` is 30/hour **project-wide** by default — one bucket for all 3,000 tenants, with no metering and no backpressure
Per https://supabase.com/docs/guides/auth/rate-limits, project-scoped and configurable. `enviarMagicLink` (`sesion.ts:58-69`) is a live activation rail. I could not read the configured value — it is dashboard-only. **Breaks at: gym #1 of any real launch, if still at the default.** Raising it does not remove the blast radius: one gym's launch still drains all 3,000 gyms' budget, and there is zero 429 instrumentation in the repo. **Go look at this field today.**

### 4. The runtime is unversioned and unreviewable — no `vercel.json` at all
No region, no `maxDuration`, no `fluid: true`, no `functions` block, nothing in git. Fluid compute, the function region, and the auth rate limits are all dashboard state that no code review, no ADR and no `pnpm lint` can catch. This is the *cause* of #1, and it will cause the next one. **Breaks at: the next time anyone touches a dashboard** — including Vercel changing a default. A repo this disciplined about machine-checked boundaries (`.dependency-cruiser.cjs`, `rpc-write-coverage.test.ts`, `denial-suite-drift.test.ts`) has left its entire production runtime as unversioned config.

### 5. The `<gym>-admin.ibookit.lat` naming convention structurally forbids the wildcard that would make domain onboarding free — and there is zero provisioning automation
A wildcard covers one label, and one Vercel domain attaches to one project, so `*.ibookit.lat` on the client project would swallow the admin hosts. Today's scheme therefore forces 2 explicit domain records per gym = **6,000 records at 120/hour team-wide = ~50 hours**, with `grep -rn "api.vercel.com|VERCEL_TOKEN"` returning nothing. The fix is a rename to `<gym>.admin.ibookit.lat` + two wildcards, after which per-gym provisioning is **zero forever**. **Breaks at: the founder's hands, ~50–100 gyms.** (The 100,000-domains/project Pro soft limit never binds at 3,000 — that part of the prior finding is confirmed a non-issue.)

---

## 10. WHERE I CONTRADICT PRIOR WORK

| Prior claim | Source | My finding |
|---|---|---|
| "`us-east-1` is right; `sa-east-1` is the trap. **Confirm the current region.**" | auth-structure audit §6 | The `sa-east-1` half is right. The rest assumed the DB is in us-east-1. **It is in us-west-2 and the functions are in `iad1`.** Measured. |
| "region co-location is already recorded [in hitl-16] — verify, don't redo" | `phase3-rls-kickoff.md:16`, `hitl-28:89`, `issue28-live-cutover.md:158` | `hitl-16:84` reads `Supabase: ____ · Vercel: ____`. **It was never recorded.** |
| "`resolveTenant` cache … thrashes at ~143 gyms" | auth-structure audit §5 | Not derivable from the code. `hostCache` and `slugCache` are separate 500-entry maps (`resolve-tenant.ts:58,94-95`). **Saturation is at 500 gyms per isolate**, and the per-isolate property matters more than the constant. |
| "Realtime ($10/1,000 peak connections)" framed as the expensive meter | auth-structure audit §4 | Connections are the **cheap** meter (~$85/mo at 3,000 gyms). **Messages** at $2.50/M are 2–19× larger and depend entirely on channel granularity: $183/mo per-session vs $1,613/mo per-gym. |
| "Egress never binds, because every read is server-side: Supabase ships PostgREST JSON to Vercel, not to browsers." | auth-structure audit §4 | Right conclusion, wrong mechanism. Server-side rendering ships the **same** JSON out of Supabase and then adds two more billed Vercel hops, with `no-store` killing all client caching. It is *more* total transfer, not less. |
| "Vercel $270–$560/mo" | auth-structure audit §4 | I model **$600–850/mo**, ~1.5× higher, the gap being Edge Requests. Still ≤1.6% of revenue — the conclusion holds, the number does not. |
| "only eng piece = a rate-limited BYO-domain onboarding queue" | Vercel domain scale verdict (memory) | **There are no BYO domains.** Every host is `*.ibookit.lat`. The correct engineering is a **wildcard + rename**, not a queue. The queue becomes necessary only when the product sells customer-owned domains. |
| "the 100/hr-vs-100/min doc contradiction" | Vercel domain scale verdict (memory) | **Not a contradiction.** Two endpoints: "Project domain creation…per minute: 100/60s" and "Domains creation per hour: 120/3600s", both `owner`-scoped. The binding number for bulk work is **120/hour team-wide**. |
| "serverless connection exhaustion does not apply here" | auth-structure audit §5, point 7 | **Confirmed and under-credited.** `pg_stat_activity` shows PostgREST on `::1/128`; the repo has no direct Postgres driver. This is genuinely sound. |

---

## 11. MY BLIND SPOTS — what I did NOT examine

1. **The Vercel dashboard.** I have no Vercel API access. Fluid compute on/off, the function-region setting, memory/CPU class, actual observed invocation and transfer volumes, the current plan, and whether Static IPs are enabled are all **unverified**. Everything I say about them is inferred from headers, defaults and dates.
2. **The Supabase Auth rate-limit panel.** The configured `/auth/v1/otp` value — my #3 finding — is dashboard-only and I could not read it. If it has already been raised, that finding drops several ranks. **Someone must go look.**
3. **The actual number of Vercel egress IPs.** The crux of finding #2 and it is undocumented by Vercel. I could not measure it from outside. The correct next step is to log the source IP GoTrue sees, or instrument 429s, rather than to keep modelling it.
4. **Real per-round-trip latency.** My external TTFB samples were swamped by my own network (±100 ms) and by the warm 60 s tenant cache. I proved the *placement*, not the *cost*. An instrumented `server-timing` measurement around the DAL would settle it in an afternoon and should precede any region change.
5. **Authenticated page renders.** I could only fetch anon routes. `/reservar`, the admin agenda, and the check-in path — the actual hot paths — were read from source, not exercised. My "8 sequential round trips" is code-derived, not observed.
6. **Let's Encrypt / TLS issuance limits at 6,000 subdomains.** Flagged as ASSERTED. I did not fetch the current Let's Encrypt rate-limit page and refuse to state a number from memory. Verify with Vercel support if the wildcard rename does not happen.

Additional items I deliberately left to other agents: RLS/index/query-plan cost (`data:*`), email deliverability and Resend ceilings, backup/PITR posture, and the auth *structure* question.
