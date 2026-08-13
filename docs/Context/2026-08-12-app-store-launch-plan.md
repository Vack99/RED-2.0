# iBookit → App Store + Play Store, from zero (Chihuahua, MX)

Research run 2026-08-12 (deep-research, 8 subagents + verifier, verdict `corrected`).
Every claim below is marked **[V]** verified against a primary source or **[?]** inferred/unverified.

> ⚠️ **The Apple half of this document is superseded by
> [`2026-08-13-apple-app-store-playbook.md`](./2026-08-13-apple-app-store-playbook.md)** — a
> deeper Apple-only run (2026-08-13) that corrected 11 items here, most importantly:
> **anti-steering** (this doc never mentions it — the Mexico storefront forbids in-app payment
> buttons/links/CTAs), **5.1.1(v) in-app account deletion** (mandatory, missing here), the
> **one-app-vs-one-app-per-gym** decision (now settled on 4.2.6/4.3(a)), and **3.3.1** (now
> answered: WebKit-executed remote code is explicitly permitted). Read the playbook for Apple.
> **The Google Play track below has not been re-audited and still stands as written.**

---

## The three answers you actually needed

1. **PFAE is not a store gate.** Neither an Apple individual account nor a Play personal
   account asks for a legal entity, RFC, or D-U-N-S **[V]**. PFAE/SAT only matters when money
   flows *through* the stores — which for iBookit it shouldn't (see #2).
2. **Ship the app free, payments outside the store.** Apple 3.1.3(e) *requires* non-IAP for
   "physical goods or services… consumed outside of the app" **[V, verbatim]**, and Google's
   policy names **gym memberships** verbatim in its Play-Billing *exemption* list **[V]**.
   A free app needs **no Paid Apps agreement, no W-8BEN, no bank account, no RFC** **[V]**.
   That removes the entire tax/banking workstream from the critical path.
3. **Google Play is the long pole, not Apple.** The binding constraint is the
   **12 testers / 14 continuous days** closed test Google requires of personal accounts
   created after 2023-11-13 **[V]**. Nothing shortens that clock. Start it first.

**Realistic: 4–6 weeks to live on both. Fastest conceivable: ~24 days.**
(Both are arithmetic on the sourced waits, not a vendor commitment.)

---

## Start-now table — everything with a queue

| Item | Wait | Start on |
|---|---|---|
| Recruit **12 real testers** (real Google accounts, real Android devices) | you control it — but the 14-day clock can't start until the 12th opts in **[?]** | **Day 0** |
| Play closed test: **14 continuous days** | 14 days, hard **[V]** | Day ~7 |
| Apple enrollment ($99/yr) | Apple says ≤24h **[V]**; forums show multi-week stalls **[?]** | **Day 0** |
| Play account + ID verification | none published; 2–5 business days reported **[?]** | **Day 0** |
| Play production-access review | "usually ≤7 days" **[?]**; 14–20+ days reported for new accounts **[?]** | Day 21 |
| Apple App Review | 90% of *all* submissions <24h **[V]**; new accounts realistically 2–7 days **[?]** | Day ~8 |
| RFC / CSF / aviso de actividad empresarial | **same day, online, no cita** **[V]** | parallel, not blocking |
| e.firma (first issuance) | in-person, biometrics; slots open 07:00 daily for next 14 days **[?]** | parallel, not blocking |

---

## Track A — Apple, step by step

1. **Day 0** — Apple Account + 2FA. Enroll as **Individual / Sole Proprietor**.
   - No D-U-N-S **[V, verbatim: "If you're enrolling as an individual, you don't need a D‑U‑N‑S Number"]**.
   - Asks only for legal name, email, phone, address **[V]**.
   - **Enter your exact legal name.** Apple names this explicitly as the one thing that
     delays approval **[V]**. No P.O. boxes.
   - $99/yr **[V]**.
2. **Day 1** — if no confirmation at hour 25, **contact Apple**. That is Apple's own instruction **[V]**.
3. **Days 0–7** — build the Capacitor iOS shell (see Track C).
4. **Day ~8** — submit. Free app ⇒ no tax form, no bank, no Paid Apps agreement **[V]**.
5. **Days 8–14** — review. **Budget one 4.2 rejection cycle.**

Fastest live: ~day 9. Realistic: day 21–35.

