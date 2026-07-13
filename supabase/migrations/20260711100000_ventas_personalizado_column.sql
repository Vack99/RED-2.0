-- Venta personalizada (spec 2026-07-11 §5.1, decision D3): mark the sales whose
-- package was typed at the desk rather than picked from the gym's catalog.
--
-- `ventas` already snapshots WHAT was sold (paquete_nombre, clases, vigencia_tipo,
-- vigencia_dias, monto) and holds no paquete_id — so a custom sale is already
-- representable. This column records only that it WAS custom, so a gym can later
-- answer "how much did we give away in promos?".
--
-- Backfill is implicit: every row written before this migration came from a
-- paquetes row, so `false` is the correct value for all of them.

alter table public.ventas
  add column if not exists personalizado boolean not null default false;

comment on column public.ventas.personalizado is
  'True when the package was typed at the sale (promo/discount/one-off) instead of picked from public.paquetes. No paquetes row exists for it — by design, so it can never reach the public catalog.';
