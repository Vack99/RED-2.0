# The mail tier — coverage audit, agent "alt:email"

**Date:** 2026-07-27/28 · **Scope:** RED 2.0's mail rails at 3,000-gym scale (150–300 members/gym) · **Method:** code cartography (own file:line reads, not adopted from prior docs without re-verification) + live-prod SQL + fresh vendor-doc fetches (dated below) + git history

**Stance on prior work:** `docs/Context/2026-07-22-invite-mail-capacity-audit.md` and its handoff are a real, well-evidenced prior audit. I re-verified their core code citations myself (all checked out) and their core Resend facts (bounce 4%/complaint 0.08%/suspension-without-warning, 10 req/s per team) via fresh fetches today — they hold. But that audit modeled a **40-member gym**; this mandate's target is **150–300 members/gym**. I rebuilt the volume model at the mandate's scale, and it changes the vendor-tier conclusion materially (see §3). I also found one factual staleness in that audit (receipts no longer carry a PNG attachment — see §1.4) and one framing gap it didn't pursue: representative-volume bounce math means the "shared blast radius" risk does not shrink with platform scale (see §5, Finding 1).

---

## 1. The mail rails — verified by direct file read

Six send paths, all going to `POST api.resend.com/emails` (five direct from admin app, one via a Supabase Auth Send Email Hook edge function). I re-read every citation below directly; none were taken on faith from the prior audit.

| # | Rail | Trigger | File:line | Draws on Supabase's 50/hr bucket? |
|---|---|---|---|---|
| 1 | Invite (auto) | New sale with email, `/vender` | `apps/admin/src/app/(app)/vender/actions.ts` → `packages/data/src/server/invitaciones.ts:181-219` (`enviarInvitacion`) | No — direct to Resend |
| 2 | Receipt (auto) | Every sale with an email on hand | `apps/admin/src/app/(app)/vender/recibo-envio.ts:23-44` (`enviarReciboDeVenta`) | No — direct to Resend |
| 3 | Invite (auto, easy to miss) | Editing a ficha to set/change email on an **unclaimed** row | `packages/data/src/server/clientes.ts:455-461` (`actualizarCliente`) | No — direct to Resend |
| 4 | Invite resend (manual) | REENVIAR button | `packages/data/src/server/clientes.ts:470-478` (`reenviarInvitacion`) | No — direct to Resend |
| 5 | Receipt resend (manual) | Recibo card resend | same as #2 | No — direct to Resend |
| 6a | Password reset | `/entrar` forgot-password | `packages/data/src/server/sesion.ts:39-47` (`solicitarReset` → `auth.resetPasswordForEmail`) | **Yes** |
| 6b | Magic link (`cuenta_existente` rail) | `/activar` when the email already has an account (2nd-gym member) | `packages/data/src/server/sesion.ts:58-69` (`enviarMagicLink` → `auth.signInWithOtp`) | **Yes** |
| 6c | Cold self-signup confirmation | `/registro` — still a live route, NOT removed by the H2v2 cutover | `packages/data/src/server/registro.ts:74-97` (`registrarSocio` → `auth.signUp`) → `apps/client/src/app/registro/actions.ts` | **Yes** |

### 1.1 The H2v2 cutover changed rail 6's composition, not its existence

Memory + commit `16a18b7` ("remove the /registro code-claim arm") mean `/activar` is now the **sole invite door**, and I verified `supabase/functions/activar-cuenta/index.ts:92-95` uses `admin.auth.admin.createUser({email_confirm:true})` — this bypasses GoTrue mail entirely; a normal invited member costs **zero** rail-6 traffic. But I also verified (`Grep` for `enviarMagicLink|solicitarReset|registrarSocio` under `apps/client`) that **`/registro` (cold self-registration) is still a live route** calling `signUp`, which **does** fire a GoTrue confirmation email. The prior audit's "activation costs zero extra mail" claim is correct for the *invited* path only — I'm flagging that rail 6c (cold signup) still exists as an open door and still draws on the shared bucket. It's probably low-volume in practice (the product is invite-led), but it is not zero, and it is the rail through which an un-vetted stranger can spend platform-wide auth-mail budget.

