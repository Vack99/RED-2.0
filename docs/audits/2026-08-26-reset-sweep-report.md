# RESET sweep — dry-run correction report (2026-08-26)

**Status: DRY RUN. Nothing was written to the database.** Every query below was `SELECT`-only against
LIVE prod (`hjppxawglmukfvsgmcog`).

**This file is the rollback backup.** The `OLD clases` / `OLD vence` columns are the exact stored values
as of 2026-08-26. If the sweep is applied and has to be reverted, restore from those columns.

---

## 1. The ruling being applied

Owner ruling, 2026-08-26 — **renewal = FULL RESET on both axes**:

| axis | OLD rule (`registrar_venta`, live today) | NEW rule (this sweep) |
|---|---|---|
| classes | `balance := carry + venta.clases` where `carry = prior balance if prior vence >= inicio else 0` | `balance := venta.clases` (leftover classes die) |
| days | `vence := inicio + (prior vence − inicio, if ≥0) + package days` | `vence := inicio + package days` (leftover days die) |

Every stored `clientes.clases_restantes` / `clientes.vence` was produced under the OLD rule. This report
computes what each row *would* be under the NEW rule and lists the deltas.

## 2. Method

Scope: `gym.slug IN ('forge','red')` (demo gyms **excluded** — `red-demo`, `forge-demo`), `clientes.clases_restantes IS NOT NULL`. **57 members.**

Replay per member, events ordered by `created_at`:

- **venta** → `balance := ventas.clases` (NULL if unlimited); `vence := (ventas.fecha AT TIME ZONE 'America/Chihuahua')::date + dias`
  - `dias = vigencia_dias` (all live rows are `vigencia_tipo='dias'`; no `'mes'` rows exist in prod)
  - `(fecha at tz)::date` reproduces `registrar_venta`'s `v_inicio` exactly on both paths: a backdated sale stamps `fecha = inicio 12:00 local`, a same-day sale stamps `now()`.
- **charge** (subtract 1, floor 0) → non-deleted `asistencias` with `consumio = true`, **plus** `reservation` rows with `consumio = true AND status IN ('reservada','asistida')`.

Because the NEW rule is a full reset, everything before the **last** venta is irrelevant: the replay
collapses to `new_clases = max(0, last_venta.clases − charges_after_last_venta)` and
`new_vence = last_venta.inicio + last_venta.dias`. No recursion needed, no event ordering ambiguity
(verified: **zero** charge events share a `created_at` with a venta).

### Double-count check (passed)

`asistencias.consumio` and `reservation.consumio` can both be true on the same class — that would
double-charge the replay. 327 such rows exist **but all 327 are in `red-demo`** (pre-2026-07-10 data,
before `pasar_lista_front_desk_no_reconsume`). In `forge` + `red` the overlap is **0**, so summing both
event sources is safe here.

### Calibration (passed)

`Mariana Reza` / `66a148a0-8231-4344-af1c-1de911f34e27` was manually corrected earlier today
(two reservations flipped to `cancelada`, balance 7→9). The replay returns **9** and an unchanged
`vence` of 2026-09-23. ✅ Matches the manual correction exactly.

---

## 3. FLAGS — member-visible blast radius

### 🔴 FLAG A — balances that DROP (2 members, both `forge`, both on ACTIVE packages)

These are the only two rows where a member loses classes they can currently see and spend.

| gym | nombre | cliente_id | OLD | NEW | Δ | vence (new) |
|---|---|---|---|---|---|---|
| forge | Alan Davila | `8462176d-ab81-4214-9a70-53b9e6a158e2` | 14 | **12** | **−2** | 2026-09-23 (active) |
| forge | Berenice | `e9ea73ac-fd43-4a1e-a397-ca56491b78d7` | 8 | **7** | **−1** | 2026-09-20 (active) |

Both are genuine carry removals: Alan carried 2 classes into folio 1078, Berenice carried 1 class (and
2 days) into folio 1075. **Total classes destroyed platform-wide: 3.**

### 🟡 FLAG B — balances that RISE (2 members, both `red`, both on EXPIRED packages)

