# Slice 2 — saldo_detalle: honest ledger display + editar_venta as-if-original

Status: SPEC v2 (fable-advisor corrections folded in). Owner rulings locked 2026-08-27:
editar_venta = **as-if-original** (new grant − consumed on that venta; never stacks, never
forgives). Scope from the 2026-08-27 handoff item 3: derived balance (`saldo_detalle`), honest
gauge denominator, per-venta usadas attribution, "No asistió — cargada" historial line.

## Principle

The stored counter (`clientes.clases_restantes`) stays the operational source — charging is
unchanged. Slice 2 makes every surface **explain** the balance from events: the gauge
denominates on the real grant, every charge is attributed to the venta that paid it, and charges
without attendance become visible lines. Two small write-site hygiene fixes ride along because
the advisor proved stale reservation flags poison any event-derived count.

## D0 — The unified "cargable" counting rule (used by display, editar_venta, and mi_membresia)

A cliente's charge events since an anchor moment `A` are counted on two legs, identically in TS
and SQL:

- **asistencia leg**: rows with `deleted_at is null AND perdonada = false AND NOT
  (reservation_id links to a reservation with consumio = true)` — the last clause defers
  booking-charged check-ins to the reservation leg (no double count) and naturally dedupes the
  historic stale-flag rows. Note this leg counts `consumio = false` rows too (e.g. attended
  while ilimitado): as-if-original means "would have charged under the corrected terms".
- **reservation leg**: rows with `consumio = true AND status <> 'cancelada'`.

**Charge moment**: asistencias → gym-local `fecha + hora`; reservations → `created_at`
(the booking instant is when the pack was debited). **Null-hora rule** (backdated desk marks via
`fijar_asistencia.sql:84-87` write `hora = null` today, an ongoing stream): fall back to date
granularity — the event belongs to the latest venta whose gym-local `date(created_at) ≤ fecha`;
ties go to the NEWER venta (matches `clientes.ts:464` counting null-hora rows in). Pin this
identically in TS and SQL; SQL comparisons must be gym-local (a naive `::date` hides a UTC−6
off-by-one after 18:00 local).

**Attribution**: an event belongs to the latest venta whose `created_at ≤` its charge moment.
There is NO backdate re-attribution anywhere (advisor verified registrar_venta + both reset
migrations touch zero asistencias): marks inside a backdated-sale window stay on the previous
venta. Berenice: Vie-21 18:12 mark vs renewal registered 20:53 → old pack. Correct by rule.

## D1 — saldo_detalle: pure derivation in packages/data (no new RPC, no new columns)

Computed in `derive.ts` from ventas history, asistencias, plus a **new reservations fetch**
(`reservation.member_id` joins `clientes.id`; staff SELECT policies already cover the admin
fetch — advisor verified, no new RLS):

```ts
saldoDetalle = {
  anchor: { ventaId, folio, grant /* ventas.clases; null = ilimitado */, createdAt, fecha },
  usadas,      // cargable events attributed to anchor whose session/mark is in the past
  noShows,     // subset of usadas from the reservation leg with NO linked asistencia and session ENDED
  apartadas,   // reservation-leg events whose session has not ended yet
  restantes,   // RAW stored clientes.clases_restantes
  derived,     // grant − usadas − apartadas
  discrepancia // derived − restantes
}
```

- **noShow vs apartada boundary**: session ENDED (ends_at if the schema has it, else
  starts_at + duración; implementer verifies the class_session columns). In-progress = apartada.
- **Raw vs forfeited**: the ficha's big number stays the read-time forfeited `veredicto.clases`
  (unchanged, `lifecycle.ts:187` — expired packs still read 0 on screen). The invariant and
  gauge math run on RAW stored. Do not resurrect expired balances in the display.
- **Discrepancy note is epoch-scoped**: show only when `anchor.created_at ≥ RESET_EPOCH`
  (`2026-08-27T15:30Z`, the outage-fix go-live — constant in derive.ts with comment). Every
  pre-epoch anchor carries a stacked-era balance by construction; noting it roster-wide is
  crying wolf. Post-epoch, a nonzero discrepancia renders a small admin-only note.
- Known cosmetic seam (accepted): holds booked before a renewal attribute to the old venta, so a
  freshly-renewed member can show "Apartadas 0" while the agenda holds bookings. Do not warp the
  attribution rule for it.
- `ilimitado` anchor (grant null) → no gauge, as today. Finite anchor with stored NULL
  (hand-set) → existing `clasesRest === 'ilimitado'` gate already suppresses the gauge.

