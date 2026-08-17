# Ship the iBookit admin app to the iOS App Store — step by step

**Written 2026-08-16. For someone who has never shipped an iOS app and has never opened App Store Connect.**
You are on Windows 11. You have no Mac. An iPhone is arriving. You are a Mexican *persona física*
with no company. Every step below says exactly what to click, exactly what to type, and exactly what
you should see back.

---

## Read this first: what this supersedes

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
   certainly does not apply to a native app. **[V]**

Everything else in those two docs (enrollment mechanics, anti-steering, the 7-to-1 competitor
evidence, the CFDI problem) still stands and is folded into this guide.

### Marker convention

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
| **Stage 1** — Code → an app file, from Windows | A build sitting in App Store Connect, installable on your iPhone via TestFlight | **$0** on EAS free tier (15 iOS builds/month); **$19/month** for EAS Starter if you iterate daily | 1–2 days of setup + 10–25 min per build + up to 1 hr queue on the free tier |
| **Stage 2** — FREE app live on the App Store | The app publicly downloadable in Mexico | **$0** | 3–7 days build work (2A) + 1 day of forms (2B) + **1–5 days** of App Review, plus one rejection cycle if unlucky |
| **Stage 3** — Paid subscription inside the app | Gyms subscribe with their Apple ID; you get paid 45 days after month end | **15% of revenue** (Small Business Program) + $0 tooling under $2,500/mo | **6–16 solo-dev days** of code + **days-to-weeks** of Apple paperwork validation that blocks everything |

