# Paquete-swap edit — implementation SPEC (2026-08-15)

Owner rulings this is designed to (LOCKED 2026-08-15, thread #266):

1. **Vence follows fecha** — editing a sale's `fecha` re-derives the cliente's vigencia/balance.
   REVERSES the attribution-only scope in `20260814120000`'s header.
2. **Package swap** — the operator picks a different paquete (or personalizado) for an existing venta;
   clases/vigencia/monto follow it. Clawback-of-old-grant + re-grant-of-new, ONE transaction. Never a
   delta adjustment of the sale row alone.
3. **Delete gate (floor-clip)** — ELIMINAR is unavailable iff the clawback would push the balance
   below zero. Partially reverses #267.4. Swap stays available in that state.
4. Defaults — monto reseeds to the new paquete's precio (still editable); swap windowed 30 d from
   `created_at`; personalizado swap reuses vender's form fields.

---

## 0. Decisions taken here (read these before the sections)

**D0.1 — ONE core, one RPC.** `editar_venta` grows the package arguments; there is no second
function. A fecha-only re-derive is literally "swap with the same package facts", so the clawback +
re-grant math exists once. A separate `cambiar_paquete_venta` would need the identical body (it must
also honour a fecha change in the same transaction) and would fight `editar_venta` for the same row.

**D0.2 — `editar_venta` becomes SECURITY DEFINER.** It now writes
`ventas.{paquete_nombre,clases,vigencia_tipo,vigencia_dias,personalizado}` and
`clientes.{clases_restantes,vence,paquete_nombre}`. As INVOKER those would all need grants, which is
exactly the raw-PATCH surface `20260813120000` closed. Definer + `staff_gym()` + `gym_id = v_gym` +
`set search_path to ''`, the `eliminar_venta` pattern verbatim.

**D0.3 — the `fecha` column grant is REVOKED.** `20260814120000` granted `update (fecha)` only
because INVOKER `editar_venta` needed it. Under ruling 1 `fecha` is no longer an attribution-only
column: a raw `PATCH ventas?fecha=` would now leave the stored balance describing a vigencia that
started on a different day. Back to the `20260813120000` state — `grant update (monto, metodo)`. Both
survivors are still pure attribution, so their accepted residual is unchanged. Definer means the RPC
does not care.

**D0.4 — the clamp fires ONCE, at the end.** The clawback's intermediate balance is allowed to go
negative *inside* the transaction; `greatest(0, …)` is applied only to the final re-granted number.
This is load-bearing, not a detail:

| case | balance | old grant | new grant | clamp-per-step | clamp-at-end |
|------|---------|-----------|-----------|----------------|--------------|
| fecha-only move (no clamp elsewhere) | 3 | 8 | 8 | 0 → **8** (silent gift) | **3** ✅ identity |
| swap up, over-consumed | 3 | 8 | 12 | 0 → **12** (5 free clases) | **7** ✅ |
| swap down | 3 | 8 | 4 | 0 → **4** | **0** ✅ |

`#267.4`'s floor is not weakened: it governs DELETE, where nothing is re-granted and a stored
negative would be nonsense. Here the intermediate is not a stored state.

**D0.5 — re-derive is triggered by CHANGE, never by the call.** `v_cambio_grant` (clases /
vigencia_tipo / vigencia_dias differ from the stored row) OR `v_cambio_fecha` (the resolved gym-tz
day differs). A monto/metodo-only edit, or a re-post of an already-applied swap, touches `clientes`
not at all. Without this guard a no-op call would run clawback+re-grant and the floor/expiry-discard
branches would silently move a balance that nobody asked to move.

**D0.6 — no idempotency key.** The write is an UPDATE of a row named by id: a replay creates no
second row and no folio. `for update` on the venta serialises concurrent calls, and D0.5 makes the
second identical payload degenerate to a monto/metodo write with the same values. `registrar_venta`
needs a key because it INSERTs; this does not. A denial vector pins it (S6).

**D0.7 — the window is scoped to the PACKAGE change only.** `v_cambio_paquete` past 30 d from
`created_at` is refused; monto/metodo/fecha stay any-age, as `#266.3` shipped. Windowing the fecha
path too was considered and rejected: memory `[[gym-data-belongs-to-the-gym]]` says never propose a
window the owner did not ask for, and he windowed the swap only.

**D0.8 — registrar's dead-on-arrival refusal is NOT replicated.** `registrar_venta` raises `'La
venta ya estaría vencida en la fecha de inicio'` to stop the desk creating a useless sale. On a
correction the already-expired outcome is often the truth being recorded (a 5-day pass sold 20 days
ago). Refusing would make that truth unrecordable. Everything else in the stacking block is verbatim.

**D0.9 — the re-derive is registrar-faithful, including the expired-restart discard.** If the
post-clawback `vence` is before the sale's fecha, `base_dias := 0` and `base_clases := 0` — the same
discard `registrar_venta` applies. Consequence to state in review: when nothing clamps, the re-derive
is an exact identity (proved by the existing VF1/VF5 vectors, which keep passing untouched), and a
stacked purchase's `vence` legitimately does not move when the member was still vigente at the sale
date. "Vence follows fecha" bites exactly where registrar's own rule does.

---

## 1. RPC surface

### 1.1 `editar_venta` — new signature

```sql
public.editar_venta(
  p_venta_id         uuid,
  p_monto            integer,
  p_metodo           text,
  p_fecha            date    default null,
  p_paquete_id       uuid    default null,
  p_custom_nombre    text    default null,
  p_custom_clases    integer default null,
  p_custom_dias      integer default null,
  p_custom_ilimitado boolean default null
) returns void
language plpgsql security definer set search_path to ''
```

- **No `p_custom_precio`.** The sheet already has a MONTO field and it is the sale's price; two price
  arguments on one door is a "which wins" trap. Consequence: the personalizado 100 000 cap does not
  apply here — `monto`'s bound stays the deliberate one-sided `>= 1` (`20260814120000`:61-71).
- `returns void` unchanged — the sheet `router.refresh()`es; changing the return type would force a
  drop anyway and buys nothing.
- **PostgREST overload trap** (`20260814120000`:30-33): DROP the 4-arg signature *before* creating
  this one, or every existing 3-/4-arg post is PGRST203-ambiguous.

### 1.2 Algorithm

1. `v_gym := public.staff_gym()`; null → `'No autorizado'`. (Auth first, input second — registrar's order.)
2. `p_metodo not in ('efectivo','transferencia','tarjeta')` → `'Método inválido'`.
3. `p_monto is null or p_monto < 1` → `'Monto inválido'`.
4. `v_custom := (p_custom_nombre is not null or p_custom_clases is not null or p_custom_dias is not
   null or coalesce(p_custom_ilimitado,false))`. `if v_custom and p_paquete_id is not null` →
   `'Venta inválida: elige un paquete o define uno personalizado'`. NOTE the difference from
   registrar: *neither* is legal here and means "keep the current package".
5. `select v.cliente_id, v.paquete_nombre, v.clases, v.vigencia_tipo, v.vigencia_dias,
   v.personalizado, v.fecha, v.created_at into v_venta from public.ventas v where v.id = p_venta_id
   and v.gym_id = v_gym for update;` — not found → `'Venta no encontrada'`. The lock is the same
   double-apply guard `eliminar_venta`:132-135 documents.
6. `select g.timezone into v_tz …; v_hoy := (now() at time zone v_tz)::date;`
7. Resolve the target package facts into `v_nombre / v_clases / v_vig_tipo / v_vig_dias / v_person`:
   - `p_paquete_id` → `select … from public.paquetes where id = p_paquete_id and gym_id = v_gym`;
     not found → `'Paquete no encontrado'` (tenant-scoped: a cross-gym paquete id is this refusal).
     `v_person := false`.
   - `v_custom` → registrar's validations verbatim, minus precio:
     `trim(nombre)` length 3..40 → `'Nombre del paquete personalizado inválido'`;
     `p_custom_dias` 1..365 → `'Vigencia personalizada inválida'`;
     `coalesce(p_custom_ilimitado,false)` ⇒ `p_custom_clases` must be null (else `'Clases
     personalizadas inválidas'`) and `v_clases := null`; otherwise `p_custom_clases` 1..365 →
     `'Clases personalizadas inválidas'`. `v_vig_tipo := 'dias'`, `v_person := true`.
   - neither → copy the stored row's facts unchanged.
8. Fecha bounds — only when `p_fecha is not null`, mirroring registrar/`editar_venta` verbatim,
   **no alta floor** (dropped 2026-08-14, `20260814130000`):
   `> v_hoy` → `'La fecha de inicio no puede ser futura'`;
   `< v_hoy - 30` → `'La fecha de inicio no puede tener más de 30 días de antigüedad'`;
   `v_fecha_ts := (p_fecha::timestamp + interval '12 hours') at time zone v_tz` (registrar's midday
   convention). `v_fecha_dia := coalesce(p_fecha, (v_venta.fecha at time zone v_tz)::date)`.
9. Change flags (D0.5):
   ```sql
   v_cambio_grant   := (v_clases    is distinct from v_venta.clases)
                    or (v_vig_tipo  is distinct from v_venta.vigencia_tipo)
                    or (v_vig_dias  is distinct from v_venta.vigencia_dias);
   v_cambio_paquete := v_cambio_grant
                    or (v_nombre    is distinct from v_venta.paquete_nombre)
                    or (v_person    is distinct from v_venta.personalizado);
   v_cambio_fecha   := p_fecha is not null
                    and p_fecha is distinct from (v_venta.fecha at time zone v_tz)::date;
   ```
10. Window (D0.7): `if v_cambio_paquete and v_venta.created_at < now() - interval '30 days' then
    raise exception 'Ya pasaron 30 días: el paquete de esta venta ya no se puede cambiar'; end if;`
11. Rewrite the venta row — **before** the clientes write, so the `paquete_nombre` subselect below
    sees the new name:
    ```sql
    update public.ventas
       set monto = p_monto, metodo = p_metodo, fecha = coalesce(v_fecha_ts, fecha),
           paquete_nombre = v_nombre, clases = v_clases,
           vigencia_tipo = v_vig_tipo, vigencia_dias = v_vig_dias, personalizado = v_person
     where id = p_venta_id and gym_id = v_gym;
    if not found then raise exception 'Venta no encontrada'; end if;
    ```
    `folio`, `created_at`, `cliente_id`, `gym_id`, `idempotency_key` are never touched — `folio` is
    the paper ticket, `created_at` is the delete/swap window anchor.
12. **Cheap path.** `if not (v_cambio_grant or v_cambio_fecha)`: if `v_cambio_paquete` (a rename /
    personalizado-flag-only change) re-stamp `clientes.paquete_nombre` from the latest remaining sale
    (the `eliminar_venta`:167-170 subselect, ordered `created_at desc, id desc`); then `return`.
    A monto/metodo-only edit reaches `clientes` not at all.
13. `select c.clases_restantes, c.vence into v_cli from public.clientes c where c.id =
    v_venta.cliente_id for update;` (the venta's FK guarantees the row; no extra refusal string).
14. Clawback — **unclamped** (D0.4):
    ```sql
    v_dias_old    := case when v_venta.vigencia_tipo = 'mes' then 30 else coalesce(v_venta.vigencia_dias,0) end;
    v_base_clases := case when v_cli.clases_restantes is null then null
                          else v_cli.clases_restantes - coalesce(v_venta.clases,0) end;   -- may be negative
    v_base_vence  := case when v_cli.vence is null then null else v_cli.vence - v_dias_old end;
    ```
15. Re-grant at `v_fecha_dia` — registrar's stacking block verbatim:
    ```sql
    v_dias_new := case when v_vig_tipo = 'mes' then 30 else coalesce(v_vig_dias,0) end;
    if v_base_vence is not null and (v_base_vence - v_fecha_dia) >= 0 then
      v_base_dias := v_base_vence - v_fecha_dia;
    else
      v_base_dias := 0; v_base_clases := 0;          -- registrar's expired-restart discard (D0.9)
    end if;
    if    v_clases      is null then v_new_clases := null;                       -- ilimitado package
    elsif v_base_clases is null then v_new_clases := v_clases;                   -- ilimitado balance
    else  v_new_clases := greatest(0, v_base_clases + v_clases);                 -- THE one clamp
    end if;
    v_new_vence := v_fecha_dia + v_base_dias + v_dias_new;
    ```
    No dead-on-arrival refusal (D0.8).
16. ```sql
    update public.clientes c
       set clases_restantes = v_new_clases,
           vence            = v_new_vence,
           paquete_nombre   = (select v.paquete_nombre from public.ventas v
                                where v.cliente_id = c.id and v.gym_id = v_gym
                                order by v.created_at desc, v.id desc limit 1)
     where c.id = v_venta.cliente_id;
    ```
    The subselect (rather than `= v_nombre`) is what makes swapping a NON-latest sale leave the plan
    label alone; when the swapped sale is the latest it resolves to the new name. On a fecha-only
    move it is a provable no-op.

### 1.3 `eliminar_venta` — the floor-clip gate (ruling 3)

Same signature, `create or replace`. After the window check and before the DELETE, replace the bare
`perform 1 … for update` with a reading lock and the gate:

```sql
select c.clases_restantes into v_saldo
  from public.clientes c where c.id = v_venta.cliente_id for update;

if v_saldo is not null and v_venta.clases is not null and v_saldo - v_venta.clases < 0 then
  raise exception 'No se puede eliminar: ya se usaron clases de esta venta';
end if;
```

Boundary: landing on **exactly 0 is allowed**; only strictly-below is refused. An ilimitado sale
(`clases is null`) and an ilimitado balance (`clases_restantes is null`) never trip it — neither can
floor. The `vence` half is deliberately ungated (the ruling names the balance).

### 1.4 Refusal strings (contract — suites pin them verbatim)

Existing, unchanged: `No autorizado`, `Venta no encontrada`, `Método inválido`, `Monto inválido`,
`La venta ya no se puede eliminar`, `La fecha de inicio no puede ser futura`,
`La fecha de inicio no puede tener más de 30 días de antigüedad`.

New on `editar_venta` (all lifted verbatim from `registrar_venta` where one existed):
`Paquete no encontrado`, `Venta inválida: elige un paquete o define uno personalizado`,
`Nombre del paquete personalizado inválido`, `Clases personalizadas inválidas`,
`Vigencia personalizada inválida`,
`Ya pasaron 30 días: el paquete de esta venta ya no se puede cambiar`.

New on `eliminar_venta`: `No se puede eliminar: ya se usaron clases de esta venta`.

### 1.5 Grants / EXECUTE lockdown

```sql
-- D0.3 — back to the 20260813120000 column set; drops the fecha grant 20260814120000 added.
revoke update on public.ventas from anon, authenticated;
grant  update (monto, metodo) on public.ventas to authenticated;
-- `ventas_staff_update` stays: it still composes with the surviving monto/metodo residual.

drop function if exists public.editar_venta(uuid, integer, text);            -- belt (already dropped)
drop function if exists public.editar_venta(uuid, integer, text, date);      -- braces (the live one)
-- … create or replace the 9-arg function …
revoke execute on function public.editar_venta(uuid, integer, text, date, uuid, text, integer, integer, boolean) from public, anon;
grant  execute on function public.editar_venta(uuid, integer, text, date, uuid, text, integer, integer, boolean) to authenticated;
revoke execute on function public.eliminar_venta(uuid) from public, anon;
grant  execute on function public.eliminar_venta(uuid) to authenticated;
```

---

## 2. Migration plan

**One file: `supabase/migrations/20260815120000_editar_venta_paquete.sql`.** Precedent is
`20260813120000`, which shipped both correction RPCs together; the swap and the delete gate are one
ruling set and land together. Expand-only, idempotent, safe out of order.

Contents in order: header (rulings 1-4, D0.2/D0.3/D0.4/D0.7/D0.8/D0.9 reasoning, and an explicit
amendment note that `20260814120000`'s "clientes.vence is deliberately NOT recomputed" paragraph is
now REVERSED) → §1.5 grant block → the two `drop function` lines → the 9-arg `editar_venta` →
its EXECUTE lockdown → `create or replace eliminar_venta` with the gate → its EXECUTE lockdown.

Then `pnpm gen:rpc-canon` — regenerates `supabase/functions-canonical/{editar_venta,eliminar_venta}.sql`;
the drift guard fails the commit otherwise. Apply to the local docker stack via `docker cp` +
in-container `psql -f` (never a PowerShell pipe — UTF-8 mojibake; the denial runner never applies
migrations itself). Live apply is MCP `apply_migration` at ship time only, then a typegen parity check.

---

## 3. Delete gate — where the predicate lives

**No new preview RPC.** The floor-clip is already computable from data the ficha ships: `FichaPago`
carries `clases`, and `ClienteFichaDTO` carries `clasesRestantes`. `previewEliminarVenta` computes
the very same subtraction today.

- **vm** (`pago-sheet-vm.ts`), new pure fn — the single definition, mirroring §1.3 exactly:
  ```ts
  export function clawbackPisaCero(clases: number | null, clasesRestantes: number | null): boolean {
    return clases !== null && clasesRestantes !== null && clasesRestantes - clases < 0;
  }
  ```
- **sheet** (`pago-sheet.tsx`): `const puedeEliminar = dentroDeVentanaEliminar(pago.createdAt, new
  Date()) && !clawbackPisaCero(pago.clases, clasesRestantes);`
- **UI when in-window but clipped** — the button is replaced, not disabled (the sheet's standing rule
  is "never a disabled button explaining a rule"), by a muted note in its slot:
  `Esta venta ya no se puede eliminar: se usaron clases de ella. Cambia el paquete.`
  Past-window stays as it is today: nothing rendered.
- **RPC is the enforcer** (§1.3); `eliminarVentaAction` surfaces the refusal through the existing
  `VentaRefusalError` → `{ ok: false, mensaje }` channel, toasted verbatim.

---

## 4. DAL / action changes

`packages/data/src/server/ventas.ts`
- `editarVentaSchema` gains `paquete: paqueteSeleccionSchema.optional()` — **reuse** the existing
  discriminated union, no new schema. Its `precio` field is IGNORED on this door (monto is the
  price); document that in one comment.
- `editarVenta()` spreads the package args onto the RPC call, mirroring `crearVenta`'s idiom:
  ```ts
  ...(input.paquete?.tipo === "registrado" ? { p_paquete_id: forPaquete(input.paquete.paqueteId) } : {}),
  ...(input.paquete?.tipo === "personalizado"
      ? { p_custom_nombre: input.paquete.nombre, p_custom_dias: input.paquete.dias,
          ...(input.paquete.clases === null
              ? { p_custom_ilimitado: true } : { p_custom_clases: input.paquete.clases }) }
      : {}),
  ```
  With `paquete` absent the posted payload is byte-identical to today's — the cheap path is untouched.
- `VENTA_REFUSALS` += the seven new strings in §1.4.

`packages/data/src/server/clientes.ts`
- `ClienteFichaDTO` gains `paquetes: PaqueteDTO[]`. **Zero extra I/O** — `getClienteFicha` already
  fetches `getPaquetes(supabase, tz).catch(() => [])` for the `{precios}` token (line 417); just
  return it. Do NOT push this into `derive.ts`/`FichaDerivada` — it is I/O-sourced, like `hoyIso`.

`packages/data/src/server/derive.ts` — **no changes.** `FichaPago` already carries
`clases / vigenciaTipo / vigenciaDias / createdAt / monto / metodo / fechaIso / mes`, and the
estado/veredicto chain reads stored `clientes.vence` + `clases_restantes`, which the RPC rewrites.
(`personalizado` is deliberately NOT added to the ventas select — see §5.)

`apps/admin/src/app/(app)/clientes/[id]/actions.ts`
- Signatures unchanged. **Add `revalidatePath("/asistencia")`** to BOTH `editarVentaAction` and
  `eliminarVentaAction`: an edit can now move `clases_restantes`, and `/asistencia`'s desk gate reads
  it (`togglePaseAction` already revalidates the same trio for the same reason).

---

## 5. UI plan

### 5.1 Lifted / reused pieces

| piece | decision |
|---|---|
| `vender/_components/personalizado-editor.tsx` | **LIFT** to `(app)/_components/personalizado-editor.tsx`, add `mostrarPrecio?: boolean` (default `true`). vender keeps today's render; the sheet passes `false` because its MONTO field *is* the price. |
| vender's paquete tile list (`vender.tsx`:782-819) | **LIFT** the tiles + PERSONALIZADO tile into `(app)/_components/paquete-tiles.tsx` (props: `paquetes`, `sel`, `setSel`, `vigenciaEnd: string \| null`, `custom`, `setCustom`, `customHasta`, `mostrarPrecio`). vender's `PaqueteEditor` renders `<PaqueteTiles>` + its own backdate row; the sheet renders `<PaqueteTiles vigenciaEnd={null}>`. Straight move, identical visuals, two call sites. |
| `vender-vm.ts` (`PERSONALIZADO`, `CustomForm`, `CUSTOM_VACIO`, `customErrors`, `customValido`, `customSeleccion`, `inicioMinIso`) | **REUSE in place.** `pago-sheet-vm.ts` already imports `inicioMinIso` from it — the precedent is set, no second move. |
| `_components/{metodo-editor,inicio-calendar}.tsx` | already shared, unchanged. |

### 5.2 `pago-sheet-vm.ts` — new pure rules (all unit-tested)

- `clawbackPisaCero(clases, clasesRestantes)` — §3.
- `rederivaSaldo({ ventaClases, ventaVigTipo, ventaVigDias, nuevoClases, nuevoVigTipo, nuevoVigDias, fechaOriginalIso, fechaIso }): boolean` — mirrors the RPC's `v_cambio_grant or v_cambio_fecha`; drives the preview banner and the FECHA hint.
- `previewRederivarVenta({ clasesRestantes, vence, viejo:{clases,dias}, nuevo:{clases,dias}, fechaIso }): string` — mirrors §1.2 steps 14-15 **including the one-clamp rule and the expired-restart discard**. Renders e.g. `El saldo se recalcula: quedará en 7 clases · vence 14 sep.` Fragments drop out exactly as `previewEliminarVenta`'s do when a fact is unknowable (ilimitado package ⇒ no class claim; ilimitado balance ⇒ no count).
- `swapDirty(paqSel, custom)` — `paqSel !== null && (paqSel !== PERSONALIZADO || customValido(custom))`.

### 5.3 `pago-sheet.tsx`

Props gain `paquetes: PaqueteDTO[]` (threaded from `ficha.paquetes` in `cliente-detalle.tsx`:247-255).

- **`detalle`**: unchanged, except **remove** the `¿Paquete equivocado? Vuelve a venderle` deep-link
  (lines 213-225) — the picker supersedes it, and after this change it is wrong advice. The ficha's
  own `irAVender` CTA remains the door for a genuinely new sale.
- **`editar`** gains a PAQUETE section, above MONTO:
  - A read-only `ACTUAL` line: `{pago.paquete} · {clases o "Ilimitado"} · {dias} días`. The picker
    starts with **nothing selected** — `ventas` stores no `paquete_id`, so any "which tile is the
    current one" match would be a guess. Selection means "swap to this".
  - `<PaqueteTiles>` beneath it. Section is **hidden entirely** when the sale is past the 30-day
    swap window (`!dentroDeVentanaEliminar(pago.createdAt, ahora)`) — same "absent, not disabled"
    discipline as ELIMINAR; the RPC refuses it anyway.
  - New state: `paqSel: string | null` (null = sin cambio), `custom: CustomForm`. Seeded in
    `abrirEditar` to `null` / `CUSTOM_VACIO`; picking PERSONALIZADO seeds the form from the CURRENT
    sale (`nombre: pago.paquete`, `clases`, `dias: vigenciaDiasVenta(...)`, `ilimitado: clases === null`)
    so "this custom package had the wrong number of days" is a two-tap fix.
  - **Monto reseed**: picking a registrado tile sets `monto = String(paquete.precio)` (ruling 4;
    still editable). Picking PERSONALIZADO leaves MONTO alone — it *is* the personalizado price.
  - The personalizado payload keeps `precio` in sync with the field:
    `customSeleccion({ ...custom, precio: monto })`, so `customErrors`/`customValido` are reused verbatim.
- **`dirty` / `canSave`**: `dirty ||= swapDirty(paqSel, custom)`; `canSave` additionally requires
  `paqSel !== PERSONALIZADO || customValido(...)`.
- **FECHA hint copy MUST change** — today's `No mueve el saldo ni la vigencia.` is now false. New:
  `Corrige el día en que se cobró. La vigencia se recalcula desde ese día.`
- **Preview, inline — not a second confirm step.** When `rederivaSaldo(...)`, render
  `previewRederivarVenta(...)` in a muted line directly above GUARDAR, live as the operator picks.
  A swap is re-correctable (swap back), unlike a delete, so it does not earn a modal; but the numbers
  still show before the write, the `#267.6` discipline.
- **`guardar`** forwards `paquete` only when `paqSel !== null`:
  `paquete: paqSel === null ? undefined : paqSel === PERSONALIZADO ? customSeleccion({...custom, precio: monto}) : { tipo: "registrado", paqueteId: paqSel }`.
  Success toast reads the NEW package name.

---

## 6. Test plan

### 6.1 New SQL suite — `supabase/tests/editar_venta_paquete.sql`

Fixture discipline copied from `eliminar_venta_rules.sql`: transaction-local, zero prod UUIDs, every
fixture written as `postgres` BEFORE the first `set local role authenticated`, assertions after
`reset role`, one cliente per vector, `BEGIN…ROLLBACK`, one `OK` row.

Every vector re-SELECTs **both** tables — the written rows are the contract.

| id | vector | WRITTEN-ROW assertions |
|----|--------|------------------------|
| S1 | swap to a registrado paquete. cliente 10 clases / `vence = current_date+40`; venta 8 clases `dias` 20, `fecha = hoy-3`, `created_at = now()-3d`; swap → 12 clases `mes` | ventas: `paquete_nombre` = new, `clases=12`, `vigencia_tipo='mes'`, `vigencia_dias` null, `personalizado=false`, `monto` = sent; `folio/created_at/cliente_id/gym_id` byte-identical (jsonb catch-all). clientes: `clases_restantes = 14` (10−8+12), `vence = current_date+50` ((hoy−3)+23+30), `paquete_nombre` = new |
| S2 | swap to personalizado (nombre/clases/dias, then a second call with `p_custom_ilimitado`) | ventas `personalizado=true`, `vigencia_tipo='dias'`, `clases` = typed / NULL on the ilimitado arm; clientes `clases_restantes` NULL on that arm |
| S3 | **the clamp is final, not intermediate** — cliente on 3, venta granted 8, swap → 12 | `clases_restantes = 7`, **not 12**. This vector is D0.4; name it in the comment |
| S4 | swap down under water — cliente 3, venta 8, swap → 4 | `clases_restantes = 0`, never negative |
| S5 | fecha-only re-derive, two arms: (a) still vigente at the new day ⇒ **identity** (balance + vence byte-identical); (b) new day AFTER the post-clawback vence ⇒ `base_dias=0`, `base_clases=0` ⇒ `clases_restantes = venta.clases`, `vence = fecha + dias` | both, plus `ventas.fecha` = midday gym-tz on the requested day |
| S6 | **idempotence** (D0.6) — the identical swap payload posted twice | balance after call 2 == after call 1; exactly one ventas row; `folio` unmoved |
| S7 | **window** — sale `created_at = now()-31d`: a package swap raises `Ya pasaron 30 días: el paquete de esta venta ya no se puede cambiar` and writes NOTHING (both rows byte-identical); the SAME sale then accepts a monto/metodo/fecha edit, proving the window is scoped to the package (D0.7) |
| S8 | cross-tenant — gym B on gym A's venta → `Venta no encontrada`; gym A's venta with a gym-B `p_paquete_id` → `Paquete no encontrado`; nothing written either time |
| S9 | argument refusals — both `p_paquete_id` and custom args → `Venta inválida: …`; nombre 2 chars; `dias` 0 and 366; `ilimitado` + `clases` together. Each asserts both rows unchanged |
| S10 | **the cheap path** — monto/metodo only, no `p_fecha`, no package args → the whole `clientes` row is byte-identical (jsonb compare). This is the "must NOT clawback" contract |
| S11 | rename-only — swap to a package with identical clases/vigencia but a different nombre → `ventas.paquete_nombre` and `clientes.paquete_nombre` follow; `clases_restantes`/`vence` byte-identical (no re-derive) |

Wiring: add to `SUITE` in `run-denial-suite.mjs` immediately after `editar_venta_rules.sql`, and to
`rpc-coverage.json` under `editar_venta.suites` (no new key — no new function).

### 6.2 Edits to existing suites

- **`eliminar_venta_rules.sql` V6** flips identity: today it asserts "3 − 8 floors at 0". Under
  ruling 3 that call is now REFUSED with `No se puede eliminar: ya se usaron clases de esta venta`;
  assert the venta row survives and `clases_restantes` stays 3. Rewrite the header comment.
- **New V6b** to preserve what V6 also proved: a cliente on exactly 8 losing a sale that granted 8 →
  the delete is ALLOWED (`= 0` is not below zero — the boundary), balance lands on 0, and with no
  sales left `paquete_nombre` is CLEARED (`#267.5`).
- **New V11**: the gate does NOT fire for an ilimitado sale (`clases` null) or an ilimitado balance
  (`clases_restantes` null) — both delete normally.
- **GRANT LAYER block** (same file): add a probe that `update public.ventas set fecha = …` from
  `authenticated` is now refused (`insufficient_privilege`), pinning D0.3; keep (a) DELETE refused,
  (b) `folio` refused, (c) `monto` allowed.
- **`editar_venta_rules.sql`**: the VECTORS pass unchanged — VF1 and VF5 are identity cases under the
  re-derive (verified by hand: 10−8=2 base, `+40−20` base vence, re-granted at hoy−5 / hoy / hoy−30 all
  return `10` and `current_date+40`). What MUST change is VF1's semantic comment block (lines
  382-393), which currently asserts the reason as "a fecha edit must not re-grant classes"; rewrite it
  to state that the re-derive is an exact identity here because nothing clamped, and point at
  `editar_venta_paquete.sql` S5b for the non-identity case. Also update the file header's V1 comment
  "wrong paquete is fixed by delete + re-sell, not by edit" — the assertion (a package-less call must
  not move `paquete_nombre`) stays true, the rationale does not.

### 6.3 TS tests

- `apps/admin/src/app/(app)/clientes/[id]/_components/pago-sheet-vm.test.ts` — truth table for
  `clawbackPisaCero` (below / exactly zero / above / ilimitado sale / ilimitado balance),
  `rederivaSaldo` (grant change, fecha change, neither, same-value package), and
  `previewRederivarVenta` strings for the identity, clamp-at-end, swap-down-to-zero and
  expired-restart cases.
- `packages/data/src/server/ventas.test.ts` — `editarVenta` forwards `p_paquete_id` only on the
  registrado arm; forwards `p_custom_ilimitado: true` (not `p_custom_clases`) on the ilimitado arm;
  and with `paquete` absent posts a payload byte-identical to today's.
- `pnpm lint && pnpm typecheck && pnpm test` (pre-commit), then `pnpm test:denial` green on the local
  docker stack before the fast-forward — migration-bearing change, AGENTS.md's documented pre-merge gate.

---

## 7. Open flags

**None blocking.** Two derived defaults, marked so the orchestrator can overrule cheaply:

- **F1 — the window covers the PACKAGE change only** (D0.7). Ruling 4 windows "the swap"; the fecha
  re-derive is left any-age because `[[gym-data-belongs-to-the-gym]]` forbids proposing a window the
  owner did not ask for. If he wants the whole re-derive windowed, the change is one boolean
  (`v_cambio_paquete` → `v_cambio_grant or v_cambio_fecha` on line 10) plus a fixture split in
  `editar_venta_rules.sql` (its main venta is `created_at = now()-90d` and VF1/VF5 would start
  failing).
- **F2 — the delete gate's refusal copy** asserts `ya se usaron clases de esta venta` while the
  predicate is the floor-clip (`balance − grant < 0`). Those are the same thing in practice and the
  proxy is the one ruling 3 names, but the sentence is a claim about the member, not about the
  arithmetic. Alternative if he prefers the literal: `No se puede eliminar: el saldo quedaría en negativo`.
