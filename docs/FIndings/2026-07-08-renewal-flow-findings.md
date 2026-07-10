# Renewal Flow — Findings (2026-07-08)

Reported symptom: gym owners renewing a member's membership are forced to re-enter all data, then get a **duplicate member**. Investigation widened to the whole renewal/stacking money-path. Every finding below was confirmed by adversarial verification (a skeptic agent re-checking each claim against source). Line numbers are as of commit `424e6d5`.

**Verdict legend:** `BUG` = defect to fix · `OWNER` = real behavior, product ruling needed before touching · `INTENDED` = correct, do not change · `NOT_AN_ISSUE` = investigated, no defect.

> **Status 2026-07-08 (end of session): COMPLETE + RULED.** Coverage was closed by a 22-agent completeness sweep (Part C), and every `OWNER` item plus C1/C9 was ruled in a grill session — the **"Owner rulings"** table near the end is authoritative and supersedes the per-finding "Decision:" prompts.
>
> **Status 2026-07-10: EXECUTED.** Every ruling implemented on branch `renewal-flow` (plan: `docs/superpowers/plans/2026-07-10-renewal-flow.md`); 31/31 denial suites green on scratch; Elegance + Senior Dev gates passed. D1 had already shipped with #76–79; C11 needed no change (counts already derive from `clases_restantes`). **Remaining owner gate: `docs/runbooks/renewal-flow-deploy.md`** (apply migrations → push → smokes → duplicate merge).

## Scope table

| ID | Finding | Verdict | Sev |
|----|---------|---------|-----|
| D1 | RENOVAR button drops client identity → blank new-sale form | BUG | high |
| D2 | No dedup guard: new-sale always inserts a cliente (no unique tel/email) | BUG | high |
| D3 | Duplicates are unclaimable → orphaned paid balances (email-only join) | BUG | high |
| C1 | `mes`/Ilimitado renewal computes a wrong expiry | BUG | high |
| C6 | No idempotency/concurrency guard → double-charge or lost package | BUG | med |
| C9 | `vence`-day boundary is inconsistent across renew/book/attendance | BUG | med |
| — | Fixed-day (`dias`) stacking on early renewal | INTENDED | — |
| C2 | "Por pagar" grants full balance with zero payment, never reconciled | OWNER | — |
| C3 | Unpaid "por pagar" sales counted as realized revenue on dashboard | OWNER | — |
| C4 | Active Ilimitado is "sticky": finite purchase keeps unlimited + adds days | OWNER | — |
| C5 | Attendance check-in during a renewal can be clobbered (lost class) | OWNER | — |
| C7 | No email backfill on renewal for pre-existing members | OWNER | — |
| C8 | No in-app void/refund for a mis-sold renewal | OWNER | — |
| C11 | Plan label shows last package bought, not the stacked balance | OWNER | — |
| C10 | Unbounded additive stacking across renewals | NOT_AN_ISSUE | — |
| C12 | `cancelar_reserva` refunds a class the booking never consumed (ilimitado→finite flip) | BUG | low |
| C13 | `registrar_venta` trusts client-sent monto/balance/vence verbatim (no catalog re-derivation) | OWNER | med |
| C14 | Ficha clases gauge double-counts a same-day pre-renewal attendance | BUG | low |
| C15 | Front-desk pase double-consumes for app-booked / Agenda-listed members | OWNER | high |

---

## Part A — Renewal creates duplicate members (the reported symptom)

### D1 — RENOVAR passes no client identity `BUG` high
Both RENOVAR buttons navigate with a bare `router.push("/vender")`; the client `c` is in scope but nothing is passed. The sales screen has no way to receive a client, so it always opens a blank NUEVO (new-client) form — the "re-enter all data" symptom — and on submit runs as `mode="new"`.
- `apps/admin/src/app/(app)/clientes/[id]/_components/cliente-detalle.tsx:248` (present branch), `:254` (absent branch)
- `apps/admin/src/app/(app)/vender/page.tsx:7` — `Page()` reads no `searchParams`
- `apps/admin/src/app/(app)/vender/_components/vender.tsx:39-41` — `mode="new"`, empty `nuevo`, `openSection="cliente"`; props are only `{paquetes,clientes,lockup}` (no preselect)

**Fix:** RENOVAR passes `?cliente=<id>`; `page.tsx` reads it; `VenderScreen` accepts an initial client and defaults `mode="existing"`. Sender **and** receiver both change. The correct existing-client path already works (`vender.tsx:248` picker → `mode="existing"` + `clienteId`).

