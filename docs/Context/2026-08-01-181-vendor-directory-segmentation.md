# How gym-management systems segment the staff-facing member directory

**Issue:** #181, on map #180 (CLIENTES directory / member lifecycle doctrine)
**Date:** 2026-08-01
**Scope:** the *staff/admin* member directory only — not the member app. Seven axes, per #181.
**Standing bar (map #180):** every claim carries a source link and a confidence tag. A gap honestly
marked beats a confident guess. Nothing here resolves on taste.

---

## Confidence key

| Tag | Means |
|---|---|
| **OBSERVED** | The actual UI was seen — a screenshot embedded in a help article, or a product screenshot on a vendor page. |
| **DOCUMENTED** | The vendor's own help centre / docs say it, and the page body was retrieved and read. |
| **DOCUMENTED (index)** | The vendor's own help text, but reachable **only** via search-engine snippet — the page body could not be rendered. Weaker than DOCUMENTED; the surrounding context is unverified. |
| **REPORTED** | A third party says it — integrator docs, review site, industry blog, or the vendor's own *marketing* rather than its docs. |
| **INFERRED** | Reasoned from other facts. Not stated anywhere. |

### Method and its limits — read this before citing anything

- Vendor admin UIs are behind paid logins. **No vendor's live member list was operated.** The best
  available proxy is the vendor's help centre, and that is what most of this rests on.
- **Three vendor help centres are Salesforce Lightning SPAs and cannot be rendered by any fetch
  method available here** — every attempt returns a "CSS Error / Loading" shell. That is
  **Mindbody**, **Virtuagym**, and (post-migration) **Zen Planner** (`help.daxko.com`; the old
  Zendesk `help.zenplanner.com` now 404s at the article level). Mindbody's status values below are
  therefore **DOCUMENTED (index)** — quoted from search-engine snippets of Mindbody's own support
  and Learning Center articles whose bodies could not be opened. Virtuagym is **uncovered entirely**.
- Where a sub-agent produced a load-bearing claim, the cited URL was **re-fetched independently**
  before it entered this document. Re-verified: TeamUp *Slipping Away*, Gymflow user types,
  WellnessLiving *Clients at Risk*, Xplor Triib statuses, CrossHero status filter + risk bands,
  Fitco dashboard windows, Trainingym auto-baja + `Días sin asistir` + baja-over-delete. All
  matched their reports.
- The session's web-search budget was exhausted mid-run. Direct URL fetches continued to work,
  which is how the tails were closed. The uncovered vendors listed at the end are
  **"not searched to exhaustion"**, not "confirmed to lack the feature".
- **No G2/Capterra complaint specifically about member-list segmentation was found.** Searches
  returned only generic UI/support complaints. That is a genuine *not found*, not a clean bill.

---

## Part 1 — Per-vendor table, the 7 axes

Axes: **1** states · **2** default view · **3** where lapsed go · **4** derived or declared ·
**5** last-visit as a first-class concept · **6** win-back surface · **7** header counts.

### Global / English-language vendors

| Vendor | 1. Lifecycle states (vendor's words) | 2. Default view | 3. Where lapsed go | 4. Derived / declared | 5. Days-since-visit first-class? | 6. Win-back surface | 7. Header counts |
|---|---|---|---|---|---|---|---|
| **Gymdesk** | Tabs: `Members` · `Visitors` · `Website Signup` · `Frozen` · `Canceled`. Separately: `Expired membership` vs `Canceled membership` are distinct glossary terms. Leads are a **separate pipeline** (`New`, `In Conversation`, `Booked`, `Contact Later`, `Cold`). | **"the default view shows active members"** — DOCUMENTED | Dedicated **`Canceled` tab**, still in the directory, reactivatable individually or in bulk | **Both.** Membership expiry is clock-derived; `Freeze`/`Cancel`/`Reactivate` are staff acts (incl. a bulk "Change Status") | **Column only** — "Last training session attended (if using attendance tracking)". Not a filter, not a tier. But the **automation engine has an `Absence` trigger**: "watches attendance and automatically starts a win-back sequence once a member hasn't checked in for the number of days you set" | Automations (Absence, Expiring memberships, Cancellation requests, No-shows). No at-risk *report* named | `Active member count` is defined as members "who currently hold an active membership… **excluding those who are enrolled in trial memberships**" |
| **PushPress** | **Two levels.** Person tags: `Member` · `Lead` · `Non-Member` (+ `Ex-Member` per a second article). Plan statuses: `Active` · `Alert` · `Pending Active` · `Pending Cancel` · `Cancelled` · `Paused` · `Completed` | People page tabs: `Members` (active **and paused**) · `Leads` · `Non Members` · `Staff`. Search **only returns results inside the selected tab** | Not on the Members tab. Surfaced instead on a **Membership Lifecycle Pipeline** (kanban): `Pending Active`, `New Plan Added`, `Memberships Paused`, `Pending Cancels`, `Memberships in Alert`, `Completed`, `Canceled` | **Person tag is purely derived**: "The system assigns status automatically based on the plan a person is on… A person's status is driven by their most recently active plan." Plan status is mixed (Cancel/Pause are staff acts) | **Not in the directory.** Separate `Reports > Engagement` module ("attendance and check ins for members and clients"); no documented day-bucket thresholds | The Membership Lifecycle Pipeline, explicitly to "Identify at-risk members" and "Develop targeted outreach strategies for retention and reactivation" | NOT FOUND |
| **Zen Planner** | Membership statuses: `Current` · `Upcoming` · `On Hold` · `Dropped`. Person-level: `Prospect` with **customisable** prospect statuses (Setup > Database Tools > Lookup Codes) | Report default criterion is **`Mbr. Status – is – Current`** — DOCUMENTED. The *people list* default is a **GAP** (help centre unrenderable) | GAP | Both: membership status is clock/contract-derived; `Hold` / `Drop` / `Delete` are staff acts from the membership dropdown | **YES, as an alert, not a tier**: *"Haven't seen a student in 10 days? Zen Planner triggers an alert or sends an automated email/text so they don't slip away unnoticed."* | Absence automation + attendance reports (10+ pre-built in the Attendance section) | Not in the directory — but note the vendor's **own billing** definition: *"An Active Member is anyone with a Membership **or** who has attended an Event in the past month."* Billing ∪ attendance |
| **Mindbody** | **Three orthogonal axes.** (a) *System Status* on the membership: `Active` · `Non-member` · `Expired` · `Suspended` · `Terminated` · `Declined`. (b) *Custom Status*: "statuses that you create and manually assign to a client on their Profile screen. **Custom statuses override system statuses.**" (c) *Profile status* on the account: `Active` / `Inactive` / `Prospect` — and a third-party integrator states outright that **"Profile Status is not the same as membership status"** | Client Directory has a `Client Info` filter that is set to **"Active clients"** in the documented workflows. Whether that is the shipped default: **GAP** | Nowhere — **clients cannot be deleted, only deactivated.** Deactivated clients stay in the system and in reports | **Both, with a documented override**: system status is derived; Custom Status is human-assigned and *wins*. There is also an **"automatically deactivate stagnant clients"** setting (article title confirmed; threshold value NOT FOUND) | **Yes but only as a report.** Win-back is a two-report, tag-and-cross-reference workflow: run `Clients > Last Visit` with "Last visit on or before", tag the result, then run `Visits Remaining` to strip out anyone with sessions left | The Last Visit + Visits Remaining pairing above; no dedicated at-risk surface found | `Attendance Analysis` reports "the total number of **active clients** in your site **during that date range**" — i.e. Mindbody's reporting "active" is attendance-in-a-window, not billing |
| **TeamUp** | **Two parallel taxonomies.** Customer Status: `New` · `Active` · `Slipping Away` · `Inactive`. CRM Lifecycle Pipeline (7 configurable, non-extensible): `Lead` · `Prospect` · `Trial` · `Converted` · `At Risk` · `Churned` · `Lost` (+ `No Status`) | **GAP** — no article states the default Status filter. Docs only ever show staff *selecting* one | Same Customer List via the Status filter, **plus** a kanban column on the CRM board. No archive concept. Delete is permanent and there is **no bulk delete** — TeamUp's stated alternative is the inactive filter | **Both, with explicit arbitration**: criteria can be automatic *or* manual; a manual kanban drag pins the card with a **"Manual" tag** and it stops responding to automation until staff click **"Revert to automation"** | **YES — the single cleanest example found.** `Slipping Away` is *purely* days-since-attendance (example threshold 15 days), and: **"Customers who have an active membership or a membership which is on hold can have a Slipping Away status… however, they can not become 'Inactive'."** `Inactive` requires **both** clocks (no active package **and** no recent class) | `Reports > Customers - Slipping Away`, separate from the directory, plus notification triggers | **GAP** on the list header. Vendor warns its billing-term "active customer" differs from "customers currently active on a particular membership" — *"It's normal for these numbers to be different."* |
| **Wodify** | `On-Ramp` · `Active` · `Suspended` · `Inactive`, chosen from a **dropdown on the client's Personal Information tab**. `Active` cannot be renamed or disabled | People > Clients has an **`Inactive` tab**; the other tab being the default is **INFERRED**, not stated | Separate `Inactive` tab, still searchable globally | **Declared.** Directory status is a manual dropdown (Admins/Managers only). Billing acts on a *different* axis: **Membership Enforcement** blocks booking/sign-in for clients with inactive plans (3 settings). Access = automatic; directory state = manual | **YES**: Insights > Attendance carries **"Clients without Sign Ins (15 Days)" = "total number of *active* clients who have not signed into class within the last 15 days"** — attendance-lapse measured *on billing-current people* | **Wodify Retain**, a separate module (`People > Retain`), ML-scored on membership status + attendance frequency + results logging + invoice timeliness. At-risk clients get **a red ring around their avatar** — a directory-adjacent cue, not a re-ranking | **GAP** |
| **WellnessLiving** | **Two axes, deliberately factored.** Client *Type* (derived): `Prospect` · `Active Pass Holder` · `Inactive Pass Holder` ("expired… passes") · `Active Member` · `Inactive Member` ("expired memberships"). Account *Status* (declared): active / `Deactivated` / `Deleted`, plus an independent "disabled login" lever. Reporting-only: `Lost Members` | **⚠️ THE DOCS CONTRADICT THEMSELVES.** Client List article: *"Deactivated clients won't automatically appear in the client list"*. Deactivation article: *"Deactivated client profiles **remain visible** in your Client List and continue to appear in your Reports"*. Unresolved — do not cite either | Type-lapse (`Inactive Member`) **never leaves the directory** — it's a label change. Deactivation is the hiding mechanism and is a *separate human act*. Deletion removes from list, search **and** reports | **Both, cleanly factored** — type is computed from purchase/expiry; deactivate / disable-login / delete are three human acts with three different blast radii | **YES, two thresholds.** `Clients at Risk` report takes **"Client has not visited in"** (minimum) and **"Client is considered lost after"** (maximum). Columns: Client, **Last Visit**, Last Visit Location, Upcoming Visit, Upcoming Visit Location, and **Purchase Option Status** (`On hold` / `Not on hold` / `No active Purchase Options`) | `Reports > Clients > Clients at Risk`; plus **Isaac Churn Risk** (ML) and Client Retention by Staff. Not in the directory | **Explicitly overlapping.** Enterprise Client Status Report columns: Total Clients, Active/Inactive Passholders, Active/Inactive Members, New Members, Prospects, Lost Members — a client with an active pass *and* an active membership is counted in both |
| **Xplor Triib / Xplor Studio** | `Active` ("Member with a current Package / Membership") · `Inactive` ("Member that has an expired Package / Membership") · `Prospect` ("Member with no Package / Membership") · `Archived` ("Old member whose profile has been archived and is **unsearchable**"); `On-Hold` and `No Status` appear as export groupings | **Split navigation, not a filter.** `Members > Active Member List` is one page; `Members > Other Member Lists` holds "No Status / Inactive, Archived, On-Hold, Prospects" | **A physically different page.** There is no filter to see and nothing to clear | Both: Prospect→Active→Inactive is automatic on purchase/expiry. `Archived` is manual and cannot be applied to a member with an active plan | **NOT FOUND** — no attendance tier or alert documented | **NOT FOUND** | Vendor frames statuses as counts ("know how many active, prospective, inactive, archived members you have"); whether the UI renders them: NOT FOUND |
| **Gymflow** | `Lead` · `Lead - No Account` · `Customer` · `Member`. Crisply: **"A customer is someone who has purchased something from you but does not currently have an active membership"** / **"A member is someone with any membership that is currently active, paused, overdue or pending"** | **One page, everyone**: "a full list of **every user in the system that has ever been entered via any means**", with a user count top-left | Nowhere — their **type label flips from Member to Customer** and they stay in the same list. Filters are stackable in place | **Purely derived.** "A user will change user type automatically as their status changes… If their membership is cancelled or expires, they will automatically become a customer." No manual lapse/archive lever documented | **NOT FOUND** on the Users page. Reports > Memberships is billing-only | **NOT FOUND** as an attendance surface; the renewal surface is the membership-expiry report | **One number over the complete set.** The only vendor found whose header count cannot overlap, because there is only one |
| **ABC Glofox** | `Active` ("start date in the past, expiry in the future, not paused") · `Paused` · `Overdue` ("most recent recurring payment has failed"; loses club access 7 days after the failure) · `No Membership`. **There is no `Expired` tier** — an expired member falls into `No Membership`, indistinguishable from someone who never bought | **INFERRED only** — filters are opt-in via an "Add Filters +" dropdown, so the unfiltered Clients tab presumably shows everyone. Not stated. Note filters are **paywalled**: "SMS and Client Filters are not available on all Glofox packages" | Same list, no tab, no archive. The "Managing Your Clients" section (12 articles) contains **no article on archiving or deleting a client at all** | Derived from start/expiry dates and payment outcomes. `Cancellation reasons` are human metadata layered on top | **Partially, and only since May 2026**: the Expiring Members Report gained **last visit date** and **total visits** as *columns*, and "Members with a future membership are now filtered out **by default**". Attendance is a column on a billing report, never a status | The **Expiring Members Report**, pitched verbatim as "Build your retention outreach list in seconds, with no manual sorting required" — keyed on **expiry**, with visit data attached | **NOT FOUND** |
| **Clubworx** | Contact *type*: `Member` · `Prospect` ("expressed interest… but has **never** had a membership") · `Non-Attending Contact`. Within Member: **"an active member is a member who holds an active membership"** / **"a cancelled member is a member who does not hold an active membership, but may have held one previously"** | **GAP** | Stay in Contacts as `cancelled member`. Explicit human downgrade exists: **"Convert to NAC"**, used "where this person no longer needs to be booked into events". Segmentation via **Smart contact lists** (saved segments) | "Cancelled member" reads derived; "Convert to NAC" is declared. **The docs do not say which** — GAP | Per-member Attendance tab + a "Contact Attendances" report. **No "last attended" field and no inactive-members list** appear in the help centre | REPORTED (marketing only, uncorroborated in help docs): "set up a weekly report to show inactive members and pair it with an automated email offering a comeback incentive" | **NOT FOUND** |
| **Momence** | **No stored customer lifecycle taxonomy found.** Glossary defines only subscription state (`Active` vs `Frozen`). The only definition of an inactive *customer* lives inside Funnels: **"An inactive customer is defined as one with no recent visit (no last check-in date within range)"** — attendance-derived | `Customers > Customer List`; saved segments **"appear at the top of the CRM next to 'All customers'"** — so the default tab is literally *All customers* and segments sit beside it | Same list. Segments-as-tabs. Deletion is destructive (cancels renewals, memberships, scheduled payments). No archive | **Derived, evaluated live by segmentation.** No declared-lapsed state found | **YES — it is the primary axis.** Segmentation supports "select 'exactly' 0 visits, then filter visits by date and choose 'flexible' to set 'in the last x days'". Sequences enrol "a customer that hasn't visited your classes or appointments in some time (with you controlling how long)" | Automation-side, not directory-side: Sequences + a Funnel measuring "how many inactive customers are becoming active again" | **NOT FOUND** |
| **Mariana Tek** | **Membership-level only, explicitly not customer-level** — 10 values: `Pending Customer Activation` · `Pending Start Date` · `Active` · `Expiring` · `Expired` · `Canceled` ("modified to have fewer renewals than it was originally sold with") · `Terminated` ("ended **immediately by an employee**") · `Frozen` · `Charge Declined - Payment` · `Charge Declined - Penalty` | **There is no browsable member directory.** Staff use a "Find Customer" button and "search for the customer by email, name, and/or phone number" | N/A — nothing to relocate. Customer-level grouping is done with **tags** | Derived at the membership level; `Terminated` is declared. Note the deliberate `Canceled` (contract-derived) vs `Terminated` (staff-declared) split | **Data, not status**: `Customers - Summary` report (under *Marketing*) carries "Total Check-Ins All Time", "First Check-In", "Last Check-In" among 30 columns | **NOT FOUND** in the public KB | N/A |
| **Arketa** | **No stored statuses.** The whole lifecycle is expressed as segment predicates on pricing options: `Has active` · `Doesn't have active` · **`Expired / canceled`** ("Clients who have purchase history and no visits remaining or their subscription has been cancelled") · `Purchased` · `Never purchased` | Clients list. Segments live at `Clients > Segments` and **must be saved before they appear as a filter option** on the main list | Same list; a saved segment is the only way to isolate them | Derived — evaluated against purchase and attendance history. No declared archive found | **YES, as a query dimension, never a label**: `Attended reservation` / `Booked reservation` / `Canceled reservation` (at least / exactly / less than X times) with relative windows ("last X days", "between X–Y days ago") | Messaging, not a directory surface: segments feed Broadcasts and SMS | **NOT FOUND** |
| **Membr** (UK; not on the #181 list, included because its taxonomy is fully documented) | Six, all billing-derived: `Active` · `Suspended` · `Cancelled` · `Pending` ("started the joining process" but hasn't completed payment) · `Defaulted` ("defaulted on their payment") · `Expired` ("when a member on a paid-in-full membership" passes expiry) | GAP | GAP | **Derived, with one exception**: `Suspended` is the only status a human can set directly (via the Update button) | NOT FOUND | NOT FOUND | GAP |
| **Finegym** (minor vendor; included for one precise datapoint) | GAP | GAP | GAP | GAP | **YES, as a dashboard KPI**: at-risk members = **"Members who haven't checked in within your configured inactivity threshold"**, configured in General Settings | The at-risk KPI tile | GAP |
| **Virtuagym** | **UNCOVERED — do not cite.** Help centre is a Salesforce Lightning SPA that returns an unrendered shell; the legacy Zendesk KB is dead. One trap to avoid: a snippet about an "Inactive" filter on the Client Overview refers to **app-account activation state (Invited vs Activated), not subscription state** | — | — | — | — | — | — |

### LatAm / Spanish-language vendors

| Vendor | 1. States | 2. Default view | 3. Where lapsed go | 4. Derived / declared | 5. Days-since-visit first-class? | 6. Win-back surface | 7. Counts |
|---|---|---|---|---|---|---|---|
| **Trainingym** (ES) | **Three separate lists**: `Socios Activos` · `Socios Potenciales` · `Socios de Baja`. Orthogonal human overlays: `Perfiles de socio` (multiple per member) and `Grupos de socios` (e.g. `"Clientes en Riesgo de Baja"`) | Documented working path is `Socios > Socios Activos` for every member operation. That it is the *landing* default: INFERRED | A **sibling list** — `Socios de Baja`. Explicit vendor guidance: prefer *"mantener a los socios como socios de baja"* over deleting, which is irreversible. Reversible via Opciones → 👍 `Dar de alta` | **Both, and automation is opt-in.** Manual: Opciones → 👎 `Dar de baja`. Automatic: a checkbox **"Dar de baja a un socio automáticamente cuando venza su membresía"** under Payments > Configuración > General > Otras opciones. Only fires when **all** membership-type products have expired; vendor warns not to enable it for credit-only centres. 3 days after baja: exit survey sent, future reservations cancelled, staff tasks deleted | **YES, as a sortable/filterable column.** `Días sin asistir` on **Seguimiento Socios**, defined as *"el número de días sin asistir al centro o bien sin acceder a algunas de las plataformas Trainingym (App, web o quiosco)"*, filterable via the "Más" button. Plus auto-hashtags: **#noActive** (30 days absent), **#noApp** (30 days), **#noFitness** (7 days), which filter across all three lists | **`Informes Pro > IA Predicción Riesgo Abandono`** — outside the directory. Two tiers (`Baja Probabilidad` / `Alta Probabilidad`) + a per-member churn-probability %, predicted remaining lifetime in months, and an **estimated cancellation date** | Report-level: total active members, average member lifetime, LTV, risk distribution %. **No documented header count on the directory itself** |
| **CrossHero** (ES) | **Two taxonomies.** Person filter (5 values, **mixes lifecycle with role**): `Todos` · `Activo` ("Clientes con cuota activa") · `Inactivo` ("Atletas sin cuota activa o pendiente y/o si está caducado por más de 30 días") · `Admin` · `Coach`. Subscription statuses (6): `Activo` · `Caducada` · `Caduca Pronto` (expiring within 14 days) · `Cancelada` · `Pendiente` · `Pausadas` | Documented navigation is `Menú Admin > Clientes > Todos` — the entry point is explicitly the **all** tab and the filter is visible/clearable. That `Todos` is the *default selection*: INFERRED | **Same list, re-filtered.** `Inactivo` is a value of the same filter as `Activo`. No archive, no delete article in the help centre | Both, at different layers: `Activo`/`Caducada`/`Caduca Pronto` are clock-derived; `Cancelada` and `Pausadas` are admin/coach acts. Pausing **without** a maintenance fee flips the person to INACTIVO; pausing **with** one keeps them active | **YES — pure attendance clock, no billing input.** `Clientes en Riesgos`: **riesgo bajo = 7–10 days**, **moderado = 11–15**, **alto = 16–31**, all measured as *"sin reservar o sin hacer check-in"* | Two, both outside the directory: the `Clientes en Riesgos` report, and `Engagement Automático` mirroring the same 7–10 / 11–15 / 16–31 bands as email triggers, **plus a post-expiry recovery cadence at 1 day, 1 week, 2 weeks, 1 month, 2 months** and an expiry warning 3 days out | Report suite includes both `Clientes Activos` (billing) and `Clientes en Riesgos` (attendance). **The docs never reconcile them** — a billing-active member is routinely also high-risk. CrossHero does *not* avoid overlap; it doesn't address it |
| **Fitco** (ES) | Three person tiers, entitlement-derived: `Cliente Prospecto` ("sólo se ha registrado… pero no ha realizado ningún tipo de compra") · `Cliente Activo` ("cuenta con una membresía activa en este momento") · `Cliente Inactivo` ("en algún momento tuvo una membresía activa pero actualmente no cuenta con ningún beneficio"). Membership mirror: `Activas` / `Inactivas` as two tabs on the profile. Human overlay: `Categorización de clientes` (one custom category per client) | **GAP** — the Clientes list is documented with columns `Nombre, Correo, Estado, Pago, Marcar entrada`, but **no article states what the default filter is**, or whether one exists | **Same list** — `Estado` is a column. No baja list, no archive. Delete exists only as a per-client destructive action | **Derived, no exceptions.** Both `Activo` and `Inactivo` are computed from membership validity (date **and** session count). No `dar de baja` verb exists. `Congelamiento` is a **plan-level** action; whether frozen surfaces as an `Estado` value is a GAP | **Demoted to reports**: `Análisis últimas visitas` and `Análisis de asistencias` are advanced reports. Fitco's *tiering* is billing-derived throughout | **`Clientes por Recuperar`** on the dashboard — the sharpest artefact in the whole scan. Two arms: memberships **expired days 1–15**, and memberships whose **sessions ran out, days 1–15**. **"After 16 days, clients no longer appear."** Sibling tile `Próximas Renovaciones` = expiring within 15 days + those with 1 session left. Both export to Excel and link into a filtered in-app list | **Explicitly overlapping, by design.** Tiles: Ingresos, Por Cobrar, Egresos, Clientes Activos, Clientes de Prueba, Membresías Nuevas/Renovadas, Próximas Renovaciones, Clientes por Recuperar, Cumpleaños. The article states clients appear across multiple tiles simultaneously and that a drill-down deliberately shows *"la sumatoria de ambos"* |
| **Boxmagic** (ES) | `Activo` / `Inactivo` confirmed via an `Estado` filter; **the full enumeration is a GAP** — no article lists the values | List shows `nombre, apellido y mail` + options; filters must be applied with a **"filtrar"** button, implying an unfiltered default. INFERRED | Same list, `Estado` flips. No archive documented | **Derived, and the most configurable derivation found**: `Mi Box / Opciones Generales → Desactivación Automática` with a **`Días impagos`** threshold; countdown starts when the membership `fecha de término` passes; **`0` = inactive the same day**. ⚠️ Source is a **2017 vendor blog post**, not the current help centre — flag if cited | **Partially**: `días entre reservas` is a cadence metric on the client profile — distinct from billing, but a profile field, not a list column or filter | **GAP** — no retention/at-risk report in the help centre. (Marketing claims automated emails to *"clientes que han dejado de asistir"* — REPORTED, unverified) | **GAP** |
| **AgendaPro** (ES) | **NONE.** No lifecycle state field on the client record anywhere — no activo/inactivo/baja/moroso. Zero tiers. DOCUMENTED **by exhaustive enumeration of the entire 14-article Clientes collection**, which is stronger than absence-of-search-hits | `Base de clientes` shows "tu lista de clientes" with a search bar; filters are in a left rail and clear via **"Reestablecer"** to return to the complete database | Nowhere — they're just clients. The only removal is a **hard delete** (type the word "Eliminar" to confirm; profile *and* history go). **No "inactivar"/"desactivar" alternative is documented** | Neither — the concept does not exist in the directory | **It is the ONLY axis AgendaPro has**, and it is tenant-configurable: *"Lo primero es establecer en qué momento consideras que un cliente ha dejado de ser activo"*, with worked examples of *"más de 45 días sin agendar una cita"* and a filter *"Clientes con más de 90 días sin reserva"*. ⚠️ **Vendor-BLOG tier, not help-centre** — the exact UI is unverified | A campaign engine (WhatsApp/SMS/email reactivation with reactivation-count reporting), not a directory surface. Blog-tier evidence only | Profile shows attendance counts and payment/debt totals; **no `moroso` badge and no `última visita` timestamp** documented |
| **Connect Gym** (MX) | No public docs — axes 1–6 all GAP | — | — | — | — | — | **OBSERVED** (product screenshot on the vendor's own landing page): a dashboard reading **`Alumnos Activos 47 de 52 totales`**, **`Tasa de Activación 90% membresía activa`**, a **`Membresías por Vencer`** section listing members expiring today / tomorrow / 3 days / 5 days, and `Pagos Pendientes 5 este mes`. Note the **ratio framing — "N active of M total"** — which sidesteps overlap by anchoring to the whole roster |

### Vendors named in #181 that could NOT be answered

| Vendor | Why | Status |
|---|---|---|
| **Virtuagym** | Salesforce Lightning help centre returns an unrendered shell; legacy Zendesk KB dead | **Uncovered.** Zero axes answerable |
| **EVO / ABC Evo** | `evohelp.w12app.com.br` returned **HTTP 403 on every article attempted**. Also worth noting: the help centre is **Portuguese**, and its vocabulary (`situação`, `trancado`) would not transfer to a Mexican-Spanish UI anyway | **Uncovered.** Two unverified snippet fragments exist (auto-removal of *clientes inativos* from activity enrolments; workout printing for clients *"sem contrato ativo"*) — REPORTED only, not usable |
| **Gym&i** (gymni.mx) | No product documentation; blog is generic advice with no product screenshots | **Uncovered** |
| **Aimharder** | Root domain served only a cookie policy; the one PDF FAQ found is member-facing | **Uncovered** |
| **Klasius, WodBuster** | Marketing pages only, no help centre found | **Uncovered.** Klasius marketing claims *"IA que predice bajas — Identifica socios en riesgo antes de que se vayan"* — REPORTED, not citable as UI |

---

## Part 2 — Outside gym software: what the convention actually is

#181 asked specifically where gym software inherited a convention rather than deriving one. It
inherited the **billing** ladder, not the CRM one — and then made the one mistake every billing
vendor deliberately avoided.

### CRM lifecycle stages are a MONOTONIC funnel, and none of them models churn

- **HubSpot** ships 8 ordered lifecycle stages: `Subscriber` → `Lead` → `Marketing Qualified Lead`
  → `Sales Qualified Lead` → `Opportunity` → `Customer` → `Evangelist` → `Other`.
  **It does not move backward:** *"Default automatic updates to the lifecycle stage property will
  only move the stage forward."* Imports, forms, the API, the Salesforce integration and workflow
  "Set a property value" **cannot** set it backward at all — you must clear the property first, then
  set the earlier stage as a second action. **There is no `churned` / `former customer` stage**, and
  the docs give no guidance on what to do when a customer churns.
- HubSpot deliberately runs **two** properties: *Lifecycle stage* ("at what point the contact is
  within the marketing/sales process") and *Lead status* (`New`, `Open`, `In Progress`, `Open Deal`,
  `Unqualified`, `Attempted to Contact`, `Connected`, `Bad Timing`). One enum could not carry both a
  forward-only reporting position and a freely-mutable working state, so there are two.
- **How HubSpot users actually represent churn** (community threads): leave them at `Customer` and
  add a separate churn flag, so reporting survives; or `Other` + a custom "Other type = Churned";
  or a Lead-status value. The most-recommended is the first — **the funnel stage is treated as a
  high-water mark and churn is an orthogonal second property.**
- **Salesforce** doesn't use a state field at all — it uses different *objects*. `convertLead()`
  turns a Lead into Account/Contact/Opportunity; converted Leads become **read-only by default**
  and need an explicit "View and Edit Converted Leads" permission. There is **no standard churned-
  customer state and no standard Account Status field**; churn is modelled with custom fields.

**Consequence for #180:** a gym lifecycle genuinely cycles (activo → lapsed → activo → lapsed).
The CRM funnel convention **cannot express that motion** — it is a reporting artefact about
acquisition, not a statement about a person's present standing. Copying it is a category error.

### Subscription billing attaches state to the CONTRACT, never to the person

| System | Subscription states | Person-level state |
|---|---|---|
| **Stripe** | `incomplete` · `incomplete_expired` · `trialing` · `active` · `past_due` · `canceled` ("final and cannot be updated") · `unpaid` · `paused`. End-of-dunning is **configurable three ways** — cancel, mark unpaid, or leave past_due | **Customer has no status.** The only state-ish field is `delinquent` (boolean) — a payment-health flag. Stripe explicitly directs you to `subscription.status` for lifecycle |
| **Chargebee** | `future` · `in_trial` · `active` · `non_renewing` ("will be canceled at the end of the current term") · `paused` · `cancelled` · `transferred` | **Customer has no status attribute** — only `deleted`, `auto_collection`, `pii_cleared`, `fraud_flag`, balances |
| **Recurly** | `future` · `active` · `canceled` ("set to expire at the end of the current term" — **still live and billable, reactivatable**) · `expired` (**"has churned and cannot be reactivated"**) | Accounts are **`Open` / `Closed`** — administrative, not lifecycle. Closing "permanently deletes stored billing information, cancels any active subscriptions… and fails any open invoices" |

Two patterns worth naming:

1. **The state is unanimously on the subscription, not the person.** All three had the chance to put
   a status on Customer/Account and all three declined. A person is never "active" or "churned" in
   any of them; person-level churn is **derived at query time** from "holds no subscription in
   {active, trialing, non_renewing, future}".
2. **The reversible end-state and the terminal end-state are separate values.** Recurly `canceled`
   vs `expired`. Chargebee `non_renewing` vs `cancelled`. Stripe `past_due`/`unpaid` vs `canceled`.
   A single gym "cancelled"/"inactive" that means both "term is running out but they still get in"
   and "gone for good" is exactly the collapse every billing vendor split apart.

### Recency IS a standard segmentation axis outside gyms — but never a stored state

- **RFM** (Recency / Frequency / Monetary) dates to direct mail — Bult & Wansbeek,
  *"Optimal Selection for Direct Mail"*, *Marketing Science* 14(4), 1995. Recency = time since last
  purchase. Structurally identical to days-since-last-visit, and thirty years old.
- **Klaviyo** ships RFM as a **computed report, not a field**: recency 3 = purchased within 180
  days, 2 = within 365, 1 = older; groups are Champions, Loyal, Recent, **Needs Attention**,
  **At Risk**, **Inactive** ("A lapsed customer… who hasn't purchased in a long time").
  "Lapsed" is a **score bucket**, recomputed, never set by a human.
- **Shopify** ships no lapsed/at-risk template — it ships `last_order_date` as a **filter building
  block** and leaves the threshold to the merchant. The 60/90/120/180-day cutoffs are folklore.
- **Intercom** stores `last_seen_at` — a timestamp, with no derived state.
- **Customer-success health scores** (ChurnZero, Gainsight) fold engagement recency in as one
  *input* to a continuous score — a number, not a status.
- **The one place recency IS a formal person-level state is banking**: a **dormant account** — no
  customer-initiated activity for a period set by regulation (commonly 3–5 years) — and it exists
  only because escheatment law forces a legal status change on a legally fixed clock.

---

## Part 3 — The convergent pattern

Across 20 vendors with usable evidence, five things are close to universal.

**C1. Lapsed members are never deleted, and are always still reachable by staff.**
Deletion exists everywhere and is universally framed as destructive and irreversible — TeamUp has
*no bulk delete at all*; Momence's delete cancels renewals, memberships and scheduled payments;
WellnessLiving's removes from list, search **and** reports; Mindbody **cannot delete a client at
all, only deactivate**; Trainingym's docs tell operators to prefer *"mantener a los socios como
socios de baja"*. Nobody in the set treats subscription expiry as a reason to remove a person.
[DOCUMENTED across all named vendors]

**C2. Expiry is derived; *leaving* is declared. They are two different levers.**
The clock computes the lapse label automatically; a **separate human act** — archive / deactivate /
dar de baja / convert-to-NAC / terminate — is what actually removes someone from working views.
Wodify, WellnessLiving, Xplor Triib, Gymdesk, Trainingym and Clubworx all implement the two-lever
split. Only **Gymflow, Glofox, Fitco and Arketa** are purely derived with no declared lever
documented — and note that all four of those also keep everyone on one list, i.e. they have nothing
for a declared lever to *do*. [DOCUMENTED]

**C3. Attendance-recency is real, near-universal, and lives in a REPORT — not in the directory.**
Every vendor that models it puts it in a separate report, module, automation or saved segment:
WellnessLiving `Clients at Risk`; Wodify `Retain` + "Clients without Sign Ins (15 Days)";
TeamUp `Reports > Customers - Slipping Away`; Zen Planner's 10-day alert; Gymdesk's `Absence`
automation trigger; PushPress `Reports > Engagement`; Mindbody's Last-Visit + Visits-Remaining
report pairing; CrossHero `Clientes en Riesgos`; Trainingym `Seguimiento Socios` + `IA Predicción
Riesgo Abandono`; Fitco `Análisis últimas visitas`; Momence Sequences; Arketa segments.
**Zero vendors make attendance recency a rank or a tier inside the member list.** The two that come
closest still don't: Glofox put `last visit date` as a *column* on a billing-keyed report (May 2026),
and Wodify puts a **red ring around the at-risk member's avatar** — a badge, not a re-ranking.
[DOCUMENTED across all named vendors]

**C4. "Days since expiry" and "days since visit" are treated as two different questions by every
vendor that models both.** TeamUp says it outright — *"Customers who have an active membership or a
membership which is on hold can have a Slipping Away status… however, they can not become
'Inactive'"*, i.e. a **paying member can be at risk**, and the two clocks are arbitrated explicitly.
WellnessLiving says it structurally by putting `Purchase Option Status` as a *column* on a
last-visit-ranked report. Wodify says it by scoping "Clients without Sign Ins (15 Days)" to
**active** clients. Nobody merges the two clocks into a single ordering. [DOCUMENTED]

**C5. The pre-lapse window is first-class everywhere; the post-lapse window is not.**
`Caduca Pronto` = 14 days (CrossHero) · `Próximas Renovaciones` = 15 days + "1 session left"
(Fitco) · `Membresías por Vencer` = today/1/3/5 days (Connect Gym, OBSERVED) · `Expiring` as its own
membership status (Mariana Tek) · the Expiring Members Report (Glofox) · `Pending Cancel` /
`Pending Cancels` pipeline column (PushPress). Every vendor has a named surface for *about to
expire*. Only **Fitco** has an equally sharp named surface for *just expired* — and it is bounded.
[DOCUMENTED]

**C6 (weaker, but worth stating). Nobody found puts expired members at the top of the default list.**
This is a **negative finding across the set** rather than a positive statement any vendor makes.
Of the four structural answers below, none ranks lapsed members above current ones in the default
view. Confidence: **INFERRED from documented absence** — no vendor documents its default sort order
at all, so this is "not found anywhere", not "confirmed impossible".

---

## Part 4 — The real disagreements

### D1. Where lapsed members physically live — four genuinely different answers

| Answer | Vendors | Shape |
|---|---|---|
| **A. Label flips, same list** | Gymflow, Glofox, Clubworx, Momence, Arketa, Fitco, CrossHero, Boxmagic, WellnessLiving (*type* axis) | Member→Customer, Activo→Inactivo, Active Member→Inactive Member. No relocation, no tab. Gymflow is the purest: one Users page, complete set, one count |
| **B. Separate tab or separate page** | Gymdesk (`Canceled` tab), Wodify (`Inactive` tab), **Xplor Triib** (`Active Member List` vs `Other Member Lists`), Trainingym (`Socios de Baja` list), PushPress (lifecycle *pipeline* rather than the Members tab) | Triib and Trainingym are the extreme — a different **page**, so there is no filter to see and nothing to clear |
| **C. Hidden by default behind a clearable filter** | WellnessLiving — **and its own docs contradict each other on whether this is true** | Applies only to the *declared* deactivation, never to mere expiry |
| **D. No directory at all** | Mariana Tek | Search-first by email/name/phone; grouping via tags. There is no list-default question to answer |

**What the split correlates with.** The evidence supports two correlations and refutes a third:

- **Whether the vendor has a declared "gone" lever.** Answer B vendors all have one (cancel, archive,
  dar de baja, deactivate) and use it as the relocation trigger. Answer A vendors mostly do not —
  their state is a pure function of entitlement, so there is nothing to relocate *on*. This is the
  strongest correlation in the data. [INFERRED from the DOCUMENTED per-vendor facts]
- **Horizontal vs gym-native.** AgendaPro — the only non-gym-native product in the set — has **no
  membership lifecycle whatsoever** and substitutes tenant-configurable booking recency. Every
  gym-native vendor has a lifecycle. If the directory is for a gym, the horizontal pattern is not the
  precedent to copy. [DOCUMENTED]
- **NOT price tier, and NOT gym type.** Gymflow ($129/mo flat, independent gyms) and Momence
  (boutique studios) both use Answer A; Wodify (CrossFit) and Xplor Triib (CrossFit) sit in B
  despite serving the same vertical; Mariana Tek (premium boutique chains) is alone in D. The
  challenger/legacy split from the prior competitor scans does **not** predict this. [INFERRED]

### D2. Does "member" survive a payment failure?

Genuinely contested, and it is a product-values question, not a technical one.

- **Gymflow says yes, explicitly:** *"A member is someone with any membership that is currently
  active, **paused, overdue or pending**."* A payment hiccup does not demote you.
- **Glofox says no:** `Overdue` is its own filter value, and the member **loses club access 7 days
  after the failed payment** (returning to Active if the retry succeeds or the balance is written off).
- **Mariana Tek splits it further still:** `Charge Declined - Payment` vs `Charge Declined - Penalty`.
- **TeamUp / Wodify sidestep it** by keeping access enforcement on a different axis from the
  directory label (Wodify's Membership Enforcement has three settings: allow silently / allow with
  warnings / prevent).

### D3. Do the header counts partition?

Only one vendor's does — and the majority don't publish a count at all.

- **Gymflow**: one number over the complete set. Cannot overlap because there is only one.
- **WellnessLiving**: **explicitly overlapping** — the Enterprise Client Status Report counts a
  client with both an active pass and an active membership in *both* columns.
- **Fitco**: **overlapping by design**, and documents it — clients appear across multiple dashboard
  tiles, and a drill-down deliberately shows *"la sumatoria de ambos"*.
- **CrossHero**: runs two mutually-unreconciled populations — `Clientes Activos` (billing) and
  `Clientes en Riesgos` (attendance) — and never addresses the overlap.
- **Connect Gym** (OBSERVED): uses the **ratio form**, `Alumnos Activos 47 de 52 totales` — which
  sidesteps the problem entirely by anchoring one subset to the whole roster instead of asserting a
  partition.
- **Everyone else**: NOT FOUND. Eight of ten global vendors do not document a directory header count.

**Bearing on #180's `21 total · 9 vigentes · 13 por renovar` bug:** no vendor found claims a
partition and then breaks it. The two defensible published shapes are **one number over the whole
set** (Gymflow) and **a subset-of-total ratio** (Connect Gym). Vendors that show several numbers
(WellnessLiving, Fitco) tell the operator up front that the sets overlap.

### D4. Is the derived state allowed to be overridden by a human?

- **Mindbody: yes, and the human wins.** *"Custom statuses override system statuses."*
- **TeamUp: yes, but the override is visible and revocable.** A manual kanban drag pins the card
  with a **"Manual" tag**; automation stops touching it until staff click **"Revert to automation"**.
- **Fitco / Gymflow / Arketa / Glofox: no.** State is a pure function of entitlement. Fitco has no
  `dar de baja` verb at all.
- **Trainingym: the automation is opt-in**, off by default, with a documented warning list.
- **Boxmagic: the automation is opt-in *and* the grace window is a tenant setting** (`Días impagos`,
  where `0` means same-day).

This is the axis most directly in tension with ADR-0002 (derived-at-read), and the vendors split
cleanly on it rather than converging.

### D5. Where the attendance clock's boundaries actually sit

Four vendors publish concrete numbers. They do not agree, and the spread is 7–31 days.

| Vendor | Bands | Clock |
|---|---|---|
| **CrossHero** | riesgo **bajo 7–10** · **moderado 11–15** · **alto 16–31** days | *sin reservar o sin hacer check-in* |
| **TeamUp** | `Slipping Away` at **15 days** (example/configurable) | days since class attendance |
| **Wodify** | "Clients without Sign Ins (**15 Days**)" | days since class sign-in |
| **Zen Planner** | **10 days** → automated alert/email/text | days since seen |
| **Trainingym** | **#noFitness 7 days**, **#noActive / #noApp 30 days** | days without a validated session / app access |
| **WellnessLiving** | **two operator-set thresholds** — "has not visited in" (min) and "is considered lost after" (max) | days since last visit |
| **AgendaPro** | operator-set; worked examples **45** and **90 days** | days since last booking |
| **Gymdesk / Finegym / Boxmagic** | operator-set, no default published | days since check-in |

**Note the shape, not the number**: the majority make the threshold a **tenant setting**, and the
one vendor with the most explicit model (WellnessLiving) uses **two** thresholds — a floor for
"at risk" and a ceiling for "considered lost" — rather than one.

### D6. The post-lapse horizon — how long a lapsed member stays worth working

Thin evidence, and only one vendor puts a hard number in its product.

- **Fitco, in the product**: `Clientes por Recuperar` covers **days 1–15 after expiry**, split by
  *expired by date* vs *sessions ran out*. **"After 16 days, clients no longer appear."** [DOCUMENTED]
- **CrossHero, in automation**: post-expiry recovery cadence at **1 day, 1 week, 2 weeks, 1 month,
  2 months**. [DOCUMENTED]
- **Industry guidance** (not a vendor product): prioritise members who cancelled **within the last
  12 months**; those gone **more than 18 months** need a "lighter-touch approach"; a healthy
  lapsed-member campaign reactivates **10–20%**, versus **25–40%** for *frozen* members "given these
  members never fully departed". [REPORTED — cloudstudiomanager.com, an industry blog]
- **Why attendance is the better predictor, quantified** (vendor content, so treat as motivated):
  PushPress publishes **12+ check-ins/month → ~2% chance of cancelling next month** vs
  **1 check-in/month → ~20%**. Glofox publishes "5 visits in the first month → 90%+ retention" and
  "20 visits in 60 days" as retention benchmarks. [REPORTED]

---

## Part 5 — What the evidence does and does not settle for map #180

Stated plainly so the ruling ticket can cite the strength, not just the claim.

**Settled by convergent, documented practice:**
1. Lapsed members stay in the system and stay reachable (C1).
2. Attendance recency belongs on a *different surface* from the directory list — report, automation,
   segment or badge (C3). No vendor tiers the list on it.
3. Billing recency and attendance recency are two clocks, not one ordering (C4).
4. The pre-expiry window deserves a named surface; every vendor has one (C5).
5. Nothing outside gym software stores "lapsed" as a status on a *person* — it is always derived at
   read time (Part 2). And no billing system puts lifecycle state on the person at all.

**Genuinely contested, so the ruling must choose and justify rather than cite:**
1. Same-list-relabel vs separate-tab vs separate-page (D1) — four shipping answers, correlating with
   whether a declared "gone" lever exists, **not** with price tier or gym type.
2. Whether a payment failure demotes a member (D2).
3. Whether a human may override the derived state (D4) — directly in tension with ADR-0002.
4. The attendance thresholds themselves (D5) — 7 to 31 days across vendors; most make it a setting.
5. The post-lapse horizon (D6) — one vendor number (15 days in-product), one industry number
   (12 months), and they are answering different questions.

**Not answerable from this research:**
- What the *default sort order* of any vendor's member list is. Nobody documents it. #180's central
  observation — that RED sorts most-expired-first — has **no published counter-example and no
  published precedent**. It can only be argued from principle, not from citation.
- Whether any vendor's directory default filter is visible/clearable is undocumented for TeamUp,
  Clubworx, Glofox and Fitco — four of the most relevant vendors — and only *inferred* for Wodify.
  Gymdesk is the one clean **DOCUMENTED** "default view shows active members".

---

## Sources

**Gymdesk** — [Member management](https://docs.gymdesk.com/en/help/docs/member-list) · [Glossary](https://docs.gymdesk.com/en/help/docs/gymdesk-glossary-0) · [Member & visitor accounts](https://docs.gymdesk.com/en/help/docs/member-accounts) · [Freezing/unfreezing](https://docs.gymdesk.com/en/help/docs/freezing-unfreezing-members) · [Mass member operations](https://docs.gymdesk.com/en/help/docs/mass-member) · [Attendance tracking](https://docs.gymdesk.com/en/help/docs/attendance-tracking) · [Lead management](https://gymdesk.com/features/lead-management) · [Automations](https://gymdesk.com/features/automations) · [Reporting](https://gymdesk.com/features/reporting)
**PushPress** — [Member status tags](https://help.pushpress.com/en/articles/508623-core-member-status) · [Members search](https://help.pushpress.com/en/articles/508637-core-members-search) · [Plan statuses & billing actions](https://help.pushpress.com/en/articles/9925654-plans-status-billing-actions-in-core-by-pushpress) · [Opportunities overview 2.0](https://help.pushpress.com/en/articles/10910768-opportunities-overview-2-0) · [Engagement report](https://help.pushpress.com/en/articles/8028490-core-engagement-report) · [Retention guide](https://www.pushpress.com/blog/gym-member-retention-guide)
**Zen Planner** — [Pricing (Active Member definition)](https://zenplanner.com/pricing/) · [Membership tracking (default report criterion)](https://zenplanner.com/business-operations/gym-membership-tracking-with-zenplanner/) · [Attendance tracking / 10-day alert](https://zenplanner.com/blogs/how-zen-planner-tracks-attendance-for-martial-arts-and-bjj-academies/) · [Prospect status reports](https://help.zenplanner.com/hc/en-us/articles/203999010-Prospect-Status-Reports) *(404 at fetch time)*
**Mindbody** *(all DOCUMENTED (index) — page bodies unrenderable)* — [Membership report](https://support.mindbodyonline.com/s/article/203256883-Membership-report?language=en_US) · [Member statuses](https://support.mindbodyonline.com/s/article/203259233-Member-statuses?language=en_US) · [Active and inactive client accounts](https://support.mindbodyonline.com/s/article/203257863-How-do-I-delete-deactivate-a-client?language=en_US) · [Automatically deactivate stagnant clients](https://support.mindbodyonline.com/s/article/204821227-How-to-automatically-deactivate-stagnant-clients) · [List of clients that have not visited for a while](https://support.mindbodyonline.com/s/article/How-do-I-generate-a-list-of-clients-that-have-not-visited-for-a-while-and-currently-do-not-have-available-sessions?language=en_US) · [Attendance Analysis](https://support.mindbodyonline.com/s/article/204248136-Which-report-can-I-use-to-track-the-number-of-active-clients-I-have?language=en_US) · [LoopSpark: Mindbody client profile status](https://docs.loopspark.com/client_profiles/profile_status/) *(third-party integrator, fetched successfully)*
**TeamUp** — [All customers report](https://support.goteamup.com/en/articles/9327777-reports-all-customers) · [Slipping-away criteria](https://support.goteamup.com/setting-your-slipping-away-customer-criteria) · [Inactive criteria](https://support.goteamup.com/en/articles/9327667-setting-your-inactive-customer-criteria) · [CRM lifecycle pipeline](https://support.goteamup.com/en/articles/14980328-introduction-to-teamup-crm-and-the-lifecycle-pipeline) · [Kanban automations & manual overrides](https://support.goteamup.com/en/articles/14981617-crm-kanban-board-automations-assignments-and-manual-overrides) · [Slipping-away report](https://support.goteamup.com/en/articles/9327703-reports-slipping-away) · [Bulk delete](https://support.goteamup.com/en/articles/9327774-how-can-i-bulk-delete-customers) · [What is an active customer](https://support.goteamup.com/en/articles/11132331-what-is-an-active-customer)
**Wodify** — [Client status](https://help.wodify.com/hc/en-us/articles/208738678-Understand-the-Client-Status) · [Deactivate/reactivate clients](https://help.wodify.com/hc/en-us/articles/209427317-Deactivate-and-Reactivate-Clients) · [Membership enforcement](https://help.wodify.com/hc/en-us/articles/209427277-Membership-Enforcement) · [Attendance in Insights](https://help.wodify.com/hc/en-us/articles/360054676114-Understand-Attendance-in-Insights) · [Wodify Retain](https://help.wodify.com/hc/en-us/articles/10064247597847-Understand-Wodify-Retain) · [People reporting](https://help.wodify.com/hc/en-us/articles/360058761813-Understanding-People-Reporting)
**WellnessLiving** — [Client types](https://help.wellnessliving.com/en/articles/8976766-client-types) · [Client list](https://help.wellnessliving.com/en/articles/9180001-client-list) · [Locate deactivated clients](https://help.wellnessliving.com/en/articles/11096553-locate-deactivated-clients) · [Clients at Risk report](https://help.wellnessliving.com/en/articles/11165734-clients-at-risk-report) · [Enterprise client status report](https://help.wellnessliving.com/en/articles/11125279-enterprise-client-status-report-enterprise-report)
**Xplor Triib / Studio** — [Member statuses](https://help.studio.xplor.co/en/articles/5653710-what-are-member-statuses) · [Exporting from Triib](https://help.studio.xplor.co/en/articles/5589465-how-do-i-export-from-triib)
**Gymflow** — [User types](https://support.gymflow.io/articles/6648755-user-types) · [User lists](https://support.gymflow.io/articles/6648766-user-lists)
**ABC Glofox** — [Client filters](https://support.glofox.com/hc/en-us/articles/46433585112852-How-to-Use-the-Client-Filters-on-Your-Glofox-Dashboard) · [Overdue memberships](https://support.glofox.com/hc/en-us/articles/46433603444628-How-to-Find-Overdue-Memberships) · [May 2026 product updates](https://www.glofox.com/blog/abc-glofox-may-2026-product-updates/) · [Retention guide](https://www.glofox.com/blog/everything-you-need-to-know-about-gym-member-retention/)
**Clubworx** — [Member vs prospect vs NAC](https://intercom.help/clubworx/en/articles/931993-what-is-the-difference-between-a-member-prospect-and-non-attending-contact) · [Member attendance](https://intercom.help/clubworx/en/articles/579937-how-do-i-see-my-member-s-attendance) · [Member management (marketing)](https://www.clubworx.com/product/member-management)
**Momence** — [Term glossary](https://help.momence.com/en/articles/7869547-momence-term-glossary) · [Customer info collection & management FAQ](https://help.momence.com/en/articles/12028601-customer-info-collection-management-faq-s)
**Mariana Tek** — [Membership statuses](https://support.marianatek.com/en/articles/1987380-what-are-the-different-membership-statuses) · [How do I search for a customer](https://support.marianatek.com/en/articles/1985674-how-do-i-search-for-a-customer) · [Customer management collection](https://support.marianatek.com/en/collections/407340-customer-management) · [Customers - Summary report](https://support.marianatek.com/en/articles/6330616-how-do-i-use-the-customers-summary-report)
**Arketa** — [Segmenting clients](https://help.sutrapro.com/en/articles/9441930-segmenting-clients) · [Using segments in broadcasts](https://help.sutrapro.com/en/articles/9442128-using-segments-in-broadcasts)
**Membr** — [Member status types](https://membrsupport.zendesk.com/hc/en-gb/articles/205745891-Q-What-do-the-various-member-status-types-mean)
**Finegym** — [Dashboard & KPIs](https://docs.finegym.io/admin/dashboard-kpis)
**Trainingym** — [Gestionar listado](https://help.trainingym.com/es/knowledge/gestionar-listado) · [Dar de baja a un socio](https://help.trainingym.com/es/knowledge/dar-de-baja-a-un-socio-en-trainingym-manager) · [Automatizar la baja](https://help.trainingym.com/es/knowledge/automatiza-la-baja-de-tus-clientes-cuando-venza-su-tarifa) · [Seguimiento del socio](https://help.trainingym.com/es/knowledge/seguimiento-del-socio) · [Hashtags para segmentar](https://help.trainingym.com/en/knowledge/use-hashtags-to-segment-member-database) · [Informes Pro — predicción de riesgo de abandono](https://help.trainingym.com/es/knowledge/informes-pro.-predicci%C3%B3n-de-riego-de-abandono) · [Perfiles de socio](https://help.trainingym.com/es/knowledge/perfiles-de-socio) · [Informe grupos](https://help.trainingym.com/es/knowledge/informe-grupos)
**CrossHero** — [Estatus de los clientes](https://support.crosshero.com/es/articles/931296-estatus-de-los-clientes) *(screenshot present)* · [Estatus de las suscripciones](https://support.crosshero.com/es/articles/1596290-estatus-de-las-suscripciones) · [Informes, métricas y KPIs](https://support.crosshero.com/es/articles/4048668-informes-metricas-y-kpis) · [Engagement automático](https://support.crosshero.com/es/articles/4117065-engagement-automatico) · [Pausar la suscripción](https://support.crosshero.com/es/articles/3362475-pausar-la-suscripcion-de-los-clientes)
**Fitco** — [Cómo saber si soy un cliente activo](https://soporte.fitcolatam.com/es/articles/5808724-10-como-saber-si-soy-un-cliente-activo) · [Dashboard: cómo funciona](https://soporte.fitcolatam.com/es/articles/4566446-dashboard-como-funciona-y-para-que-sirve) · [Registrar un nuevo cliente (list columns)](https://soporte.fitcolatam.com/es/articles/4662896-como-registrar-a-un-nuevo-cliente) · [Resumen de membresías](https://soporte.fitcolatam.com/es/articles/10669702-como-se-interpreta-el-resumen-de-las-membresias-de-tus-clientes-descubrelo-aqui-y-mejora-la-gestion-de-tus-clientes) · [Categorización de clientes](https://soporte.fitcolatam.com/es/articles/4566488-categorizacion-de-clientes-que-es-para-que-sirve-y-como-usarla) · [Reportes](https://www.fitcolatam.com/reportes-fitco/)
**Boxmagic** — [Lista de clientes y filtros](https://help.boxmagicapp.com/es/lista-de-clientes-y-filtros-de-b%C3%BAsqueda) · [Perfil de clientes](https://help.boxmagicapp.com/es/c%C3%B3mo-ver-el-perfil-de-mis-clientes) · [Desactivación automática (2017 blog)](https://boxmagicapp.wordpress.com/2017/10/09/desactivar-alumnos-de-forma-automatica/)
**AgendaPro** — [Colección Clientes (enumerated)](https://ayuda.agendapro.com/es/collections/969573-clientes) · [Buscar/editar un cliente](https://ayuda.agendapro.com/es/articles/6216991-como-puedo-buscar-editar-un-cliente) · [Usar los filtros](https://ayuda.agendapro.com/es/articles/6264221-como-usar-los-filtros-en-mi-base-de-clientes) · [Eliminar el perfil de un cliente](https://ayuda.agendapro.com/es/articles/6382259-como-eliminar-el-perfil-de-un-cliente) · [Asistencia, pagos y deudas](https://ayuda.agendapro.com/es/articles/5201093-como-ver-la-asistencia-pagos-y-deudas-de-un-cliente) · [Detectar clientes que no vuelven (blog)](https://agendapro.com/blog/como-detectar-clientes-que-no-vuelven/)
**Connect Gym** — [connectgyms.com](https://connectgyms.com/) *(product screenshot on landing page)*
**CRM / billing / recency** — [HubSpot lifecycle stages](https://knowledge.hubspot.com/records/use-lifecycle-stages) · [HubSpot custom lifecycle stages](https://knowledge.hubspot.com/object-settings/create-and-customize-lifecycle-stages) · [HubSpot lead status](https://knowledge.hubspot.com/articles/kcs_article/contacts/how-can-i-use-the-lead-status-property-in-my-sales-process) · [HubSpot community: churned clients](https://community.hubspot.com/t5/CRM/What-lifecycle-stage-do-you-assign-churned-clients/m-p/250730) · [Salesforce convertLead](https://developer.salesforce.com/docs/atlas.en-us.api.meta/api/sforce_api_calls_convertlead.htm) · [Salesforce converted-lead permission](https://help.salesforce.com/s/articleView?id=sales.leads_view_edit_converted.htm&type=5) · [Stripe subscription object](https://docs.stripe.com/api/subscriptions/object) · [Stripe subscriptions overview](https://docs.stripe.com/billing/subscriptions/overview) · [Stripe smart retries](https://docs.stripe.com/billing/revenue-recovery/smart-retries) · [Stripe customer object](https://docs.stripe.com/api/customers/object) · [Chargebee subscriptions API](https://apidocs.chargebee.com/docs/api/subscriptions) · [Chargebee customers API](https://apidocs.chargebee.com/docs/api/customers) · [Recurly subscription dashboard](https://docs.recurly.com/docs/subscription-dashboard) · [Recurly accounts](https://docs.recurly.com/docs/accounts) · [Klaviyo RFM scoring](https://help.klaviyo.com/hc/en-us/articles/17797937793179) · [Shopify segment filters](https://help.shopify.com/en/manual/customers/customer-segmentation/reference-guide/shopify-segments) · [Intercom user data / last_seen_at](https://www.intercom.com/help/en/articles/320-tracking-user-data-in-intercom) · [ChurnZero health score](https://churnzero.com/churnopedia/health-score/) · [NCUA dormant accounts](https://publishedguides.ncua.gov/examiner/Content/ExaminersGuide/Credit%20Union%20Operations/InternalControls/ExamProcedures/DormantAccounts.htm) · [RFM analysis overview](https://www.techtarget.com/searchdatamanagement/definition/RFM-analysis)
**Industry (REPORTED tier)** — [VERVE Pulse gym metrics glossary](https://vervepulse.io/gym-metrics-glossary) · [Reactivation campaigns: frozen & lapsed](https://cloudstudiomanager.com/reactivation-campaigns/) · [Member engagement tracking / recency scoring](https://resources.rework.com/libraries/gym-fitness-growth/member-engagement-tracking)
