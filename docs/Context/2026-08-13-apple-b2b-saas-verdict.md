# Charging gyms through Apple: the admin-app-only model

Research run 2026-08-13 #2 (deep-research: 7 Sonnet workers + Opus synthesis + independent Opus
verifier, verdict `corrected` — 8 claim issues found and applied). Companion to
`2026-08-13-apple-app-store-playbook.md`, which it **corrects on one point** (§0).

Markers as before: **[V]** verified primary source · **[~]** inference from verified text ·
**[?]** unverified. All Apple URLs fetched **2026-08-13**.

---

## The verdict

**IAP is permitted. Do not use it.**

Guideline **3.1.2(a)** names *"software as a service ("SAAS")"* as an appropriate auto-renewable
subscription **[V]**, and three real vendors sell B2B SaaS as live IAP today — Xero, QuickBooks,
Booksy Biz **[V]**. So no rule blocks it.

But **the vertical precedent runs 7-to-1 against**, and three separate structural walls make IAP
actively worse for iBookit than for a generic SaaS: an Apple subscription binds to one **personal
Apple ID** with no transfer path **[?]**, Apple's own help pages describe **no way to invoice a
business entity** **[V, absence]**, and **no Apple-published Mexico CFDI process was found** — which
puts a deduction problem in front of every gym owner you sell to.

**The route the category actually uses has an explicit clause written for it:**

> **3.1.3(f) Free Stand-alone Apps** — *"Free apps acting as a stand-alone companion to a paid web
> based tool (i.e. VoIP, Cloud Storage, Email Services, Web Hosting) do not need to use in-app
> purchase."* **[V]**

Free admin app. Gyms sign up and pay on ibooki.lat. App is login-only. That is exactly the
resolution Apple accepted from WordPress in 2020 **[V]**.

---

## §0 — Correction to the 08-13 playbook

**Guideline 3.1.3(c) "Enterprise Services" exists.** The playbook reported 3.1.3 as (a), (b), (d),
(e) — a fetch/scrape miss. **The real sequence runs (a) through (g), seven subsections.** Two of the
three missing ones are directly load-bearing here:

> **3.1.3(c) Enterprise Services** — *"If your app is only sold directly by you to organizations or
> groups for their employees or students (for example professional databases and classroom
> management tools), you may allow enterprise users to access previously-purchased content or
> subscriptions. Consumer, single user, or family sales must use in-app purchase."* **[V]**
> (corroborated in forums 666450, 773357)

> **3.1.3(f) Free Stand-alone Apps** — quoted above **[V]**

> **3.1.3(g) Advertising Management Apps** — exists, not relevant.

The playbook's other 3.1 findings stand. Its note that "3.1.5(a) didn't surface" is now explained:
the fetch was truncating.

---

## §1 — What the rules say about a paid admin app

**3.1.1 is the default landing spot [V]:**
> *"If you want to unlock features or functionality within your app, (by way of example:
> subscriptions, in-game currencies, game levels, access to premium content, or unlocking a full
> version), you must use in-app purchase. Apps may not use their own mechanisms to unlock content or
> functionality, such as license keys…"*

An admin app whose whole point is unlocked by a paid subscription lands here **by default**. This is
why the prior run's 3.1.3(e) exemption does **not** transfer — that clause is about services consumed
outside the app; the admin app's value is consumed *inside* it.

**Three clauses pull it back out:**

| Clause | Text | Fit |
|---|---|---|
| **3.1.2(a)** | SaaS is an *"appropriate"* subscription **[V]** | IAP is **allowed**, not forbidden |
| **3.1.3(c)** Enterprise | *"only sold directly by you to organizations… may allow enterprise users to access previously-purchased content or subscriptions"* **[V]** | **Ambiguous — see below** |
| **3.1.3(f)** Free Stand-alone | *"Free apps acting as a stand-alone companion to a paid web based tool… do not need to use in-app purchase"* **[V]** | **Clean fit** |

**The single most consequential open question [?]:** 3.1.3(c) says enterprise users may *"access
previously-purchased content or subscriptions."* That wording maps to **content access**, not to an
admin app that **is** the product. Whether a reviewer reads (c) as covering iBookit is genuinely
ambiguous and **the guideline text does not answer it**. Don't build the plan on (c).

**Don't rely on 3.1.3(b) Multiplatform either** — it permits accessing things bought elsewhere
*"provided those items are also available as in-app purchases within the app"* **[V]**. The proviso
forces IAP parity. It's a trap, not an escape hatch.