**Stages 0 → 1 → 2 are strictly sequential.** Stage 3 is optional and can be added later to the same
app record with no penalty **[V]**.

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
- [ ] **The iPhone** (for Stage 1's last step onward). Nothing before that needs it.
- [ ] **A live HTTPS page you control for a privacy policy** (e.g. `https://ibooki.lat/privacy`).
      Mandatory for iOS. **[V]**
- [ ] **A live HTTPS support page with a real contact channel** (e.g. `https://ibooki.lat/soporte`
      with an email address on it). Mandatory field. **[V]**
- [ ] **RFC and CURP** — **only for Stage 3.** Not asked at enrollment, not asked for a free app.
      Apple: *"In order to submit tax forms, you first need to sign the Paid Apps Agreement."* **[V]**

**Dead end, do not chase it:** Mexico appears on Apple's fee-waiver list. The waiver eligibility
requires you to *"Be a legal entity with a status as a nonprofit organization, accredited educational
institution, or government entity"* and to *"Not be an individual, sole proprietor, or single-person
business."* **[V]** You cannot get it. Budget the $99.

---

# Stage 0 — Get an Apple developer account

**What this stage buys you:** the right to distribute through TestFlight and submit to the App Store.

**What it does NOT block:** you can scaffold the app, write code, run it on Android, and build
Android binaries with zero Apple account. Start enrollment on day one and keep working while it
processes.

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

**Do this:** nothing. Work on Stage 1 in parallel — it does not need the account yet.

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

You need Node 22 LTS or newer. React Native 0.86's own `engines` field allows
`^20.19.4 || ^22.13.0 || ^24.3.0 || >= 25.0.0` — note that 23.x and 24.0–24.2 are excluded. The repo's
`engines.node` should be tightened to match (see `docs/planning/2026-08-14-mobile-admin-app-rn-expo.md` §3).

```powershell
pnpm --version
```

```powershell
npm install --global eas-cli
```

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

**You'll know it worked when:** `eas whoami` prints your Expo username.

**Cost:** $0. **Time:** 15 minutes.

---

### Step 1.2 — Pin the pnpm version in the ROOT package.json

**Do this before scaffolding anything.** Open `C:\Users\Aaron\Documents\Repos\RED-2.0\package.json`
and confirm it has a `packageManager` field naming your exact pnpm version:

```json
{
  "packageManager": "pnpm@10.21.0"
}
```

Replace `10.21.0` with whatever `pnpm --version` printed in step 1.1.

**Why:** EAS Build's macOS image ships its own pnpm. If the image's pnpm is older than your lockfile
format, the frozen-lockfile install fails with `ERR_PNPM_NO_LOCKFILE` preceded by
`WARN Ignoring not compatible lockfile`. This is a **live, undiagnosed failure mode** documented in
eas-cli issue #3247 on an 8-project pnpm workspace — the same shape as RED-2.0. **[V]** Pinning
`packageManager` tells EAS which pnpm to install.

**You'll know it worked when:** the field is present and matches your local version.

**Cost:** $0. **Time:** 2 minutes.

---

### Step 1.3 — Scaffold `apps/mobile` as a plain subfolder — never `git init` inside it

**Do this, from the repo root:**

```powershell
npx create-expo-app apps/mobile
```

> 🚨 **Do NOT run `git init` inside `apps/mobile`.** EAS Build finds your lockfile relative to the
> nearest `.git` directory. If `.git` lands inside `apps/mobile`, EAS never finds `pnpm-lock.yaml` at
> the true monorepo root, silently falls back to yarn, and then 404s on every `workspace:*` package.
> This is the confirmed root cause of eas-cli #3247: *"Following the reproduction steps above produces
> a monorepo project where the .git directory is in apps/mobile, and not at the root of the project
> where it should be. This causes EAS build to search for package manager lockfiles in apps/mobile,
> and since it does not find pnpm-lock.yaml, it defaults to using yarn."* **[V]**
> RED-2.0 already has `.git` at the root, so you are safe **as long as you do not create a second one.**

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

**You'll know it worked when:** `apps/mobile/` exists, `git status` shows it as new files inside the
existing repo (not a submodule), and `git check-ignore` printed nothing.

**Cost:** $0. **Time:** 20 minutes.

---

### Step 1.4 — Fill in `app.json`

**Do this:** open `apps/mobile/app.json` and set every field below. Here is a complete, working file
— not a fragment:

```json
{
  "expo": {
    "name": "iBookit",
    "slug": "ibookit-admin",
    "scheme": "ibookit",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
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
      "package": "lat.ibooki.admin",
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      }
    },
    "plugins": [
      [
        "expo-splash-screen",
        {
          "image": "./assets/splash.png",
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

Field by field:

| Field | What it is | Permanent? |
|---|---|---|
| `name` | The name shown under the icon on the home screen | No |
| `slug` | Expo's internal project identifier | No |
| `scheme` | Custom URL scheme (`ibookit://…`) for deep links | No |
| `version` | The marketing version users see, e.g. "1.0.0" | No — bump per release |
| `ios.bundleIdentifier` | Your permanent Apple identity string | **Effectively yes** — see step 1.9 |
| `ios.buildNumber` | Maps to `CFBundleVersion`. Must be unique and increasing per upload | Auto-incremented by EAS (step 1.5) |
| `ios.supportsTablet` | **Set to `false`.** This is what actually decides whether Apple demands iPad screenshots. Documented default is already `false` **[V]** | No |
| `ios.config.usesNonExemptEncryption` | Sets `ITSAppUsesNonExemptEncryption` in the compiled app. `false` is correct and truthful for an app that only makes HTTPS/TLS calls to Supabase **[V]** | No |
| `runtimeVersion.policy: "fingerprint"` | Auto-increments the runtime version whenever anything native changes, so an over-the-air update can never reach a binary it's incompatible with **[V]** | No |

> **Do NOT add `newArchEnabled`.** The key is absent from the current Expo app config schema **[V]**.
> New Architecture is on and not configurable in SDK 57.

> **Do NOT add a top-level `splash` field.** Splash is configured through the `expo-splash-screen`
> plugin, as shown. **[V]**

**The icon:** `assets/icon.png` must be **1024×1024 PNG, sRGB, flattened, no transparency, no alpha
channel, no rounded corners** (iOS rounds them for you). An alpha channel here is one of the most
common first-ever-upload failures — Apple rejects with *"Invalid large app icon... can't be
transparent nor contain an alpha channel"*, and this happens during processing, before a human ever
sees the app.

**Verify:**

```powershell
npx expo config --type public
```

```powershell
npx expo-doctor
```

**You'll know it worked when:** `expo config` prints every field you set, and `expo-doctor` reports no
config errors.

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

You will fill the `submit.production.ios` placeholders in steps 1.7 and 2B.4. Leave them as-is for now.

> 🚨 **`"appVersionSource": "remote"` plus `"autoIncrement": true` is not optional.** Without both,
> your second submission is rejected by App Store Connect for a duplicate build number, with an opaque
> error. With `remote`, EAS stores the build counter server-side and bumps it for you. With `local`,
> *"the source of truth for project versions is the local project source code itself"* and *"you need
> to commit your changes on every build if you want the version change to persist."* **[V]**

**You'll know it worked when:** any `eas build` command runs without a schema validation error.

**Cost:** $0. **Time:** 10 minutes.

---

### Step 1.6 — Let EAS create your signing credentials

**Do this:**

```powershell
cd C:\Users\Aaron\Documents\Repos\RED-2.0\apps\mobile
```

```powershell
eas credentials
```

Choose: **iOS** → **production** → **Build Credentials** → let EAS manage credentials. It will prompt
you to log in with your Apple Account, then generate and store:

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
2. Click **Users and Access** (top navigation).
3. Click the **Integrations** tab.
4. Click the **+** button to generate a new key.
5. Give it a name (e.g. `eas-submit`) and select the **Admin** role. **[V]**
6. Note the **Issuer ID** (a UUID shown once at the top of the page, shared across all your keys).
7. Note the **Key ID** (a 10-character string next to the new key).
8. Click **Download** to save the **`.p8`** file.

> 🚨 **The .p8 downloads exactly once and can never be re-downloaded.** **[~]** Lose it and you must
> revoke the key and generate a new one with a new Key ID, then update `eas.json`. Save it
> immediately.

**Where to put it:**

```powershell
mkdir C:\Users\Aaron\Documents\Repos\RED-2.0\apps\mobile\.eas\keys
```

Move the downloaded `.p8` to `apps\mobile\.eas\keys\asc-api-key.p8`, then add to
`apps/mobile/.gitignore`:

```
.eas/keys/
```

Then fill in `eas.json`'s `ascApiKeyPath`, `ascApiKeyIssuerId`, and `ascApiKeyId` from steps 6–7.

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

**You'll know it worked when:** the `.p8` exists on disk outside source control and `eas.json` has
three non-placeholder values.

**Cost:** $0. **Time:** 10 minutes.

---

### Step 1.8 — Register your iPhone, then rebuild

**Order matters here and it is not intuitive: a build only installs on devices that were registered
BEFORE it was created.**

**Do this, once the iPhone is in your hands:**

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

### Step 1.9 — Run the first production build

**Do this:**

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

**Cost and time:**

- **Build time:** ~10–25 minutes on the default resource class, once it starts.
- **Queue time:** separate and variable. On the **EAS Free plan** (15 Android + 15 iOS builds/month, 1
  concurrency, low-priority queue only **[V]**), Expo's own docs say *"The low-priority queue time
  during peak will frequently grow to an hour or more"*, where peak is *"the middle of the business
  day in North American timezones."* **[V]**
- **EAS Starter: $19/month** — $45 of build credit, high-priority queue, **1 concurrency** (extra
  concurrencies are $50 each, up to 6). **[V]** Starter fixes queue *priority*, not throughput.
- **EAS Production: $199/month** — 2 included concurrencies, ~$225 of bundled credit. **[V]**

**Recommendation:** stay on Free until the waiting genuinely annoys you, then buy Starter. Building
off-peak (evenings in Mexico) mostly dodges the queue.

**If it fails — the three common first-build causes:**

| Symptom | Cause | Fix |
|---|---|---|
| `None of these files exist` | Your app imports a file listed in `.gitignore`. EAS only uploads git-tracked files. | Un-ignore it, or base64-encode it into an EAS environment variable. |
| `WARN Ignoring not compatible lockfile` then `ERR_PNPM_NO_LOCKFILE` | The image's pnpm is older than your lockfile format. | Step 1.2 — pin `packageManager` in the ROOT `package.json`. **[V]** |
| Dependency/SDK version mismatch | Drift between installed packages and Expo's expected versions | `npx expo-doctor` then `npx expo install --fix` |
| Out of memory on a large bundle | Default resource class too small | Add `"resourceClass": "large"` to the build profile |

The build detail page shows an *abridged* log. Full `xcodebuild` output can be ~10 MB — download the
full log if the abridged one isn't enough. **[V]**

**You'll know it worked when:** the EAS dashboard build page shows status **finished** with a
downloadable `.ipa` link.

---

### Step 1.10 — Windows-specific hygiene

**Never run a local native compile on this machine.** `npx expo run:ios` cannot run on Windows at all.
`npx expo run:android` hits a long-known Windows path-length failure in `react-native-screens` (a hard
dependency of `expo-router`): *"Filename longer than 260 characters"* on the second build, from the
NDK's CMake/Ninja toolchain.

**Status correction:** this is **known and worked around**, not unresolved. The upstream Expo issue
(expo/expo#36274) was **closed as completed on 2026-06-09** with a fix multiple users independently
confirmed: **[V]**

1. Enable Windows long paths (registry `LongPathsEnabled`).
2. Replace the bundled Ninja v1.10 at
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

**You CAN, today, with no Apple hardware:** write all the code, run it in Expo Go on Android, build
Android binaries via EAS, build iOS binaries via EAS, upload them to App Store Connect, and fill in
every field of the store listing.

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

---

### Step 1.13 — Submit the build

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

**You'll know it worked when:** the app opens on your iPhone and you can log in with a real gym staff
account.

**Cost:** $0. **Time:** 20 minutes.

---

### Step 1.15 — The daily iteration loop, once the phone is in hand

**One-time, to get live JS reload on device:**

```powershell
npx expo install expo-dev-client
```

```powershell
eas build --platform ios --profile development
```

Install that build via the EAS link. From then on:

```powershell
npx expo start
```

...and the dev build connects for live reload.

**For anything you can ship without a new binary:**

```powershell
eas update:configure
```

```powershell
eas update --channel production --message "fix: corrige el texto del recibo" --environment production
```

> The `--environment` flag is **required** on SDK 55 and later. **[V]**

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

Two parts. **2A is code you must write or you will be rejected.** **2B is forms.** Do 2A first — some
of it blocks the build you upload.

---

## 2A — Things you must BUILD into the app, or be rejected

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

**You'll know it worked when:** on a real device, tapping Cuenta → Eliminar cuenta → confirm either
removes the account immediately or shows a stated window, and a confirmation arrives in-app when done.
No path requires leaving the app to *start* the process.

**Cost:** one RPC + one screen. **Time:** under a day.

---

### 2A.2 — A permanent App Review demo account on an isolated demo gym (Guideline 2.1)

**The rule, verbatim:** *"include demo account info (and turn on your back-end service!) if your app
includes a login. If you are unable to provide a demo account due to legal or security obligations,
you may include a built-in demo mode in lieu of a demo account with prior approval by Apple. Ensure
the demo mode exhibits your app's full features and functionality."* **[V]**

**Good news:** the admin app's only sign-in is `signInWithPassword` (per
`docs/planning/2026-08-14-mobile-admin-app-rn-expo.md` §8). A fixed email + password is exactly what
Apple asks for. The magic-link worry recorded in the 08-13 playbook §3.3(a) applies to the **client**
app, not this one. **No demo-mode workaround needed.**

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

> **Decide now [?]:** reviewers sometimes exercise a newly built account-deletion flow (2A.1) against
> the demo account. Either exempt that email from real deletion, or re-seed after each review. No Apple
> documentation addresses this; it's inferred from general community experience.

**You'll know it worked when:** you log into a fresh install with only the pasted credentials and see
non-empty content on every tab with zero extra setup.

**Cost:** reuses existing seed tooling. **Time:** half a day.

---

### 2A.3 — Strip every in-app payment call-to-action

This is subtractive work and it is non-negotiable on the Mexico storefront.

**Two rules bind:**

**3.1.1(a), verbatim:** *"These entitlements are not required for developers to include buttons,
external links, or other calls to action in their United States storefront apps... In all other
storefronts, except for the United States storefront, where this prohibition does not apply, apps and
their metadata may not include buttons, external links, or other calls to action that direct customers
to purchasing mechanisms other than in-app purchase."* **[V]**

**Mexico is "all other storefronts."** This is a positive rule that binds by default, not an inference
from silence. There is no US-style entitlement for Mexico — Apple's own text says the US doesn't need
one, and the specific entitlement pages that exist cover other storefronts. **[V]**

**And the clause you actually ride:** *"3.1.3(c) Enterprise Services: If your app is only sold
directly by you to organizations or groups for their employees or students (for example professional
databases and classroom management tools), you may allow enterprise users to access previously-purchased
content or subscriptions. Consumer, single user, or family sales must use in-app purchase."* **[V]**

**Name 3.1.3(c) in your App Review notes, not 3.1.3(f).** iBookit is sold directly to gyms for their
staff — that is literally the clause's example set (professional databases, classroom management
tools). 3.1.3(f) Free Stand-alone Apps is the fallback; its own examples (VoIP, Cloud Storage, Email
Services, Web Hosting) are consumer infrastructure, and it carries a stricter trailing proviso: *"do
not need to use in-app purchase, provided there is no purchasing inside the app, or calls to action for
purchase outside of the app."* **[V]** *(The b2b-saas-verdict doc quotes this clause without that
proviso — the proviso is the load-bearing half.)*

