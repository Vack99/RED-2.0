# Ship the iBookit admin app to the iOS App Store — step by step

**Written 2026-08-16. For someone who has never shipped an iOS app and has never opened App Store Connect.**
You are on Windows 11. You have no Mac. An iPhone is arriving. You are a Mexican *persona física*
with no company. Every step below says exactly what to click, exactly what to type, and exactly what
you should see back.

This guide supersedes two earlier repo documents that assumed a Capacitor webview wrapper. You do not
need to read them. If you already have, read **Appendix A** at the end of this framing section for
the three things that changed.

---

## Marker convention

Every load-bearing claim carries one:

| Marker | Means |
|---|---|
| **[V]** | Verified against a primary source (Apple, Expo, RevenueCat, IRS, GitHub) |
| **[~]** | Inferred from verified text — the reasoning is mine, the text is theirs |
| **[?]** | Unverified — community, forum, or a source that could not be re-fetched |

Where research genuinely could not settle something, the step says so **in place**, with what it
would take to settle it. Do not treat a [?] as a fact.

---

## The Map

| Stage | Ends with | Money | Time |
|---|---|---|---|
| **Stage 0** — Apple developer account | An active Apple Developer Program membership; you can open App Store Connect | **$99 USD/year** (~$1,750–2,000 MXN at 2026 rates, exact peso figure only visible at checkout **[?]**) | 45 min of typing; then **24 hours to several weeks** of waiting with no published SLA |
| **Stage 1** — Code → an app file, from Windows | A build sitting in App Store Connect, installable on your iPhone via TestFlight | **$0** on EAS free tier (15 iOS builds/month); **$19/month** for EAS Starter if you iterate daily | 1–2 days of setup + 10–25 min per build + up to 1 hr queue on the free tier. **The free tier also kills any build over 45 minutes** — see step 1.9. |
| **Stage 1.5** — Build the app itself | Six working sectors on device: inicio · clientes · asistencia · agenda · vender · cuenta | **$0** in tooling | **44–60 solo-dev days**, of which **15–20 is foundation before the first sector screen exists** **[~]** — see `docs/planning/2026-08-14-mobile-admin-app-rn-expo.md` §4 |
| **Stage 2** — FREE app live on the App Store | The app publicly downloadable in Mexico | **$0** | 3–7 days of **compliance work** (2A) + 1 day of forms (2B) + **1–5 days** of App Review, plus one rejection cycle if unlucky. **This clock starts after Stage 1.5, not after Stage 1.** |
| **Stage 3** — Paid subscription inside the app | Gyms subscribe with their Apple ID; you get paid 45 days after month end | **15% of revenue** (Small Business Program) + $0 tooling under $2,500/mo | **6–16 solo-dev days** of code + **days-to-weeks** of Apple paperwork validation that blocks everything |

**Read Stage 1.5 before you plan anything around this guide.** Stage 1 ends with a *build* in App
Store Connect — a shell that compiles, installs and launches. It is not the admin app. The admin app
is a **rebuild of the entire rendering layer**: `docs/planning/2026-08-14-mobile-admin-app-rn-expo.md`
§4 prices it at **44–60 solo-dev days**, phase by phase — foundation **15–20** (Metro/EAS scaffold,
the `/api/movil/v1` data layer, auth + tenant resolution, the query cache replacing 35
`router.refresh()` sites, `@gym/ui-native`, theme runtime), then inicio **2–3**, clientes **3–4**,
asistencia **5–7**, agenda **6–8**, vender **6–8**, and **cuenta 7–10 — the long pole**, at 37 of the
app's 56 server actions. Its own summary: *"This is a rebuild of the entire rendering layer, not a
port. The business rules and the data seam survive; nothing you can see survives."* **[~]**

**What Stage 2A actually is, so the 3–7 days is not misread.** 2A is the **compliance punch list you
run against a finished app** — account deletion, the seeded demo gym, the payment-CTA strip,
usage-description strings, push, the privacy manifest. Three to seven days is honest **for that
checklist**. It is not the app, and none of it can be done first: you cannot strip payment CTAs from
screens that do not exist, or screenshot a demo gym in an app that cannot render one.

> **The only lever that shortens this [~]:** the anchor doc's §9 fallback — option (c), an Expo shell
> with a few genuinely native screens and a webview for the long tail, growing into the full rebuild.
> It shares the same Expo shell, EAS pipeline, monorepo config, tenancy model and backend surface, and
> differs only in how many screens are native on day one. **The anchor doc does not price it**, and it
> trades calendar days for Guideline 4.2 exposure — the exact axis 2A.8 is about. If you take it, take
> it as a decision, not as a schedule assumption.

**Stages 0 → 1 → 1.5 → 2 are strictly sequential.** Stage 3 is optional and attaches to the **same app
record** — no second app, no new listing, ratings and download history stay where they are **[~]**.
What it is *not* is free of friction: *"To offer In-App Purchases, the membership Account Holder must
accept the Paid Apps Agreement in the Business section of App Store Connect and provide banking and
tax information"*, and *"If you're submitting your first In-App Purchase, you must submit it with a
new version of your app."* **[V]** So Stage 3 costs a paperwork chain plus a full app version through
review — which is exactly what the Stage 3 row prices.

> **[?] What nobody can promise you:** no Apple source states that converting a free app to a
> paid/IAP app carries **zero ranking or review-history penalty**. Apple publishes nothing about App
> Store ranking inputs, so this cannot be settled by reading — only by shipping. The mechanism
> suggests no penalty (the app record does not change), but treat "no penalty" as a reasonable
> expectation, not a fact. **Do not stamp this [V].**

---

## Before you start — have these in hand

Tick every box before Stage 0. Missing any one of them stalls you mid-form.

- [ ] **An Apple Account** (what used to be called an Apple ID). You can make one on Windows.
- [ ] **Your legal name, spelled exactly as it appears on your passport.** Letter for letter, accents
      and all. Not "Aaron", not "iBookit" — the full legal name.
- [ ] **A valid, unexpired passport.** Apple names passports as accepted "in most regions". Whether a
      Mexican INE is accepted is **[?] genuinely unknown** — Apple publishes no Mexico-specific ID
      list. Use the passport and the question never comes up.
- [ ] **A physical street address.** Apple's identity verification requires legal name, phone number
      **and address**, and states plainly: *"P.O. boxes are not accepted."* **[V]**
- [ ] **A credit card issued in your own legal name.** Not a family card, not a business card. Apple:
      *"If you're paying by credit card and enrolling as an individual, you must use your own credit
      card to complete your purchase. If you do not, your enrollment will be delayed and you'll be
      asked for a copy of your government-issued photo identification."* **[V]**
- [ ] **A phone that can receive SMS and calls.** This is how two-factor authentication works with no
      Apple device.
- [ ] **The iPhone** (from step 1.14 onward). Nothing before that needs it.
- [ ] **An Android phone — any one, the cheaper the better.** Step 1.2b's three smoke tests must run
      on a **real device** (a web preview uses the browser's JS engine and proves nothing), and they
      are the tests that can re-price the whole project. No Apple account or iPhone needed for them.
- [ ] **A live HTTPS page you control for a privacy policy.** Mandatory for iOS. **[V]** Step 0.0
      publishes it and verifies it.
- [ ] **A live HTTPS support page with a real contact channel** (an email address on it). Mandatory
      field. **[V]** Step 0.0 publishes it and verifies it.
- [ ] **RFC and CURP** — **only for Stage 3.** Not asked at enrollment, not asked for a free app.
      Apple: *"In order to submit tax forms, you first need to sign the Paid Apps Agreement."* **[V]**

**Dead end, do not chase it:** Mexico appears on Apple's fee-waiver list. The waiver eligibility
requires you to *"Be a legal entity with a status as a nonprofit organization, accredited educational
institution, or government entity"* and to *"Not be an individual, sole proprietor, or single-person
business."* **[V]** You cannot get it. Budget the $99.

---

## Appendix A — What this supersedes (skip unless you have read the two older docs)

Two earlier documents in this repo assumed the mobile app would be a **Capacitor webview wrapper**
(a native shell whose entire screen is a web page):

- `docs/Context/2026-08-13-apple-app-store-playbook.md`
- `docs/Context/2026-08-13-apple-b2b-saas-verdict.md`

The stack changed on 2026-08-14 to **native React Native + Expo** (`docs/planning/2026-08-14-mobile-admin-app-rn-expo.md`).
That changes three things, and **this guide wins on all three**:

1. **The Mac question.** Those docs say "you need a Mac" for the signing chain. That was true for a
   local Xcode build. It is not true for Expo/EAS, which compiles on Expo's own hosted macOS machines
   and stores your signing certificate server-side. **[V]**
2. **Guideline 4.2 risk is re-priced downward.** Those docs treat "native chrome", "camera/QR",
   "offline schedule" as *defensive* features bolted on to survive a webview rejection. With a
   genuinely native RN app, 4.2 ("repackaged website") is satisfied structurally. Those features go
   back to being ordinary product decisions. **[~]**
3. **Guideline 4.2.7(e)** ("Thin clients for cloud-based apps are not appropriate") was cited in both
   docs as a general anti-webview rule. It is not. It sits under the heading **"4.2.7 Remote Desktop
   Clients"** — apps that mirror a specific host device's session. It never applied here, and it
   certainly does not apply to a native app. See 2A.8 for the full scope correction. **[V]**

Everything else in those two docs (enrollment mechanics, anti-steering, the 7-to-1 competitor
evidence, the CFDI problem) still stands and is folded into this guide.

---

# Stage 0 — Get an Apple developer account

**What this stage buys you:** the right to distribute through TestFlight and submit to the App Store.

**What it does NOT block:** you can scaffold the app, write code, run it on Android, and build
**Android** binaries with zero Apple account — that is steps 1.1 through 1.5. **iOS work stops at
step 1.6.** Start enrollment on day one and keep working while it processes.

---

### Step 0.0 — Publish the privacy page and the support page, and prove they are live

Two URLs are **required fields** in App Store Connect (Stage 2B) and Apple's reviewer will open both.
A 404 on either is a rejection. Publish them now — they take an hour and they block nothing else.

> ⚠️ **Decide the domain first, and write it down.** This guide's examples say `ibooki.lat` (the
> locked product domain, per `docs/brand/`), but the **live infrastructure currently runs on the older
> `ibookit.lat`** — the two are different hosts and only one of them resolves today. **[?]** Whichever
> one actually serves traffic when you do this step is the one that goes into App Store Connect, and
> it must be the same host in Stage 2B, in the app, and in your support email footer. Settle it by
> running the check below against both and using whichever returns `200`.

**Do this:**

1. Publish a privacy policy at `/privacy` (or `/privacidad`). It must be a **public page with no
   login**, and it must name what the app collects: account email, gym membership data, and any
   analytics/push identifiers you actually use.
2. Publish a support page at `/soporte` with a **real, monitored email address on the page itself**.
   A contact form alone is weaker; Apple's reviewer needs a channel they can use.
3. Verify both from PowerShell:

```powershell
"https://ibooki.lat/privacy","https://ibooki.lat/soporte" | ForEach-Object { $u=$_; try { "$u -> " + (Invoke-WebRequest $u -UseBasicParsing -MaximumRedirection 5).StatusCode } catch { "$u -> FAILED: $($_.Exception.Message)" } }
```

4. **Then verify from a machine that is not yours.** Open both URLs on your phone with Wi-Fi off, on
   mobile data. This catches the case where the page only resolves because of a local hosts entry, a
   VPN, or a Vercel preview cookie.

**You'll know it worked when:** both lines print `-> 200`, **and** both pages load on cellular data
with no login prompt, and the support page shows an email address you can actually read from your
inbox.

**Cost:** $0. **Time:** 1 hour (mostly writing the privacy text).

---

### Step 0.1 — Decide: Individual, not Organization

**Do this:** Nothing to click. Just accept the decision and understand what it costs.

