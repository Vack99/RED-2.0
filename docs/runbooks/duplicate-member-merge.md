# Runbook — merging duplicate `clientes` rows (service role)

**Date authored:** 2026-07-10 · **Rulings:** D2/D3 reconciliation + Part-C merge constraints (`docs/FIndings/2026-07-08-renewal-flow-findings.md`). The old RENOVAR bug (D1) minted a blank NUEVO row on every renewal, so a renewing member is split across two `clientes` rows: an old one holding their attendance history and a newer one holding the **paid balance they can never claim** (email-only join, D3). This runbook consolidates a pair onto one surviving row **without losing a single venta or asistencia**.

Run as **service role** (Supabase SQL editor / MCP `execute_sql` / `postgres`).

## The merge rule (plan-locked)

- **Survivor = the OLDEST row** (earliest `created_at`) — it carries the longest history.
- **Repoint children FIRST, never delete first.** `ventas.cliente_id`, `asistencias.cliente_id`, and `reservation.member_id` are all `ON DELETE CASCADE` from `clientes` (`20260530023224`, `20260530031218`, `20260706170000`). Deleting the duplicate before repointing **silently destroys** its revenue ledger + attendance history. So: `UPDATE` every child to the survivor, verify the duplicate has zero children, **then** delete the emptied row (the cascade now removes nothing).
- **Survivor takes the NEWEST row's `clases_restantes` / `vence` / `paquete_nombre`.** The old row's package has expired (its `vence` is in the past), so correct stacking on the renewal date would forfeit the stale base and grant the renewal's fresh saldo — which is exactly what the newer row already holds. The survivor keeps its **own** `nombre` / `tel` / `email` / `auth_user_id`; only the three balance columns move.

`stackPaquete` composes a saldo with a *purchase*, not two saldos — there is no two-saldo combine rule, and none is needed here: the base is expired, so "survivor takes newest saldo" **is** the correct stacked result.

## Pre-checks (must pass, or halt)

1. **Duplicate `auth_user_id` is NULL.** If the duplicate were a claimed account, deleting it would orphan a login, and the survivor can hold only one `auth_user_id` per gym (`clientes_auth_user_id_per_gym`, partial unique). This runbook only merges an **unclaimed** duplicate into the survivor. If the duplicate is the claimed one, stop and re-plan (repoint `auth_user_id` instead).
2. **Duplicate has no colliding `reservation`.** Repointing `reservation.member_id` violates `reservation_member_session_uq (member_id, class_session_id)` if both rows booked the same session. Verify the duplicate's reservation rows don't collide with the survivor's (in practice: verify the duplicate has **zero** reservation rows).
3. **Count children before and after** — the repoint must move all of them and leave the duplicate empty.
4. **Snapshot the pair** before mutating. One transaction per pair.

The placeholder-email scrub already shipped (`20260710120000_renewal_schema_prep.sql` set the 8 shared `seed@mock.test` rows to NULL), and the D2 backstop `clientes_email_gym_uq` is partial on `email is not null`, so NULL-email duplicates never block the survivor's email column.

## Step 0 — resolve the pair's UUIDs (never paste truncated ids)

The live facts below are truncated (`95c5…22e5`). **Do not paste truncated ids into SQL.** Resolve the full UUIDs at run time by `(gym_id, tel, created-order)` — the RED gym is `d5f81022…`:

```sql
-- Returns the pair oldest-first: row 1 = survivor, row 2 = duplicate.
select id, created_at, nombre, clases_restantes, vence, paquete_nombre, auth_user_id, email
  from public.clientes
 where gym_id = '<red_gym_id>'          -- d5f81022…
   and tel = '<tel>'
 order by created_at asc;
```

Assign `<survivor_id>` = row 1's `id`, `<dup_id>` = row 2's `id`. Confirm row 2's `auth_user_id` is NULL (pre-check 1) before proceeding.

## Step 1 — the merge transaction (run once per pair)

