# T4 — Business worlds: Go-To-Market · Customer & Support · LatAm Expansion

> **Wayfinder asset** · resolves [T4 · Decompose the business pillars into quests](https://github.com/Vack99/RED-2.0/issues/109) (#109) on map [#105](https://github.com/Vack99/RED-2.0/issues/105) · 2026-07-14
>
> **What this is:** the quest enumeration for the three **business** worlds of the scope model — 📣 Go-To-Market, 🎧 Customer & Support, 🌎 LatAm Expansion. Authored against the [T2 scope-model schema](https://github.com/Vack99/RED-2.0/blob/main/docs/superpowers/wayfinder/2026-07-14-T2-scope-model-schema.md) (field names, status enum, github-binding conventions) and the [T1 Foundation catalogue](https://github.com/Vack99/RED-2.0/blob/main/docs/superpowers/wayfinder/2026-07-14-T1-foundation-catalogue.md) (the ahead-world bleed table).
>
> **Capture, don't resolve.** These are the worlds where owner strategy lives. I enumerate the *standard structure* of each world (what any such business must eventually have) and mark the owner's open calls as `status: needs-decision` — a needs-decision quest's *deliverable is the decision itself*. I never invent positioning, ad channels/budget, country launch order, support-tooling choice, or whether/how to build the Meta-agent. T1's bleed items are marked **earned** (`shipped`) under their world, not re-filed as todo.

---

## 📣 World 5 — Go-To-Market (`go-to-market`)

How RED-the-platform presents and sells itself to prospect gyms. The **brand identity is largely earned** — RED's neon-ring visual system, Forge's F-mark/tagline, and the re-skinnable receipt all shipped inside Foundation (ahead-world bleed). What is *not* earned is everything above the visuals: positioning/messaging, which ad channels to run, how a prospect experiences the product, and whether RED-the-company gets its own public site. Those are owner strategy calls, captured here as `needs-decision`, with the content-production and sales/site work structurally gated behind the positioning decision.

```yaml
  - id: go-to-market
    name: Go-To-Market
    emoji: 📣
    subgroups:

      - name: "Brand identity (earned)"
        quests:
          - id: red-brand-identity
            title: "RED brand identity — neon-ring mark, exact-hex tokens, motion, copy"
            what: "RED's visual/brand system shipped in the Phase-6 remediation: neon-ring logo, exact-mock token contract, ~12 animations, marketing copy"
            status: shipped   # earned-ahead — GTM collateral shipped under Foundation Phase 6
            evidence:
              - { type: commit, ref: 9693a21, note: "Phase-6 design remediation — dark activation, exact-mock tokens, neon-ring logo, animations, marketing copy" }
              - { type: issue, ref: 51, note: "comercial landing + hero/tagline" }
              - { type: memory, ref: phase6-client-execution-progress }

          - id: forge-brand-identity
            title: "Forge brand identity — F-mark ignition, tagline, program seed"
            what: "Forge's visual identity and real program/marketing copy seeded live"
            # earned-ahead — github all-closed derives shipped; positional under an ahead world
            github: { issues: [85, 86] }
            evidence:
              - { type: path, ref: supabase/migrations/20260710140000_forge_program_seed.sql, note: "real Forge program + marketing copy seed" }

          - id: recibo-brand-skin
            title: "Receipt as brand collateral — de-Forge identity + RED re-skin"
            what: "Sale receipt re-skinned per brand (RED Vino #7e0d10, Forge invariant) — customer-facing brand artifact"
            # earned-ahead — github all-closed derives shipped
            github: { issues: [97, 103] }
            evidence:
              - { type: commit, ref: dcfd9b3, note: "--recibo-* custom properties + [data-brand=red] cascade" }

      - name: "Positioning & content (owner strategy)"
        quests:
          - id: positioning-messaging
            title: "Decide RED's positioning, value proposition & selling points"
            what: "How RED-the-platform is positioned to prospect gyms — the value prop, differentiators, and messaging. Owner strategy call; the deliverable IS the decision."
            status: needs-decision

          - id: ad-channels-strategy
            title: "Decide ad channels, ad strategy & budget"
            what: "Which channels to advertise on, the creative/targeting strategy, and spend. Pure owner strategy — not invented here."
            status: needs-decision
            depends_on: [positioning-messaging]

          - id: marketing-content-production
            title: "Marketing content production (SEO-adjacent, social, collateral)"
            what: "The ongoing program that produces marketing/SEO-adjacent content once positioning is set. New content efforts tag into this quest."
            status: todo
            github: { label: quest:marketing-content }
            depends_on: [positioning-messaging]

      - name: "Sales motion & web presence"
        quests:
          - id: sales-demo-motion
            title: "Decide the sales / demo motion for prospect gyms"
            what: "How a prospect gym experiences the product before buying (self-serve trial, guided demo, sales-led). Owner call on the motion; the raw material (demo gyms) already exists."
            status: needs-decision
            depends_on: [positioning-messaging]
            caveats:
              - "Demo-gym infrastructure already exists (forge-demo, red-demo live) as raw material — the *motion* that puts a prospect in front of it is the undecided part."
              - note: "per-brand demo twins are the current dev/sandbox model"
                ref: { type: memory, ref: demo-gym-testing-model }

          - id: public-site-red-platform
            title: "Decide & build RED-the-company's public site / SEO presence"
            what: "A public marketing site for RED-the-platform (the company selling the SaaS), distinct from the per-gym client marketing pages."
            status: needs-decision
            depends_on: [positioning-messaging]
            caveats:
              - "No RED-the-platform public site exists today — verified in-repo: only apps/admin + apps/client. The client app's comercial/nosotros/precios/contacto pages are PER-GYM (branded per tenant), not RED-the-company's own site. This is greenfield."
```

---

## 🎧 World 6 — Customer & Support (`customer-support`)

The channels and tooling through which members and gyms reach RED, and RED reaches them. The **inbound contact channel and outbound mail infrastructure are earned** — the contact form + intake table, the custom SMTP/Resend delivery rail, and per-gym-branded auth mail all shipped inside Foundation. What is not earned is the *support operation itself* (which tool, what SLAs/processes for a solo dev) and the owner's big **Meta-agent** idea — an AI agent managing client communications over WhatsApp/Instagram. The Meta-agent is captured faithfully as its own subgroup: one `needs-decision` quest (whether/scope) gating the build behind a quest-label, so nothing about *whether or how* to build it is invented here.

```yaml
  - id: customer-support
    name: Customer & Support
    emoji: 🎧
    subgroups:

      - name: "Contact & delivery infrastructure (earned)"
        quests:
          - id: contact-intake-channel
            title: "Contact intake channel — Contacto form + contact_message"
            what: "A working contact-intake channel: anon-intake RPC writes to contact_message; the client-facing way to reach a gym"
            # earned-ahead — github all-closed derives shipped
            github: { issues: [53] }

          - id: outbound-mail-delivery
            title: "Outbound mail delivery infra — custom SMTP / Resend"
            what: "Outbound member-comms delivery infrastructure: custom SMTP via Resend, SPF/DKIM/DMARC passing, rate-limited"
            # earned-ahead — github all-closed derives shipped
            github: { issues: [27, 72] }

          - id: branded-auth-mail
            title: "Gym-branded transactional auth mail (Send Email Hook)"
            what: "Edge-function hook renders ALL auth mail per-gym (link on the gym host, per-gym From) — a branded transactional contact channel"
            # earned-ahead — github all-closed derives shipped
            # Placement call: T1 flags #75 as GTM-adjacent (5/6). Placed in World 6 (not 5)
            # because it is delivery/comms *infrastructure* alongside #27/#72, not outward
            # brand/marketing collateral — the comms-plumbing story stays together here.
            github: { issues: [75] }

      - name: "Support operations (owner strategy)"
        quests:
          - id: support-tooling
            title: "Decide support tooling / helpdesk"
            what: "Which support tool to run (helpdesk, shared inbox, chat widget, or none). Owner call — the choice is the deliverable. Also covers the operator→RED support-contact channel (a Phase-7 remainder)."
            status: needs-decision

          - id: support-processes-sla
            title: "Decide support processes & SLAs"
            what: "Response targets, escalation path, and who staffs support (solo dev today). Owner call on the operating model."
            status: needs-decision

      - name: "Meta-agent — WhatsApp/IG client management"
        quests:
          - id: meta-agent-decision
            title: "Decide whether & how to build the Meta-agent"
            what: "Owner's big idea: an AI agent that manages client communications over WhatsApp / Instagram DMs. Whether to build, build-vs-buy, and scope are all owner calls — captured, not resolved."
            status: needs-decision

          - id: meta-agent-build
            title: "Build the Meta-agent (WhatsApp/IG integration + automation)"
            what: "The channel integration + agent automation, gated behind the decision. New Meta-agent issues tag into this quest."
            status: todo
            github: { label: quest:meta-agent }
            depends_on: [meta-agent-decision]
```

---

## 🌎 World 7 — LatAm Expansion (`latam-expansion`)

The path from "sellable in Mexico" to the north star, "RED is sellable across Latin America." This world is **almost entirely ahead** — nothing here is earned. Its structure is a dependency spine rooted at one owner decision: **country sequencing** (which countries, in what order). Everything else structurally blocks on it — you cannot localize currency/tax/legal, pick local payment rails, or decide whether Portuguese matters until you know which markets come next. Local payment methods additionally ride on the Stripe rails owned by the Monetization world (referenced, not duplicated here). The codebase is es-MX hardcoded (`@gym/format`: `Intl.NumberFormat("es-MX")`, peso, Chihuahua tz), so any non-Spanish market forces real locale-abstraction work.

```yaml
  - id: latam-expansion
    name: LatAm Expansion
    emoji: 🌎
    caveats:
      - "Nothing in this world is earned yet — RED is Mexico-first. This is the frontier toward the destination."
    subgroups:

      - name: "Sequencing & strategy"
        quests:
          - id: country-sequencing
            title: "Decide country sequencing — which markets, in what order"
            what: "The launch order across LatAm markets. Root owner strategy call; almost every localization quest structurally blocks on it."
            status: needs-decision

          - id: first-market-entry
            title: "First non-Mexico market go-live"
            what: "The beachhead: RED actually sold and live in its first market outside Mexico — the visible expansion frontier toward the destination."
            status: todo
            github: { label: quest:latam-launch }
            depends_on: [country-sequencing, country-localization-program, local-payment-methods, i18n-language-strategy]

      - name: "Per-country localization"
        quests:
          - id: country-localization-program
            title: "Per-country localization kit — currency, tax/invoicing, legal"
            what: "The repeatable localization program per market: currency, tax & e-invoicing rules, legal/compliance, business registration. Today the stack is es-MX/peso hardcoded."
            status: todo
            github: { label: quest:localization }
            depends_on: [country-sequencing]

          - id: local-payment-methods
            title: "Decide local payment methods per market"
            what: "Per-country local rails — OXXO/SPEI in MX; PIX/Boleto (BR), PSE (CO), etc. elsewhere. Which rails per market is an owner call; it layers on the payment mechanism owned by the Monetization world (not duplicated here)."
            status: needs-decision
            depends_on: [country-sequencing]
            caveats:
              - "Rides on the Stripe/payment rails owned by the Monetization world — see cross-world edges. No Stripe quest is created here."

      - name: "Language & i18n"
        quests:
          - id: i18n-language-strategy
            title: "Decide the i18n / language strategy (es-MX → pt-BR & beyond)"
            what: "Whether/when to internationalize beyond es-MX. Brazil (pt-BR) is the real forcing function; other markets share Spanish variants. Owner call, contingent on sequencing."
            status: needs-decision
            depends_on: [country-sequencing]
            evidence:
              - { type: path, ref: packages/format/src/format.ts, note: "es-MX hardcoded — Intl.NumberFormat('es-MX'), peso, Chihuahua tz; no locale abstraction" }

          - id: locale-abstraction
            title: "Build locale/currency/tz abstraction in @gym/format"
            what: "De-hardcode es-MX: extract locale, currency, and timezone from @gym/format so a new market's formatting is data, not code. Gated on the language decision."
            status: todo
            github: { label: quest:i18n }
            depends_on: [i18n-language-strategy]
```

---

## Cross-world edges (to reconcile at assembly)

Edges from these three worlds that point **into worlds owned by the parallel agent** (2 · Sellable Product, 3 · Monetization, 4 · Growth & Reach). Their quest ids are not invented here — the assembler wires these once all worlds share one file:

- **`local-payment-methods` → Monetization (Stripe rails).** Local rails (OXXO/SPEI, PIX/Boleto, PSE) layer on top of the payment *mechanism* (Stripe subscriptions / Stripe Connect) owned by World 3. `local-payment-methods` structurally depends on that mechanism existing. No Stripe quest is created here by design.
- **`country-localization-program` → Monetization (billing/invoicing).** Per-country tax & e-invoicing touch the money path and any subscription-billing surface World 3 builds; reconcile the currency/invoicing seam.
- **`public-site-red-platform` / `marketing-content-production` → Growth & Reach (SEO/reach).** RED-the-company's public site and SEO-adjacent content are also a reach lever; if World 4 owns "reach/SEO," these share a seam.
- **`support-processes-sla` / `support-tooling` → Growth & Reach (observability).** T1 flags error-tracking/observability/RPC-failure alerts as World-4 scope; a support operation consumes those alerts (an incident feeds a support response). Soft edge — reconcile whether alerting lives in 4 and support reacts in 6.
- **`sales-demo-motion` → Sellable Product (demo gyms).** The demo motion sits on top of the already-shipped demo-gym twins (forge-demo/red-demo); those live under Foundation/World 2. Referenced as existing raw material, not a hard build edge.

---

## Assumptions & flags for the owner

- **RED-the-platform has no public site — confirmed in-repo, not assumed.** Only `apps/admin` and `apps/client` exist. The client app's `comercial`/`nosotros`/`precios`/`contacto` pages are **per-gym** (branded per tenant via the host→brand seam), i.e. each gym's own marketing site — *not* RED-the-company's site. `public-site-red-platform` is therefore genuinely greenfield.
- **es-MX is hardcoded — confirmed in-repo.** `packages/format/src/format.ts` uses `Intl.NumberFormat("es-MX")`, a literal `"$"` peso prefix (no currency code), and Chihuahua timezone throughout. There is no locale/currency abstraction, so `locale-abstraction` is real engineering work, not a config flip. Portuguese (Brazil) is the sharpest forcing function.
- **Send Email Hook (#75) placement — a judgment call.** T1 flags it as GTM-adjacent (World 5 *or* 6). I placed it in **World 6** (Customer & Support) beside the #27/#72 delivery infra, because it is transactional-mail *plumbing*, not outward brand/marketing collateral. Double-check this matches the owner's mental model; if #75 reads as "brand touchpoint" it could move to World 5.
- **Meta-agent captured faithfully, not scoped.** The WhatsApp/IG client-management agent is modeled as a `needs-decision` quest gating a labeled build quest. I invented nothing about whether, how, or when to build it — the decision quest *is* the placeholder for the owner's future call.
- **Every "strategy" call is a `needs-decision` quest, by design.** Positioning, ad channels/budget, sales/demo motion, whether to build a RED public site, support-tooling choice, support SLAs, country sequencing, per-market payment rails, and the i18n language strategy are all owner decisions — captured as quests whose deliverable is the decision, never pre-answered.
- **The demo-gym infrastructure (forge-demo, red-demo)** already exists and is noted as raw material for the sales/demo motion — but the motion that uses it is undecided.
- **`first-market-entry`** is added as the visible "expansion frontier" node (the first non-MX go-live). It renders `blocked` until sequencing, localization, payments, and i18n resolve — an intentional strategic milestone, not busywork. Flag if the map should stay purely enabling and drop the outcome node.
