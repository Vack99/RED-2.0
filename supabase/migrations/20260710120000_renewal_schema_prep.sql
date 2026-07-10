-- Renewal-flow schema prep (rulings C6, C2, C12, D2 — findings 2026-07-08).
-- Expand-only groundwork the renewal RPC rewrites build on: registrar_venta gains an
-- idempotency rail (C6), its metodo domain narrows to the collected methods (C2),
-- reservation records whether it consumed a class (C12), and member email becomes a
-- per-gym unique dedup backstop (D2). Idempotent (if-not-exists / if-exists) so it is
-- safe on a fresh scratch project AND out-of-order on the live project.

-- 1. Idempotency rail for registrar_venta (C6): the client-supplied key makes a retried
--    sale a no-op instead of a second ledger row. Partial — legacy/keyless sales (NULL)
--    are unconstrained, so historical rows and non-idempotent callers stay legal.
alter table public.ventas add column if not exists idempotency_key uuid;
create unique index if not exists ventas_idem_gym_uq
  on public.ventas (gym_id, idempotency_key) where idempotency_key is not null;

-- 2. Ruling C2: every sale collects at COBRAR — 'pendiente' is no longer a method.
--    Live has zero pendiente rows (verified 2026-07-10), so the narrowing is data-clean.
--    The CHECK is the original inline column check auto-named ventas_metodo_check
--    (20260530023224); if-exists keeps the drop out-of-order-safe.
alter table public.ventas drop constraint if exists ventas_metodo_check;
alter table public.ventas add constraint ventas_metodo_check
  check (metodo in ('efectivo', 'transferencia', 'tarjeta'));

-- 3. Ruling C12: record whether the booking consumed a class, so a cancel refunds only
--    a booking that actually spent one (a no-show consumed and is not refunded).
alter table public.reservation add column if not exists consumio boolean not null default false;

-- 4. D2 backstop: one member row per verified email per gym (case-insensitive). Placeholder
--    seed emails (8 distinct forge-demo people sharing seed@mock.test) are scrubbed to NULL
--    FIRST — email is optional and demo rows need no join key; keying dedup on them would
--    false-merge distinct people. No-op on scratch (no seed inserts that address). Partial:
--    NULL-email rows (the CRM norm) stay unconstrained.
update public.clientes set email = null where email = 'seed@mock.test';
create unique index if not exists clientes_email_gym_uq
  on public.clientes (gym_id, lower(email)) where email is not null;
