# Spec — Backdate the sold date of a subscription in checkout

**Wayfinder map:** #112 · resolves #113 #114 #115 #116 #117 · findings table = the pinned comment on #112.
**Frame (locked in charting):** the backdate is *truthful* — "the sale really happened on date D" (owner forgot to register a cash/transfer payment, or is onboarding a mid-cycle member). Lever = the **sold date**, past-only. Applies uniformly to registered packages **and** personalizado. Scope **(i)**: any sale, computed **as-of the backdated date**. The ledger date moves with it (`ventas.fecha`). UI = quiet progressive disclosure in the minimal `vender` checkout — the 99% today-sale flow must look and feel **unchanged**.

---

## D1 · RPC shape & bounds (resolves #113, findings §A)

- `registrar_venta` gains **one** new parameter, **last, defaulted**: `p_fecha_inicio date default null` (13 → 14 args). `null` ⇒ today ⇒ byte-for-byte today's behavior. Signature change ⇒ **DROP old function, CREATE new** in the same migration (G1); update `grant execute` to the 14-arg signature (G4).
- Effective date: `v_inicio := coalesce(p_fecha_inicio, (now() at time zone v_tz)::date)`. It replaces `v_hoy` in **all** vence/stacking math, threaded at the shared `v_hoy` line so registered **and** personalizado branches both get it (A1).
- **Written ledger date (A1):** when backdated, `ventas.fecha := (v_inicio::timestamp + interval '12 hours') at time zone v_tz` (midday gym-tz — immune to UTC date-boundary flips); when not backdated, keep the `now()` default.
- **Bounds — all enforced by `raise` in the RPC (the only real gate, G5), mirrored in `vender-vm.LIMITES` and the zod schema (A5, three-layer pattern):**
  1. **No future dates** (A2): `p_fecha_inicio > (now() at time zone v_tz)::date` ⇒ raise.
  2. **Flat 30-day look-back cap** (A3/D2): `p_fecha_inicio < today − 30` ⇒ raise. Keeps a backdate recent; consistent with the renewal flow's flat-30 vocabulary. It does **not** strictly guarantee the sale lands inside the rolling inicio Resumen window (current + prior month) — across a short-month/Feb boundary a ~30-day backdate can fall just before it — but the sale is always written to its true effective date, so its revenue is booked to that day's real calendar month and surfaced (marked) in that month's respaldo export.
  3. **Existing clients only** (A4): `p_fecha_inicio < cli.created_at::date` (gym tz) ⇒ raise (paradox: sale predates the client). New clients (created this txn) exempt.
  4. **No dead-on-arrival sales** (E2 at the write boundary): if the computed `v_new_vence < today` ⇒ raise ("la venta ya estaría vencida"). Blocks the pathological already-expired backdate; the 30-day cap makes it rare anyway.
- No gate on current `vence` (A6): backdating *inside* an active window is the core "forgot to log it" case.

## D2 · Stacking as-of the backdated date (resolves #113, findings §B)

- Lapse/carry evaluates at `v_inicio`, not today: `v_base_dias = max(0, cli.vence − v_inicio)`; carry classes **iff** `cli.vence >= v_inicio` — **inclusive** (vence-day is a full valid day, B6/C9).
- `v_new_vence = v_inicio + v_base_dias + compra_dias`. For a member active on D, `v_inicio` cancels ⇒ vence unchanged, only the ledger moves — exactly right for a truthful backdate (B1).
- Lapsed member backdated **before** the lapse ⇒ carries (correct if truthful — guarded by cap + confirm + audit trail, not a code block, B2). Backdated **after** the lapse ⇒ base = 0, forfeits (B3, falls out of the math).
- The **ilimitado branch uses the same as-of gate** (B4) — do not fix only the finite-class path.
- Do **not** touch `stackPaquete`'s purchase-wins class formula (B5); the change lives at the lapse-gate/date-anchor level only. ⚠ ADR-0013's "O(1) RLS helper" claim is known-false — ignore any reviewer instinct sourced from it.

## D3 · Re-anchor "latest sale" on insertion order (resolves #114, findings §C)

- **Every "latest sale" read switches from `order by fecha desc` to `order by created_at desc, id desc`**: the `mi_membresia` RPC (new migration), `packages/data/src/server/clientes.ts`, `derive.ts` — one sweep, no stragglers (C1). A backdated sale must never steal (or lose) the anchor from a later real sale.
- `attended_since_purchase` counts asistencias **since the anchor sale's `created_at`** (real write time), not since `fecha` (C2) — gap visits already decremented balances live at mark-time; counting them again double-consumes.
- `ventas.created_at` (exists, unused) is the natural true-order anchor (D6) — no schema change.