You are enrolling as an **Individual** (Apple's term for a sole person, including a *persona física*).
The alternative, **Organization**, requires all five of these and you have none of them **[V]**:

- A legal entity (Apple: *"We don't accept DBAs, fictitious businesses, trade names, or branches."*)
- A **D-U-N-S Number** *(a nine-digit business identifier issued free by Dun & Bradstreet; takes days to weeks to obtain)*
- A work email on your organization's own domain name
- A publicly available, functional website on that domain
- Someone with legal authority to bind the organization to contracts

**The consequence you must accept now:** Apple says *"If you're an individual or sole
proprietor/single-person business, your personal legal name will be listed as the seller on the App
Store."* **[V]** The App Store listing's fine print will read **Aaron Talavera**, not **iBookit**.
The app *name* is still "iBookit". Only the seller line is your name.

**This is reversible later, slowly.** Apple: *"If you have enrolled as an individual and need to
convert your individual account to an organization account, please contact us."* **[V]** It requires
having a legal entity and a D-U-N-S Number by then. No published timeline. **[?]**

> **You do NOT need to pick a "Developer Name".** Some guides tell you to decide this before creating
> your first app. That field is **Organization-only**. Apple: *"If you're enrolled as an individual,
> this option isn't available to you and the developer name is the same as your legal name."* **[V]**
> You will never see the field. Ignore any advice about it.

**You'll know it worked when:** you have written your exact legal name on paper and identified the
card you'll pay with.

**Cost:** $0. **Time:** 2 minutes.

---

### Step 0.2 — Fix your Apple Account's name fields BEFORE anything else

Most people create an Apple Account with a nickname. Apple's enrollment page says: *"Make sure to use
your legal name in the first and last name fields of your Apple Account."* **[V]** Discovering this
after you've paid means a delayed review.

**Do this, in a browser on Windows:**

1. Go to `https://account.apple.com`
2. Sign in (or click **Create Your Apple Account** if you don't have one).
3. Click **Personal Information**.
4. Set **First name** and **Last name** to your exact legal name from step 0.1. Save.

**You'll know it worked when:** the name shown at the top of `account.apple.com` matches your
passport exactly.

**Cost:** $0. **Time:** 5 minutes.

---

### Step 0.3 — Turn on two-factor authentication, using your phone number

Apple: *"To enroll, you'll need an Apple Account with two-factor authentication turned on."* **[V]**
You have no Apple device, so a phone number carries the whole flow.

**Do this:**

1. At `https://account.apple.com`, click **Sign-In and Security**.
2. Click **Two-Factor Authentication**. If it says Off, turn it on.
3. When asked for a verification method, add your phone number as a **trusted phone number** and
   choose **Text message** or **Phone call**.

**The part that traps everyone:** a Windows PC can never be a "trusted device" (only iPhone, iPad,
Apple Watch, Vision Pro, and Mac can). So on the verification screen, **no code will arrive
automatically.** You must click **"Didn't Get a Code?"** or **"Can't get to your devices?"** and then
pick your phone number. Apple: *"If you don't have a trusted device handy, you can have a
verification code sent to your trusted phone number... as a text message or phone call from Apple
with your verification code."* **[V]**

**You'll know it worked when:** Sign-In and Security shows **Two-Factor Authentication: On** and your
phone number listed as trusted.

**If it goes wrong:** you sit on a screen waiting for a push notification that will never come. Click
"Didn't Get a Code?".

**Cost:** $0. **Time:** 10 minutes.

---

### Step 0.4 — Start enrollment on the WEB, not in the Apple Developer app

There are two enrollment paths. **Take the web one.**

**Do this:**

1. In a browser on Windows, go to `https://developer.apple.com/programs/enroll/`
2. Click **Start Your Enrollment**.
3. Sign in with the Apple Account from steps 0.2–0.3.

**Why the web path:** Apple's canonical enrollment page says *"Enrollment in the Apple Developer
Program is available through the Apple Developer app and on the web"*, with exactly one carve-out:
*"Enrollment in India is only available through the Apple Developer app."* **[V]** Mexico is not
carved out.

**Why NOT the app path:** the Apple Developer app requires *"An iPhone or iPad with Touch ID, Face
ID, or passcode enabled, or a Mac with the T2 Security Chip and Apple Silicon. You must use the same
device for the entire enrollment process."* **[V]** You don't have that yet.

> ⚠️ **Honest limit of what is proven.** No Apple page *affirmatively states* that web enrollment
> completes with zero Apple hardware. What is proven is that the device requirement text appears only
> on the Apple-Developer-app pages, and that Apple's list of processes requiring in-app identity
> verification names only *"accepting an Account Holder transfer"* and *"applying for the Apple
> Developer Enterprise Program"* — neither of which is you. **[V]** So "Windows-only enrollment
> works" is a **[~] high-confidence inference, not a documented guarantee.** Have a fallback ready:
> if the flow ever hands you off to the Apple Developer app for ID capture, **stop and wait for the
> iPhone** (enable Face ID/passcode, sign into iCloud, install the latest Apple Developer app, and do
> the whole flow on that one device), or use Apple's documented escape hatch — *"If you do not want to
> provide a photo of your government ID, and it is not required by law, you may contact Apple for an
> alternative method of identity verification."* **[V]**

**You'll know it worked when:** you land on a page asking you to review and agree to the Apple
Developer Agreement.

**Cost:** $0 so far. **Time:** 2 minutes.

---

### Step 0.5 — Agree to the Apple Developer Agreement

**Do this:** Read it. Click **Agree**. Click **Enroll Now** (or **Continue**).

*(This is the entry-level agreement. There is a second, longer one — the Program License Agreement —
at step 0.8. They are different documents.)*

**You'll know it worked when:** you reach a form asking for personal information.

**Cost:** $0. **Time:** 5 minutes if you actually read it.

---

### Step 0.6 — Enter your identity information

**Do this:** Fill in exactly:

- **First name / Last name** — your legal name, letter for letter, matching the passport.
- **Phone number** — the one from step 0.3.
- **Physical address** — a real street address. Apple: *"P.O. boxes are not accepted."* **[V]**
- **Entity type** — select **Individual**.

Apple's warning, verbatim: *"Do not enter an alias, nickname, or company name as your first or last
name, as entering your legal name incorrectly will cause a delay in the approval of your
enrollment."* **[V]**

> **Order caveat [?]:** the only step order Apple publishes is for the *app* path (agreement → enroll
> → name+phone → photo ID → entity type → license agreement → purchase). **No Apple page documents
> the web flow's field order.** Yours may present entity type before or after ID verification. Don't
> panic if the sequence differs from steps 0.6–0.8 here; the *content* is the same.

**You'll know it worked when:** the form accepts the entry and advances without a name-mismatch error.

**Cost:** $0. **Time:** 10 minutes.

---

### Step 0.7 — Identity verification

Apple: *"Verification of your legal identity is currently required in order to enroll in Apple's
developer programs. You'll need to provide your legal name, phone number, and address... In some
cases, you may be asked for your government identification number or an image of your photo ID.
Additional or alternative documentation may be required."* **[V]**

**Do this:** if prompted for a photo ID, photograph or scan the **photo page of your passport** and
upload it. Apple states the image is not retained after name and address are extracted; a third-party
verifier, if used, is contractually required to delete it. **[V]**

**You'll know it worked when:** the flow advances to the license agreement step. This may not be
instant — it can sit in review.

**If it goes wrong:** if the ID is rejected, use the escape hatch quoted in step 0.4 (contact Apple
for an alternative method). There is **no published turnaround** for that route. **[?]**

**Cost:** $0. **Time:** 5 minutes to upload; unknown to process.

---

### Step 0.8 — Agree to the Apple Developer Program License Agreement (DPLA)

**Do this:** Read and accept. This is the real contract governing what you may ship.

**You'll know it worked when:** you reach the payment / subscribe screen.

**Cost:** $0. **Time:** 5 minutes.

---

### Step 0.9 — Pay $99 USD with your own card

**Do this:**

1. On the payment screen, read the amount **before clicking pay**. This is the only place the peso
   figure appears. Apple publishes no MXN price table, and whether Mexico's 16% IVA is added on top
   was **[?] not resolvable from any Apple page** — the only way to settle it is to look at this
   screen. Apple's published figure: *"The Apple Developer Program annual fee is 99 USD... in local
   currency where available. Prices may vary by region and are listed in local currency during the
   enrollment process."* **[V]**
2. Pay with a **credit card in your own legal name**. **[V]**

> **Two payment traps:**
> - **Apple Account balance and gift cards are NOT accepted** for Program membership. India is the
>   only exception. **[V]**
> - **Someone else's card** = enrollment delayed + a manual government-photo-ID request. **[V]**

**You'll know it worked when:** a receipt email arrives automatically.

**Cost:** **$99 USD/year.** **Time:** 5 minutes.

---

### Step 0.10 — Wait. And do NOT pay twice.

**Do this:** nothing here. Work on **steps 1.1 through 1.5** in parallel — those need no Apple
account at all.

> 🚨 **Steps 1.6 onward are NOT unblocked.** `eas credentials`, `eas device:create`, and any iOS
> build (`eas build --platform ios`) all authenticate against an **active** Apple Developer Program
> membership. Until the approval email arrives they fail with an opaque Apple authentication error —
> which reads exactly like "I broke something" and is not. **[~]** *(This is an inference from what
> those commands do — they create App IDs, certificates and provisioning profiles in your team, and
> there is no team until enrollment completes. Expo publishes no statement of the form "these
> commands require an active membership".)* What you **can** do in the meantime: `eas build
> --platform android`, which needs no Apple anything and is exactly the smoke test the anchor doc
> asks for (step 1.2b).

**Apple's published escalation threshold, verbatim:** *"If you haven't received a membership
confirmation within 24 hours of your purchase, contact us."* **[V]** That is the number. Not 48
hours.

**Reality check [?]:** a real 2026 Apple Developer Forums thread is titled *"Apple Developer Program
Enrollment Stuck for 3+ Weeks — No Response from Support"*, with the poster writing *"I have also seen
many other developers experiencing the same issue in early 2026."* Apple publishes no approval SLA —
only the 24-hour contact threshold above. Plan for days, tolerate weeks.

> 🚨 **DO NOT SUBMIT AND PAY A SECOND TIME.** The forum thread above documents exactly this: the
> enrollment didn't activate, the developer *"Submitted and paid a second time"*, and then had to
> chase a refund on top of a three-week wait. If it's stuck, contact support — never re-enroll.

**How to check status and find your Enrollment ID:** Apple: *"To check the status of your enrollment,
sign in to your account on the developer website with the Apple Account you used to enroll."* That
means `https://developer.apple.com/account`. The Enrollment ID also appears in your confirmation
email. Quote it when you contact support at `https://developer.apple.com/contact/`.

**You'll know it worked when:** an approval email arrives **and** `developer.apple.com/account` shows
an active membership with an expiration date one year out.

**Cost:** $0. **Time:** 24 hours to several weeks. **[?]**

---

### Step 0.11 — Turn on Auto-renew. This is mandatory, not optional polish.

**This is the step people skip and it silently kills the app a year later.**

Apple distinguishes the two paths: *"If you enrolled through the Apple Developer app, your membership
will automatically renew as an auto-renewable subscription."* But: *"If you enrolled through the
Apple Developer website, you can opt in to automatic membership renewal by turning on 'Auto-renew' in
the 'Membership details' section of your account."* **[V]**

**You used the web path. It does not auto-renew unless you turn it on.**

**Do this:**

1. Go to `https://developer.apple.com/account`.
2. Find **Membership details**.
3. Turn **Auto-renew** to On. (Availability is region-dependent; if the toggle isn't there, put a
   calendar reminder 30 days before your expiration date.)

**Note:** the renewal charge lands on *"the default credit/debit card associated with your Apple
Account"* — which may not be the card you used at enrollment. Check it. **[V]**

**What a lapse costs you [V]:** apps already installed on users' devices keep working, **but** the app
becomes unavailable for new downloads, you cannot submit updates, and Certificates/Identifiers/Profiles
access is cut off. You can resubscribe for up to one year after expiration. Registered test devices
are *"removed automatically 180 days after membership expiration."*

**You'll know it worked when:** Membership details shows **Auto-renew: On**.

**Cost:** $99/year recurring. **Time:** 2 minutes.

---

### Step 0.12 — Open App Store Connect once, and stop

**Do this:** Go to `https://appstoreconnect.apple.com` and sign in.

**You'll know it worked when:** the dashboard loads with **Apps**, **TestFlight**, **Users and
Access**, and **Business** in the navigation, and there is no "agreement pending" banner blocking app
creation.

**Do NOT create an app record yet.** That happens in Stage 2, and it depends on a Bundle ID that
Stage 1 registers for you.

**One thing you can confirm now:** your free-app distribution is already covered by the DPLA you
signed at step 0.8. There is nothing to sign under **Business → Agreements** unless and until you do
Stage 3. **[V]**

**Cost:** $0. **Time:** 2 minutes.

---

# Stage 1 — Turn the code into an app file, from Windows, with no Mac

**Vocabulary you need for this stage:**

- **Bundle ID** *(also "bundle identifier")* — a permanent, reverse-domain string that uniquely
  identifies your app to Apple forever, e.g. `com.ibookit.admin`.
- **Signing certificate** *(distribution certificate)* — a cryptographic file proving *you* built the
  app. Normally you'd generate it on a Mac's Keychain. **EAS generates and stores it on its servers
  for you.** **[V]**
- **Provisioning profile** — a file that links your certificate + your Bundle ID + (for test builds) a
  list of allowed devices. EAS generates this too. **[V]**
- **`.ipa`** — the compiled iOS app file. The thing you upload to Apple.
- **EAS** — Expo Application Services. Expo's cloud build/submit service. Runs your iOS compile on
  Expo's own macOS machines.
- **TestFlight** — Apple's beta-distribution app. Lets you install a build on your iPhone before it's
  public.
- **SKU** — an internal-only identifier for your app record. Customers never see it.

---

### Step 1.1 — Install the Windows toolchain

**Do this, in PowerShell:**

```powershell
node --version
```

**Pass:** `v22.13.0`–`v22.x`, or `v24.3.0`–`v24.x`.
**Fail:** anything `v23.x`, anything `v24.0`–`v24.2`, anything `v25`+, and anything below `v22.13.0`
— **including Node 20**.

Those are not arbitrary; they are the **intersection of two engine fields**, and you must satisfy
both. React Native 0.86's own `engines` is `^20.19.4 || ^22.13.0 || ^24.3.0 || >= 25.0.0`, which
**excludes** 23.x and 24.0–24.2 — so "newer is always fine" is false here. **[V]** This repo's root
`package.json` declares `"node": ">=22.13 <25"`, which **excludes Node 20 and Node 25+** even though
React Native would accept them. **[V]** Node 20 is therefore a fail *here* regardless of what RN
allows. If you fail, install **Node 22 LTS** from `https://nodejs.org/en/download`, close and reopen
PowerShell, and re-run.

```powershell
pnpm --version
```

**Pass:** `11.5.1` or any 11.x. If the command is not recognised, install it with
`npm install --global pnpm`. This repo already pins `"packageManager": "pnpm@11.5.1"` in the root
`package.json` — see step 1.2, and do not change it.

```powershell
npm install --global eas-cli
```

```powershell
eas --version
```

**Pass:** `12.0.0` or higher. The `eas.json` you write in step 1.5 declares `"version": ">= 12.0.0"`,
and an older CLI refuses every command with a version error. If it is lower, run
`npm install --global eas-cli@latest`.

*(Alternative, equally valid: skip the global install and prefix every command below with
`npx eas-cli@latest` instead of `eas`. Expo explicitly discourages installing `eas-cli` as a project
dependency — global or npx only.)* **[V]**

Then create a free account at `https://expo.dev` and log in:

```powershell
eas login
```

```powershell
eas whoami
```

**You'll know it worked when:** all four version checks pass their criteria above, and `eas whoami`
prints your Expo username (not `Not logged in`).

**Cost:** $0. **Time:** 15 minutes.

---

### Step 1.2 — Confirm the pnpm pin, and do NOT change it

**This step is already satisfied. Confirm it and move on.**

```powershell
Select-String -Path C:\Users\Aaron\Documents\Repos\RED-2.0\package.json -Pattern 'packageManager'
```

**You'll know it worked when:** it prints `"packageManager": "pnpm@11.5.1",`.

**Do not edit that line, and do not invent a version to put there.** Three reasons, in order of
how much they will cost you:

1. **It is a shared file.** The root `package.json` is read by all eight workspaces, the Husky
   pre-commit chain (`pnpm lint && pnpm typecheck && pnpm test`) and Vercel's build of both web apps.
   A mobile-only guess here breaks things that have nothing to do with mobile.
2. **The version already there matches your local pnpm** from step 1.1. There is nothing to align.
3. **`packageManager` is not a free precaution on EAS.** The field takes effect through **corepack**,
   and there is a live cluster of eas-cli issues where setting it *with pnpm* is what breaks the
   install step: **#2518** ("I can't build the project with `packageManager` in package.json"),
   **#2541** ("Error on EAS build install dependencies step with `packageManager` field"), **#3148**
   ("Enabling corepack with pnpm leads to EAS trying to install pnpm again with an error"). **#2401**
   ("EAS Build should adhere to the package manager version set in package.json") is still an **open
   feature request**, which is itself the tell: EAS does not promise to honour this field. **[V]**

> **Honest state of the mechanism [?]:** how EAS Build's macOS image chooses its pnpm is **not
> documented**. The SDK-57 default image (`macos-tahoe-26.5-xcode-26.6`) ships a pnpm 11, i.e. the
> same major as yours — so the "image's pnpm is older than your lockfile" story that used to be in
> this step is not the failure you are guarding against. **Settle it by reading your first build's
> `Install dependencies` log**, which prints the pnpm version it used. Write that number here when
> you have it.

**If — and only if — your first build (step 1.9) shows `WARN Ignoring not compatible lockfile`
followed by `ERR_PNPM_NO_LOCKFILE`,** come back and try these in order:

1. Upgrade local pnpm to the newest 11.x and regenerate `pnpm-lock.yaml` (`pnpm install`), so the
   lockfile format matches the build image's major.
2. Only as a last resort, change `packageManager` — and expect to debug corepack when you do.

**Cost:** $0. **Time:** 1 minute.

---

### Step 1.2b — Three smoke tests, before you write a single screen

**Do tests 1 and 3 before step 1.3, in a throwaway Expo app, in this order. Test 2 is the exception:
it needs a workspace member inside the monorepo, so run it in `apps/mobile` immediately after step
1.3 — before you write any screen.** They cost about an hour together, and any one of them coming
back red re-prices or invalidates the whole port. This is the
anchor doc's Day-1 gate (`docs/planning/2026-08-14-mobile-admin-app-rn-expo.md` §11), and §12 ranks
test 1 as the **#1 thing that would change the answer**.

None of these need an Apple account or the iPhone. Run them on an **Android phone** over USB or via
`eas build --platform android` — a low-end device is the honest target.

**Two words you need before reading the tests:** **Hermes** is the JavaScript engine React Native
runs your code in on the device (not V8, not JavaScriptCore — its standard-library coverage differs,
which is exactly what test 1 probes). **Metro** is React Native's bundler, the equivalent of what
Next/Turbopack does for the web apps; it is what has to find `@gym/domain` on disk in test 2.

**Scratch app, once:**

```powershell
npx create-expo-app@latest C:\Users\Aaron\smoke --template default
```

---

**Test 1 — Hermes `Intl.DateTimeFormat` with a named time zone. This is the single
highest-consequence unknown in the project.**

Put this in the scratch app's first screen and read it on the device:

```js
const p = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date("2026-08-16T18:00:00Z"));
console.log(JSON.stringify(p));
```

**Pass:** an array of `{type,value}` parts, with `hour` reading `12` (18:00 UTC in
America/Mexico_City) — i.e. the time zone was actually **applied**, not ignored.
**Fail:** a `RangeError`, an empty/`undefined` result, or an `hour` of `18` (UTC leaked through
because the `timeZone` option was silently dropped).

**Why it decides everything:** `packages/format/src/fecha.ts:19-23,66-70,99-124` does two-pass DST
math, and **every Agenda write instant and every reader window bound flows through it.** Hermes'
`IntlAPIs.md` documents gaps in `dayPeriod`, `fractionalSecondDigits`, `formatMatcher` and
`numberingSystem` and is **silent on `timeZone`** — so this is **[?] unverified, not confirmed
working.** A red here means bundling `@formatjs/intl-datetimeformat` plus tz data: a bundle-size and
correctness hit that lands across all six sectors. **Stop and replan; do not work around it.**

---

**Test 2 — Metro resolving `@gym/domain/rules`. Run this one in `apps/mobile`, right after step 1.3 —
a scratch app outside the repo is not a workspace member and cannot resolve `workspace:*` at all.**

Add `"@gym/domain": "workspace:*"` to `apps/mobile/package.json`, re-run `pnpm install` at the repo
root, import one rule, and call it on the device.

**Pass:** the rule returns its expected value on device.
**Fail:** a Metro bundling error along the lines of `Unable to resolve module @gym/domain/rules`.

**Why it decides everything:** `@gym/domain` ships **raw `.ts` behind a subpath `exports` map**,
under pnpm's isolated linker, **with no build step permitted by ADR-0011**. You may need
`unstable_enablePackageExports` in `metro.config.js`. **If this fails, the entire "share the pure
packages" premise fails** and the ~7,000 lines the plan counts as free are not free.

---

**Test 3 — WebCrypto availability.**

```js
console.log(typeof globalThis.crypto?.subtle);
```

**Pass:** `"object"`. **Fail:** `"undefined"`.

This confirms (or refutes) the PKCE-plain and `getClaims()`-goes-to-the-network findings, both of
which were inferred from *source absence* rather than from a doc. `getClaims()` gates the entire
`@gym/data/server` tier and **does not port** — this test tells you which auth shape you are
building against before you build it.

---

**You'll know it worked when:** all three print their pass values **on a real device** (not in a web
preview, which uses the browser's JS engine and proves nothing about Hermes). A red test 1 or test 2
is a **stop-and-replan**, not a workaround.

**Cost:** $0. **Time:** 1 hour.

---

### Step 1.3 — Scaffold `apps/mobile` as a plain subfolder — never `git init` inside it

**Do this:**

```powershell
cd C:\Users\Aaron\Documents\Repos\RED-2.0
```

```powershell
npx create-expo-app@latest apps/mobile --template default
```

`--template default` skips the interactive template picker and gives you the expo-router starter this
guide assumes. Without the flag the command **stops and asks you** which template to use.

> 🚨 **Do NOT run `git init` inside `apps/mobile`.** EAS Build finds your lockfile relative to the
> nearest `.git` directory. If `.git` lands inside `apps/mobile`, EAS never finds `pnpm-lock.yaml` at
> the true monorepo root, silently falls back to yarn, and then 404s on every `workspace:*` package.
> This is the confirmed root cause of eas-cli #3247: *"Following the reproduction steps above produces
> a monorepo project where the .git directory is in apps/mobile, and not at the root of the project
> where it should be. This causes EAS build to search for package manager lockfiles in apps/mobile,
> and since it does not find pnpm-lock.yaml, it defaults to using yarn."* **[V]**
> RED-2.0 already has `.git` at the root, so you are safe **as long as you do not create a second one.**

**Now re-home it onto pnpm. This is not optional in this repo.**

`pnpm-workspace.yaml` globs `apps/*`, so `apps/mobile` became a workspace member the instant the
folder appeared — but `create-expo-app` just installed it with **npm**, leaving a private
`apps/mobile/package-lock.json` and a nested `apps/mobile/node_modules`. The root `pnpm-lock.yaml`
therefore has **no entry for `apps/mobile`**, and EAS Build's frozen-lockfile install dies with
`ERR_PNPM_OUTDATED_LOCKFILE` and no other clue.

```powershell
Remove-Item -Recurse -Force C:\Users\Aaron\Documents\Repos\RED-2.0\apps\mobile\node_modules, C:\Users\Aaron\Documents\Repos\RED-2.0\apps\mobile\package-lock.json -ErrorAction SilentlyContinue
```

```powershell
cd C:\Users\Aaron\Documents\Repos\RED-2.0
```

```powershell
pnpm install
```

**Check it took:**

```powershell
Select-String -Path C:\Users\Aaron\Documents\Repos\RED-2.0\pnpm-lock.yaml -Pattern 'apps/mobile'
```

This must print at least one line. If it prints nothing, `pnpm install` did not pick the package up —
re-check that `apps/mobile/package.json` exists and that you deleted `package-lock.json`.

**Then verify two files are tracked by git and not ignored:**

```powershell
git check-ignore -v pnpm-lock.yaml pnpm-workspace.yaml
```

This should print **nothing**. If it prints a rule, remove that rule. eas-cli #2978's confirmed fix:
*"You need to ensure that BOTH pnpm-lock.yaml and pnpm-workspaces.yaml are whitelisted from
.easignore/.gitignore and included in the build artifact."* **[V]**

**Leave `metro.config.js` near-empty.** Do not hand-add `watchFolders` or `resolver.nodeModulesPath`.
Expo: *"Expo configures Metro automatically for monorepos. You don't have to manually configure Metro
when using monorepos if you use expo/metro-config."* **[V]** Every blog telling you to hand-write
resolver knobs is describing pre-SDK-52 Expo.

**Keep pnpm's isolated linker.** Expo supports it from SDK 54. If one specific native dependency
breaks resolution, the documented escape hatch is `nodeLinker: hoisted` in `pnpm-workspace.yaml` —
but that costs you the dependency-boundary backstop, so only do it under duress. **[V]**

**You'll know it worked when:** all four are true — `apps/mobile/` exists; `git status` shows it as
new files inside the existing repo (not a submodule); `git check-ignore` printed nothing;
`pnpm-lock.yaml` contains `apps/mobile` and `apps\mobile\package-lock.json` does **not** exist.

**Cost:** $0. **Time:** 20 minutes.

---

### Step 1.3b — Make the new package pass this repo's own gates

**Do this before your first commit.** `create-expo-app` knows nothing about RED-2.0's guards, and
this repo's pre-commit hook is `pnpm lint && pnpm typecheck && pnpm test`. **Four required fixes plus
one optional narrowing**, all in repo config, none of them `--no-verify`.

**1. `apps/mobile/package.json` — pin the shared libs to the catalog.**

`tools/guards/manifests.test.ts` asserts that every manifest under `apps/*` and `packages/*` declares
each shared lib as the **literal string `"catalog:"`**, and it runs inside `pnpm test`. The generated
manifest writes literal versions. Replace the spec of every one of these that is present, in
`dependencies`, `devDependencies`, `peerDependencies` **and** `optionalDependencies` — the guard reads
all four blocks:

`react`, `react-dom`, `next`, `next-themes`, `sonner`, `@supabase/ssr`, `@supabase/supabase-js`,
`@types/node`, `@types/react`, `@types/react-dom`, `zod`, `vitest`, `typescript`. **[V]**

The scaffold only writes a few of them today, but `@supabase/supabase-js` and `zod` land in
`apps/mobile` the moment you wire auth or validate an API payload — and each one breaks the
pre-commit hook the day it arrives, not the day you read this. Every name on that list is already
in the catalog (`pnpm-workspace.yaml`), so `"catalog:"` always resolves.

```json
{
  "dependencies": { "react": "catalog:" },
  "devDependencies": { "typescript": "catalog:", "@types/react": "catalog:" }
}
```

The catalog's `react` is **19.2.4**, and `react-native@0.86` peers on `^19.2.3`, `expo` and
`expo-router` declare `"react": "*"`, and `next@16.2.6` accepts `^19.0.0` — **19.2.4 satisfies all
of them.** **[V]** Do not diverge.

> ⚠️ **`npx expo install --check` will flag react anyway, and it is wrong.** Its logic is
> `semver.satisfies(actual, expected)` against Expo's exact expected string `19.2.3`, so `19.2.4`
> fails and the command exits non-zero. **Do not let `expo install --fix` downgrade it** — that
> breaks the manifests guard and the pre-commit hook. Documented escape hatch, in
> `apps/mobile/package.json`: `"expo": { "install": { "exclude": ["react"] } }`. **[V]**

**2. `eslint.config.mjs` — ignore `apps/mobile` for now.**

The root config lints the whole monorepo with `eslint-config-next` rules, which know nothing about
React Native. Add one string to the existing `globalIgnores([...])` array (it is already an array of
glob strings — this is a one-line addition, near the bottom of the file):

```js
    // apps/mobile is React Native; eslint-config-next's rules do not apply.
    // Give it its own flat config when it has real screens worth linting.
    "apps/mobile/**",
```

**3. `turbo.json` — keep `apps/mobile` out of the shared `build` task.**

The `build` task hardcodes `"outputs": [".next/**", "!.next/cache/**"]`. A native app has no `.next`,
and **EAS Build — not `turbo run build` — produces the binary.** Either give `apps/mobile` its own
task key, or simply **do not add a `build` script to `apps/mobile/package.json`** — turbo skips a
workspace that does not define the task, which is the smaller change and the one to prefer. **[~]**

**4. `.dependency-cruiser.cjs` — add the `apps/mobile ✗→ @gym/data/server` rule.**

`@gym/data/server` carries the `server-only` poison pill, which is a conditional-exports switch that
throws on import when the `react-server` condition is absent. **Metro never sets that condition**, so
the pill *works* — but it fires at **runtime on the device**, not at lint time. This rule moves the
failure to `pnpm lint` where it belongs. Add it to the `forbidden` array:

```js
    {
      name: "mobile-no-server-dal",
      comment:
        "apps/mobile must NEVER import the @gym/data server DAL. The server-only " +
        "poison pill throws at import when the react-server condition is absent, " +
        "and Metro never sets it — so without this rule that failure lands on a " +
        "device instead of on `pnpm lint`. Mobile talks to /api/movil/v1/* over " +
        "HTTPS (planning §5), never to the DAL directly.",
      severity: "error",
      from: { path: "^apps/mobile/" },
      to: { path: "^packages/data/src/server/" },
    },
```

> ⚠️ **Do NOT try to "add `apps/mobile` to `options.exclude.path`."** That field is a **regex
> string**, not an array — `exclude: { path: "(^|/)(node_modules|\\.next|\\.turbo)(/|$)" }` — so
> there is nothing to push onto. And excluding `apps/mobile` would delete the rule you just wrote.
> If you ever genuinely must exclude it, you extend the alternation:
> `"(^|/)(node_modules|\\.next|\\.turbo)(/|$)|^apps/mobile/"`.

**5. Optionally tighten `engines.node` while you are here.**

The root `package.json` currently reads `"node": ">=22.13 <25"`, which admits `23.x` and
`24.0`–`24.2` — versions RN 0.86's own `engines` field excludes. Set it to:

```json
{ "engines": { "node": ">=22.13 <23 || >=24.3 <25" } }
```

**[V]** This is the one root-`package.json` edit this guide asks for, and unlike `packageManager`
(step 1.2) it is purely a *narrowing* — it cannot change which Node anything actually runs on.

**Then run the gate manually, before you try to commit:**

```powershell
cd C:\Users\Aaron\Documents\Repos\RED-2.0
```

```powershell
pnpm lint
```

> **[?] What `pnpm lint` may still say, and the fix.** `lint:src` also runs
> `depcruise apps packages`, and its `no-orphans` rule's entry-point exceptions are written for
> **Next**: `apps/*/src/app/**/(page|layout|template|loading|error|not-found|route|default|global-error).tsx`.
> Expo Router's entry points live at `apps/mobile/app/**` with names like `index.tsx` and
> `_layout.tsx` — a different shape, so `no-orphans` may flag every screen as a dead file. I could
> not verify this without scaffolding. **If it fires,** add one pattern to that rule's `pathNot`
> array — `"(^|/)apps/mobile/app/"` — with a comment saying Expo Router loads those files directly,
> exactly as Next loads `page.tsx`. **Do not silence it by excluding `apps/mobile` from
> dependency-cruiser.**

```powershell
pnpm typecheck
```

```powershell
pnpm test
```

**You'll know it worked when:** all three are green from the repo root with `apps/mobile` present.
Do not commit yet — steps 1.4 to 1.7 still have to write files. Step 1.8a is the commit; this step is
what makes that commit possible.

**Cost:** $0. **Time:** 45 minutes.

---

### Step 1.4 — Fill in `app.json`

**Do NOT paste over the generated file.** Open the `app.json` that `create-expo-app` just wrote and
**MERGE** the keys below into it. Keep everything already there — in particular keep the
**`expo-router` entry in `plugins`** and any **`extra.eas.projectId`**. Deleting `expo-router` breaks
navigation in a way that only shows up as a blank screen on the device, long after the build
succeeded.

**First, find out where your assets actually landed:**

```powershell
Get-ChildItem -Recurse C:\Users\Aaron\Documents\Repos\RED-2.0\apps\mobile\assets
```

The current template writes them under `assets/images/` (as `icon.png`, `adaptive-icon.png`,
`splash-icon.png`), not under `assets/`. **Use whatever that listing actually shows**, not what is
printed below — every wrong path is an `expo config` error on a missing asset.

Here is the shape to merge in (paths shown as the template currently generates them):

```json
{
  "expo": {
    "name": "iBookit",
    "slug": "ibookit-admin",
    "scheme": "ibookit",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/images/icon.png",
    "userInterfaceStyle": "automatic",
    "ios": {
      "bundleIdentifier": "com.ibookit.admin",
      "buildNumber": "1",
      "supportsTablet": false,
      "config": {
        "usesNonExemptEncryption": false
      }
    },
    "android": {
      "package": "com.ibookit.admin",
      "adaptiveIcon": {
        "foregroundImage": "./assets/images/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      }
    },
    "plugins": [
      "expo-router",
      [
        "expo-splash-screen",
        {
          "image": "./assets/images/splash-icon.png",
          "resizeMode": "contain",
          "backgroundColor": "#ffffff"
        }
      ]
    ],
    "runtimeVersion": {
      "policy": "fingerprint"
    }
  }
}
```

> ⚠️ **`"name": "iBookit"` is a product decision, not a config value — and it is the one line in this
> file every gym client will see.**
>
> `expo.name` becomes iOS `CFBundleDisplayName`, `expo.icon` feeds the asset catalog, and the
> `expo-splash-screen` plugin writes the launch storyboard. **All three are applied into the native
> project by `expo prebuild` / EAS Build** — Expo: *"When you build your app for the app stores, Expo
> Application Services (EAS) will take this image and create optimized icons for every device."*
> **[V]** They are baked into the signed binary. Brand **tokens** are plain JS and ship over EAS
> Update fine; **name, icon and splash do not.** **[V]**
>
> **The consequence, stated plainly: every gym's staff installs an app called *iBookit*, with the
> iBookit icon and the iBookit splash, and sees their own gym's brand only after they log in.**
> **[V]**
>
> **iOS alternate app icons do not rescue this. [V]** Every alternate must be declared in
> `CFBundleIcons` → `CFBundleAlternateIcons` and **shipped inside the binary** (in Expo: the
> `expo-alternate-app-icons` plugin plus `npx expo prebuild --clean`). You can only switch among
> icons you already shipped — so onboarding gym #N+1 means a new binary and a new App Review. They
> change the **Home Screen icon only**: never the App Store listing icon, never the app name, and iOS
> shows a system alert when an app changes its icon **[~]**.
>
> **And there is no compliant alternative.** The shape that gives each gym its own icon is one binary
> per gym, which is **4.3(a)'s named anti-pattern** — *"Don't create multiple Bundle IDs of the same
> app"* **[V]** — and forums thread 774855 shows Apple pushing exactly that vendor toward each client
> opening their own developer account **[V]**. See
> `docs/planning/2026-08-14-mobile-admin-app-rn-expo.md` §7 and 2A.8.
>
> **Tell your gym clients this before they find it in the store.** It reads as a broken promise if
> discovered; it reads as normal SaaS if said up front — it is what Mindbody, Zen Planner and Zenoti
> staff apps all do. If a client's answer is *"then we're not interested"*, the one-binary plan is off
> the table regardless of what Apple permits, and **you want to know that now, not after Stage 2.**

Field by field:

| Field | What it is | Permanent? |
|---|---|---|
| `name` | The name shown under the icon on the home screen | No |
| `slug` | Expo's internal project identifier | No |
| `scheme` | Custom URL scheme (`ibookit://…`) for deep links | No |
| `version` | The marketing version users see, e.g. "1.0.0" | No — bump per release |
| `ios.bundleIdentifier` | Your permanent Apple identity string | **Effectively yes** — locked at your first build upload (step 1.13); see the correction at step 2B.1 |
| `ios.buildNumber` | Maps to `CFBundleVersion`. Must be unique and increasing per upload | Auto-incremented by EAS (step 1.5) |
| `ios.supportsTablet` | **Set to `false`.** This is what actually decides whether Apple demands iPad screenshots. Documented default is already `false` **[V]** | No |
| `ios.config.usesNonExemptEncryption` | Sets `ITSAppUsesNonExemptEncryption` in the compiled app. `false` is correct and truthful for an app that only makes HTTPS/TLS calls to Supabase **[V]** | No |
| `runtimeVersion.policy: "fingerprint"` | Auto-increments the runtime version whenever anything native changes, so an over-the-air update can never reach a binary it's incompatible with **[V]** | No |

> 🚨 **Pick ONE reverse-DNS prefix and use it everywhere, before you type it once.** This guide uses
> `com.ibookit.*` for `ios.bundleIdentifier`, for `android.package`, and for the Stage 3 Product IDs
> (3B.6). **The prefix does not have to be a domain you own or a domain that resolves** — it is only a
> uniqueness convention — so the unresolved `ibooki.lat` vs `ibookit.lat` question from step 0.0 does
> **not** need to be settled to pick it. **[~]** What matters is that all three agree, because
> `ios.bundleIdentifier` locks at your first build upload and a Stage 3 Product ID can never be reused
> even after deletion **[V]**. Mixing `com.ibookit.*` and `lat.ibooki.*` across the three is the
> mistake to avoid.

> **Do NOT add `newArchEnabled`.** The key is absent from the current Expo app config schema **[V]**.
> New Architecture is on and not configurable in SDK 57.

> **Do NOT add a top-level `splash` field.** Splash is configured through the `expo-splash-screen`
> plugin, as shown. **[V]**

**The icon:** the file `expo.icon` points at must be **1024×1024 PNG, sRGB, flattened, no
transparency, no alpha channel, no rounded corners** (iOS rounds them for you).

**Check the alpha channel now — `expo-doctor` does not catch this, and Apple's rejection costs you a
whole build.** Nothing to install; `System.Drawing` ships with Windows PowerShell 5.1:

```powershell
Add-Type -AssemblyName System.Drawing; $i=[System.Drawing.Image]::FromFile("C:\Users\Aaron\Documents\Repos\RED-2.0\apps\mobile\assets\images\icon.png"); "HasAlpha=$([System.Drawing.Image]::IsAlphaPixelFormat($i.PixelFormat)) Format=$($i.PixelFormat) Size=$($i.Width)x$($i.Height)"; $i.Dispose()
```

**Pass:** `HasAlpha=False Format=Format24bppRgb Size=1024x1024`.
**Fail:** `HasAlpha=True` (usually `Format32bppArgb`), or any size other than 1024x1024.

If it fails, flatten it with ImageMagick (`winget install --id ImageMagick.ImageMagick -e`, then
reopen PowerShell):

```powershell
magick "C:\Users\Aaron\Documents\Repos\RED-2.0\apps\mobile\assets\images\icon.png" -resize 1024x1024! -background white -alpha remove -alpha off -strip "C:\Users\Aaron\Documents\Repos\RED-2.0\apps\mobile\assets\images\icon.png"
```

Then re-run the check.

**What skipping this costs you [V]:** the binary fails validation on upload with
`ERROR ITMS-90717: "Invalid App Store Icon. The App Store Icon in the asset catalog in
'<YourApp>.app' can't be transparent nor contain an alpha channel."` That fires during
`eas submit` / Transporter — **before** App Review, meaning the build never reaches App Store Connect
at all and you must fix the icon and rebuild, burning one of your 15 monthly iOS builds.

**Verify the config:**

```powershell
cd C:\Users\Aaron\Documents\Repos\RED-2.0\apps\mobile
```

```powershell
npx expo config --type public
```

```powershell
npx expo-doctor
```

**You'll know it worked when:** the alpha check prints `HasAlpha=False`, `expo config` prints every
field you set **and still shows `expo-router` in `plugins`**, and `expo-doctor` reports no config
errors. *(If `expo-doctor` complains only about the `react` version, that is the known catalog-vs-Expo
mismatch from step 1.3b — leave it alone.)*

**Cost:** $0. **Time:** 30 minutes (plus icon design time).

---

### Step 1.5 — Write `eas.json`

**Do this:** create `apps/mobile/eas.json` with exactly this content:

```json
{
  "cli": {
    "version": ">= 12.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "channel": "development",
      "ios": {
        "simulator": false
      }
    },
    "preview": {
      "distribution": "internal",
      "channel": "preview"
    },
    "production": {
      "distribution": "store",
      "channel": "production",
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "TU-CORREO@ejemplo.com",
        "ascAppId": "0000000000",
        "appleTeamId": "XXXXXXXXXX",
        "ascApiKeyPath": "./.eas/keys/asc-api-key.p8",
        "ascApiKeyIssuerId": "00000000-0000-0000-0000-000000000000",
        "ascApiKeyId": "XXXXXXXXXX"
      }
    }
  }
}
```

You will fill four of the five `submit.production.ios` placeholders in **step 1.7**, and the last one
(`ascAppId`) in **step 2B.1**, which is where the app record is created. Leave them all as-is for now.

> 🚨 **`"appVersionSource": "remote"` plus `"autoIncrement": true` is not optional.** Without both,
> your second submission is rejected by App Store Connect for a duplicate build number, with an opaque
> error. With `remote`, EAS stores the build counter server-side and bumps it for you. With `local`,
> *"the source of truth for project versions is the local project source code itself"* and *"you need
> to commit your changes on every build if you want the version change to persist."* **[V]**

**Check it now, without building** — this resolves and prints the profile, and fails loudly on a
schema error:

```powershell
cd C:\Users\Aaron\Documents\Repos\RED-2.0\apps\mobile
```

```powershell
npx eas-cli@latest config --platform ios --profile production
```

**You'll know it worked when:** it prints the resolved `production` profile (you will see
`distribution: store` and `channel: production`) instead of a JSON-schema error naming a bad key. The
`submit` block's placeholders are **not** validated here — those only bite at step 1.13.

**Cost:** $0. **Time:** 10 minutes.

---

### Step 1.6 — Let EAS create your signing credentials

> 🚨 **`eas credentials` and everything after it needs an ACTIVE Apple Developer Program membership**
> (Stage 0 approved, not merely paid). If the approval email has not arrived, run `eas init` below —
> it talks only to Expo and needs no Apple account — then stop and come back for `eas credentials`.

**First, link the project to EAS.** Nothing has done this yet — step 1.4 merged `app.json` by hand
and step 1.5 hand-wrote `eas.json`, so there is no `extra.eas.projectId` and `eas credentials` has no
project to talk about:

```powershell
cd C:\Users\Aaron\Documents\Repos\RED-2.0\apps\mobile
```

```powershell
eas init
```

`eas init` creates the project on `expo.dev` and writes `extra.eas.projectId` into `app.json`.
**Commit that change** (step 1.8a) — without it, every later `eas` command asks you to pick a project
again, and a build machine picks nothing.

**Then:**

```powershell
eas credentials
```

`eas credentials` is a **nested interactive menu**, and some of its branches revoke things. Answer in
this order, and if a label differs slightly, pick the option with the same *meaning* — **never pick
anything containing Remove, Revoke or Delete:**

1. `Select platform` → **iOS**
2. `Which build profile do you want to configure?` → **production**
3. `What do you want to do?` → **Build Credentials: Manage everything needed to build your project**
4. → **All: Set up all the required credentials to build your project**
5. When it asks to log in to your Apple account, say yes and enter your Apple Account email +
   password + the SMS 2FA code from step 0.3.

It will then generate and store:

- **one Distribution Certificate.** Apple allows *"only one distribution certificate associated with
  your Apple Developer account."* **[V]** This ceiling bites the day you build from a second machine
  or a CI runner — it's the classic way a solo dev bricks their own signing. Everything stays on EAS's
  servers, so a fresh Windows machine just needs `eas login`.
- **one Provisioning Profile** per app. *"Each profile is app-specific."* **[V]**

Push notification keys (APNs) come later, when you actually add push. *"You can have a maximum of 2
APN keys associated with your Apple Developer account, and a single key can be used with any number of
apps."* **[V]**

**Side effect you want:** running `eas build` (or this command) for the first time **registers your
Bundle ID as an App ID in Apple's Certificates, Identifiers & Profiles automatically.** **[V]** You do
not need to register it by hand — and you *must* have it registered before Stage 2's New App dialog,
because that dialog's Bundle ID field is a dropdown populated only from already-registered App IDs.
You cannot type a fresh string there.

**You'll know it worked when:** `eas credentials` lists a Distribution Certificate and a Provisioning
Profile under iOS for `com.ibookit.admin`.

**Cost:** $0. **Time:** 15 minutes.

---

### Step 1.7 — Create an App Store Connect API Key (the .p8 you can only download once)

This key is what lets `eas submit` upload from Windows without an interactive Apple login every time.

**Do this:**

1. Go to `https://appstoreconnect.apple.com`.
2. Click **Users and Access** in the top navigation.
3. Click the **Integrations** tab.
4. **In the left sidebar of that tab, select "App Store Connect API", then the "Team Keys" tab.**
   This level is easy to miss — there is no **+** button until you are on Team Keys.
5. Click **+** (labelled *Generate API Key* the first time).
6. **Name:** `eas-submit`. **Access:** **Admin**. **[V]** Click **Generate**.
7. **Issuer ID** — a UUID shown above the key table, shared across all your keys. Copy it.
8. **Key ID** — the 10-character value in the new key's row. Copy it.
9. Click **Download API Key** in that row. The file saves as **`AuthKey_<KeyID>.p8`** — that is the
   name you will rename in a moment. **This download link disappears afterwards and never returns.**

> 🚨 **The .p8 downloads exactly once and can never be re-downloaded.** **[~]** Lose it and you must
> revoke the key and generate a new one with a new Key ID, then update `eas.json`. Save it
> immediately.

**Where to put it:**

```powershell
New-Item -ItemType Directory -Force C:\Users\Aaron\Documents\Repos\RED-2.0\apps\mobile\.eas\keys
```

```powershell
Move-Item "$env:USERPROFILE\Downloads\AuthKey_*.p8" "C:\Users\Aaron\Documents\Repos\RED-2.0\apps\mobile\.eas\keys\asc-api-key.p8"
```

Then add to `apps/mobile/.gitignore`:

```
.eas/keys/
```

**Now fill in all five `submit.production.ios` placeholders in `eas.json`** — not three. Steps 1.7
and 2B.1 are usually described as covering `ascApiKeyPath` / `ascApiKeyIssuerId` / `ascApiKeyId` /
`ascAppId`, which leaves two that nothing else ever fills, and `eas submit` at step 1.13 stops dead
on a literal `XXXXXXXXXX`:

| Key | Value |
|---|---|
| `ascApiKeyPath` | `./.eas/keys/asc-api-key.p8` — the path you just moved it to |
| `ascApiKeyIssuerId` | the **Issuer ID** UUID from item 7 |
| `ascApiKeyId` | the **Key ID** from item 8 |
| `appleId` | the **email address of the Apple Account you enrolled with** in Stage 0 |
| `appleTeamId` | a **10-character** string. Find it at `https://developer.apple.com/account` → **Membership details** → **Team ID**. Copy it exactly; it is case-sensitive. |

`ascAppId` stays a placeholder until Stage 2B creates the app record.

**Check no placeholder survived except that one:**

```powershell
Select-String -Path C:\Users\Aaron\Documents\Repos\RED-2.0\apps\mobile\eas.json -Pattern 'XXXXXXXXXX|TU-CORREO|00000000-0000'
```

This must print **nothing**. It deliberately does not look for `ascAppId`'s `"0000000000"` — that one
is *supposed* to still be a placeholder until Stage 2B. Any hit here is a field you forgot.

> **Why gitignoring this is safe, even though EAS only uploads git-tracked files.** Two different
> mechanisms are at play and they look contradictory if you don't separate them:
> - Files **imported by your app's JavaScript** must be git-tracked, because EAS uploads a tarball of
>   tracked files to the build machine. Importing a gitignored file fails the build with *"None of
>   these files exist"*.
> - `ascApiKeyPath` is read by the **local EAS CLI on your Windows machine at submit time**, never by
>   the build machine. Gitignoring it is correct and safe.
>
> Your app's *runtime* secrets (the Supabase URL and publishable key) belong in **EAS environment
> variables** or an `EXPO_PUBLIC_`-prefixed env var — not in a gitignored file, and not hardcoded.

**Alternative if you'd rather not do this yet:** `eas submit` also accepts an interactive Apple login,
or an app-specific password via `EXPO_APPLE_APP_SPECIFIC_PASSWORD` (create one at
`account.apple.com` → Sign-In and Security → App-Specific Passwords). The API key is the least
friction long-term.

**You'll know it worked when:** the `.p8` exists at `apps\mobile\.eas\keys\asc-api-key.p8`,
`git check-ignore -v apps/mobile/.eas/keys/asc-api-key.p8` prints a rule (i.e. it is ignored), and the
`Select-String` check above prints nothing.

**Cost:** $0. **Time:** 10 minutes.

---

### Step 1.8 — Do NOT register your iPhone yet

Device registration is **not** a prerequisite for your first production build, and treating it as one
costs you up to three days for nothing. It lives at **step 1.14a**, after the store build ships.

Why: `eas device:create` governs only `distribution: internal` builds — the `development` and
`preview` profiles, which install the `.ipa` straight onto listed devices. The build you are about to
run is `distribution: store`, and it reaches your phone through **TestFlight** (step 1.14), which
installs on any device signed into your Apple Account with **no device registration at all**. **[~]**

**Skip to step 1.8a.**

---

### Step 1.8a — Commit `apps/mobile`, past this repo's pre-commit gate

**EAS only uploads git-tracked files.** An uncommitted `app.json` is an `app.json` the build machine
never sees — it will happily build the last committed state of the repo and hand you a `.ipa` that
does not contain your app. This is the single easiest way to waste a build.

**Do this:**

```powershell
cd C:\Users\Aaron\Documents\Repos\RED-2.0
```

```powershell
git add apps/mobile pnpm-lock.yaml package.json eslint.config.mjs .dependency-cruiser.cjs turbo.json
```

```powershell
git commit -m "feat(mobile): scaffold apps/mobile (Expo SDK 57)"
```

> 🚨 **This commit runs `.husky/pre-commit`, which is `pnpm lint && pnpm typecheck && pnpm test`.**
> If you skipped step 1.3b it **will** fail — the root `eslint.config.mjs` lints every folder in the
> repo with `eslint-config-next` rules, `lint:src` also runs `depcruise apps packages`, and
> `tools/guards/manifests.test.ts` checks `apps/mobile/package.json`. None of them know what a React
> Native app is until you tell them.
>
> **Fix it in the repo config — never with `git commit --no-verify`.** `--no-verify` does not make the
> problem go away; it moves it to the next person's commit, and in this repo the hook is the only
> thing standing between `apps/mobile` and a `@gym/data/server` import that fails on a device.
> Go back to **step 1.3b**, get `pnpm lint && pnpm typecheck && pnpm test` green by hand, then commit.

**You'll know it worked when:** `git log -1 --stat` lists `apps/mobile/app.json` and
`apps/mobile/eas.json`, and `git status` reports a clean working tree.

**Cost:** $0. **Time:** 10 minutes, or an hour if 1.3b was skipped.

---

### Step 1.9 — Run the first production build

**Do this:**

```powershell
cd C:\Users\Aaron\Documents\Repos\RED-2.0
```

```powershell
git status
```

**If that is not clean, stop and commit.** Anything uncommitted is not in the build. Then:

```powershell
cd C:\Users\Aaron\Documents\Repos\RED-2.0\apps\mobile
```

```powershell
eas build --platform ios --profile production
```

**What happens:** EAS uploads a tarball of your git-tracked source, spins up a hosted macOS virtual
machine, runs `npx expo prebuild` to generate the native `ios/` project, compiles and archives it with
Fastlane, and uploads the `.ipa` to a private bucket with a shareable link. **[~]**

**The Xcode version question is already solved for you.** Apple requires, verbatim: *"Since April 28,
2026 — Apps uploaded to App Store Connect must be built with Xcode 26 or later using an SDK for iOS
26, iPadOS 26, tvOS 26, visionOS 26, or watchOS 26."* **[V]** EAS's default iOS image for SDK 57 is
`macos-tahoe-26.5-xcode-26.6` (macOS Tahoe 26.5.2, Xcode 26.6), which is both the `latest` and the
`sdk-57` alias. **[V]** You clear Apple's floor with zero configuration. Do not set an `image` field.

**Cost and time — know the four EAS free-tier limits before this first build. All four are real and
you will hit at least one. [V]**

| Limit | Free | Starter ($19/mo) | What happens when you hit it |
|---|---|---|---|
| Builds per month | **15 iOS + 15 Android** | $45 of build credit, then usage-based | New builds are refused until the 1st of the next calendar month. You are never charged — *"Free plan accounts do not incur overage charges."* |
| **Build timeout** | **45 minutes** | **2 hours** | The build is **terminated**. It still counts against your 15. |
| Concurrency | 1 | 1 (up to 6 at $50 each) | A second build waits in queue |
| Queue priority | Low | High | Expo's own pricing page warns of 90+ minute waits at peak — *"the middle of the business day in North American timezones"* |

**Build time itself:** ~10–25 minutes on the default resource class, once it starts.

**The 45-minute timeout is the limit most likely to bite you, not the queue.** The 45-minute figure
itself is Expo's published free-tier number **[V]**; the reason it is *the* one to watch is an
inference, not a measurement — **[~]**. A cold iOS build of an Expo app with a large dependency tree
plus **Continuous Native Generation** *(CNG: EAS regenerates the whole native `ios/` project from
`app.json` on every build instead of keeping a checked-in Xcode project)* is commonly reported in the
25–40 minute band **[?] — community reports, no Expo-published distribution**; CocoaPods and npm are
cached between builds but `node_modules` is not
(*"Intermediate artifacts like node_modules directories are not cached and restored"*). A build that
times out is killed and burns one of your 15.

Two things that keep you under 45 minutes:

1. Do not add heavy native dependencies you do not need in v1.0.
2. Run your builds back to back, not weeks apart — the CocoaPods and npm caches are warm and a warm
   build is materially faster.

Per-build overage prices, if you ever go paid: iOS medium worker **$2**, iOS large **$4**, Android
medium **$1**, Android large **$2**. **[V]** **EAS Production: $199/month** — 2 included
concurrencies (up to 7 at $50 each), ~$225 of bundled credit. **[V]** Also hard-capped: no more than
**50 builds pending** per platform per account — you will not reach this. **[V]**

**Recommendation:** stay on Free until the waiting genuinely annoys you, then buy Starter. Building
off-peak (evenings in Mexico) mostly dodges the queue.

**If it fails — the common first-build causes, most likely first:**

| Symptom | Cause | Fix |
|---|---|---|
| `None of these files exist` | Your app imports a file listed in `.gitignore`. EAS only uploads git-tracked files. | Un-ignore it, or base64-encode it into an EAS environment variable. |
| `ERR_PNPM_OUTDATED_LOCKFILE` | `pnpm-lock.yaml` has no `apps/mobile` entry — `create-expo-app` installed with npm and you never re-ran `pnpm install`. | Step 1.3 — delete `apps/mobile/package-lock.json` + `node_modules`, run `pnpm install`, **commit the lockfile**. |
| `WARN Ignoring not compatible lockfile` then `ERR_PNPM_NO_LOCKFILE` | The build image's pnpm cannot read your lockfile format. | Regenerate `pnpm-lock.yaml` with a pnpm whose major matches the build image's (read the version out of the `Install dependencies` log). See step 1.2 — do **NOT** reflexively add `packageManager`. **[?]** |
| Dependency/SDK version mismatch | Drift between installed packages and Expo's expected versions | `npx expo-doctor` then `npx expo install --fix` |
| Out of memory on a large bundle | Default resource class too small | Add `"resourceClass": "large"` to the build profile |

The build detail page shows an *abridged* log. Full `xcodebuild` output can be ~10 MB — download the
full log if the abridged one isn't enough. **[V]**

**You'll know it worked when:** the EAS dashboard build page shows status **finished** with a
downloadable `.ipa` link, and a wall-clock duration you can read. If you see `errored` with a message
about the build being cancelled or exceeding maximum duration, that was the **45-minute timeout** —
budget your remaining builds accordingly.

**Cost:** $0 on Free (this burns 1 of your 15 iOS builds whether it succeeds or times out).
**Time:** 10–25 min of build, plus up to ~90 min of queue at peak.

---

### Step 1.10 — Windows-specific hygiene

**Never run a local native compile on this machine.** `npx expo run:ios` cannot run on Windows at all.
`npx expo run:android` hits a long-known Windows path-length failure in `react-native-screens` (a hard
dependency of `expo-router`): *"Filename longer than 260 characters"* on the second build, from the
NDK's CMake/Ninja toolchain.

**Status correction:** this is **known and worked around**, not unresolved. The upstream Expo issue
(expo/expo#36274) was **closed as completed on 2026-06-09** with a fix multiple users independently
confirmed: **[V]**

**1. Enable Windows long paths.** The default path ceiling is 260 characters; a pnpm monorepo plus an
Expo prebuild nests deeper than that. **Open PowerShell as Administrator** — press the Windows key,
type `powershell`, then press **Ctrl+Shift+Enter**; the title bar must say
`Administrator: Windows PowerShell`. Then run Microsoft's own published command, copied exactly:

```powershell
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
```

Read it back:

```powershell
(Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem").LongPathsEnabled
```

**Pass:** it prints `1`.

Tell git the same thing (still elevated):

```powershell
git config --system core.longpaths true
```

**Then reboot. Not optional.** Microsoft: *"In order for all apps on the system to recognize the
value, a reboot might be required because some processes may have started before the key was set."*
**[V]** The value is cached per process on its first file call and is never reloaded, so every
already-running process — your shells, VS Code, any node daemon — keeps the old 260-character limit
until you restart.

> **What this does and does not do [V]:** it lifts MAX_PATH only for applications that declare
> themselves long-path aware in their manifest. Node.js and Git for Windows do, which is why this
> fixes pnpm and EAS in a deep monorepo. It is **not** a blanket removal of the limit for every
> program on the machine. Requires Windows 10 version 1607 or later; Windows 11 qualifies.

**2.** Replace the bundled Ninja v1.10 at
`%LOCALAPPDATA%\Android\Sdk\cmake\3.22.1\bin\ninja.exe` with **v1.12+** from ninja-build's releases.

None of this touches the iOS path — iOS compiles happen on EAS's macOS machines, never on your
Windows box. **The advice "always build through EAS" stands on its own merits**, not on this bug.

Two more Windows notes:

- Expo's troubleshooting docs are written in `cmd.exe` syntax. In PowerShell, `%LOCALAPPDATA%` is
  `$env:LOCALAPPDATA`.
- `watchman watch-del-all` is a documented no-op on Windows. Skip it.

**You'll know it worked when:** every native compile in your history went through `eas build`.

**Cost:** $0. **Time:** 15 minutes for the Ninja swap, only if you ever want local Android builds.

---

### Step 1.11 — What you can and cannot do before the iPhone arrives

Be honest with yourself about this so you don't idle.

Two different gates get confused here, so separate them: **the Apple developer account** (Stage 0)
and **the iPhone**. They block different things.

**You CAN with no Apple hardware *and* no Apple account:** write all the code, run it in Expo Go on
Android, run the three smoke tests of step 1.2b, and build **Android** binaries via EAS. That is
steps 1.1 through 1.5.

**You CAN with no Apple hardware, once the account is ACTIVE:** build iOS binaries via EAS, upload
them to App Store Connect, and fill in every field of the store listing. **iOS builds are not
unblocked before the approval email** — `eas credentials`, `eas device:create` and
`eas build --platform ios` all need a live membership (see step 1.6). **[~]**

**You CANNOT, until the iPhone arrives:** see or touch the app on iOS. There is no substitute.
Building with `"simulator": true` produces a simulator `.app` — but running a simulator requires
macOS, so that path is a dead end for you. The only alternatives are a borrowed iPhone or a cloud
device farm, and **whether a device farm can install an ad-hoc/dev-client `.ipa`** (as opposed to only
TestFlight/production builds) is **[?] genuinely unknown** — it is listed as an open gap in
`docs/planning/2026-08-14-mobile-admin-app-rn-expo.md` §13. Settle it by asking BrowserStack support
directly before betting on it.

---

### Step 1.12 — Stop here until Stage 2B creates the app record

You now have a `.ipa`. **You cannot upload it yet.** `eas submit` uploads to an **existing** App Store
Connect app record and needs its numeric `ascAppId`. **[~]** *(Expo's docs assume the record exists
and only tell you where to read its Apple ID — they never explicitly say EAS won't create it. This is
a high-confidence inference, not a documented statement.)*

**Go do Stage 2B steps 2B.1–2B.3 now, then come back to step 1.13.**

**You'll know it worked when:** `eas.json`'s `submit.production.ios.ascAppId` holds a real numeric
Apple ID and no longer reads `"0000000000"` — that is the one placeholder step 1.7 deliberately left
behind, and 2B.1 is what fills it.

---

### Step 1.13 — Submit the build

> 🚨 **This upload proves the pipeline. It is not your App Store submission.** The binary you
> eventually submit for review must already contain 2A.1, 2A.4, 2A.6 **and** `expo-updates`
> (step 1.15) — none of which exist yet. Uploading now is correct and useful: it is how the build
> reaches your iPhone via TestFlight at step 1.14. Just do not click **Submit for Review** on it.
> Read the ordering callout at the top of **Stage 2** before you do.

**Do this** (after Stage 2B has given you the `ascAppId`):

```powershell
cd C:\Users\Aaron\Documents\Repos\RED-2.0\apps\mobile
```

```powershell
eas submit --platform ios --profile production --latest
```

`--latest` submits the most recent build without an interactive picker. This step runs identically on
Windows, Linux and macOS — Expo: *"EAS Submit works on macOS, Linux, and Windows, so you don't need a
Mac to ship iOS builds."* **[V]**

**Then Apple processes it.** The pipeline unpacks the `.ipa`, indexes asset catalogs, computes the
encryption disclosure, scans SDKs and privacy manifests, and generates TestFlight metadata.

> ⏳ **There is no published processing SLA.** Community reports range from ~10 minutes to several
> hours **[?]**. Do not plan an evening around a "15 minute" figure — Apple publishes no such number.

**You'll know it worked when:** the build appears under **TestFlight → Builds** in App Store Connect
with a valid status (not "Invalid Binary"), and you receive Apple's processing-complete email.

**If you get an email about a missing API declaration (`ITMS-91053`):** go to Stage 2A item 6 — the
privacy manifest loop.

**Cost:** $0. **Time:** 5 min + unknown processing.

---

### Step 1.14 — Install it on your iPhone via internal TestFlight

**Do this:**

1. In App Store Connect: **TestFlight** → **Internal Testing** → create a group → add yourself.
   Internal testers are *"up to 100 internal testers"* who must hold an App Store Connect role
   (Account Holder, Admin, App Manager, Developer, or Marketing). **[V]**
2. On the iPhone: install **TestFlight** from the App Store, sign in with the same Apple Account,
   accept the invite, install the build.

**Facts you can rely on:**

- **100 internal testers.** **[V]**
- *"Internal testers can download and test all builds for 90 days."* **[V]** — after that the build
  expires and testers lose access entirely, including local data.
- **External testing** (up to **10,000 testers**) is different and slower: *"To invite external
  testers, you'll first create a group in App Store Connect, add the builds you'd like them to test,
  and have your first build already approved by App Review for TestFlight. Your builds are
  automatically sent for review once they're added to a group."* **[V]** You do not need external
  testing.
- **Whether internal builds skip Beta App Review** is widely believed and consistent with Apple's
  external-only phrasing, but is **[~]** not stated as such on Apple's internal-testers page.

**If the build shows *Missing Compliance* and will not distribute even to you:** jump to step 2B.10.
It is an export-compliance metadata answer on the build, **not a rebuild** — answer it and the build
becomes installable.

**You'll know it worked when:** the app opens on your iPhone and you can log in with a real gym staff
account.

**Cost:** $0. **Time:** 20 minutes.

---

### Step 1.14a — Register your iPhone (needed ONLY for development/preview builds)

**This is NOT required for Stage 2.** The production build in step 1.9 is `distribution: store`; it
reaches your phone through TestFlight (step 1.14), which installs on any device signed into your
Apple Account with no registration. You only need `eas device:create` for the `development` and
`preview` profiles, which install the `.ipa` directly. **Do not let the 24–72 hour device-processing
wait delay your first production build.**

**Order matters here and it is not intuitive: an internal build only installs on devices that were
registered BEFORE it was created.**

**Do this, once the iPhone is in your hands:**

```powershell
cd C:\Users\Aaron\Documents\Repos\RED-2.0\apps\mobile
```

```powershell
eas device:create
```

Follow the prompts; EAS gives you a URL and a QR code. Open that URL **on the iPhone** and install the
registration profile.

> ⏳ **Expect a 24–72 hour wait on a brand-new membership.** Expo's own internal-distribution docs
> warn that on new or recently-renewed Apple Developer Program memberships, Apple takes 24–72 hours to
> finish processing a newly registered device, during which it cannot be added to provisioning
> profiles — *"the first build or re-sign that includes a new device may fail."* **[V]** Your
> membership will be days old. This is the expected path, not an edge case. If the build fails, just
> re-run it after the window.

**Also note:** ad hoc distribution is capped at **100 devices per year**. **[V]** Not a problem for
one phone, but every newly registered device forces a fresh iOS build, and the EAS free tier allows
only 15 iOS builds/month.

**You'll know it worked when:** `eas device:list` shows your iPhone.

**Cost:** $0. **Time:** 10 min of work + 24–72 hours of waiting.

---

### Step 1.14b — Developer Mode: when you need it, and how to never need it

**TestFlight does not require Developer Mode. Ever.** **[V]** Apple: *"The feature doesn't affect
ordinary installation techniques, such as buying apps from the App Store or participating in a
TestFlight team."* A TestFlight build installs and launches on your iPhone with no toggle, no reboot,
no cable, and no Mac.

**An EAS `development` or `preview` (internal-distribution) build DOES require it on iOS 16 and
later.** **[V]** Expo: these are *"internal distribution builds (including those built with EAS) or
local development builds"* and they will not launch until Developer Mode is on.

**Because you have no Mac, prefer TestFlight for on-device testing.** It costs you one extra upload
and removes the only step in this guide with a Mac-shaped dependency risk.

If you do install an internal-distribution build, enable Developer Mode like this:

1. **Install the EAS internal-distribution build on the iPhone first** (scan the QR code from
   `eas build`). Do not look for the toggle before this — it may not be there yet.
2. Tap the newly installed app icon once. iOS shows an alert saying Developer Mode is required.
   Dismiss it.
3. Open **Settings → Privacy & Security**, scroll to the bottom, tap **Developer Mode**.
4. Turn the switch on. An alert warns that Developer Mode reduces the security of your device. Tap
   **Restart**.
5. After the phone reboots and you unlock it, swipe up, tap **Enable** in the dialog, and enter your
   device passcode.

**You'll know it worked when:** Settings → Privacy & Security → Developer Mode shows the switch
green, a top-level **Developer** row appears in Settings (you need that menu for sandbox testing in
step 3C.9), and the EAS build launches to its first screen instead of showing the untrusted-developer
alert.

> **[~] If the Developer Mode row does not appear in Settings at all after item 2 above:** Apple's own
> documentation says *"Developer Mode only appears in Settings if you initiate pairing or if you
> previously paired the device to a Mac"*, while Expo documents that installing the build is enough.
> The two disagree and I could not settle which is true on your exact iOS version. **Do not chase
> it.** Abandon internal distribution and use TestFlight instead — it is exempt, and everything you
> wanted to test works there. What would settle it: install the internal build, then check whether the
> row appears; if it does, Expo is right for your build — note your iOS version here.

**Cost:** $0. **Time:** 10 minutes.

---

### Step 1.15 — The daily iteration loop, once the phone is in hand

**One-time, to get live JS reload on device:**

```powershell
cd C:\Users\Aaron\Documents\Repos\RED-2.0\apps\mobile
```

```powershell
npx expo install expo-dev-client
```

```powershell
eas build --platform ios --profile development
```

Install that build via the EAS link — then do step **1.14b** (Developer Mode), or it will not launch.
From then on:

```powershell
npx expo start
```

...and the dev build connects for live reload.

---

**For anything you can ship without a new binary.** Do these two in this order — the second command
does not reliably do the first one's job:

```powershell
npx expo install expo-updates
```

```powershell
eas update:configure
```

**You'll know it worked when:** `expo-updates` appears in `apps/mobile/package.json` dependencies,
and `apps/mobile/app.json` now contains both `updates.url` (an `https://u.expo.dev/...` URL) and a
`runtimeVersion` property. **Commit both.**

> **[~] Why the install is a separate step.** Expo's "Get started with EAS Update" page does not list
> an explicit install step, but Expo's own bare-project install page requires the library first, and
> `eas update:configure` is documented only as editing configuration — it *"will update your app.json
> file with the runtimeVersion and updates.url properties."* Whether your `eas-cli` version also
> installs the package is undocumented and version-dependent. `npx expo install expo-updates` is
> idempotent, so running it first is free insurance. What would settle it: run `eas update:configure`
> alone in a scratch project and check whether `expo-updates` lands in `package.json`.

Then publish:

```powershell
eas update --channel production --message "fix: corrige el texto del recibo" --environment production
```

> The `--environment` flag is **required** on SDK 55 and later. **[V]**

---

**What EAS Update can and cannot fix. Read this before you treat OTA as a safety net.**

An update reaches a binary only if **all three** are true: **[V]**

1. **The binary was built with `expo-updates` in it.** The library *is* the update client — Expo:
   *"the included native Android and iOS code is responsible for managing, fetching, parsing, and
   validating updates."* A build compiled without it has no client, never asks, and can never be
   reached.
2. **The runtimeVersion matches exactly.** Expo: *"The runtime version of the build and the target
   runtime version of an update must match exactly."* Not compatible, not greater-than — exactly.
3. **The build's channel is linked to the branch** you published to. *"A channel can be linked to any
   branch. By default, a channel is linked to a branch of the same name."*

> 🚨 **The step-1.9 production build predates all of this.** It was built before `expo-updates` was
> installed and before any channel existed, so **your first `eas update` reaches zero devices** —
> silently, with a success message. That is not a bug. **Install `expo-updates` and run
> `eas update:configure` BEFORE the build you actually submit to the App Store**, or accept that
> version 1.0 is un-OTA-able: not a typo, not a crash, not a wrong price. The only remedy for a
> shipped binary without the update client is a new binary and a new App Review cycle.

**The same trap applies to runtimeVersion.** Any change that alters native code — adding a native
module, bumping the Expo SDK, changing `ios.bundleIdentifier` — changes the fingerprint. Updates
published after that bump do not reach the older shipped binary. Only JavaScript-and-assets changes
are OTA-fixable.

**You'll know an update actually landed when:** you force-quit the app on your iPhone, reopen it
**twice**, and see your change. If nothing changes after two cold launches, one of the three
conditions above is false — check `eas update:list` for the update's runtimeVersion and compare it to
the build's runtimeVersion in `eas build:list`.

**What ships over the air, no App Review:** JavaScript logic, new screens built from existing native
components, copy, brand token values, new Supabase RPC calls from the existing client.

**What needs a new binary AND a new App Review:** any native module, an Expo SDK or RN bump, any new
permission string, icon or splash changes — **and**, since an April 2018 Apple policy change, any edit
to the Description, "What's New" text, Keywords, or Support URL on a live app. **[?]** Even a typo fix
in the store description goes through the review queue.

The `fingerprint` runtimeVersion policy from step 1.4 is what prevents an incompatible OTA update from
silently reaching an older binary: it *"automatically increments the runtime version whenever anything
that may impact the native runtime changes... making incompatible updates extremely unlikely."* **[V]**

---

# Stage 2 — Get the FREE app live on the App Store

Two parts. **2A is code you must write or you will be rejected.** **2B is forms.**

> 🚨 **The true order, because the stage numbering hides it.** The binary you submit must **already
> contain** 2A.1 (account deletion), 2A.4 (usage-description strings) and 2A.6 (privacy manifest).
> Those are compiled into the app. No App Store Connect form adds them, and no `eas update` adds them
> — 2A.4 and 2A.6 are `Info.plist` entries and 2A.1 needs a screen and an RPC.
>
> **The real sequence is: Stage 1 (pipeline) → Stage 1.5 (build the app) → Stage 2A (compliance code)
> → rebuild → Stage 2B (forms) → submit.**
>
> **Step 1.9's build is a smoke test of the pipeline, not your submission. Do not submit it.** Read all
> of 2A before you build the binary you intend to ship. A binary without in-app account deletion is a
> certain 5.1.1(v) rejection, and fixing it costs you a full loop: rebuild (1.9) → re-submit (1.13) →
> re-attach the build to the version (2B.4) → resubmit for review.
>
> **Two parts of Stage 2 you should legitimately do early**, because both have external latency:
> **Step 2B.1** (create the app record — `eas.json` cannot run `eas submit` until you paste its
> `ascAppId` back into the file) and **Step 2B.3's EU trader declaration** (verification takes days).
> Everything else in 2B is filled in against a finished binary.

---

## 2A — Things you must BUILD into the app, or be rejected

> ⛔ **Gate — read before you start 2A: 2A is not the app. 2A is the compliance punch list you bolt
> onto an app that already runs.**
>
> Every item below assumes six working React Native sectors on a real device. **That app does not
> exist yet, and Stage 1 does not produce it** — Stage 1 produces a shell that compiles, installs and
> launches. `docs/planning/2026-08-14-mobile-admin-app-rn-expo.md` §4 prices the app itself at
> **44–60 solo-dev days, of which 15–20 is foundation before the first sector screen exists** **[~]**.
> That is Stage 1.5 in The Map.
>
> **Build the sectors in the anchor doc's order, easiest first, so you get velocity feedback early:**
>
> **inicio → clientes → asistencia → agenda → vender → cuenta last.** **[~]**
>
> `cuenta` is the long pole at **7–10 days** — 37 of the app's 56 server actions, 11 sheets, a 17-call
> `Promise.all`, 5 drag-reorder lists, and an XLSX export that **cannot run on device** and stays a
> server endpoint the app opens or shares. `agenda` is *not* the hardest sector: there is no día/semana
> time grid anywhere in this app, so the classic RN calendar-grid pain does not apply. **[~]**
>
> **Do not start 2A until at least `inicio`, `clientes` and `cuenta` render on device.** 2A.1 needs a
> Cuenta screen to hang *Eliminar cuenta* off. 2A.3 is a copy audit of screens that must exist to be
> audited. 2B.8's screenshots must show the app *in use*. Run 2A first and you produce nothing you can
> ship.

Each item below has an acceptance criterion. Treat this as a checklist committed in the repo, and
re-walk the per-release items on every submission.

---

### 2A.1 — In-app account deletion (Guideline 5.1.1(v)) — the one unconditional trigger

**The rule, verbatim:** *"If your app supports account creation, you must also offer account deletion
within the app."* **[V]** Apple's support page adds: *"only offering to temporarily deactivate or
disable an account is insufficient."* **[V]**

There is **no B2B or organizational exception.** I searched specifically for "the account belongs to
an employer, not the individual" and found none.

**What to build:**

1. A visible **"Eliminar cuenta"** action inside Cuenta/Perfil. Apple: *"Make the account deletion
   option easy to find in your app. Typically, it's included in the app's account settings."* **[V]**
2. Re-authentication before it fires (password re-entry or an emailed code — Apple explicitly permits
   this).
3. A confirmation screen.
4. It deletes **the staff member's own Supabase Auth identity and personally identifying rows** — not
   the gym's operational data (`ventas`, `clientes`, `asistencias` belong to the gym tenant).
5. **A disclosure screen naming what is retained and why.** Apple: *"People expect that all data
   associated with their account will be deleted when the account is deleted... If local laws or
   regulations require that you maintain some data, let your users know."* **[V]** Retention is
   permitted only on a legal basis **and** only if you tell the user. A narrower delete with no notice
   is not compliant.
6. **The *Cerrar sesión* button that lives on this same screen must call
   `signOut({ scope: 'local' })`.** The signature is `signOut(options = { scope: 'global' })`, and the
   default terminates **every** session that user holds — so an operator tapping *Cerrar sesión* on
   the new iPhone logs the admin web app out at the front desk, mid-shift. **[V]** One word, and it
   is otherwise discovered in production by a gym. Same rule for the sign-out that follows a
   completed deletion.

**Deletion may be asynchronous.** Apple: *"If your process for account deletion is manual or otherwise
takes time to complete, this is acceptable. Inform the user how long it will take to delete the
account and provide a confirmation when the deletion has been completed."* **[V]** So a
`deletion_requests` row plus a cron purge within a stated window (say 30 days) plus an in-app
confirmation is fully compliant, and far cheaper than a synchronous cascading delete.

**Where the process may finish:** *"If people need to visit a website to finish deleting their account,
include a link directly to the page on your website where they can complete the process."* **[V]** But
*"Apps not operating in highly regulated industries should not require people to make a phone call,
send an email, or go through other support flows."* **[V]** A gym-ops app is not a regulated industry,
so no support-email path.

> **Open product question you must answer before building this [?]:** what happens when a gym's **last
> remaining admin account** deletes itself? The tenant becomes unadministrable. No Apple rule covers
> this — it's your product decision. Decide it now, not in the deletion RPC.

> 🚨 **This repo's machine-enforced gates fire on the deletion RPC. Budget for them.** (All three are
> documented in `AGENTS.md`.)
>
> 1. **`tools/guards/rpc-write-coverage.test.ts` fails `pnpm test`** — which is your pre-commit hook —
>    until the new write-bearing RPC appears in `supabase/tests/rpc-coverage.json` naming a suite. The
>    obligation set is *derived* by replaying `supabase/migrations/` and reading each surviving
>    function's body, so there is no flag to dodge it with.
> 2. **`tools/guards/denial-suite-drift.test.ts` fails** until that `.sql` suite is listed in
>    `run-denial-suite.mjs`'s `SUITE` (runs) or `QUARANTINE` (parked, with a reason). A new suite
>    cannot sit orphaned in `supabase/tests/`.
> 3. **Write the suite against the ROWS, not the return value.** An RPC's return value is not its
>    contract; the rows it writes are (#78, #80). Assert what the delete actually removes, what it
>    tombstones, which `gym_id` it is scoped to, and that the gym's operational rows (`ventas`,
>    `clientes`, `asistencias`) survive. The guard cannot check this for you — it is the human rule.
>
> Then, **before this fast-forwards to `main`**, run the suite green against a **scratch** project
> (the runner refuses the live ref):
>
> ```powershell
> $env:SUPABASE_TARGET_REF="<scratch-ref>"; $env:SUPABASE_ACCESS_TOKEN="<pat>"; pnpm test:denial
> ```

**You'll know it worked when:** on a real device, tapping Cuenta → Eliminar cuenta → confirm either
removes the account immediately or shows a stated window, and a confirmation arrives in-app when done.
No path requires leaving the app to *start* the process. **And:** `pnpm test` passes with the new RPC
named in `supabase/tests/rpc-coverage.json`, `pnpm test:denial` is green against a scratch ref, and
signing out on the phone leaves the desk browser still logged in.

**Cost:** one RPC + one screen + one SQL suite. **Time:** under a day for the app, plus half a day for
the suite and the scratch-project run.

---

### 2A.2 — A permanent App Review demo account on an isolated demo gym (Guideline 2.1)

**Guideline 2.1(a), verbatim — this is live guideline text, not a forum paraphrase [V]:**

> *"Make sure your app has been tested on-device for bugs and stability before you submit it, and
> include demo account info (and turn on your back-end service!) if your app includes a login. If you
> are unable to provide a demo account due to legal or security obligations, you may include a
> built-in demo mode in lieu of a demo account with prior approval by Apple. Ensure the demo mode
> exhibits your app's full features and functionality."*

**Read the sentence's antecedent, because it decides this for you.** Demo mode is not an option you
pick; it unlocks only *"if you are unable to provide a demo account **due to legal or security
obligations**."* **[V]** You have no such obligation — nothing legal or security-related stops you
seeding a demo gym. **The demo-mode door is closed to you at the "if", before approval is even
reached. [~]**

**And you do not need it.** The admin app's only sign-in is `signInWithPassword` (per
`docs/planning/2026-08-14-mobile-admin-app-rn-expo.md` §8), so a fixed email + password is exactly
what Apple asks for. The magic-link worry recorded in the 08-13 playbook §3.3(a) applies to the
**client** app, not this one. Supabase Auth issues email+password credentials alongside magic link;
the reviewer account uses the password rail.

> **[?] And if you ever did need demo mode:** *"prior approval by Apple"* is mandatory and Apple
> publishes **no documented channel for requesting it** — no App Store Connect Help page and no
> `developer.apple.com/contact` topic naming demo-mode approval could be found. What would settle it:
> either of those pages appearing, or a Resolution Center reply granting it. **Do not build a demo
> mode expecting to get it blessed at submission time.**

**What to build:**

1. A dedicated `gym_id` used **only** for App Review — never assigned to a paying gym. The repo's
   existing per-brand demo-twin pattern already does this.
2. A staff account on it with a **fixed email and fixed password** (e.g. `revisor@ibooki.lat`).
3. Realistic seeded data on **every reachable screen**: roster, an agenda window with sessions, sale
   history, an active membership, some `asistencia` history.
4. **Seed it in the PRODUCTION Supabase project the shipped binary points at** — not a scratch
   project, not local. This is the ordering error that produces a 2.1 rejection on a first submission.
5. Exclude the demo gym and reviewer account from every cleanup/reset script. **Treat it as a
   permanent fixture.** If the password is ever rotated or the gym deleted, a *future* update gets
   rejected on a broken login with no real defect in the code.
6. **No MFA and no device-bound second factor** on that account. A reviewer cannot pass one.
7. **The reviewer account is a member of exactly ONE gym.** Not two, not the demo gym plus a real one.
   See the callout below — this is not a style preference, it is what keeps the review note in 2B.9
   truthful.

> **Decide now [?]:** reviewers sometimes exercise a newly built account-deletion flow (2A.1) against
> the demo account. Either exempt that email from real deletion, or re-seed after each review. No Apple
> documentation addresses this; it's inferred from general community experience.

> 🚨 **Keep the reviewer single-gym, because a gym switcher would make the 2B.9 review note false.**
> 2B.9 tells Apple the gym is determined after login by the staff member's membership row. For a
> single-gym account that is true. For a multi-gym account it is **not yet true**, and shipping a
> picker before the migration lands would be telling a reviewer something the code does not do.
>
> **The mechanism** (`docs/planning/2026-08-14-mobile-admin-app-rn-expo.md` §6.2): **ten write RPCs
> derive the gym internally via `staff_gym()`, which is `order by gym_id limit 1`, and take no gym
> parameter** — `registrar_venta`, `create_class_session`, `edit_class_session`,
> `cancel_class_session`, `create_recurring_schedule`, `update_recurring_schedule`,
> `retire_recurring_schedule`, `ensure_week_materialized`, `crear_plantilla`,
> `sembrar_plantillas_default`. **A multi-gym operator's in-app gym picker is INERT for all ten** —
> every write lands on the lowest `gym_id` regardless of what the picker says. Mobile surfaces this
> harder than web, because there is no hostname to disambiguate. **[~]**
>
> **Before any gym switcher ships, on web or native:** add `p_gym_id` with an `is_staff_of` guard to
> those ten RPCs. It is a migration you can write today, independent of the port — and it carries the
> same 2A.1 gates (write-coverage entry + a suite asserting written rows + `pnpm test:denial` green on
> a scratch ref).
>
> **Also from §6.1:** `.in("role", ["owner","operator"])` in `gym.ts:55` is the only thing keeping a
> socio out of the operator UI. If the mobile data layer re-implements that filter instead of reusing
> it, a member can reach the admin app. Keep the check server-side at `/api/movil/v1/*`.

**You'll know it worked when:** you log into a fresh install with only the pasted credentials and see
non-empty content on every tab with zero extra setup, **and** `select gym_id from ...` for the reviewer
account returns exactly one row.

**Cost:** reuses existing seed tooling. **Time:** half a day.

---

### 2A.3 — Strip every in-app payment call-to-action

This is subtractive work and it is non-negotiable on the Mexico storefront.

**The two rules that bind, verbatim [V]:**

> **3.1.1(a)** — *"The entitlements are limited to use only in the iOS or iPadOS App Store in specific
> storefronts. In all other storefronts, except for the United States storefront, where this
> prohibition does not apply, apps and their metadata may not include buttons, external links, or
> other calls to action that direct customers to purchasing mechanisms other than in-app purchase."*
>
> **3.1.3 preamble** — *"Apps in this section cannot, within the app, encourage users to use a
> purchasing method other than in-app purchase, except for apps on the United States storefront and as
> set forth in 3.1.1(a) and 3.1.3(a). Developers can send communications outside of the app to their
> user base about purchasing methods other than in-app purchase."*

**Mexico is "all other storefronts."** This is a positive rule that binds by default, not an inference
from silence. There is no US-style entitlement for Mexico — Apple's own text says the US doesn't need
one, and the specific entitlement pages that exist cover other storefronts. **[V]**

**And the clause you actually ride, verbatim:** *"3.1.3(f) Free Stand-alone Apps: Free apps acting as
a stand-alone companion to a paid web based tool (i.e. VoIP, Cloud Storage, Email Services, Web
Hosting) do not need to use in-app purchase, provided there is no purchasing inside the app, or calls
to action for purchase outside of the app."* **[V]** *(Both repo research docs quote this clause
truncated at "in-app purchase" and drop the proviso. The proviso is the load-bearing half — it is the
whole reason 2A.3 exists.)*

