# Spec — Editable WhatsApp templates + send-time picker

**Date:** 2026-06-02 · **Status:** Approved (brainstorming) · **Branch:** `feat/profile-settings-templates`
**Feature:** let the operator manage a small library of named WhatsApp templates from `cuenta`, and
choose which one to send at both send points (client message + post-sale receipt).

## Problem

The `cuenta` screen's "PLANTILLAS DE WHATSAPP" card
(`src/app/(app)/cuenta/_components/cuenta.tsx`) only fires a "Próximamente" toast. Templates exist
today as a **fixed four-key model** (`plantillas.clave ∈ {recibo, recordatorio, renovar, ultima}`,
one `body` each, `unique(user_id, clave)`) that is **read-only** — there is no create/edit/delete
DAL, action, or RPC. And the operator cannot *choose* a template at send time: the client flow
hardcodes `recordatorio` (`src/lib/data/clientes.ts:180`) and the receipt flow hardcodes `recibo`
(`src/lib/data/ventas.ts:168`), each pre-rendered server-side into a single `waText` string.

## Goal

1. Let an operator **create / edit / delete** WhatsApp templates (each a `nombre` + `body`), capped
   at **4**, from a `cuenta` editor — replacing the dormant card's "Próximamente" toast.
2. Let the operator **pick which template to send** at both send points (client "Mandar mensaje" and
   the post-sale receipt's "Enviar por WhatsApp"), with the token-substituted text previewed before
   sending.
3. New / empty operators are **auto-seeded** a sensible default set so a picker is never empty.

All writes go through the same RLS-bounded, RPC-based seam the rest of the app uses (ADR-0005); the
codebase's "zero direct writes" property is preserved.

## Locked decisions (from brainstorming)

1. **Freeform named templates, hard cap of 4.** The model shifts from fixed-purpose `clave` slots to
   operator-named `(id, nombre, body)` rows. **No categories** (the categorized-library option was
   rejected): every template is offered at every send point; the live preview keeps the operator from
   picking a poorly-fitting one.
2. **Picker at *both* send points, text-only this phase.** Client message **and** receipt. The
   receipt-as-image idea is **deferred to Phase 2** (research captured in the appendix; not built now).
3. **Auto-seed a default set.** Because the app has **no new-user provisioning trigger** (perfil /
   paquetes are seeded out-of-band; this is effectively a single-operator app), auto-seed is an
   **idempotent seed RPC** invoked when the templates manager opens with zero rows, plus a one-time
   **migration backfill** of `nombre` for the existing operator's four rows. The default bodies are
   the **current production bodies** for the four claves, pulled verbatim during implementation, so
   seeding reproduces today's exact messages.
4. **Cap (and every write) enforced in Postgres.** `crear_plantilla` enforces the cap-of-4 atomically
   (count-then-insert in one `SECURITY INVOKER` function); `actualizar_plantilla` / `eliminar_plantilla`
   are owner-scoped single-row writes. This keeps the repo's "every mutation goes through a tested,
   RLS-bounded function" story uniform (the rationale stated in the cliente-edit spec). Single-operator
   concurrency makes the count-then-insert race a non-issue (noted honestly below).
5. **The picker is a shared, purely-presentational UI-kit component.** `src/components/forge` imports
   nothing from `domain`/`lib` today; the picker keeps that purity via an `onEnviar` callback — the
   *sector* owns `waLink` (app → `lib/format` is the allowed direction). One picker, reused at both
   send points (DRY, and the enforced boundary stays green).

## Architecture & flow

**Manage (cuenta):**
```
[PLANTILLAS card] → PlantillasManagerSheet (list ≤4; add/delete; tap to edit)
  → EditarPlantillaSheet (nombre + body, token chips, live preview via renderPlantilla)
  → {crear|actualizar|eliminar}PlantillaAction(raw)      // server actions ("use server")
  → {crear|actualizar|eliminar}Plantilla(raw)            // DAL: zod + requireOperator()
  → supabase.rpc("{crear|actualizar|eliminar}_plantilla") // SECURITY INVOKER → RLS = boundary
  → (client) toast + router.refresh()
(manager opens with 0 rows) → sembrarPlantillasDefaultAction() → rpc("sembrar_plantillas_default")
```

**Send (client message / receipt):**
```
server (shapeFicha / crearVenta):
  listarPlantillas() → for each: renderPlantilla(body, ctx) → mensajes: {id, nombre, texto}[]
client:
  [Mandar mensaje] / [Enviar por WhatsApp] → MensajePicker({ mensajes, onEnviar })
  → onEnviar(m) = window.open(waLink(tel, m.texto))     // sector owns waLink
```

The enforced sector boundary holds: schema/DAL/RPCs in `src/lib/data` + `supabase/`, server actions
in `src/app/(app)/cuenta`, sector UI in each route's `_components`, the reusable picker in
`src/components/forge`. No `src/lib`→`src/components`/`src/app` import is introduced; `renderPlantilla`
runs server-side (data layer) and in the cuenta editor (app layer) — both allowed directions.

## Components

### 1. Data layer

**Migration A** `supabase/migrations/<ts>_plantillas_freeform.sql` — reshape the table:

```sql
-- fixed-purpose `clave` slots → operator-named templates.
alter table public.plantillas add column nombre text;
update public.plantillas set nombre = case clave
  when 'recibo'       then 'Recibo'
  when 'recordatorio' then 'Recordatorio'
  when 'renovar'      then 'Renovación'
  when 'ultima'       then 'Última llamada'
  else initcap(clave)
end where nombre is null;
alter table public.plantillas alter column nombre set not null;

alter table public.plantillas drop constraint plantillas_user_id_clave_key; -- confirm name via \d
alter table public.plantillas drop column clave;

alter table public.plantillas
  add constraint plantillas_nombre_len_ck check (char_length(nombre) between 1 and 40),
  add constraint plantillas_body_len_ck   check (char_length(body)   between 1 and 1000);

-- the original migration created select/insert/update policies but NO delete policy:
create policy "plantillas owner delete" on public.plantillas
  for delete to authenticated using ((select auth.uid()) = user_id);
```

**Migration B** `supabase/migrations/<ts>_plantillas_rpcs.sql` — the write seam (all
`SECURITY INVOKER`, `set search_path to ''`, `revoke … from public` + `grant … to authenticated`,
mirroring the ADR-0005 RPCs):

```sql
create or replace function public.crear_plantilla(p_nombre text, p_body text)
 returns uuid language plpgsql set search_path to '' as $function$
declare v_uid uuid := (select auth.uid()); v_id uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if (select count(*) from public.plantillas where user_id = v_uid) >= 4 then
    raise exception 'Máximo 4 plantillas';
  end if;
  insert into public.plantillas (user_id, nombre, body)
  values (v_uid, p_nombre, p_body) returning id into v_id;
  return v_id;
end; $function$;

create or replace function public.actualizar_plantilla(p_id uuid, p_nombre text, p_body text)
 returns void language plpgsql set search_path to '' as $function$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  update public.plantillas set nombre = p_nombre, body = p_body where id = p_id; -- RLS scopes to owner
  if not found then raise exception 'Plantilla no encontrada'; end if;
end; $function$;

create or replace function public.eliminar_plantilla(p_id uuid)
 returns void language plpgsql set search_path to '' as $function$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  delete from public.plantillas where id = p_id; -- RLS scopes to owner
  if not found then raise exception 'Plantilla no encontrada'; end if;
end; $function$;

create or replace function public.sembrar_plantillas_default()
 returns void language plpgsql set search_path to '' as $function$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if exists (select 1 from public.plantillas where user_id = v_uid) then return; end if; -- idempotent
  insert into public.plantillas (user_id, nombre, body) values
    (v_uid, 'Recordatorio',  '<current prod body for recordatorio>'),
    (v_uid, 'Recibo',        '<current prod body for recibo>'),
    (v_uid, 'Renovación',    '<current prod body for renovar>'),
    (v_uid, 'Última llamada','<current prod body for ultima>');
end; $function$;
-- + revoke/grant for each (public → authenticated), per ADR-0005.
```

> **Honesty note (cap race):** count-then-insert under READ COMMITTED is not race-proof against two
> *concurrent* inserts; a `BEFORE INSERT` trigger has the same profile. With one operator this cannot
> occur, and a partial unique index cannot express "≤ 4". Accepted; documented rather than hidden.

**DAL** `src/lib/data/plantillas.ts` — rewritten:
- Remove `PlantillaClave`, `getPlantilla`. Replace `getPlantillas` (record keyed by `clave`) with
  `listarPlantillas(client?) : Promise<PlantillaDTO[]>` where `PlantillaDTO = { id, nombre, body }`
  (select `id, nombre, body` ordered by `created_at`; still `cache()`-wrapped, client-injectable).
- Add Zod schemas + writers mirroring `actualizarCliente`: `crearPlantilla` (`{ nombre, body }`),
  `actualizarPlantilla` (`{ id, nombre, body }`), `eliminarPlantilla` (`{ id }`) — each
  `requireOperator()` then `supabase.rpc(...)`, throwing a Spanish `Error` on failure.
  `nombre`: `z.string().trim().min(1).max(40)`; `body`: `z.string().trim().min(1).max(1000)`.
- Add `sembrarPlantillasDefault(client?)` → `rpc("sembrar_plantillas_default")`.

**Callers updated** (the `clave` API is gone):
- `src/app/(app)/cuenta/page.tsx:17` — `getPlantillas()` → `listarPlantillas()`; pass the list to
  `CuentaScreen` (count = `list.length`).
- `src/lib/data/clientes.ts` (`shapeFicha`/ficha builder, ~line 180) — drop `getPlantilla("recordatorio")`
  + single `waText`; instead `listarPlantillas()` and render **each** with the existing client `ctx`
  → expose `ficha.mensajes: { id, nombre, texto }[]`.
- `src/lib/data/ventas.ts` (`crearVenta`, ~line 168) — drop `getPlantilla("recibo")` + single `waText`;
  render each template with the receipt `ctx` → `VentaResult.mensajes: { id, nombre, texto }[]`.
- `src/lib/data/ventas.test.ts` fixtures `{ clave, body }` → `{ nombre, body }`; assertions on
  `mensajes` instead of `waText`.

**Types**: regenerate Supabase TS types after the migrations (no `as any`), per ADR-0005's type-bridge.

### 2. Server actions

New `src/app/(app)/cuenta/actions.ts` (`"use server"`), thin wrappers delegating to the DAL, **no
`revalidatePath`** (the `(app)` reads are dynamic; the client `router.refresh()`es after a write — the
same rationale as `togglePaseAction` / the cliente-edit spec):
`crearPlantillaAction`, `actualizarPlantillaAction`, `eliminarPlantillaAction`,
`sembrarPlantillasDefaultAction`.

### 3. UI (built via the frontend-design skill)

- **`src/components/forge/mensaje-picker.tsx`** — `MensajePicker({ open, onClose, titulo?, mensajes:
  { id, nombre, texto }[], onEnviar: (m) => void })`. Purely presentational `Sheet`: a list of template
  names, the selected template's rendered `texto` shown as a preview, and an "Enviar" that calls
  `onEnviar(selected)`. Imports only React + the UI kit — no `domain`/`lib` (boundary-safe). Empty
  state: "No tienes plantillas — créalas en Cuenta."
- **`src/app/(app)/cuenta/_components/plantillas-manager-sheet.tsx`** — lists the ≤4 templates; "Agregar"
  disabled at 4; tap a row to edit; delete (with confirm) via `eliminarPlantillaAction`. On open, if the
  list is empty, calls `sembrarPlantillasDefaultAction()` then `router.refresh()` (the auto-seed).
- **`src/app/(app)/cuenta/_components/editar-plantilla-sheet.tsx`** — mirrors `editar-cliente-sheet.tsx`:
  owns `nombre` / `body` / `saving` state (re-seeded on open), Save enabled only when valid + dirty +
  `!saving`. Tappable **token chips** (`{nombre} {clases} {paquete} {vence} {dias} {precios} {datos_pago}
  {negocio}`) insert at the cursor; a **live preview** renders `body` against a fixed sample `ctx`
  (e.g. `{ nombre:"Andrea", clases:"5 clases", paquete:"Ilimitado", vence:"16 jun", negocio: perfil.negocio }`)
  via the domain `renderPlantilla`. Handles both create (`crearPlantillaAction`) and edit
  (`actualizarPlantillaAction`).
- **Wiring** (minimal edits): `cuenta.tsx` — the PLANTILLAS card `onClick` opens the manager (replacing
  `proximamente`). `cliente-detalle.tsx` — "Mandar mensaje" opens `MensajePicker` with `ficha.mensajes`
  and `onEnviar = (m) => window.open(waLink(c.tel, m.texto), "_blank")`. `vender.tsx` — the receipt's
  "Enviar por WhatsApp" opens `MensajePicker` with `result.mensajes` the same way.

Visual polish produced through the **frontend-design** skill at build time, consistent with the
existing Sheets.

## Error handling

| Case | Behavior |
| --- | --- |
| Invalid name/body (client) | Save disabled; no submit. |
| Invalid input reaching the DAL | `schema.parse` throws → action throws → client catch → warning toast. |
| 5th template attempted | `crear_plantilla` raises `Máximo 4 plantillas`; UI also disables "Agregar" at 4. |
| Unauthorized / wrong owner | RLS-scoped write matches 0 rows → RPC raises `… no encontrada` → warning toast. |
| Delete last template, then send | Picker shows the empty state; no blank message is sent. |
| Auto-seed when rows already exist | `sembrar_plantillas_default` no-ops (idempotent guard). |
| RPC / network failure | Warning toast; Sheet stays open; action re-enabled. |

## Testing

Following the repo's data-layer-focused strategy (vitest for logic/data; SQL rules tests on the real
schema; no component-test harness). **TDD on the data layer (schemas + DAL tests first).**