### 1.2 No bulk/batch path exists — confirmed independently

`Grep` for `csv|CSV|bulk|masiv|batch` and for any `.map(...)`/loop over `clientes` calling a send function, across `apps/`: **zero matches**. Peak fan-out per operator action is 2 (one sale = invite + receipt, confirmed in `vender/actions.ts`). This matches the prior audit; I re-ran the search myself rather than trusting the citation.

### 1.3 `notificaciones_activadas` is a UI preference, not a send gate — confirmed by reading the migration and grepping every reference

`supabase/migrations/20260706200000_clientes_notificaciones_toggle.sql` adds the column; its own comment calls it *"a preference only... NO delivery channel"*. `Grep` for `notificaciones_activadas` across the repo shows it read only in `agenda-miembro.ts` (rendered as a UI toggle) — **never** checked by `enviarInvitacion`, `enviarReciboDeVenta`, or the send-email hook before dispatch. The RPC that would have let a member actually flip it (`set_notificaciones`) was dropped (`20260708190000_drop_set_notificaciones.sql`). **There is no working opt-out anywhere in the send path.** Not a legal blocker for transactional mail, but it means every bounced/complained address gets mailed again next cycle with no suppression list — this compounds Finding 1 in §5.

### 1.4 Correction to the prior audit: receipts no longer carry an attachment

