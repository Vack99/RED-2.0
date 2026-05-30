-- Optional contact extras (brief Q4). tel stays required (the WhatsApp spine).
-- Applied to project hjppxawglmukfvsgmcog via Supabase MCP (migration 20260530040213).
alter table public.clientes add column if not exists email text;
alter table public.clientes add column if not exists birthday date;