**Anti-steering is unchanged and still applies to a business app.** The rules are written
**per-storefront (US vs. all others), never per-customer-type** — no clause in Section 3 uses
"business" or "B2B" as a category **[~]**. Mexico sits in "all other storefronts" by inference from
the US-only carve-out **[~]** — no Mexico-specific rule was found either way. So the admin app may
not contain buttons, links, or CTAs toward paying on the web.

> **Not resolved at the granularity you'll need [?]:** whether "contact us", a plain marketing-site
> link, or a *displayed price* crosses that line. The WordPress precedent (§5) is the best guide —
> removing the **display** of the external paid option was sufficient.

---

## §2 — What the category actually does

This is the strongest evidence in the report: an App Store listing either shows an In-App Purchases
block or it doesn't.

### Vertical — gym / salon / studio management **[V]**

| App | Price | IAP? |
|---|---|---|
| Mindbody Business (`id599125654`) | Free | **No** — *"requires existing Mindbody credentials"*, paid account managed on Mindbody's platform |
| Glofox Pro – Staff (`id1464934622`) | Free | **No** |
| PushPress Staff (`id1596422233`) | Free | **No** |
| Zen Planner Staff (`id1122645605`) | Free | **No** — *"your business must use Zen Planner, and you must login with your valid staff credentials"* |
| Vagaro Pro (`id346778559`) | Free | **No** |
| Fresha for business (`id1455346253`) | Free | **No** |
| Zenoti Mobile (`id1104329960`) | Free | **No** — *"only available for businesses that use Zenoti's enterprise platform"* |
| **Booksy Biz** (`id725335996`) | Free **+ IAP** | **Yes** — ten staff-seat tiers, "Owner + 4 staffers v3: $109.99" … "Owner + 14 staffers v3: $329.99" |

**Verified score: 7 free/no-IAP to 1 IAP.** Three more targets couldn't be pinned and are counted on
neither side **[?]**: Wodify Core (listing 404'd), WodBoard's true business/POS app (`id1599113778`,
never fetched — the one fetched was member-facing), TeamUp (no business/staff iOS app found in two
passes).

### Horizontal B2B SaaS **[V]**

**Free, no IAP:** Slack (`id618783545` — Pro/Business+/Enterprise referenced in copy, sold on web) ·
Square POS (`id335393788`) · Shopify (`id371294472`) · Shopify POS (`id686830644`) · Toast Now
(`id6444586410` — *"only available for Toast customers"*) · Salesforce (`id404249815`).

**Free with a live IAP block selling tiers:** **Xero** (`id441880705`) and **QuickBooks**
(`id584606479`). QuickBooks is independently corroborated by Apple Community + Intuit support threads
about users billed via Apple **having to formally transfer billing to Intuit** **[V]** — which is
itself a warning about what IAP billing does to a SaaS relationship.

> **[?]** The exact per-tier price lists for Xero and QuickBooks were extracted by a summarizing
> sub-model and contain apparent duplicate labels (probably regional SKUs). The *presence* of the IAP
> block is high-confidence; **don't quote the prices**.

### Reading the contradiction honestly

Booksy Biz, Xero and QuickBooks prove B2B-SaaS-via-IAP **is accepted by Apple in practice**. The
other **13 verified listings across 12 vendors** prove it is **not what the category does**. Both are
true. The read: the route is *legal* but *unpopular*, and **every vendor large enough to negotiate
has chosen web billing.**

---

## §3 — If you used IAP anyway: the walls

**1. Identity binding — the structural one.** A subscription is bought by and bound to **one
individual Apple ID**. Apple Community consensus is that subscriptions **cannot be transferred**
between Apple IDs — cancel and resubscribe is the only path **[?]** (forum consensus, **no Apple
primary doc found**). Family Sharing is a *household* mechanism (5 members, billed to the organizer)
**[V]**, not a business one. **No Apple documentation was found describing any way for a company
entity to be the contracting or invoiced party** **[V, absence]**.

→ **When the gym owner leaves, the gym's subscription leaves with their personal Apple ID.** For a
product sold to small businesses with staff turnover, that's not an edge case.

**2. One owner, two gyms.** *"Since people can only buy one subscription within a group at a time…"*
**[V]**. One Apple ID can't hold the same product twice. The workaround is distinct SKUs/groups per
tenant, which doesn't scale to self-serve multi-tenant. Exact UX untested **[?]**.

**3. No business invoicing.** Apple's App Store Connect help on invoices describes only
*developer-side* documents — tax-on-commission invoices, self-billed invoices for **Australia and
Ireland only**, US 1099-K. **No mechanism to issue a business invoice to the end customer with that
customer's tax ID** **[V]**. Buyer-side, the receipt goes to the Apple ID and the invoiced-to field
can't be changed later **[?]**.

**4. No per-seat, no metered pricing.** Up to 800 price points per currency **[V]**, but the only
variable tools are introductory offers, promotional offers and offer codes. **There is no
metered/usage and no per-seat primitive** — subscription "levels" are a feature-tier ranking, not a
seat count. Seat pricing must be built outside StoreKit and mapped onto discrete SKUs, which is
visibly what Booksy's ten "Owner + N staffers" products are doing.

**Price decreases apply automatically to all existing subscribers at renewal with no way to
grandfather the higher price** **[V]**. Increases can grandfather.

**5. Proration is automatic and not configurable [V]:** upgrade = immediate + Apple-computed prorated
refund; downgrade = next renewal; crossgrade = immediate only if same duration and pay-up-front.

**6. No refund veto.** Apple decides. The documented developer lever is a 12-hour window to submit
consumption info on a `CONSUMPTION_REQUEST` notification **[?]** — **and that flow is documented for
*consumable* purchases; whether it applies to an auto-renewable B2B subscription was not
established.** What no source disputes: **the developer cannot refuse a refund.**

**7. Commission.** *"During a subscriber's first year of service, you receive 70% of the subscription
price at each billing cycle, minus applicable taxes"*, rising to **85% after one year** of
accumulated paid service in the same group; upgrades/downgrades don't reset the clock; free trials
don't count **[V]**. Small Business Program grants 85% from day one under $1M **[V]** (enrollment
mechanics **[?]**).