**Name 3.1.3(f) in your App Review notes. Do not name 3.1.3(c).** Every condition of (f) is a property
of the binary you submit — free, companion to a paid web tool, no purchasing inside, no purchase CTA —
so the reviewer can confirm all four without knowing anything about how you sell. **[~]** 3.1.3(c)
Enterprise Services conditions its exemption on a claim about your *sales channel* (*"only sold
directly by you to organizations or groups for their employees or students"*) that no binary can
evidence, and it closes with *"Consumer, single user, or family sales must use in-app purchase."*
**[V]** iBookit sells self-serve on `ibooki.lat` to gyms that are sometimes one person. **Citing (c)
hands the reviewer a question you do not want asked.** (f) asks no such question.

> **Why this reverses the b2b-saas-verdict doc's hedge, and why (c) buys nothing [~]:** switching to
> (c) does **not** escape the proviso. The **3.1.3 preamble** imposes the identical restriction on
> *every* subsection, (c) included: *"Apps in this section cannot, within the app, encourage users to
> use a purchasing method other than in-app purchase…"* **[V]** — and 3.1.1(a) bars the same buttons
> and links on the Mexico storefront independently. Nor are (f)'s examples "consumer" ones: **Cloud
> Storage, Email Services and Web Hosting are paid B2B tools.** Three of the four named examples are
> sold to businesses.
>
> **(c) is the fallback, not the lead.** If a reviewer ever challenges (f), you may add (c) as
> supporting colour — the sales motion genuinely does match *"professional databases and classroom
> management tools"*. But do not open with it, and never make it the only clause you name.

**Do not "upgrade" this citation later.** 3.1.3(f) is the clause Apple itself applied when it reversed
the WordPress freeze in 2020 — *"since the developer removed the display of their service payment
options from the app, it is now a free stand-alone app and does not have to offer in-app purchases"*
**[?]** *(press-reported Apple statement, no Apple page found)* — and it is the shape the whole
vertical ships: Mindbody, Glofox Pro, PushPress Staff, Zen Planner Staff, Vagaro Pro, Fresha and
Zenoti all list free with no IAP block **[V]**.

**Mexico storefront — what the app and its metadata may contain:**

| | **(a) Free app, billing on ibooki.lat** (today — 3.1.3(f)) | **(b) After adding IAP** (Stage 3 — 3.1.1) |
|---|---|---|
| Sell the subscription inside the app | **No** — kills 3.1.3(f) outright **[V]** | **Yes, via StoreKit only** **[V]** |
| Show a price for the Apple (StoreKit) product | n/a — no such product exists | **Yes.** This is what IAP is for; nothing prohibits showing an IAP price **[~]** |
| Show `ibooki.lat`'s web price, anywhere in-app | **No** **[~]** — Apple's WordPress reversal turned on removing *"the display of their service payment options"* **[?]**; zero cost to comply | **No.** Adding IAP does not move Mexico into an entitlement storefront **[V]** |
| "Actualizar plan" / "Suscríbete" button | **No** **[V]** | **No**, if it points at the web. **Yes**, if it opens the StoreKit sheet **[V]** |
| Link to `ibooki.lat`'s checkout | **No** **[V]** | **No** **[V]** |
| "Contáctanos para suscribirte" | **No** — a call to action **[V]** | **No** **[V]** |
| Plain support contact with no purchase framing | **Yes** **[~]** | **Yes** **[~]** |
| Show the gym's own account state (activa / vencida) | **Yes** — status, not a purchase CTA **[~]** | **Yes** **[~]** |
| Price/plan copy in the App Store description or screenshots | **No** — 3.1.1(a) says *"apps **and their metadata**"* **[V]** | **No**, for web pricing **[V]** |
| Email / WhatsApp / SMS / desk signage about paying | **Yes, explicitly** **[V]** | **Yes, explicitly** **[V]** |

**So does adding IAP let you talk about pricing in the app? Only your Apple pricing.** It buys the
right to show and charge the **StoreKit** price. It buys **nothing** toward mentioning `ibooki.lat`'s
price or linking to its checkout — 3.1.1(a)'s prohibition is not conditioned on whether your app
offers IAP. **[~]**

> **[?] The one thing that would change column (b):** whether Mexico is one of the *"specific
> storefronts"* where a StoreKit External Purchase Link Entitlement is available. Apple's
> `/support/storekit-external-purchase-link/` returns 404 and the entitlement documentation pages
> render their region lists in JavaScript, so no list naming Mexico was obtained. **What settles it:**
> the allowed values of `com.apple.developer.storekit.external-purchase-link`. Until then, assume
> Mexico is not on it.

> ⚠️ **Adding IAP spends 3.1.3(f) permanently.** The clause reads *"…do not need to use in-app
> purchase, **provided there is no purchasing inside the app**…"* **[V]** The moment there is
> purchasing inside the app, you are in 3.1.1 and the exemption is gone. That is a clause-level
> one-way door, not an app-record one — Stage 3 is reversible in App Store Connect, but the argument
> you made to App Review is not reusable.

**Where renewal prompts DO belong:** email, WhatsApp, SMS and desk signage — *"Developers can send
communications outside of the app to their user base about purchasing methods other than in-app
purchase."* **[V]** Move the copy there; do not delete it from the product.

Run the sweep:

```powershell
Get-ChildItem -Recurse -Filter *.tsx C:\Users\Aaron\Documents\Repos\RED-2.0\apps\mobile\app, C:\Users\Aaron\Documents\Repos\RED-2.0\apps\mobile\src -ErrorAction SilentlyContinue | Select-String -Pattern 'precio|suscrib|plan|upgrade|pagar|actualizar'
```

*(Three things that command gets right and the obvious version does not: `Select-String` has **no**
`-Recurse` parameter — passing one dies with "A parameter cannot be found", so recursion has to come
from `Get-ChildItem`. The paths are the **source** folders, never `apps\mobile` itself, because
`-Recurse` there would walk `node_modules` and drown you in third-party matches. And
`-ErrorAction SilentlyContinue` is there because `src\` may not exist yet — without it the whole
command errors instead of sweeping `app\`.)*

**You'll know it worked when:** that command returns nothing tappable or promotional — a `plan` that is
part of `plan_id` in a data field is fine; a `<Pressable>` labelled *Actualizar plan* is not. Repeat the
same sweep by eye over your App Store Description, Keywords, Promotional Text and screenshots, because
3.1.1(a) binds metadata too.

**Cost:** $0. **Time:** a copy audit, 2 hours.

---

### 2A.4 — Permission usage-description strings, and check for ATT

**App Tracking Transparency (ATT)** *(the "Ask App Not to Track" prompt)* is **not required** for you
today. Apple's definition: *"Tracking refers to the act of linking user or device data collected from
your app with user or device data collected from other companies' apps, websites, or offline properties
for targeted advertising or advertising measurement purposes. Tracking also refers to sharing user or
device data with data brokers."* **[V]** iBookit has no ads, no data brokers, no cross-company sharing.

**This flips the moment** any bundled SDK (crash reporting, analytics, attribution) uses the IDFA or
shares data cross-app for ad measurement. **Audit every new third-party dependency for this on every
release**, not just at v1.

**For every OS permission you actually request**, write a specific Spanish sentence naming the exact
feature, via Expo's config plugins:

```json
"ios": {
  "infoPlist": {
    "NSCameraUsageDescription": "iBookit usa la cámara para escanear el código QR de check-in del socio."
  }
}
```

Generic placeholders get rejected.

**You'll know it worked when:** every `*UsageDescription` key in `app.json` has a specific, non-generic
Spanish sentence, and your release checklist has a line item confirming new dependencies were checked
for IDFA/cross-app sharing.

**Cost:** $0. **Time:** 30 min, recurring per release.

---

### 2A.5 — Push notifications, if you build them (Guideline 4.5.4)

**The rule, verbatim:** *"Push Notifications must not be required for the app to function, and should
not be used to send sensitive personal or confidential information. Push Notifications should not be
used for promotions or direct marketing purposes unless customers have explicitly opted in to receive
them via consent language displayed in your app's UI, and you provide a method in your app for a user
to opt out from receiving such messages."* **[V]**

**Reinforced by 5.1.2(i), verbatim:** *"Your app may not require users to enable system functionalities
(e.g. push notifications, location services, tracking) in order to access functionality, content, use
the app, or receive monetary or other compensation, including but not limited to gift cards and
codes."* **[V]**

**Concretely:**

1. Every core flow (check-in, sale, agenda) must work with notification permission **denied**.
2. Never put a member's balance, a medical note, or any confidential value in a push body or preview.
3. Any promotional push needs explicit in-app opt-in consent copy **and** an in-app opt-out.

**Configuration:** add the entitlement key `aps-environment` to `ios.entitlements` in the Expo app
config — **not** by clicking in Apple's portal. *"EAS Build automatically synchronizes capabilities on
the Apple Developer Console with your local entitlements configuration when you run eas build."* **[V]**
(Disable with `EXPO_NO_CAPABILITY_SYNC=1` if you ever need manual control.) EAS does **not** infer
capabilities from installed packages — installing `expo-notifications` does not add the entitlement for
you.

Then generate an APNs Auth Key via `eas credentials`. Token-based auth (a `.p8` key) is the modern
path and does not expire, unlike a certificate. **[~]**

**Note:** firing the OS permission prompt automatically at first launch with no explainer is **not
literally banned** by 4.5.4 — it's a Human Interface Guidelines best practice. Don't cite it as a hard
rule.

**You'll know it worked when:** a fresh install with notifications denied still allows a full
check-in / sell / schedule session, and a push preview never contains a member name plus balance.

**Cost:** $0 tooling. **Time:** medium — push-token table + RLS + register/unregister RPCs + an Edge
Function calling the Expo Push API.

---

### 2A.6 — Privacy manifest (`PrivacyInfo.xcprivacy`) — Expo does NOT fully automate this

**This contradicts a widely repeated claim.** Expo's own docs are explicit: Expo SDK packages ship
their own `PrivacyInfo.xcprivacy` files, **but** *"Apple does not correctly parse all the PrivacyInfo
files included by static CocoaPods dependencies (such as Expo SDK packages and other ecosystem
libraries)"*, so you must *"include the required reasons for the APIs used by those dependencies in
your app's PrivacyInfo.xcprivacy file or the configuration in the app.json."* **[V]**

**Do this:** declare Required Reason API usage in `app.json`:

```json
"ios": {
  "privacyManifests": {
    "NSPrivacyAccessedAPITypes": [
      {
        "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryUserDefaults",
        "NSPrivacyAccessedAPITypeReasons": ["CA92.1"]
      }
    ]
  }
}
```

**Which declarations iBookit's actual dependency tree needs (Expo SDK 57 + Supabase JS + AsyncStorage +
anything else) is [?] not knowable from documentation.** It is discovered empirically:

**The loop:** build → `eas submit` → wait for processing → if Apple emails an
`ITMS-91053: Missing API declaration` warning naming a specific API, add that reason code to
`app.json` and rebuild. **Budget at least one round trip.**

Separately: since 2025-02-12, a new app containing a commonly-used third-party SDK **cannot be
submitted** unless that SDK ships a privacy manifest. **[~]** Check each added dependency for
`node_modules/<package>/ios/PrivacyInfo.xcprivacy`.

**You'll know it worked when:** a build processes in App Store Connect with **no** ITMS-91053 warning
email.

**Cost:** $0. **Time:** one to two build round trips.

---

### 2A.7 — Sign in with Apple: not triggered, but know the trigger

**Guideline 4.8** only applies when the app uses *"a third-party or social login service... to set up
or authenticate the user's primary account."* **[V]** Two exemptions apply to you:

1. *"Your app exclusively uses your company's own account setup and sign-in systems."* **[V]** —
   Supabase Auth `signInWithPassword` is exactly this.
2. *"Your app is an education, enterprise, or business app that requires the user to sign in with an
   existing education or enterprise account."* **[V]**

**Sign in with Apple is not required.** The second exemption means that even if a gym later demands
Google Workspace SSO for its staff, 4.8 may still not bite. Re-open this only if you add a **consumer**
social login (Google/Facebook sign-in as a general option).

**You'll know it worked when:** no 4.8 item appears on your pre-submission checklist.

**Cost:** $0. **Time:** 0.

---

### 2A.8 — The 4.2 / 4.3 guidelines: which bite, and the one decision you owe

**Nothing in this section is a build item except the single open decision at the bottom.**

| Guideline | Why it does not bite you | Marker |
|---|---|---|
| **4.2 Minimum Functionality** — *"beyond a repackaged website"* | Satisfied structurally by a real React Native UI rendered through **Fabric** *(React Native's renderer: it draws real UIKit views, so there is no web page on screen anywhere)*. The January-2026 forum rejection of a Capacitor booking app — the closest precedent anyone found — turned on the core transaction running through a web platform. Not your architecture any more. | **[~]** |
| **4.2.6 Template apps** | Blesses your design by name: *"Another acceptable option for template providers is to create a single binary to host all client content in an aggregated or 'picker' model."* | **[V]** |
| **4.3(a)** — no per-client bundle IDs | You ship one binary, so it never engages. Amended **2026-06-08** (*"clarifies the basis for the guideline and adds an example"*); the added rationale — *"This practice results in unnecessary apps, which makes it hard for users to find the apps they want"* — strengthens the one-binary decision. *(The 08-14 anchor doc implies no 2026 change here. It changed.)* | **[V]** |
| **4.3(b)** — indistinguishable apps | *"Don't submit apps that are indistinguishable from what's already widely available."* The named saturated categories (dating, flashlight, sound effects, wallpaper, simple timers, fortune telling) are illustrative, not closed. Low risk because you are a credentialed B2B tool with a real backend — **not** because gyms are absent from that list. | **[V]** |
| **5.1.1(ix)** — legal entity required | Applies **only** to highly regulated fields: banking, healthcare, gambling, cannabis, air travel, crypto. A gym-ops tool is none. **Persona física enrollment is fine.** | **[V]** |
| **4.2.7(e)** — *"thin clients for cloud-based apps"* | **Mis-scoped in this repo's research docs. See the correction below.** | **[V]** |

**The one decision you owe [?]:** whether *credential-gated* tenant selection (no visible pre-login gym
picker) satisfies 4.2.6 as cleanly as Apple's literal browsable-directory example. No primary source
resolves it. A cheap hedge exists — one pre-login screen listing or searching gyms by name. Risk reads
low: a 100% staff-credential-gated B2B tool is closer to Slack's model than to a public directory.
**Write your choice down rather than defaulting into it silently.**

> **4.2.7(e) does not apply to you, and the research docs mis-scoped it. [V]** The
> `docs/Context/2026-08-13-apple-b2b-saas-verdict.md` doc quotes *"Thin clients for cloud-based apps
> are not appropriate for the App Store"* as a free-standing rule and rates the Capacitor plan against
> it. **It is not free-standing.** The parent rule is titled **4.2.7 Remote Desktop Clients** and
> opens: *"If your remote desktop app acts as a mirror of specific software or services rather than a
> generic mirror of the host device, it must comply with the following:"* — then (a)–(e). Every one of
> those conditions is about screen-mirroring a host machine on a LAN: (a) *"must only connect to a
> user-owned host device that is a personal computer or dedicated game console… connected on a local
> and LAN-based network"*; (b) *"fully executed on the host device, rendered on the screen of the host
> device"*. **[V]**
>
> A native React Native app that calls `/api/movil/v1/*` over HTTPS mirrors no host device and streams
> no remote screen. **4.2.7 never engages.** **[~]**
>
> **The real 4.2 risk was never 4.2.7 — it is the preamble and 4.2.2**, and it is why this app is
> being rebuilt native rather than wrapped: *"Your app should include features, content, and UI that
> elevate it beyond a repackaged website"* and *"Other than catalogs, apps shouldn't primarily be
> marketing materials, advertisements, web clippings, content aggregators, or a collection of
> links."* **[V]** Cite those if you ever have to argue 4.2. **Never cite 4.2.7.**

**You'll know it worked when:** your pre-submission checklist has exactly one line item from this
section — the 4.2.6 credential-gating decision, written down with a chosen answer.

---

## 2B — App Store Connect, field by field

**Prerequisite:** step 1.6 must have run at least once, so your Bundle ID is registered as an App ID.
The New App dialog's Bundle ID field is a **dropdown** populated only from registered App IDs — you
cannot type a fresh string. **[V]**

---

### Step 2B.1 — Create the app record

**Do this:**

1. `https://appstoreconnect.apple.com` → **Apps** → the **+** button → **New App**.
2. Fill:

| Field | What to enter | Permanent? |
|---|---|---|
| **Platforms** | Check **iOS**. The options are iOS, macOS, tvOS, visionOS. **There is no iPadOS checkbox** — iPad is part of iOS. **[V]** Whether Apple demands iPad screenshots is decided by `expo.ios.supportsTablet` in `app.json` (you set it to `false` in step 1.4). | — |
| **Name** | `iBookit` — 2 to 30 characters, globally unique across the App Store **[V]**. **This is the name on every client gym's Home Screen, not yours to white-label** — see the callout at step 1.4. It must match `expo.name` in `app.json` or the listing and the installed app disagree. | No — editable until submission |
| **Primary Language** | See the warning below | Effectively yes |
| **Bundle ID** | Select `com.ibookit.admin` from the dropdown | **Until first build upload** — see below |
| **SKU** | `ibookit-admin-ios`. An internal-only string, never shown to customers, unrelated to pricing. Letters, numbers, hyphens, periods, underscores; cannot start with a hyphen/period/underscore | **YES — locked the moment you click Create** **[V]** |
| **User Access** | **Full Access** | No |

**Required role:** Account Holder, App Manager, or Admin. **[V]** As a solo developer you are the
Account Holder.

> **One binary, one name, one icon — by design and by rule.** Tenant resolves from membership rows
> after login, never from the build. That is the shape 4.2.6 names as acceptable (*"a single binary to
> host all client content in an aggregated or 'picker' model"* **[V]**) and the opposite of the
> per-gym-build shape 4.3(a) rejects. **Do not create a second app record for a second gym.**

> **Bundle ID permanence, corrected.** Apple says of Bundle ID: *"You can't change this property after
> you upload a build."* **[V]** Creating the record does **not** lock it. There is a real window
> between creating the record and uploading your first build in which a typo'd Bundle ID can still be
> fixed. **SKU, by contrast, genuinely locks at Create:** *"You can't change the SKU after you add the
> app to your account."* **[V]**

> ⚠️ **Primary Language is not a throwaway dropdown.** Choosing **Spanish (Mexico)** means every field
> below is written in Spanish and the product page renders in Spanish everywhere. Adding English later
> requires a **separate localization** with its own Description, Keywords, Subtitle **and its own
> complete screenshot set**. **Recommendation: Spanish (Mexico).** Your customers are Mexican gym
> owners; a Spanish-only listing is coherent, and one localization is a fraction of the work.

**Then grab the number you need for `eas.json`:** **Apps → iBookit → App Store tab → App Information
(under General)**. Apple's own wording, per Expo's docs: *"Your ascAppId is listed under General
Information as Apple ID."* **[V]** Copy that number into `eas.json`'s `submit.production.ios.ascAppId`.

**You'll know it worked when:** the app appears under Apps in "Prepare for Submission" status, and App
Information shows a numeric Apple ID you have pasted into `eas.json`.

**Cost:** $0. **Time:** 10 minutes.

---

### Step 2B.2 — App Information (set once, at the app level)

**Do this:** left sidebar → **General** → **App Information**.

| Field | What to enter | Notes |
|---|---|---|
| **Subtitle** | e.g. `Gestión diaria de tu gimnasio` (29 chars) — max **30 characters** **[V]** | Optional but recommended; shows under the app name. **Whatever words you put here are indexed separately, so do not repeat them in Keywords** — see step 2B.7 |
| **Privacy Policy URL** | `https://ibooki.lat/privacy` | **MANDATORY for iOS.** *"Required for iOS and macOS apps."* **[V]** Must be a live page before submission |
| **Primary Category** | **Business** | Health & Fitness is the member-facing framing; this is a back-office tool |
| **Secondary Category** | Optional — leave blank | |
| **Content Rights** | Declare you have rights to all content | You do |
| **Age Rating** | See step 2B.5 | |
| **Copyright** | `2026 Aaron Talavera` — year + your legal name | Individual account = your name, not "iBookit" |
| **License Agreement** | Leave default | See below |

**On the EULA:** Apple applies a standard one automatically. App Store Connect Help: *"Apple provides a
standard end-user license agreement (EULA) that applies in all countries and regions. If you don't
provide a custom EULA, the standard EULA is applied to your app and the license agreement link isn't
shown on your App Store product page."* **[V]** Take the default for v1. *(A custom EULA becomes
relevant only in Stage 3 — Guideline 3.1.2(c) requires functional Terms of Use and Privacy Policy links
reachable from inside the app for subscriptions.)*

**You'll know it worked when:** no red "missing" indicators remain on App Information.

**Cost:** $0 (plus writing the privacy policy). **Time:** 20 min of forms.

---

### Step 2B.3 — Pricing and Availability, and the EU decision

**Do this:** sidebar → **Pricing and Availability** → **Price Schedule** → **Add Pricing** → select the
**Free** tier ($0.00).

**Because you never accept the Paid Apps Agreement, you need no banking information and no tax
forms.** Apple: *"In order to offer paid content on the App Store, your membership Account Holder will
need to accept the Paid Apps Agreement in the Tax and Banking section of App Store Connect. If the most
recent version of this agreement hasn't been accepted, you can only offer your app for free."* **[V]**
The storefront list spans **174 countries/regions and 43 currencies**. **[V]** Required role: Account
Holder, Admin, or App Manager. **[V]**

**Territory recommendation:** select **all territories except mainland China** (China requires an ICP
Filing Number and, for some categories, NPPA approval — irrelevant complexity for a Mexico-focused
tool). Territories are editable any time with no new build.

**Now the EU decision — and the earlier "just exclude the EU" advice was wrong.**

Since **2025-02-17**, distributing in the EU/EEA requires declaring **trader status** under the Digital
Services Act. Apps with **no declaration were removed from all 27 EU storefronts** — so silence is not
a neutral default, it's a removal.

**But the exposure is avoidable:**

- **A non-trader option exists.** Selecting *"This is not a trader account"* requires **no contact
  information at all** — but it also tells EU consumers that consumer-protection rights don't apply.
  **[V]**
- **For individuals, Apple accepts an *"Address or P.O. Box"*.** **[V]** Your home address never has to
  be published. Your phone and email are published.
- **Apple publishes its own trader test:** revenue from the app, commercial practices toward consumers,
  VAT registration, and whether the app was developed in connection with your trade/business/profession.
  **[V]** A commercial B2B gym product plainly meets it — so the honest answer is **yes, you are a
  trader.** *(Earlier research left this "unresolved"; it isn't.)*

**Recommendation:** go to **Business → Compliance** and **declare trader status with a P.O. Box.** It
costs you a P.O. Box and publishing a business phone and email. Do not exclude the EU by default — you
lose the market for no reason. Verification takes days, so start it before you submit.

> **Brazil [?]:** App Store Connect's status reference shows a "Missing Tax Form" status that can block
> distribution in Brazil. **Whether it applies to apps that never accepted the Paid Apps Agreement is
> unresolved** — no source settles it. Cheapest mitigation: exclude Brazil from v1's territory list at
> zero cost, and revisit if a Brazilian client ever appears.

**You'll know it worked when:** Pricing and Availability shows **Free** under Price Schedule, your
chosen territories under Availability, and no "Missing Tax Form" or "ICP Filing Number Missing" flags.

**Cost:** $0 (a P.O. Box costs a few hundred MXN/year if you take that route). **Time:** 20 min + days
for DSA verification.

---

### Step 2B.4 — Now upload the build

**Go back to Stage 1 step 1.13 and run `eas submit`.** You now have the `ascAppId` it needs.

When processing finishes, come back here.

**Then attach the build to the version — this step is invisible and blocks everything:**

1. Apps → iBookit → the **iOS App** version (left sidebar, under the version number).
2. Scroll to the **Build** section.
3. Click **+** / **Add Build** and select the processed build.

**Without this, "Submit for Review" stays greyed out and there is no error text telling you why.**

**You'll know it worked when:** the version page's Build section shows your build with its version and
build number.

---

### Step 2B.5 — Age Rating

**Do this:** App Information → below **Age Ratings** → **Set Up Age Ratings** → walk the questionnaire.

**The current tiers are 4+, 9+, 13+, 16+, 18+**, replacing the old 4+/9+/12+/17+ system, with responses
required by **2026-01-31** — a deadline that has already passed, so any submission today must use them.
**[V]** *(Source: `developer.apple.com/news/?id=ks775ehf`.)*

Answer:

- **In-app controls / capabilities** — none apply
- **Violence, mature themes** — None
- **Gambling** (simulated gambling, contests, real gambling, loot boxes) — all No / None
- **Medical or wellness topics** — likely **None**, since this is scheduling and rosters, not health
  advice. **Answer this one deliberately**; a gym app is exactly where a careless "Frequent" would
  push your rating up.
- **Social media capability** (redistributing or amplifying user-generated content via a social feed) —
  **No.** iBookit has none.

> **Separate announcement, separate deadline.** The social-media capability questions, the new Social
> Media content descriptor, and their **September 2026** requirement come from a **different** Apple
> announcement (`developer.apple.com/news/?id=tlur8uvi`, published 2026-07-09), tied to Time Allowances
> in iOS 27 — **not** from the tier announcement above. **[V]** Answering YES to social media forces a
> **13+ minimum**. Answer No and stay at 4+.

**You'll know it worked when:** Age Ratings shows a rating (should be **4+**) instead of "not set", and
"Missing App Rating" disappears from the app's status.

**Cost:** $0. **Time:** 10 minutes.

---

### Step 2B.6 — App Privacy questionnaire (the "nutrition label")

**This is a hard submission blocker, separate from the privacy policy and separate from ATT.** Apple:
*"In order to submit new apps and app updates, you must provide information about your privacy
practices in App Store Connect."* **[V]**

**Do this:** Apps → iBookit → left sidebar → **App Privacy** → **Get Started**. *(App Privacy is its
own top-level sidebar item, not a section inside App Information — do not go hunting for it there.)*

Answers for iBookit **[~]** — verify each against what Supabase actually stores:

| Question | Answer |
|---|---|
| Do you collect data? | **Yes** |
| Data types | **Contact Info** (email, name, phone), **Identifiers** (user ID), **Usage Data** if you add analytics |
| Linked to the user's identity? | **Yes — Data Linked to You.** It's tied to an identifiable staff account |
| Used to track you? | **No.** Nothing is used for cross-app/cross-site advertising |
| Purpose | **App Functionality** (account creation, staff identification, service delivery) — **not** Third-Party Advertising |
| Privacy Policy URL | Same one from step 2B.2 |

**This covers bundled third-party SDKs too, not just your own code.** Any analytics or crash-reporting
SDK added later must be declared here as well.

**You'll know it worked when:** App Privacy shows a completed questionnaire with a green check and a
preview of what will render on the product page.

**Cost:** $0. **Time:** 25 minutes.

---

### Step 2B.7 — Version metadata: Description, Keywords, URLs

**Do this:** on the iOS App version page (still "Prepare for Submission").

| Field | Limit | Required? | Notes |
|---|---|---|---|
| **Description** | max **4,000 characters** **[V]** | Yes | What the app does for gym staff |
| **Keywords** | **100 characters total, shared across all keywords** **[V]** | Yes | Comma-separated, **no space after the comma** |
| **Promotional Text** | max **170 characters** **[V]** | No | **The only field editable without a new build/review after the app is live** |
| **What's New** | max 4,000 characters **[V]** | Required for every version **after** the first | |
| **Support URL** | — | **Yes** | Must resolve to a live page with a real contact channel |
| **Marketing URL** | — | No | e.g. `https://ibooki.lat` |

**The Keywords field is limited to 100 characters — characters, not bytes.** **[V]** Apple: *"Keywords
are limited to 100 characters total, with terms separated by commas and no spaces."* An Apple engineer
confirmed the same count for a 100-character **Thai** string in Developer Forums thread 705360; Thai is
3 bytes per character in UTF-8, so the limit cannot be bytes.

**This means accents are free.** `membresias` and `membresías` both cost 10 characters. **Spell Spanish
correctly.** Do not strip accents to "save space" — there is no space to save.

Rules that DO cost you:

1. Separate keywords with a comma and **no space after the comma**. `gimnasio, socios` wastes 1
   character versus `gimnasio,socios`.
2. Spaces are allowed only *inside* a multi-word phrase: `control de acceso` is one keyword worth 17
   characters.
3. Do not repeat any word already in your App Name or Subtitle — Apple indexes those fields separately.
4. Do not include the word `app`, a category name, plurals of a word you already used in singular, or
   `#`/`@`. **[V]** *(Apple lists all four as wasted characters.)*
5. The budget is shared across *all* keywords combined, not per keyword. Writing ten keywords assuming
   100 characters each is the classic first-timer mistake.

Paste this exactly into Keywords (99 of 100 characters):

```
socios,membresias,control,acceso,asistencia,pagos,clases,reservas,recepcion,negocio,cobros,crossfit
```

*(Write `membresías` and `recepción` with their accents — the count is identical.)*

> ⚠️ **Note what is NOT in that list: `gimnasio`.** The Subtitle recommended in step 2B.2 is
> `Gestión diaria de tu gimnasio`, and rule 3 above says do not repeat a word Apple already indexes
> from the Name or Subtitle. Spending 9 of your 100 characters re-declaring `gimnasio` buys nothing.
> **If you change the Subtitle, re-check this string against the new wording** — the two fields are
> written together or one of them is wasted.

**You'll know it worked when:** the character counter under the Keywords field reads `99/100` (or `1`
remaining) and the field border is not red, and Description and Support URL show no validation error.
If the counter reads more than 100, you left a space after a comma.

**Cost:** $0. **Time:** 45 minutes of writing.

---

### Step 2B.8 — Screenshots: exactly which sizes you owe

For an iPhone-only app you owe **one size and one size only: 6.9" iPhone.** **[V]**

| Tier | Portrait pixels | Do you owe it? |
|---|---|---|
| **6.9" iPhone** | **1290×2796** (also accepted: 1260×2736, 1320×2868) | **YES — the only required tier** |
| 6.5" iPhone | 1284×2778 | No — required only if you skip 6.9" |
| 6.3" iPhone | 1179×2556 or 1206×2622 | No — auto-scaled from what you uploaded |
| 6.1" iPhone | 1170×2532 / 1125×2436 / 1080×2340 | No — auto-scaled |
| 5.5" iPhone | 1242×2208 | No — auto-scaled |
| 4.7" iPhone | 750×1334 | No — auto-scaled. **This tier still exists**, it is just not required |
| 4" and 3.5" iPhone | 640×1136 / 640×960 | No — auto-scaled |
| Any iPad tier | — | No, **as long as `ios.supportsTablet` is `false`** in `app.json` |

**Why one size is enough.** Every smaller tier in Apple's table carries the note *"If not provided,
scaled screenshots for [the next larger] displays are used."* The chain is
**6.9" → 6.5" → {6.3", 6.1"} → 5.5" → 4.7" → 4" → 3.5"**. Upload the 6.9" set and Apple scales it down
the whole chain. **[V]** *(An earlier pass in this guide claimed the 4.7" tier no longer exists on
Apple's page. It does — iPhone SE 3rd/2nd gen, 8, 7, 6S, 6. It is simply not required. The operational
advice was right for the wrong reason.)*

**Why iPad is exempt.** Apple's rule is *"Required if app runs on iPad."* `ios.supportsTablet: false`
makes Expo emit `UIDeviceFamily = [1]` (iPhone only), so App Store Connect never shows you an iPad
screenshot slot. **[V]** If you later flip `supportsTablet` to `true` you immediately owe a 13" iPad
set (**2064×2752 or 2048×2732**), which does **not** scale up from smaller iPad sizes — do not flip it
casually.

**Hard limits on every image:** **[V]**

- Format: `.png`, `.jpg` or `.jpeg`.
- **No alpha channel and no transparency.** Apple: *"Images can't include alpha channels or
  transparencies."* An RGBA PNG is rejected at upload.
- 1 to 10 images. Upload at least 3; 10 is the ceiling.
- Exact pixel dimensions. There is no tolerance — 1289×2796 is rejected.

**App Previews (video) are OPTIONAL.** **[V]** You may add up to three, up to 30 seconds each.
Guideline 2.3.4: *"previews may only use video screen captures of the app itself."* **Skip them for
v1.0** — they cost you a screen recording you cannot easily make on Windows and they are not required
to submit.

**Where:** on the version page, per localization. If you later add a second language, you re-upload the
whole screenshot set for it.

**Editing window:** once the version status is "Waiting for Review", you can still edit *some*
metadata, but you **cannot upload or edit screenshots or previews.** Get them right before submitting.

**You'll know it worked when:** the media well shows a single tab labeled **6.9" Display** with your
images in it, no red "Required" badge anywhere on the page, and **no iPad tab present at all**.

---

### Step 2B.8a — Make 1290×2796 PNGs on Windows, with no Mac

Apple publishes exact pixel dimensions and rejects a file that misses them **[V]**. That the upload
carries no signal about which machine produced the file is an inference from the absence of any such
requirement, not an Apple statement — **[~]**. Either way the operational advice is the same: shoot on
your iPhone, resize on the PC.

**1. Capture on the phone.** Open the app on your iPhone and press **side button + volume up** together
for each screen you want. Take 5 to 8; you will keep 3 to 6.

**2. Get them onto the PC.** Plug the iPhone in with a USB cable, unlock it, tap **Trust** on the phone,
then in File Explorer open `This PC > Apple iPhone > Internal Storage > DCIM` and copy the PNGs into
`C:\shots\raw`.

**3. Install ImageMagick (free, one time).**

```powershell
winget install --id ImageMagick.ImageMagick -e
```

**4. Close and reopen PowerShell, then confirm it is on PATH.**

```powershell
magick -version
```

**You'll know it worked when:** the first line starts with `Version: ImageMagick 7.` If PowerShell says
the term `magick` is not recognized, you did not reopen the window.

**5. Make the output folder.**

```powershell
New-Item -ItemType Directory -Force C:/shots/out
```

**6. Convert every raw screenshot to the exact 6.9" size, with alpha stripped.**

```powershell
Get-ChildItem C:/shots/raw/*.png | ForEach-Object { magick $_.FullName -resize "1290x2796!" -background white -alpha remove -alpha off -strip ("C:/shots/out/" + $_.Name) }
```

What each flag does: `1290x2796!` forces the exact size (the `!` disables aspect preservation);
`-alpha remove -alpha off` flattens and deletes the alpha channel, which Apple bans; `-strip` drops
EXIF so your phone model and location are not published.

**7. Verify before you upload.**

```powershell
magick identify -format "%f %wx%h %[channels]\n" C:/shots/out/*.png
```

**You'll know it worked when:** every line reads `<name>.png 1290x2796 srgb`. If any line ends in
`srgba`, that file still has an alpha channel and will be rejected — rerun item 6 above on it.

**Is the stretch visible? No.** An iPhone 15/16 screenshot is 1179×2556; going to 1290×2796 scales X
by 1.09415 and Y by 1.09390 — a **0.02%** aspect change. An iPhone 16 Pro (1206×2622) is **0.31%**
off. The arithmetic is checkable **[V]**; "neither is perceptible" is my judgement about human
vision, not a sourced claim — **[~]**. Look at one output file before you upload ten.

**Exception — if your iPhone has a Home button** (SE 2nd/3rd gen, 8, 7): your screenshots are 750×1334,
which is 16:9. Force-resizing those would stretch faces and text by 21%. Use this instead, which fits
the shot inside the frame and pads the rest:

```powershell
Get-ChildItem C:/shots/raw/*.png | ForEach-Object { magick $_.FullName -resize 1290x2796 -background "#0B0B0C" -gravity center -extent 1290x2796 -alpha remove -alpha off -strip ("C:/shots/out/" + $_.Name) }
```

**No-install fallback** if you refuse ImageMagick: this prints the dimensions of what you have, using
only what ships with Windows PowerShell 5.1 —

```powershell
Add-Type -AssemblyName System.Drawing; Get-ChildItem C:/shots/raw/*.png | ForEach-Object { $i=[System.Drawing.Image]::FromFile($_.FullName); "$($_.Name) $($i.Width)x$($i.Height)"; $i.Dispose() }
```

— then set an exact 1290×2796 canvas in any editor that can (Photopea runs in the browser, free, no
install) and export as PNG with transparency off.

---

### Step 2B.8b — What the screenshots must actually SHOW

These are rejection rules, not style advice. **[V]**

1. **Show the app in use.** Guideline 2.3.3: *"Screenshots should show the app in use, and not merely
   the title art, login page, or splash screen."* **Do NOT make your first screenshot the login
   screen** — that is a standing rejection for gated B2B apps. Show the members list, a sale being
   registered, the class roster.
2. **Every name, phone number and amount on screen must be FAKE.** Guideline 2.3.9: *"you should
   display fictional account information instead of data from a real person."* Do not screenshot a
   real gym's socios. Log into the **seeded demo gym (2A.2)** before you shoot — which makes the demo
   seed a prerequisite for the *metadata*, not just for the review.
3. **4+ appropriate.** Guideline 2.3.8: metadata must *"adhere to a 4+ age rating even if your app is
   rated higher."*
4. **No other platforms.** Guideline 2.3.10: no Android imagery, no Google Play badges, no other
   marketplace names in the images.
5. **No pricing.** 3.1.1(a) binds *"apps **and their metadata**"* — see 2A.3.

**You'll know it worked when:** you can point at each uploaded screenshot and say which screen of the
app it is, and no real member name appears in any of them.

**Cost:** $0. **Time:** a day or two to produce good screenshots from the seeded demo gym.

---

### Step 2B.9 — App Review Information

**Do this:** on the version page, scroll to **App Review Information**.

1. **Sign-In Required** — toggle **ON**.
2. **Username** — `revisor@ibooki.lat` (from 2A.2)
3. **Password** — the fixed password
4. **Contact Information** — your real first name, last name, phone, email. Mandatory. This is who
   Apple contacts with questions.
5. **Notes** — paste something like:

   > Esta es una app de gestión interna para el personal de gimnasios. Un solo binario neutral sirve a
   > todos los gimnasios clientes; el gimnasio que administra cada empleado se determina después del
   > login por su registro de membresía, no por una compra dentro de la app ni por un selector previo
   > al login. La cuenta demo proporcionada pertenece a un gimnasio de demostración con personal,
   > clases y socios de muestra.
   >
   > Esta app es gratuita y funciona como complemento autónomo de una herramienta web de pago
   > (Directriz 3.1.3(f), Free Stand-alone Apps). No contiene compras dentro de la app ni llamadas a
   > la acción de compra de ningún tipo.

   **Lead with 3.1.3(f) and stop there.** Do not volunteer 3.1.3(c) in the opening note — see 2A.3:
   (c) conditions its exemption on your *sales channel* and closes with *"Consumer, single user, or
   family sales must use in-app purchase,"* which invites a question about your one-person gym
   customers that (f) never raises. Keep (c) in reserve for a Resolution Center reply if a reviewer
   challenges (f).

   **The tenant sentence above is only true because the reviewer account is single-gym (2A.2 item 7).**
   Ten write RPCs still derive the gym via `staff_gym()`'s `order by gym_id limit 1`. If you ever ship
   a gym switcher before the `p_gym_id` + `is_staff_of` migration lands, this note becomes a false
   statement to App Review — rewrite it then, or land the migration first.

6. **Attachment** — optional.

**You'll know it worked when:** no red "required field missing" indicator remains, **and** you have
personally logged into the demo account with the exact credentials you typed, confirming a reviewer can
too.

**Cost:** $0. **Time:** 15 minutes.

---

### Step 2B.10 — Export compliance

You already pre-answered this with `ios.config.usesNonExemptEncryption: false` in step 1.4. That sets
`ITSAppUsesNonExemptEncryption = NO` in the compiled app, which is correct and truthful because the app
uses only HTTPS/TLS to Supabase and implements no custom cryptography. Apple: *"Your app uses
encryption limited to that within the Apple operating system... No documentation required in App Store
Connect."* **[V]**

**This usually suppresses the per-upload question. It does not always.** Open Apple Developer Forums
threads from October 2025 document App Store Connect prompting for export compliance despite the key
being set to NO, with CryptoKit/CommonCrypto or a third-party SDK cited as triggers. **[?]**

**If the version page shows "Missing Compliance":** open the build in App Store Connect, answer *"Does
your app use encryption?"* → **Yes**, then select the **exempt** option (encryption limited to the
operating system's own). **This is a metadata answer, not a rebuild.**

> **This can bite you much earlier than submission.** A build showing *Missing Compliance* **will not
> distribute even to internal TestFlight testers** — so you can hit this at step 1.14, long before you
> reach Stage 2B. The fix is identical and it is still a metadata answer, not a rebuild: answer the
> compliance question on the build in App Store Connect and the TestFlight build becomes installable.

**Re-check this any time you add a new native dependency** — a payment or security SDK doing its own
non-standard crypto can silently flip you onto the non-exempt path.

**You'll know it worked when:** the version's compliance status shows resolved/exempt.

---

### Step 2B.11 — Pick a release option, then submit

**Do this:** on the version page, under **App Store Version Release**, choose one:

| Option | What it does |
|---|---|
| **Manually release this version** | **RECOMMENDED for v1.** Approval and going live become two separate deliberate acts |
| Automatically release this version | Goes live the instant App Review approves |
| Automatically release, no earlier than \<date\> | Scheduled |

**Phased Release is not on the table for v1.** Apple: it is *"available only when you submit a version
update."* **[V]** *(For updates later: a 7-day ramp of 1%/2%/5%/10%/20%/50%/100%, pausable with a
30-day total pause budget and no limit on the number of pauses. Users can bypass it —
*"Apps and app updates in phased release can be manually downloaded from the App Store by anyone at any
time."* **[V]**)*

Then click **Submit for Review**.

**You'll know it worked when:** status changes to **Waiting for Review** and a confirmation email
arrives.

---

### Step 2B.12 — The review states, and how long they take

Track status at Apps → iBookit → the **App Review** page (this is where messaging historically called
"Resolution Center" now lives).

| State | Meaning | What you can edit |
|---|---|---|
| **Waiting for Review** | Submitted, not started | Some metadata; **not** screenshots or previews |
| **In Review** | A human is looking | Nothing — only "remove from review" |
| **Pending Developer Release** | **Approved**, waiting for you | — |
| **Ready for Distribution** | Live | — |
| **Rejected / Metadata Rejected** | See 2C | Everything |

**How long:** Apple's own figure, verbatim: *"On average, 90% of submissions are reviewed in less than
24 hours."* **[V]** Community reports for **first-time new-app submissions** commonly run **2–5 days**,
sometimes longer **[?]**. There is no way to know in advance which governs your submission. Plan
against the community range.

**Expedited review** exists only for a critical bug fix in a live app or an event-tied app, via a
discretionary form. **Not a launch strategy.** **[V]**

---

## 2C — The rejection loop

**A rejection costs time, not money.** *(Apple's App Review page says nothing about fees, so
"resubmission is free" is true in practice but not something I can quote. **[~]**)*

**When you're rejected:**

1. You get an email and the status shows **Rejected** or **Metadata Rejected**, naming the specific
   guideline(s) not met.
2. Open the **App Review** page (or click "View App Review Issues & Messages" below the app name).
3. **Reply directly in that thread.** Ask questions, explain, push back with specifics. Reviewers do
   read it.
4. **If the fix is metadata only** (description, screenshots, review notes), fix it and resubmit — no
   new build needed.
5. **If the fix needs code**, run `eas build` then `eas submit`, attach the new build to the version
   (step 2B.4), and resubmit.
6. **There is no limit on resubmissions.**

**The formal appeal:** if you believe App Review misunderstood the app's concept or functionality, you
may file **exactly one** appeal per rejected submission to the App Review Board. Apple: *"Submit only
one appeal per submission that didn't pass review."* **[V]** Turnaround is commonly cited as 5–7
business days **[?] — community folklore, Apple publishes no figure.** Its decision is treated as
final.

**The three rejections most likely to hit iBookit, in order:**

| Likely rejection | Why | Fix |
|---|---|---|
| **2.1 — demo account** | The app is 100% login-gated and the reviewer couldn't get past the login | 2A.2. Verify the credentials work **and** that Supabase is reachable during review |
| **5.1.1(v) — no account deletion** | You shipped without it | 2A.1. This is the cheapest rejection to prevent and the most certain to bite |
| **2.3.3 — screenshots show only the login screen** | Gated B2B apps do this constantly | 2B.8. Capture post-login screens from the demo gym |

---

### Step 2C.1 — Release it

Once status is **Pending Developer Release**: version page → **Release This Version**.

It can take up to 24 hours to actually appear. Availability per territory flips from "Available on App
Release" to "Available".

**You'll know it worked when:** searching "iBookit" on the public App Store in Mexico finds it.

---

### Step 2C.2 — Updating after launch

| What changed | Path |
|---|---|
| JS logic, copy, new screens from existing components, brand tokens, calls to **new** RPCs | **`eas update`** — instant, no review |
| Renaming or removing an **existing** RPC parameter or return column | **Never, for at least one full release-and-rollout cycle** — see the rule below. This is a backend change no OTA update can save you from |
| Any native module, Expo SDK / RN bump, new permission string, icon or splash | **New binary + full App Review** |
| Description, "What's New", Keywords, or Support URL on a **live** app | **New binary submission + App Review** since an April 2018 policy change **[?]** — batch copy fixes with feature updates |

> 🚨 **A shipped binary permanently ends atomic deploys — and this repo has never had to think about
> that.** `apps/admin` and `@gym/data` deploy together on every push, so **no RPC has ever been
> versioned against a caller it cannot upgrade.** App Review latency, plus a phased rollout, plus users
> who simply never update, means **a shipped binary's call shapes stay live for weeks to months after
> `main` has moved on.**
>
> **The rule, from `docs/planning/2026-08-14-mobile-admin-app-rn-expo.md` §3: RPC changes stay additive
> and backward-compatible for at least one full release-and-rollout cycle. Never rename or remove a
> parameter or a return column that a shipped binary calls.** Add optional params with defaults, or a
> `_v2` name, and keep the old one alive until the old binary is dead.
>
> **This binds the SQL migrations, not just the TypeScript.** In a repo with 52 `public` functions, 31
> of them write-bearing, and a documented history of RPC-shape churn (#78's dropped column, #80, the
> #82.4 rename), the failure mode is concrete: you rename a parameter the week after launch, `pnpm
> test` and `pnpm test:denial` both stay green because they test the *new* shape, and every phone still
> on the old binary starts erroring on a call nothing in CI exercises.
>
> **Two week-1 decisions from that doc make this survivable, and both must exist from the first
> commit:**
>
> 1. **Version the mobile HTTP surface as `/api/movil/v1/`** — so a breaking change becomes `/v2` and
>    the old route keeps answering.
> 2. **Ship a minimum-app-version check** — so when you finally *do* need to break a shape, you can
>    force an upgrade instead of guessing who is still out there.
>
> Retrofitting either after the fact is much worse than starting with them.

For a new binary: bump `expo.version`, let EAS auto-increment the build number (this only works because
you set `appVersionSource: remote` + `autoIncrement: true` in step 1.5), create a New Version in App
Store Connect (Apps → iBookit → **+** next to iOS App), fill only what changed, attach the fresh build,
and Submit for Review. **Phased Release IS available for updates** — use it once you have real users.

---

# Stage 3 — Add a paid subscription bought inside the app

---

## 3A — The fork. Read this once, then proceed.

**There is a locked prior ruling in this repo** (`docs/Context/2026-08-13-apple-b2b-saas-verdict.md`,
2026-08-13, two deep-research runs): **ship the admin app free and bill gyms on the web, never
in-app.** You have asked for the in-app path anyway. Here is the honest fork, then the full path.

### What IAP costs

- **15% of gross revenue** under the Small Business Program (30% without it). **[V]**
- **The Paid Apps Agreement (Schedule 2)** — irreversible once accepted: *"Once you've accepted the
  terms of this agreement, you can't undo this action."* **[V]**
- **A W-8BEN** (the US tax form for a foreign individual), plus Mexico-specific fields: **Clave en el
  RFC, CURP, Cédula de Identificación Fiscal**. **[V]**
- **A bank account** titled in your exact legal name, in English characters. One account only — *"You
  may only receive payments at one bank"*, and *"Payments to multiple or split bank accounts aren't
  supported."* **[V]**
- **6–16 solo-dev days** of engineering, plus **days-to-weeks** of Apple paperwork validation that
  blocks all of it.
- **Apple sits in the middle of the money.** You cannot veto a refund. Apple decides. **[V]**
- **Payouts arrive 45 days after the last day of the fiscal month**, and only once you clear a **40 USD
  minimum threshold** (Mexico is not on Apple's low-threshold table, so the universal default
  applies). **[V]**

### What IAP buys

Exactly one thing, and it is real: **the right to sell inside the app, and to show the APPLE price
in-app.** Once the subscription IS an in-app purchase, you can show a paywall, show that product's
localized price, run a free trial, and promote it. Today, on the Mexico storefront, you can do none of
that (2A.3).

> ⚠️ **Read that narrowly — 2A.3's table is the binding version.** IAP buys the right to display and
> charge the **StoreKit** price. It buys **nothing** toward mentioning `ibooki.lat`'s price or linking
> to its checkout: 3.1.1(a)'s prohibition on *"buttons, external links, or other calls to action that
> direct customers to purchasing mechanisms other than in-app purchase"* is not conditioned on whether
> your app offers IAP, and Mexico is not a US-storefront carve-out. **[V]** And adding IAP **spends
> 3.1.3(f) permanently** — that clause reads *"provided there is no purchasing inside the app"*, so the
> moment purchasing exists, the exemption you argued to App Review is gone. **[V]**

### What the three B2B walls do to a Mexican gym owner

1. **A subscription binds to one personal Apple ID with no transfer path.** Apple Community consensus
   across multiple threads: *"You can't transfer subscriptions from one Apple ID to another Apple ID.
   You have to cancel the existing subscription and then make a new subscription on the desired Apple
   ID."* **[?] — no Apple primary doc found.** When the gym owner who bought it leaves the gym, the
   gym's subscription leaves with their personal Apple ID.
2. **Apple does not invoice a business entity.** Apple's own help pages describe only *developer-side*
   documents. **No mechanism was found to issue a business invoice to the end customer carrying that
   customer's tax ID.** **[V, absence]**
3. **No confirmed CFDI process for a third-party in-app subscription in Mexico.** This is the one that
   sells or kills every deal. Apple **does** run a live CFDI pipeline via EDICOM for **AppleCare+**
   subscriptions in Mexico — you enter an RFC under Settings → Apple Account → Payment & Shipping → Tax
   Information, and *"you will receive an email from EDICOM with the CFDI, and for monthly and annual
   subscriptions, you will receive an email at each subscription renewal."* **[~]** **Whether that
   pipeline extends to a third-party app's in-app subscription is [?] not established either way.**
   Mexican gym owners deduct everything; without a CFDI this is a sales objection on every deal.

   > **Settle this before writing a line of Stage 3 code.** It is a one-hour test: on a Mexican Apple
   > ID, add your RFC under Settings → Apple Account → Payment & Shipping → Tax Information, buy **any
   > third-party app's** real in-app subscription, and watch for an EDICOM CFDI email. If it arrives,
   > wall 3 is gone. If it doesn't, you have your answer.

### The recommendation, in one line

**Ship free, bill on the web (Stage 3-alt) — 7 of 8 verified competitors in this exact vertical do
precisely that, and the CFDI wall is unresolved.** **[V]**

**Now here is the full IAP path anyway.**

---

## 3B — The paperwork

**Do these in order. Each one blocks the next.**

---

### Step 3B.1 — Sign the Paid Apps Agreement (Schedule 2)

**Do this:**

1. App Store Connect → **Business** (top of page) → **Agreements** tab.
2. Find the **Paid Apps** row.
3. Click **View and Agree to Terms**.
4. Complete 2FA if prompted.
5. **Download the PDF and open it in a real PDF reader before agreeing.**
6. Click **Agree**.

**Required role:** Account Holder only. No other role can sign. **[V]**

**Why this is the gate:** *"You won't be able to create a new app or In-App Purchase until you've
agreed to the most recent version of the Paid Apps Agreement."* **[V]** And banking can't be entered
first: *"Note that in order to add banking information, you'll first need to sign a Paid Apps
Agreement."* **[V]**

> 🚨 **Irreversible.** *"Once you've accepted the terms of this agreement, you can't undo this
> action."* **[V]**

> ⚠️ **The verbatim Schedule 2 text has never been read in any research pass on this repo** — the PDF
> resisted automated extraction three separate times. **[?]** The commission clause, refund-cost
> allocation, termination, and indemnification terms are all unverified. **Open it in a PDF reader and
> read it yourself before clicking Agree.** This is the contract that governs, not the marketing page.

**You'll know it worked when:** the Paid Apps row shows **Active**.

**Cost:** commits you to Apple's commission. **Time:** 30 min if you read it.

---

### Step 3B.2 — Tax information (W-8BEN + Mexico fields)

**Do this:** Business → **Agreements, Tax, and Banking** → **Tax** section → answer the guided
questionnaire.

**Which form:** **W-8BEN**, not W-8BEN-E. IRS: *"You must give Form W-8BEN to the withholding agent or
payer if you are a nonresident alien who is the beneficial owner of an amount subject to
withholding."* W-8BEN-E is for a foreign **entity**. **[V]** A *persona física* with no incorporated
entity is an individual.

**Fill:**

- Personal legal name
- Mexico address
- **Line 6a Foreign TIN:** use your **RFC**. **[~]** — the IRS's instructions do not name Mexico
  specifically. Mexico issues TINs, so the FTIN-exception box (6b) does not apply to you.
- **Part II treaty claim** — only if pursuing a reduced withholding rate. **[?] The applicable US–Mexico
  treaty article and rate for App Store distribution proceeds (royalty vs. business profits) was never
  resolved.** This is an accountant question, not a research question. Leave it or get advice.

**Then Apple's Mexico supplemental fields for tax-registered individuals:** **[V]**

- Clave en el RFC
- Clave Única de Registro de Población (CURP)
- Cédula de Identificación Fiscal

**What is locked and what isn't — this matters and is commonly reported backwards:**

| | Editable? |
|---|---|
| **The US tax form (W-8BEN)** | **NO.** *"Once you submit this information, you won't be able to make any changes in App Store Connect. For any corrections or additional tax forms, contact us."* **[V]** |
| **The Mexico fields (RFC / CURP / Cédula)** | **YES, any time.** *"You can update your Mexico tax information at any time in App Store Connect. Your changes will be reflected in the same month's earnings if the update is made before the end of the fiscal month, otherwise your status will be updated for the following month's earnings."* **[V]** |

**What Apple withholds:** *"Your earnings will be reduced by the VAT on Apple's commission, for which
you may be able to receive an input tax credit, and withholding income tax on your total monthly
worldwide sales before VAT... a VAT invoice on Apple's commission and withholding income tax statement
will be issued on a monthly basis."* **[V]**

> ⚠️ **[?] Unresolved and it matters:** whether that makes Apple a legally recognised SAT retention
> agent under Mexico's digital-platforms regime, or a private commercial arrangement. This determines
> whether you owe **additional** personal SAT filings on top. **Needs an accountant, not more
> research.** Apple never mentions e.firma or PFAE registration anywhere in this flow — but absence of
> mention is not proof of non-requirement.

**You'll know it worked when:** the Tax section shows an accepted W-8BEN on file and no red flags.

**Cost:** $0. **Time:** 45 min + Apple validation (days).

---

### Step 3B.3 — Banking

**Do this:** Business → Agreements, Tax, and Banking → **Bank Accounts** section → **Add Bank Account**.

**Required role:** Account Holder, **Admin, or Finance** — a wider set than the Account-Holder-only
signing rule. **[V]**

**Fields:** **[V]**

| Field | Note |
|---|---|
| Bank Territory | Mexico |
| Bank Code | routing/clearing number — the field name varies by country |
| Bank Account Number | English letters/numbers only, **include leading zeros**, do NOT put an IBAN here |
| **Account Holder Name** | *"must match exactly as it appears on your bank account, including punctuation."* Permitted characters: the 26 English letters, 10 digits, and only `, / ? - ) (` — so accented characters in your legal name must be transliterated |
| Account Holder Type | **Individual** |
| Holder Address | |
| Bank Account Type | Checking / Savings |
| Bank Account Currency | |

**One account only. No split payouts.** **[V]**

> **[?] Two things nobody confirmed:** whether Mexico's form literally labels a field **CLABE** (vs.
> folding it into the generic Bank Code field), and whether payouts land in **MXN** or convert from
> USD. **Settle both by opening this screen** — it only becomes visible after 3B.1.

**Payout mechanics:** payments arrive **within 45 days of the last day of the fiscal month**, one
consolidated payment per currency per month, once you exceed the **40 USD minimum threshold** (Mexico
falls to the universal default: *"All other bank countries or regions and bank account currencies must
exceed a minimum payment threshold of 40 USD"*). **[V]** Apple's bank converts at roughly spot on the
payment date; bank and intermediary fees may be deducted.

**You'll know it worked when:** the bank account shows verified/active and is selectable as payee.

**Cost:** $0. **Time:** 20 min + bank validation (days).

---

### Step 3B.4 — Enroll in the Small Business Program (15% instead of 30%)

**Do this:**

1. Go to `https://developer.apple.com/app-store/small-business-program/enroll/`
2. List all Associated Developer Accounts (accounts you own/control, or that own/control yours — for
   you, none).
3. Submit.

**Prerequisites:** Account Holder + Schedule 2 already accepted.

**A brand-new developer with $0 prior-year proceeds qualifies.** Apple: *"Existing developers who made
up to 1 million USD in proceeds in the prior calendar year for all their apps, as well as developers new
to the App Store, can qualify for the program."* **[V]**

**The rate is not immediate.** *"Fifteen (15) days after the end of the fiscal calendar month in which
your enrollment is approved. Example: If your enrollment is approved on February 10, 2022, your
proceeds are adjusted starting March 14, 2022."* **[V]** Enroll on day one.

**If you ever cross $1M:** *"the standard commission rate will apply to future sales"*, and *"If a
developer's proceeds fall below the 1 million USD threshold in a future calendar year, they can
re-qualify for the 15% commission the year after."* **[V]** Note the one-year lag — falling back under
in year Y earns 15% in year Y+1, not immediately.

**You'll know it worked when:** enrollment status shows Approved, and reports switch from 30/70 to
15/85 on the effective date.

**Cost:** saves 15 percentage points. **Time:** 10 min + approval.

---

### Step 3B.5 — Create the Subscription Group

**Do this:** Apps → iBookit → sidebar under **Monetization** → **Subscriptions** → the **+** button →
enter a **Reference Name** (internal only, up to 64 characters, editable any time, never shown to
users) → **Create**.

A group is *"a set of subscription products with varying levels and durations... up to 100
subscriptions per group"*, and *"Customers can only hold one active subscription per group at a
time."* **[V]** For a single gym-SaaS tier: one group, one subscription. Only add a second group for a
genuinely unrelated product.

**You'll know it worked when:** the group appears in the Subscriptions list.

---

### Step 3B.6 — Create the subscription product

**Do this:** click the group name → **Create** → fill:

- **Reference Name** — internal, ≤64 characters, editable any time without review **[V]**
- **Product ID** — **PERMANENT.** ≤100 characters; letters, numbers, hyphens, periods, underscores.
  Apple: *"the product ID isn't editable after you save the In-App Purchase, and once a product ID is
  assigned to an in-app purchase, it can't be reused for another In-App Purchase within the same app,
  even if you delete the original In-App Purchase with that ID."* **[V]**
  **Settle your naming convention before you type it once**, e.g. `com.ibookit.sub.gym.mensual` —
  the same reverse-DNS prefix as your Bundle ID (step 1.4), not a second one.

Then set:

**Subscription Duration** — 1 week / 1 month / 2 months / 3 months / 6 months / 1 year. **Locked once
submitted for review.**

**Subscription Prices** — this is where an earlier research pass got it wrong. The documented flow:

1. **Add Pricing** → **select a base country or region**. Apple: *"Select a base country or region.
   Apple uses this base to provide comparable prices on the other 174 storefronts."* **[V]**
2. **Select Mexico as the base.** That IS the "enter an MXN price" path — it is the primary documented
   route, not a workaround.
3. Pick the MXN price point → **Next**.
4. Apple auto-generates the other 174 storefronts from FX and local tax convention.

> **The picker looks broken and isn't.** *"Initially, the list displays 25 price points... To view more
> price points, scroll to the end of the menu and then click See Additional Prices."* **[V]** You can
> choose from **up to 800 price points by default**, with a request process for 100 higher ones. **[V]**

> **If you manually override an individual storefront**, Apple *"won't adjust your pricing on those
> storefronts in the future."* **[V]** Only override deliberately.

**Availability** — choose territories.

**Localizations** — at least one required. **Display Name: 2–30 characters. Description: max 45
characters.** **[V]** *(Both are settled on Apple's own reference page. Ignore any 75/255-byte figure
you find elsewhere — it's wrong.)* Localized text changes require review; the approved text keeps
displaying until the new text is approved.

**Family Sharing** — **leave it OFF.** Once enabled *"you can't turn it off."* **[V]** It shares with
the purchaser *plus up to five additional family members* (six seats) — a household mechanic with no
per-seat control, wrong for a business subscription. Role to enable: Account Holder or App Manager.

**Levels** — *"A ranking system of subscriptions within a subscription group that determines the
upgrade, downgrade, and crossgrade path... arrange them in order from the one that offers the most
(level 1) to the one that offers the least."* **[V]** A single product auto-defaults to one level.

**Upgrade/downgrade behaviour, automatic and not configurable:** **[V]**

- **Upgrade** — immediate, prorated refund of the old period, renewal date becomes the upgrade date
- **Downgrade** — takes effect at next renewal, no proration
- **Crossgrade** — same duration → immediate + prorated refund; different duration → next renewal

**You'll know it worked when:** the subscription shows status **Ready to Submit**.

---

### Step 3B.7 — Review screenshot and Tax Category

**Review screenshot:** under the subscription's Review Information, upload a screenshot showing the
actual paywall / purchase UI.

> 🚨 **This has its own size requirement: 640 × 920 pixels minimum.** **[V]** It is **not** the App
> Store marketing screenshot spec (1290×2796 etc.). Reusing a marketing screenshot here gets an
> incorrect-size rejection on upload. It is review-only and never appears on the Store. Once uploaded
> you can update it but not remove it.

**Tax Category:** app → Subscriptions → select the item → scroll to **Tax Category** → **Edit** →
choose. A **"Match to parent app"** option restores the app default. Changing it affects only future
transactions. Required role: **Admin, Marketing, or App Manager** (Account Holder is not on this list).
**[V]**

> **[?] Which named category fits a B2B SaaS subscription was never determined.** The mechanism is
> documented (default from the app, overridable per product); the concrete picker list is not. Settle
> it by reading `developer.apple.com/help/app-store-connect/manage-app-information/set-a-tax-category`
> or just by opening the picker.

---

### Step 3B.8 — Optional: a free trial

**Do this:** on the subscription's offer configuration, add an **Introductory Offer**, type = **Free
Trial**.

**Durations are a fixed picker:** 3 days, 1 week, 2 weeks, 1 month, 2 months, 3 months, 6 months, 1
year — available regardless of the base subscription's duration. **[V]**

*(The other two intro types are Pay Up Front and Pay As You Go — not what a free trial needs.)*

**The eligibility rule:** *"Each person is only eligible to redeem one introductory offer per
subscription group."* **[V]** A gym owner who took the free trial cannot take a second one under the
same Apple ID. For win-back later, use Promotional Offers or Offer Codes.

**Required role:** Account Holder, Admin, App Manager, or Marketing. **[V]**

---

### Step 3B.9 — Turn on Billing Grace Period

**Do this:** app → sidebar Subscriptions → **Billing Grace Period** → **Set Up Billing Grace Period**
→ choose **3, 16, or 28 days** — **take 16** unless you have a reason not to: 3 days is shorter than a
weekend plus a bank call, and 28 days gives a full extra month of service to a card that has already
failed → choose **All Renewals** or **Only Paid to Paid Renewals** → choose **Production and Sandbox
Environment** → Confirm.

**What it does:** a subscriber whose card declines at renewal keeps access while Apple silently
retries, instead of being cut off.

**Caveats:** **[V]**

- Weekly subscriptions cap the actual grace at 6 days even if you select 16 or 28.
- Does not apply to monthly subscriptions with a 12-month commitment.
- **"Configuration changes can take up to 24 hours to take effect and apply only to upcoming
  renewals."** Flip it on, test immediately, and you'll wrongly conclude it's broken.
- Your app must still check renewal info to know a subscriber is in grace.

**Required role:** Account Holder, Admin, or App Manager. **[V]**

**You'll know it worked when:** the Billing Grace Period panel reads **16 days**, **Production and
Sandbox**, and shows no "not configured" state.

---

### Step 3B.10 — Set the App Store Server Notification URLs

**Do this:** Apps → iBookit → sidebar under **General** → **App Information** → scroll to **General
Information** → **App Store Server Notifications**. Set **both**:

- **Production Server URL**
- **Sandbox Server URL**

> 🚨 **Set both, and understand the asymmetry.** *"If you do not provide a Sandbox URL... the App Store
> will automatically send notifications for both environments to the Production URL provided. If you
> only provide a Sandbox URL, no notifications will be sent in production."* **[V]** The second half is
> the dangerous one: wire sandbox first, forget production, and production fails silently.

Choose **Version 2** notifications.

**You'll know it worked when:** both fields show a saved `https://` URL and the version reads
**Version 2**. A blank Production URL is the failure this step exists to prevent — re-read the
callout above if only one is filled.

---

### Step 3B.11 — Submit the first subscription WITH a new app version

**The rule, verbatim:** *"Your first consumable In-App Purchase and your first non-consumable In-App
Purchase must each be submitted with a new app version. Similarly, your first auto-renewable
subscription and your first non-renewing subscription must each be submitted with a new app version.
Once the first item of each type has been approved, you can submit additional items of that type
without a new app version."* **[V]**

**Do this:** create a new app version in App Store Connect, include the subscription in that version's
submission, and submit both together.

**Required role:** Account Holder, Admin, or App Manager. **[V]**

**Also:** *"In-App Purchases and subscriptions aren't supported on Apple Watch. To submit an Apple Watch
app version, remove all in-app purchases and subscriptions from the submission."* **[V]**

**If the app version is rejected:** the subscription returns to **Ready to Submit**. Fix, rebuild,
resubmit both together.

**You'll know it worked when:** the subscription moves from Ready to Submit → Waiting for Review at the
same time as the app version, and both clear review together.

---

## 3C — The code

---

### Step 3C.1 — Pick the library: RevenueCat

**Install:**

```powershell
cd C:\Users\Aaron\Documents\Repos\RED-2.0\apps\mobile
```

```powershell
npx expo install react-native-purchases react-native-purchases-ui
```

**Why RevenueCat and not the alternative:** the alternative is **`expo-iap`** (an OpenIAP-spec library
that Expo's own in-app-purchases guide still recommends alongside RevenueCat **[V]**). Both give you
StoreKit 2 access. The difference is the **server half**: `expo-iap` leaves receipt verification,
entitlement computation, and App Store Server Notification ingestion entirely to you — you write the
JWS-verification server yourself. RevenueCat's managed backend does that ingestion, verification and
entitlement computation and exposes it as a REST API plus webhooks. **That is the whole argument, and
it's enough.**

> **Corrections to things you may read elsewhere:**
> - `react-native-iap` and `expo-iap` were **both archived on GitHub on 2026-08-04** (twelve days ago)
>   and moved to `github.com/hyodotdev/openiap`. **[V]** The **npm packages are unchanged and still
>   published** — you do not install from GitHub. This is not a reason to reject `expo-iap`.
> - `expo-iap` issue #128 ("appAccountToken returns null") is **CLOSED** and was opened **2025-07-31**.
>   **[V]** It is not evidence of a current defect.
> - Current version is **`react-native-purchases` 10.7.1**, published 2026-08-13. **[V]** Don't pin an
>   older number you read somewhere — just let `npx expo install` resolve it.

**Pricing:** *"Pay nothing for up to $2,500 in monthly tracked revenue"*, then *"1% of what you track
once you hit $2,500 in MTR."* **[V]** MTR is gross revenue **before** Apple's commission, so the
effective rate against what you actually keep is higher than 1%.

**No config plugin.** Do not add `plugins: ["react-native-purchases"]` — it autolinks like any other
native module. **[V]**

**You'll know it worked when:** `Purchases.configure({ apiKey })` runs without throwing in a dev build.

---

### Step 3C.2 — The 30-minute smoke test, before writing anything real

There is an **open, uncorroborated** GitHub issue — RevenueCat/react-native-purchases **#1712**, opened
2026-04-01 — reporting a launch crash on iOS 26 with React Native's New Architecture enabled (a
TurboModule registration crash on RN 0.83 / Expo SDK 55). It is **still open with no maintainer
comment**, from **one reporter**, on an **iOS 26 beta**, with **no duplicate reports in four months**,
while RevenueCat has shipped 10.4.4 through 10.7.1 since. **[V]**

**Expo SDK 57 makes New Architecture mandatory and non-disableable**, so this is worth 30 minutes — but
it is **not** a blocker and not a reason to pre-plan a library swap.

**Do this:** build a throwaway dev build with `react-native-purchases` installed, launch it on your
iPhone, confirm `Purchases.configure()` doesn't crash, and that `Purchases.getOfferings()` resolves.

**You'll know it worked when:** the app launches and logs offerings.

**Cost:** one EAS build. **Time:** 30 minutes.

---

### Step 3C.3 — Create the In-App Purchase Key

**Do this:**

1. App Store Connect → **Users and Access** → **Integrations** tab → **In-App Purchase**.
2. Generate a key. Download the `.p8` — **this downloads once only.**
3. Note the Key ID and Issuer ID.
4. In the RevenueCat dashboard → your app → **In-app purchase key configuration** → upload the `.p8`
   with its Key ID and Issuer ID.

**This is mandatory, not optional.** RevenueCat: *"This is a required configuration step. When using
Purchases v5.x+ (i.e., StoreKit 2), transactions will fail to be recorded without this key being set.
This can result in users not accessing the purchases they are entitled to."* **[V]** For the React
Native SDK the threshold is **8.0.0+** (you are on 10.7.1).

**This key is distinct** from the App Store Connect API key you made in step 1.7, and distinct from the
old app-specific shared secret.

> **There is no In-App Purchase entitlement.** Do not add `com.apple.developer.in-app-purchase` to
> `ios.entitlements`. Apple's own Developer Technical Support: *"There is no In-App Purchase
> entitlement... Additionally, implementing In-App Purchase doesn't require an In-App Purchase
> entitlement."* and *"The In-App Purchase capability appears enabled by default for an explicit App
> ID and disabled for a wildcard App ID."* **[V]** Your `com.ibookit.admin` is explicit. Nothing to do.

**You'll know it worked when:** RevenueCat's app settings show the In-App Purchase key as configured
(not "missing"), carrying the Key ID from item 3 — and the `.p8` is saved somewhere you can find it,
because like the key in step 1.7 it downloads exactly once.

---

### Step 3C.4 — Configure the RevenueCat dashboard

**None of the code below works until this exists.** In the RevenueCat dashboard, in this order:

1. **Products** — import or create products whose identifiers **exactly match** the App Store Connect
   Product IDs from step 3B.6.
2. **Entitlement** — create one with identifier `pro`.
3. **Offering** — create one, **and mark it CURRENT**. If it is not marked current,
   `offerings.current` is `null` and every purchase snippet below silently does nothing.
4. **Packages** — attach the products to the offering.
5. **Transfer behavior** — see step 3C.6. **Set this deliberately.**

**You'll know it worked when:** on a dev build, `(await Purchases.getOfferings()).current` is **not
`null`** and its `availablePackages` array is non-empty. A `null` here is the silent failure that
makes every purchase snippet in 3C.5 do nothing — it means no offering is marked **Current**, or no
package is attached.

---

### Step 3C.5 — Initialize, fetch, purchase, restore

> **This step covers the *purchase* leg only.** Buying is the rare event. **Knowing, on every cold
> launch, whether this gym is already subscribed is the common one — and it is a different read.**
> That is step 3C.5a, and skipping it ships an app that only knows a gym is paid up in the seconds
> right after it pays.

**Initialization**, at the app's top-level layout:

```ts
import { Platform } from 'react-native'
import Purchases, { LOG_LEVEL } from 'react-native-purchases'

Purchases.setLogLevel(LOG_LEVEL.VERBOSE)

if (Platform.OS === 'ios') {
  Purchases.configure({ apiKey: process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY! })
}
```

The **public SDK key is safe to ship in the binary**. The **secret REST API key is not** and must stay
server-side in the Edge Function. Put the public key in an `EXPO_PUBLIC_`-prefixed environment variable
or an EAS environment variable — never hardcode it in a committed file.

**Fetch and purchase:**

```ts
const offerings = await Purchases.getOfferings()
const pkg = offerings.current?.availablePackages[0]

if (pkg) {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg)
    if (customerInfo.entitlements.active['pro']) {
      // unlock
    }
  } catch (e: any) {
    if (!e.userCancelled) {
      // real error — show it
    }
  }
}
```

> **Always branch on `e.userCancelled`.** Every dismissed purchase sheet throws. Without this branch,
> every cancel surfaces as a false error to the user.

**Restore purchases — a must-have:**

```ts
try {
  const restored = await Purchases.restorePurchases()
  const active = restored.entitlements.active['pro']
} catch (e) {
  // show error
}
```

**Call this ONLY from an explicit "Restaurar compras" button.** It can trigger an OS-level Apple ID
sign-in prompt. For a silent programmatic restore (e.g. on login), use `Purchases.syncPurchases()`
instead, which does not prompt.

**Why it's a must-have:** Apple's subscriptions guidance lists *"A way for current subscribers to sign
in or restore purchases"* among the details that must be on the sign-up screen. **[V]** *(Guideline
3.1.1's own phrasing is softer — *"you should make sure you have a restore mechanism"* — and
RevenueCat's docs only recommend it. The subscriptions page is the hard requirement.)*

**Manage subscription:** also expose `Purchases.showManageSubscriptions()` so a user can reach
cancellation. Apple expects this path to exist.

**You do NOT call `finishTransaction`.** RevenueCat's SDK completes transactions automatically
(finished on iOS, acknowledged and consumed on Android). This is a genuine simplification over the DIY
libraries, where every unfinished transaction re-queues on each app launch.

---

### Step 3C.5a — Gate the UI: read the entitlement at boot and on resume

The purchase snippet above tells you the outcome of **one purchase**. It tells the app nothing on a
cold launch three weeks later. Without this step, an operator who force-quits the app and reopens it
is indistinguishable from an operator who never paid.

**First, settle which side is authoritative. Write it down and never blur it again:**

| | Authoritative for | Never used for |
|---|---|---|
| **The `gym_apple_subscriptions` row** written by the webhook (3C.7) | Every decision the server makes — what `/api/movil/v1/*` returns, what an RPC allows, what data leaves Supabase | — |
| **The device's `customerInfo`** from the RevenueCat SDK | Painting the UI immediately, and surviving a cold start with no network | Any server-side capability decision |

`customerInfo` is a **cache on a device you do not control**. RevenueCat states the caching plainly:
*"The SDK caches the user's subscription information to reduce your app's reliance on the network"*,
and *"The SDK will update the cache if it's older than 5 minutes, but only if you call
`getCustomerInfo()`, make a purchase, or restore purchases."* **[V]** Treat it as an optimistic hint.
**If the only thing standing between an unsubscribed gym and your data is a boolean in the client,
you do not have a paywall.**

**Do this — one hook, `apps/mobile/src/suscripcion/useSuscripcion.ts`:**

```ts
import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import Purchases, { type CustomerInfo } from 'react-native-purchases'

const ENTITLEMENT = 'pro' // must match the identifier you created in 3C.4

export function useSuscripcion() {
  const [activa, setActiva] = useState<boolean | null>(null) // null = still unknown

  useEffect(() => {
    let vivo = true
    const leer = (info: CustomerInfo) => {
      if (vivo) setActiva(!!info.entitlements.active[ENTITLEMENT])
    }

    // 1. Boot read. Throws when offline with no cache — keep the last known state.
    Purchases.getCustomerInfo().then(leer).catch(() => {})

    // 2. Live updates while the app is open (a renewal or an expiry landing mid-session).
    Purchases.addCustomerInfoUpdateListener(leer)

    // 3. Re-read on resume — the phone may have sat backgrounded past the renewal date.
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') Purchases.getCustomerInfo().then(leer).catch(() => {})
    })

    return () => {
      vivo = false
      Purchases.removeCustomerInfoUpdateListener(leer)
      sub.remove()
    }
  }, [])

  return activa
}
```

**Three things this code does deliberately:**

1. **`activa` starts as `null`, not `false`.** A paying gym must never see a paywall for the 300 ms
   before the first read returns. Render a spinner on `null`, the app on `true`, the paywall on
   `false` — three states, not two.
2. **The listener is removed on unmount.** `addCustomerInfoUpdateListener` has no auto-cleanup;
   mounting the hook twice without removing leaks a listener per mount. **[~]** *(Corroborated by the
   symmetric `removeCustomerInfoUpdateListener` in the SDK surface, not by an explicit Expo/RevenueCat
   warning. Cheap either way.)*
3. **Errors are swallowed, not surfaced.** A failed `getCustomerInfo()` at boot is almost always no
   network. Locking a gym out of its own front desk because the wifi dropped is a worse bug than the
   one you are preventing.

**Then gate the server, not just the screen.** The hook decides what a screen *renders*. It must not
decide what the API *returns*. In your `/api/movil/v1/*` handlers, read
`gym_apple_subscriptions.status` and `expires_at` for the resolved `gym_id` and refuse there. That
row is written by Apple → RevenueCat → your Edge Function and never by the phone.

> ⚠️ **Do not gate `pasar lista` or anything the gym needs to open its doors on a subscription
> boolean.** A billing-issue day should degrade to a nag banner, never to a locked front desk with
> members queuing. That is a product decision you make once, here, and Apple has no opinion on it —
> `gym_data_belongs_to_the_gym` does.

**You'll know it worked when:** you force-quit the app on a subscribed sandbox tester, turn on
Airplane Mode, reopen it, and the app renders as subscribed without a network call — then, back
online, you let the sandbox subscription expire (3C.9) and watch the UI flip **without you restarting
the app**, because the listener fired.

---

### Step 3C.6 — Link a purchase to a gym tenant

**The plan:** configure RevenueCat with the gym's Supabase `gym_id` (already a UUID) as the
`appUserID`:

```ts
Purchases.configure({
  apiKey: process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY!,
  appUserID: gymId,
})
// or, if gymId isn't known at boot:
await Purchases.logIn(gymId)
```

RevenueCat's webhook then carries `event.app_user_id` = your `gym_id`. **That is your primary link and
it is reliable.**

**The bonus mechanism, which you should NOT depend on:** RevenueCat's iOS SDK is widely reported to
auto-populate StoreKit 2's native `appAccountToken` from `appUserID` when that ID is a valid UUID v4,
giving you a second, Apple-native line of evidence in every JWS transaction payload.

> ⚠️ **[?] This is unverified.** RevenueCat's own primary migration documentation contains **nothing**
> about `appAccountToken`, App User ID, or UUID requirements. The claim is corroborated only by
> community threads. **Prove it before designing around it:** make one sandbox purchase, fetch the
> transaction via Get Transaction History V2, decode the JWS payload, and check whether
> `appAccountToken` equals the gym UUID. **Design the reconciliation path so it still works if this is
> false.**
>
> Either way: **always pass a real UUID**, never a slug or an integer. Apple only accepts a UUID v4 in
> that field, so a human-readable ID silently kills the mechanism.

> 🚨 **The multi-tenant landmine you must configure: RevenueCat's transfer behavior.** Because you call
> `Purchases.logIn(gymId)`, one Apple ID switching between gym UUIDs triggers RevenueCat's alias/transfer
> path. The dashboard forces a choice — **"Keep with original App User ID"** vs **"Transfer to new App
> User ID"**. The wrong pick either leaks one gym's entitlement to another or strands it. Decide this
> explicitly in the dashboard before your first real purchase.

> 🚨 **One Apple ID cannot hold two subscriptions to the same product.** Apple: *"Customers can only
> hold one active subscription per group at a time."* **[V]** An admin who runs two gyms **cannot buy
> the same product twice on one Apple ID** — the second purchase resolves as "already subscribed".
> **This breaks the one-subscription-per-gym model and you must answer it before writing code:**
> separate Product IDs per gym (doesn't scale), one subscription covering N gyms, or web billing for
> multi-gym operators. There is no fourth option.

---

### Step 3C.7 — The server: the table, the RLS, and the webhook Edge Function

This is the leg that decides who is actually paid up. Everything on the phone is a hint; this is the
record. Do it in three parts, in order: **the migration, the function, the deploy.**

---

#### 3C.7 part 1 — The migration

**Write `supabase/migrations/<timestamp>_gym_apple_subscriptions.sql`.** Follow the repo's existing
naming (`YYYYMMDDHHMMSS_slug.sql`) — read `supabase/migrations/` for the format and pick a timestamp
after the last file there.

```sql
-- Apple/RevenueCat entitlement, one row per GYM. The subscription belongs to the tenant,
-- never to the personal Apple ID that happened to tap Buy (3C.6).
create table if not exists public.gym_apple_subscriptions (
  gym_id                  uuid primary key references public.gym (id) on delete cascade,
  app_user_id             text not null,            -- RevenueCat App User ID == gym_id::text
  original_transaction_id text,                     -- Apple's stable per-subscription id
  product_id              text not null,
  status                  text not null
    check (status in ('active','grace_period','billing_retry','expired','revoked')),
  environment             text not null default 'PRODUCTION'
    check (environment in ('PRODUCTION','SANDBOX')),
  expires_at              timestamptz,
  last_event_type         text,
  last_event_id           text unique,              -- RevenueCat event id; the idempotency key
  last_event_at           timestamptz,
  updated_at              timestamptz not null default now()
);

alter table public.gym_apple_subscriptions enable row level security;

-- Staff of the gym may READ their own gym's row. Nobody may write from a client:
-- no INSERT/UPDATE/DELETE policy exists, so default-deny denies every client write.
-- The Edge Function writes with the service-role key, which bypasses RLS.
drop policy if exists "gym_apple_subscriptions_staff_select" on public.gym_apple_subscriptions;
create policy "gym_apple_subscriptions_staff_select" on public.gym_apple_subscriptions
  for select to authenticated using ((select public.is_staff_of(gym_id)));
```

**Four things in that SQL are repo-specific, not generic advice:**

1. **The table is `public.gym`, singular — not `gyms`.** `supabase/migrations/20260702150000_create_gym_tenant_spine.sql`
   creates `create table if not exists public.gym (id uuid primary key ...)`. A `references gyms(id)`
   fails at apply time. **[V]**
2. **`public.is_staff_of(uuid)` already exists** and already means what you want: it returns true when
   the caller holds an `owner` or `operator` `gym_membership` row for that gym. It is
   `security definer` and granted to `authenticated`. Do not write a new predicate. **[V]**
3. **`(select public.is_staff_of(gym_id))`** is the repo's policy idiom — every gym-scoped policy in
   `20260702173309_gym_scoped_rls_policies.sql` is written that way. Match it.
4. **No write policy is a decision, not an omission.** RLS is this repo's tenant boundary. The only
   writer is the Edge Function holding the service-role key. Add an `insert`/`update` policy here and
   you have handed a phone the ability to declare itself subscribed.

> ⚠️ **This is a migration-bearing change, so the repo's pre-merge convention applies (`AGENTS.md`):
> run `pnpm test:denial` green against a SCRATCH Supabase project before this fast-forwards to
> `main`.** The runner **refuses the live ref** by design.
>
> ```powershell
> $env:SUPABASE_TARGET_REF="<scratch-ref>"; $env:SUPABASE_ACCESS_TOKEN="<pat>"; pnpm test:denial
> ```
>
> The scratch project's ref and PAT live at `docs/db-testing-throwaway-project/`. **Trap:** the denial
> runner does **not** apply migrations to scratch for you — apply this migration to the scratch project
> first, or you will test the old schema and call it green.
>
> **Write a suite for it.** `supabase/tests/gym_apple_subscriptions_rls.sql`, asserting: gym A's staff
> can select gym A's row; gym A's staff select gym B's row and get **zero rows**; an `authenticated`
> caller's `insert` and `update` are both denied. Then add the filename to `SUITE` in
> `supabase/tests/run-denial-suite.mjs` — `tools/guards/denial-suite-drift.test.ts` fails `pnpm test`
> (and therefore the pre-commit hook) if a `.sql` file in `supabase/tests/` is in neither `SUITE` nor
> `QUARANTINE`.
>
> `tools/guards/rpc-write-coverage.test.ts` does **not** fire for this change — that guard covers
> write-bearing **RPCs**, and this migration adds a table and a policy, no function. It *will* fire the
> moment you add an RPC that writes this table. **[V]**

---

#### 3C.7 part 2 — The Edge Function

Create `supabase/functions/revenuecat-webhook/index.ts`, mirroring the existing `send-email` shape
(a thin Deno shell that verifies, writes, and maps outcomes to status codes).

**Turn on HMAC signing first — it is opt-in.** In the RevenueCat dashboard, on the webhook
integration, enable signing and copy the secret. RevenueCat: the signing secret is *"shown only once —
at creation or rotation — and cannot be retrieved later."* **[V]** Store it as a function secret,
never in the repo:

```powershell
npx -y supabase@latest secrets set REVENUECAT_WEBHOOK_SECRET=<el-secreto> --project-ref <ref>
```

**The function:**

```ts
// supabase/functions/revenuecat-webhook/index.ts
// DEPLOY with verify_jwt: false — RevenueCat sends no Supabase JWT. Integrity is the
// HMAC signature verified below, never a JWT.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const secret = Deno.env.get("REVENUECAT_WEBHOOK_SECRET") ?? "";
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, // bypasses RLS — this is the only writer
);

// RevenueCat event.type -> our status column. Anything unmapped is ignored, not guessed.
const ESTADO: Record<string, string> = {
  INITIAL_PURCHASE: "active",
  RENEWAL: "active",
  UNCANCELLATION: "active",
  PRODUCT_CHANGE: "active",
  CANCELLATION: "active", // auto-renew off; access runs to expires_at. NOT an immediate cutoff.
  BILLING_ISSUE: "billing_retry",
  SUBSCRIPTION_PAUSED: "expired",
  EXPIRATION: "expired",
  TRANSFER: "active",
};

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Length-independent, constant-time-ish string compare. Never use ===. */
function iguales(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method", { status: 405 });

  // 1. RAW body. Read it once, as text, BEFORE any JSON parsing. Re-serializing a parsed
  //    object changes the bytes and the signature will fail on perfectly valid requests.
  const raw = await req.text();

  // 2. Parse the signature header: t=<unix_seconds>,v1=<hmac_sha256_hex>
  const sig = req.headers.get("X-RevenueCat-Webhook-Signature") ?? "";
  const t = sig.match(/t=(\d+)/)?.[1];
  const v1 = sig.match(/v1=([a-f0-9]+)/)?.[1];
  if (!t || !v1) return new Response("bad signature", { status: 400 });

  // 3. Reject stale timestamps — this is what stops a captured request being replayed.
  //    `t` is in SECONDS. [~] Confirm the unit on your first real delivery by logging it:
  //    a 10-digit value is seconds, 13 digits is milliseconds.
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) {
    return new Response("stale", { status: 400 });
  }

  // 4. HMAC-SHA256 over "<timestamp>.<raw_body>" with the signing secret.
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${raw}`));
  if (!iguales(hex(mac), v1)) return new Response("bad signature", { status: 401 });

  // 5. ONLY NOW parse.
  const ev = JSON.parse(raw).event;
  const estado = ESTADO[ev.type];
  if (!estado) return new Response("ignored", { status: 200 }); // 200, or RevenueCat retries it 5x

  // 6. app_user_id IS the gym_id (3C.6). Refuse anything that is not a UUID rather than
  //    writing a row keyed on garbage.
  const gymId = String(ev.app_user_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(gymId)) return new Response("no gym", { status: 200 });

  const { error } = await supabase.from("gym_apple_subscriptions").upsert({
    gym_id: gymId,
    app_user_id: gymId,
    original_transaction_id: ev.original_transaction_id ?? null,
    product_id: ev.product_id,
    status: estado,
    environment: ev.environment ?? "PRODUCTION",
    expires_at: ev.expiration_at_ms ? new Date(ev.expiration_at_ms).toISOString() : null,
    last_event_type: ev.type,
    last_event_id: ev.id,
    last_event_at: new Date(ev.event_timestamp_ms ?? Date.now()).toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "gym_id" });

  // 7. 500 on a write failure so RevenueCat retries. 200 on success.
  if (error) return new Response("db", { status: 500 });
  return new Response("ok", { status: 200 });
});
```

**Why each guard is there, because these are the ones people skip:**

| Guard | What it stops |
|---|---|
| `await req.text()` before any parse | The most common false failure: signing a re-serialized body whose bytes differ from what was sent |
| Timestamp skew check | Replay of a captured `INITIAL_PURCHASE` — without it, one recorded request grants a free subscription forever |
| `iguales()`, not `===` | Timing-oracle recovery of the expected MAC, one byte at a time |
| Verify **before** `JSON.parse` | Parsing attacker-controlled JSON before you have decided you trust it |
| UUID shape check on `app_user_id` | A row keyed on whatever string a caller sent |
| `200` on unmapped event types | RevenueCat treats *"any other status code"* as a failure and retries 5 times **[V]** — a 404 on a `TEST` event costs you five retries |

> 🚨 **An unverified webhook endpoint that writes entitlement rows is a free subscription for anyone
> who finds the URL.** The URL is guessable (`<ref>.supabase.co/functions/v1/revenuecat-webhook`) and
> the function is deployed with JWT verification OFF. The HMAC *is* the entire access control. Do not
> ship the "Authorization header" variant alone — RevenueCat supports it (*"You can configure the
> authorization header used for webhook requests via the dashboard"* **[V]**) and it is a static
> bearer string with no replay protection and no body binding.

**Retry and timeout budget, verbatim:** RevenueCat expects *"200 status code. Any other status code
will be considered a failure"*, and *"will retry later (up to 5 times) with an increasing delay (5,
10, 20, 40, and 80 minutes). After 5 retries, we will stop sending notifications."* Responses must
complete **within 60 seconds**. **[V]** So: do the write, return, and never call another API inline.

**Sandbox events land on the same endpoint.** RevenueCat: *"When testing with sandbox purchases, the
`environment` value will be `SANDBOX`"*, and the same customer can hold both. **[V]** That is why
`environment` is a column — your gating query must require `environment = 'PRODUCTION'` in production,
or one sandbox tester subscribes a live gym for free.

**Handling refunds:** *"When a customer requests a refund for a subscription, their subscription is
canceled immediately with auto renew status set to false. If the refund request is approved, the
transaction will have a revocation date populated."* **[V]** Two nuances: the subscription stays
**active until its expiration date** (auto-renew off ≠ instant cutoff — which is why `CANCELLATION`
maps to `active` above, not `expired`), and Apple fires a `CONSUMPTION_REQUEST` notification inviting
you to submit consumption data it weighs in the decision. **You cannot veto a refund, but you should
answer `CONSUMPTION_REQUEST` rather than ignore it.**

---

#### 3C.7 part 3 — Deploy it, and get past this repo's pre-push hook

> 🚨 **Deploy with `--no-verify-jwt` or every webhook gets a 401.** Supabase Edge Functions reject
> unauthenticated POSTs by default, and neither RevenueCat nor Apple sends a Supabase JWT. Missing
> this costs you a full debugging session against a silent, retrying webhook.

```powershell
npx -y supabase@latest functions deploy revenuecat-webhook --project-ref hjppxawglmukfvsgmcog --no-verify-jwt
```

> 🚨 **The pre-push hook will block your push until you have deployed.** `AGENTS.md`: the hook
> *blocks any push whose range touches `supabase/functions/**`*, because **a `git push` deploys the
> Vercel apps but never Supabase edge functions** — live served a stale `send-email` v6 for exactly
> this reason on 2026-08-04. **Deploy first, then acknowledge:**
>
> ```powershell
> $env:EDGE_DEPLOY_OK="1"; git push
> ```
>
> Setting `EDGE_DEPLOY_OK=1` without having actually deployed is how you reproduce the v6 incident.

> **The webhook has no localhost.** RevenueCat POSTs to a public URL, so testing it means deploying to
> a real Supabase project — and this repo's Supabase MCP is bound to **LIVE**. **Deploy the first
> version to the SCRATCH project and point RevenueCat's *sandbox* webhook there**, so a malformed early
> handler can never write entitlement rows into live. The scratch ref and PAT are in
> `docs/db-testing-throwaway-project/`. Only move the sandbox webhook to live once a full
> purchase → renew → expire walk (3C.9) has landed clean rows.

**You'll know it worked when:** a sandbox purchase (3C.9) produces exactly one row in
`gym_apple_subscriptions` with `status = 'active'`, `environment = 'SANDBOX'`, `gym_id` equal to the
gym you logged in as, and `expires_at` a few minutes in the future — and the RevenueCat dashboard's
webhook log shows a **200**, not a retry.

---

### Step 3C.7a — Reconcile, because webhooks get lost

A webhook-only entitlement is a system whose correctness depends on five HTTP requests never all
failing. They will: RevenueCat gives up after 5 retries over ~155 minutes, and a Supabase deploy, a
schema error or a bad release inside that window silently drops the event forever. The symptom is a
gym that paid and is locked out, discovered by a phone call.

**Build one reconciliation read, server-side only:**

```ts
// Server-side ONLY. The SECRET key must never reach the binary.
const r = await fetch(`https://api.revenuecat.com/v1/subscribers/${gymId}`, {
  headers: { Authorization: `Bearer ${Deno.env.get("REVENUECAT_SECRET_KEY")!}` },
});
const { subscriber } = await r.json();
const pro = subscriber?.entitlements?.pro;
const activa = pro?.expires_date && new Date(pro.expires_date) > new Date();
```

`GET https://api.revenuecat.com/v1/subscribers/{app_user_id}` *"Gets the latest Customer Info for the
customer with the given App User ID, or creates a new customer if it doesn't exist."* **[V]** Because
`app_user_id` **is** the `gym_id` (3C.6), this is a direct "is this gym paid up, really?" query.

**Call it from exactly two places, and no others:**

1. **A nightly cron** over gyms whose `updated_at` is older than ~36 hours, repairing drift.
2. **A manual "Revalidar suscripción" button** in your own admin tooling, for the phone call.

> ⚠️ **Never call this from the app.** It needs the **secret** REST key, and *"or creates a new
> customer if it doesn't exist"* means a call with a typo'd ID silently manufactures a customer record.
> The public SDK key ships in the binary; the secret key stays in Edge Function secrets, in this repo's
> ignored env files, and nowhere else.

**Cost:** roughly half a day. **It is the difference between "a gym was locked out for two days" and
"a gym was locked out for a night".**

---

### Step 3C.8 — Optional second server surface: Apple's own notifications

Build this as an independent cross-check, or for the day you drop RevenueCat. It is meaningfully more
work: JWS verification, x5c certificate-chain validation against Apple's Root CA - G3, and a
notification-type state machine covering `SUBSCRIBED`, `DID_RENEW`, `EXPIRED`, `GRACE_PERIOD`,
`REFUND`, `REVOKE`, `DID_CHANGE_RENEWAL_STATUS`, `DID_FAIL_TO_RENEW`, `CONSUMPTION_REQUEST`.

Apple publishes an official Node library — `@apple/app-store-server-library`
(`github.com/apple/app-store-server-library-node`) — exporting `SignedDataVerifier` and
`AppStoreServerAPIClient`.

> ⚠️ **[?] Spike this before designing around it.** The library targets Node, and **nobody has
> confirmed it imports and runs inside a Supabase Edge Function** via Deno's `npm:` specifier — Deno's
> npm compatibility is broad but not universal, especially around native crypto. Test
> `import { SignedDataVerifier } from "npm:@apple/app-store-server-library"` in a throwaway Edge
> Function first. Fallback: hand-roll JWS/x5c verification with `jose`, which is Deno-friendly.

App Store Server API base URLs: `https://api.storekit.itunes.apple.com` (production) and
`https://api.storekit-sandbox.itunes.apple.com` (sandbox), authenticated with a JWT you self-sign using
the In-App Purchase Key's `.p8`. **[~]** *(Apple's own API doc page renders JavaScript-only and returns
nothing to a fetcher, so this is corroborated from client libraries rather than quoted.)*