## D4 · Member-app expiry scope (resolves #115, findings §E)

- **E2 in scope** — handled at the write boundary by D1-bound-4 (reject `vence < today`), so "Renueva el {pasado}" can't be *created* by this feature.
- **E3 (ilimitado never shows expired) and E4 (booking CTA ignores vence) SPLIT to a follow-up issue** — pre-existing `apps/client` bugs that backdating merely sharpens; independent, **not blockers**. The tracker pass files the issue and links it from #115's resolution.

## D5 · Audit & reporting honesty (resolves #116, findings §D/§F)

- **Derived marker, zero new columns** (F1): `backdated := fecha::date ≠ created_at::date` (gym tz).
- **Where it surfaces:** the respaldo/monthly export annotates backdated rows "registrado el DD MMM" (D4/D5) so a re-exported month whose total changed reads as intentional; dashboard tiles (SEMANA hero, sparkline, Resumen) intentionally **unmarked** — totals are truthful (D1/D3 accepted).
- **Folio = recorded order, `fecha` = happened** — stated in the spec/runbook; out-of-order folios in the sheet are expected and explained by the marker (D5).
- **Creation-only** (F3): no post-hoc date-edit path. A wrong backdate is prevented (F2 confirm line), not undone; idempotency replay behavior unchanged (F4 — a mistyped date needs a fresh attempt; the confirm exists to stop it).
- ADR-0007 is not violated: this stamps a **new** row's date, never edits an old one (F5).

## D6 · Checkout UX (resolves #117, prototype folded into execution per owner delegation)

- **The affordance:** in PAQUETE, below the package choice, a quiet muted row: `Inicia: Hoy ›`. Tap ⇒ bottom `Sheet` (same pattern as the client picker) with **`PaseCalendar`** (future days already disabled; min = `max(today − 30, cliente.created_at)`).
- **Collapsed visibility:** a non-today date must read even with the section collapsed — `Inicia: Ayer` / `Inicia: 11 jul` via `fmtNavegadorDia`.
- **F2 confirm (non-blocking):** when date ≠ today, a quiet line above COBRAR: "Se registrará con fecha DD MMM".
- **B7 banner (SHOULD, not MUST):** "N asistencias ya registradas caerán fuera de la vigencia" — implement only if the data is cheaply available in the VM; otherwise drop with a note for review to arbitrate.
- **Receipt (E1), fixed once at the `VentaResult` shape:** carry `fechaInicio`; recibo + ticket-twin PNG + WhatsApp text + email all show FECHA = today (transaction date) **plus** an "Inicio: DD MMM" annotation when backdated; VIGENCIA always renders from the RPC-returned `vence`.
- **Copy (es-MX):** the label is **"Inicia:"** — the transaction date and the period start are different concepts once backdated.
- **The bar:** zero visual change for a today-sale. The checkout stays clean and minimal — this was hard-won.

## D7 · Tests, types, deploy (findings §G)

- **Denial suites (the real contract, per AGENTS.md):** extend `registrar_venta_stacking.sql` + `_personalizado.sql` and add `registrar_venta_backdate.sql` with vectors: active-member backdate (vence unchanged, fecha moved) · lapsed-before-D (carries) · lapsed-after-D (forfeits) · on-vence-day (inclusive) · future-date reject · over-cap reject · pre-created_at reject · dead-on-arrival reject. **Assert the written rows** (`fecha`, `vence`, `clases_restantes`), not return values. Wire the new suite into the runner's `SUITE` **and** `supabase/tests/rpc-coverage.json` (both guards fail otherwise).
- **Types:** update `database.types.ts` for the new optional arg following the file's existing generated pattern (live regen deferred to the owner's apply step).
- **NOT applied to live in this session** (MCP is bound to prod; prod has migration-version drift — never `db push`). Migrations land as files on the branch; `pnpm test:denial` runs against the **scratch** project (creds in the main checkout's gitignored `docs/db-testing-throwaway-project`); the owner applies live + deploys `apps/admin` back-to-back per runbook (accepting the brief PGRST202 window, G1).
- Standard gates: `pnpm lint && pnpm typecheck && pnpm test` green (pre-commit runs them anyway).

## Out of scope

E3/E4 (split, see D4) · any sale-date **edit** path (F3) · "closed period" accounting concept · the §H verified non-issues.
