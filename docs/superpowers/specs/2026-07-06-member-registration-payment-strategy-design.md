# Design — Member registration SSOT + payments strategy

**Date:** 2026-07-06 · **Status:** Phase 1 approved for implementation; Phases 2–3 recorded, not yet scheduled.
**Origin:** convergence-tested multi-agent strategy run (4 independent expert vantages, HIGH convergence; keep-it-lean gate: SHIP-WITH-CUTS) + owner decisions this session. Supersedes the open questions in `docs/Context/2026-07-06-red-auth-ssot-handoff.md` §2.
**Live-verified 2026-07-06:** the production DB schema and RPC bodies were queried directly (`information_schema`, `pg_get_functiondef`) and **match the migration files exactly — no drift**. Findings below are anchored to ground truth, not files alone.

---

## 1. The problem (verified against the live DB)

The client app is a **booking app**: `reservar_clase` (migration `20260706170000`) refuses a booking unless the caller has a `clientes` row linked to their `auth_user_id` in that gym, with a non-expired `vence` **and** `clases_restantes > 0` (Ilimitado exempt). Booking requires **an account + a paid balance**. Two disconnected doors create members, and they never meet.

- **Door 1 (admin):** the operator creates a client only through the sale flow — the live `registrar_venta` (Contract-B, `20260705082018`), new-client branch — inserting **`nombre`, `tel`, balance, `gym_id` only. No `email`, no `auth_user_id`.** This person is in the CRM but cannot log in.
- **Door 2 (client app `/registro`):** `signUp` → `reclamar_o_crear_cliente` claims an existing unclaimed `clientes` row **by verified email** (`lower(email)`), else mints a fresh row, and writes `gym_membership(member)` atomically.

**Defect A — the two doors never meet.** The only join key is email, but Door 1 never writes it (the `clientes.email` column exists and Door 2 already reads it). An admin-created paying client who later self-registers is not matched → a **duplicate `clientes` row**; paid balance/history does not carry over.

**Defect B — fresh self-registrations are accidentally Ilimitado.** `clientes.clases_restantes` has **no default (`NULL`)**, and the live `reclamar_o_crear_cliente` create path **omits it** → a freshly self-registered member's balance is `NULL` = **Ilimitado**; `reservar_clase` then skips both the zero-check and the decrement, letting them **book unlimited free classes**. Currently unexploited: the live DB has **0 self-registered members** (all 38 `clientes` are staff-created) — which is also why the registration path has never yet produced a bookable member. Must be closed before the pilot.

## 2. Decisions locked this session

1. **Accounts + booking is the product — permanent.** Members create accounts in the client app and book their own classes; this is the value proposition and why `gym_membership`/`reservation`/`reservar_clase` exist. "Pay at the gym" is **not** an account model — it is the interim *payment method* until Stripe. Two independent axes: **account = always required; payment location = evolves.**
2. **Identity SSOT (already correct, keep it):** `clientes` = the money-bearing per-gym record; `auth.users` = login; the one link is `clientes.auth_user_id`, written only inside a `SECURITY DEFINER` RPC gated on `email_confirmed_at`; the human join key is the **verified email** (case-insensitive, gym-scoped). Phone is never a link key. Invariant: one human per gym = one `clientes` row.
3. **Revenue model (owner correction to the consensus):** RED monetizes a **SaaS subscription charged to gyms**, **not** a take-rate on member transactions. Gyms **connect their own Stripe and pay their own processing fees**; RED takes **no cut** of member payments. Consequence: RED never routes or holds member money → the biggest projected risk (SAT *plataforma de intermediación* withholding, Ley Fintech / IFPE fund custody, mandatory MX entity/RFC/CLABE) is **largely removed**. RED becomes "bring-your-own-Stripe" software.
4. **Do not gate in-app payment behind a premium tier** (rejects the earlier instinct; every credible competitor ships member pay on base). With no RED transaction cut, "online payments" is a **product/tier feature**, not a revenue lever — which tier it lands in is a Phase 3 decision.

## 3. Phase 1 — immediate ship (this week, zero Stripe)

**Goal:** a real gym can register members who can actually book, with admin-truth and app-truth converging on one record, and **no free-booking hole**. Smallest correct change; Forge stays green.