---

### Step 3C.9 — Testing from Windows, with no Mac

**Xcode's local StoreKit Testing** (a `.storekit` config file, offline, instant renewals, in the iOS
Simulator) is **genuinely Mac-only.** There is no Windows equivalent. **[V]** Your loop is the real
Apple sandbox on a real iPhone.

**Do this:**

1. **Create sandbox testers:** App Store Connect → **Users and Access** → **Sandbox** tab → **+** (or
   "Create Test Accounts"). Enter first/last name, an email, a password, and an App Store territory
   (pick **Mexico**).
   - **Up to 10,000 sandbox accounts.** **[V]**
   - **Name, email and password CANNOT be edited after creation.** Territory can. **[V]**
   - *"The email address you use for a Sandbox account must not already be registered as an Apple
     Account"* — using one that is **will** cause errors during testing. **[V]**
   - Email `+` subaddressing is officially supported: `tucorreo+mx1@gmail.com`. **[V]**

2. **Set the renewal speed:** Users and Access → Sandbox → select the tester → choose **3 min / 5 min
   (default) / 30 min / 1 hour**. At the default: **[V]**

   | Real duration | Sandbox renews every |
   |---|---|
   | 1 week | 3 minutes |
   | 1 month | **5 minutes** |
   | 1 year | 1 hour |

   Plus, for a monthly product: **Billing Retry = 10 minutes**, **Billing Grace Period = 5 minutes.**
   Budget those two — a full renew → retry → grace → expire walk is what you actually need to observe.

   **The cap:** *"Subscriptions automatically renew up to 12 times before auto-renewal turns off on the
   thirteenth renewal attempt."* **[V]** That is **12 renewals total per subscription**, not a rolling
   daily cap.