**What to remove from the app and from the App Store metadata:**

- No "Actualizar plan" / "Upgrade" button
- No pricing or plan display of any kind
- No link to `ibooki.lat`'s checkout
- No "contáctanos para suscribirte" CTA
- No mention of subscription price in the App Store description or screenshots

**What is explicitly allowed:** *"Developers can send communications outside of the app to their user
base about purchasing methods other than in-app purchase."* **[V]** Renewal prompts belong in email,
WhatsApp, and desk signage.

**You'll know it worked when:** grep the mobile app's screens and your App Store metadata for
`precio`, `suscrib`, `plan`, `upgrade`, `pagar` — zero hits on anything tappable or promotional.

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

### 2A.8 — A note on 4.2 and 4.3, so you can stop worrying about them

- **4.2 Minimum Functionality** (*"beyond a repackaged website"*) is satisfied structurally by a real
  Fabric-rendered React Native UI. **[~]** The January-2026 forum rejection of a Capacitor booking app
  under 4.2 — the closest precedent anyone found — turned on the core transaction running through a web
  platform. That is no longer your architecture.
- **4.2.6** blesses your one-neutral-binary design by name: *"Another acceptable option for template
  providers is to create a single binary to host all client content in an aggregated or 'picker'
  model."* **[V]** **Open question [?]:** whether *credential-gated* tenant selection (no visible
  pre-login gym picker) satisfies 4.2.6 as cleanly as Apple's literal browsable-directory example. No
  primary source resolves it. A cheap hedge exists — one pre-login screen listing/searching gyms by
  name. Risk reads low, because a 100% staff-credential-gated B2B tool is closer to Slack's model than
  to a public directory. **Decide explicitly rather than defaulting silently.**