→ At iBookit's scale the cut is almost certainly **15%, not 30%**. But on a business whose *only*
revenue is this subscription, 15% off the top **plus** no invoicing, no refund control and no pricing
flexibility is a bad trade.

> **[?] Schedule 2 — the contract that actually governs commission and refunds — was never fetched.**
> Everything above rests on Apple's marketing-style pages, a WWDC video and forums.

---

## §4 — Mexico tax: probably the killer, honestly hedged

**Deduction of a foreign receipt is legally possible.** RMF regla **2.7.1.14** allows deducting on a
comprobante from a foreign resident without permanent establishment, provided it carries five
elements **[?]** (read via two agreeing firm summaries — **the DOF primary text was never read**):

1. Name/denominación, domicilio, and where applicable **foreign tax ID number**
2. Place and date of issue
3. **Clave en el RFC of the person in whose favour it is issued**, plus their name
4. Quantity, unit, class of goods or description of service
5. **Taxes withheld and transferred, broken out by rate**

Backed by LISR Art. 27 (strictly indispensable, backed by comprobante, in accounting, obtained by
filing date) **[?]** and CFF Art. 29-A **[?]**.

**Whether Apple delivers that is unresolved — leaning no, but not established.** Direct fetch of
`support.apple.com/es-lamr/billing` returned **no mention of CFDI, RFC, or any Mexico-specific tax
documentation** **[V]**. But that is **the only Apple page checked directly**, and the verifier
struck a flat "Apple publishes no Mexico CFDI process" as unsupported. Three loose threads:

- A claim that you can attach an RFC via Settings → [name] → Payment & Shipping → fiscal
  identification number — **search snippet only**; the sibling page actually fetched had nothing of
  the kind **[?]**.
- Spanish-language Apple Community threads report Mexican users failing to get a `.pdf`/`.xml` CFDI,
  with Apple support staff unfamiliar with what a CFDI is **[?]** — **no thread was opened**, and the
  sample skews to complaints.
- **Counter-evidence in the same source set [?]:** one thread reports *"Apple Operations Mexico can
  create CFDIs and send emails with download links; for them to issue invoices, purchases must be
  made through the digital store, the developer portal, or through App Store or the physical store."*
  **This cuts against a flat "Apple can't issue a CFDI" and nobody followed it up.**

**IVA [?]:** LIVA Art. 18-D reportedly obliges foreign digital platforms to charge 16% IVA and, on
request, issue a **non-CFDI** receipt with IVA stated *"expressly and separately"* — and explicitly
does **not** require them to issue a CFDI. Primary text never read.

