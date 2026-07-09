-- ibookit.lat host-map cutover (#72 §D-cutover; ADR-0012 §5 host→inquilino seam).
-- Adds the private per-gym subdomains (client + admin, incl. the demo twins the S9 walk uses)
-- and retires the three Vercel provisional rows so S2's invite URL builder (oldest-row-wins,
-- ordered by created_at) resolves the ibookit hosts — with the old rows present, every invite
-- would keep carrying *.vercel.app links.
--
-- DELIBERATELY UNMAPPED (do not add rows for these):
--   app.ibookit.lat — the PLATFORM_CLIENT_FALLBACK_HOST: ?gym=<slug> resolves ONLY on an
--   unmapped host (host-wins precedence, hitl-28); mapping it would break every fallback invite.
-- localhost rows stay (dev). Idempotent: inserts guard on the hostname unique constraint;
-- deletes are by exact hostname.

insert into public.gym_domain (gym_id, hostname, app)
select g.id, v.hostname, v.app
from (values
  ('red',        'red.ibookit.lat',              'client'),
  ('forge',      'forge.ibookit.lat',            'client'),
  ('red-demo',   'red-demo.ibookit.lat',         'client'),
  ('forge-demo', 'forge-demo.ibookit.lat',       'client'),
  ('red',        'red-admin.ibookit.lat',        'admin'),
  ('forge',      'forge-admin.ibookit.lat',      'admin'),
  ('red-demo',   'red-demo-admin.ibookit.lat',   'admin'),
  ('forge-demo', 'forge-demo-admin.ibookit.lat', 'admin')
) as v(slug, hostname, app)
join public.gym g on g.slug = v.slug
on conflict (hostname) do nothing;

delete from public.gym_domain
where hostname in (
  'red-2-0-admin.vercel.app',
  'forge-red-2-0-client.vercel.app',
  'red-2-0-client.vercel.app'
);