| gym | nombre | cliente_id | OLD | NEW | Δ | vence |
|---|---|---|---|---|---|---|
| red | Hanna Minjarez Gonzalez | `bf79cee1-cade-4855-b716-d3762ad7f36f` | 0 | **1** | **+1** | 2026-08-20 (expired) |
| red | Oscar Anchondo Neri | `24e90312-ade5-4eaa-8705-7fb7082c9c9a` | 0 | **1** | **+1** | 2026-08-20 (expired) |

**These two are NOT caused by the rule change.** Each has exactly **one** venta (1 class), so the OLD
rule and the NEW rule agree — yet the stored balance is 0. Investigated: they have **zero asistencias
(including soft-deleted) and zero reservation rows.** The stored 0 has no event basis at all; it was
written by something outside the replayed event stream (manual `actualizar_cliente` edit, or a deleted
venta). Classified `seed-artifact`. Their packages expired 2026-08-20, so applying the sweep gives them
a class on a dead package — **no member-visible effect**, but do not read these two as "the reset
refunds people."

### 🟠 FLAG C — NEW vence < today (2026-08-26): 15 members

All 15 have **`NEW vence == OLD vence`** — they were *already* expired before the sweep. **Zero members
are newly expired by this sweep.** The largest vence cut (Carolina acevedo, −47 days) still lands on
2026-09-25, a month out.

`forge` (13): Alejandra Ramos, Ana Adelina Cotto, Andrea Solis, Aurora Blanco, CAROLINA NIETO,
EDITH RODRIGUEZ, IDEL RASCON, Joel Trevizo, Merary Trevizo, Meredith Sinfuentes, RENATO VALVERDE,
Roberto Dominguez, Tania Becerra.
`red` (2): Hanna Minjarez Gonzalez, Oscar Anchondo Neri.

(`Joselyn Silva` / `74907426-…` has `vence = NULL` and zero ventas — not counted as expired.)

### 🔵 FLAG D — the real headline is DAYS, not classes

8 members lose days. The four biggest are `red` members who stacked "Clase individual" (1 class /
30 days) purchases — each purchase stacked another 30 days on top of the unused ones:

| nombre | OLD vence | NEW vence | Δ days |
|---|---|---|---|
| Carolina acevedo | 2026-11-11 | 2026-09-25 | **−47** |
| Paulina Pérez Mata | 2026-10-17 | 2026-09-20 | **−27** |
| Marcela rubio | 2026-10-18 | 2026-09-25 | **−23** |
| Sonia Fanco (forge) | 2026-10-04 | 2026-09-25 | **−9** |