> **Corrected 2026-08-13** — this track understates the work. It omits four blocking items:
> in-app **account deletion** (5.1.1(v), unconditional rejection), a **reviewer demo account**
> (2.1 — iBookit's magic-link auth can't provide one), stripping every **in-app payment CTA**
> (anti-steering), and the **remote-`server.url` native-plugin device test** that gates the whole
> architecture. Also: the "≤24h enrollment" figure has **no Apple source** — the 08-13 verifier
> struck it. And the seller line on the listing will read your **personal legal name**, not
> *iBookit*. See the playbook §2, §3.3, §7, §8.

---

## Track B — Google Play, step by step (personal account)

1. **Day 0** — create the account, pay the one-time registration fee (the $25 figure is **[?]**,
   no primary page captured). Submit government ID. Verify email + phone by OTP.
   **Install the Play Console app on a real Android device** — required for new personal accounts **[V]**.
2. **Day 0–3** — recruit **12 testers**. Real accounts, real devices; emulator/bot clusters are
   reportedly detected **[?]**.
3. **Day ~7** — push to the **Closed** track (internal testing does **not** count **[?]**). Get all
   12 opted in. **Push the earliest build you'd be willing to keep** — no source establishes whether
   a later build resets the window **[?]**.
4. **Days 7–21** — the 14 continuous days. Have testers actually *use* it every day or two;
   Google is reported to check engagement, not just opt-in **[?]**. Cheap insurance.
   A tester dropping out before day 14 voids it and re-opting needs a fresh consecutive 14 **[V]**.
5. **Day 21** — apply for production access. **Do not touch the store listing mid-review** **[?]**.

Fastest live: ~day 24. Realistic: day 28–40.

### Why personal and not organization

An org account needs a **D-U-N-S**, which Google says "can take up to 30 days" **[V]** —
and the widely-repeated claim that org accounts are *exempt* from the 12-tester rule is
**[?] unverified and actively contradicted**: Google's own page is silent, and a Play Developer
Community thread is titled *"App from organization account requires 14 days closed testing
before applying for production."*

Personal is the **bounded worst case**, not the provably faster one. If the exemption were
confirmed *and* D-U-N-S landed in ~10 days, org would be ~2 weeks faster. Both halves are unverified.

---

## Track C — packaging

**Capacitor shell pointed at the deployed Vercel origin** is the only route that ships to both
stores without abandoning SSR. Effort: single-digit dev-days **[?, our estimate]**.

Rejected alternatives:
- **Static export** — `output: "export"` means no server, no middleware, no Server Actions **[V]**.
  Incompatible with the client app. The wrapper must point at the live origin.
- **TWA/Bubblewrap** — Android-only; Apple has no equivalent. Two toolchains for no gain.
- **PWA only** — no store presence. Fails the objective.
- **Expo/RN rewrite** — Expo's own writeup says "months, not weeks" **[V]**, and that was a
  *lighter* brownfield unification than a from-scratch SSR rewrite. Schedule death.

Two live risks:
- Capacitor's own docs: `server.url` "is not intended for use in production" **[V]**.
- **Tenancy is Host-header-based** (`packages/data/src/server/resolve-tenant.ts`, read directly).
  A Capacitor `server.url` is one fixed hostname per build ⇒ **one gym per app**, unless we add a
  tenant picker. **Decide this before writing the shell** — it changes the listing model, the
  screenshots, and how many review cycles we sign up for. Also unverified: whether Host-header
  resolution behaves identically from inside a WebView (different UA) — needs a real-device smoke test.

> **DECIDED 2026-08-13 — one app, tenant selected in-app.** Not an open question any more.
> 4.2.6's own "aggregated or 'picker' model" example (*"an event app with separate entries for each
> client event"*) blesses one binary hosting all client content **[V]**; one app per gym under our
> account triggers 4.2.6 **and** 4.3(a)'s named anti-pattern verbatim, with forum precedent
> (774855, Feb 2025 — Apple pushed a 180-client white-label vendor toward each client's own
> developer account, no relief on appeal) **[V]**. Cheap hedge: a **visible gym picker before the
> login wall**, since Apple's example is a browsable directory and ours would be credential-based.
> Playbook §6.5.

