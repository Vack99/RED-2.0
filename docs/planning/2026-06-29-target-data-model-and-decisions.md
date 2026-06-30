# Multi-Gym Platform — Target Data Model & Locked Decisions

> **Companion to** `2026-06-29-multi-gym-platform-roadmap.md`. **Source of truth for the DB restructure.**
> Reverse-engineered from two frontend mocks (read-only, on Desktop, *not* in this repo):
> - **Client app** (member-facing, brand RED): `…\RED-1.0-Design\index.html` (12 screens)
> - **Admin "Agenda" page** (operator class scheduling): `…\RED-1.0-Design\RED-AdminApp-Class-Page\Agenda Week View.html`
>
> **Planning only — no code yet.** This doc fills the roadmap's open decisions so a fresh
> implementation session cannot drift. Anything marked **🔒 LOCKED** is decided; anything
> marked **🅿️ PARKED** has a stated default and may be revisited at the named phase.

---

## 1. Identity & tenancy — 🔒 LOCKED (two tiers)

The platform has **two kinds of `auth.users`**, mapped to a gym by a membership/role row.

| Tier | Who | How they get an account | Role |
|---|---|---|---|
| **Gym / tenant onboarding** | a new gym ("Forge", "RED", future) | **Manual / invited for now** — owner account + `gym` row + domain are provisioned out-of-band. *Self-serve gym registration is FUTURE work.* | `owner` / `operator` |
| **Member auth** | people who train at a gym | **Self-service registration** (per the client mock): name, email+password, phone (+52, for WhatsApp), required terms+privacy checkbox. Gym is set by the **domain they register on** (no gym selector in the UI). | `member` |

- One shared table maps identity → tenant + role, e.g. **`gym_membership (user_id → auth.users, gym_id → gym, role text)`**. RLS predicates resolve "which gym + what role" from this.
- `entrar` (login) = email + password only, with forgot-password. No phone-OTP / social login.
- Operators and members are **distinct roles with distinct profile tables** (operator identity vs `member` profile) — never the same row.

## 2. Member ↔ CRM linkage — 🔒 LOCKED (claim-by-match)