### D2 — No dedup guard on new-client sale `BUG` high
`mode="new"` never looks up an existing member, and nothing at the DB blocks a duplicate.
- `packages/data/src/server/ventas.ts:104-117` — new mode resolves the cliente slot to `null`, never SELECTs by tel/email; `:145-149` uses form input directly; `:169` sends `p_cliente_id` only for `mode="existing"`
- `supabase/migrations/20260707031000_registrar_venta_capture_email.sql:40-44` — blind `INSERT INTO clientes` when `p_cliente_id is null`, leaves `auth_user_id` NULL, no `ON CONFLICT`
- `supabase/migrations/20260530023224_create_ventas_core.sql:9-18` — clientes has only `id` PK; no unique on tel/email
- tel is format-checked only, not unique: `supabase/migrations/20260601022323_clientes_tel_10_digits.sql:7-9`

**Fix:** match-by-`(gym_id, lower(email))`/tel before insert, and/or a partial unique index on `(gym_id, lower(email))`. **Reconcile existing prod duplicates first** or the index build fails.

### D3 — Duplicates are unclaimable, orphaning paid balances `BUG` high
New-sale rows often carry no email (email is optional at sale time) and email is the **only** self-registration join key (phone never claims). So a member can never claim the duplicate row holding the money they paid; self-registration then mints yet another row.
- optional email: `apps/admin/.../vender/_components/vender.tsx:351-356`; omitted when blank: `ventas.ts:170`
- claim RPC creates-on-no-match / ambiguous: `supabase/migrations/20260707030000_reclamar_create_zero_saldo.sql:47-77`
- member-side create paths: `apps/client/src/app/registro/actions.ts:68`, `apps/client/src/app/auth/confirm/route.ts:37`

### Coverage note
`packages/data/src/server/ventas.test.ts:172` is titled *"the wiring bug, locked"* — the new-mode-from-empty-saldo behavior is known and test-pinned. The RENOVAR navigation itself is untested (no `vender.test.ts`, no `cliente-detalle` test; `apps/admin/src/lib/nav.test.ts` covers only the sessionStorage breadcrumb).

---

## Part B — Stacking / money-logic audit

### INTENDED — Fixed-day (`dias`) stacking on early renewal
Renewing a class/day package before it runs out stacks correctly: classes add, days add, leftover days preserved (not reset), expired balance forfeited. Example: 5 clases + 20 días left buying a 12/30 pack → 17 clases, 50 días, vence = old vence + 30. **Do not change this.**
- `ventas.ts:143-152`; `packages/domain/src/rules.ts:31-37` (stackPaquete), `:179-181` (baseParaStack)

### C1 — `mes`/Ilimitado renewal computes a wrong expiry `BUG` high
A `mes` package is granted as "days left until this calendar month's end", then stacked additively — which does not compose with month-end semantics.
- `ventas.ts:123` — `compraDias = diasRestantes(calcVigenciaEnd(hoy,'mes'), hoy)`
- `ventas.ts:151-152` — `nuevoVence = addDays(hoy, nuevoSaldo.dias)`
- `rules.ts:36` stackPaquete adds days; `rules.ts:58` calcVigenciaEnd('mes') = last day of purchase month; `rules.ts:179-181` forfeit when `dias>0` fails
- untested: `ventas.test.ts:147` asserts only the RPC arg-spread, never the stacked `mes` vence

Failure cases (Ilimitado, vence Jun 30): renew Jun 1 → overshoots ~Jul 20 (extra unlimited days); renew Jun 28 → pays a full month, gets ~4 days; renew Jun 30 (diasRest=0 forfeits) → **expires same day for full price**; lapse then re-buy Jul 1 → full clean month. Early/on-time renewer is punished vs. lapsing — on the common path.

**Owner ruling (2026-07-08): a `mes` renewal extends flat 30 days from the current `vence`** (add 30 onto existing expiry, not end-of-next-month). **Fix:** branch on `paq.vigencia_tipo` — `mes` never reduces to days-to-month-end before stacking; keep additive path for `dias` only; add domain tests for early / day-before / on-expiry / lapsed renewals.