```sql
begin;

-- Snapshot the pair (record this output before mutating).
select id, created_at, nombre, clases_restantes, vence, paquete_nombre, auth_user_id, email
  from public.clientes where id in ('<survivor_id>', '<dup_id>');

-- Pre-checks as hard guards: abort the whole txn if either fails.
do $$
begin
  if (select auth_user_id from public.clientes where id = '<dup_id>') is not null then
    raise exception 'HALT: duplicate % is claimed (auth_user_id not null) — re-plan', '<dup_id>';
  end if;
  if exists (
    select 1 from public.reservation d
    join public.reservation s
      on s.member_id = '<survivor_id>' and s.class_session_id = d.class_session_id
    where d.member_id = '<dup_id>'
  ) then
    raise exception 'HALT: reservation session collision — resolve before repoint';
  end if;
end $$;

-- Counts BEFORE (record them).
select
  (select count(*) from public.ventas       where cliente_id = '<dup_id>')      as dup_ventas,
  (select count(*) from public.asistencias  where cliente_id = '<dup_id>')      as dup_asis,
  (select count(*) from public.reservation  where member_id  = '<dup_id>')      as dup_resv,
  (select count(*) from public.ventas       where cliente_id = '<survivor_id>') as surv_ventas,
  (select count(*) from public.asistencias  where cliente_id = '<survivor_id>') as surv_asis;

-- Repoint children to the survivor FIRST (never delete first).
update public.ventas      set cliente_id = '<survivor_id>' where cliente_id = '<dup_id>';
update public.asistencias set cliente_id = '<survivor_id>' where cliente_id = '<dup_id>';
update public.reservation set member_id  = '<survivor_id>' where member_id  = '<dup_id>';

-- Survivor takes the NEWEST (duplicate) row's balance; nombre/tel/email/auth_user_id untouched.
update public.clientes
   set clases_restantes = <dup_clases>,          -- <dup_saldo> (NULL for Ilimitado)
       vence            = '<dup_vence>',
       paquete_nombre   = '<dup_paquete_nombre>'
 where id = '<survivor_id>';

-- Verify the duplicate is now childless BEFORE deleting (cascade must remove nothing).
do $$
begin
  if exists (select 1 from public.ventas      where cliente_id = '<dup_id>')
  or exists (select 1 from public.asistencias where cliente_id = '<dup_id>')
  or exists (select 1 from public.reservation where member_id  = '<dup_id>') then
    raise exception 'HALT: duplicate still has children — repoint incomplete';
  end if;
end $$;

-- Emptied row → delete (cascade deletes nothing; children already repointed).
delete from public.clientes where id = '<dup_id>';

-- Post-verify: survivor now holds the summed children + the newest balance.
select
  (select count(*) from public.ventas      where cliente_id = '<survivor_id>') as surv_ventas_after,
  (select count(*) from public.asistencias where cliente_id = '<survivor_id>') as surv_asis_after,
  c.clases_restantes, c.vence, c.paquete_nombre
  from public.clientes c where c.id = '<survivor_id>';

commit;
```

`surv_ventas_after` must equal `surv_ventas + dup_ventas`; `surv_asis_after` must equal `surv_asis + dup_asis`. If either mismatches, `ROLLBACK`.

## The two 2026-07-10 RED pairs (worked examples)

Both are in the RED gym (`gym_id d5f81022…`), both born of the old RENOVAR bug, all four rows `email = NULL` and `auth_user_id = NULL`, zero reservations (pre-checks 1 and 2 pass trivially). Resolve each pair via Step 0's lookup by `tel`, then run Step 1.

### Pair A — Jesus Ojeda, `tel 6142397814`

| role | truncated id | created | ventas | asistencias | saldo | vence | paquete |
|------|-------------|---------|--------|-------------|-------|-------|---------|
| **survivor** (oldest) | `95c5…22e5` | 06-10 | 1 | 8 | 0 clases | 2026-07-09 | — |
| **duplicate** (newest) | `9f6a…303c` | 07-08 | 1 | 3 | 6 clases | 2026-08-06 | "8 clases" |

After merge the survivor holds **2 ventas, 11 asistencias**, `clases_restantes = 6`, `vence = 2026-08-06`, `paquete_nombre = '8 clases'`. Step-1 values: `<dup_clases> = 6`, `<dup_vence> = '2026-08-06'`, `<dup_paquete_nombre> = '8 clases'`.

### Pair B — Teodoro Rodriguez Lopez, `tel 6142904320`

| role | truncated id | created | ventas | asistencias | saldo | vence | paquete |
|------|-------------|---------|--------|-------------|-------|-------|---------|
| **survivor** (oldest) | `5b55…983f` | 06-10 | 1 | 14 | Ilimitado | 2026-07-09 | — |
| **duplicate** (newest) | `97b2…2973` | 07-10 | 1 | 1 | Ilimitado | 2026-08-08 | — |

The survivor's `nombre` is the **fuller** "Teodoro Rodriguez Lopez"; the duplicate's is "Teodoro Rodriguez" — survivor is oldest **and** keeps the better name (only its three balance columns move, never `nombre`). After merge the survivor holds **2 ventas, 15 asistencias**, `vence = 2026-08-08`, still Ilimitado. Step-1 values: `<dup_clases> = NULL` (Ilimitado), `<dup_vence> = '2026-08-08'`, `<dup_paquete_nombre>` = the duplicate's `paquete_nombre` (read it from Step 0).

## Do NOT

- Delete the duplicate before repointing its children — `ON DELETE CASCADE` erases the ledger + attendance.
- Overwrite the survivor's `nombre` / `tel` / `email` / `auth_user_id` — only `clases_restantes` / `vence` / `paquete_nombre` move.
- Merge a duplicate whose `auth_user_id` is non-null via this recipe — pre-check 1 halts it.
- Paste the truncated ids above into SQL — resolve full UUIDs via Step 0.
