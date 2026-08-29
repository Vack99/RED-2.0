-- `gym_domain.es_principal`: the DECLARED canonical host per (gym_id, app), for OUTBOUND link
-- minting only. RED brought its own domain on 2026-08-28 (20260827210000) and now maps two
-- `app='client'` hosts; the three link-minting selectors
-- (`construirUrlInvitacion` in packages/data/src/server/invitaciones.ts, `getAdminHosts` and
-- `getClientHost` in packages/data/src/server/gym.ts) pick the OLDEST non-localhost row, so
-- invite mail kept minting `red.ibookit.lat` links after the cutover. This column lets a gym
-- SAY which host it wants links built on instead of inferring it from insertion order.
--
-- INBOUND resolution is untouched: `gym_id_por_host` still answers host → gym for every mapped
-- hostname. `red.ibookit.lat` KEEPS its row permanently — never-expiring claim codes, bookmarks
-- and chat history live on it (see 20260827210000's header). This flag changes what we MINT,
-- never what we ACCEPT.
--
-- NO BACKFILL. The selectors read `es_principal desc, created_at asc`, so an unflagged
-- (gym_id, app) pair keeps today's exact oldest-wins behavior. Flagging every gym would mean
-- guessing a canonical host for gyms that never asked for one.
--
-- The flip is ONE atomic statement scoped to the whole (gym_id, app) pair, not a naked
-- `set es_principal = true` on the winner. It is safe HERE only because nothing in the pair is
-- flagged yet: the statement is re-runnable as written (the winner is already true, the losers
-- already false), and no row it touches ever collides. It is NOT a general re-flip recipe —
-- Postgres checks a unique index PER ROW, not per statement, so the same scoped shape aborts
-- with 23505 whenever some OTHER row in the pair is already flagged and the new winner happens
-- to be processed first (it depends on heap order). To move an already-declared principal, use
-- two statements — clear, then set:
--   update public.gym_domain set es_principal = false
--    where gym_id = (select id from public.gym where slug = '<slug>')
--      and app = 'client' and es_principal;
--   update public.gym_domain set es_principal = true
--    where gym_id = (select id from public.gym where slug = '<slug>')
--      and app = 'client' and hostname = '<new host>';
-- A DEFERRABLE constraint is not an option: a PARTIAL unique index cannot be a constraint.
--
-- ORDER OF OPERATIONS: this migration lands on live BEFORE the push that deploys the selector
-- change. The three selectors order on `es_principal` and DISCARD the PostgREST error
-- (`const { data } = await …`), so code-before-migration turns a 42703 into `data = null` for
-- EVERY gym, silently: no invite link is minted, the admin host map comes back `{}`, and the
-- aviso merge field stays unresolved. Same shape as the 2026-08-27 registrar_venta outage.
--
-- Join on `gym.slug`, never a hardcoded prod UUID (ADR-0013 §5).

alter table public.gym_domain add column es_principal boolean not null default false;

create unique index gym_domain_principal_uniq on public.gym_domain (gym_id, app) where es_principal;

update public.gym_domain d
   set es_principal = (d.hostname = 'www.redfunctionaltraining.com')
 where d.gym_id = (select id from public.gym where slug = 'red')
   and d.app = 'client';