## D2 — Honest gauge (admin ficha + client plan card)

Today: denominator = usadas + restantes (self-fulfilling, absorbs drift). New:

- denominator = **anchor grant** (`ventas.clases`); fill = `restantes / grant` via the existing
  clamped `gaugeFill` (`derive.ts:208-210`, advisor-verified sane for restantes > grant),
- caption: `Usadas {usadas} · Apartadas {apartadas}` (omit Apartadas when 0),
- big number: unchanged (forfeited veredicto).

**Semantic change, deliberate**: the caption's count moves from the #173 visit count
(`attendedSincePurchase`, which counts consumio=false booked check-ins as visits) to the D0
CHARGE count. The old numerator's fetch machinery is repurposed/extended, not kept as the
caption source. Client plan card gets the same math via shared derive code.

## D3 — mi_membresia: ADDITIVE-ONLY payload change (advisor correction 4)

The client card consumes only RPC scalars, so parity requires the RPC to compute the D0 count in
SQL. Return-type change ⇒ **DROP FUNCTION + CREATE** in the migration (CREATE OR REPLACE errors
on new OUT columns) + `database.types.ts` regen. Rules:

- **Existing fields keep their exact names, types, and semantics** (`attended_since_purchase`
  stays the day-anchored visit count) so the currently-deployed client app is untouched during
  the window before the owner pushes. New fields only: `cargadas` (D0 charge count, fecha+hora
  precision), `grant_clases`, `apartadas`.
- Read-only fn: no denial-suite obligation (writes axis); canonical regen + overload guard cover
  the DROP+CREATE.
- New UI reads the new fields; old fields become dead once the UI ships (cleanup later, not now).

## D4 — Historial (30-day window unchanged)

- Existing asistencia rows stay. Rows attributed to a **pre-anchor** venta get a
  `(paquete anterior)` tag — closes the Berenice "why does it say 1 used" seam.
- New row type: **"No asistió — cargada"** for each D1 noShow, rendered at the class session's
  date/time. no_show stays DERIVED — no sweep, no status write (reservation-truthfulness
  ruling). Display only; undo = existing admin correction mechanisms.
- A session cancelled BY THE GYM (`cancel_class_session` refunds + sets cancelada, consumio left
  stale) must show nothing: the status filter in D0 already excludes it — assert it in tests.
- RED consequence (accepted, handoff item 6): roll-call unrun + booked=charged ⇒ past RED
  bookings show this line even when the member attended. Honest record of what was charged and
  captured; not softened this slice.
- The old-anchor fallback path (`clientes.ts:469-476` exact head-count when the venta predates
  the 30-day window) must grow the D0 filters + a reservations count, or old-anchor members
  undercount and the note fires falsely (advisor correction 8).

## D5 — editar_venta: as-if-original (owner ruling 2026-08-27)

On the grant/fecha-recompute path (`v_cambio_grant or v_cambio_fecha`), replace the entire
`v_base_clases`/`v_base_vence`/floor-to-zero block (`editar_venta.sql:216-263`) with:

- `v_usadas` = D0 count attributed to THIS venta (anchor = the venta's ORIGINAL `created_at`;
  editing `fecha` does not move it). Implemented via a shared read-only SQL helper (see D6) so
  editar_venta and mi_membresia cannot drift.
- new balance: `NULL` if new pack ilimitado; else `greatest(0, new_grant − v_usadas)`.
- new vence: `new_fecha + (30 if vigencia_tipo='mes' else vigencia_dias)` — exactly what
  registrar_venta's reset would produce from the corrected inputs. No base-dias carry.