3. **Sign in as the sandbox tester ON THE IPHONE — and do not sign out of your real Apple ID:**
   - **iOS 18+:** Settings → **Developer** → **Sandbox Apple Account**
   - **Older iOS:** Settings → App Store → **Sandbox Account**

   > 🚨 This is where beginners lose hours. **Never sign out of your primary Apple ID to do sandbox
   > testing.** It is a separate setting.

   > **If there is no `Developer` row in Settings at all**, that top-level row only appears once
   > Developer Mode is enabled — see **step 1.14b**, which also explains why TestFlight never needs it.

4. **Build a dev build and install it:**

   ```powershell
   eas build --platform ios --profile development
   ```

   Install via the EAS link. **A `development` build is `distribution: internal`, so the iPhone must
   already be registered — step 1.14a, and expect 24–72 hours on a new membership.** This is the one
   place in the whole guide where device registration is genuinely on the critical path, so do it
   before you need it.

5. **Run a purchase.** Watch the RevenueCat dashboard's **Sandbox** event feed and your Edge Function
   logs (`npx -y supabase@latest functions logs revenuecat-webhook --project-ref <ref>`, or the
   dashboard) to confirm the webhook landed. Then query the table and confirm the **row**, not just
   the log line — a 200 with no row is the failure mode this loop exists to catch.

   > **Reminder from 3C.7 part 3:** the sandbox webhook must still be pointed at the function on the
   > **scratch** project, not live, until a full cycle lands clean rows.

