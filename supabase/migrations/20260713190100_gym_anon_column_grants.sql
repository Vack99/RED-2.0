-- Issue #93 (spec 2026-07-13 §1.6, owner ruling D3) — narrow the anon surface of `gym`
-- with COLUMN grants. `gym_anon_select USING (true)` stays (the pre-auth host→brand
-- lookup genuinely needs an anon read; ADR-0012/ADR-0013 §3) — but the table-wide anon
-- SELECT grant handed out every column, including `legal_name` and `owner_user_id`, to
-- anyone holding the publishable key. Grants compose with RLS (both must pass), so
-- revoking the table grant and granting only the brand-seam columns narrows anon without
-- touching the policy or the `authenticated` surface.
--
-- The granted list = every column the pre-auth seam reads today (resolveTenant:
-- id/slug/brand_module_id; marketing: brand_name/timezone/about_*) plus token_overrides,
-- whose DB read is the named next step of the branding seam. `gym.id` stays enumerable
-- deliberately — the brand seam needs it, and post-#92 it no longer reaches the export.

revoke select on table public.gym from anon;
grant select (id, slug, brand_name, timezone, brand_module_id, token_overrides,
              about_story, about_pull_quote, about_tagline)
  on public.gym to anon;