The 2026-07-22 audit (same day, but evidently before this landed) states receipts "carry the PNG twin" and that this is why the Resend batch endpoint (100/call, no `attachments` support) can never cover rail 2. I read `apps/admin/.../vender/_components/ticket-twin.ts:116-131` (`construirReciboEmail`) directly: it returns `{subject, html, text}` — **no attachment field, no PNG generation call.** `git log` confirms: commit `0c74a44` added the PNG attachment (#100), commit `1ab639d` — *"drop the receipt PNG attachment, keep the email (#104)"* — removed it. **As of `main`, no mail rail sends an attachment.** This doesn't change the "no bulk path exists today" conclusion, but it does remove one of the stated reasons a future bulk path would need a non-batch fallback for receipts.

---

## 2. Volume model, rebuilt at the mandate's 150–300-member scale

**Live-measured inputs (queried this session):**

```sql
select count(*) total, count(email) con_email, round(100.0*count(email)/count(*),1) pct from clientes;
-- {"total_clientes":116,"con_email":55,"pct_email":"47.4"}

select count(*) ventas, count(distinct cliente_id) clientes, round(count(*)::numeric/count(distinct cliente_id),2) ratio from ventas;
-- {"total_ventas":175,"clientes_distintos":107,"ventas_por_cliente":"1.64"}

select count(*) from clientes where invitacion_enviada_at is not null;
-- 30 (up from 28 five days prior, per the 2026-07-22 handoff — ~0.4/day platform-wide today)
```

**Caveat on the live numbers:** this is a 4-gym, largely *seeded* dataset (memory: `red-gym-live-seed-progress`), not organic steady-state traffic. I'm using the measured **47.4% email coverage** as the honest current-state input, but treating the sale-cadence and churn numbers below as stated assumptions, not measurements, and flagging them as such.

**Per-member-month model** (assumptions labeled):

| Rail | Formula | Assumption |
|---|---|---|
| Receipt (rail 2) | 1 sale/member/month × email-coverage | Monthly renewal cadence — **ASSUMED**, typical for gym memberships, not measured (live ratio of 1.64 ventas/cliente spans 98 days of mixed seed+organic activity and isn't a clean monthly rate) |
| Invite (rails 1,3,4) | (1/12 roster turnover)/month × email-coverage × 1.3 (resend/edit factor) | 8.3%/month churn+refill — **ASSUMED** |
| Auth mail (rail 6) | 1 event/member/year × email-coverage | password-reset + magic-link + cold-signup combined — **ASSUMED**, consumer-product-typical |

At **225 members/gym** (midpoint of the mandate's 150–300 range), two coverage scenarios:

| Scenario | Receipt/mo | Invite/mo | Auth/mo | **Total/gym/mo** |
|---|---|---|---|---|
| LOW — today's measured 47.4% coverage | 106.7 | 11.5 | 8.8 | **≈127** |
| HIGH — mature 90% coverage (email is mandatory for account creation; legacy no-email rows are a shrinking minority as gyms onboard through the invite flow from day one) | 202.5 | 21.9 | 16.8 | **≈241** |

**Totals at the requested gym counts** (LOW–HIGH range):

| Gyms | Emails/month | Emails/day |
|---|---|---|
| 100 | 12,700 – 24,100 | 420 – 800 |
| 1,000 | 127,000 – 241,000 | 4,200 – 8,000 |
| 3,000 | **381,000 – 723,000** | **12,700 – 24,100** |

**This is materially higher than the prior audit's 135,600/mo at 3,000 gyms** — that number was built on a 40-member gym; this mandate specifies 150–300. Even my LOW bound (381k/mo, using the same email-coverage discount the prior work implicitly didn't apply) is **2.8×** the prior estimate. This matters because it pushes the required Resend plan tier up a step (see §3) and directly undermines the prior cost table's "$385–1,150/mo" Resend line as a lower-middle-of-range estimate rather than a safe upper bound.

---

## 3. Vendor pricing — five vendors, fetched today (2026-07-27/28)

### 3.1 Base pricing tables (source + fetch date on every row)

**Resend** — fetched `resend.com/pricing`, 2026-07-27:

| Plan | Price/mo | Included | Daily cap | Overage/1k |
|---|---|---|---|---|
| Free | $0 | 3,000/mo | **100/day hard cap** | n/a |
| Pro | $20 | 50,000/mo | none | $0.90 |
| Pro | $35 | 100,000/mo | none | $0.90 |
| Scale | $90 | 100,000/mo | none | $0.90 |
| Scale | $160 | 200,000/mo | none | $0.80 |
| Scale | $350 | 500,000/mo | none | $0.70 |
| Scale | $650 | 1,000,000/mo | none | $0.65 |
| Scale | $825 | 1,500,000/mo | none | $0.52 |
| Scale | $1,150 | 2,500,000/mo | none | $0.46 |

Dedicated IP: **$30/mo, Scale tier only, gated at >3,000 emails/day** (~90k/mo single-account threshold) — quoted from the pricing page.

**Amazon SES** — fetched `docs.aws.amazon.com` pricing + FAQ pages, 2026-07-27/28:
- Essentials (no monthly base fee): **$0.16/1,000 emails** (0–10M/mo tier), $0.14/1,000 (10–100M)
- Pro: $105/mo base + $0.22/1,000 (0–10M)
- Managed dedicated IP: **$15/mo/account** + $0.08–$0.02/1,000 volume-tiered surcharge

**Postmark** — fetched `postmarkapp.com/pricing`, 2026-07-27:

| Plan | Price/mo | Included | Overage/1k |
|---|---|---|---|
| Free | $0 | 100/mo | not allowed |
| Basic | $15 | 10,000/mo | $1.80 |
| Pro | $16.50 | 10,000/mo | $1.30 |
| Platform | $18 | 10,000/mo | $1.20 |

Dedicated IP: **"$50/mo per IP, starts at" — Pro tier or higher, and only for customers sending ≥300,000/mo** (quoted from the pricing page).

**Mailgun** — fetched `mailgun.com/pricing`, 2026-07-27:

| Plan | Price/mo | Included | Overage/1k |
|---|---|---|---|
| Free | $0 | 100/day, 3,000/mo | n/a |
| Basic | $15 | 10,000/mo | $1.80 |
| Foundation | $35 | 50,000/mo | $1.30 |
| Scale | $90 | 100,000/mo | $1.10 |

1 dedicated IP included on "Foundation 100k" and Scale plans (my fetch surfaced a "Foundation 100k" tier distinct from the $35/50k Foundation shown above — likely a higher committed-volume Foundation SKU not fully captured by the pricing-page scrape; flag as **not fully resolved**, treat the $35/50k figure as the floor). Additional IPs: $59/IP/mo.

**SendGrid** — official pricing page (`sendgrid.com/pricing/`, and the `twilio.com/en-us/sendgrid` redirect target) would not render for WebFetch (JS-only SPA, 301-redirect loop, confirmed after 4 attempts). Cross-corroborated across three independent secondary sources (`sendx.io/blog/sendgrid-pricing`, `costbench.com/software/email-api/sendgrid`, `tekpon.com/software/sendgrid/pricing`), all agreeing to the cent, searched 2026-07-27 — **marking these numbers ASSERTED, not primary-fetched**:
- Essentials: $19.95/mo, 50,000 emails/mo
- Pro: $89.95/mo, 100,000 emails/mo, **includes 1 dedicated IP**
- Premier: custom/sales-negotiated — no public number, genuinely unfetchable, marked ASSERTED-UNAVAILABLE

Overage rate beyond Pro's 100k is not published anywhere I could reach — high-volume SendGrid pricing (which is what 1,000+ gyms would need) is **sales-negotiated and not publicly priced**. This is itself a data point: SendGrid's model doesn't let you self-serve-price the volume this platform would need at 1,000+ gyms.

### 3.2 What it costs at my volume model (§2), using the LOW–HIGH monthly range, cheapest flat-tier-plus-overage combination, dedicated IP added once the vendor's own stated threshold is crossed

| Gyms | Volume/mo | **Resend** | **SES** | **Postmark** | **Mailgun** | **SendGrid** |
|---|---|---|---|---|---|---|
| 100 | 12.7k–24.1k | $20 (Pro) | **$2–4** | $16.50+overage ≈ $22–33 | $35 (Foundation) | $19.95 (Essentials) |
| 1,000 | 127k–241k | $160–190 (Scale+ded.IP¹) | **$20–39** | $16.50+overage ≈ $167–316 | $90+overage ≈ $109–235 | not self-serve-priceable (Premier) |
| 3,000 | 381k–723k | $416–1,120 (Scale, overage-optimal, +ded.IP) | **$61–116** | $16.50+overage ≈ $488–938 | $90+overage+extra IPs ≈ $597–890 | not self-serve-priceable (Premier) |

¹ Dedicated IP becomes **mandatory by Resend's own stated threshold** (>3,000/day) at roughly 300+ gyms under the HIGH scenario, ~700+ gyms under LOW — i.e., well before 1,000 gyms.

**The headline number the prior work should carry forward:** at this mandate's stated gym size, **Amazon SES is 4–10× cheaper than every other vendor at every volume tested**, because SES bills per-email with no plan floor while every other vendor here bills a committed-bucket SaaS plan. This is not a close call. It is also the vendor offering the *least* built-in tenant-isolation tooling — the cost gap is bought with engineering effort (bounce/complaint handling, suppression, dashboarding all DIY via SNS/CloudWatch), which is a real cost just not a *vendor invoice* cost. §5 covers whether that tradeoff is worth it.

**Falsification check on "SES is just cheaper":** what would have to be true for this to be wrong? If SES's move-in engineering cost (SNS bounce webhook processing, suppression-list table, CloudWatch alarms, a second SMTP integration test cycle) exceeds the $300–1,000/mo delta to Resend amortized over, say, 12 months, SES loses on total cost of ownership. Ballpark: this is a well-trodden integration (`aws-sdk` SES client + SNS topic + one Postgres suppression table) — a competent implementation is days, not weeks, of engineering time, and RED already ships raw-`fetch` HTTP integrations by convention (no npm client for Resend either — see `invitaciones.ts:56`). At any plausible engineer-day rate, the SES savings pay for the integration inside the first 1–2 months at 1,000+ gyms. **I could not find a scenario where Resend's simplicity premium is worth $1,000+/mo at 3,000 gyms** — but I did not build and test an SES integration, so this is a modeled conclusion, not a verified one. Exit trigger: if a spike solution built at 100-gym scale takes >2 engineer-weeks or reveals a deliverability regression Resend's managed reputation would have prevented, reverse this call.

---

## 4. What actually breaks — the four mechanisms, ranked by how directly the mandate asked for them

### 4.1 Shared reputation / per-tenant blast radius, by vendor (fetched today unless noted)

| Vendor | Native tenant isolation | Cost | Verification |
|---|---|---|---|
| **Resend** | **None at the account level.** Domains/webhooks/suppression lists/analytics are all account-scoped (confirmed via search synthesis + `resend.com/docs/add-a-domain`, fetched 2026-07-27). Per-tenant **subdomains** isolate DKIM/DNS reputation for inbox-placement purposes — quoted directly from Resend's own domain docs: *"We recommend sending your emails from one or more subdomains... to isolate your sending reputation."* **But the AUP's bounce/complaint suspension thresholds are stated as account-wide with no per-domain carve-out** — subdomains help deliverability, they do NOT protect the account from a suspension triggered by one bad tenant. | Free (subdomain is just DNS work) | Primary-fetched |
| **Postmark** | Claims a "Platform" tier with per-client subaccounts, isolated sending, per-client IP pools (via secondary sources: `sendx.io`, others, searched 2026-07-27). My own primary fetch of `postmarkapp.com/pricing` shows Pro/Platform tiers and a dedicated-IP add-on, but does **not** itself describe subaccount isolation — a direct fetch of the subaccounts detail page 404'd. **Marking the isolation claim as secondary-sourced, not independently primary-confirmed.** | Platform tier $18/mo base + per-client dedicated IPs $50/mo each once ≥300k/mo | Partial — flag for re-check |
| **Mailgun** | Has a real subaccounts feature, but my primary fetch of `mailgun.com/pricing/subaccounts` states it is **"currently reserved for contract customers"** — not available on self-service plans. | Enterprise contract only, no public price | Primary-fetched |
| **SendGrid** | **Subusers + IP pools** are real, self-service, API-provisionable — separate suppression lists, separate stats, assignable dedicated IPs per subuser (confirmed via search of Twilio's own docs, `twilio.com/docs/sendgrid/ui/account-and-settings/ip-pools`). This is the only vendor here with self-service per-tenant isolation that doesn't require an enterprise contract. Operational cost: provisioning 3,000 subusers is a real automation project, not a toggle. | Subuser creation is free; isolation quality scales with how many dedicated IPs you buy per pool | Corroborated via primary Twilio docs pages |
| **SES** | No subaccounts, but supports multiple **configuration sets** + multiple dedicated IPs + IP pools — full isolation is achievable, entirely DIY (no per-tenant dashboard). | $15/mo/IP + volume | Primary-fetched |

**RED today: zero of this exists.** One Resend account, one domain (`ibookit.lat`), one API key that is *also* the Supabase custom-SMTP password (`docs/runbooks/hitl-72-resend-live.md` §D, §B — read directly). A suspension takes down invites, receipts, AND auth mail for all 3,000 gyms at once.

### 4.2 Supabase's auth email rate limit — exact number, re-verified from Supabase's own docs today

Fetched `supabase.com/docs/guides/auth/rate-limits` and `supabase.com/docs/guides/platform/going-into-prod`, 2026-07-27:
- Default (no custom SMTP): **"2 emails per hour"**
- Scope, quoted exactly: **"Sum of combined requests project-wide"** — one bucket, every tenant, no per-gym partition
- **"You can only change this with your own custom SMTP setup"** — no documented maximum once custom SMTP (Resend) is wired
- RED's live-configured value (per `docs/runbooks/hitl-72-resend-live.md:82-84`, an owner-executed runbook, not a live DB read — **I could not query this setting via SQL; dashboard rate limits aren't exposed to `execute_sql`**): **50/hour**, deliberately set below Resend Free's 100/day so an hourly burst couldn't outrun the daily cap.

**Gyms-per-hour ceiling — computed at this mandate's scale, which the prior audit didn't do explicitly:**

Rail 6 traffic = password resets + magic links + cold self-signups, **not** invite activation (that's zero-cost, §1.1). Modeling this at 1 auth-mail event/member/year (§2's ASSUMED rate):

```
N_gyms = (bucket/hr × hours/yr) / (members/gym × events/member/yr)
       = (50 × 8,760) / (225 × 1)
       = 438,000 / 225
       ≈ 1,947 gyms
```

At 0.5 events/member/yr (better UX, fewer resets): ≈3,893 gyms. At 2/yr (worse UX): ≈973 gyms. **This is on AVERAGE, evenly-spread load** — the platform-wide ceiling sits somewhere in the **1,000–3,900-gym band**, not cleanly "3,000" as the prior audit stated (that number used the 40-member assumption, which pushes the ceiling higher because fewer members per gym means fewer auth events per gym for the same gym count).

**Burst correction (new — not in prior work):** gym auth activity is not evenly spread across 24 hours; it clusters around gym peak hours (member check-in windows, evening password-reset-after-a-long-day behavior). If a plausible 25–35% of daily auth-mail traffic concentrates into a single peak hour (a standard assumption for consumer-app usage curves, not measured here), the **effective safe ceiling drops by the same factor — into roughly the 300–1,200-gym band.** Symptom, unchanged from prior audit: a member at gym #7 can't reset a password because gym #412's evening rush ate the hour's bucket. **Unverified — do not design around the exact multiplier**, but the direction (burst concentration lowers the effective ceiling well below the average-load number) is not in question.

**Falsification check:** what would have to be true for "the hook doesn't lift the rate limit" to be wrong? I re-fetched `supabase.com/docs/guides/auth/auth-hooks/send-email-hook` directly today and searched it for "rate limit" — **zero mentions**, consistent with the prior audit's finding. This is still not a positive confirmation (absence of a claim isn't proof), but two independent fetches five days apart now agree the hook's own docs never claim to lift it. Treat as **probable-not-lifted, still not certain**.

### 4.3 LatAm deliverability specifics

- **Inbox mix**: Gmail, Hotmail/Outlook, and Yahoo together historically account for **>70% of email-client share in Brazil, Argentina, Mexico, and Chile**, per a 2026 deliverability-benchmark source citing 2019-era measurement (searched 2026-07-27, `mailreach.co/blog/email-deliverability-statistics`) — directionally durable but the underlying data point is dated; local providers (BOL, Terra, UOL) hold meaningful residual share in Brazil specifically.
- **Regional inbox placement is measurably worse than global**: cited **81.1–87.4%** LatAm inbox placement vs. a higher global baseline, attributed by the same source to "inconsistent domain security adoption and shared IP usage" — this is exactly RED's current posture (one shared domain, no dedicated IP yet).
- **Spanish-language content is not itself a filter trigger.** Multiple sources agree modern spam filters (Gmail's specifically) are multilingual and score on sender reputation/engagement, not source language — the risk is indirect (a platform-wide shared-domain reputation problem shows up as worse deliverability for ALL gyms' Spanish content, but the language isn't the cause).
- **SPF/DKIM/DMARC**: RED has exactly **one** verified sending domain (`ibookit.lat`) for all tenants (`hitl-72-resend-live.md` §A). No gym gets its own domain identity in mail headers today — every gym's brand name only appears in the `From:` display name (`remitenteConNombre`, `invitaciones.ts:160-166`), never the actual domain. This is the standard "one platform sender" ADR-0014 posture, not a bug, but it means SPF/DKIM/DMARC authentication is uniform and undifferentiated per gym — a LatAm ISP that starts throttling `ibookit.lat` throttles every gym simultaneously, with no differentiated per-gym recovery path.

### 4.4 Bounce/complaint budgets — verifying the prior claim "the bounce budget binds before throughput does"

Thresholds, all primary-fetched 2026-07-27/28:

| Vendor | Bounce threshold | Complaint threshold | Consequence |
|---|---|---|---|
| Resend | **<4%** | **<0.08%** | "your account may be shutdown without warning" |
| SES | 5% → under review; **10% → sending paused** | 0.1% → under review; **0.5% → sending paused** | (per feedback-loop-reported domains only) |
| Postmark | **<10%** | **<0.1%** | "reserves the right to cancel your account" |
| Mailgun | **≤5%** | **≤0.08%** | "limit, suspend, or terminate" |
| SendGrid | not found in a primary source this session | not found | — |

**The claim is TRUE, but I want to sharpen *why* it's true, because the prior audit framed it as a cold-start artifact** ("Lifetime denominator is tiny — 28 invites stamped platform-wide"), implying it would stop binding once the platform has real volume. **That's the wrong mental model.** SES's own FAQ (`docs.aws.amazon.com/ses/latest/dg/faqs-enforcement.html`, quoted directly): bounce/complaint rate is *not* calculated over a fixed lifetime — it's calculated over **"a representative volume... different for each user and changes as the user's sending patterns change."** That means the relevant denominator is always a **recent rolling sample**, not platform lifetime-to-date. **A single gym importing one bad 200-contact roster in one sitting can spike the recent-window bounce rate above threshold at 30 gyms platform-wide OR at 3,000** — the risk does not shrink as the platform grows, because growth doesn't dilute a rolling window the way it would dilute a lifetime average. **This is the single most important correction I'm making to prior work**: the shared-reputation risk is not a today-only cold-start problem to be outgrown; it is a permanent structural property of "one account, one domain, no per-tenant isolation," and it will still be true at 3,000 gyms unless isolation (subdomains at minimum, ideally SendGrid-style subusers or a dedicated-IP-per-cohort scheme) is added before scale, not as a reaction to a first suspension.

---

## 5. Ranked — five worst things about the mail posture, worst first

**1. Shared, unisolated, account-level reputation with a rolling-window bounce/complaint gate that never dilutes with scale.**
One Resend account, one domain, one API key that doubles as the Supabase SMTP password (`hitl-72-resend-live.md` §B, §D — read directly). Any single gym's dirty roster import can trip Resend's 4%-bounce/0.08%-complaint threshold in its *representative volume window* regardless of platform size (§4.4), and the fallout is platform-wide: invites, receipts, and password resets all die simultaneously because they share the credential. **Breaks at:** any gym, any day, importing/mailing roughly a few dozen bad addresses in one sitting — this is a per-*event* risk, not a per-*gym-count* risk. **Confidence: measured** (AUP text fetched today + code confirms shared credential). **Exit trigger to reverse "keep single-domain":** the day a gym onboarding flow accepts a bulk contact import (CSV, WhatsApp-forward paste, etc.) — at that point per-tenant subdomains (free, DNS-only) become mandatory, not optional, regardless of gym count.

**2. Supabase's 50/hour project-wide auth-email bucket saturates well below "3,000 gyms" once sized at this mandate's actual member count, and bursts push the safe ceiling lower still.**
Recomputed at 225 members/gym (§4.2): ~1,000–3,900 gyms on average load, plausibly 300–1,200 gyms under a realistic peak-hour concentration. The prior audit's "~3,000 gyms" figure used a 40-member-gym assumption and doesn't hold at the mandate's stated scale. **Breaks at:** the low end of that band, symptomatically as an unrelated gym's reset/signup burst 429-ing a different gym's password reset. **Confidence: modelled** (the per-member auth-event rate is an assumption, not measured — flagged explicitly in §2). **Exit trigger:** instrument GoTrue 429s now (the prior audit already recommended this and it's still undone) so the actual ceiling is measured, not modelled, before it's hit blind.

**3. The prior cost estimate under-priced the mail line for this mandate's own stated scale, and over-anchored on Resend without pricing the cheapest real option.**
At 150–300 members/gym, 3,000-gym volume is 381k–723k emails/month (§2) — 2.8–5.3× the prior audit's 135,600/mo. Resend's own bill at that volume, overage-optimized, is $416–1,120/mo (§3.2) — plausible but noticeably above the low end of the prior "$385–1,150" estimate. Meanwhile SES prices the *same volume* at **$61–116/mo** (§3.2) — 4–10× cheaper — and was never evaluated in the prior cost table. **Breaks at:** nothing breaks here technically; this is a modeling gap, not a system failure — but it means a synthesizer citing "$385–1,150/mo for email" as the platform's mail-cost reality is citing a vendor-choice artifact, not a structural cost floor. **Confidence: modelled** (SES integration cost is estimated, not built — see the falsification check in §3.2).

**4. Every send is a single unretried attempt with no dedupe, and this degrades — not stays flat — as volume grows.**
`invitaciones.ts:73` and the hook's Resend call both drop 429/5xx as an opaque failure; `retry-after`/`ratelimit-reset` headers are discarded. This is tolerable today because a human watches every one of ~1–2 sends/day. **At scale it doesn't get more dangerous per-send, but the odds that a human notices any given silent drop go down as daily send count goes up** — the safety net here is attention, and attention is a fixed resource against a growing send volume. **Breaks at:** whatever daily per-operator send count makes "eyeball every recibo card" impractical — not measured, but qualitatively somewhere well before 3,000 gyms' aggregate volume, since no single operator watches platform-wide volume; the real question is per-*gym* operator attention, which stays roughly constant per gym as the platform adds gyms (this is actually a reason the risk *doesn't* scale platform-wide the way Finding 1 does) — but it does scale with any single gym's daily volume, e.g., a gym running a manual bulk-invite session by hand. **Confidence: measured** (code read directly).