- **`src/lib/data/plantillas.test.ts`** (new): with an injected fake Supabase client — each writer
  calls the right `.rpc(...)` with the right payload; `listarPlantillas` maps rows → `PlantillaDTO[]`;
  schemas reject empty/over-length `nombre`/`body`. (Renders for `mensajes` are covered where the ctx
  is built — `clientes`/`ventas` tests.)
- **`supabase/tests/plantillas_rules.sql`** (new, mirrors `toggle_pase_rules.sql`): rolled-back SQL on
  the real schema — `crear_plantilla` allows ≤4 and raises on the 5th; `actualizar`/`eliminar` are
  owner-scoped (a non-owner cannot touch another operator's row); the new **delete policy** works;
  `sembrar_plantillas_default` seeds 4 on an empty owner and no-ops when rows exist.
- **`renderPlantilla`** already tested (unknown-token passthrough); add a case only if a new token is
  introduced (none planned).
- **UI**: verified manually via the `/run` (or `/verify`) skill on a phone-width viewport.

## Out of scope (YAGNI)

Receipt-as-image (Phase 2 — appendix) · template categories · a per-template "default" flag ·
reordering · more than 4 templates · audit log · optimistic UI. Revisit if needed.

## Appendix — Phase 2 (deferred): receipt as an image

Captured so the research isn't lost; **not built in this spec.** Decision recorded: send the receipt
**as an image, caption is best-effort** (no paid API).

- **Mechanism:** `html-to-image` (~20 KB min, 0 deps, best font/CSS fidelity) snapshots the receipt DOM
  (`vender.tsx`, the self-contained receipt subtree) → PNG → `navigator.share({ files, text })`. One
  tap, native share sheet, pick the contact. Place capture logic in a `src/lib/image.ts` helper called
  from the `vender` sector.
- **Fallback** (desktop / Firefox — no Web-Share-with-files): download the PNG + open the `wa.me` text
  link; operator attaches manually.
- **Known limitation (accepted):** the text caption is *not* reliably delivered with the image,
  especially on iOS — WhatsApp/iOS platform behavior, not a bug. Mitigated because all key data
  (amount, folio, date) already lives **inside** the receipt image. Guaranteed image+caption would
  require the WhatsApp Business Cloud API (Meta verification, a backend, template approval, per-message
  billing) — rejected as overkill for one operator sending by hand.
- **Gotcha:** the brand lockup uses CSS-variable SVG gradients (`var(--silver)`/`var(--yellow)`); resolve
  these to literal colors before capture. Ensure the Outfit web font is loaded before snapshotting.

## References

- ADR-0001 — Supabase RLS, no ORM (RLS is the authorization boundary).
- ADR-0005 — atomic write RPCs (`SECURITY INVOKER`, grants, canonical-provisioner migration, type-bridge).
- Mirror targets: `2026-06-02-cliente-edit-design.md` (sibling spec, same patterns) ·
  `actualizar_cliente` RPC + `actualizarCliente`/`actualizarClienteSchema` (`src/lib/data/clientes.ts`) ·
  `editar-cliente-sheet.tsx` (`src/app/(app)/clientes/[id]/_components/`) ·
  `renderPlantilla` (`src/domain/rules.ts`) + `PlantillaContext` (`src/domain/types.ts`) ·
  `waLink` (`src/lib/format.ts`) · `toggle_pase_rules.sql` (`supabase/tests/`).
