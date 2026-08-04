# Gym check-in prior art — are we missing the nail?

**Date:** 2026-08-03 · **Trigger:** issue #179, owner's question during the ruling:
*"how do other platforms like Fitco actually approach this — do they even use chips? do they even have
a pase de lista as we have? do they even split the attendance passes with a 'pase abierto'? what is
the actual standard? are we missing the nail?"*

**Method:** three independent agents (a steelman for the always-on chip, a neutral scenario-logistics
pass, and this sourced external sweep) plus one live-data measurement, then a judge. Ten platforms
searched, nine sourced. Every claim below carries its URL; unsourced inferences are marked.

---

## The short answer

**Partly — but not where #179 thinks.**

| our design | verdict |
|---|---|
| ACCESO LIBRE as a first-class concept | **standard.** Not our invention. |
| An arrival window around check-in | **standard.** Not our invention. |
| 90 minutes before as the lead | **outlier-ish** — 1.5× the widest sourced number, and hard-coded where everyone else makes it configurable. |
| A booking marker on the **class-less** roster | **ours alone.** No vendor does this. |
| **Charging the class at BOOKING with no settlement at check-in** | **the actual nail.** Minority model, and the root of #179/#166/#167/#172. |

---

## 1. Staff rosters exist everywhere — but always **per-class**, entered by picking the class first

Nobody has a single all-members roster with class tabs. You choose the class, then you see its people.

