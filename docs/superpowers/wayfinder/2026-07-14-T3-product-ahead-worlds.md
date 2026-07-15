# T3 — Product-ahead worlds: Sellable Product · Monetization · Growth & Reach

> **Wayfinder asset** · resolves [T3 · Decompose the product-ahead pillars into quests](https://github.com/Vack99/RED-2.0/issues/108) (#108) on map [#105](https://github.com/Vack99/RED-2.0/issues/105) · 2026-07-14
>
> **What this is:** the quests for the three product-ahead worlds — 🛒 Sellable Product, 💳 Monetization, 🚀 Growth & Reach — authored **exactly** against the [T2 scope-model schema](https://github.com/Vack99/RED-2.0/blob/main/docs/superpowers/wayfinder/2026-07-14-T2-scope-model-schema.md) and honouring [T1's ahead-world-bleed table](https://github.com/Vack99/RED-2.0/blob/main/docs/superpowers/wayfinder/2026-07-14-T1-foundation-catalogue.md). Each world below is a ready-to-paste `worlds:` list node.
>
> **Capture, don't resolve.** Pricing, the counsel/pilot go-gate, the caching approach, and the gym-acquisition model are `status: needs-decision` quests — the owner's call, not invented here. T1's bleed items are marked **shipped** under their ahead world, with real bindings, not re-filed as todo.

---

## 🛒 Sellable Product

What makes RED buyable and usable without hand-holding: a member can self-serve an account (**shipped** — earned ahead inside Phase 3/6/7a), and a gym can discover, sign up for, and stand up its tenant without an engineer (**not built** — gyms are onboarded by hand today via seeds + host-map migrations). The acquisition model itself is an owner decision that sets the funnel shape.

```yaml
- id: sellable-product
  name: Sellable Product
  emoji: 🛒
  caveats:
    - "Gyms are onboarded by hand today — per-gym seeds + host-map migrations; no self-serve path exists yet"
  subgroups:

    - name: "Member self-registration (earned-ahead — shipped)"
      quests:
        - id: member-self-registration
          title: "Member self-register + email-verified claim"
          what: "Public registro wired to reclamar_o_crear_cliente; atomic clientes+membership; phone never claims; Turnstile anti-bot"
          status: shipped
          github: { issues: [26, 55] }
          evidence:
            - { type: path, ref: supabase/migrations/20260710030000_reclamar_email_fix.sql, note: "email-drop fix #78" }
            - { type: memory, ref: phase6-client-execution-progress, note: "Turnstile + auth/session fixes" }

        - id: member-claim-rail
          title: "Two-doors claim / invite rail"
          what: "código-de-invitación + email claim so an admin-sold member can claim their online account; cross-tenant claim guards"
          status: shipped
          github: { issues: ["65-71", 73, 78], label: member-reg-invite-2026-07 }
          depends_on: [member-self-registration]
          caveats:
            - "Email is the sole join key — null-email / legacy cuenta_activa rows still need a backfill/merge decision (#48-adjacent)"

    - name: "Gym acquisition & onboarding (not built)"
      quests:
        - id: gym-onboarding-model
          title: "Decide the gym-acquisition model"
          what: "Fully self-serve signup vs sales-assisted provisioning, and who approves a new gym — sets the whole funnel shape"
          status: needs-decision

        - id: platform-commercial-site
          title: "RED platform commercial site"
          what: "Public site presenting RED to prospective gym owners (features + pricing) that funnels them into signup"
          status: todo
          github: { label: quest:commercial-site }
          depends_on: [gym-onboarding-model]

        - id: gym-provisioning-automation
          title: "Automated tenant provisioning"
          what: "Programmatic gym + gym_domain + seed + host-map creation, replacing the hand-run seeds and host-map migrations"
          status: todo
          github: { label: quest:gym-provisioning }
          depends_on: [gym-onboarding-model]

        - id: gym-self-serve-onboarding
          title: "Gym self-serve onboarding flow"
          what: "Gym-owner signup wizard: create the gym, brand it, seed program/paquetes, go live without an engineer"
          status: todo
          github: { label: quest:gym-onboarding }
          depends_on: [gym-provisioning-automation, gym-onboarding-model]
```

---

## 💳 Monetization

Two money flows: gyms pay RED (platform **subscriptions**), and gyms bill their own members (**Stripe Connect**). The strategy is locked and earned-ahead — BYO-Stripe, RED takes no cut, payments never gate access — and the plan-change UI seam is already built to that contract (#61). The **mechanism** is deliberately deferred and gated on counsel + a pilot; pricing and the go/no-go are owner calls captured as `needs-decision`.

```yaml
- id: monetization
  name: Monetization
  emoji: 💳
  caveats:
    - note: "Any Stripe money movement is gated on legal counsel + a pilot per the locked payment strategy — not yet cleared"
      ref: { type: memory, ref: member-registration-payment-strategy }
  subgroups:

    - name: "Strategy & seam (earned-ahead)"
      quests:
        - id: payment-strategy
          title: "Payment strategy — BYO-Stripe, no-cut, don't-gate"
          what: "Locked: gyms bring their own Stripe, RED takes no cut of member pay, payments never gate access; Phase-1 ships email-capture, no Stripe"
          status: shipped
          evidence:
            - { type: memory, ref: member-registration-payment-strategy }
            - { type: issue, ref: 61, note: "plan-change UI seam already built to this contract" }

        - id: plan-change-seam
          title: "Membership plan-change UI seam"
          what: "Plan card + 'paga en tu gym' confirm with zero client entitlement writes — the clean surface Stripe plugs into later"
          status: shipped
          github: { issues: [61] }
          depends_on: [payment-strategy]

        - id: red-subscription-pricing
          title: "Decide what RED charges gyms"
          what: "Subscription tiers and price points for the platform fee gyms pay RED"
          status: needs-decision

        - id: stripe-go-gate
          title: "Counsel + pilot go/no-go for live payments"
          what: "Owner sign-off — legal counsel review and a pilot gym — before any real money moves through Stripe"
          status: needs-decision
          depends_on: [payment-strategy]

    - name: "Gyms pay RED (platform subscriptions)"
      quests:
        - id: stripe-subscriptions
          title: "Stripe Billing — gyms pay RED"
          what: "Recurring subscription per gym via Stripe Billing; subscription-lifecycle webhooks drive the gym's active/entitlement state"
          status: todo
          github: { label: quest:stripe-subs }
          depends_on: [red-subscription-pricing, stripe-go-gate]

        - id: billing-dunning
          title: "Dunning & revenue recovery"
          what: "invoice.payment_failed handling, Smart Retries, past_due → warn/suspend gym, branded dunning mail via the Send Email Hook"
          status: todo
          github: { label: quest:billing-dunning }
          depends_on: [stripe-subscriptions]

    - name: "Gyms bill their members (Stripe Connect)"
      quests:
        - id: stripe-connect-onboarding
          title: "Stripe Connect — gym-owned accounts"
          what: "Each gym connects/creates its own Stripe (Accounts v2, Account-Links KYC); BYO-Stripe means the gym owns the account and the funds"
          status: todo
          github: { label: quest:stripe-connect }
          depends_on: [stripe-subscriptions]

        - id: member-payments-online
          title: "Members pay their gym online"
          what: "Card payment for membership against the gym's connected account (destination charge, RED takes no cut), upgrading 'paga en tu gym'"
          status: todo
          github: { label: quest:member-payments }
          depends_on: [stripe-connect-onboarding, plan-change-seam]
          caveats:
            - "OXXO/SPEI and other local methods matter for Mexico, but per-country payment localization is LatAm Expansion's scope, not this quest"
```

---

## 🚀 Growth & Reach

Making RED fast, findable, observable, and able to scale to thousands of gym domains. A lot of the scaling/performance/reliability headroom is **earned ahead** (scale audit + Vercel verdict, `.eq(gym_id)` + indexes #92, bounded month export #94, the RPC denial harness #80/#81). The real gaps are **observability** (never built), a **caching strategy** decision (the ~200ms uncached `resolveTenant` floor is the driver), **SEO/analytics**, and the **BYO-domain onboarding queue** — the one remaining scaling-eng piece.

```yaml
- id: growth-reach
  name: Growth & Reach
  emoji: 🚀
  caveats:
    - "Observability was never built — no error tracking, RPC-failure alerts, or uptime monitoring"
    - "BYO-domain onboarding queue is the one remaining scaling-eng piece; Vercel's own docs contradict on the throughput limit (100/hr vs ~100/min) — verify"
  subgroups:

    - name: "Scale & reliability headroom (earned-ahead — shipped)"
      quests:
        - id: multitenant-scale-proof
          title: "Multi-tenant scale + domain verdict"
          what: "Audit + deep-research confirming one host→brand deploy scales to 5–10k gym domains; gym-count/geography is the axis, not member count"
          status: shipped
          evidence:
            - { type: path, ref: docs/superpowers/audits/2026-07-01-multitenant-branding-scale-audit.md }
            - { type: memory, ref: vercel-domain-scale-verdict }

        - id: tenant-scope-perf
          title: "Tenant-scope + query-perf hardening"
          what: ".eq(gym_id) on staff reads (closed a cross-tenant leak), deterministic getOperatorGym, new indexes"
          status: shipped
          github: { issues: [92] }
          caveats:
            - note: "ADR-0013 §2/§3 O(1)-RLS claim is false (per-row SubPlan); promoting the predicate rewrite is owner-pending"
              ref: { type: memory, ref: adr-0013-rls-per-row-claim-is-false }

        - id: bounded-month-export
          title: "Bounded month-scoped export"
          what: "?mes= 5-sheet workbook with a 24-month cap, replacing the unbounded export that OOM'd"
          status: shipped
          github: { issues: [94] }

        - id: rpc-denial-harness
          title: "RPC write-coverage + denial gate"
          what: "Derives writer RPCs from migration replay, fails a new uncovered writer; scratch-project test:denial gate proven green"
          status: shipped
          github: { issues: [80, 81] }

    - name: "Observability & performance (not built)"
      quests:
        - id: observability
          title: "Observability & error tracking"
          what: "Error tracking, RPC-failure alerts, and uptime/latency monitoring across both apps — none exists today"
          status: todo
          github: { label: quest:observability }

        - id: caching-perf-strategy
          title: "Decide caching & performance strategy"
          what: "Pick the approach (resolveTenant memoization, ISR/edge cache, …); the ~200ms uncached resolveTenant double-query floor is the driver"
          status: needs-decision
          caveats:
            - "perf-50ms worktree in-flight — harness + live baseline done, loop not yet run"

    - name: "Discoverability"
      quests:
        - id: seo-discoverability
          title: "SEO for per-gym public sites"
          what: "Sitemaps, metadata, and structured data so each gym's public pages are findable"
          status: todo
          github: { label: quest:seo }

        - id: analytics-tracking
          title: "Analytics & conversion tracking"
          what: "Traffic and signup-conversion instrumentation on the public/marketing surfaces"
          status: todo
          github: { label: quest:analytics }

    - name: "Domain scaling"
      quests:
        - id: byo-domain-queue
          title: "BYO-domain onboarding queue"
          what: "Rate-limited queue for attaching gyms' own custom domains at scale — the one remaining scaling-eng piece"
          status: todo
          github: { label: quest:byo-domain }
          depends_on: [multitenant-scale-proof]
```

---

## Cross-world edges (to reconcile at assembly)

Edges pointing into worlds owned by the parallel agent (Go-To-Market · Customer & Support · LatAm Expansion) — their quest ids don't exist yet, so they're listed here in prose for the assembler to wire, not invented as `depends_on` targets:

- **`platform-commercial-site` → Go-To-Market.** The site's positioning, brand copy, and marketing content are GTM collateral (T1 already routes RED/Forge brand identity to World 5). The *functional* signup site is here; the *message* is GTM's — wire a `depends_on` once GTM defines its positioning/copy quest.
- **`member-payments-online` → LatAm Expansion.** OXXO/SPEI and other per-country local payment methods live in LatAm Expansion. The Connect card path is here; the localized method matrix is theirs.
- **`billing-dunning` → shipped mail infra (GTM/Customer & Support).** Branded dunning mail rides the already-shipped Send Email Hook (#75, per-gym From/host links). That capability is earned; the edge is into a shipped node, so it's a soft reference, not a blocker.
- **`observability` ↔ Customer & Support.** The per-gym **support-contact channel** (a World-6 open thread per T1) is adjacent but distinct — observability is internal telemetry, the support channel is member-facing. Keep them in separate worlds; note the theming overlap.
- **`gym-self-serve-onboarding` → Customer & Support.** Self-serve gym onboarding will want in-product help/support hooks (World 6). Soft edge.

**Within my three worlds (already wired as `depends_on`):** `member-claim-rail`→`member-self-registration`; the whole gym-onboarding chain off `gym-onboarding-model`; the Monetization ladder (`plan-change-seam`/`stripe-go-gate`→`payment-strategy`, `stripe-subscriptions`→pricing+go-gate, `billing-dunning`→subs, `stripe-connect-onboarding`→subs, `member-payments-online`→connect+seam); `byo-domain-queue`→`multitenant-scale-proof`. One **soft, deliberately-unwired** edge: `gym-self-serve-onboarding` can consume `byo-domain-queue` when a gym brings its own domain — left un-blocking because a gym can onboard on a `*.ibookit.lat` subdomain first.

**Open issues that do *not* belong to these three worlds (left unbound → Foundation):** **#88** (Forge branding HITL exit walk — a Foundation gate), **#89** (attendance-ledger two-same-day-class ruling — a Foundation product `needs-decision`), **#104** (recibo PNG attachment nulls under the real Next runtime — a Foundation recibo bug). None is a Sellable-Product / Monetization / Growth milestone; they belong to Foundation's launch-hardening remainder and should be bound there, not here. Flagged so the assembler doesn't leave them in the unmapped-issues inbox by accident.

---

## Research notes (Stripe, light — used to *name & sequence*, not to decide strategy)

- **Account model:** Stripe shipped **Accounts v2** (Dec 2025); new platforms in 2026 build on it — a connected account is composed from **Merchant / Customer / Recipient** roles rather than the legacy fixed Standard/Express/Custom types. BYO-Stripe (gym owns the account) maps cleanly onto this. → named `stripe-connect-onboarding` around Accounts v2 + **Account Links** KYC.
- **Onboarding & payouts:** Account-Links onboarding is 10–15 min, dynamically KYC-gated per country/business type; Connect pays out to 100+ countries with per-charge + payout fees. **Deferred onboarding** lets a gym start before full verification — a useful sequencing lever, not a strategy call.
- **Billing/dunning:** the load-bearing pieces are the **invoice.payment_failed / payment_succeeded** webhooks, **Smart Retries**, and a written **subscription-status → app-behaviour** map (`past_due` = warn, `unpaid`/`canceled` = downgrade). → `billing-dunning` names exactly these; branded dunning mail (not Stripe's generic template) reuses the shipped Send Email Hook.
- Sources: Stripe Connect docs (`docs.stripe.com/connect`, `/connect/accounts`, `/connect/how-connect-works`); Stripe Billing webhooks + Smart Retries (`docs.stripe.com/billing/subscriptions/webhooks`, `/billing/revenue-recovery/smart-retries`).