6. **Reset a tester:** select them → **Clear Purchase History** → confirm. Irreversible; never touches
   real customer accounts. **A tester is effectively burned for clean first-purchase testing after its
   first purchase** — use this to reset, or create another.

**TestFlight is a different environment with different rules.** Apple: *"Apps downloaded from TestFlight
will automatically operate in a sandbox environment."* **[V]** Consequence: **purchases are free.** But
the renewal cadence changes — **every subscription duration renews once per day, capped at 6 renewals
within a 1-week window**, then auto-renewal is disabled. **[V]** *(Example: a 1-month subscription
started Feb 1 renews Feb 2–7 and stops Feb 8.)* **Do not conflate this with the 12-renewal Sandbox
cap** — they are two different mechanisms on two different pages.

**Do one internal TestFlight pass before submitting for review.** It is the closest thing to production
behaviour you can get.

---

### Step 3C.10 — Paywall UI: what App Review requires you to display

**Guideline 3.1.2(c), verbatim:** *"Before asking a customer to subscribe, you should clearly describe
what the user will get for the price. How many issues per month? How much cloud storage? What kind of
access to your service? Ensure you clearly communicate the requirements described in Schedule 2 of the
Apple Developer Program License Agreement."* **[V]**

**Apple's subscriptions guidance, verbatim — the checklist a reviewer holds you to:** **[V]**