**The contrast — and the catch.** A gym buying direct from iBookit via Stripe/SPEI, with iBookit
issuing its own CFDI, gets a document its accountant processes with zero ambiguity. **But iBookit
cannot do that today**: an unregistered persona física with no PFAE, no e.firma and no CSD cannot
issue any CFDI. **That registration is a precondition of the recommended route, not a benefit already
in hand.**

**Net, at the confidence the evidence supports:** the App Store path puts every Mexican gym's
accountant in the position of chasing a document for which no Apple-published process could be found,
on a recurring monthly charge, from a buyer who deducts everything. That's a sales objection on every
deal — **unless** the Apple Operations Mexico CFDI route is real and self-serve, which nobody checked.

---

## §5 — The recommended route, and why Apple accepts it

### Free login-only admin app

**Textual home:** 3.1.3(f), quoted at the top. **The same category Apple used to clear WordPress.**

**The two cases that define Apple's actual trigger [V]:**

- **WordPress, Aug 2020** — Apple froze updates to the free WordPress app demanding IAP for
  WordPress.com plans sold **on the web**, though the app sold nothing — because the app **displayed
  and linked to** those paid plans. Apple reversed within ~24 hours once the app stopped surfacing
  the purchase option: *"since the developer removed the display of their service payment options
  from the app, it is now a free stand-alone app and does not have to offer in-app purchases."*
- **Hey / Basecamp, Jun 2020** — the cautionary twin. Apple rejected an update because the free iOS
  app required a paid Hey.com account, purchasable only on the web, to be usable at all. Resolved
  when Basecamp added a **free tier usable inside the app**.

**The load-bearing lesson: Apple reaches into external monetization only when the submitted app
surfaces the purchase flow.** WordPress changed *what the app showed*, not the web business.

**Why iBookit is closer to WordPress than to Hey:** Hey was a *consumer* email client and the fix
Apple accepted was a free consumer tier. The vertical precedent set in §2 shows **business-only,
credential-gated staff apps living on the store unmolested** — Mindbody, Zen Planner, Zenoti and
Toast Now all ship as explicitly customer-only.

