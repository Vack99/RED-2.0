# iBookit → Apple App Store: the whole path, from no account to live

Research run 2026-08-13 (deep-research: 6 Sonnet workers + Opus synthesis + independent Opus
verifier, verdict `corrected` — 8 claim issues found and applied here). Apple-only scope.
Supersedes the Apple half of `2026-08-12-app-store-launch-plan.md`; see §0 for what changed.

**Marker convention** — every claim carries one:
- **[V]** verified against a primary source, quoted, with a fetch date
- **[~]** inference *from* verified text (the reasoning is ours, the text is Apple's)
- **[?]** unverified — community, forum, aggregator, or a source that couldn't be re-fetched

Unless stated otherwise, every Apple URL below was fetched **2026-08-13**.

---

## The verdict, in four lines

1. **Ship free. Take money outside the app.** Apple's text doesn't merely *allow* this for a gym —
   3.1.3(e) says you **must** use non-IAP for services consumed outside the app **[V]**.
2. **The cost of that is anti-steering, and the 08-12 plan missed it entirely.** On the **Mexico
   storefront** the app may not contain buttons, links, or any call to action pointing at outside
   payment **[V]**. Charging outside Apple and *advertising it in-app* are two different rules.
3. **Charging through Apple instead buys you exactly one thing** — the right to put a buy button in
   the app — and costs 30%/15%, a Paid Apps Agreement, W-8BEN, RFC+CURP+Cédula, a bank account,
   and ~12–20 engineer-days. It is not the shortcut the premise assumed.
4. **The thing that will actually stop you is Guideline 4.2**, and the closest real case found
   (Jan 2026, a Capacitor **booking** app) was rejected twice **[V]**.

---

## §0 — What this corrects in the 2026-08-12 plan

| # | 08-12 said | Now | Why it matters |
|---|---|---|---|
| 1 | *(silent — anti-steering never mentioned)* | **Mexico storefront: no in-app buttons/links/CTAs to outside payment [V]** | Changes the client app's UI. The biggest miss in the old doc. |
| 2 | "Settle one-app-with-tenant-picker vs one-app-per-gym" — listed as an open decision | **Settled: one app.** 4.2.6's own "picker model" example blesses it; one-app-per-gym under our account triggers 4.2.6 *and* 4.3(a), with forum precedent **[V]** | An open decision is now closed on Apple's own text. |
| 3 | *(silent)* | **5.1.1(v): in-app account deletion is mandatory [V]** — unconditional rejection trigger | One RPC + one screen, or automatic rejection. Nothing else on this page is as cheap to fix or as certain to bite. |
| 4 | *(silent)* | **Seller name = your personal legal name [~]**. Apple refuses DBAs/trade names | The listing reads *Aaron Talavera*, not *iBookit* — three days after the name was locked. |
| 5 | *(silent)* | **Guideline 2.1 demo account** — reviewers need a reusable login; iBookit's activation is magic-link/passwordless **[~]** | A pre-submission build item that doesn't exist yet. |
| 6 | "Whether **3.3.1** tolerates a shell whose entire content is remote. Unexamined." | **Answered: not a problem.** DPLA 3.3.1(B): *"scripts and code downloaded and run by Apple's built-in WebKit framework or JavaScriptCore are permitted"* **[V]**. The live wire is condition (a), *primary purpose* | Removes one of the old doc's six open questions outright. |
| 7 | "Web Push reportedly does not work inside a WKWebView wrapper **[?]**" | **Wrong frame.** The real question is whether *any* native Capacitor plugin fires under a remote `server.url` — and the evidence is in genuine conflict (§6.3). Native push may well work; nobody proved it either way | Escalates a narrow question into the single load-bearing architectural unknown. |
| 8 | 4.2 evidence: a Mar-2026 AlarmKit app and a Nov-2025 hybrid | **Add Jan 2026, forums/812889: a Capacitor _booking_ app rejected twice under 4.2 [V]** despite native Core Location, CLGeocoder, clipboard, share sheet, Maps deep links | Structurally the closest analog anyone has found. Worse news than the old doc carried. |
| 9 | "3.1.3(d)… group classes do **not** qualify" | Correct, and it doesn't matter — **3.1.3(e) carries iBookit on its own [V]**, and 3.1.3(d) still covers genuine 1:1 personal training | Refinement, not a reversal. |
| 10 | Payments section had no numbers | **30% / 15% SBP; payout 45 days after fiscal month end; $40 USD threshold for Mexico [V]** | The old doc couldn't price the paid path. Now it can. |
| 11 | "Fastest live: ~day 9" | **Optimistic.** It didn't price account deletion, the demo account, native chrome, or a 4.2 cycle | See §8. |

Everything else in the 08-12 Apple track holds: individual enrollment, no D-U-N-S, $99/yr, exact
legal name, free app ⇒ no tax form/bank/Paid Apps Agreement, and 4.2.4/4.2.5 being retired.

---

## §1 — Free vs. subscription: is free genuinely faster?

**Yes, and structurally — not marginally.** The paid path adds a strict serial chain *before a
single product can exist in App Store Connect*:

1. **Schedule 2 (Paid Apps Agreement) must be accepted, by the Account Holder only.**
   *"You cannot create new apps or In-App Purchases until you accept the most recent version."*
   — `developer.apple.com/help/app-store-connect/manage-agreements/sign-and-update-agreements` **[V]**
2. **Banking can't even be entered first.** *"In order to add banking information, you'll first need
   to sign a Paid Apps Agreement."* — `.../manage-tax-information/provide-tax-information/` **[V]**
3. **The first subscription and the first subscription group must ship attached to a new app
   version/build.** Only after that first approval can further subscriptions go in without a build.
   — `developer.apple.com/documentation/appstoreconnectapi/submitting-subscriptions-and-subscription-groups-for-app-review` **[V]**
4. A review screenshot of the paywall or the item sold **may** be provided per submission — Apple's
   wording is permissive, *"you can provide a screenshot…"*, not mandatory **[V]**.
5. Then the engineering: ~12–20 engineer-days (§4.6).

**And for iBookit the paid path isn't merely slower — it isn't required at all** (§5). So the
calendar cost is avoidable, not deferred.

### Can a free app add IAP later?

**Yes, and without a new app record [~].** Price is set to $0.00 under App Price & Availability with
no new binary; *"The first in-app purchase will need to be submitted with a new version of your app;
however, following this, you can add in-app purchases freely without the need to resubmit your
application."* — Apple Developer Forums thread 740506 **[?]**, community-sourced, not an Apple Help page.

**Caveat the verifier insisted on:** no Apple primary source was found promising *zero* ranking or
review-history penalty on that conversion. Ratings and reviews attach to the app record, which
doesn't change — so the mechanism suggests no penalty — but that is forum consensus, not a guarantee **[?]**.

**Conclusion: free-first is the correct sequencing**, and it costs nothing later. Not a compromise.

---

## §2 — Zero → active Apple Developer Program membership (Mexican persona física)

### 2.1 Prerequisites

| Item | Requirement | Source |
|---|---|---|
| Apple Account | With **2FA enabled** — precondition to enrolling at all | `/support/enrollment/` **[V]** |
| Entity type | **Individual** — *"No D-U-N-S Number required"* | `/support/enrollment/` **[V]** |
| Legal name | *"Personal legal name (not aliases, nicknames, or company names)"* | `/support/enrollment/` **[V]** |
| Age | Legal age of majority in your region | `/support/enrollment/` **[V]** |
| Photo ID | Government-issued. *"Passports in most regions, driver's licenses"* — Apple publishes **no Mexico-specific list**. Take a **passport**. | `/help/account/membership/identity-verification` **[?]** |
| Fee | *"99 USD per membership year (varies by region, shown in local currency during enrollment)"*, plus regional tax | `/programs/enroll/` **[V]** |
| Payment method | **Apple Account balance / gift cards are NOT accepted** (India is the only exception) | `/support/app-account/` **[V]** |
| RFC / CURP | **Not asked at enrollment.** No tax-ID field appears anywhere in Apple's documented Individual flow **[~]** — they surface later, at tax-form time (§4.2) | `/support/enrollment/` **[~]** |

> **Device requirement — scoped.** *"iPhone or iPad with Touch ID, Face ID, or passcode enabled, OR
> Mac with T2 Security Chip and Apple Silicon. Must use the same device for entire enrollment
> process."* — `/help/account/membership/enrolling-in-the-app/` **[V]**. This is the **Apple Developer
> app** enrollment path specifically. Whether the web path carries the same constraint was not
> established either way **[?]**.

### 2.2 The enrollment flow **[V]** — `/help/account/membership/enrolling-in-the-app/`

1. Sign in with the Apple Account (2FA on).
2. Agree to the **Apple Developer Agreement**.
3. Tap **Enroll Now**.
4. Enter legal name + phone.
5. **Verify identity via photo ID.** Apple does **not** retain the image; name and address are
   extracted; it may pass through a third-party verifier contractually required to delete
   immediately after use **[V]**.
6. Select entity type: **Individual**.
7. Agree to the **Apple Developer Program License Agreement (DPLA)**.
8. Subscribe / pay. Receipt is emailed.

**Timing: no Apple SLA exists.** The old doc's "≤24h" is not on any page the researchers could
fetch, and the verifier struck the same claim from this run's draft as unsourced. **Treat enrollment
duration as unknown; start it on day 0 and let it be the thing that's already done** **[?]**.

### 2.3 The seller-name problem — decide this before enrolling

*"If you are a sole proprietor/single person business, you must join as an individual and your legal
name will appear as the seller… Apple does not accept DBAs, fictitious business names, trade names,
or branches."* — paraphrase synthesised across Apple's enrolment pages + forums thread 85162; **no
single verbatim Apple quote was captured**, so treat the wording as reported policy **[?]**.

Consequence: the App Store listing's seller line reads **your legal name**, not *iBookit*. The
**app name** is still iBookit — this is the seller/developer field only.

Changing it later isn't free: *"Contact Apple Developer Support… Up to 2 weeks for updates to appear
in App Store Connect,"* and it may require business documentation **[V]**.

**The fork:** ship as an individual now and accept a personal name in the seller line, or form a
Mexican legal entity first and delay everything. Given that the seller line is small print and the
app name is not, **ship as an individual** — but know it's a one-way-ish door.

### 2.4 The signing chain — no Mexico-specific variance **[V]** (`/support/certificates/`)

```
App ID (bundle ID)
  └─ Development certificate   — belongs to the individual; multiple allowed
  └─ Distribution certificate  — belongs to the TEAM; one of each type only;
                                 ONLY Account Holder or Admin can create it
       └─ Provisioning profile — binds certificate + App ID + devices + entitlements
            types: Development · Ad Hoc · App Store · DriverKit Development
  └─ APNs Auth Key             — token-based push auth; Apple calls it the
                                 "preferred method for modern integrations"
```

Xcode's automatic signing collapses most of this. **Use the APNs Auth Key, not push certificates.**

### 2.5 You need a Mac

Apple's certificate page says no specific Mac hardware is required, but a computer is needed locally
to generate a CSR; "Xcode is macOS-only" comes from third-party blogs **[~]**. Physical or
cloud-rented, you need one.

> **Check this before buying Mac time [?]:** a WebSearch summary of
> `developer.apple.com/news/upcoming-requirements/` claims **Xcode 26 with the iOS 26 SDK became the
> minimum for new App Store Connect uploads on 2026-04-28**. That date has passed. It was never
> re-fetched or quoted from Apple directly. **Verify it first** — it constrains which macOS version,
> which Xcode, and therefore which Mac.

---

## §3 — App record → TestFlight → review → live

### 3.1 Create the app record **[V]** (`/help/app-store-connect/create-an-app-record/add-a-new-app`)

Required role: **Account Holder, App Manager, or Admin** — and the Account Holder must have signed
the current agreement first.

Fields: Platform(s) · **App Name** · Primary Language · **Bundle ID** · SKU · User Access
(Full/Limited) · optional **Developer Name**.

> **Irreversible:** *Developer Name* is settable **only once, on your first-ever app**, and is not
> editable afterwards **[V]**.

Record lands in **Prepare for Submission**.

**Name reservation:** Apple's page states **no reservation period** — only that a name can be used
once per localization. The widely-repeated "~90 days" figure is **community folklore, not on any
Apple page** **[?]**.

### 3.2 Metadata

- **Screenshots [?]** — from aggregators, *not* Apple's spec page (that fetch 404'd): only the
  largest display per family is strictly required — **6.9" iPhone at 1320×2868**, and **13" iPad at
  2064×2752** if iPad is supported. PNG/JPEG, RGB, **no alpha**, exact dimensions, 1–10 per class.
  **Re-verify against App Store Connect Help before building the assets.**