### C6 — No idempotency/concurrency guard `BUG` med
The base balance is read outside the write transaction, `registrar_venta` does a blind absolute overwrite, and the folio is drawn fresh each call.
- read outside txn: `ventas.ts:113`; absolute value computed in TS: `:151`; passed to RPC: `:160`
- absolute `SET clases_restantes = p_clases_restantes, vence = p_vence`, no `FOR UPDATE`, no version guard: `20260707031000_registrar_venta_capture_email.sql:46-50`
- fresh folio, no dedup: `20260702231021_s5_per_gym_folio_and_rekeys.sql:124`
- only guard is client-side `submitting`: `vender.tsx:45`; error toast invites a retry: `vender.tsx:129`; passthrough action has no key: `vender/actions.ts:14`

Network-retried COBRAR → second payment + double credit. Two concurrent submits → last-writer-wins (member pays twice, credited once).

**Fix:** client-generated idempotency key + unique `(gym_id, idempotency_key)` on ventas (on conflict return existing folio); optimistic-concurrency guard on the UPDATE (`and clases_restantes is not distinct from p_expected...`). Don't reset `submitting`/invite retry on ambiguous failures without a reconciliation read.

### C9 — `vence`-day boundary inconsistent across paths `BUG` med
Three paths disagree on whether the expiry day is valid:
- renew/read treat `dias<=0` as expired (forfeits unused classes; intended, test-locked): `rules.ts:180`, `:77`, `:89`; `rules.test.ts:154`; `ventas.ts:143`
- member booking treats the vence day as valid: `reservar_clase` blocks only `v_vence < v_hoy` — `20260706170000_create_reservation_and_reservar_clase.sql:173`
- attendance does no vigencia check: `toggle_pase` — `20260702170314_toggle_pase_gym_timezone.sql:54`

So a member can attend on their vence day yet forfeit remaining classes if they renew the same day.

**Fix:** owner picks the canonical vence-day semantic; align all three paths to it. Also: the same-day forfeit of unused classes is silent — the renew UI should warn the operator.

### C2 — "Por pagar" grants balance with zero payment `OWNER`
`metodo` never enters the balance math; the RPC grants the full stacked balance + extended vence regardless of method, and no reconciliation/mark-as-paid path exists anywhere.
- `ventas.ts:151` (metodo not in math), `:167`; unconditional update `20260707031000_...sql:46-50`; intentional "Por pagar" UI `vender.tsx:440`; per-sale visible but no AR view `derive.ts:253`; no `.update` on ventas anywhere

**Decision:** keep credit sales? If yes, add mark-as-paid + accounts-receivable surface. If no, gate/remove "Por pagar". Do not withhold classes on `pendiente` unless the owner explicitly wants that (breaks pay-later semantics).

### C3 — Unpaid sales counted as realized revenue `OWNER`
`resumen.ts:31` selects ventas with no `metodo` filter; `rules.ts:241` sums every `monto` into ingresos; exports and dashboard tiles inherit it (`export/rows.ts:178`, `inicio.tsx:137`, `cuenta.tsx:237`). A "por pagar" sale inflates income permanently (no reconciliation).

**Decision:** cash basis (exclude `pendiente`) vs accrual (keep)? Regardless, a separate "Por cobrar" tile + mark-as-paid flow is recommended so uncollected money is visible.

### C4 — Active Ilimitado is "sticky" `OWNER`
An active-unlimited member who buys a finite pack keeps unlimited and only gains days (finite count discarded); no downgrade-via-sale path.
- `rules.ts:33` (ilimitado wins), `:180` (still-valid ilimitado carries); `ventas.ts:144`, `:171`; operator-mediated `ventas.ts:96`; intended per `rules.test.ts:13`, `:160`

**Decision:** accept (customer keeps the better benefit), or add an explicit "cambiar plan" replace-not-stack path + operator warning. Low abuse risk (sales require an operator). Do not change stackPaquete/baseParaStack.

### C5 — Attendance check-in during a renewal can be clobbered `OWNER`
Read-modify-write across a network hop: a `toggle_pase` decrement committed between crearVenta's read and the RPC's absolute write is overwritten (member regains the consumed class; balance/attendance drift).
- `ventas.ts:113`, `:153`; absolute set `20260707031000_...sql:47`; relative decrement `20260702170314_...sql:65`
- assumed away by the single-operator model: ADR-0005 `docs/adr/0005-atomic-write-rpcs.md:90`, `:25`; ADR-0004 `:31`