- **4.3(a)** *(no per-client bundle IDs)* was **amended on 2026-06-08** — Apple's changelog: *"4.3(a):
  clarifies the basis for the guideline and adds an example."* **[V]** The added rationale
  (*"This practice results in unnecessary apps, which makes it hard for users to find the apps they
  want."*) strengthens your one-binary decision. *(Note: the 08-14 anchor doc implies no 2026 change
  here. It changed.)*
- **4.3(b)** was amended the same day. Its operative sentence is broad: *"Don't submit apps that are
  indistinguishable from what's already widely available."* **[V]** The named saturated categories
  (dating, flashlight, sound effects, wallpaper, simple timers, fortune telling) are an illustrative
  list, not a closed one. Your risk is low because you are a credentialed B2B tool with a real backend
  — not because gyms are absent from the list.
- **5.1.1(ix)'s** legal-entity requirement (*"should be submitted by a legal entity... not by an
  individual developer"*) applies **only** to highly regulated fields: banking, healthcare, gambling,
  cannabis, air travel, crypto. A gym-ops tool is none of these. **Persona física enrollment is
  fine.** **[V]**

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
| **Name** | `iBookit` — 2 to 30 characters, globally unique across the App Store **[V]** | No — editable until submission |
| **Primary Language** | See the warning below | Effectively yes |
| **Bundle ID** | Select `com.ibookit.admin` from the dropdown | **Until first build upload** — see below |
| **SKU** | `ibookit-admin-ios`. An internal-only string, never shown to customers, unrelated to pricing. Letters, numbers, hyphens, periods, underscores; cannot start with a hyphen/period/underscore | **YES — locked the moment you click Create** **[V]** |
| **User Access** | **Full Access** | No |

**Required role:** Account Holder, App Manager, or Admin. **[V]** As a solo developer you are the
Account Holder.

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
| **Subtitle** | e.g. `Gestión diaria de tu gimnasio` — max **30 characters** **[V]** | Optional but recommended; shows under the app name |
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

**Do this:** App Information sidebar → **App Privacy** → **Get Started**.

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
| **Keywords** | **100 BYTES total, shared across all keywords** **[V]** | Yes | Comma-separated, no spaces after commas |
| **Promotional Text** | max **170 characters** **[V]** | No | **The only field editable without a new build/review after the app is live** |
| **What's New** | max 4,000 characters **[V]** | Required for every version **after** the first | |
| **Support URL** | — | **Yes** | Must resolve to a live page with a real contact channel |
| **Marketing URL** | — | No | e.g. `https://ibooki.lat` |

> 🚨 **Keywords is 100 BYTES, not 100 characters — and this bites Spanish specifically.** **[V]**
> Accented characters (í, ñ, á, é, ó) cost **2 bytes each** in UTF-8. `membresías` is **11 bytes**, not
> 10. Count bytes. And the budget is shared across *all* keywords combined, not per keyword — writing
> ten keywords assuming 100 characters each is the classic first-timer mistake.
>
> Example that fits: `gimnasio,gym,clases,reservas,checkin,membresias,socios,agenda` (61 bytes; note
> the deliberately unaccented spellings).

**You'll know it worked when:** Description, Keywords and Support URL show no validation error.

