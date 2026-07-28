# Audit conclusion — 2026-07-28

Decision page for the Supabase fit / structure / alternatives audit.
Detail: [`2026-07-28-supabase-fit-and-alternatives-audit.md`](./2026-07-28-supabase-fit-and-alternatives-audit.md).
Evidence: [`2026-07-28-audit-evidence/`](./2026-07-28-audit-evidence/).

## Verdict

**Keep Supabase. Keep the tenancy model, the RLS boundary, the RPC surface.** No alternative wins at any of
100 / 1,000 / 3,000 gyms. The one substitution that pays is email: Amazon SES at ~$100/mo against Resend's ~$402
at 3,000 gyms.

**Cost is not the risk, and it never was.** Supabase's entire meter bill at 3,000 gyms × 200 members is **~$17/mo**.
The full stack — Supabase $444 + Vercel $658 + email + domains — is **~$1,507/mo = $0.50/gym = 8.77 MXN**, about
**2.9% of the 300 MXN floor**. Pro carries past 3,000 gyms on every meter; Team costs +$574/mo and raises none of them.

**What actually threatens the business is not infrastructure.** Support at market rates is **210–408% of revenue**
and saturates one founder at **~135 gyms**. Provisioning a gym is a code deploy, capping growth at **250–500
gyms/year** — 6 to 12 years to 3,000. Those two numbers came from 2 of 45 agents; the other 43 interrogated a line
worth 1% of revenue.

**12 of the 16 ranked weaknesses are live today at 4 gyms**, not projections at 3,000.

## Do this first — one afternoon

Ordered by payoff ÷ effort. Nothing here is a project.

| # | Change | Effort | Payoff |
|---|---|---|---|
| 1 | Pin both Vercel projects to `pdx1` in `vercel.json` | 1 line, $0 | Deletes 300–630 ms/render. DB is `us-west-2`, functions are `iad1`; co-location was never verified |
| 2 | `.eq("user_id", uid)` at 3–4 `gym_membership` call sites | 4 lines, no DDL | **667× measured** (1,056 ms → 1.58 ms) |
| 3 | `create index ventas (cliente_id, created_at desc)` | 1 statement, 2.9 s | **131× warm / 727× cold measured**; 23,571 → 4 buffers |
| 4 | Drop `p_ip` from `enviar_mensaje_contacto`; derive it server-side | ~1 h | Closes a live anon **unbounded-insert** vector — the limiter sits inside `if p_ip is not null` and the arg defaults to NULL |
| 5 | `revoke TRUNCATE` and the 5 anon write-RPC grants | ~1 h | `anon` holds TRUNCATE on all 29 tables; RLS does not apply to TRUNCATE |
| 6 | Separate the Resend invite key from the Supabase SMTP password | 10 min | One key today; one gym's bad roster suspends mail for all of them |

Ship 2–5 as one migration. Prod's data model is **byte-identical** to the repo's migrations, so it is safe to apply;
the drift is privilege-only.

## Then

| Change | Effort | Why |
|---|---|---|
| Per-gym export + one **timed** restore drill | 16–24 h | Per-tenant restore is **∞** today. Export covers 4 of 29 tables with primary keys dropped; import covers 0 |
| `invitar_operador` + a staff panel | 2–3 days | No code path creates an operator. A gym is one shared password that also holds bank details and the ledger |
| A void/correction path for `ventas` | 5–8 days | Sales are permanently uncorrectable, while the balance they justify is directly PATCH-able by any staff token |
| `unique (gym_id, tel)` on `clientes` | hours | **Expires.** 0 duplicates today so it builds instantly; after the first duplicate it needs a merge migration that must dodge an `ON DELETE CASCADE` |

## Check these — five minutes, dashboard only

| Question | Consequence |
|---|---|
| Pro or Team? | Team is +$574/mo for zero meter capacity |
| Is PITR purchased? | `max_connections=60` suggests it **cannot** be — PITR needs Small (90). Decides whether RPO is 24 h or 2 min |
| Spend Cap on or off? | ON turns disk/MAU/egress overages into **platform-wide outages** instead of bills |
| Vercel function region | Confirms item 1 above |
| Resend plan | Free's 100/day cap is a ~9–18 gym ceiling |

## Still unknown

- **The write path is unmeasured.** Three agents each disclaimed it assuming another had it. The one sample shows a
  write RPC costing *more* than the read anchoring the whole compute model — if that holds, every ceiling arrives
  earlier than stated. The seeded 3,002-gym scratch database still exists; this is ~20 minutes of direct queries.
- **Page views per gym per month** — ±5× on the largest vendor line. One sampled month of Vercel Analytics settles it.
- Everything outside §12 of the report is **modelled**. §12 is the only measured section.

## Two corrections to prior work

- The 2026-07-27 audit's cost table is wrong: MAU is **~$0**, not $845–1,430/mo. Measured member activation is 4.3%,
  not the assumed 40–90%.
- The "ADR-0013 is false" warning is **spent**. The ADR self-corrected on 2026-07-13 and the fix shipped as
  `20260714080000`. Acting on the old warning could revert it.