**Decision:** unreachable under one operator per gym; re-adjudicate (and add optimistic concurrency / FOR-UPDATE re-read) when gyms run concurrent front-desks. Same fix family as C6.

### C7 — No email backfill on renewal `OWNER` (recommended to close)
`p_email` is forwarded only in `mode="new"` and the email input renders only in new mode; the existing-client UPDATE never touches email. Pre-email-capture members — exactly the renewing cohort — can never get an email attached, so they can never claim an app account.
- `ventas.ts:170`; `vender.tsx:351-356`, `:122`; existing UPDATE ignores email `20260707031000_...sql:46`; only other client-write edits nombre+tel `packages/data/src/server/clientes.ts:245`

**Decision (recommended: close):** render an optional email field in existing mode (prefilled), forward `p_email` in existing mode, and `email = coalesce(p_email, email)` in the UPDATE. Otherwise ship a one-time bulk backfill/merge tool.

### C8 — No in-app void/refund `OWNER`
The ventas ledger is deliberately append-only (RLS: select+insert only, no update/delete); stacking has no inverse. Correcting a mis-sold renewal needs service-role DB surgery.
- `ventas.ts:160`; `20260707031000_...sql:58`; RLS `20260702173309_gym_scoped_rls_policies.sql:23,46,49`; `actualizar_cliente` edits only nombre+tel `20260602120000_actualizar_cliente_rpc.sql:4`; `editar-cliente-sheet.tsx:41`; additive stack `rules.ts:31`

**Decision:** documented manual-correction runbook, or an `anular_venta`/reversal RPC (compensating negative entry + saldo subtraction in one txn). Do not add UPDATE/DELETE to ventas — it would break revenue aggregations.

### C11 — Plan label shows last package, not stacked balance `OWNER`
The existing-client UPDATE sets `paquete_nombre` to the just-bought package while `clases_restantes` holds the stacked total, so screens show contradictions like "1 clase · 6 clases". `clases_restantes` is the source of truth — no correctness impact.
- last-purchased name vs stacked count: `20260707031000_...sql:49` vs `:47`; `ventas.ts:151`, `:164`; label derives from class grant `rules.ts:46`; rendered contradiction `asistencia.tsx:325`, `cliente-detalle.tsx:188`

**Decision:** keep last-purchased, suppress the name for a stacked balance, or a "Saldo combinado" label. If changed, do it in `derive.ts` (derivarCliente/derivarPaseCliente), not in the balance math.

### C10 — Unbounded additive stacking `NOT_AN_ISSUE`
Additive stacking is the documented, tested rule (ADR-0003 `docs/adr/0003-stacking-forfeit-dates.md:12`; `rules.ts:31`, `:179`). Day/class amounts come from admin-defined packages read server-side (`ventas.ts:123`, `:28`; `vender.tsx:393`), never typed at sale time — the "fat-finger quantity" premise doesn't exist here. Paid renewals legitimately accumulate. No change; an optional `>400`-day soft confirmation is the only possible defense-in-depth.

---

## Part C — Completeness-sweep addendum (2026-07-08)

A second orchestrated sweep (8 lenses: member app, DB layer, domain math, admin UX, reporting, auth/claim, trust boundary, test coverage; plus a completeness-critic gap round over the attendance seam and the duplicate-merge operation). Every finding below survived an adversarial verifier reading current source. Areas swept clean: auth/claim interplay (0 findings), timezone consistency, folio concurrency, cross-gym id forgery.

### C12 — `cancelar_reserva` refunds a class the booking never consumed `BUG` low
`reservar_clase` consumes a class only for finite plans (ilimitado books with no decrement), and the reservation row stores no consume flag. `cancelar_reserva` refunds `+1` keyed on the member's **current** plan state. If the plan flipped ilimitado→finite between booking and cancel — exactly what a renewal after an ilimitado lapse does (baseParaStack forfeits, registrar_venta writes finite) — the cancel credits a class that was never spent.
- refund: `supabase/migrations/20260706180000_cancelar_reserva.sql:93-97`; consume-only-finite: `20260706170000_create_reservation_and_reservar_clase.sql:221-228`; no consume flag on reservation: `:46-63`; the flip: `ventas.ts:143-144`

Scenario: ilimitado (vence Jun 30) books Jul 5 on Jun 25 (no decrement) → lapses → Jul 1 renews to a 10-class pack → Jul 2 cancels the Jul 5 booking → refund 10→11. One phantom paid class. **Fix:** record whether the booking consumed (consume flag on reservation) and refund only that.