Note all three `red` members above sit at **0 classes** — the stacked days were worthless to them
anyway (they can't book with a 0 balance), so the visible loss is a date on their card, not access.

---

## 4. Counts

| gym | members in scope | unchanged | changed |
|---|---|---|---|
| forge | 31 | 26 | **5** |
| red | 26 | 19 | **7** |
| **total** | **57** | **45** | **12** |

Of the 12 changed: 2 lose classes, 2 gain classes, 8 lose only days (0 lose both classes *and* only-days;
Berenice loses both a class and days and is counted under "lose classes").

Reason vocabulary used below:
- `single-venta-unchanged` — one venta ever; reset and stacking agree by definition.
- `nothing-carried` — multiple ventas, but the prior package had already expired at each new sale's `inicio`, so nothing was carried. Reset changes nothing.
- `carry-removed` — the stored balance included leftover **classes** from a prior package; the reset kills them (may also cut days).
- `days-removed` — classes unchanged; the stored `vence` included leftover **days** from a prior package.
- `seed-artifact` — the stored value has no basis in the replayed event stream (no ventas at all, or a balance no event can explain).

---

## 5. Full per-member table — `forge` (31)

`Δcl` = NEW − OLD classes. `Δd` = NEW − OLD vence, in days.

| nombre | cliente_id | OLD cl | NEW cl | Δcl | OLD vence | NEW vence | Δd | reason |
|---|---|---|---|---|---|---|---|---|
| Alan Davila | `8462176d-ab81-4214-9a70-53b9e6a158e2` | 14 | 12 | **−2** | 2026-09-23 | 2026-09-23 | 0 | **carry-removed** |
| Aldo Mendoza | `0e1dbc59-aeed-4707-8ce4-723fae3d5a9f` | 6 | 6 | 0 | 2026-09-16 | 2026-09-16 | 0 | single-venta-unchanged |
| Alejandra Ramos | `6cf0c598-f38d-486a-bcf6-088ad9e1e534` | 1 | 1 | 0 | 2026-08-24 | 2026-08-24 | 0 | single-venta-unchanged |
| Alejandro Muñoz | `46d006a2-7d40-4df1-81e3-b7d0e44c43ce` | 23 | 23 | 0 | 2026-09-17 | 2026-09-17 | 0 | single-venta-unchanged |
| Ana Adelina Cotto | `f73bcdb6-73de-4fad-a035-d513dd2c5684` | 4 | 4 | 0 | 2026-08-24 | 2026-08-24 | 0 | single-venta-unchanged |
| Andrea Solis | `014f14ee-22ec-4f8d-b38d-af47d5aeafb7` | 3 | 3 | 0 | 2026-08-24 | 2026-08-24 | 0 | single-venta-unchanged |
| Aurora Blanco | `066c0d60-bba1-4fa5-8b62-2334e589d3d2` | 0 | 0 | 0 | 2026-08-24 | 2026-08-24 | 0 | single-venta-unchanged |
| Berenice | `e9ea73ac-fd43-4a1e-a397-ca56491b78d7` | 8 | 7 | **−1** | 2026-09-22 | 2026-09-20 | **−2** | **carry-removed** |
| Carolina Cuellar | `20530dfc-26c6-4611-af8d-1b52d391ac18` | 9 | 9 | 0 | 2026-09-19 | 2026-09-19 | 0 | single-venta-unchanged |
| CAROLINA NIETO | `eb495cc8-1554-40ac-984a-047192d92ea2` | 5 | 5 | 0 | 2026-07-12 | 2026-07-12 | 0 | single-venta-unchanged |
| EDITH RODRIGUEZ | `fda13024-2c71-462b-b132-535d3df0af7e` | 1 | 1 | 0 | 2026-07-13 | 2026-07-13 | 0 | single-venta-unchanged |
| IDEL RASCON | `9852e55c-2edc-4921-80f2-fd06e792a817` | 0 | 0 | 0 | 2026-07-12 | 2026-07-12 | 0 | single-venta-unchanged |
| Issa Varela | `5561b4b1-110c-489a-b8d2-e91de6f6ca7d` | 8 | 8 | 0 | 2026-09-11 | 2026-09-11 | 0 | single-venta-unchanged |
| Jennifer Valverde | `80c7b9a4-6848-4abe-9c49-44a4b6b2deb6` | 22 | 22 | 0 | 2026-09-10 | 2026-09-10 | 0 | single-venta-unchanged |
| Jesus Ojeda | `95c59818-f502-4c89-b045-c3ebac31a0b7` | 4 | 4 | 0 | 2026-09-16 | 2026-09-16 | 0 | nothing-carried |
| Joel Trevizo | `58a83958-9230-4fbf-8021-fc3a6952be6c` | 11 | 11 | 0 | 2026-08-24 | 2026-08-24 | 0 | single-venta-unchanged |
| Kimberly Lujan | `05109926-0821-4be1-b24c-f5bb03c98ada` | 19 | 19 | 0 | 2026-09-05 | 2026-09-05 | 0 | single-venta-unchanged |
| Laura Margarita | `b8ffc9aa-c757-4dd4-b764-25ac7245a005` | 5 | 5 | 0 | 2026-09-16 | 2026-09-14 | **−2** | **days-removed** |
| Luciana Gonzalez | `8b6817e7-cd0f-42cc-af44-58131e65a9d3` | 27 | 27 | 0 | 2026-09-20 | 2026-09-20 | 0 | single-venta-unchanged |
| Magdalena Garay | `25153b0c-6eee-44d3-abd1-8cad61b91e54` | 0 | 0 | 0 | 2026-09-02 | 2026-09-02 | 0 | nothing-carried |
| Mariana Reza | `66a148a0-8231-4344-af1c-1de911f34e27` | 9 | 9 | 0 | 2026-09-23 | 2026-09-23 | 0 | single-venta-unchanged (calibration ✅) |
| Merary Trevizo | `c524505e-89ed-4014-843e-07c40bb128f6` | 1 | 1 | 0 | 2026-07-09 | 2026-07-09 | 0 | single-venta-unchanged |
| Meredith Sinfuentes | `5f436fd6-f18f-4438-a8c6-9cc4a3f88eaa` | 1 | 1 | 0 | 2026-07-16 | 2026-07-16 | 0 | single-venta-unchanged |
| RENATO VALVERDE | `1139f0bf-e200-4b08-89d4-127d44ca847c` | 1 | 1 | 0 | 2026-07-12 | 2026-07-12 | 0 | single-venta-unchanged |
| Roberto Dominguez | `07a70475-d756-48c6-a3bc-8cc25cc0b186` | 6 | 6 | 0 | 2026-07-29 | 2026-07-29 | 0 | single-venta-unchanged |
| Rosa Isela Bautista | `e0a9178b-42ab-4534-ba59-b80c1aaf749b` | 8 | 8 | 0 | 2026-09-17 | 2026-09-17 | 0 | nothing-carried |
| Sofia Torres | `f4f0e310-0c12-4edf-8c18-8142ea7b7356` | 23 | 23 | 0 | 2026-09-17 | 2026-09-17 | 0 | single-venta-unchanged |
| Sonia Fanco | `63f864c6-9014-4a49-ba79-ed28da7a668f` | 12 | 12 | 0 | 2026-10-04 | 2026-09-25 | **−9** | **days-removed** |
| Tania Becerra | `4846427b-e1ea-46a1-b50b-5d0a6380ed76` | 7 | 7 | 0 | 2026-08-24 | 2026-08-24 | 0 | single-venta-unchanged |
| Teodoro Rodriguez Lopez | `5b555267-a98e-4695-93e5-e80facf5983f` | 23 | 23 | 0 | 2026-09-10 | 2026-09-10 | 0 | nothing-carried |
| VERONICA BARRERA | `46f5bf35-71fd-4543-b185-6fffcb41858e` | 2 | 2 | 0 | 2026-09-11 | 2026-09-03 | **−8** | **days-removed** |

## 6. Full per-member table — `red` (26)

| nombre | cliente_id | OLD cl | NEW cl | Δcl | OLD vence | NEW vence | Δd | reason |
|---|---|---|---|---|---|---|---|---|
| Alva Valles | `a9379b8e-43eb-4124-988f-974b4699cfae` | 0 | 0 | 0 | 2026-09-16 | 2026-09-16 | 0 | nothing-carried |
| Andrea Alvarado Rojas | `8510ecc9-7f99-43ef-8b13-7f6095780611` | 0 | 0 | 0 | 2026-09-19 | 2026-09-15 | **−4** | **days-removed** |
| Andrea villarreal gracia | `f4cab4bc-e4b1-414f-8312-05896394e652` | 0 | 0 | 0 | 2026-09-19 | 2026-09-19 | 0 | single-venta-unchanged |
| Carolina acevedo | `bcbff83e-db10-4493-a7c8-d2f1002d7eb5` | 0 | 0 | 0 | 2026-11-11 | 2026-09-25 | **−47** | **days-removed** |
| Daniel baca | `ae2c4b00-26df-4f2b-a050-20fb727edec0` | 0 | 0 | 0 | 2026-09-12 | 2026-09-12 | 0 | single-venta-unchanged |
| Daniela Luevano | `81ae6823-48c6-48dd-b140-cb4042f786b7` | 0 | 0 | 0 | 2026-09-12 | 2026-09-12 | 0 | single-venta-unchanged |
| Daniela salinas | `0a51ea65-4f80-4f6f-bae5-180d06cd5751` | 0 | 0 | 0 | 2026-09-12 | 2026-09-12 | 0 | single-venta-unchanged |
| Eyra | `1a149df7-f020-467f-a055-325ed7c0716d` | 1 | 1 | 0 | 2026-09-08 | 2026-09-08 | 0 | single-venta-unchanged |
| Gabriela lopez | `1714618c-f10d-4ec5-8e9c-3f3fc176f958` | 0 | 0 | 0 | 2026-09-18 | 2026-09-18 | 0 | single-venta-unchanged |
| Hanna Minjarez Gonzalez | `bf79cee1-cade-4855-b716-d3762ad7f36f` | 0 | 1 | **+1** | 2026-08-20 | 2026-08-20 | 0 | **seed-artifact** |
| Jaime Hernandez | `e75cf39c-d9b4-451d-a1bf-b9be483a1c41` | 0 | 0 | 0 | 2026-09-23 | 2026-09-23 | 0 | nothing-carried |
| Jorge Holguín | `30d15acf-5e06-4ab8-8f32-12d33df22c8c` | 3 | 3 | 0 | 2026-09-08 | 2026-09-08 | 0 | single-venta-unchanged |
| Joselyn Silva | `74907426-9135-41d1-bfd6-9adec706deaf` | 0 | 0 | 0 | (null) | (null) | — | seed-artifact (0 ventas) |
| Karen Lara | `7b431a19-751a-429b-8148-1d94bdef6ee4` | 0 | 0 | 0 | 2026-09-12 | 2026-09-12 | 0 | single-venta-unchanged |
| Marcela rubio | `78d08c65-450f-45e9-ae4f-afc70927fa44` | 0 | 0 | 0 | 2026-10-18 | 2026-09-25 | **−23** | **days-removed** |
| Maria Renee Olivas Chairez | `7f56aa1c-5cc6-4913-93da-daea3db322f2` | 1 | 1 | 0 | 2026-09-12 | 2026-09-12 | 0 | single-venta-unchanged |
| Mariana limones | `2fabd54c-b599-4090-8e36-f8ef0898a688` | 0 | 0 | 0 | 2026-09-18 | 2026-09-18 | 0 | single-venta-unchanged |
| Matia | `ee29cb8f-db53-4991-9873-8cc477166bb5` | 0 | 0 | 0 | 2026-09-17 | 2026-09-17 | 0 | single-venta-unchanged |
| Michel lara | `b446df98-0487-42a0-97f1-ed6fd6ac654b` | 0 | 0 | 0 | 2026-09-12 | 2026-09-12 | 0 | single-venta-unchanged |
| Oscar Anchondo Neri | `24e90312-ade5-4eaa-8705-7fb7082c9c9a` | 0 | 1 | **+1** | 2026-08-20 | 2026-08-20 | 0 | **seed-artifact** |
| Paola salas | `ac94767a-b116-4e47-984b-044f78407cbd` | 0 | 0 | 0 | 2026-09-12 | 2026-09-12 | 0 | single-venta-unchanged |
| Paola soto | `dbb468c3-3d2b-4aad-bee9-e9a965a2c970` | 0 | 0 | 0 | 2026-09-17 | 2026-09-17 | 0 | single-venta-unchanged |
| Paulina Pérez Mata | `f0ca35bc-25e1-4d0e-8d56-6f5eecd54856` | 0 | 0 | 0 | 2026-10-17 | 2026-09-20 | **−27** | **days-removed** |
| Rafael Quintana | `36d245f7-feaa-493a-80d4-abb9346ede41` | 0 | 0 | 0 | 2026-09-12 | 2026-09-12 | 0 | single-venta-unchanged |
| Roxana  Hernández | `1884895c-2ff1-4d2e-aa61-2482854b2635` | 2 | 2 | 0 | 2026-09-11 | 2026-09-11 | 0 | single-venta-unchanged |
| Yolanda Araly Paez Robles | `b11103de-ec20-4c83-81c9-58b57e28f1d8` | 0 | 0 | 0 | 2026-09-19 | 2026-09-16 | **−3** | **days-removed** |

---

## 7. The corrections — DO NOT RUN FROM THIS SESSION

12 statements, one per changed member. Each carries its rollback value in a trailing comment.
Run them inside a single transaction, and take a `clientes` snapshot first regardless (§8).

```sql
-- RESET-rule correction sweep — 2026-08-26. 12 rows. Run as one transaction.
begin;

-- ── forge (5) ───────────────────────────────────────────────────────────────
-- Alan Davila — carry-removed: 2 leftover classes die. ACTIVE package, member-visible.
update public.clientes set clases_restantes = 12, vence = '2026-09-23'
 where id = '8462176d-ab81-4214-9a70-53b9e6a158e2';  -- rollback: 14, '2026-09-23'

-- Berenice — carry-removed: 1 class + 2 days die. ACTIVE package, member-visible.
update public.clientes set clases_restantes = 7, vence = '2026-09-20'
 where id = 'e9ea73ac-fd43-4a1e-a397-ca56491b78d7';  -- rollback: 8, '2026-09-22'

-- Laura Margarita — days-removed: 2 days.
update public.clientes set clases_restantes = 5, vence = '2026-09-14'
 where id = 'b8ffc9aa-c757-4dd4-b764-25ac7245a005';  -- rollback: 5, '2026-09-16'

-- Sonia Fanco — days-removed: 9 days.
update public.clientes set clases_restantes = 12, vence = '2026-09-25'
 where id = '63f864c6-9014-4a49-ba79-ed28da7a668f';  -- rollback: 12, '2026-10-04'

-- VERONICA BARRERA — days-removed: 8 days.
update public.clientes set clases_restantes = 2, vence = '2026-09-03'
 where id = '46f5bf35-71fd-4543-b185-6fffcb41858e';  -- rollback: 2, '2026-09-11'

-- ── red (7) ─────────────────────────────────────────────────────────────────
-- Andrea Alvarado Rojas — days-removed: 4 days. Balance already 0.
update public.clientes set clases_restantes = 0, vence = '2026-09-15'
 where id = '8510ecc9-7f99-43ef-8b13-7f6095780611';  -- rollback: 0, '2026-09-19'

-- Carolina acevedo — days-removed: 47 days (3 stacked "Clase individual"). Balance already 0.
update public.clientes set clases_restantes = 0, vence = '2026-09-25'
 where id = 'bcbff83e-db10-4493-a7c8-d2f1002d7eb5';  -- rollback: 0, '2026-11-11'

-- Hanna Minjarez Gonzalez — seed-artifact: +1 class on an EXPIRED package. See FLAG B.
update public.clientes set clases_restantes = 1, vence = '2026-08-20'
 where id = 'bf79cee1-cade-4855-b716-d3762ad7f36f';  -- rollback: 0, '2026-08-20'

-- Marcela rubio — days-removed: 23 days. Balance already 0.
update public.clientes set clases_restantes = 0, vence = '2026-09-25'
 where id = '78d08c65-450f-45e9-ae4f-afc70927fa44';  -- rollback: 0, '2026-10-18'

-- Oscar Anchondo Neri — seed-artifact: +1 class on an EXPIRED package. See FLAG B.
update public.clientes set clases_restantes = 1, vence = '2026-08-20'
 where id = '24e90312-ade5-4eaa-8705-7fb7082c9c9a';  -- rollback: 0, '2026-08-20'

-- Paulina Pérez Mata — days-removed: 27 days. Balance already 0.
update public.clientes set clases_restantes = 0, vence = '2026-09-20'
 where id = 'f0ca35bc-25e1-4d0e-8d56-6f5eecd54856';  -- rollback: 0, '2026-10-17'

-- Yolanda Araly Paez Robles — days-removed: 3 days. Balance already 0.
update public.clientes set clases_restantes = 0, vence = '2026-09-16'
 where id = 'b11103de-ec20-4c83-81c9-58b57e28f1d8';  -- rollback: 0, '2026-09-19'

commit;
```

If the two `seed-artifact` rows (Hanna, Oscar) should be left alone — they are drift, not a rule-change
consequence, and their packages are dead — drop those two statements. The other 10 are the sweep proper.

---

## 8. Notes before anyone applies this

1. **These numbers go stale the moment anyone sells or takes roll call.** The replay reads live
   `ventas` / `asistencias` / `reservation`. Re-run §2 immediately before applying, and diff against
   the OLD columns here — if an OLD value has moved, that member sold/attended since 2026-08-26 and the
   NEW value for them is wrong.
2. **The data fix is not the code fix.** `registrar_venta` still stacks (`v_base_clases` /
   `v_base_dias`, lines under `if v_cli.vence is not null and (v_cli.vence - v_inicio) >= 0`). The very
   next renewal re-creates the carry. Ship the migration in the same change, or sweep again.
3. **`registrar_venta`'s "already expired" guard.** It raises `'La venta ya estaría vencida en la fecha
   de inicio'` when `v_new_vence < v_hoy`. Under the reset rule `v_new_vence` no longer inherits carried
   days, so a backdated sale that used to squeak past this guard on carry alone will now be refused.
   Worth a look when the migration is written.
4. **Burned holds:** `forge` 2, `red` 2 (`reservation.status='cancelada' AND consumio=true` — a booking
   that charged and never refunded). None of them land after their member's last venta, so none affect
   this sweep. They are a separate ledger issue.
5. **Nothing in this report was executed.** All statements above are inert text.