- Consequences that are CORRECT under the ruling (assert, don't "fix"): a fecha-only edit
  recomputes and thus silently heals any drifted balance; attended-while-ilimitado events count
  when editing ilimitado→finite (the D0 asistencia leg includes consumio=false rows).
- Unchanged: metadata-only short-circuit, refusal guards + strings (30-day window,
  most-recent-only, `VENTA_REFUSALS`), and the **signature** — CREATE OR REPLACE must match the
  current 10-arg signature exactly (overload guard in `pnpm test` enforces; it is generic over
  all public RPCs, advisor-verified).

`eliminar_venta` untouched this slice (inverse clawback + already-used refusal stand).

## D6 — Write-site hygiene (advisor corrections 1–2; small, ride-along migration)

Reused reservation rows poison event counts; fix at the write sites, forward-only:

- **Rebook stamps the charge moment**: `reservar_clase.sql:122-130`'s reactivate-cancelada
  UPDATE path sets `created_at = now()` (the unique (member, session) row is logically a NEW
  booking; historic rebooks are unknowable — accepted).
- **Walk-in reuse clears the stale flag**: `pasar_lista_sesion.sql:115-118` and
  `fijar_asistencia.sql:220-224` set `consumio = false` when reusing a cancelled reservation row
  as a walk-in (the charge lives on the asistencia they insert).
- **Backfill data fix** in the same migration: `update reservation set consumio = false` where a
  linked non-deleted `consumio = true` asistencia exists for the same member+session (exactly
  the stale double state; normal booked-then-checked-in rows have asistencia consumio = false
  and are untouched).
- Both touched RPCs are covered write RPCs → suite vectors ride in their existing suites.

## Deliverables / file map

1. Migrations (3): `<ts>_reservation_charge_moment_hygiene.sql` (D6 + backfill),
   `<ts>_editar_venta_as_if_original.sql` (D5 + the shared D0 helper fn — read-only, no
   coverage entry), `<ts>_mi_membresia_cargadas.sql` (D3, DROP+CREATE). Then
   `pnpm gen:rpc-canon` + `database.types.ts` regen.
2. Denial suites (written-row assertions): `editar_venta_rules.sql` + `editar_venta_paquete.sql`
   rewritten for as-if-original; vectors added to reservar_clase / pasar_lista_sesion /
   fijar_asistencia suites for D6. Vector list (from the advisor, all mandatory):
   grant−consumed basic + clamp-at-0; ilimitado→finite WITH attended-during-ilimitado (a
   consumio=false-counting impl differs from a consumio=true-only one here — this vector kills
   the wrong one); finite→ilimitado; fecha-only edit recompute asserted on written rows;
   consumed-via-reservation counted once (booked→checked-in); walk-in-after-cancel counted once
   (stale-flag row, pre- and post-backfill); rebook-after-renewal attributes to the new venta;
   gym-cancelled session not counted; pre-venta same-day-earlier mark NOT counted (Berenice
   fixture, timezone-aware: mark after 18:00 local); perdonada + soft-deleted excluded;
   metadata-only edit leaves balance untouched.
3. `packages/data`: clientes.ts reservations fetch + old-anchor fallback growth; derive.ts
   `saldoDetalle` + D0 in TS + RESET_EPOCH const + honest gauge; parity for `derivarMembresia`;
   unit tests (derive.test.ts, clientes.test.ts) incl. the same vector list where it applies.
4. `apps/admin` cliente-detalle.tsx: gauge caption, `(paquete anterior)` tag, "No asistió —
   cargada" rows, epoch-scoped discrepancy note. `apps/client` perfil-overlay.tsx: new
   mi_membresia fields via shared derive.
5. Gates: `pnpm lint && pnpm typecheck && pnpm test`; full denial run via LOCAL DOCKER (scratch
   PAT dead; traps: ambient-grant bootstrap after every reset, docker cp not PS pipe); two-axis
   code review; fable advisor #2 pre-ship review; migrations applied LIVE only after all green.

## Acceptance criteria

- AC1 Berenice (`e9ea73ac`): Vie-21 mark tagged (paquete anterior); current-pack usadas
  consistent with the 8-pack grant denominator; no balance change.
- AC2 editar_venta: 12-pack, 3 consumed, edited to 8-pack → restantes 5, vence = fecha+dias;
  9 consumed → 0, never negative; ilimitado round-trip per the vector list. Written rows.
- AC3 Charged unattended past reservation → "No asistió — cargada" line; future → Apartadas;
  gym-cancelled → nowhere; member-cancelled → nowhere (refund already live).
- AC4 Healthy post-epoch member: usadas + apartadas + restantes = grant; hand-broken fixture
  shows the note; pre-epoch anchor never shows it.
- AC5 Admin ficha and client plan card agree on usadas/denominator for the same member
  (parity test) incl. a same-day-renewal fixture; deployed-client compatibility: mi_membresia
  existing fields byte-identical.
- AC6 Everything green: full denial run, overload guard, canon drift, 1701+ unit tests.

## Out of scope

Stored-counter replacement, eliminar_venta semantics, Hanna/Oscar ruling (their fichas will now
honestly show divergence — that is the feature), tenant modes (#309), forge agenda takedown,
RED roll-call ops, mobile lane (frozen), sweeps of any kind.