Today `clientes` are **operator-created CRM rows** (members don't log in); the Agenda roster
reads each member's package balance from them (*"8 clases · quedan 3"*, *"Ilimitado"*, *"por renovar"*).

- **One `member` table per gym** (evolves from `clientes`), with a **nullable `auth_user_id`**.
- When a person **self-registers**, match on **email/phone** to a pre-existing `member` row:
  - **Match →** populate `auth_user_id` on that row (the member *claims* it; package balance + history carry over).
  - **No match →** create a new `member` row linked to the new `auth_user_id`.
- This prevents duplicate members and orphaned `paquetes` balances. *(Veto point: if you'd rather always create fresh rows, say so before Phase 3.)*

## 3. Showcased vs member-owned — the RLS backbone (🔒 LOCKED posture)

Every new table is **gym-scoped** (`gym_id` FK) with RLS. Two RLS classes:

| Class | Tables | Write | Read |
|---|---|---|---|
| **Curated / showcased** (operator authors, members view) | `gym`, `gym_hours`, gym content (`about_value`, `facility`, `stat`, `faq`), `coach`, `class_type`, `plan`(+`plan_feature`), `class_session`(+`schedule_template`), `room` | operator/owner of that gym | members of that gym (+ public/anon for marketing pages) |
| **Member-owned / transactional** (member creates own) | `member` *(self fields)*, `subscription`, `reservation`, `payment`, member stats, notification prefs, `waitlist_entry` | the member (`auth_user_id = auth.uid()`) — operator may also write (e.g. walk-ins, attendance) | the owning member + the gym's operator |
| **Public intake** | `contact_message` | anon (public form) | operator |

> 🔒 **Invariant:** isolation is enforced by **RLS keyed to gym membership + role**, *never* by trusting the `proxy.ts` tenant header (that header is brand/UX only). Keep ADR-0001's rules (`server-only` DAL, RLS-as-boundary, no `getSession()`).

## 4. Target schema (entities)

Types are indicative Postgres. Exhaustive field lists live in the two mock-analysis reports;
this is the structural spine + the non-obvious rules.

### Tenant & identity
- **`gym`** *(tenant; absorbs brand/location/contact from old `perfil`)* — `id`, `owner_user_id→auth.users`, `brand_name` ("RED"), `legal_name`, `tagline`, `descriptor`, `city`, `address`, `lat/lng`, `phone_whatsapp`, `email`, `instagram`, `founded_year`, `area_m2`, `currency`('MXN'), `iva_included`.
- **`gym_hours`** — `gym_id`, `weekday 0–6`, `open_time`, `close_time`, `is_closed` (Domingo closed).
- **`gym_membership`** — `user_id`, `gym_id`, `role` (`owner|operator|member`). §1.
- **operator profile** *(thin; what's left of `perfil` after brand graduates to `gym`)*.

### Curated catalog & content (operator writes)
- **`coach`** — `id`, `gym_id`, `name`, `initials`, `role`, `specialty`, `bio`, `is_active`, `sort_order`. (7 coaches.)
- **`class_type`** — `id`, `gym_id`, `name` (`Fuerza|Funcional|Metcon|Open`, **operator-extensible**), `room/sala`, `level`, `description`, `default_duration_min`; children `class_type_workblock`, `class_type_bring_item`.
- **`class_session`** — `id`, `gym_id`, `class_type_id`, **`starts_at timestamptz` (absolute — see §5)**, `duration_min` (30/45/60/75/90), `capacity` (4–40), `is_special`/`special_name`, `template_id?`, `room_id?`. Coaches via **`class_session_coach (session_id, coach_id)`** (multi-coach).
- **`schedule_template`** — `id`, `gym_id`, `class_type_id`, `weekday 0–5`, `start_time`, `duration_min`, `capacity`, default coach(es), `is_active`. (The editor's "create across N weekdays" generator.)
- **`plan`** *(evolves from `paquetes`; the public catalog)* — `id`, `gym_id`, `code` (`suelta|ocho|abierta`), `name`, `subtitle`, `price_cents`, `cadence`, `class_quota int NULL` (NULL = unlimited), `is_unlimited`, `badge`, `is_featured`; child `plan_feature`.
- **gym content:** `about_value`, `facility`, `stat`, `faq` (all `gym_id`-scoped).
- **`room`** — 🅿️ `id`, `gym_id`, `name`, `capacity` (mock assumes single location; nullable FK).

### Member-owned / transactional
- **`member`** *(evolves from `clientes`)* — `id`, `gym_id`, `auth_user_id NULL`(§2), `full_name`, `email`, `phone_e164`, `member_since`, `favorite_class_type_id`, `notifications_enabled`, `terms_accepted_at`, `privacy_accepted_at`.
- **`subscription`** — `id`, `member_id`, `plan_id`, `status` (`active|frozen|cancelled`), `classes_used`, `classes_total`, `renews_on`, `period_start/end`, `frozen_until`. (Freeze: up to 15 días/mes.)
- **`reservation`** — `id`, `gym_id`, `class_session_id`, `member_id`, `status` (`reservada|cancelada|asistida|no_show`), `is_walk_in`, `checked_at`, `created_at`, `cancelled_at`. **Unique (`member_id`, `class_session_id`).**
- **`asistencia`** *(existing, evolves)* — gains `class_session_id` (and `reservation_id`) FK; "Pasar lista" writes here (*"asistencias enviadas a ASIST"*). The `asistida` state of a reservation.
- **`payment`** *(evolves from `ventas`)* — `id`, `member_id`, `plan_id`, `paid_on`, `amount_cents`, `method`, `card_last4`, `status`('Pagado').
- **member stats** — `clases_tomadas`, `racha_sem`, `favorita`, monthly usage by type → **a VIEW** over `reservation`+`class_session`, not a base table.
- **`contact_message`**, **`waitlist_entry`**, notification log/prefs.

### Evolution map (current 7 → target)
| Current | Becomes |
|---|---|
| `clientes` | **`member`** (+ `auth_user_id`, member-editable fields) |
| `ventas` | **`payment`** (+ feeds `subscription` renewals) |
| `paquetes` | **`plan`** (public catalog) + live **`subscription`** state |
| `asistencias` | `asistida` state of **`reservation`** (+ `class_session_id` FK) |
| `perfil` | **`gym`** (brand/location/contact, member-facing) + thin operator profile |
| `plantillas`, `cobro` | stay operator-side; member app adds member-facing notifications + (future) card checkout |

## 5. Do-not-violate invariants (🔒 — the shield)

A fresh implementation session **must not**:
1. **Store occupancy/spots.** `spots = capacity − count(active reservations)` is always **DERIVED**. (The mocks mutate it directly — that is mock-only.)
2. Create any tenant table **without `gym_id` + RLS**. New `public` tables auto-get RLS via the existing `rls_auto_enable` event trigger — do not disable it.
3. Model `class_session` time as weekday+string. Use **absolute `starts_at`**; recurrence lives in **`schedule_template`**.
4. Use a single coach column. **Multi-coach → join table.**
5. Forget package consumption: **booking/attendance decrements the member's `subscription`/`paquete`** balance; **`Ilimitado` does not decrement**; a **no-show on the 8-class plan still consumes** a class.
6. Trust the `proxy.ts` tenant header for isolation. **RLS is the boundary.**
7. Merge operator and member into one auth role/table.
8. Reintroduce `middleware.ts` (Next 16 = `proxy.ts`, Node-only) or use `getSession()` (use `getClaims()`/`getUser()`) — per ADR-0001.

## 6. Parked sub-decisions (🅿️ — defaults stated)

- **Payments / subscriptions processing — DEFERRED.** The client `membresía/checkout` screens (card fields, "Pagar", cargo automático, facturación) are **UI-only for v1**; no real payment processor wired. Build plan-selection + status; defer charging. (Revisit post-launch.)
- **Canonical tenant name.** Brand string is "RED" everywhere user-facing, but contact handles say Forge (`hola@forgebootcamp.mx`, `@forge.bootcamp`). **Default:** store `brand_name` *and* contact handles on `gym`; treat them independently. Confirm the canonical legal name per gym at Phase 3.
- **Room/location.** Mock assumes one location; `class_type.sala` ("Sala Yunque/Forja/Brasa") reads as a *room label*, not a second venue. **Default:** single `room` per gym, `class_session.room_id` nullable. Revisit if a gym gets multiple venues.
- **Self-serve gym onboarding.** Out of scope now (gyms invited/provisioned). Future.

---

**Status:** Draft — 2026-06-29. Feeds Phase 0 ADRs (platform architecture · member auth + member/CRM unification · class-scheduling model) and the Phase 3 DB plan.
