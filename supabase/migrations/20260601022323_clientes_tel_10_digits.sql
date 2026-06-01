-- Applied to project hjppxawglmukfvsgmcog via Supabase MCP (migration 20260601022323).
-- Single-home the phone intake rule at the DB layer (the third layer, mirroring the `metodo`
-- pattern: one rule stated consistently across form + Zod + DB): clientes.tel must carry EXACTLY
-- 10 digits once non-digits are stripped — the same canonical MX-mobile rule the TS `isTelValido`
-- (src/lib/format.ts) enforces at the form + Zod layers. Verified in a rolled-back txn before
-- apply: the existing rows pass; a 9-digit tel is rejected, a 10-digit (even formatted) accepted.
alter table public.clientes
  add constraint clientes_tel_10_digits_ck
  check (char_length(regexp_replace(tel, '\D', '', 'g')) = 10);
