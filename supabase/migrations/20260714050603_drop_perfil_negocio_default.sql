-- Drop the hard-coded 'FORGE' default on perfil.negocio.
-- A competitor's brand has no business being the platform default (#97): brand
-- identity now derives from gym.brand_name (per-tenant, NOT NULL) via the
-- fallback injected by resolverIdentidad, so a blank/missing negocio resolves to
-- the operator's own gym brand — never a baked-in FORGE.
alter table public.perfil alter column negocio drop default;