- **Subscription name and duration, and the content or services provided during the period**
- **Full renewal price, "shown clearly and prominently, and localized in available currencies"** — and
  *"In the purchase flow, the amount that will be billed must be the most prominent pricing element in
  the layout."* Any monthly-equivalent or savings breakdown must be **visually subordinate** to it.
- **A way for current subscribers to sign in or restore purchases**
- **For a free trial: how long it lasts and the price billed once it ends**

> 🚨 **Read the price off RevenueCat's localized package price. Never hardcode an MXN string.** Apple's
> requirement is explicitly "localized in available currencies".

**The cheapest compliant paywall is RevenueCat's own — and it is why you installed
`react-native-purchases-ui` back in 3C.1.** It renders name, duration and the **localized** price
straight off the Offering, plus the restore control and the footer links, so most of the checklist
above is satisfied by configuration rather than by code you have to keep correct:

```ts
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui'

// Show it unconditionally (e.g. from a "Suscribirse" button):
const resultado: PAYWALL_RESULT = await RevenueCatUI.presentPaywall()

// Or show it only if this gym lacks the entitlement — the usual case:
const resultado2: PAYWALL_RESULT = await RevenueCatUI.presentPaywallIfNeeded({
  requiredEntitlementIdentifier: 'pro',
})

switch (resultado) {
  case PAYWALL_RESULT.PURCHASED:
  case PAYWALL_RESULT.RESTORED:
    break // entitled — your 3C.5a listener will also fire
  case PAYWALL_RESULT.CANCELLED:
  case PAYWALL_RESULT.NOT_PRESENTED:
  case PAYWALL_RESULT.ERROR:
    break // no entitlement change; do not show an error for CANCELLED
}
```

**[V]** *(Import, both methods and all five `PAYWALL_RESULT` values are RevenueCat's own documented
React Native surface.)*

**What you still owe even when using it:**

- **Configure the Privacy Policy and Terms of Use URLs on the paywall in the RevenueCat dashboard.**
  They are blank by default, and blank means a missing-EULA-link rejection.
- **Design the paywall in the dashboard, not in code**, or you are back to hand-maintaining the
  3.1.2(c) checklist.
- **Verify on a real device against the checklist above before submitting** — a dashboard template
  can be edited into non-compliance by whoever last touched it.
- `PAYWALL_RESULT.NOT_PRESENTED` from `presentPaywallIfNeeded` means *already entitled*. Do not treat
  it as a failure.

*(If you would rather build the screen yourself, that is fine — you then own every line of the
checklist above, and you read the display price off `pkg.product.priceString`, never a literal.)*

**Also required in-app, per 3.1.2(c)'s pointer to Schedule 2 [?]:** functional links to your **Privacy
Policy** *and* your **Terms of Use (EULA)**, reachable from inside the app, plus the title, length, and
price of the subscription. *(This four-item list is corroborated by RevenueCat's engineering writeup of
Schedule 2 §3.8(b), **not** by Apple's contract text — the Schedule 2 PDF has never been read in any
pass on this repo. Re-confirm against Apple's live guideline page before finalizing paywall copy; this
exact clause is a documented common rejection cause.)*

**When you add IAP, the account-deletion flow from 2A.1 must be revised.** Apple: notify the user that
*"their billing will continue through Apple"* and request that they cancel before continuing, using
`showManageSubscriptions` or a link to `https://apps.apple.com/account/subscriptions`. **[V]**

**You'll know it worked when:** the paywall, before the purchase sheet appears, shows name + duration +
full renewal price as the largest pricing element, tappable Privacy Policy and Terms links, and a
visible restore button.

---

### Step 3C.11 — Effort estimate

**[~] Inferred, not measured:**

| Piece | Days |
|---|---|
| Client — init, offerings, purchase, restore, `appUserID` = `gym_id`, paywall meeting 3.1.2(c) (3C.5, 3C.6, 3C.10) | 2–4 |
| Client — the entitlement gate: boot read, update listener, resume re-read, three-state UI (3C.5a) | included above, ~½ day of it |
| Server — migration + RLS + denial suite + RevenueCat webhook with HMAC verification (3C.7) | 2–4 |
| Server — Apple-direct verification as well (JWS/x5c, notification state machine, API client) (3C.8) | +3–5 |
| Testing (sandbox setup, a full renewal/grace/expiry cycle, one TestFlight pass) | 2–3 |
| **Total, RevenueCat only** | **6–11** |
| **Total, with Apple-direct reconciliation** | **9–16** |
| *Add, to either total:* the reconciliation read + nightly cron (3C.7a) | *+1* |

This is lower than the 12–20 engineer-days in the 08-13 playbook because that estimate priced the
**Capacitor** path (worse tooling, manual receipt handling, and a plugin whose README doesn't claim
support for a remote origin). A native RN app with RevenueCat removes that specific blocker.

**Ongoing maintenance:** low-to-moderate. Watch RevenueCat SDK major bumps, re-test the sandbox purchase
flow after any Expo SDK bump, and monitor Edge Function logs for webhook signature failures.

---

### Step 3C.12 — The dependency chain, so you don't try step 8 before step 1

```
Apple Developer Program active
  └─> Paid Apps Agreement signed (Account Holder)        ← DAYS: blocks everything below
        ├─> Banking entered + validated
        └─> Tax forms submitted + validated
              └─> App record exists (Stage 2B.1)
                    └─> Subscription Group created
                          └─> Subscription created → Ready to Submit
                                ├─> In-App Purchase Key generated → uploaded to RevenueCat
                                ├─> RevenueCat dashboard: products + entitlement + CURRENT offering
                                │                         + HMAC signing enabled (secret shown once)
                                ├─> Server notification URLs set (BOTH)
                                ├─> Migration applied + denial suite green on SCRATCH
                                │     └─> Edge Function deployed (--no-verify-jwt) → sandbox webhook
                                │           points at SCRATCH first, live only after a clean cycle
                                └─> iPhone registered (eas device:create — step 1.14a, 24–72h on a
                                      new membership; needed ONLY for the development build below)
                                      └─> EAS dev build installed
                                            └─> Sandbox tester created + signed in on device
                                                  └─> First sandbox purchase
                                                        └─> ROW lands in gym_apple_subscriptions
                                                              └─> Submit subscription WITH a new app version
```

**A subscription must reach "Ready to Submit" before it is purchasable in sandbox at all.**

---

## Stage 3-alt — The web-billing shape (the recommended door)

If you take the ruled path instead, this is the whole shape, and it is short:

1. **The admin app stays FREE and login-only.** Nothing in Stage 3 applies. No Paid Apps Agreement, no
   banking, no W-8BEN, no RFC/CURP/Cédula, no StoreKit code.
2. **Gyms sign up and pay on `ibooki.lat`** via Stripe/SPEI, with iBookit as merchant of record.
3. **iBookit issues its own CFDI** — which means registering with SAT: **RFC + régimen PFAE + e.firma +
   CSD**. This is a **precondition of the recommended route, not a benefit already in hand.** You
   cannot issue any CFDI today.
4. **The app shows zero payment CTAs** (2A.3). Renewal prompts go out by email, WhatsApp and desk
   signage — explicitly allowed: *"Developers can send communications outside of the app to their user
   base about purchasing methods other than in-app purchase."* **[V]**
5. **Cite 3.1.3(f) Free Stand-alone Apps** in your App Review notes — and **do not volunteer
   3.1.3(c)**. Every condition of (f) is a property of the binary you submit; (c) conditions its
   exemption on an unevidenceable claim about your sales channel and closes with *"Consumer, single
   user, or family sales must use in-app purchase"*, which is a question you do not want a reviewer
   asking about one-person gyms buying self-serve on `ibooki.lat`. **[V]** Hold (c) in reserve for a
   Resolution Center reply if (f) is ever challenged. See 2A.3 and 2B.9.
6. **The precedent is overwhelming:** Mindbody Business, Glofox Pro, PushPress Staff, Zen Planner
   Staff, Vagaro Pro, Fresha for business, and Zenoti Mobile all ship free with **no IAP**. Only Booksy
   Biz sells via IAP. **7 to 1.** **[V]**

**What you give up:** the ability to sell or mention price inside the app, forever, on the Mexico
storefront.

> 🚨 **Do not build a mixed app** (IAP for some gyms, web billing for others) without a fresh explicit
> ruling. The moment the binary contains *any* purchase flow, the 3.1.3(f)/(c) framing weakens for
> everyone, and anti-steering then bars showing the web checkout to the web-billed gyms too. You'd need
> a `billing_provider` flag gating all payment UI so neither cohort ever sees the other's path — and
> **no Apple precedent settles whether that works.** **[?]**

---

# The traps that cost days

Ordered roughly by when they bite. Every one of these also appears in place, in its own step.

**Planning and schedule**

| Trap | What happens | Prevention |
|---|---|---|
| **Reading Stage 1 as "the app is done"** | You plan a launch date off a 1–2 day setup number and discover the 44–60 day rebuild afterwards | Stage 1 ships a *shell*. **Stage 1.5** is the app. Read the Map footnote and the 2A gate before promising anyone a date. **[~]** |
| **Submitting step 1.9's build** | A 5.1.1(v) rejection on a binary that was only ever a pipeline smoke test | 1.9 proves the pipeline. **The binary you submit must already contain 2A.1, 2A.4 and 2A.6** — none of them can be added by a form or an `eas update` |
| **Enrollment stuck → you pay a second time** | Duplicate charge + a refund chase on top of a multi-week wait | Contact support at the **24-hour** mark. Never re-enroll. **[V]** |
| **Web-path membership does not auto-renew** | A year later the app vanishes for new downloads and you lose Certificates access | Turn on **Auto-renew** in Membership details. Opt-in for web enrollment. **[V]** |

**Repo and toolchain**

| Trap | What happens | Prevention |
|---|---|---|
| **`git init` inside `apps/mobile`** | EAS can't find the pnpm lockfile, falls back to yarn, 404s on `workspace:*` packages | Scaffold as a plain subfolder. Never a second `.git`. **[V]** |
| **Scaffolding leaves `apps/mobile/node_modules` + `package-lock.json`** | `ERR_PNPM_OUTDATED_LOCKFILE` on the EAS builder, minutes into a build | Delete both, run `pnpm install` at the root, confirm `apps/mobile` appears in `pnpm-lock.yaml` (step 1.3) |
| **Building with uncommitted source** | **EAS only tarballs git-tracked files.** You get a `.ipa` built from the last commit, with none of your changes, and no error anywhere | `git status` clean before every `eas build` (step 1.8a) |
| **Forgetting this repo's pre-commit hook** | `git commit` fails on `pnpm lint && pnpm typecheck && pnpm test` and you reach for `--no-verify` | Do step 1.3b **first**: catalog pins, `globalIgnores`, the depcruise rule. Never `--no-verify` — that hook is what catches a `@gym/data/server` import that would otherwise fail on a device |
| **Pasting the guide's `app.json` over the generated one** | You delete `expo-router` from `plugins` and `extra.eas.projectId`; the app boots to a blank screen | **Merge**, never replace (step 1.4) |
| **Newer Node is not always fine, and neither is older** | Node 23.x, 24.0–24.2 and 25+ are outside RN 0.86's `engines`; Node 20 is outside **this repo's** `>=22.13 <25`. Both directions fail in non-obvious ways | Check against the Pass/Fail bands in step 1.1 — the **intersection** of the two engine fields — not against "is it recent" |
| **Windows 260-character path limit** | `ENAMETOOLONG`, or a git checkout that silently drops files | `LongPathsEnabled=1` + `git config --system core.longpaths true` + **reboot** (step 1.10) |
| **EAS Free tier's 45-minute build timeout** | The build is **terminated** and still burns one of your 15 monthly iOS builds. Reads like a code failure; it is a plan limit | Keep native deps lean and run builds back-to-back while the CocoaPods/npm caches are warm. Starter's timeout is 2 hours. **[V]** |
| **Shipping 1.0 without `expo-updates` in the binary** | **No OTA update can ever reach it.** Not a typo fix, not a crash fix. Only a new binary through App Review | `npx expo install expo-updates` **before** the build you submit (step 1.15) |
| **Bumping `runtimeVersion` and expecting OTA to still work** | Updates silently reach zero devices — *"The runtime version of the build and the target runtime version of an update must match exactly"* | Any native change ends OTA reach for older binaries. **[V]** |
| **`appVersionSource` not `remote`** | Second submission rejected for a duplicate build number, with an opaque error | Set `"cli": {"appVersionSource": "remote"}` + `"autoIncrement": true` **before the first build**. **[V]** |
| **The `.p8` files download once** | Unrecoverable. Revoke + regenerate + re-point config | Save the ASC API key `.p8` (step 1.7) and the In-App Purchase key `.p8` (step 3C.3) the instant they download |
| **Signing certificate** | One per Apple Developer account. A second machine or CI runner hits the ceiling | Let EAS hold it. `eas login` from anywhere. **[V]** |
| **Device registration treated as a prerequisite** | Up to 3 days of waiting before a first build that never needed it | `eas device:create` gates only `development`/`preview` builds. TestFlight needs **no** registration. Register at step **1.14a**, not before 1.9. **[~]** |
| **Registering the device *after* an internal build** | That build won't install — ad-hoc profiles embed only devices known at build time | For `development`/`preview`: register, wait 24–72h on a new membership, **then** build. **[V]** |
| **Developer Mode** | An EAS internal/development build refuses to launch on iOS 16+ with an untrusted-developer alert | Prefer **TestFlight**, which Apple exempts outright. If you must, enable it per step 1.14b — install the build first, then look for the toggle |

**Store listing**

| Trap | What happens | Prevention |
|---|---|---|
| **SKU is locked at app-record Create** | Permanent, forever | Decide `ibookit-admin-ios` before clicking Create. **[V]** *(Bundle ID is only locked at first build upload — you get a window there)* |
| **One binary, one name, one icon** | Every gym's staff installs an app called *iBookit* with the iBookit icon. Discovered by a client, it reads as a broken promise | Name/icon/splash are baked at build time; alternate icons ship inside the binary and never change the listing. **Tell gym clients before they find it.** **[V]** |
| **Keywords counted in bytes** | You strip accents from Spanish to "save space" and waste the effort, or leave spaces after commas and silently overrun | It is **100 CHARACTERS**, not bytes. Accents are free. **A space after a comma is a wasted character.** **[V]** |
| **Icon with an alpha channel** | `ERROR ITMS-90717` at `eas submit` / Transporter — **before** App Review. The build never reaches App Store Connect and you rebuild, burning one of 15 | 1024×1024 PNG, sRGB, flattened, no transparency. Run the `IsAlphaPixelFormat` check in step 1.4 **[V]** |
| **Screenshots with an alpha channel, or off by one pixel** | Rejected at upload. Apple: *"Images can't include alpha channels or transparencies"*, and there is zero dimension tolerance | The ImageMagick pipeline in **2B.8a** strips alpha and forces exactly 1290×2796. Verify with `magick identify` — `srgb` passes, `srgba` fails. **[V]** |
| **Login screen as screenshot #1** | Guideline 2.3.3 — *"Screenshots should show the app in use, and not merely the title art, login page, or splash screen"* | Shoot post-login screens from the demo gym. **[V]** |
| **Real member data in screenshots** | Guideline 2.3.9 — screenshots must *"display fictional account information instead of data from a real person"* | Shoot the seeded demo gym, which makes 2A.2 a prerequisite for 2B's metadata. **[V]** |
| **Missing EU trader declaration** | App **removed** from all 27 EU storefronts (since 2025-02-17) | Declare trader status with a P.O. Box. Silence is removal, not neutrality. **[V]** |
| **Missing Compliance** | Blocks **internal TestFlight distribution**, so it can bite at step 1.14 long before you reach 2B | Metadata-only fix, identical either way: answer Yes → exempt (2B.10) |
| **Reviewer credentials rotated or demo gym cleaned up** | A *future* update rejected on a broken login, with no real defect | Exclude the demo tenant from every cleanup script. Permanent fixture. |
| **Demo gym seeded in a scratch Supabase project** | 2.1 rejection on first submission | Seed it in the **production** project the shipped binary points at |
| **A multi-gym reviewer account** | Ten write RPCs derive the gym from `staff_gym()` = *lowest `gym_id`* and take no gym argument, so a picker is inert and writes land on the wrong gym | Keep the reviewer account a member of **exactly one** gym (2A.2). It is also what keeps 2B.9's review note truthful |
| **Citing 3.1.3(c) in the review notes** | Invites the reviewer to apply (c)'s closing sentence — *"Consumer, single user, or family sales must use in-app purchase"* — to your one-person-gym customers | Cite **3.1.3(f)** only. Hold (c) in reserve for a Resolution Center reply. **[V]** |
| **Citing 4.2.7(e)** | You argue against a rule titled **Remote Desktop Clients** that never engaged | The real 4.2 exposure is the 4.2 preamble and 4.2.2. **Never cite 4.2.7.** **[V]** |