**5. No suppression list / no live opt-out gate, despite a UI element that implies one exists.**
`notificaciones_activadas` reads as a working notification toggle in the member's profile UI but is never consulted by any send path (§1.3) — a member who "turns off notifications" still gets every transactional email, and a bounced/complained address is never suppressed from future sends because there's no table for it. This directly feeds Finding 1: without a suppression list, a bad address that bounced once bounces again on the next receipt/renewal cycle, re-consuming bounce budget indefinitely. **Breaks at:** the first repeat-bounce incident post-suspension-recovery, which would look identical to the original incident because nothing was learned/stored from it. **Confidence: measured** (migration + grep confirm the toggle is inert).

**Honest counterpoint (rule 7):** none of these five are failures *today*. At 4 gyms and ~1–2 sends/day, this posture is genuinely fine — no queue is needed, no per-tenant isolation is needed yet, and the "keep it simple" design (best-effort, no retry, ADR-0015) is the right call at this volume. The findings above are about what changes, and when, as gym count and per-gym volume grow — which is exactly what the mandate asked for.

---

## 6. Blind spots — what I did not examine

1. **I did not build or test an SES integration.** The $61–116/mo figure (§3.2) is priced correctly from AWS's own rate card, but the engineering-cost offset in the falsification check (§3.2) is a reasoned estimate, not a measured build. A dedicated agent should actually spike an SES + SNS-bounce-webhook integration against a scratch Supabase project before this becomes a real recommendation.
2. **I could not read Supabase's dashboard rate-limit setting via SQL.** The "50/hour" live value is sourced from an owner-executed runbook (`hitl-72-resend-live.md`), not a direct read of the current dashboard state — it could have drifted since 2026-07-09 without a code trail. Someone with dashboard access should confirm it live.
3. **Postmark's subaccount/per-tenant isolation claims are secondary-sourced only** — my direct primary fetch of the relevant detail page 404'd. Worth one more attempt with a different URL or Postmark's own docs site (`postmarkapp.com/support`) before anyone budgets around it.
4. **SendGrid's pricing above the Pro tier (100k/mo) is genuinely unpriceable without a sales call** — at 1,000+ gyms this vendor drops out of any comparison I can defend with evidence; I did not attempt to contact sales.
5. **All per-member send-rate assumptions in §2 (1 sale/month, 8.3% monthly churn, 1 auth-event/member/year) are modeled, not measured.** RED's live data is too small and too seed-dominated to calibrate these from real traffic. The next real signal will come from RED's own organic growth curve, not from this audit.
6. **I did not investigate whether Vercel's own outbound-request limits, Supabase Edge Function concurrency, or the 10s `AbortSignal.timeout` in `resendTransport`** interact with a future higher-throughput scenario (e.g., a bulk-invite feature) beyond what the prior audit already flagged as unpublished/unverified. That remains open.
7. **I did not verify the LatAm inbox-share and inbox-placement statistics against a second independent source** — both came from the same class of deliverability-benchmark aggregator site, and the underlying client-share number is explicitly dated to 2019 measurement republished in a 2026 post. Treat §4.3's numbers as directionally right, not precise.