### C13 — `registrar_venta` trusts client-supplied values verbatim `OWNER` med
The RPC takes `p_monto`, `p_clases_restantes`, `p_vence`, `p_vigencia_dias` as absolute values and writes them blind — no `paquete_id`, no re-read of `paquetes`. All price/balance derivation lives only in the TS action `crearVenta` ("Package facts come from the DB, never the client" — `ventas.ts:99` — holds for the UI path but not for a direct RPC call). Granted to `authenticated`; the only guard is `is_staff_of`, which includes non-owner operators. `p_clases_restantes = null` ⇒ ilimitado; `monto` has no `>= 0` CHECK.
- verbatim writes: `20260707031000_registrar_venta_capture_email.sql:42-50`, `:59-60`; grant: `:67-68`; no CHECK: `20260530023224_create_ventas_core.sql:57`; operator role exists: `20260702161010_create_gym_membership.sql:43-49`

Scenario: operator calls `supabase.rpc('registrar_venta', {p_cliente_id: <friend>, p_monto: 0, p_vence: '2099-12-31'})` omitting `p_clases_restantes` → friend becomes lifetime ilimitado, $0 venta invisible in revenue. **Decision:** accept operator trust as-is, or move value derivation into the RPC (pass `p_paquete_id`, re-derive monto/balance/vence server-side — same touch-point as the C6 fix).

### C14 — Ficha clases gauge double-counts same-day pre-renewal attendance `BUG` low
`attendedSincePurchase` filters `a.fecha >= lastPurchaseIso` at day granularity, so a check-in that happened the same day **before** the renewal is counted as "since purchase" — but it was already subtracted from the base the renewal stacked on. Denominator and `usadas` over-count by one per same-day pre-renewal check-in; the bar is never full right after a renew-after-class. Stored saldo correct; display only. Propagates to the member plan card via `derivarMembresia`.
- `packages/data/src/server/clientes.ts:203`, `:209-211`; `derive.ts:130-132`, `:277-280`, `:378-380`

**Fix:** anchor the gauge at the venta's timestamp (or exclude same-day rows dated before the venta) in `clientes.ts`/`derive.ts` — not in balance math.

### C15 — Front-desk pase double-consumes for app-booked / Agenda-listed members `OWNER` high
One saldo, two admin attendance surfaces that don't know about each other. `/asistencia` (the **primary** admin tab, `layout.tsx:13`) drives `toggle_pase`, whose row lookup is scoped `class_session_id IS NULL` — and `getMarcadas` filters the same way — so a member who booked via the app (already consumed at booking) or was marked via Agenda pasar-lista **always renders unmarked** there. Operator taps them present → fresh consuming row → second decrement. No warning; reservation stays `reservada` (its no-show consume also sticks). One visit, two classes, permanently. The seam-independence design (slice #60, test-pinned at `supabase/tests/pasar_lista_sesion_rules.sql:232`) weighed only session-row corruption, never this double-charge.
- `20260706180200_toggle_pase_front_desk_rows_only.sql:56-61`, `:74`, `:81-87`; `packages/data/src/server/asistencia.ts:47-53`; `asistencia.tsx:72`; booking consume: `20260706170000_...sql:221-228`

**Decision:** is a front-desk pase a separate billable visit type (open-gym access), or the same visit? If same: presence map must surface app/Agenda attendance, and `toggle_pase` should warn or skip-consume when an active same-day reservation/session attendance exists. Same RPC family the C9 fix touches — adjudicate together.