**Code you must write, or be rejected**

| Trap | What happens | Prevention |
|---|---|---|
| **`signOut()` with the default scope** | The default is `scope: 'global'`. An operator tapping *Cerrar sesión* on the phone logs the admin web app out **at the front desk, mid-shift** | `signOut({ scope: 'local' })` on the phone. One word. **[V]** |
| **Account deletion missing** | Unconditional 5.1.1(v) rejection. No B2B exception exists | Build it, with a retention-disclosure screen (2A.1) |
| **A payment CTA anywhere in the app or its metadata** | 3.1.1(a) covers *"apps **and their metadata**"* — a price in the App Store description counts | Run the `Select-String` sweep in 2A.3, then eyeball the listing |

**Stage 3 (IAP)**

| Trap | What happens | Prevention |
|---|---|---|
| **The Paid Apps Agreement** | *"you can't undo this action"* | Read the Schedule 2 PDF in a real reader first. **[V]** |
| **The W-8BEN** | One-shot; corrections require contacting Apple | Get it right. *(The Mexico RFC/CURP/Cédula fields **are** editable any time — those are safe.)* **[V]** |
| **Product ID typo** | Permanent, and can never be reused in that app even after deletion | Settle the naming convention before creating the first product. **[V]** |
| **Family Sharing on a subscription** | *"you can't turn it off"* — a household mechanic on a business product | Leave it OFF. **[V]** |
| **IAP review screenshot at App Store dimensions** | Incorrect-size rejection on upload | **640×920 minimum** — its own spec. **[V]** |
| **One Apple ID, two gyms** | The second purchase resolves as "already subscribed". No workaround | Answer this before writing Stage 3 code. **[V]** |
| **RevenueCat transfer behavior left at default** | One gym's entitlement leaks to another, or gets stranded | Set it explicitly in the dashboard |
| **`Purchases.restorePurchases()` on every launch** | Unexpected Apple ID sign-in prompts; reads as broken | Explicit button only. Use `syncPurchases()` for silent restores |
| **Shipping the purchase flow with no boot-time entitlement read** | The app only knows a gym is subscribed in the seconds right after it pays. Cold launch = paywall for a paying customer | Step **3C.5a**: boot read + update listener + resume re-read, and `activa` starts at `null`, never `false` |
| **Gating on `customerInfo` instead of on the server row** | The gate lives on a device you do not control | The webhook-written `gym_apple_subscriptions` row is authoritative; `customerInfo` is a cache. Refuse in `/api/movil/v1/*` |
| **HMAC computed over a re-serialized body** | Every valid webhook fails verification and you debug the wrong thing for a day | `await req.text()` **before** any `JSON.parse`. Sign `"<t>.<raw>"` (3C.7) |
| **No timestamp-skew check** | One captured `INITIAL_PURCHASE` request replays into a free subscription, forever | Reject anything more than ~5 minutes old |
| **HMAC signing left off** | The endpoint's only protection is a static bearer string with no replay protection and no body binding | HMAC signing is **opt-in** in the RevenueCat dashboard. The secret is *"shown only once"* — copy it then. **[V]** |
| **Edge Function deployed without `--no-verify-jwt`** | Every webhook 401s silently while RevenueCat retries 5 times and gives up | Deploy with the flag |
| **`git push` touching `supabase/functions/**`** | The pre-push hook blocks it — because a push deploys Vercel but **never** Supabase edge functions (live served a stale `send-email` v6) | Deploy the function first, then — in PowerShell, not bash — `$env:EDGE_DEPLOY_OK="1"; git push`. Setting the variable without deploying reproduces the incident |
| **Migration shipped without a scratch `test:denial` run** | RLS regressions are invisible to `pnpm test` — `packages/data` mocks the RPC boundary | Apply the migration to the scratch project, then run `test:denial` there. The runner refuses the live ref. **[V]** |
| **Sandbox events gating production** | One sandbox tester subscribes a live gym for free | Store `environment` and require `PRODUCTION` in the production gate. **[V]** |
| **Non-200 on an event type you don't handle** | RevenueCat treats *"any other status code"* as failure and retries 5 times over ~155 minutes | Return **200** for ignored events |
| **Webhook-only entitlement** | After 5 failed retries the event is gone forever; a paying gym is locked out and you find out by phone | Build the reconciliation read + nightly cron (3C.7a) |
| **Renaming or removing an RPC parameter after a binary ships** | A shipped binary permanently ends atomic deploys — `pnpm test` and `test:denial` both stay green because they test the new shape | RPC changes are **additive only** for at least one full release-and-rollout cycle. Optional params with defaults, or a `_v2` name (2C.2) |

---

# What is still unknown

Ranked by how much damage each does. **Every one of these appears in place, in the relevant step,
too — not only here.**

**Tier 1 — these can invalidate or re-price the whole plan. Settle them first; none needs an Apple
account.**

1. **Does Hermes give you a working `Intl.DateTimeFormat` with `timeZone: 'America/Mexico_City'` and
   `formatToParts` on a low-end target device?** **[?]** The anchor doc's §12 ranks this **#1 thing
   that would change the answer**. Every sector formats dates in gym-local time; a red here means
   bundling `@formatjs` polyfills plus tz data and reworking formatting across all six sectors.
   **Settle it:** step 1.2b test 1 — an hour, on Android, today. A formatted hour reading `18` means
   UTC leaked; `12` is a pass.
2. **Does Metro resolve `@gym/domain/rules` — raw `.ts` behind a subpath exports map, under pnpm's
   isolated linker, with no build step (ADR-0011)?** **[?]** A red kills the
   share-the-pure-packages premise the entire port rests on. **Settle it:** step 1.2b test 2.
3. **Does Apple issue a CFDI for a third-party in-app subscription in Mexico?** **[?]** Kills or saves
   the entire Stage 3 business case. **Settle it:** on a Mexican Apple ID, add your RFC under Settings
   → Apple Account → Payment & Shipping → Tax Information, buy any third-party app's real IAP
   subscription, and watch for an EDICOM email. **One hour.**

**Tier 2 — money, contract and policy. Cannot be settled by reading.**

4. **Is Apple a legally recognised SAT retention agent, or is its withholding a private commercial
   arrangement?** **[?]** Determines whether you owe additional personal SAT filings. **Settle it:** an
   accountant, not more research.
5. **The verbatim text of Schedule 2** (commission, refund cost allocation, termination,
   indemnification). **[?]** Never read in any pass — the PDF resisted extraction three times.
   **Settle it:** download and open it in a PDF reader before signing.
6. **Does converting a free app to IAP carry any ranking or review-history penalty?** **[?]** Apple
   publishes nothing about App Store ranking inputs, so no source can promise zero. The mechanism
   suggests none (the app record does not change). **Settle it:** only by shipping. **Do not stamp this
   [V].**
7. **Is Mexico one of the *"specific storefronts"* where a StoreKit External Purchase Link Entitlement
   is available?** **[?]** Apple's `/support/storekit-external-purchase-link/` returns 404 and the
   entitlement pages render their region lists in JavaScript. **Settle it:** the allowed values of
   `com.apple.developer.storekit.external-purchase-link`. Until then, assume Mexico is not on it.
8. **Does credential-gated tenant selection satisfy Guideline 4.2.6** as cleanly as Apple's literal
   browsable-picker example? **[?]** No primary source either way. **Settle it:** ship without the
   hedge and accept the residual risk, or add a one-screen pre-login gym picker.
9. **Does web enrollment truly complete with zero Apple hardware?** **[~]** An argument from silence
   plus a carve-out list that excludes you. **Settle it:** run the flow. If it hands you to the Apple
   Developer app, wait for the iPhone or use the support escape hatch.
10. **Is there any published channel for the *"prior approval by Apple"* a built-in demo mode
    requires?** **[?]** No App Store Connect Help page and no `developer.apple.com/contact` topic names
    it. **Settle it:** moot if you seed a password reviewer account, which you should (2A.2).

**Tier 3 — toolchain and repo. Each costs hours, not weeks, and each is settled by running one thing.**

11. **Does `eas update:configure` install `expo-updates`, or must `npx expo install expo-updates` run
    first?** **[?]** Version-dependent and undocumented. **Settle it:** run `update:configure` alone in
    a scratch project and check `package.json`. *(Running the install first is idempotent — just do
    it.)*
12. **Does dependency-cruiser's `no-orphans` rule fire on every Expo Router screen?** **[?]** Its
    entry-point exceptions are written for Next's `app/**/(page|layout)`, not
    `apps/mobile/app/**/{index,_layout}.tsx`. **Settle it:** scaffold and run `pnpm lint`. Fix by
    adding `"(^|/)apps/mobile/app/"` to that rule's `pathNot` — **never** by excluding `apps/mobile`
    from depcruise, which would also delete the `apps/mobile ✗→ @gym/data/server` rule.
13. **Which pnpm does the EAS SDK-57 build image ship, and does `packageManager` + corepack break the
    install?** **[?]** eas-cli #2518/#2541/#3148 report the breakage; #2401 is still an open request.
    **Settle it:** read the version out of the first build's *Install dependencies* log and write it
    into step 1.2.
14. **Does the Developer Mode row appear in Settings without ever having paired to a Mac?** **[?]**
    Apple's page says pairing is what surfaces it; Expo says installing the build is enough. **Settle
    it:** don't. Use TestFlight, which Apple exempts outright (1.14b).
15. **Is RevenueCat's webhook signature timestamp in seconds or milliseconds?** **[?]** **Settle it:**
    log the raw `t=` on the first real delivery — 10 digits is seconds, 13 is milliseconds — and fix
    the skew comparison in 3C.7 accordingly. Getting it wrong rejects every valid webhook.
16. **Does RevenueCat really auto-populate `appAccountToken` from a UUID `appUserID`?** **[?]**
    RevenueCat's own primary docs say nothing about it. **Settle it:** decode a sandbox JWS payload and
    look. **Design the reconciliation path so it works if this is false.**
17. **Does `@apple/app-store-server-library` run inside a Supabase Edge Function via Deno's `npm:`
    specifier?** **[?]** **Settle it:** a 20-minute import spike, before designing the Apple-direct
    server path (3C.8).
18. **Which host actually serves today — `ibooki.lat` or `ibookit.lat`?** **[?]** The locked product
    domain and the live infrastructure disagree. **Settle it:** step 0.0's status-code check against
    both, then use the winner everywhere App Store Connect asks for a URL.

**Tier 4 — you will find these out by doing the step. Do not research them.**

19. **Is a Mexican INE accepted as photo ID for Apple identity verification?** **[?]** No Apple page
    enumerates Mexico. **Settle it:** moot — use a passport.
20. **What does the $99 cost in pesos, and is 16% IVA added?** **[?]** No Apple page publishes it.
    **Settle it:** read the checkout screen before paying.
21. **Which Required Reason API declarations does iBookit's actual dependency tree need?** **[?]** Not
    knowable from docs. **Settle it:** submit, read Apple's ITMS-91053 email, patch `app.json`, rebuild.
22. **Does Brazil's "Missing Tax Form" distribution block apply to apps that never accept the Paid Apps
    Agreement?** **[?]** **Settle it:** exclude Brazil from v1 at zero cost, or just try it.
23. **Which named Tax Category fits a B2B SaaS subscription?** **[?]** Mechanism documented, list not.
    **Settle it:** open the picker.
24. **Whether the Mexico banking form names CLABE, and whether payouts land in MXN.** **[?]**
    **Settle it:** open the Add Bank Account screen (only visible after signing Schedule 2).
25. **Can a cloud device farm install an ad-hoc / dev-client `.ipa`?** **[?]** The "does a farm
    substitute for an iPhone" question. **Settle it:** ask BrowserStack support directly.
26. **Whether internal TestFlight builds skip Beta App Review.** **[~]** Widely believed, consistent
    with Apple's external-only phrasing, not stated on the internal-testers page.
27. **App Review Board appeal turnaround (commonly cited as 5–7 business days).** **[?]** Community
    folklore; Apple publishes no figure.
28. **App Store Connect build-processing duration.** **[?]** No Apple SLA exists. Community range: 10
    minutes to several hours. Do not plan around a "15 minute" number.

**Settled since the first draft — do not re-open these:**

- **Keywords are 100 CHARACTERS, not bytes.** Accents cost 1 character each. *(Apple's product-page
  doc, plus an Apple engineer accepting a 100-character Thai string — 3 bytes/character — in Developer
  Forums thread 705360.)* **[V]**
- **A 4.7" screenshot tier still exists** (750×1334). It is simply **not required** — 6.9" is the only
  required iPhone tier and every smaller one is auto-scaled from it. **[V]**
- **TestFlight never requires Developer Mode.** Apple states the carve-out verbatim. **[V]**
- **Cite 3.1.3(f), not 3.1.3(c).** **[V]**
- **4.2.7(e) is a sub-condition of "Remote Desktop Clients" and never engages for an HTTPS app.** **[V]**
- **Demo mode is not an option you may pick** — Guideline 2.1(a) gates it on a *legal or security
  obligation* you do not have. **[V]**

---

# Fast path — the runsheet

Once you've read the above, use this. **One line per step, labelled with its step number**, in
document order. If a line surprises you, go read that step — the runsheet is a memory aid, not a
substitute.

**Stage 0 — the Apple account** *(≈2 hours of typing + 24h–weeks of waiting, $99)*

- **0.0** — Publish the privacy page and the support page. Verify both return **200** from your PC
  **and from cellular data**. Decide `ibooki.lat` vs `ibookit.lat` here and write it down. **[?]**
- **0.1** — Enroll as **Individual**, not Organization. Write down your exact legal name from your passport.
- **0.2** — `account.apple.com` → Personal Information → set first/last name to your **legal** name.
- **0.3** — Same page → Sign-In and Security → **two-factor ON**, trusted phone number added.
- **0.4** — `developer.apple.com/programs/enroll/` → Start Your Enrollment. **Web path, not the app.**
- **0.5** — Accept the Apple Developer Agreement → Enroll Now.
- **0.6** — Legal name, phone, **physical street address** (no P.O. box), entity type **Individual**.
- **0.7** — Identity verification: upload the passport photo page if prompted.
- **0.8** — Accept the Program License Agreement (DPLA).
- **0.9** — **Read the peso amount**, then pay $99 with **your own card**.
- **0.10** — Wait. Contact support at the **24-hour** mark. **Never pay twice.** Meanwhile: steps
  1.1–1.5 only — 1.6 onward needs an active membership.
- **0.11** — `developer.apple.com/account` → Membership details → **Auto-renew ON**. Mandatory on the web path.
- **0.12** — Open `appstoreconnect.apple.com` once. **Create nothing.**

**Stage 1 — the pipeline: code → an app file** *(1–2 days, $0)*

- **1.1** — Install Node (check the Pass/Fail bands — **23.x, 24.0–24.2, 25+ and Node 20 all fail**;
  the band is the intersection of RN 0.86's engines and this repo's `>=22.13 <25`), pnpm,
  `eas-cli >= 12`. `eas login`, `eas whoami`, `eas --version`.
- **1.2** — Confirm the root pin reads `pnpm@11.5.1`. **Do NOT change it.** Only revisit pnpm pinning if
  the first build actually shows `ERR_PNPM_NO_LOCKFILE`.
- **1.2b** — **Three smoke tests, on a real Android device, no Apple account needed.** (1) Hermes
  `Intl.DateTimeFormat` with `timeZone: 'America/Mexico_City'` + `formatToParts`; (2) Metro resolving
  `@gym/domain/rules` — **this one runs in `apps/mobile` just after 1.3**, the other two in a scratch
  app before it; (3) `globalThis.crypto?.subtle`. **A red on 1 or 2 is a stop-and-replan, not a bug to fix.**
- **1.3** — `cd` to the repo root, `npx create-expo-app@latest apps/mobile --template default`. **Never
  `git init` inside it.** Then delete `apps/mobile/node_modules` + `package-lock.json`, `pnpm install`,
  confirm `apps/mobile` appears in `pnpm-lock.yaml`.
- **1.3b** — Make it pass the repo's gates: catalog-pin **every** name on the guard's list that the
  manifest declares (react/react-dom/typescript/@types/**@supabase/supabase-js**/zod/vitest/…), add
  `"apps/mobile/**"` to `globalIgnores([...])`, do **not** add a `build` script, add the
  `mobile-no-server-dal` depcruise rule, tighten `engines.node`. Then run `pnpm lint`, `pnpm typecheck`
  and `pnpm test` — **three separate commands; PowerShell 5.1 has no `&&`.** (The hook itself is sh, so
  the `&&` chain is correct *inside* `.husky/pre-commit` and wrong in your terminal.)
- **1.4** — **Merge** into the generated `app.json` (never paste over it — keep `expo-router` and
  `extra.eas.projectId`): bundle ID, `supportsTablet: false`, `usesNonExemptEncryption: false`,
  runtimeVersion, real asset paths. **One reverse-DNS prefix for iOS bundle ID + Android package +
  Stage 3 Product IDs.** Run the **alpha-channel check on the icon**. Read the white-label callout —
  `"name"` is what every gym client sees on their Home Screen.
- **1.5** — Write `apps/mobile/eas.json`: `appVersionSource: "remote"` + `autoIncrement: true`. Verify
  with `npx eas-cli@latest config --platform ios --profile production`.
- **1.6** — `eas init` (writes `extra.eas.projectId`), commit it, then `eas credentials` → iOS →
  production → let EAS manage. Never pick anything containing Remove, Revoke or Delete.
- **1.7** — App Store Connect → Users and Access → **Integrations** → *App Store Connect API* →
  **Team Keys** tab → **+** → Admin. **Save the `.p8` — one-time download.** Fill all five `eas.json`
  fields including `appleId` and `appleTeamId`. Sweep for leftover placeholders.
- **1.8** — **Do NOT register your iPhone yet.** It gates only `development`/`preview` builds. See 1.14a.
- **1.8a** — **Commit `apps/mobile`.** EAS only tarballs git-tracked files. Past the pre-commit hook
  (`pnpm lint && pnpm typecheck && pnpm test`), never `--no-verify`.
- **1.9** — `git status` clean → `eas build --platform ios --profile production`. Know the ceilings:
  **15 iOS builds/month, 45-minute timeout on Free**, concurrency 1, low-priority queue.
- **1.10** — Windows hygiene: `LongPathsEnabled=1` (elevated), `git config --system core.longpaths true`,
  **reboot**. Never run a local native compile on this machine.
- **1.11** — What you can do before the iPhone/account arrive: all the code, Expo Go on Android, the
  1.2b smoke tests, Android EAS builds.
- **1.12** — **Stop.** `eas submit` needs an app record. **Go do 2B.1–2B.3 now, then come back to 1.13.**
- **1.13** — `eas submit --platform ios --profile production --latest`. **Uploading ≠ submitting for
  review** — this build is the pipeline proof that reaches your phone at 1.14, not your store submission.
- **1.14** — TestFlight → Internal Testing → add yourself → install on the iPhone. *(If it shows
  **Missing Compliance** and won't distribute, jump to 2B.10 — metadata fix, not a rebuild.)*
- **1.14a** — **Only for `development`/`preview` builds:** `eas device:create`, open the URL on the
  iPhone. **24–72h on a new membership.** Register *before* the build, not after.
- **1.14b** — **Developer Mode.** TestFlight never needs it **[V]**; EAS internal/dev builds do on
  iOS 16+. Prefer TestFlight. If the toggle isn't in Settings, **don't chase it.**
- **1.15** — `npx expo install expo-updates` **first**, then `eas update:configure`, then the daily loop.
  **An OTA update cannot reach a binary built without `expo-updates` — install it before the build you submit.**

**Stage 1.5 — build the actual app** *(44–60 solo-dev days; 15–20 of foundation before the first sector screen)*

- Six sectors, easiest first: **inicio → clientes → asistencia → agenda → vender → cuenta last**
  (`cuenta` is the 7–10 day long pole). Anchor doc: `docs/planning/2026-08-14-mobile-admin-app-rn-expo.md` §4.
- **Do not start Stage 2A until at least `inicio`, `clientes` and `cuenta` render on device.**

**Stage 2A — compliance code, bolted onto a finished app** *(3–7 days, $0)*

- **2A.1** — In-app **account deletion** (5.1.1(v)) + re-auth + confirmation + a **retention-disclosure
  screen**. `signOut({ scope: 'local' })`, not the global default. If it needs a new RPC: add it to
  `supabase/tests/rpc-coverage.json`, write a suite asserting the **written rows**, wire it into
  `SUITE`, run `test:denial` on scratch.
- **2A.2** — Seed the **permanent reviewer demo gym + fixed-password account** in the **production**
  Supabase project. **Member of exactly ONE gym.** Demo *mode* is not available to you (2.1(a) gates it
  on a legal/security obligation you don't have).
- **2A.3** — Strip **every** payment CTA, price display and checkout link from the app **and its
  metadata**. Run the recursive `Get-ChildItem | Select-String` sweep. Renewal prompts go out by
  email/WhatsApp/desk signage.
- **2A.4** — Specific Spanish `*UsageDescription` strings for every permission. Check whether ATT applies.
- **2A.5** — If shipping push: works with permission denied, no sensitive payload, opt-in for promo.
- **2A.6** — `ios.privacyManifests` declarations. Expect one ITMS-91053 round trip.
- **2A.7** — Sign in with Apple: not triggered today. Know the trigger.
- **2A.8** — The 4.2 / 4.3 table, and **the one open decision**: credential-gated tenant selection vs
  4.2.6's browsable-picker example. **Never cite 4.2.7.**

**Stage 2B — the store listing** *(1 day of forms + 1–5 days of review, $0)*

- **2B.1** — Apps → **+** → New App: Platforms **iOS**, Name `iBookit` (must match `expo.name`), Primary
  Language **Spanish (Mexico)**, Bundle ID from dropdown, **SKU is locked at Create**. Then copy the
  numeric **Apple ID** from App Information → General Information into `eas.json`'s `ascAppId`.
- **2B.2** — App Information: Subtitle, **Privacy Policy URL**, Category **Business**, Copyright, default EULA.
- **2B.3** — Pricing and Availability → **Free**. Territories. **Business → Compliance → declare EU
  trader status with a P.O. Box** (do this early — verification takes days).
- **2B.4** — **Go back and run 1.13 (`eas submit`)**, then here: Version page → **Build** → **+ Add
  Build** → select the processed build.
- **2B.5** — Age Rating questionnaire → social-media **No** → lands at **4+**.
- **2B.6** — **App Privacy** (its own top-level sidebar item, not inside App Information) → Get Started →
  Yes / Data Linked to You / Not used to track / App Functionality.
- **2B.7** — Version metadata: Description (4,000), **Keywords — 100 CHARACTERS, not bytes; accents are
  free; no space after commas; never repeat a word already in the Name or Subtitle** (which is why the
  supplied string has no `gimnasio` in it), Support URL, Marketing URL.
- **2B.8** — Screenshots you owe: **6.9" only** (1290×2796, or 1260×2736 / 1320×2868). No iPad while
  `supportsTablet: false`. 1–10 images, **no alpha**, zero dimension tolerance. App Previews optional — skip.
- **2B.8a** — **Produce them on Windows:** shoot on the iPhone (side + volume up) → USB → `winget install
  ImageMagick.ImageMagick` → force-resize + strip alpha + strip EXIF → verify `1290x2796 srgb`
  (`srgba` = fail).
- **2B.8b** — What they must **show**: the app in use (**not** the login screen, 2.3.3), **fictional**
  member data only (2.3.9), 4+ appropriate (2.3.8), no other-platform imagery (2.3.10), no pricing.
- **2B.9** — App Review Information: Sign-In Required ON, demo credentials, contact info, and Spanish
  notes citing **Directriz 3.1.3(f)** only. **Do not volunteer 3.1.3(c).**
- **2B.10** — Export compliance. If **Missing Compliance**: answer Yes → exempt. Metadata-only.
- **2B.11** — Release option: **Manually release this version** → **Submit for Review**.
- **2B.12** — The review states and how long each takes.

**Stage 2C — after submission**

- **2C.1** — **Pending Developer Release** → **Release This Version**. Up to 24h to appear in search.
- **2C.2** — Updating after launch: what OTA can and cannot carry. **RPC changes are additive-only for
  at least one full release-and-rollout cycle** — a shipped binary permanently ends atomic deploys.

**Stage 3 — a paid subscription inside the app** *(only if you override the ruling: 6–16 dev days +
days-to-weeks of paperwork + 15% of revenue)*

- **3A** — The fork. **Run the CFDI test first** (Mexican Apple ID + RFC + any third-party IAP
  subscription → EDICOM email?). It decides everything. Adding IAP **spends 3.1.3(f) permanently.**
- **3B.1** — Business → Agreements → Paid Apps → **read the PDF** → Agree. **Irreversible.** Account Holder only.
- **3B.2** — Tax: **W-8BEN** (one-shot, uneditable) + RFC / CURP / Cédula (editable any time).
- **3B.3** — Banking: **one** account, holder name in English characters matching the bank exactly.
- **3B.4** — Enroll in the **Small Business Program** (15%; effective 15 days after the enrollment month ends).
- **3B.5** — Subscriptions → **+** → Subscription Group (reference name only, internal).
- **3B.6** — Create the subscription: **Product ID is permanent.** Duration. Price with **Mexico as the
  base country**. Localization (Display Name 2–30, Description ≤45). **Family Sharing OFF.**
- **3B.7** — Review screenshot at **640×920 minimum** (its own spec, not the App Store one). Set the Tax Category.
- **3B.8** — Optional: Introductory Offer → Free Trial. One per person per subscription group.
- **3B.9** — Billing Grace Period: 16 days, **Production and Sandbox**. Takes up to 24h to apply.
- **3B.10** — App Information → General Information → **App Store Server Notifications**: set **BOTH**
  URLs, **Version 2**. Sandbox-only means production sends nothing.
- **3B.11** — The first subscription must be **submitted with a new app version**. Both clear review together.
- **3C.1** — `npx expo install react-native-purchases react-native-purchases-ui`. No config plugin.
- **3C.2** — The 30-minute smoke test (`configure` + `getOfferings` on a dev build) against issue #1712.
- **3C.3** — Users and Access → Integrations → **In-App Purchase** → generate key → **save the `.p8`** →
  upload to RevenueCat. **Mandatory, not optional.**
- **3C.4** — RevenueCat dashboard: Products → Entitlement `pro` → Offering **marked CURRENT** → Packages
  → **set transfer behavior deliberately**.
- **3C.5** — Init, `getOfferings`, `purchasePackage` (**always branch on `e.userCancelled`**), an explicit
  **Restaurar compras** button, `showManageSubscriptions`. Never call `finishTransaction`.
- **3C.5a** — **The entitlement gate:** `getCustomerInfo()` at boot, `addCustomerInfoUpdateListener` while
  open, re-read on `AppState` `active`, three UI states (`null` / `true` / `false`). **The server row is
  authoritative; `customerInfo` is a cache.** Gate `/api/movil/v1/*`, not just the screen.
- **3C.6** — `appUserID` = the gym's **UUID** `gym_id`. **Answer first: what happens when one Apple ID
  runs two gyms?** No code until that is answered.
- **3C.7** — **part 1** migration: `public.gym_apple_subscriptions` (FK to `public.gym`, singular), RLS
  on, staff-select via `is_staff_of`, **no write policy**; write the denial suite, wire it into `SUITE`,
  run `test:denial` on **scratch**. **part 2** the Edge Function: enable **HMAC signing** (secret shown
  once), verify over the **raw** body, reject skew, constant-time compare, verify **before** parsing,
  200 on ignored events. **part 3** deploy `--no-verify-jwt`, then `$env:EDGE_DEPLOY_OK="1"; git push`.
- **3C.7a** — The **reconciliation** read (`GET /v1/subscribers/{gym_id}`, secret key, server-side only)
  + a nightly cron. Webhooks get lost after 5 retries.
- **3C.8** — Optional: Apple's own App Store Server Notifications as a cross-check. Spike the Deno import first.
- **3C.9** — **Sandbox from Windows:** create testers (`+` subaddressing; email must not already be an
  Apple Account; name/email/password uneditable), set renewal speed, sign in via **Settings → Developer
  → Sandbox Apple Account** — **never sign out of your real Apple ID**. `eas build --profile development`
  (needs 1.14a). Point the **sandbox webhook at the scratch project first.** Walk renew → retry (10 min)
  → grace (5 min) → expire; **12 renewals max**. Then one internal TestFlight pass (free purchases, daily
  renewals, 6 max in a week).
- **3C.10** — Paywall: name + duration + **localized full renewal price as the most prominent element**,
  Privacy Policy + Terms links, restore button. `RevenueCatUI.presentPaywall()` /
  `presentPaywallIfNeeded({ requiredEntitlementIdentifier: 'pro' })` gets you most of it — **set the
  policy/terms URLs in the dashboard, they are blank by default.** Revise the 2A.1 deletion flow to warn
  about Apple billing.
- **3C.11** — Effort estimate, and what "ongoing maintenance" means.
- **3C.12** — The dependency chain, so you don't try step 8 before step 1.

**Stage 3-alt — the recommended door** *(no Stage 3 at all)*

- App stays **free and login-only**; gyms pay on the web; **iBookit issues its own CFDI** (which needs
  RFC + PFAE + e.firma + CSD — a precondition, not a benefit in hand); **zero payment CTAs** in-app;
  App Review notes cite **3.1.3(f)**. **Do not build a mixed app.**

---

*End of guide. Every claim above carries its marker. Where a step says [?], that is the honest state of
the evidence — treat it as a thing to go settle, not a fact to build on.*