### 3.1 Close the self-registration Ilimitado hole (highest priority — Defect B)
`create or replace` `reclamar_o_crear_cliente` (SECURITY DEFINER posture unchanged), adding `clases_restantes = 0` to the **create-path** insert:
```sql
insert into public.clientes
  (gym_id, auth_user_id, nombre, tel, phone_e164, clases_restantes, terms_accepted_at, privacy_accepted_at)
  values (p_gym_id, v_uid, v_nombre, v_tel, v_phone, 0, now(), now());
```
`0` (finite zero), not `NULL`: it blocks `reservar_clase` (`Sin clases disponibles`) until a sale grants classes, and it makes the later sale **stack correctly** — `stackPaquete({clases:0})` → the package's classes; stacking onto `NULL`/Ilimitado would wrongly stay Ilimitado. The **claim path** (matched an existing sale-created row) is untouched — that row already carries its paid balance.

### 3.2 Migration — `registrar_venta` captures email (Defect A)
Add a nullable `p_email` and store it on the new `clientes` row so Door 1 writes the key Door 2 matches on.
- **Drop + recreate, not `CREATE OR REPLACE`** — adding `p_email` makes a 12-arg overload; leaving the 11-arg version alongside makes PostgREST throw "could not choose the best candidate function." `DROP FUNCTION` the exact live signature `registrar_venta(text, text, text, text, integer, text, uuid, integer, date, integer, integer)`, `CREATE` the 12-arg version, then **re-issue `EXECUTE` grants** (`revoke … from public, anon; grant … to authenticated`) — grants don't survive a drop.
- Body = the **live Contract-B body verbatim** (no `user_id` in either insert), except the new-client insert gains `email`:
  ```sql
  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, email)
  values (p_nombre, p_tel, p_clases_restantes, p_vence, p_paquete_nombre, v_gym, p_email);
  ```
- Stays `SECURITY INVOKER`, `search_path = ''`, expand-only. No lowercasing in SQL — the claim compares `lower()` on both sides; the form trims.

### 3.3 DAL — `crearVentaSchema` + `crearVenta` (`packages/data/src/server/ventas.ts`)
- Add `nuevoEmail: z.string().trim().optional()` to `crearVentaSchema` — a **normalizer, not a validator**. No `.email()`: `crearVenta` calls `crearVentaSchema.parse()` unguarded, so a format check would throw on an operator typo and **block the cash sale** (violating the never-block rule). The join is `lower(email)` exact-equality, so a malformed value simply never matches at claim time — the same harmless outcome as omitting it. Nullable, never required — cash-only walk-ins and Forge stay valid without it.
- In `crearVenta`, pass `p_email` when `mode === "new"` and email present, via the existing spread-when-non-null pattern.
- Regenerate `packages/data/src/database.types.ts` for both changed RPC signatures.

### 3.4 Admin form (`apps/admin/src/app/(app)/vender/_components/vender.tsx`)
- Extend `nuevo` state to `{ nombre, tel, email }`; add an email `Input` in the `mode === "new"` branch of `ClienteEditor`, hint *"Email (para que el cliente entre a la app)"*.
- `clienteValid` stays `nombre.length ≥ 3 && isTelValido(tel)` — email strongly prompted, validated when non-empty, never blocking.
- Thread `nuevoEmail` through `crearVentaAction`.