> **Bigger risk than either bullet above, found 2026-08-13:** it is unresolved whether **any**
> native Capacitor plugin fires from a remote `server.url` on iOS. The one directly-fetched failure
> report (capacitor#2373) is **Android-specific** and closed with no fix; the counter-evidence is a
> search snippet. If plugins don't fire, push and QR check-in can't be built as planned and the
> shell must become a bundled app calling the remote API. **Settle it with a device, not with
> reading.** Playbook §6.3.

---

## Apple 4.2 — the rejection risk, and what to build into v1

Current text **[V, fetched 2026-08-12]**: *"Your app should include features, content, and UI that
elevate it beyond a repackaged website."* 4.2.2 bans "web clippings."
**4.2.4 and 4.2.5 are now "Intentionally omitted"** — any blog citing them is stale.

Dated evidence, both bad:
- **Mar 2026** — an app with AlarmKit, Live Activities, widgets, Siri Shortcuts, QR and push,
  using WebView *only* for policy/ToS/FAQ, was **still rejected** under 4.2 **[V, Apple forums 818306]**.
- **Nov 2025** — hybrid app, native menus + 2–3 WebView screens, boilerplate 4.2 rejection:
  *"They just copied and pasted the 4.2 clauses and sent it."* **[V, forums 806726]**.

The only documented fix-and-approve cycle is **Dec 2020 [?]**: Apple's words were *"most of the app
content links out to Safari."* Approval followed removing Safari hand-offs, native list/card UI,
killing white-screen flicker, better offline messaging — the dev couldn't isolate which change did it.

**Build into v1** (ranked; checklist source is a vendor that *sells* wrapper approval **[?]**):
1. **Native push via APNs.** The Web Push API reportedly does **not** work inside a WKWebView
   wrapper — only in a Safari-installed PWA **[?]**. Capacitor's native push plugin needs the Push
   Notifications capability + Background Modes → Remote notifications in Xcode **[V]**. Native work, not JS.
2. Persistent **native** tab bar / drawer + stable native headers. No browser chrome.
3. Custom offline screen with retry — not the browser's error page.
4. Outbound links open in an **in-app browser**, never a Safari hand-off.
5. Branded splash, native spinners, screenshots that show native UI.

**Folklore to ignore:** there is *no* sourced evidence of a "B2B app for an existing real business's
customers" carve-out under 4.2. No guideline text, no forum case. Do not plan around it.

---

## Payments — what breaks the exemption

- Don't cite "3.1.5" — the carve-out is now **3.1.3(e)**; current 3.1.5 is *Cryptocurrencies* **[V]**.
- **3.1.3(d)** (person-to-person) names "fitness training" but says *"One-to-few and one-to-many
  real-time services must use in-app purchase"* **[V]** — group classes do **not** qualify there.
  3.1.3(e) is the clause iBookit relies on.
- **What breaks it:** bundling any digital content consumed *inside* the app — workout videos,
  on-demand courses, in-app-only features — reportedly pulls the whole purchase back under 3.1.1 **[?]**.
  Google separately lists "subscription services (such as fitness…)" as *requiring* Billing on the
  same page as the gym exemption; the line is physical facility access vs digital content **[?]**.
- The 2025 Epic external-link changes are **US-storefront only** **[V]** and irrelevant here.

> **MISSING FROM THIS SECTION — anti-steering (added 2026-08-13).** Charging outside IAP and
> *advertising it inside the app* are two separate rules, and this doc only covered the first.
> **3.1.1(a) [V]:** *"In all other storefronts, except for the United States storefront, where this
> prohibition does not apply, apps and their metadata may not include buttons, external links, or
> other calls to action that direct customers to purchasing mechanisms other than in-app purchase."*
> **3.1.3 preamble [V]:** *"Developers can send communications outside of the app to their user base
> about purchasing methods other than in-app purchase."*
> ⇒ On the **Mexico storefront** the member app may **not** contain a checkout, a link to it, or copy
> steering members to pay on the web. Renewal prompts belong in **email / SMS / desk signage**, which
> Apple explicitly blesses. This changes the client app's UI. Playbook §5.2.
>
> **Also added:** the SaaS flow (gym → iBookit) is untouched by any of this — it's a web B2B sale.
> But if an **admin app** ever ships to the App Store and lets a gym owner subscribe or upgrade
> *inside it*, that is 3.1.1 (unlocking app functionality) and **would** require IAP. Keep gym
> billing on the web permanently. Playbook §5.3.

---

## SAT / PFAE — parallel, never blocking

| Scenario | PFAE needed? |
|---|---|
| Apple individual account | **No** **[V]** |
| Play personal account | **No** **[V]** |
| Play organization account | Needs D-U-N-S + an "official organization document"; whether a CSF satisfies it is **unestablished** |
| **Receiving payouts** | **Effectively yes** — as a Mexican filing obligation, not a store gate |

- Platform income falls under *régimen de plataformas digitales* (LISR 113-A–113-D) **[?]**.
- **RFC**: free, online without a cita for an adult with CURP **[?]**.
- **CSF**: instant online, no cita, no cost; since 2026-01-01 no longer required for issuing CFDIs **[V]**.
- **Adding actividad empresarial**: the *aviso de actualización de actividades económicas* is
  **online, RFC + Contraseña, no appointment, no uploads** **[V, SAT trámite 34937]**. Same-day step.
- **e.firma**: first issuance is in-person (biometrics). Blocks *declarations*, not publishing.
- **The part that costs money**: 2026 ISR withholding is **2.5%** with your RFC on file; **20%**
  without. **100% IVA withholding** with no valid RFC *or* if income lands in a foreign account **[?]**.
  ⇒ **Deposit to a Mexican account and give the platform your RFC.**
- Apple requires **Clave en el RFC + CURP + Cédula de Identificación Fiscal** from Mexican
  individuals, and applies the highest rate without proof **[V]**.

---

## Decisions that save weeks, made today

1. **Free app, payments outside the store** — deletes the whole tax/banking workstream **[V]**.
2. **Play personal, not organization** — bounded wait instead of an unbounded one.
3. **12 testers + a closed-track build in front of them, ASAP** — this *is* the schedule.
4. **Enroll with Apple today, exact legal name.**
5. ~~**Settle one-app-with-tenant-picker vs one-app-per-gym before writing the shell.**~~
   **SETTLED 2026-08-13: one app**, tenant selected in-app, with a visible gym picker in front of
   the login wall as a 4.2.6 hedge.
6. **Native push / nav / offline / in-app-browser in v1** — every 4.2 rejection costs a full cycle
   and Apple's feedback is documented as too vague to iterate on.
7. **SAT work in parallel.** RFC + aviso are same-day.

**Added 2026-08-13:**
8. **In-app account deletion (5.1.1(v))** — *"If your app supports account creation, you must also
   offer account deletion within the app"* **[V]**. Deactivation is not sufficient. Unconditional
   rejection trigger, independent of everything else here, and it's one RPC and one screen. Build
   it first so it can't be the thing that slips.
9. **Seed a fixed-password reviewer account** — Guideline 2.1 wants a reusable login and iBookit's
   activation is magic-link/passwordless.
10. **Strip every in-app payment CTA** before submitting (anti-steering, §Payments above).
11. **Run the remote-`server.url` plugin test on a real iPhone before writing the shell** — it
    decides whether the architecture is a remote-origin wrapper or a bundled app.

---

## What would change this answer

- A **primary Google source** confirming org accounts are exempt from the 12-tester rule
  → org route becomes fastest, cuts ~2 weeks. The §Play recommendation flips on this one fact.
- Whether a Play account type can be **changed** personal→organization after creation (would make
  hedging free). Nothing addresses it.
- Whether pushing new builds to the closed track **resets** the 14-day window.
- A confirmed 2025–2026 **approval** of a Capacitor remote-URL app. None found — Apple never
  publishes approval rationale, so it may not be findable. If wrapper approvals are routine, drop
  the rejection-cycle budget; if the opposite, option (a) collapses into a native rewrite.
- ~~Whether **3.3.1** (interpreted code) tolerates a shell whose entire content is remote.~~
  **ANSWERED 2026-08-13 — not a problem.** DPLA 3.3.1(B) **[V]**: *"For clarity, scripts and code
  downloaded and run by Apple's built-in WebKit framework or JavaScriptCore are permitted."* The
  live wire is condition (a) — remote content must not change the app's **primary purpose** as
  approved. Fine for content and fixes; not fine for pivoting what the app does. Playbook §6.2.
- ~~Whether **WKWebView** really can't use Web Push.~~ **Reframed 2026-08-13.** Wrong question — the
  real one is whether *any* native Capacitor plugin fires from a remote `server.url` on iOS
  (unresolved, conflicting evidence). One researcher asserts the Capacitor push plugin is native
  regardless of `server.url` **[?]**. Answer it on a device. Playbook §6.3.

**Added 2026-08-13 to this list:**
- **Whether Apple reads a gym membership as unlocking in-app functionality** rather than paying for
  a physical service. The 3.1.3(e) exemption is our inference from verbatim text, with one weak
  precedent (Mindbody's listing shows no IAP) and **no Apple statement about fitness apps** anywhere.
  One reviewer note flips the whole plan onto the paid path. Playbook §5.1, §9.2.
- **Whether the Xcode 26 / 2026-04-28 minimum-upload requirement is real [?]** — never quoted from
  Apple directly. It constrains Mac choice and the earliest possible upload date. Verify before
  buying Mac time.