**Guideline 2.1(a), verbatim [V]:** submissions must *"include demo account info (and turn on your
back-end service!) if your app includes a login. If you are unable to provide a demo account due to
legal or security obligations, you may include a built-in demo mode in lieu of a demo account with
prior approval by Apple."* → **iBookit needs a standing seeded demo-gym account with realistic staff
and schedule data, kept live through review.** (Demo-field details are **[?]** — Apple's help page
404'd.)

**Guideline 4.2 [V]:** *"Your app should include features, content, and UI that elevate it beyond a
repackaged website…"* · 4.2.2 on web clippings · and a new one the playbook didn't have:

> **4.2.7(e)** — *"Thin clients for cloud-based apps are not appropriate for the App Store."* **[V]**

**There is no subsection anywhere in 4.2 that names "login screen" or bans login-wall apps** —
verified by full re-read **[V]**. Forum rejections under 4.2 that surfaced were driven by
Cordova/webview apps with no native UI, **not by login-gating per se** **[V, forums 121570]**.

**But note what 4.2.7(e) means for the Capacitor plan:** an admin app that is a WKWebView over
ibooki.lat is *precisely* a thin client for a cloud-based app. **The playbook's §7 native build list
is not optional here — it's the difference between 4.2.7(e) and a real app.**

> **[?] Loose thread worth closing before submission:** Guideline **5.1.1** surfaced as possibly
> relevant to login-gating (*"cannot require user registration prior to allowing access to app
> content… not associated specifically to the user"*) but was outside every agent's scope and is
> **unverified verbatim**.

### Apple Business Manager / Custom Apps — doesn't fit

*"A custom app is an app you've created for a **specific organization**"*, with the developer
specifying *"one or more organizations that can see and download the app"* **[V]**. That's a
**named-recipient model**, structurally incompatible with self-serve multi-tenant SaaS.

The blocker is upstream anyway: *"Companies and educational institutions must provide a D-U-N-S
Number registered to their legal entity… your business must be recognized as a legal entity"* **[V]**.
Third-party guides say Custom Apps requires an **Organization** account **[?]** — if that holds, it's
closed to an unregistered persona física. **No pricing found; Mexico availability never established.**

---

## §6 — Does the member web app expose the admin iOS app?

**No, on the evidence available — but there is no on-point precedent, and that's the honest answer.**

Apple's Schedule 2 obligations attach to content/services sold **via the In-App Purchase API inside a
Licensed Application distributed on the App Store**; no clause was found reaching transactions in a
separate, never-submitted web property **[?]** — the PDF was read via search summary, **never fetched
line-by-line**.

The structural argument is strong: the booking app isn't on the App Store, and the money is the
**gym's own Stripe**, with iBookit not the merchant of record and taking no cut.

**What's missing, and it's the crux [?]:** **no case was found where the external paid service
belonged to the developer's *customer* rather than the developer.** Hey and WordPress both involved
the *same company's own* paid product being surfaced in its own app. A genuinely third-party
merchant-of-record scenario is unprecedented in the material found. This is reasoning by analogy.

**Displaying/managing gym-collected payments in the admin app.** The nearest allowance is 3.1.3(a)'s
*"account management functionality for existing customers"* **[V]**. Nothing found suggests a revenue
dashboard, marking a member paid, or refunding against the gym's own Stripe triggers IAP — **but
unverified either way**.

> **Verifier caught the draft here:** an earlier version cited "3.1.1's physical-goods and
> person-to-person carve-outs." The verbatim 3.1.1 capture contains **no** physical-goods sentence,
> and person-to-person is **3.1.3(d)**, not 3.1.1. Both were downgraded.

**Does Apple assess a whole business?** Epic v. Apple concerns **apps that are on the store linking
out for the same service they provide**. **Nothing found addresses two separate products, one
submitted and one not** **[?]**.

**One load-bearing thing nobody checked [?]: whether Stripe Connect's framing actually makes the gym
the merchant of record.** That's the foundation of the whole no-claim argument and it was explicitly
out of every agent's scope. **Confirm it in Stripe's own docs before relying on it.**

---

## §7 — What this means for the plan

1. **Free admin app. Billing on ibooki.lat. No IAP.** 3.1.3(f) is written for exactly this, and 13 of
   16 verified comparable listings do it.
2. **Strip every payment CTA from the admin app** — no upgrade button, no plan link, no pricing
   display. That is literally the WordPress fix, and anti-steering applies to business apps the same
   as consumer ones on the Mexico storefront.
3. **Seed a permanent demo gym** with realistic staff, schedule and member data. 2.1(a) is explicit
   and the app is 100% login-gated.
4. **The Capacitor thin-client problem got worse, not better.** 4.2.7(e) names thin clients for
   cloud-based apps as inappropriate. The playbook's native build list is now load-bearing.
5. **Registration is on the critical path after all.** Not for Apple — for CFDI. You cannot invoice a
   gym without RFC + PFAE + e.firma + CSD, and gyms will ask.
6. **Member payments via the gym's Stripe are almost certainly clean** — but confirm the Stripe
   Connect merchant-of-record framing, since it carries the whole argument.
7. **Revisit IAP only if** the CFDI question resolves in Apple's favour *and* you're willing to lose
   refund control, per-seat pricing and subscription portability. On current evidence, no.

---

## §8 — What would change this answer, ranked

1. **A confirmed Apple CFDI process for Mexico.** Three cheap checks, none done: read the DOF text of
   regla 2.7.1.14 and LIVA 18-D; confirm whether Apple Distribution International / Apple Operations
   Mexico is registered under the 18-D digital-platforms regime with a Mexican RFC; **and actually
   open the Apple Community thread claiming Apple Operations Mexico does create CFDIs on request.**
   That third one is the single cheapest check in this report.
2. **How Xero and QuickBooks handle Mexican business buyers.** They're the existence proof that IAP
   B2B SaaS works. Whether *their* Mexican customers can deduct an Apple-billed subscription is the
   most decisive unexamined data point here.
3. **Whether a recurring subscription receipt differs from a one-time purchase receipt** in what
   buyer/tax data it carries. Never checked, and the gym subscription is recurring.
4. **A forum thread or rejection matching iBookit's exact pattern** — admin app, zero content without
   a paid business account — under 4.2.2 or 5.1.1. None was found. If one exists, the recommended
   route needs a free tier or demo mode designed in from the start (the Hey fix).
5. **Guideline 5.1.1 verbatim.**
6. **Whether Stripe Connect makes the gym merchant of record.**
7. **Schedule 2's actual text** on commission, refunds, and the scope of Apple's claim. The contract
   governs, not the marketing page, and it was never read.
8. **A Mexico-storefront steering rule in either direction** — Mexico's bucket is inference from the
   US-only carve-out.
9. **Whether Custom Apps requires an Organization account, and whether it's available in Mexico.**
10. **The guidelines' last-updated date** — the page displays none, so the currency of every quoted
    clause is technically unconfirmed.