### Merge-reconciliation constraints (from verified-but-rejected candidates)
Not defects today, but hard constraints on the D2/D3 "reconcile prod duplicates first" step:
- **Repoint, never DELETE:** `ventas.cliente_id`, `asistencias.cliente_id`, `reservation.member_id` are all `ON DELETE CASCADE` from clientes — a delete-based dedup silently destroys revenue ledger + attendance history (`20260530023224:51`, `20260530031218:8`, `20260706170000:50`).
- **Placeholder emails block the index:** 8 distinct forge-demo members share `seed@mock.test` (the only emails in clientes). Scrub placeholders before any `unique(gym_id, lower(email))` build; email-keyed dedup would false-merge distinct people.
- **Repoint collisions:** `reservation_member_session_uq` (`20260706170000:62`) collides when both duplicate rows reserved the same session; `clientes_auth_user_id_per_gym` partial unique constrains moving `auth_user_id`. Merge must pre-resolve both.
- **No two-Saldo combine rule exists:** `stackPaquete` composes a Saldo with a *purchase*, not two Saldos — the merge plan must specify the balance rule (e.g. survivor = paid row's saldo) explicitly.

Also adjudicated: future-dated bookings can be attended past vence (sub-case of C9 — fold into its canonical-semantic ruling); package selector's "Hasta" hint understates renewal expiry (cosmetic, self-corrects on receipt — not carried).

## Owner rulings — grill session 2026-07-08 (AUTHORITATIVE; supersedes the per-finding "Decision:" prompts above)

| ID | Ruling |
|----|--------|
| C1 | **Flat 30 days everywhere** for `mes`/Ilimitado: fresh purchase = today + 30; renewal = current vence + 30. Overturns brief-Q1 calendar-month — `calcVigenciaEnd('mes')` and the paquete "Hasta" hint change with it. |
| C2 | **Remove "Por pagar"** entirely — every sale collects at COBRAR. Prod has 0 `pendiente` rows (verified live), so removal is clean: drop the UI option, reject `pendiente` in the RPC. |
| C3 | **Closes as moot** — entailed by C2: no pendiente rows exist or ever will, so collected == recorded; `resumen` unchanged. |
| C4 | **Purchase wins, days carry** — uniform switch rule replaces "ilimitado wins": the purchased package's type takes effect immediately; remaining paid days carry and stack; classes add only when both finite (ilimitado→finite: classes = new pack's count; finite→ilimitado: becomes unlimited, days add). Sticky-ilimitado tests (`rules.test.ts:13`, `:160`) get rewritten. Raises C12 priority: ilimitado→finite flips become a normal sale-time event. |
| C5 | **Closes** — entailed by C13: saldo is read FOR UPDATE inside the RPC txn, so the stale-TS-read race (operator toggle_pase AND member reservar/cancelar variants) dies structurally. |
| C6 | Idempotency key (unique `(gym_id, idempotency_key)` on ventas, on conflict return existing folio) + the C13 locked txn. |
| C8 | **Runbook now, RPC later** — documented service-role correction runbook (compensating venta + saldo fix in one txn) ships with the plan; `anular_venta` only if mis-sales prove frequent. |
| C11 | **Name + true balance** — keep `paquete_nombre` (always the right type per C4), but every rendered count comes from `clases_restantes`, never the package's own grant. Display-only, in `derive.ts`. |
| C13 | **Re-derive in RPC** — `registrar_venta` takes `p_paquete_id` + `p_metodo` (+ client identity) only; inside one locked txn it reads the paquete, reads current saldo FOR UPDATE, applies stack rules, writes. Kills C13 + C6 + C5 in one move. ADR-0005 amended; `rules.ts` becomes the executable spec the SQL is tested against (scratch-project suite, `SUPABASE_TARGET_REF`). |
| C9 | **Vence day is VALID** — "Vence 30 jun" means June 30 is a full training day: booking and attendance allowed, and renewing on the vence day still carries leftovers (forfeit starts the day after). Renewal/read paths change from `dias<=0` to `dias<0` expired-checks (`rules.ts:180`, `:77`, `:89` + test-locked pins rewritten); booking already matches; attendance gains the same inclusive check. |
| C15 | **Unify pase surfaces, never double-charge** — one class attended = one class consumed regardless of surface. A member marked in the class UI (or app-booked) shows as checked on the pase de lista page (`getMarcadas` stops filtering session-linked rows), and `toggle_pase` will not insert a second consuming row when a same-day session attendance / active reservation exists. |

C7 stands as recommended (optional email field in existing mode, `coalesce` in the UPDATE).

## Code-fix scope (ruled, ready for /to-spec)
D1+D2+D3 (stop duplicates), C1 (flat-30 mes, both paths), C4 (purchase-wins switch), C6+C13 (locked re-deriving RPC + idempotency), C9 (vence-day valid, inclusive everywhere), C7 (email backfill), C12 (consume flag on reservation), C14 (gauge anchor), C15 (unified pase surfaces), C2 (remove Por pagar), C11 (label). C8 runbook is a docs deliverable. Reconcile existing prod duplicates before any unique constraint — per the Part C merge-reconciliation constraints (repoint-only, scrub placeholder emails first, explicit merge rule per duplicate pair).
