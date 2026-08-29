-- RED brought its own domain (2026-08-27). Map it as a SECOND `app='client'` host for gym `red`.
--
-- THE SERVING HOST IS `www.redfunctionaltraining.com`, not the apex. Verified live:
--   curl -o /dev/null -w '%{http_code} %{redirect_url}' https://redfunctionaltraining.com/
--     -> 308 https://www.redfunctionaltraining.com/
-- Vercel issues that 308 at the edge, so `apps/client/src/proxy.ts` NEVER receives
-- `Host: redfunctionaltraining.com`. An apex row would therefore never be consulted, and it
-- would add a second `limit 1` candidate to the three oldest-row-wins host pickers. Do not add
-- one unless Vercel's primary domain is ever flipped to the apex — that flip must carry the row.
--
-- ADDITIVE ONLY. `red.ibookit.lat` KEEPS its row, permanently. Unclaimed invites carry
-- never-expiring claim codes on that host, and it lives in members' bookmarks and chat history.
-- Deleting the row does NOT redirect those links — it degrades them to `<h1>Sitio no
-- reconocido</h1>`. A platform-subdomain host is never un-mapped; if one must ever be retired,
-- convert it to a Vercel 308 (which preserves path and query) FIRST, then delete the row.
--
-- `created_at` is deliberately left at now(). The invite-mail host picker
-- (`construirUrlInvitacion`, packages/data/src/server/invitaciones.ts) orders by `created_at`
-- ascending, so invite emails keep minting links on `red.ibookit.lat` while this
-- hours-old domain is still unrated by every web filter. Do NOT backdate it — that would
-- encode a lie in a column three surfaces tie-break on. The real fix is a canonical-host
-- column; see the follow-up in docs/runbooks/red-custom-domain-cutover.md §F1.
--
-- NOTE: this does NOT hold the other three link rails. Password reset, signup-confirm and the
-- magic link all derive their origin from the LIVE REQUEST HOST
-- (entrar/actions.ts, registro/actions.ts, activar/actions.ts), so they follow whichever door
-- the member used. That is why the Supabase Auth redirect allow-list entry
-- `https://www.redfunctionaltraining.com/**` MUST already be in place before this row lands.
--
-- Join on `gym.slug`, never a hardcoded prod UUID (ADR-0013 §5): a UUID either FK-aborts the
-- whole migration replay on a scratch project or silently inserts zero rows there.
--
-- 2026-08-28: canonical-host precedence shipped in 20260828130000_gym_domain_es_principal.sql
-- (es_principal); this row is now RED's principal client host.
insert into public.gym_domain (gym_id, hostname, app)
select g.id, v.hostname, v.app
from (values ('red', 'www.redfunctionaltraining.com', 'client')) as v(slug, hostname, app)
join public.gym g on g.slug = v.slug
on conflict (hostname) do nothing;