### 3.5 Test-member / free-demo access — runbook, no code
To grant a member bookable balance without Stripe (a pilot test account, or a gym's free first class): the operator records a sale marked **"Por pagar"** (`pendiente`) — `registrar_venta` writes `clases_restantes` + `vence` regardless of método, so balance lands immediately; no $0 package needed. Document the operator step; build no separate "grant trial" action.

### 3.6 The two onboarding directions (both must work end-to-end on red-demo)
- **Operator-first:** operator sells to a new client **with email** → the member self-registers with the **same email** → `reclamar_o_crear_cliente` returns `reclamado = true`, claims the paid row (balance carries), **no duplicate**. (Enabled by §3.2.)
- **Member-first:** member self-registers → balance `0`, **browses the schedule/classes but cannot book** (§3.1) → pays at the gym → operator finds them in the roster and sells in **"EXISTENTE" mode** (`registrar_venta` updates their existing row's `clases_restantes`/`vence`/`paquete_nombre`) → member reopens the app, plan shows on the "Tu plan" card, can book. (Works today; no new code.)
- **Operational gotcha:** using "NUEVO" for someone who already self-registered mints a duplicate. Pilot mitigation = operator habit (check EXISTENTE first). Systemic dedupe is the deferred hardening in §3.8.
- **Verify:** `pnpm lint && pnpm typecheck && pnpm test` green; a sale **without** email still succeeds; a fresh self-registration is blocked at booking (not Ilimitado); Forge unaffected.

> Browsing the schedule, coaches, and class detail needs **no balance** — only booking is gated. There is no need for a "$0 package to browse": a fresh account already sees everything and is simply blocked at Reservar until it has classes.

### 3.7 "Tier" terminology
The member's plan/"tier" = the **paquete** they buy (8 clases / 12 clases / Ilimitado), stored as `paquete_nombre` + balance and shown on the "Tu plan" card. Distinct from the gym→platform **subscription tier** (Básico/Pro/Cadena) that RED charges the gym (§4/§5). Selling paquete X puts the member on plan X.

### 3.8 Explicitly NOT in Phase 1 (elegance-gate cut list)
- `p_phone_e164` on the sale — the claim never uses phone as a key and backfills `phone_e164` from signup metadata.
- Partial unique index on `(gym_id, lower(email))` — adds a new throw on the revenue path and doesn't fix the convergence (the claim-time JOIN does); defer as post-pilot hardening *with* a graceful catch, if duplicates actually appear.
- Write-time link-over-create dedupe inside `registrar_venta` — a second divergent copy of claim logic (DRY); the claim-time email JOIN is the single convergence seam.
- "Posible duplicado" staff UI, admin invite / magic-link, and a merge tool — all deferred; build only if the pilot shows real friction.

## 4. Phase 2 — Stripe (gated on pilot demand + MX counsel), recorded only

- **Shape:** likely Connect **Standard** (gym owns its Stripe account, fees, payouts, merchant-of-record; RED triggers checkout with **no `application_fee`**), matching decision #3. Re-confirm Standard vs Express (Express = less gym onboarding friction but RED-mediated) once demand is proven.
- **Payment → entitlement:** a **new `SECURITY DEFINER registrar_venta_stripe` RPC** that is *a second writer into the same `clientes`/`ventas` model*, idempotent on Stripe `event.id`, gym resolved server-side from the connected-account→gym mapping. Balance math stays in `@gym/domain` `stackPaquete` (mirroring how `ventas.ts` feeds `registrar_venta` today) — **never re-derived in SQL** (ADR-0005).
- **v1 = card only** (synchronous; no pending-state machine). OXXO/SPEI + the "reservado, pago pendiente" state, CFDI wiring (Facturapi/gigstack), and identity hardening (invite + merge) are fast-follows, added only when needed.
- **Cash stays a first-class non-processor path** via the existing operator `registrar_venta`.
- **Gate:** validate a pilot gym actually wants member self-serve pay (via Phase 1) **before** building; get MX fintech/tax counsel to bless the intermediary/entity posture before any payout code, even under the reduced-risk BYO-Stripe model.

## 5. Deferred owner decisions (counsel- or pilot-gated — do not force now)

- Connect **Standard vs Express** and (if RED ever takes a fee) direct vs destination charges.
- **Stripe Connect vs Mercado Pago** — short head-to-head spike before committing engineering, especially if RED's legal entity is not Mexican.
- MX **legal entity / RFC / CLABE / CFDI issuer** posture (lighter under BYO-Stripe, still lawyer-confirmed).
- **Tier structure + exact MXN price points** — validate with the pilot gym; ship zero gating machinery until >1 paying gym on different tiers.

## 6. Architectural fit

Phase 1 is purely additive: §3.1 hardens the live claim RPC (one column on the create insert), §3.2–3.4 add one input across RPC/DAL/form, and both reuse the balance writer and booking gate. `registrar_venta` stays `SECURITY INVOKER`; `reclamar_o_crear_cliente` keeps its DEFINER posture; migrations are expand-only and Forge-safe. No new architecture, no rewrite.