**Cost:** $0. **Time:** 45 minutes of writing.

---

### Step 2B.8 — Screenshots

**Upload 1–10 screenshots for the 6.9" iPhone size.** That is the only size you need.

**The accepted portrait dimensions for the 6.9" tier are: 1260×2736, 1290×2796, OR 1320×2868.** **[V]**
Any of the three uploads cleanly. *(The anchor doc's 1290×2796 is **not** stale and does **not** need
redoing — an earlier research pass claimed it would fail validation. It won't.)*

**Format:** PNG or JPEG, RGB, **no alpha channel or transparency**. **[V]**

**Scaling covers every smaller iPhone automatically.** Apple's actual chain: **[V]**

- 6.5" uses scaled 6.9" screenshots
- 6.3" uses scaled 6.5" screenshots
- 6.1" uses scaled 6.5" screenshots
- 5.5" uses scaled 6.1" screenshots
- iPad 12.9" uses scaled 13" screenshots

*(There is no 4.7" tier on Apple's page any more.)* **Upload only the 6.9" set and every iPhone tier is
covered.**

**iPad:** because `expo.ios.supportsTablet` is `false`, the 13" iPad slot never appears. If you ever
turn tablet support on, the 13" tier becomes required and accepts **2064×2752 or 2048×2732** portrait.
It does not scale up from smaller iPad sizes. **[V]**

**Content rules:**

- **Guideline 2.3.3:** *"Screenshots should show the app in use, and not merely the title art, login
  page, or splash screen."* **[V]** A screenshot set showing only a login wall is a common rejection
  for gated B2B apps.
- **Guideline 2.3.9:** *"you should display fictional account information instead of data from a real
  person."* **[V]** Capture from the **seeded demo gym** (2A.2). This makes the demo seed a
  prerequisite for the *metadata*, not just for the review.

**Where:** on the version page, per localization. If you later add a second language, you re-upload the
whole screenshot set for it.

**App Preview videos are optional.** Screenshots are the only mandatory visual asset. If you ever want
one, re-verify the spec first — the technical figures floating around (15–30 seconds, H.264 .mov/.m4v/.mp4
or ProRes 422 HQ, 30fps max, up to 3 per localization per size) are **[?] community-sourced**; Apple's
dedicated App Preview Specifications page 404'd on direct fetch.

**Editing window:** once the version status is "Waiting for Review", you can still edit *some*
metadata, but you **cannot upload or edit screenshots or previews.** Get them right before submitting.

**You'll know it worked when:** the 6.9" slot shows 1–10 images with no dimension or format error.

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
   > Esta app se vende directamente a organizaciones para sus empleados (Directriz 3.1.3(c), Enterprise
   > Services). No contiene compras ni llamadas a la acción de compra de ningún tipo.

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
| JS logic, copy, new screens from existing components, brand tokens, new RPC calls | **`eas update`** — instant, no review |
| Any native module, Expo SDK / RN bump, new permission string, icon or splash | **New binary + full App Review** |
| Description, "What's New", Keywords, or Support URL on a **live** app | **New binary submission + App Review** since an April 2018 policy change **[?]** — batch copy fixes with feature updates |

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

Exactly one thing, and it is real: **the right to sell inside the app, and to talk about price
in-app.** Once the subscription IS an in-app purchase, anti-steering stops binding *for that item* —
you can show a paywall, show the price, run a free trial, and promote it. Today, on the Mexico
storefront, you can do none of that (2A.3).

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
  **Settle your naming convention before you type it once**, e.g. `lat.ibooki.sub.gym.mensual`.

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
→ choose **3, 16, or 28 days** → choose **All Renewals** or **Only Paid to Paid Renewals** → choose
**Production and Sandbox Environment** → Confirm.

**What it does:** a subscriber whose card declines at renewal keeps access while Apple silently
retries, instead of being cut off.

**Caveats:** **[V]**

- Weekly subscriptions cap the actual grace at 6 days even if you select 16 or 28.
- Does not apply to monthly subscriptions with a 12-month commitment.
- **"Configuration changes can take up to 24 hours to take effect and apply only to upcoming
  renewals."** Flip it on, test immediately, and you'll wrongly conclude it's broken.
- Your app must still check renewal info to know a subscriber is in grace.

**Required role:** Account Holder, Admin, or App Manager. **[V]**

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

---

### Step 3C.5 — Initialize, fetch, purchase, restore

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

### Step 3C.7 — The server: a Supabase Edge Function for RevenueCat webhooks

**Do this** (mirroring the repo's existing `send-email` pattern):

1. Create an Edge Function, e.g. `revenuecat-webhook`.
2. Verify authenticity via the `X-RevenueCat-Webhook-Signature: t=<ts>,v1=<hmac>` header —
   HMAC-SHA256 over `"<timestamp>.<raw_body>"`, constant-time compare. (A configured Authorization
   header is the weaker alternative.)
3. Handle `event.type`: `INITIAL_PURCHASE`, `RENEWAL`, `CANCELLATION`, `EXPIRATION`, `BILLING_ISSUE`.
4. Upsert a row keyed on `gym_id`.
5. **Return 200 quickly.** RevenueCat retries failed webhooks up to 5 times over 5/10/20/40/80 minutes.

> 🚨 **Deploy with `--no-verify-jwt` or every webhook gets a 401.** Supabase Edge Functions reject
> unauthenticated POSTs by default, and neither RevenueCat nor Apple sends a Supabase JWT. This repo's
> `AGENTS.md` already documents the flag on the deploy command. Missing this costs you a full
> debugging session against a silent, retrying webhook.

**The table** — note the RLS lines, which are not optional in this repo:

```sql
create table gym_apple_subscriptions (
  gym_id                 uuid primary key references gyms(id),
  original_transaction_id text not null,
  status                 text not null, -- active | grace_period | expired | revoked | billing_retry
  product_id             text not null,
  expires_at             timestamptz,
  last_notification_type text,
  updated_at             timestamptz not null default now()
);

alter table gym_apple_subscriptions enable row level security;

create policy gym_apple_subscriptions_staff_select
  on gym_apple_subscriptions
  for select
  using (is_staff_of(gym_id));
```

Writes come only from the Edge Function (service role), so no insert/update policy is needed for
clients.

**Handling refunds:** *"When a customer requests a refund for a subscription, their subscription is
canceled immediately with auto renew status set to false. If the refund request is approved, the
transaction will have a revocation date populated."* **[V]** Two nuances: the subscription stays
**active until its expiration date** (auto-renew off ≠ instant cutoff), and Apple fires a
`CONSUMPTION_REQUEST` notification inviting you to submit consumption data it weighs in the decision.
**You cannot veto a refund, but you should answer `CONSUMPTION_REQUEST` rather than ignore it.**

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

4. **Build a dev build and install it:**

   ```powershell
   eas build --platform ios --profile development
   ```

   Install via the EAS link (the iPhone must already be registered per step 1.8).

5. **Run a purchase.** Watch the RevenueCat dashboard's **Sandbox** event feed and your Edge Function
   logs (`supabase functions logs` or the dashboard) to confirm the webhook landed.

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
| Client (init, offerings, purchase, restore, paywall meeting 3.1.2(c), wiring `appUserID` = `gym_id`) | 2–4 |
| Server — RevenueCat webhook only (one Edge Function, one table, HMAC verification) | 2–4 |
| Server — Apple-direct verification as well (JWS/x5c, notification state machine, API client) | +3–5 |
| Testing (sandbox setup, a full renewal/grace/expiry cycle, one TestFlight pass) | 2–3 |
| **Total, RevenueCat only** | **6–11** |
| **Total, with Apple-direct reconciliation** | **9–16** |

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
                                ├─> Server notification URLs set (BOTH)
                                └─> iPhone registered (eas device:create, 24–72h on a new membership)
                                      └─> EAS dev build installed
                                            └─> Sandbox tester created + signed in on device
                                                  └─> First sandbox purchase
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
5. **Cite 3.1.3(c) Enterprise Services** in your App Review notes (3.1.3(f) as fallback).
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

| Trap | What happens | Prevention |
|---|---|---|
| **`git init` inside `apps/mobile`** | EAS can't find the pnpm lockfile, falls back to yarn, 404s on `workspace:*` packages | Scaffold as a plain subfolder. Never a second `.git`. **[V]** |
| **Enrollment stuck → you pay a second time** | Duplicate charge + a refund chase on top of a multi-week wait | Contact support at the **24-hour** mark. Never re-enroll. **[V]** |
| **Web-path membership does not auto-renew** | A year later the app vanishes for new downloads and you lose Certificates access | Turn on **Auto-renew** in Membership details. Opt-in for web enrollment. **[V]** |
| **The `.p8` files download once** | Unrecoverable. Revoke + regenerate + re-point config | Save the ASC API key `.p8` (step 1.7) and the In-App Purchase key `.p8` (step 3C.3) the instant they download |
| **SKU is locked at app-record Create** | Permanent, forever | Decide `ibookit-admin-ios` before clicking Create. **[V]** *(Bundle ID is only locked at first build upload — you get a window there)* |
| **`appVersionSource` not `remote`** | Second submission rejected for a duplicate build number, with an opaque error | Set `"cli": {"appVersionSource": "remote"}` + `"autoIncrement": true` **before the first build**. **[V]** |
| **Family Sharing on a subscription** | *"you can't turn it off"* — a household mechanic on a business product | Leave it OFF. **[V]** |
| **Product ID typo** | Permanent, and can never be reused in that app even after deletion | Settle the naming convention before creating the first product. **[V]** |
| **The Paid Apps Agreement** | *"you can't undo this action"* | Read the Schedule 2 PDF in a real reader first. **[V]** |
| **The W-8BEN** | One-shot; corrections require contacting Apple | Get it right. *(The Mexico RFC/CURP/Cédula fields **are** editable any time — those are safe.)* **[V]** |
| **Missing EU trader declaration** | App **removed** from all 27 EU storefronts (since 2025-02-17) | Declare trader status with a P.O. Box. Silence is removal, not neutrality. **[V]** |
| **Keywords counted in characters** | Silent overrun at the worst moment; accented Spanish costs 2 bytes/char | It's **100 bytes**. **[V]** |
| **Icon with an alpha channel** | Rejected during processing, before a human sees the app | 1024×1024 PNG, sRGB, flattened, no transparency |
| **IAP review screenshot at App Store dimensions** | Incorrect-size rejection on upload | **640×920 minimum** — its own spec. **[V]** |
| **Edge Function deployed without `--no-verify-jwt`** | Every webhook 401s silently while RevenueCat retries | Deploy with the flag |
| **Reviewer credentials rotated or demo gym cleaned up** | A *future* update rejected on a broken login, with no real defect | Exclude the demo tenant from every cleanup script. Permanent fixture. |
| **Demo gym seeded in a scratch Supabase project** | 2.1 rejection on first submission | Seed it in the **production** project the shipped binary points at |
| **One Apple ID, two gyms** | The second purchase resolves as "already subscribed". No workaround | Answer this before writing Stage 3 code. **[V]** |
| **RevenueCat transfer behavior left at default** | One gym's entitlement leaks to another, or gets stranded | Set it explicitly in the dashboard |
| **`Purchases.restorePurchases()` on every launch** | Unexpected Apple ID sign-in prompts; reads as broken | Explicit button only. Use `syncPurchases()` for silent restores |
| **Device registered after the build** | The build won't install; ad-hoc profiles embed only devices known at build time | `eas device:create` first, then build. Expect 24–72h on a new membership. **[V]** |
| **Signing certificate** | One per Apple Developer account. A second machine or CI runner hits the ceiling | Let EAS hold it. `eas login` from anywhere. **[V]** |

---

# What is still unknown

Ranked by how much damage each does. **Every one of these appears in place, in the relevant step,
too — not only here.**

1. **Does Apple issue a CFDI for a third-party in-app subscription in Mexico?** **[?]** Kills or saves
   the entire Stage 3 business case. **Settle it:** on a Mexican Apple ID, add your RFC under Settings
   → Apple Account → Payment & Shipping → Tax Information, buy any third-party app's real IAP
   subscription, and watch for an EDICOM email. **One hour.**
2. **Is Apple a legally recognised SAT retention agent, or is its withholding a private commercial
   arrangement?** **[?]** Determines whether you owe additional personal SAT filings. **Settle it:** an
   accountant, not more research.
3. **The verbatim text of Schedule 2** (commission, refund cost allocation, termination,
   indemnification). **[?]** Never read in any pass — the PDF resisted extraction three times.
   **Settle it:** download and open it in a PDF reader before signing.
4. **Does web enrollment truly complete with zero Apple hardware?** **[~]** An argument from silence
   plus a carve-out list that excludes you. **Settle it:** run the flow. If it hands you to the Apple
   Developer app, wait for the iPhone or use the support escape hatch.
5. **Does credential-gated tenant selection satisfy Guideline 4.2.6** as cleanly as Apple's literal
   browsable-picker example? **[?]** No primary source either way. **Settle it:** ship without the
   hedge and accept the residual risk, or add a one-screen pre-login gym picker.
6. **Does RevenueCat really auto-populate `appAccountToken` from a UUID `appUserID`?** **[?]**
   RevenueCat's own primary docs say nothing about it. **Settle it:** decode a sandbox JWS payload and
   look.
7. **Does `@apple/app-store-server-library` run inside a Supabase Edge Function via Deno's `npm:`
   specifier?** **[?]** **Settle it:** a 20-minute import spike, before designing the Apple-direct
   server path.
8. **Is a Mexican INE accepted as photo ID for Apple identity verification?** **[?]** No Apple page
   enumerates Mexico. **Settle it:** moot — use a passport.
9. **What does the $99 cost in pesos, and is 16% IVA added?** **[?]** No Apple page publishes it.
   **Settle it:** read the checkout screen before paying.
10. **Which Required Reason API declarations does iBookit's actual dependency tree need?** **[?]** Not
    knowable from docs. **Settle it:** submit, read Apple's ITMS-91053 email, patch `app.json`, rebuild.
11. **Does Brazil's "Missing Tax Form" distribution block apply to apps that never accept the Paid Apps
    Agreement?** **[?]** **Settle it:** exclude Brazil from v1 at zero cost, or just try it.
12. **Which named Tax Category fits a B2B SaaS subscription?** **[?]** Mechanism documented, list not.
    **Settle it:** open the picker.
13. **Whether the Mexico banking form names CLABE, and whether payouts land in MXN.** **[?]**
    **Settle it:** open the Add Bank Account screen (only visible after signing Schedule 2).
14. **Can a cloud device farm install an ad-hoc / dev-client `.ipa`?** **[?]** The "does a farm
    substitute for an iPhone" question. **Settle it:** ask BrowserStack support directly.
15. **Whether internal TestFlight builds skip Beta App Review.** **[~]** Widely believed, consistent
    with Apple's external-only phrasing, not stated on the internal-testers page.
16. **App Review Board appeal turnaround (commonly cited as 5–7 business days).** **[?]** Community
    folklore; Apple publishes no figure.
17. **App Store Connect build-processing duration.** **[?]** No Apple SLA exists. Community range: 10
    minutes to several hours. Do not plan around a "15 minute" number.

---

# Fast path — the runsheet

Once you've read the above, use this. One line per step.

**Stage 0 — account** *(45 min + 24h–weeks wait, $99)*

1. Enroll as **Individual**. Write down your exact legal name from your passport.
2. `account.apple.com` → Personal Information → set first/last name to your **legal** name.
3. Same page → Sign-In and Security → **two-factor ON**, trusted phone number added.
4. `developer.apple.com/programs/enroll/` → Start Your Enrollment. **Web path, not the app.**
5. Accept the Apple Developer Agreement → Enroll Now.
6. Enter legal name, phone, **physical street address** (no P.O. box), entity type **Individual**.
7. Upload the passport photo page if prompted.
8. Accept the Program License Agreement (DPLA).
9. **Read the peso amount**, then pay $99 with **your own card**.
10. Wait. Contact support at **24 hours**. **Never pay twice.**
11. `developer.apple.com/account` → Membership details → **Auto-renew ON**. (Mandatory on the web path.)
12. Open `appstoreconnect.apple.com` once. Create nothing.

**Stage 1 — code to app file** *(1–2 days, $0)*

13. Install Node 22+, pnpm, `npm install --global eas-cli`. `eas login`. `eas whoami`.
14. Pin `"packageManager": "pnpm@<version>"` in the **root** `package.json`.
15. `npx create-expo-app apps/mobile` from the repo root. **Never `git init` inside it.**
16. `git check-ignore -v pnpm-lock.yaml pnpm-workspace.yaml` → must print nothing.
17. Write `apps/mobile/app.json` (bundle ID, `supportsTablet: false`, `usesNonExemptEncryption: false`,
    fingerprint runtimeVersion, 1024×1024 no-alpha icon).
18. Write `apps/mobile/eas.json` with `appVersionSource: "remote"` and `autoIncrement: true`.
19. `eas credentials` → iOS → production → let EAS manage. This also registers your Bundle ID.
20. App Store Connect → Users and Access → Integrations → **+** → Admin role → **save the `.p8`
    (one-time download)**. Fill `eas.json`.
21. `eas device:create`, open the URL on the iPhone. **Expect 24–72h on a new membership.**
22. `eas build --platform ios --profile production`.

**Stage 2A — must-build items** *(3–7 days, $0)*

23. Build in-app **account deletion** (5.1.1(v)) with a retention-disclosure screen.
24. Seed the **permanent reviewer demo gym + fixed-password account** in the **production** Supabase
    project.
25. Strip **every** payment CTA, price display, and checkout link from the app and its metadata.
26. Write specific Spanish `*UsageDescription` strings for every permission you request.
27. If shipping push: works with permission denied, no sensitive payload, opt-in for promo.
28. Add `ios.privacyManifests` declarations (expect one ITMS-91053 round trip).

**Stage 2B — the store listing** *(1 day of forms + 1–5 days review, $0)*

29. Apps → **+** → New App: Platforms **iOS**, Name `iBookit`, Primary Language **Spanish (Mexico)**,
    Bundle ID from dropdown, SKU **(locked at Create)**.
30. Copy the numeric **Apple ID** from App Information into `eas.json`'s `ascAppId`.
31. App Information: Subtitle, **Privacy Policy URL**, Category **Business**, Copyright, default EULA.
32. Pricing and Availability → **Free**. All territories except China (and Brazil for now).
33. Business → Compliance → **declare EU trader status with a P.O. Box.**
34. `eas submit --platform ios --profile production --latest`.
35. Version page → **Build** section → **+ Add Build** → select the processed build.
36. Age Ratings → questionnaire → answer social-media **No** → lands at **4+**.
37. App Privacy questionnaire → Yes/Data Linked to You/Not used to track/App Functionality.
38. Version metadata: Description (4,000), **Keywords (100 BYTES)**, Support URL, Marketing URL.
39. Screenshots: 1–10 at 6.9" (1260×2736, 1290×2796 **or** 1320×2868), PNG/JPEG, **no alpha**,
    **post-login screens from the demo gym**.
40. App Review Information: Sign-In Required ON, demo credentials, contact info, notes citing
    **3.1.3(c)**.
41. Export compliance should be pre-answered. If "Missing Compliance": answer Yes → exempt.
42. Release option: **Manually release this version**. → **Submit for Review**.
43. If rejected: read the guideline cited, reply in the App Review thread, fix, resubmit. No limit, no
    fee. One appeal max.
44. **Pending Developer Release** → **Release This Version**. Up to 24h to appear.

**Stage 3 — only if you override the ruling** *(6–16 dev days + days-to-weeks paperwork, 15% of revenue)*

45. **Run the CFDI test first** (Mexican Apple ID + RFC + any third-party IAP subscription → EDICOM
    email?). This decides everything.
46. Business → Agreements → Paid Apps → **read the PDF** → Agree. **Irreversible.**
47. Tax: W-8BEN (**one-shot**), RFC/CURP/Cédula (editable any time).
48. Banking: one account, name in English characters matching the bank exactly.
49. Enroll in the **Small Business Program** (15%; effective 15 days after the enrollment month ends).
50. Subscriptions → **+** → Subscription Group (reference name only).
51. Create the subscription: **Product ID is permanent**. Duration. Price with **Mexico as base
    country**. Localization (Display Name 2–30, Description ≤45). **Family Sharing OFF.**
52. Upload the review screenshot at **640×920 minimum**. Set the Tax Category.
53. Optional: Introductory Offer → Free Trial (fixed duration picker).
54. Billing Grace Period: 16 days, Production and Sandbox. **Takes up to 24h to apply.**
55. App Information → General Information → **App Store Server Notifications**: set **BOTH** URLs, V2.
56. Answer: **what happens when one Apple ID runs two gyms?** No code until this is answered.
57. `npx expo install react-native-purchases react-native-purchases-ui`. Smoke-test issue #1712 (30
    min).
58. Users and Access → Integrations → **In-App Purchase** → generate key → **save the `.p8`** → upload
    to RevenueCat.
59. RevenueCat dashboard: Products → Entitlement `pro` → Offering **marked CURRENT** → Packages →
    **set transfer behavior**.
60. Code: `configure({ appUserID: gymId })`, `getOfferings`, `purchasePackage` (branch on
    `userCancelled`), **restore button**, `showManageSubscriptions`.
61. Paywall: name + duration + **localized full renewal price as the most prominent element**, Privacy
    Policy + Terms links, restore button.
62. Edge Function for RevenueCat webhooks. **Deploy with `--no-verify-jwt`.** Table with **RLS
    enabled**.
63. Sandbox: create a tester (email must not be an existing Apple Account), set renewal speed, sign in
    on iPhone via **Settings → Developer → Sandbox Apple Account**. Never sign out of your real ID.
64. Walk a full renew → retry (10 min) → grace (5 min) → expire cycle. 12 renewals max.
65. One internal TestFlight pass (free purchases, daily renewals, 6 max in a week).
66. Revise the account-deletion flow to warn about Apple billing before deletion.
67. Submit the subscription **attached to a new app version**. Both clear review together.

---

*End of guide. Every claim above carries its marker. Where a step says [?], that is the honest state of
the evidence — treat it as a thing to go settle, not a fact to build on.*
