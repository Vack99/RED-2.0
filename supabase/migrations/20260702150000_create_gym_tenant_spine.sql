-- Tenant spine, slice #18: the `gym` (inquilino) + `gym_domain` tables, their forge/red seeds,
-- and the pre-auth anon-read policies. FIRST in the Phase-3 DAG and the Phase-4 interface —
-- `gym.brand_module_id` + `gym.token_overrides` are created here so the brand-render track consumes
-- them without a mid-flight handshake (PRD #17; ADR-0008/0012/0013). Phase 4 never writes a
-- migration against `gym`.
--
-- Expand-only, fully idempotent (create-if-not-exists + drop-policy-if-exists + on-conflict seeds)
-- so it is safe on a fresh preview branch AND out-of-order on the live project (Forge stays green).
-- RLS is enabled explicitly (ADR-0001) even though the `rls_auto_enable` trigger also fires.

-- ── gym: the tenant row (only the columns Phase 3 exercises; PRD §Schema) ──────
-- brand_module_id: opaque registry key — NO FK/CHECK, NO DB default; render-side validation is
--   Phase 4's (ADR-0012 header contract). token_overrides: opaque jsonb here; its zod value-shape
--   is Phase 4's decision. Contact/marketing graduation from `perfil` waits for Phase 5/6 consumers.
create table if not exists public.gym (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  brand_name text not null,
  legal_name text,                                       -- nullable until the HITL legal fact lands
  timezone text not null,                                -- IANA (e.g. America/Chihuahua)
  brand_module_id text not null,                         -- opaque registry key (no FK/CHECK/default)
  token_overrides jsonb not null default '{}'::jsonb,    -- opaque here (Phase 4 owns the shape)
  owner_user_id uuid references auth.users (id) on delete set null,  -- nullable (RED seeds ownerless)
  created_at timestamptz not null default now()
);
alter table public.gym enable row level security;

-- ── gym_domain: host → gym (the pre-auth proxy lookup; ADR-0012 §5) ───────────
-- hostname unique across the table; a gym needs >= 2 hosts (admin + client). gym_id indexed per
-- ADR-0013 §2/§5 (index every gym_id).
create table if not exists public.gym_domain (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gym (id) on delete cascade,
  hostname text not null unique,
  app text not null check (app in ('admin', 'client')),
  created_at timestamptz not null default now()
);
alter table public.gym_domain enable row level security;

create index if not exists gym_domain_gym_id_idx on public.gym_domain (gym_id);

-- ── Anon-read policies: hostnames + the gym marketing row are public facts ─────
-- The ONLY anon reads Phase 3 grants (ADR-0013 §3). Read granted to anon AND authenticated (a
-- logged-in request still resolves its host through the proxy). NO write policy on either table →
-- default-deny denies every anon/non-staff write; seeds ride the migration role, which bypasses RLS.
drop policy if exists "gym_anon_select" on public.gym;
create policy "gym_anon_select" on public.gym
  for select to anon, authenticated using (true);

drop policy if exists "gym_domain_anon_select" on public.gym_domain;
create policy "gym_domain_anon_select" on public.gym_domain
  for select to anon, authenticated using (true);

-- ── Seeds: forge + red gyms, then the 5 gym_domain rows from HOST_TO_BRAND ─────
-- Both gyms in America/Chihuahua with '{}' overrides; RED seeded ownerless (owner_user_id null).
insert into public.gym (slug, brand_name, timezone, brand_module_id)
values
  ('forge', 'Forge', 'America/Chihuahua', 'forge'),
  ('red',   'RED',   'America/Chihuahua', 'red')
on conflict (slug) do nothing;

-- The 5 HOST_TO_BRAND entries (both *.localhost + 3 Vercel hosts). app pins each host to the
-- deployment that serves it: the admin arm (Forge admin) and the client arm (serves forge + red by
-- host). The RED-admin host is DELIBERATELY absent — it is a later human insert (Phase-4 HITL).
insert into public.gym_domain (gym_id, hostname, app)
select g.id, d.hostname, d.app
from (values
  ('forge', 'forge.localhost',                  'admin'),   -- dev mirror of the Forge admin arm
  ('red',   'red.localhost',                    'client'),  -- dev mirror of the RED client arm
  ('forge', 'red-2-0-admin.vercel.app',         'admin'),   -- live Forge admin (#16)
  ('red',   'red-2-0-client.vercel.app',        'client'),  -- live RED on the client deploy (#16)
  ('forge', 'forge-red-2-0-client.vercel.app',  'client')   -- live Forge on the client deploy (#16)
) as d(slug, hostname, app)
join public.gym g on g.slug = d.slug
on conflict (hostname) do nothing;