- **App Privacy questionnaire** — covers data collected by the app *and by bundled third-party
  SDKs*; privacy manifests + SDK signatures apply to listed commonly-used SDKs **[?]**.
- **Age rating** — new 13+/16+/18+ tiers replaced 12+/17+; updated questionnaire was mandatory by
  2026-01-31; new social-media capability questions from September 2026 **[~]**.
- **Export compliance** — `ITSAppUsesNonExemptEncryption`. Plain HTTPS / system TLS is exempt.
  **Trap:** a bundled third-party SDK can silently put you on the YES path. Setting the key in
  `Info.plist` suppresses the per-upload questionnaire **[~]**.

### 3.3 Two hard obligations specific to iBookit

**(a) Guideline 2.1 — the demo account.** *"If some features require signing in, provide a valid
demo account username and password."* Where multiple account types exist (iBookit's desk/admin vs
member), supply credentials **per type** in App Review Notes; if a 2FA code or magic link is needed,
supply it **in advance**. A built-in demo mode may substitute **only with prior Apple approval**
**[~]** (sourced from forum paraphrase — the live guidelines page couldn't be fetched for this clause).

> **iBookit's activation is magic-link / passwordless.** That is not a reusable username+password a
> reviewer can log in with repeatedly. **Unresolved build item [~]:** seed a fixed-password reviewer
> account, or get a demo mode pre-approved. Do not discover this at submission.

**(b) Guideline 5.1.1(v) — in-app account deletion.** Verbatim **[V]**:

> *"If your app doesn't include significant account-based features, let people use it without a
> login. If your app supports account creation, you must also offer account deletion within the app.
> Apps may not require users to enter personal information to function, except when directly
> relevant to the core functionality of the app or required by law."*

In force since 2022-06-30 (`developer.apple.com/news/?id=12m75xbj`). Deactivation is **not**
sufficient. iBookit creates Supabase Auth accounts, so this applies. **This is an unconditional
rejection trigger, independent of every other risk on this page — and it's one RPC and one screen.**

(Login-gating every screen is fine: for a gym app, accounts are "directly relevant to the core
functionality." It's the deletion half that's missing.)

### 3.4 Build upload

Xcode Organizer, Transporter, or `xcrun altool` **[?]** — whether altool is still supported or fully
superseded by Xcode/Transporter was not resolved.

Processing runs an unstated-duration pipeline: unpack IPA, index asset catalogs, compute encryption
disclosure, scan bundled SDKs against the required-reason API list, generate TestFlight metadata,
reserve a review intake slot. **Apple publishes no duration.** Community reports span ~10 minutes to
several hours **[?]**.

### 3.5 TestFlight **[~]** (community-corroborated, not primary-fetched)

| | Internal | External |
|---|---|---|
| Testers | up to **100** | up to **10,000** |
| Who | must be App Store Connect team members | anyone, by email or public link |
| Beta App Review | **none** | **required on the first build of each version** |
| Availability | minutes after processing | after beta review |

Builds **expire 90 days after upload**; on expiry testers lose access entirely, including login
state and local data.

**Use internal TestFlight** — it skips beta review, and 100 seats is far more than a solo dev plus a
couple of gym staff need.

### 3.6 App Review time — a real contradiction, stated not averaged

- **Apple, direct fetch [V]:** *"On average, 90% of submissions are reviewed in less than 24 hours."*
  — `developer.apple.com/distribute/app-review/`
- **Community, 2026-dated [?]:** first-time new-app submissions realistically **2–5 days**, tail at
  3–7+ days (bettercodepush, ezscreenshots, extensionbooster). Possible complaint-thread selection bias.
- A third figure — "50% within 24h, 90% within 48h" — surfaced attributed to a forums FAQ and
  **conflicts with the live page** **[?]**.

**Plan against the community range.** The Apple number is the only primary one; it is also the only
one with an incentive behind it.

**Expedited review** exists only for (1) a critical bug fix in the live version, or (2) an
event-associated app — via `developer.apple.com/contact/app-store/?topic=expedite`, framed as
discretionary **[~]**. **Not a launch strategy.**

### 3.7 Release **[?]**

Automatic · automatic + **phased** (7-day ramp 1%→100%, pausable up to 30 days) · **manual**
("Pending Developer Release") · scheduled ("Pending Apple Release").

**Take manual release for v1.** Approval and going live should be two separate decisions.

---

## §4 — Charging *through* the App Store: everything it would take

This section answers "what would we need" — not "what we should do." §5 is why we shouldn't.

### 4.1 The gate

**Schedule 2, signed by the Account Holder.** Nothing else in this section can start first — not
banking, not tax, not creating a product **[V]**. Path: App Store Connect → *Agreements, Tax, and
Banking* → Agreements → Paid Apps row → *View and Agree to Terms* → 2FA → Agree.

> Verbatim Schedule 2 text was **never opened** in this run (the PDF at
> `/support/downloads/terms/schedules/Schedule-2-and-3-20251008-English.pdf` was found but not
> fetched) **[?]**. Read it before signing.

### 4.2 Tax — as a Mexican persona física

- **W-8BEN, not W-8BEN-E [~].** IRS: *"Use W-8BEN if you're a nonresident alien individual… Use
  W-8BEN-E instead if you're a foreign entity"* (`irs.gov/instructions/iw8ben` **[V]**). A persona
  física with no incorporated entity is an individual. W-8BEN-E would only apply if the account were
  held by an S.A.S. / S.A. de C.V.
- **Line 6a Foreign TIN:** Mexico issues TINs, so **the RFC** is very likely the FTIN **[~]** — the
  IRS page doesn't name Mexico.
- **Apple's Mexico-specific fields [V]:** *"tax-registered individuals based in Mexico must provide:
  Clave en el RFC…, Clave Única de Registro de Población (CURP), Cédula de Identificación Fiscal
  (Tax ID Certificate)."*
- **Apple withholds [V]:** *"VAT on Apple's Commission (you may receive an input tax credit);
  Withholding Income Tax applied to your total monthly worldwide sales before VAT"*, with monthly
  invoices and withholding statements in App Store Connect.
- **[?] Unresolved and it matters:** whether that makes Apple a **legally recognised SAT retention
  agent** under the digital-platforms regime, or a private commercial arrangement. This determines
  whether the persona física owes **additional** personal SAT filings on top. **Needs an accountant,
  not more research.**
- **[?] e.firma / PFAE:** never mentioned on Apple's tax page. Absence of mention is not proof of
  non-requirement.
- **[?] US–MX treaty article and rate** (royalties vs business profits): not checked against IRS
  treaty text.

### 4.3 Banking **[V]** (`/help/app-store-connect/reference/banking-information/`)

Bank Territory · Bank Code (routing/clearing) · Account Number · **Account Holder Name** — *"must be
entered in English letters or numbers and must match exactly as it appears on your bank account,
including punctuation"* · holder address · Checking/Savings.

**One primary account only. No split payouts [V].** The name-match rule implies the account must be
titled in the persona física's own legal name **[~]**.

**[?]** Whether the Mexico form asks for a **CLABE** by name or folds it into the generic Bank Code
field — and whether payouts land in MXN or convert from USD — was not confirmed.

### 4.4 Commission and payouts

| | |
|---|---|
| Standard commission | **30%** **[V]** |
| Small Business Program | **15%** for ≤ $1,000,000 USD prior-year proceeds — *"New developers to the App Store can also take advantage of this reduced rate"* **[V]** |
| SBP enrollment | Account Holder + accepted Schedule 2 + list Associated Developer Accounts + submit form **[V]** |
| SBP effective date | *"15 days after the end of the fiscal calendar month in which enrollment is approved"* **[V]** |
| Exceeding $1M | 30% applies to further sales that year; re-enroll the following year if back under **[V]** |
| Payout timing | *"45 days after the last day of the fiscal month in which the transaction was completed"* **[V]** |
| Reports | by the first Friday of the current fiscal month **[V]** |
| **Minimum threshold, Mexico** | **40 USD** — the default; MXN is not on Apple's low-threshold table **[V]** |

> **Stale figure, do not use:** a 2017 forums thread (89651) cites a **$150 USD** threshold. The live
> reference page governs: **40 USD** **[V]**.

### 4.5 Product shape, if it were ever built **[~]**

| iBookit concept | Apple type |
|---|---|
| Recurring gym membership | Auto-renewable subscription |
| Fixed-count class pack | **Consumable** |
| Fixed-window access, one charge | Non-renewing subscription — *"your app must contain code that recognizes when the subscription is due to expire"* **[V]** |

Groups: up to 100 subscriptions per group, one active per group, **level 1 = highest tier** **[V]**.
That level ordering drives upgrade (immediate + prorated refund) / downgrade (next renewal) /
crossgrade (immediate only if same duration) **[V]**.

Offers: **introductory** (free trial / pay-up-front / pay-as-you-go) — new and returning customers,
one per subscription group; **promotional** — existing/lapsed customers, usable even if an
introductory offer was already taken **[V]**.

### 4.6 The engineering

- **Client:** StoreKit 2 via a Capacitor plugin. `verifyReceipt` was **deprecated 2023-06-05**, still
  works, no announced EOL, no new features; the current path is **JWS-signed transactions** verified
  on-device or via the App Store Server API **[V]** (forums 758630).
- **Server:** App Store Server API (`Get Transaction History` v2, `Get All Subscription Statuses` —
  both JWS-signed **[V]**) + **App Store Server Notifications V2** with **separate production and
  sandbox URLs**, handling `SUBSCRIBED`, `DID_RENEW` (subtype `BILLING_RECOVERY` vs empty),
  `GRACE_PERIOD`, `EXPIRED`, `REFUND`, `REVOKE`, `CONSUMPTION_REQUEST` **[~]** — Apple's
  notifications doc was **never directly fetched**; this enum is blog-synthesised.
- **Sandbox:** renews max **12×/day**; TestFlight subscriptions reportedly changed (Dec 2024) to once
  per 24h **[~]**. Xcode's local StoreKit Testing config offers much faster rates.
- **Plugins:**
  - **`@revenuecat/purchases-capacitor`** — actively maintained (864+ commits, v11.3.1 at fetch),
    needs an In-App Purchase Key for StoreKit 2 / iOS 16+. **Its README does not document or claim
    support for a remote `server.url` origin** **[V]**. Its `webCheckoutUrl` is a *web redirect*, not
    native IAP, and would not satisfy Apple where IAP is required.
  - **`j3k0/cordova-plugin-purchase`** — issues **#1524 / #1416** report iOS failures under
    Capacitor; v13 reported non-functional under Capacitor while v11 works; v13.10.1 returning empty
    `store.products` on iOS. All **[?]**, read from search snippets. *(Separately,
    **ionic-team/capacitor#7361** — a different repo — documents a Cordova payment-sheet
    activity-result intercepting other Capacitor plugins **on Android**.)*

**Effort, solo dev: ~12–20 engineer-days [?]** — client 3–5d, server 4–7d, mapping an Apple
subscription onto gym membership rows 3–4d, testing 2–4d. **And that assumes the remote-origin
problem in §6.3 is solved** by bundling a thin native shell that talks to native IAP and calls the
remote API — not by serving the IAP UI from the remote origin.

---

## §5 — Charging on our own website: does Apple mind?

**No — and for a gym, Apple's own text requires it.** But there's a second rule the 08-12 plan
missed, and it's the one that actually constrains the product.

All quotes: `developer.apple.com/app-store/review/guidelines/`, fetched 2026-08-13 **[V]**.

### 5.1 The rules that apply

**3.1.1 — the general rule:**
> *"If you want to unlock features or functionality within your app, (by way of example:
> subscriptions, in-game currencies, game levels, access to premium content, or unlocking a full
> version), you must use in-app purchase. Apps may not use their own mechanisms to unlock content or
> functionality…"*

**3.1.3(e) Goods and Services Outside of the App — the clause iBookit rides:**
> *"If your app enables people to purchase physical goods or services that will be consumed outside
> of the app, you must use purchase methods other than in-app purchase to collect those payments,
> such as Apple Pay or traditional credit card entry."*

Note the verb: **must** use other methods. Not *may*.

**3.1.3(d) Person-to-Person Services:**
> *"If your app enables the purchase of real-time person-to-person services between two individuals
> (for example tutoring students, medical consultations, real estate tours, or **fitness training**),
> you may use purchase methods other than in-app purchase to collect those payments. One-to-few and
> one-to-many real-time services must use in-app purchase."*

Group classes are one-to-many, so 3.1.3(d) does **not** cover them — the 08-12 doc had this right.
It covers genuine **1:1 personal training**, which is a real iBookit SKU. **3.1.3(e) carries the rest.**

**3.1.3(b) Multiplatform:** allows access to things bought elsewhere *"provided those items are also
available as in-app purchases within the app."* — not the route to rely on.
**3.1.3(a) Reader:** magazines, newspapers, books, audio, music, video. Not iBookit.
**3.1.5(a):** the direct fetch stopped at 3.1.3(e) and surfaced **no 3.1.5(a) text** — whether that
subsection currently exists is **[?] unconfirmed**. The 08-12 doc's warning ("don't cite 3.1.5") still
stands: cite **3.1.3(e)**.

**Applied verdict [~]:** a gym membership and a class pack both qualify — the member physically
attends the gym, so it's a service consumed outside the app under 3.1.3(e); 1:1 training is
independently covered by 3.1.3(d). Either ground supports web checkout / Apple Pay / card entry,
with **no Apple commission and no Paid Applications Agreement dependency on that revenue [~]**.

**How strong is that verdict?** It is *our reading of Apple's verbatim text*, and the text is
unambiguous. The supporting precedent is thin: **one** data point — Mindbody's App Store listing
shows no in-app purchases **[~]** (`apps.apple.com/us/app/mindbody-fitness-wellness/id689501356`).
ClassPass and TeamUp were not checked. **No Apple-authored statement about gyms or fitness-class
booking was located**, despite being searched for.

### 5.2 Anti-steering — the rule that actually binds, because Mexico is not the US

**3.1.1(a) [V]:**
> *"…These entitlements are not required for developers to include buttons, external links, or other
> calls to action in their United States storefront apps… **In all other storefronts, except for the
> United States storefront, where this prohibition does not apply, apps and their metadata may not
> include buttons, external links, or other calls to action that direct customers to purchasing
> mechanisms other than in-app purchase.**"*

**3.1.3 preamble [V]:**
> *"Apps in this section cannot, within the app, encourage users to use a purchasing method other
> than in-app purchase, except for apps on the United States storefront and as set forth in 3.1.1(a)
> and 3.1.3(a). **Developers can send communications outside of the app to their user base about
> purchasing methods other than in-app purchase.**"*

**So there are two separate rules, and iBookit passes one and is constrained by the other:**

| | Mexico storefront |
|---|---|
| Take payment outside IAP | **Required** (3.1.3(e)) |
| Put a "Pay here" button in the app | **Prohibited** |
| Link to the web checkout from the app | **Prohibited** |
| Copy steering members to the website to pay | **Prohibited** |
| Email / SMS / WhatsApp / desk signage about paying | **Explicitly allowed** |

No Mexico-specific carve-out exists in Apple's text; Mexico falls under the default rest-of-world
treatment **[~]** — a textual inference, since no Apple page names Mexico either way.

**This is the single most actionable finding in this document.** The member app can show a balance,
show that a membership expired, and show what a class costs. It cannot contain the checkout, the
link to it, or a call to action toward it. **Renewal prompts belong in email and at the desk.**

> **And this is the honest answer to "would charging through the App Store save us issues?"**
> It would buy exactly one thing: the right to put a buy button in the app. It would cost 15–30%,
> Schedule 2, W-8BEN, RFC+CURP+Cédula, a bank account, 12–20 engineer-days, and Apple sitting in the
> middle of the gym's money. **The exemption is worth more than the button.**

### 5.3 What would break the exemption **[~]**

1. **Digital-only content consumed in-app** — streamed or on-demand video classes watched inside the
   app, downloadable workout plans, paid in-app analytics or badges.
2. **A subscription that unlocks app functionality itself** — paying to unlock booking slots,
   calendar features, or app tiers, rather than paying for the physical class.
3. **Class packs framed as virtual currency/credits** redeemable for in-app perks, instead of
   straightforwardly for real-world attendance.
4. **One-to-few / one-to-many *virtual* real-time sessions** — 3.1.3(d) covers only genuine 1:1.
5. **In-app buttons/links/CTAs to outside payment on the Mexico storefront** — breaks anti-steering
   even though the payment method itself is permitted.

**Our own analysis, not from the research — flag it [~]:** the SaaS revenue (gym → iBookit) is a
different flow entirely. Gyms sign up on the web; nothing about it transacts in the consumer app, so
Apple has no claim on it under any reading. **But if an admin app ever ships to the App Store and
lets a gym owner subscribe or upgrade *inside it*, that is 3.1.1 territory — unlocking app
functionality — and would require IAP.** Keep gym billing on the web, permanently.

### 5.4 Epic v. Apple — noise here, recorded for completeness

All **[?]**, from law-firm and news secondaries; **no primary filings were opened**:
- 2025-04-30, N.D. Cal.: contempt finding, Apple barred from any commission on US external-link purchases.
- 2025-12-11, 9th Cir. (25-2935): affirmed contempt, **vacated the blanket commission ban as
  overbroad**, remanded for a "reasonable, non-prohibitive" cost-based rate.
- 2026-06-30: SCOTUS granted cert on the contempt question.
- One source claims 0% remains in effect until the district court sets a rate **[?]**. Historical US
  external-link tiers of 27%/12% are **[?]** — Apple's own US entitlement page couldn't be fetched.

**None of this touches iBookit**, which is outside the IAP/commission regime on product grounds
regardless of outcome — and it's all US-storefront anyway. The 08-12 doc's read holds.

---

## §6 — Guideline 4.2 and the wrapper: the actual gating risk

### 6.1 The text **[V]**

> **4.2 Minimum Functionality** — *"Your app should include features, content, and UI that elevate it
> beyond a repackaged website. If your app is not particularly useful, unique, or 'app-like,' it
> doesn't belong on the App Store. If your App doesn't provide some sort of lasting entertainment
> value or adequate utility, it may not be accepted."*

> **4.2.2** — *"Other than catalogs, apps shouldn't primarily be marketing materials, advertisements,
> web clippings, content aggregators, or a collection of links."*

> **4.2.3(i)** — *"Your app should work on its own without requiring installation of another app to
> function."*

> **2.5.2** — *"Apps should be self-contained in their bundles, and may not read or write data
> outside the designated container area, nor may they download, install, or execute code which
> introduces or changes features or functionality of the app, including other apps."*

> **4.7 (Mini apps / HTML5 / JS / plug-ins)** — *"Apps may offer certain software that is not embedded
> in the binary, specifically HTML5 and JavaScript mini apps and mini games, streaming games,
> chatbots, and plug-ins… You are responsible for all such software offered in your app… Software
> that does not comply with one or more guidelines will lead to the rejection of your app."*
> Sub-rules 4.7.1–4.7.5 add: privacy/5.1 compliance; content moderation/reporting/blocking; 3.1
> compliance for digital goods; **no exposing native platform APIs to the software without Apple
> permission (4.7.2)**; no data/permission sharing without per-instance consent (4.7.3); an index
> with universal links (4.7.4); age-gating (4.7.5).

*(4.7 is included because the verifier caught it missing. An Ionic team member is reported —
second-hand, via capawesome.io — to characterise a fully-remote `server.url` as a "gray area under
Section 4.7" **[?]**; the original statement was never located.)*

### 6.2 3.3.1 is answered, and it's fine

**DPLA 3.3.1(B) [V]** (`/support/terms/apple-developer-program-license-agreement/`; **effective date
not visible in the fetched excerpt [?]**):

> *"Except as otherwise expressly permitted by Apple, Your Application may not download or install
> executable code. Interpreted code may be downloaded and executed by an Application provided that
> such code: (a) does not change the primary purpose of the Application as approved by Apple, (b) is
> not used to bypass App Review, (c) does not violate the terms of this Agreement or the Program
> Requirements, and (d) does not create or enable the distribution of malware. **For clarity, scripts
> and code downloaded and run by Apple's built-in WebKit framework or JavaScriptCore are
> permitted.**"*

**A WKWebView loading remote HTML/JS is explicitly the permitted case.** The 08-12 doc listed this as
an unexamined risk underpinning the whole strategy; it is now closed.

**The live wire is condition (a): *primary purpose*.** If remotely-served content changes what the
app *is* from what Apple reviewed, that's a DPLA failure separate from and additional to 4.2. For a
multi-tenant app this is a real constraint: every tenant must be the same product — a gym booking
app. It also means "update without a store release" is fine for *content and fixes*, and not fine
for *pivoting what the app does*.

### 6.3 The remote-origin plugin question — unresolved, and load-bearing

**This is the single most important unknown in the entire architecture**, and the evidence genuinely
conflicts. Stating both sides, per the verifier:

- **ionic-team/capacitor#2373** (directly fetched **[V]**), *"bug: Native platform not recognized when
  fetching app from remote url"*: *"When using server.url to fetch my app from a public web server,
  the current native platform is not detected and Capacitor.platform always outputs web"* — causing
  **native plugin failures on Android**. ⚠️ **The reported failure is Android-specific; iOS is the
  platform that matters here.** The issue is **closed with no documented fix visible**, so
  current-version behaviour is unconfirmed.
- **ionic-team/capacitor Discussion #4150 [?]** (search snippet only): plugins *do* work from a remote
  `server.url` because *"the plugins are smart enough to check the environment and use the right APIs."*
- **Separately, a researcher asserted** that the Capacitor push plugin is native *regardless* of
  `server.url` **[?]** — no source given.
- **Capacitor's own docs [V]** (`capacitorjs.com/docs/config`) decline to engage the question and say
  `server.url` is *"intended for use with live-reload servers"* and *"is not intended for use in
  production."*

**Do not resolve this by reading more. Resolve it with a device.** Build a throwaway Capacitor shell
pointed at a deployed iBookit origin, install it on a real iPhone, and check three things: does
`Capacitor.getPlatform()` return `ios`; does the push plugin register and receive an APNs token; does
the camera plugin open. **That one afternoon decides the architecture.**

**Also note CORS [~]:** a remote-origin webview enforces CORS exactly like a browser. iBookit's own
APIs are same-origin with the loaded page, so this is mostly moot — but any cross-origin call
(Supabase direct, third-party) needs headers that work from the app's origin.

**The mitigation, if the test fails:** bundle the app locally (thin native shell + local assets that
call the remote API) instead of `server.url`, or use Capacitor's Live Updates / OTA bundle model.
That is a different build, not a config change — which is why the test comes first.

### 6.4 The real-world evidence, and it is bad for a bare shell

**Apple Developer Forums thread 812889** (poster-dated **January 2026**, developer-transcribed rather
than an Apple document) **[V]**: a Capacitor-based **black-car/limo booking app** — structurally the
closest analog anyone found to iBookit — was **rejected twice under 4.2**. Reported reviewer language:

> *"the experience is not sufficiently differentiated from web browsing and that features such as
> Core Location or sharing alone are not robust enough."*

It **already had** native Core Location, native reverse geocoding (CLGeocoder), native clipboard,
native share sheet, and Apple Maps deep-linking. Those were judged insufficient **because the core
transactional flow still ran through a web platform**.

The pattern across agency sources (code2native, mobiloud, shopapper — undated **[?]**, mutually
consistent): reviewers pattern-match on (1) full-screen WKWebView as the entire UI, (2) no native
navigation chrome, (3) nothing usable without connectivity, (4) no push.

**Risk rating: HIGH for a naive `server.url` shell. MEDIUM with §7 built.**

Read the Jan-2026 case honestly: it says bolt-on native features don't save you if the *core
transaction* is web. For iBookit the core transaction is **booking a class**. That argues for making
**booking itself** feel native — the schedule and the booking action — and leaving the long tail
(profile, history, policies) on web.

### 6.5 Multi-tenancy: one app, not one per gym — settled

**4.2.6 [V]:**
> *"Apps created from a commercialized template or app generation service will be rejected unless they
> are submitted directly by the provider of the app's content. These services should not submit apps
> on behalf of their clients… Another acceptable option for template providers is to create a single
> binary to host all client content in an aggregated or 'picker' model, for example as a restaurant
> finder app with separate customized entries or pages for each client restaurant, or as an event app
> with separate entries for each client event."*

**4.3(a) [V]:**
> *"Don't create multiple Bundle IDs of the same app (for example, submitting a separate map app for
> every city in the world instead of a single worldwide map…). If your app has different versions for
> specific locations, sports teams, universities, etc., consider submitting a single app and providing
> the variations using in-app purchase."*

| | One app, tenant at login | One app per gym, our account |
|---|---|---|
| 4.2.6 | **Apple's own named exception** — gym = the "event" | **Triggers directly.** Apple wants such apps submitted by the *gym* |
| 4.1 Copycats | one app, one identity | each new gym app reads as a minor-changes resubmission |
| 4.3(a) Spam | fine | **the named anti-pattern**, verbatim |

**Precedent [V]:** forums thread 774855 (Feb 2025, "Deliverit-Software", 180+ white-labelled restaurant
clients) — Apple pushed the vendor toward **each client's own developer account**, with no substantive
relief on appeal. **Don't plan on winning that appeal.**

**Two caveats:**
- **[?] Residual ambiguity:** Apple's picker example is a *visible browsable directory*; iBookit would
  select tenant by credentials or invite code. No primary source confirms credential-based selection
  satisfies 4.2.6 as cleanly. **Cheap hedge: put a visible gym picker in front of the login wall.**
  It costs one screen and lands the app inside Apple's literal example.
- **Tension worth naming:** 4.3(a) tells multi-variant apps to *"provide the variations using in-app
  purchase"* while §5 concludes iBookit's revenue is IAP-exempt. Not in conflict for the recommended
  shape — one app, one identity, tenant is not a purchasable variation — but they **would** collide if
  tenants were ever monetised as in-app unlocks. Never do that.

**This also resolves the Host-header tenancy problem from the 08-12 doc.** One binary, one
`server.url`-or-bundle origin, tenant resolved *inside* the app after selection — not one hostname
per build.

---

## §7 — The v1 build list

Ranked by 4.2 defensibility per unit of cost.

| Capability | What it buys | Cost | Verdict |
|---|---|---|---|
| **In-app account deletion** | 5.1.1(v) — unconditional rejection trigger **[V]** | one RPC + one screen | **Non-negotiable** |
| **Real native chrome** (tab bar / nav, not one full-screen WKWebView) | Directly answers the Jan-2026 rejection pattern | Low | **Must-have** |
| **Native push** (class reminders, booking confirmations) | Most-cited reviewer-accepted differentiator **[?]** — agency aggregation, **no Apple citation** | Low–Med (APNs key + a Supabase-side trigger) | **Must-have** |
| **Reviewer demo account** (fixed password, seeded) | Guideline 2.1; magic-link auth can't satisfy it **[~]** | Low | **Must-have** |
| **Camera / QR check-in** | Strongest "why is this an app" rebuttal to 4.2.2 | Med | **High-value** |
| **Visible gym picker before login** | Lands inside 4.2.6's literal example | Low | **High-value hedge** |
| Offline cached schedule | Answers "needs connectivity for any meaningful UI" | Med | Should-have |
| Native booking interaction (the transaction itself) | Answers the Jan-2026 case's actual reasoning | Med–High | Should-have |
| Biometric login | "Feels native"; not cited as a rejection cause | Low | Nice-to-have |
| Calendar integration | Native-only capability | Low | Nice-to-have |
| Branded splash / launch screen | Baseline compliance, not a 4.2 lever | Very low | Must-have (baseline) |

**Everything above the "Should-have" line assumes native plugins fire. Run the §6.3 device test first.**

---

## §8 — Sequence

Ordered by dependency, not by dates — the one real unknown (enrollment duration) has no published SLA.

**Do first, in parallel, all cheap:**
1. **Enroll.** Individual, exact legal name, passport, $99. No D-U-N-S, no RFC. Accept that the
   seller line will be your legal name.
2. **Verify the Xcode 26 / 2026-04-28 upload requirement** at `developer.apple.com/news/upcoming-requirements/`
   **before** committing to Mac hardware or a cloud-Mac plan.
3. **Run the §6.3 device test.** Throwaway Capacitor shell → real iPhone → platform, push, camera.
   This gates the architecture and the whole §7 list.

**Then, gated on those:**
4. Build v1 with everything above "Should-have" in §7. Account deletion is not optional and is small
   — do it first so it can't be the thing that slips.
5. Strip every in-app payment CTA, link, and button (§5.2). Move renewal prompts to email/desk.
6. Seed the reviewer demo account; write App Review Notes covering **both** account types.
7. Internal TestFlight (no beta review, 100 seats) on a real device.
8. Create the app record, metadata, screenshots, privacy questionnaire, age rating, export compliance.
9. Submit. **Manual release**, not automatic.
10. **Budget one 4.2 rejection cycle.** The Jan-2026 case took two.

**Do not** plan around expedited review. **Do not** submit a bare `server.url` shell to "see what
happens" — a 4.2 rejection is not free, and Apple's feedback is documented as too vague to iterate on.

---

## §9 — What's unresolved, ranked by how much it would change the plan

1. **Do native plugins fire from a remote `server.url` on current Capacitor, on iOS?** The one
   directly-fetched failure report is **Android-specific** and closed without a fix; the
   counter-evidence is a search snippet. If the answer is no, push and QR check-in — the two highest-value
   4.2 defences — can't be built as planned, and the shell must become a bundled app that calls the
   remote API. **Settle it with a device, this week.**
2. **Does Apple read a gym membership as unlocking in-app functionality rather than paying for a
   physical service?** The 3.1.3(e)/(d) verdict is our inference from Apple's verbatim text, with one
   weak precedent (Mindbody's listing) and **no Apple statement about fitness apps**. One reviewer note
   saying "your subscription unlocks booking features, use IAP" flips the entire plan into §4. The
   most likely triggers are in §5.3 — streamed classes, in-app-only premium features, credit-style packs.
3. **A 4.2 rejection on the first submission.** If it comes back 4.2, the answer shifts from
   "wrapper + native touches" to "native booking flow, web for the long tail."
4. **Does credential-based tenant selection satisfy 4.2.6?** Genuine ambiguity, no primary source.
   Mitigated cheaply by a visible picker.
5. **Is the Xcode 26 / 2026-04-28 upload mandate real?** **[?]** Never quoted from Apple directly.
   Constrains Mac choice and earliest upload date.
6. **Would Apple accept a Mexican INE or driver's licence, or only a passport?** No Apple page
   enumerates Mexico. Take a passport and it never matters.
7. **Only if the paid path is ever taken:** whether Apple is a legally recognised SAT retention agent
   (determines extra personal filings); whether e.firma/PFAE gate the ASC tax section; whether the
   Mexico banking form wants a CLABE by name; the US–MX treaty article and rate; verbatim Schedule 2.
8. **Cosmetic / re-verify before executing:** current screenshot specs, description/keyword limits,
   the App Privacy questionnaire flow, build-processing latency, app-name reservation period, whether
   `xcrun altool` is still supported, the Server Notifications V2 enum, whether 3.1.5(a) exists.

---

## Sources fetched directly (2026-08-13)

`developer.apple.com/app-store/review/guidelines/` · `/support/enrollment/` · `/programs/enroll/` ·
`/help/account/membership/enrolling-in-the-app/` · `/help/account/membership/identity-verification` ·
`/support/app-account/` · `/support/certificates/` ·
`/support/terms/apple-developer-program-license-agreement/` ·
`/help/app-store-connect/create-an-app-record/add-a-new-app` · `/distribute/app-review/` ·
`/help/app-store-connect/manage-agreements/sign-and-update-agreements` ·
`/help/app-store-connect/manage-tax-information/provide-tax-information/` ·
`/help/app-store-connect/getting-paid/overview-of-receiving-payments` ·
`/help/app-store-connect/reference/banking-information/` ·
`/help/app-store-connect/reference/reporting/minimum-payment-threshold` ·
`/app-store/small-business-program/` · `/news/?id=12m75xbj` · forums `812889`, `774855`, `758630`,
`740506`, `89651` · `irs.gov/instructions/iw8ben` · `capacitorjs.com/docs/config` ·
`github.com/ionic-team/capacitor/issues/2373` · `github.com/RevenueCat/purchases-capacitor` ·
`apps.apple.com/us/app/mindbody-fitness-wellness/id689501356`

**Failed to fetch** (findings resting on aggregators instead): App Store Connect screenshot
specifications · App Privacy questionnaire detail · provide-information-for-review ·
`/support/storekit-external-entitlement-us/` · `/documentation/appstoreservernotifications/` ·
`/documentation/storekit` · Schedule 2 PDF.
