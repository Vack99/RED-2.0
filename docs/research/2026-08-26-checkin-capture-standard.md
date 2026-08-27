# Check-in/attendance capture industry standard — research (2026-08-26)

Scope: 9 core platforms for Q1 (Mindbody, Glofox, Gymdesk, Wodify, Zen Planner, PushPress, Vagaro,
Kisi, Brivo) plus 5+ LatAm-market platforms for Q4 (Fitco, Trainingym, Klasius, Crossfy, GymHero,
Buq, Reeply, GymUp). Sources are official help-center/knowledge-base articles unless marked
**[MARKETING]** (vendor blog/marketing/landing page) or **[SECONDARY]** (third-party, not the
vendor). "No primary source found" is stated explicitly per cell rather than omitted, per task
instructions.

Many Zendesk-hosted help sites (help.wodify.com, support.glofox.com specific articles,
support.vagaro.com) returned HTTP 403 to the fetch tool; those claims are sourced from
search-engine snippets of the same exact article URL rather than a full-page fetch — noted once
here rather than per row, matching the sibling doc's convention.

---

## Q1. Check-in modalities per platform

| Platform | Staff manual roster | Self-check-in kiosk/tablet | Member self-check via own phone | QR/barcode scan | RFID/keyfob/door-access | Coach/instructor mobile roster |
|---|---|---|---|---|---|---|
| Mindbody | Yes — "Client Check In screen" (sign-in screen) | Yes — dedicated **Mindbody Check-In app** turns any tablet into a kiosk | Yes — "Self Check In" lets clients mark themselves arrived; Check-In app also ships for iPhone, not just iPad | Yes — barcodes/key-tag IDs assigned per client, scanned at front desk | Via partners only (Kisi, Brivo — see hardware table); not native | No primary source found for a role distinct from the general staff/front-desk app |
| Glofox | Implied via Glofox Pro staff app/dashboard; no dedicated "manual roster" article found | Yes — **"Getting Started with the Check-in Kiosk"**, tablet at entrance, Class View/Search View | Yes — Member App shows an in-app barcode the client opens and holds to a scanner | Yes — **"How to Set up Barcodes and Scanners"**, Code-39 barcodes | Yes — **Access Monitoring** (badge auto-marks "attended" within 1h of a booked class) + Kisi integration (Boost/Elite tiers only) | No primary source found |
| Gymdesk | Implied, not separately documented | Yes — "Front Desk Mode" turns a tablet into a kiosk: tap name, 4-digit code, or scan | No primary source found for check-in via the member's own phone outside kiosk mode | Yes — barcode/QR scan is one of 3 kiosk options | Yes — **Door Access Integrations** doc; recommends Seam for simple app-based access, Kisi for advanced control | No primary source found |
| Wodify | Implied via Coachboard, not separately named "manual roster" | Yes — **Kiosk+** (tablet-based; "Hardware Checklist for Kiosk+" exists as a dedicated article) | No primary source found | No primary source found specific to class check-in (Self-Service POS uses barcode for retail, not confirmed for attendance) | No primary source found (Wodify does not appear in Kisi's or Brivo's published partner lists) | **Yes — explicit.** Coachboard's "Sign In control": coach taps a member's name next to their reservation to mark them Signed In |
| Zen Planner | Implied, general | Yes — **[MARKETING]** Kiosk Mode on the Staff App / legacy Kiosk iPad App: "members can simply walk up, find their name and check in with a single tap" | No primary source found | No primary source found (fob/keytag support could not be confirmed — Daxko's Salesforce-hosted community-hub articles on Kiosk Mode returned load errors to the fetch tool) | No primary source found | No primary source found |
| PushPress | Implied via Staff App | Yes — **"Kiosk Mode Check-Ins with the Staff App"** | Yes — **"Member App | Check-In"**: member taps Check In on their reservation from their own phone | Yes — **"How to Check Members into Open Gym Using Barcode Scanner"** (USB scanner, open-gym specific) | No primary source found | **Yes — explicit.** "Coach Check-In Options": Staff App tap-to-mark, individual or bulk; PushPress's own docs call this "the most common method for class-based gyms" |
| Vagaro | Yes — **"Check in a Customer - Web Version"** | Yes — **"Manage Your Check-In Kiosks"** / "Activate the Check-In App", tablet running the Check-In App | Yes — but manual, not geofence-automatic: **"Set Up Contactless Check-In"** lets a client tap check-in in their own app up to 15 min before start; no geofence/auto-trigger language found | Yes — client scans their Vagaro QR code at a kiosk | No primary source found (Vagaro does not appear in Kisi's or Brivo's partner lists) | No primary source found |
| Kisi (access-control vendor) | N/A — not a booking platform | N/A | Kisi mobile app can itself be the credential (tap-to-unlock from phone) | N/A | **Yes — this is its core product.** Keyfobs, keycards, phone-tap, or the Kisi app; integrates with Mindbody, Glofox, Gymflow, Gymdesk. On Mindbody specifically, a door unlock auto-checks the member in | N/A |
| Brivo (access-control vendor) | N/A | N/A | Mobile credentials via Apple/Google Wallet | N/A | **Yes — core product.** Integrates with Mindbody and WellnessLiving (native "Door Access powered by Brivo"); third-party case (Gymtiva) shows a door unlock event pushed to the platform as the official check-in | N/A |

Sources: Mindbody — https://support.mindbodyonline.com/s/article/203259073-Sign-in-screen-Check-in ,
https://support.mindbodyonline.com/s/article/205681418-Class-Check-in-for-iPad ,
https://support.mindbodyonline.com/s/article/214488678-Appointments-Check-In-Check-Out-Who-s-Here-Check-In ,
https://support.mindbodyonline.com/s/article/203258143-Where-can-I-assign-barcodes-in-MINDBODY ,
https://support.mindbodyonline.com/s/article/203258023-How-do-I-assign-a-barcode-ID-from-a-key-tag-to-a-client .
Glofox — https://support.glofox.com/hc/en-us/articles/360004211217-Getting-Started-with-the-Check-in-Kiosk ,
https://support.glofox.com/hc/en-us/articles/46466800354324-The-Member-App ,
https://support.glofox.com/hc/en-us/articles/360004161277-How-to-Set-up-Barcodes-and-Scanners ,
https://support.glofox.com/hc/en-us/articles/213396225-How-to-Set-up-Access-Monitoring (403, search-snippet only),
https://support.glofox.com/hc/en-us/articles/360016572198-Integrating-Access-Control-with-Kisi .
Gymdesk — https://docs.gymdesk.com/en/help/docs/door-access , https://docs.gymdesk.com/en/help/docs/kisi ,
https://gymdesk.com/blog/gym-check-in-system-setup-guide **[MARKETING]**.
Wodify — https://help.wodify.com/hc/en-us/articles/22901790704151-Hardware-Checklist-for-Kiosk (403, snippet only),
https://help.wodify.com/hc/en-us/articles/12277777089175-Understand-Coachboard-Functions-in-Kiosk (403, snippet only),
https://help.wodify.com/hc/en-us/articles/9639394363159-Set-Up-Kiosk (403, snippet only).
Zen Planner — https://zenplanner.com/software-features/kiosk-mode-on-staff-management-app-gyms/ **[MARKETING]**.
PushPress — https://help.pushpress.com/en/articles/6636984-kiosk-mode-check-ins-with-the-staff-app-by-pushpress ,
https://help.pushpress.com/en/articles/4502509-member-app-check-in ,
https://help.pushpress.com/en/articles/866896-core-how-to-check-members-into-open-gym-using-barcode-scanner ,
https://help.pushpress.com/en/articles/5099488-core-check-in-coach-check-in-options .
Vagaro — https://support.vagaro.com/hc/en-us/articles/360015836134-Check-in-a-Customer-Web-Version ,
https://support.vagaro.com/hc/en-us/articles/5024382031131-Manage-Your-Check-In-Kiosks ,
https://support.vagaro.com/hc/en-us/articles/360038981033-Activate-the-Check-In-App ,
https://support.vagaro.com/hc/en-us/articles/360050950613-Set-Up-Contactless-Check-In (403, snippet only).
Kisi — https://www.getkisi.com/industry/gym , https://docs.kisi.io/marketplace/fitness/mindbody/ ,
https://www.getkisi.com/integrations/glofox .
Brivo — https://www.brivo.com/industry/gym-access-control-system/ , https://lp.brivo.com/mindbody ,
https://www.wellnessliving.com/features/brivo-access-control/ .

### Hardware partnerships (separate from software-only check-in)

| Platform | Documented hardware partnership | Source |
|---|---|---|
| Mindbody | Sells its own POS hardware (incl. barcode scanners) **[MARKETING]**; partners with Brivo for door access | https://www.mindbodyonline.com/business/point-of-sale ; https://lp.brivo.com/mindbody |
| Glofox | Kisi integration for keyfob/keycard/phone-tap door access, gated to Boost/Elite plans | https://www.getkisi.com/integrations/glofox |
| Gymdesk | Recommends Seam (simple, app-based) or Kisi (advanced) for door access; no proprietary hardware sold | https://docs.gymdesk.com/en/help/docs/door-access |
| Wodify | Kiosk+ is tablet-only per its own "Hardware Checklist" article; no RFID/door-access partner found | https://help.wodify.com/hc/en-us/articles/22901790704151-Hardware-Checklist-for-Kiosk |
| Zen Planner | Kiosk iPad App only (Daxko-owned); no distinct hardware partner confirmed | No primary source found |
| PushPress | Sells/recommends a USB QR/barcode scanner for open-gym check-in; no door-access hardware partner found | https://help.pushpress.com/en/articles/866896-core-how-to-check-members-into-open-gym-using-barcode-scanner |
| Vagaro | Own tablet-based Check-In App/kiosk only; no door-access hardware partner found | No primary source found |
| Kisi | **Is** the hardware/access-control vendor; partners named: Mindbody, Glofox, Gymflow, Gymdesk | https://www.getkisi.com/blog/gym-access-features |
| Brivo | **Is** the hardware/access-control vendor; partners named: Mindbody, WellnessLiving, Gymtiva | https://www.brivo.com/industry/gym-access-control-system/ |

Notes:
- **All 6 booking platforms researched document a self-check-in kiosk/tablet mode** (Mindbody, Glofox,
  Gymdesk, Wodify, Zen Planner, PushPress, Vagaro — 7 of 7), making it the single most universally
  documented modality, ahead of staff-manual marking (which is mostly *implied*, rarely given its own
  dedicated help article, across all 7).
- QR/barcode scanning is the second most universal modality (5 of 7: Mindbody, Glofox, Gymdesk,
  PushPress, Vagaro) and is usually layered onto the same kiosk device, not a separate purchase.
- Only 2 of 7 platforms (Wodify, PushPress) have an explicit, separately-named **coach/instructor
  mobile roster** article distinct from generic staff tooling — and PushPress's own docs state this
  is "the most common method for class-based gyms," directly on point for a class-only operator.
- Physical RFID/door-access hardware is real but consistently an **upsell via a third-party
  integration** (Kisi, Brivo, Seam), never a platform's own native default — Glofox explicitly gates
  it to its top two pricing tiers.
- "Member self-check-in via own phone" exists for 4 of 7 platforms (Mindbody, Glofox, PushPress,
  Vagaro) but where the exact trigger is documented (Vagaro), it is a **manual tap inside a time
  window**, not automatic geofencing — no platform in this set was found to document true
  location-triggered auto-check-in.

---

## Q2. Default flow for a small studio with no hardware budget

| Source | Finding | URL |
|---|---|---|
| Gymdesk blog, "How to Set Up a Gym Check-In System for Under $150" **[MARKETING]** | States plainly: "A tablet on a wall mount does 95% of what those systems do at 5% of the cost." Recommends a $85–$97 budget setup (Fire tablet + wall mount) or $180–$195 premium setup (refurbished iPad 7th-gen+ + stand) running self-check-in (tap name / 4-digit code / barcode-QR); staff-manual "mass check-in" is positioned as the fallback specifically for kids' classes, not the general default | https://gymdesk.com/blog/gym-check-in-system-setup-guide |
| Mindbody blog, "Start Lean, Scale Smart: Mindbody for Small & Emerging Studios" **[MARKETING]** | Frames its Check-in app + Business app combo as the small-studio default, explicitly for businesses "short on desk staff," pointing to Self Check-In rather than staff marking | https://www.mindbodyonline.com/business/education/blog/start-lean-scale-smart-mindbody |
| Glofox blog, "The Best Gym Check In System" **[MARKETING]** | Declines to name one universal default; acknowledges staff-manual check-in persists for "personal connection" (staff saying "Welcome back, Sarah!") but names its costs explicitly — higher labor cost, rush-hour bottlenecks, no access outside staffed hours — while positioning self-service kiosks as the fix for peak-hour staffing pressure | https://www.glofox.com/blog/gym-check-in-system/ |
| IHRSA/ClubIntel 2016 Health Club Consumer Report (via secondary coverage) **[SECONDARY]** | No check-in-*technology* statistic found. Report covers attendance frequency (~2 visits/week, 101–103 visits/year) and broad program/tech trend categories, not which check-in method studios actually use | https://www.fittechglobal.com/fit-tech-features/IHRSA-update-Membership-patterns/31225 |
| Aggregate vendor search (GymLeads FrontDesk, Zipper, Gymdesk Front Desk Mode) **[MARKETING, multiple vendors]** | Independent vendors converge on the same shape of product — "iPad at the front desk, no extra hardware" — as the small-studio pitch; no single article covers all three, this is a pattern across separate vendor pages | https://gymdesk.com/blog/gym-check-in-system-setup-guide (representative) |

Synthesis: No vendor content found frames staff-manual roster-marking as the recommended default for
a budget-constrained studio. Every "how to check in members cheaply" resource found — across three
unrelated vendors — instead recommends a self-check-in tablet/kiosk running the platform's own
software as the default, at a total hardware cost under $200 (often a repurposed/budget tablet, no
specialized hardware purchase). Staff-manual marking survives only as an explicitly-named fallback
(e.g., "mass check-in" for kids' classes) or as a "community feel" tradeoff a studio consciously
accepts along with its labor-cost/bottleneck downsides. No formal industry survey (IHRSA/ClubIntel or
otherwise) was found that quantifies actual studio-by-studio adoption rates — this finding rests on
vendor-guidance convergence, not a demographic study.

---

## Q3. Feature-convention gap scan

| Feature | Prevalence | One-line finding | Source |
|---|---|---|---|
| (a) Waitlist auto-promote + auto-charge-on-promote | Auto-promote: common. Auto-charge specifically *at the moment of promotion*: rare/inconsistently documented | Glofox auto-promotes the first waitlisted client into an opened spot, but requires the "Pay later" toggle — payment is deferred, not confirmed to fire instantly on promotion; Momence's waitlist automation explicitly creates an **unpaid** reservation to be "settled later," the opposite of auto-charge-on-promote | https://support.glofox.com/hc/en-us/articles/360006355297-How-to-Set-up-a-Waitlist ; https://help.momence.com/en/articles/12026801-waitlist-faq-s-appointments |
| (b) Booking windows (open/close cutoffs) | Near-universal | Mindbody's "schedule window" independently governs both how far in advance a client may book AND how close to start booking remains open, with membership tiers able to get earlier access | https://support.mindbodyonline.com/s/article/Class-and-Course-Options-screen-Booking-Sign-in-Policies |
| (c) Class reminders/notifications | Near-universal for email/push among Western platforms; native WhatsApp is a LatAm-specific pattern, not seen in US-platform native docs | Mindbody supports opt-in email/text reminders and a separate class-waitlist SMS notification; WhatsApp appears only via third-party SMS-style integrations for Mindbody, but is a first-class **native** channel for LatAm platforms (see Q4) | https://support.mindbodyonline.com/s/article/How-to-opt-in-to-receive-auto-emails-reminders-and-notifications |
| (d) Spot/equipment selection at booking | Rare — vertical-specific, not general | Mariana Tek's "Pick-a-Spot" (bike/reformer/mat selection at booking) is explicitly marketed as a differentiator for cycling/Pilates studios; no equivalent feature surfaced in CrossFit- or general-purpose-oriented platforms (Wodify, PushPress) | https://www.marianatek.com/blog/six-features-that-make-the-first-studio-visit-easy-and-engaging/ **[MARKETING]** |
| (e) Recurring/standing member bookings | Common among modern platforms, not confirmed universal | Momence has an explicit customer-facing toggle ("Allow recurring booking by customers") plus an admin-side recurring-booking tool; no equivalent member-self-service recurring-booking article was found for Mindbody or TeamUp in this pass | https://help.momence.com/en/articles/8775484-book-recurring-appointments-for-a-customer |
| (f) Guest/drop-in passes | Near-universal | Glofox documents PAYG/Drop-in as a first-class client type with its own class-fee pricing tier, distinct from members — base-layer functionality, not an add-on | https://support.glofox.com/hc/en-us/articles/360017495337-How-to-Book-a-Client-into-a-Class |
| (g) Family/dependent accounts | Common among modern platforms | TeamUp has an explicit Family Manager / Family Member role model (dependents can't log in themselves, managed under one login); WellnessLiving independently documents unlimited "Relationships" with shared Purchase Options — 2 of 2 platforms checked for this feature had it explicitly documented; no primary source found for an equivalent in Mindbody or Glofox | https://support.goteamup.com/en/articles/9327359-how-can-i-set-up-and-manage-an-account-for-a-child-or-partner-or-any-other-family-member ; https://help.wellnessliving.com/en/articles/8976678-relationships |

Notes:
- Booking windows and guest/drop-in passes are the two features that read as **table-stakes** —
  every platform touched for those two rows had them documented with no exceptions found.
- Spot/equipment selection is the clearest **vertical-gated** feature: it exists where the class
  format has a fixed physical asset per attendee (bike, reformer), and was not found at all for
  open-format/CrossFit-style platforms.
- Auto-charge-on-waitlist-promotion — the specific mechanic combining (a)'s two halves — is the
  weakest-evidenced cell in this table: the two platforms with the clearest waitlist docs (Glofox,
  Momence) both describe payment as deferred/conditional, not instant-on-promotion, suggesting this
  exact combination may not be a converged industry default even though auto-promote itself is common.
- Family/dependent accounts appear to be graduating from "nice-to-have" to standard: both platforms
  checked (TeamUp, WellnessLiving) have mature, dedicated help-center sections for it, not just a blog
  mention.

---

## Q4. Mexico/LatAm specifics

### WhatsApp-first booking/reminders

| Platform | Finding | Source |
|---|---|---|
| Klasius (Mexico) | **[MARKETING]** WhatsApp is the primary booking interface, not a supplement: an AI bot inside WhatsApp handles booking ("voy al WOD de las 6" → capacity check → confirmation), cancellations, reminders, and payment retries — no separate consumer app required | https://klasius.com/ |
| GymHero | **[MARKETING]** Documents "recordatorios automáticos por WhatsApp" alongside a member "semáforo" (traffic-light) status and online booking, but WhatsApp is additive to an app/web flow, not the sole interface | https://gymhero.fitness/ |
| Reeply (Mexico) | **[MARKETING]** "Recordatorio automático por WhatsApp para que nadie olvide el entrenamiento" — WhatsApp positioned specifically as the reminder channel | https://www.reeply.mx/industrias/gimnasios |
| Buq (Mexico) | **[MARKETING]** Advertises "WhatsApp con IA" alongside its branded member app and CRM | https://gobuq.ai/software-fitness |
| Crossfy | **[MARKETING]** Notably positions itself as the alternative *to* ad hoc WhatsApp/spreadsheet management ("less spreadsheets and WhatsApp, more time for your classes") rather than building WhatsApp into its own booking flow — the inverse posture from Klasius/GymHero/Reeply/Buq | https://www.crossfyapp.com/ |

### Cash-desk vs. card-on-file payment norms (Mexico)

| Source | Finding | URL |
|---|---|---|
| Gym&i blog, "Cómo Cobrar Membresías en tu Gimnasio" **[MARKETING/SECONDARY — industry blog, not a vendor]** | Names cash-at-the-counter's real costs explicitly: staff time chasing payments, members who silently stop paying without formally cancelling (and keep entering), and no real-time visibility into monthly revenue. Recommends combining card-on-file (Stripe) for automatic recurring charges with cash/SPEI transfer as a complement for the card-less minority — together covering ~95% of members | https://gymni.mx/blog/como-cobrar-membresias-gimnasio |
| Fitco blog, "Beneficios de implementar una estrategia de cobros domiciliados" **[MARKETING]** | Frames direct-debit ("domiciliación") adoption in Mexico as bureaucratically heavy (bank agreement, written member authorization, complex technical setup) relative to a card gateway — implying cash/manual collection is still the practical fallback despite its costs | https://www.fitcolatam.com/estrategia-de-cobros-domiciliados-para-gimnasios/ |
| Connect Gym blog, "Pasarela de pagos para gimnasios en México: SPEI y OXXO" **[MARKETING]** | Documents OXXO (cash-voucher-at-convenience-store) and SPEI (bank transfer) as named, distinct payment rails alongside card — a payment-method mix not seen at all in the US/EU-platform research (sibling doc), specific to Mexico | https://connectgyms.com/blog/pasarela-pagos-gimnasio-mexico-spei-oxxo |

### LatAm platform check-in documentation

| Platform | Check-in approach documented | Source |
|---|---|---|
| Fitco | **[MARKETING]** Describes "Fitco Check-In" only at the benefit level (an app downloadable to a tablet or phone that "streamlines the attendance process"); the exact modality (QR vs. staff-marked vs. geofence) is not specified in the accessible page text — **no primary source found for the exact modality** | https://www.fitcolatam.com/sistema-fitco-check-in/ |
| Trainingym (Spain-based, LatAm-marketed) | Most complete LatAm modality breakdown found: its own access report distinguishes 4 access types — **Quiosco** (touch totem), **Móvil** (app), **Web** (URL), and **Torno** (turnstile hardware) — plus a dedicated FaceID+Torno hardware-install-requirements article (title confirmed, content blocked, 403) | https://help.trainingym.com/es/knowledge/informe-de-accesos ; https://help.trainingym.com/es/knowledge/control-de-accesos-para-gimnasios-y-negocios-fitness |
| Klasius | No separate check-in step documented at all: attendance appears to be implied by the WhatsApp booking-confirmation event itself ("verifies capacity, makes the reservation, confirms"), not a distinct physical or app-based check-in action — a real divergence from every other platform in this research, where booking and check-in are two separate documented events | https://klasius.com/ |
| Crossfy, GymHero, Buq, Reeply | **No primary source found** for the exact check-in modality (staff-marked vs. QR vs. self-tap) for any of these four — all four surfaced only marketing/homepage content describing booking, capacity limits, and reminders, none had a help-center article on attendance-capture mechanics | — |
| GymUp | **No primary source found.** The only "GymUp"/"gym-up.com" product found appears to be a Spain-based gym-management app, not confirmed as LatAm-popular, and no accessible check-in documentation was found; a same-named but unrelated workout-notebook app also exists and should not be conflated with it | https://gym-up.com/en/ |

Notes:
- Every LatAm-specific vendor found treats **WhatsApp** as either the primary interface (Klasius) or a
  named reminder/booking channel (GymHero, Reeply, Buq) — this is a clean, repeated pattern not seen
  anywhere in the US/EU platform set (Q1) or the sibling charge-timing doc.
- Cash and cash-adjacent rails (OXXO vouchers, SPEI transfers) are documented as named, first-class
  payment methods specific to Mexico, not merely "cash as a manual fallback" — this is a materially
  different payment landscape from the card-on-file assumption baked into most US/EU platform docs.
- Of the 7 LatAm-market platforms searched (Fitco, Trainingym, Klasius, Crossfy, GymHero, Buq, Reeply)
  plus GymUp, only **Trainingym** had a genuinely primary-source, mechanics-level description of its
  check-in modalities; the rest were marketing-page-only or had no accessible documentation at all —
  LatAm platform documentation is markedly thinner than the US/EU platforms in Q1.

---

## What the sources converge on

Ranked by breadth of source support, specifically relevant to a small, class-only Mexican gym with no
hardware budget:

1. **The real no-budget default is a self-check-in tablet/kiosk, not a staff-manual roster.** Every
   vendor-authored "cheap check-in" resource found (Gymdesk, Mindbody's own small-studio messaging)
   recommends a bring-your-own tablet at sub-$200 total cost as the starting point, with staff-manual
   marking named only as a fallback for specific cases (e.g., kids' classes) — never as the
   recommended default. (Q2)
2. **QR/barcode-at-a-kiosk is the most broadly-documented single modality across mainstream
   platforms** (5 of 7 in Q1: Mindbody, Glofox, Gymdesk, PushPress, Vagaro), ahead of any other named
   modality including staff-manual marking — it layers onto the same kiosk hardware a studio would
   already deploy for self-check-in. (Q1)
3. **For a CLASS-only operator specifically, a coach/instructor mobile-roster tap-flow is the
   modality platforms themselves call the norm** — PushPress's own docs state its Staff App tap-in
   flow is "the most common method for class-based gyms," and Wodify's Coachboard documents the same
   pattern independently. This is the modality closest to what the platform already does (staff
   tapping a roster) — the gap is adoption/discipline, not a missing feature. (Q1)
4. **Physical door-access/RFID hardware (Kisi, Brivo) is real and platform-integrated but is
   consistently positioned as a paid add-on tier**, not a default — Glofox explicitly gates it to its
   top two pricing tiers. A no-hardware-budget studio is architecturally not the target customer for
   this modality. (Q1)
5. **No platform in this research was found to document true geofence-automatic check-in** — the one
   platform with the clearest "contactless"/location-adjacent language (Vagaro) documents it as a
   manual tap inside a time window, not an automatic trigger. Self-check via a member's own phone
   exists (4 of 7 platforms) but always requires a deliberate tap. (Q1)
6. **Guest/drop-in passes and booking-window cutoffs read as true table-stakes** — every platform
   touched for these two features had them documented with no exceptions, unlike waitlists,
   recurring bookings, or family accounts, which are common but not universal. (Q3-b, Q3-f)
7. **Spot/equipment selection at booking is vertical-gated, not general** — it exists specifically
   where a class format has one fixed physical asset per attendee (cycling bikes, reformers) and was
   not found in CrossFit-/general-format platform docs, which matches a class-only, format-agnostic
   gym's likely irrelevance to this feature. (Q3-d)
8. **WhatsApp is a first-class, native channel for LatAm-market platforms specifically** — a
   materially different posture from the US/EU default of native-app-plus-email/push, where WhatsApp
   only appears via third-party integrations. This is a Mexico-specific convergence point across 4
   independent regional vendors (Klasius, GymHero, Reeply, Buq). (Q4)
9. **Cash and cash-adjacent rails (OXXO, SPEI) are named, first-class Mexican payment methods, not a
   fallback to be designed around** — Mexican-market content converges on "card-on-file plus
   cash/SPEI as the covering complement," not a card-only assumption. (Q4)
10. **At least one LatAm-native platform (Klasius) appears to collapse booking and check-in into a
    single WhatsApp-confirmed event**, rather than treating "reserved" and "attended" as two separate
    states the way every other platform researched (both here and in the sibling charge-timing doc)
    does — the one example found, across the whole research pass, of a platform not drawing that
    distinction at all. (Q4)