- **Fitco** — *"Ingresa al módulo de 'Clases'… Selecciona la clase para la cual deseas tomar
  asistencia… Haz clic en el botón de 'asistió'"*
  ([soporte.fitcolatam.com/es/articles/4671897](https://soporte.fitcolatam.com/es/articles/4671897-como-puedo-tomar-asistencia-a-mis-alumnos)).
  The Fitco Check In app *"te permitirá tomar asistencia de tus clientes a las clases que hayan
  reservado"*
  ([4671853](https://soporte.fitcolatam.com/es/articles/4671853-que-tipos-de-aplicaciones-puedes-tener-con-fitco-fitco-app-branded-app-y-fitco-check-in)).
- **Boxmagic** — admin Check-in shows *"la lista de clientes que han reservado la clase"* with an
  "Asistió" checkbox
  ([help.boxmagicapp.com](https://help.boxmagicapp.com/es/c%C3%B3mo-usar-el-check-in-de-clientes)).
- **Mindbody** — a per-class "Class Sign In screen" with a "Signed in" checkbox
  ([support.mindbodyonline.com](https://support.mindbodyonline.com/s/article/Classes-Early-cancellations-late-cancellations-and-no-shows?language=en_US)).

## 2. A booking is shown as a **section**, never as a per-name chip

- **PushPress** staff app groups a class's members under `Checked-In:` / `Reserved:` / `Waitlist:` /
  `Late Cancel:` / `No Show:`
  ([help.pushpress.com/6636569](https://help.pushpress.com/en/articles/6636569-staff-app-how-to-check-a-member-into-a-class-open-gym)).
- The **only** per-name badges sourced anywhere are Wodify Kiosk+, where *"Drop-Ins, Free Trials, and
  ClassPass attendees each hav[e] a symbol beside their name to designate them as visitors for coach
  awareness"* ([help.wodify.com/9639394363159](https://help.wodify.com/hc/en-us/articles/9639394363159-Set-Up-Kiosk)).
  Badges mark **who pays differently** — never "has a booking".

**This is what settled #179.** Question 5 of the sweep — *does anyone show a "has a booking later
today" indicator outside the check-in window?* — came back **empty across all ten platforms**.

## 3. Open gym is a first-class concept — as a separate **surface**, not a tab

- **PushPress Open Gym**: either an always-on toggle *"allowing members to check in even if there
  isn't a designated Open Gym class type scheduled"*, or scheduled blocks. The staff Check-In page
  makes you choose **Classes** or **Open Gym**, and Open Gym is a *week* view while classes are a
  time-ordered list
  ([help.pushpress.com/508590](https://help.pushpress.com/en/articles/508590-open-gym-setup-options-in-core-by-pushpress)).
- **WellnessLiving** "gym visits" are *"a type of service that allow clients to use your facilities at
  their convenience"*, off by default, with their own Purchase Options — and, independently,
  *"Clients are only able to check in to a gym visit once every 15 minutes"*
  ([help.wellnessliving.com/9298467](https://help.wellnessliving.com/en/articles/9298467-gym-visits)).
  That 15-minute cooldown is an independent arrival at the same number as our `visita_reciente`.
- **Wodify** does it as a class flavour — classes labelled "No reservation limit" *"cannot be
  reserved… you can simply sign in when you arrive"*
  ([1500002078401](https://help.wodify.com/hc/en-us/articles/1500002078401-Reserve-Sign-Into-a-Class)).

**So ACCESO LIBRE is not the invention, and it is not the bug.** At `forge` it is 99% of all traffic.

## 4. The arrival window is real — and everywhere it is **operator-configurable**

- **Trainingym** exposes exactly three fields: an opening for *"socios con reserva"*, a **separate**
  opening for *"socios sin reserva"*, and one close (*"se permitirá el acceso (de todos) hasta X
  minutos tras el comienzo de la actividad"*), overridable per activity
  ([help.trainingym.com/configuración-reservas](https://help.trainingym.com/es/knowledge/configuraci%C3%B3n-reservas)).
- **Wodify**: *"choose your preferred sign-in window by setting when sign-ins open and close for each
  class"*, configurable separately for classes with and without reservations
  ([360060074254](https://help.wodify.com/hc/en-us/articles/360060074254-Class-Sign-In-Settings)).
- **Glofox** is the one hard number, and it is **60 minutes, forward-only**: *"Glofox will
  automatically mark any of these clients as attended in a class if they have one booked within the
  next hour"*, and PAYG/credit-pack clients need a class *"within 30 minutes"*
  ([support.glofox.com/46376281517588](https://support.glofox.com/hc/en-us/articles/46376281517588-Getting-Started-with-the-Check-in-Kiosk)).
- **Virtuagym**: *"When individuals check in within a designated timeframe, they are automatically
  enrolled in their chosen group class"*
  ([business.virtuagym.com](https://business.virtuagym.com/gym-access-control-system/)).

Our `VENTANA_ARRIBO_PREVIA_MIN = 90` (`packages/domain/src/rules.ts:457`) is **1.5× the widest sourced
number** and is hard-coded. Not wrong — untuned.

## 5. Outside the window, Trainingym **gates the staff affordance** — i.e. silence, industrially

Access requires the member *"tener una reserva (actividad o servicio) para el día en curso"* **and**
*"la hora de entrada al centro debe coincidir con la franja de tiempo configurada"* — and crucially
*"la confirmación de reservas o check-in de asistentes que se puede realizar desde Trainingym Manager
y desde Login Staff app, también dependerá de esta configuración de accesos"*
([control-aforo](https://help.trainingym.com/es/knowledge/control-aforo-tablets-proximidad)).

Outside the window there is nothing to tap, and therefore nothing to explain. **No differentiated grey
chip anywhere in the industry.**

## 6. THE NAIL — the credit is settled at **check-in**, not at booking

| platform | when the credit moves | source |
|---|---|---|
| **PushPress** | *"temporarily deducted"* at booking, **returned on check-in** — *"members aren't penalized for simply reserving a class—they only lose a visit from their plan if they actually attend and check in"* | [508590](https://help.pushpress.com/en/articles/508590-open-gym-setup-options-in-core-by-pushpress) |
| **Wodify** | counts the **sign-in**; a waitlist spot *"will NOT count against your membership or available sessions"* | [209427337](https://help.wodify.com/hc/en-us/articles/209427337-Tracking-Limited-Attendance-Class-Plans) |
| **Mindbody** | deducts only on **late cancel** | [support.mindbodyonline.com](https://support.mindbodyonline.com/s/article/Classes-Early-cancellations-late-cancellations-and-no-shows?language=en_US) |
| **Fitco** | **charges at booking, like us** — and ships a no-show *debt* that blocks future bookings, plus a *"Pagar inasistencias"* button | [Fitco app v5.4.8 notes](https://apps.apple.com/us/app/fitco/id1232476908) |

`reservar_clase` spends the class at booking (`supabase/migrations/20260710123000_reservation_consume_flag.sql`).
**Everything downstream traces here:** the desk chip only had to promise anything *because the money
already moved*; the pre-window double-charge exists because a second visit cannot settle against a
spent credit; the closed-window "pardon" (`20260729120000:512-545`) is a hand-rolled apology for the
same thing.

Fitco proves charge-at-booking is a live LatAm pattern, not a bug we invented — but it needed a whole
debt-collection subsystem to survive it. *(That causal read is the agent's inference, not Fitco's
statement.)*

## 7. Two more findings worth keeping

**No-show is auto-detected on a timer, and is reversible.** Wodify marks a no-show *"one hour after
it has ended"*, invoices at two hours, bills at a 12:01 AM timer, and *"If the client is signed into
class before midnight, the invoice will automatically be voided"*; admins can *"forgive no-shows…
restoring the client's lost session"*
([209426167](https://help.wodify.com/hc/en-us/articles/209426167-Late-Cancellation-and-No-Show-Settings)).
Ours (`esNoAsistio`, `rules.ts:487`) is derive-at-read with no grace and no forgive path — which is a
deliberate 2026-07-29 ruling, but note the industry pairs auto-detection **with** a forgive path.

**When ambiguity is unavoidable, the industry asks instead of guessing.** WellnessLiving: *"if gym
visits are offered at the business and you've booked a service, **both options will appear on the
check-in screen**"*
([9801480](https://help.wellnessliving.com/en/articles/9801480-check-in-using-the-self-check-in-kiosk-or-check-in-app)).
That is a third door #179 never considered: two buttons, no chip, no silent attribution, no window
arithmetic.

**Our Zen Planner citation is verbatim but transplanted.** `marcadas.ts:81` quotes *"your current
class of the day will automatically be highlighted and selected"* — real and current
([zenplanner.com](https://zenplanner.com/software-features/kiosk-mode-on-staff-app)) — but the full
sentence is *"…allowing your **MEMBERS** to simply walk up, find their name and check in with a single
tap."* It is a **member-facing self-service kiosk** rule, imported into a **staff** roster where the
member never sees it. The prior art we cited does not cover the surface we built.

---

## Honest limits of this research

Recorded so the findings are not read as stronger than they are.

- **The "nobody shows a booking chip" result is absence of evidence.** Help centres document
  features, not their absence. A small grey "MÁS TARDE" chip is exactly the kind of thing no vendor
  would write a KB article about. It supports silence only weakly — the *structural* argument
  (rosters are per-class, so the question never arises) is the stronger one.
- **Several numbers come from indexed search snippets, not full page reads.** `help.wodify.com` and
  `support.glofox.com` return HTTP 403 to fetch, and Mindbody's site is JS-rendered. The Wodify
  "one hour after it has ended", the Glofox "next hour" / "30 minutes", and the Mindbody late-cancel
  rule are quoted from snippets of those articles.
- **No vendor documents a *default* window value.** "Nobody uses 90 minutes" really means "no vendor
  documents 90 minutes". An operator could set 90 in Trainingym, which makes our number defensible as
  a default rather than wrong.
- **The industry shape assumes a booking-heavy gym, and `forge` is not one.** This model was designed
  by CrossFit/boutique vendors where nearly every visit is a booked class. At forge — 8:1 check-in vs
  sales, almost no bookings — the class roster is nearly empty and the LIBRE list is the whole
  product. That is arguably the exact inversion the standard model does not address, and it is a
  point in favour of our layout.
- **Moving the charge to check-in is a migration, not a fix.** Hold-and-return needs a hold ledger, a
  release-on-check-in path, and a decision about a hold that is never settled — plus RED's published
  Terms already say *"la clase se descuenta"* at booking.
- **No vendor solved the pre-window double-charge, because none of them can hit it.** That is a real
  point for the standard model, but it also means the industry has no worked answer to *"what should
  the desk do at 10 AM for a member booked at 7 PM?"* We are extrapolating from architecture, not
  citing a ruling.

---

## What this ruled

**#179 → SILENCE.** The chip renders only inside the arrival window. Shipped `9b4c151`.

**Deferred, filed separately:** the charge-at-booking seam (supersedes #167, absorbs #166); the
missing desk clock; the undisclosed charge in the tap toast; the hard-coded 90-minute lead.

Live measurement backing the priority call: [[class-booking-unused-in-prod]] — zero non-walk-in
bookings at either paying gym, so all of this is a RED launch-day concern, not a repair.
