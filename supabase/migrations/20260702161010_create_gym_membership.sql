-- gym_membership + the ADR-0013 RLS mechanism, slice #19: the membership map every gym-scoped policy
-- resolves gym + role from (user_id, gym_id → role), the three initplan-cached SECURITY DEFINER
-- helpers re-minted against it (the tenancy spec's superseded `staff`-table bodies are RE-EXPRESSED,
-- never copied — ADR-0013 §1), gym_membership's own policies (self-read + staff-read-own-gym; NO direct
-- client writes — writes ride SECURITY DEFINER RPCs only, §4), and the live owner backfill for the lone
-- Forge operator.
--
-- Expand-only, fully idempotent (create-if-not-exists / or-replace / drop-policy-if-exists /
-- on-conflict backfill) so it is safe on a fresh preview branch AND out-of-order on the live project
-- (Forge stays green). RLS is enabled explicitly (ADR-0001) even though the rls_auto_enable trigger
-- also fires. The backfill joins auth.users BY EMAIL, so it is a no-op where auth.users is empty
-- (a preview branch — production auth rows do not carry over) and inserts exactly one owner row on
-- live: zero hardcoded prod UUIDs, and no FK violation on a branch.

-- ── gym_membership: (user_id, gym_id) → role. The one map ADR-0013 keys every policy on ──────
create table if not exists public.gym_membership (
  user_id    uuid not null references auth.users (id) on delete cascade,
  gym_id     uuid not null references public.gym (id) on delete cascade,
  role       text not null check (role in ('owner', 'operator', 'member')),
  created_at timestamptz not null default now(),
  primary key (user_id, gym_id)
);
alter table public.gym_membership enable row level security;

-- Index every gym_id (ADR-0013 §2/§5). The PK (user_id, gym_id) already covers the helpers'
-- (auth.uid(), gym_id) lookup; this covers the staff-read policy's scan by gym_id alone.
create index if not exists gym_membership_gym_id_idx on public.gym_membership (gym_id);

-- ── The three membership-keyed helpers (ADR-0013 §1), re-minted against gym_membership ───────
-- language sql · stable · security definer · search_path='' — definer is REQUIRED, not incidental:
-- gym_membership itself carries RLS, so an invoker-rights helper would recurse into gym_membership's
-- own policies; definer reads membership with RLS bypassed, breaking the recursion. auth.uid() is
-- wrapped in a sub-select (the ADR-0001 initplan idiom) and fully schema-qualified for search_path=''.
create or replace function public.is_member_of(p_gym uuid)
  returns boolean language sql stable security definer set search_path = ''
  as $$
    select exists (
      select 1 from public.gym_membership
      where user_id = (select auth.uid()) and gym_id = p_gym
    );
  $$;

create or replace function public.is_staff_of(p_gym uuid)
  returns boolean language sql stable security definer set search_path = ''
  as $$
    select exists (
      select 1 from public.gym_membership
      where user_id = (select auth.uid()) and gym_id = p_gym
        and role in ('owner', 'operator')
    );
  $$;

create or replace function public.has_role(p_gym uuid, p_role text)
  returns boolean language sql stable security definer set search_path = ''
  as $$
    select exists (
      select 1 from public.gym_membership
      where user_id = (select auth.uid()) and gym_id = p_gym
        and role = p_role
    );
  $$;

-- EXECUTE lockdown (ADR-0013 §1; mirrors 20260531210445_revoke_rls_auto_enable_execute): a definer
-- primitive must never be client-callable beyond its intended caller. Revoke the `public` default +
-- `anon`; grant only `authenticated` (every policy that invokes a helper runs as an authenticated
-- session).
revoke execute on function public.is_member_of(uuid) from public, anon;
revoke execute on function public.is_staff_of(uuid)  from public, anon;
revoke execute on function public.has_role(uuid, text) from public, anon;
grant execute on function public.is_member_of(uuid) to authenticated;
grant execute on function public.is_staff_of(uuid)  to authenticated;
grant execute on function public.has_role(uuid, text) to authenticated;

-- ── gym_membership's own policies (ADR-0013 §4): self-read + staff-read-own-gym, NO client writes ──
-- Two permissive SELECT policies OR together: a caller sees a row if they own it OR they are staff of
-- its gym. is_staff_of is invoked via the (select …) initplan idiom (once per statement, §2). No
-- INSERT/UPDATE/DELETE policy exists → default-deny denies every direct client write; membership rows
-- are written only inside SECURITY DEFINER RPCs (registration/claim, ADR-0009).
drop policy if exists "gym_membership_self_select" on public.gym_membership;
create policy "gym_membership_self_select" on public.gym_membership
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "gym_membership_staff_select" on public.gym_membership;
create policy "gym_membership_staff_select" on public.gym_membership
  for select to authenticated using ((select public.is_staff_of(gym_id)));

-- ── Backfill: the lone live operator's owner row for the Forge gym ───────────────────────────
-- Joined to auth.users by email, so it is a no-op where auth.users is empty (preview branch) and
-- inserts exactly one owner row on live. Idempotent via the PK on-conflict.
insert into public.gym_membership (user_id, gym_id, role)
select u.id, g.id, 'owner'
from auth.users u
join public.gym g on g.slug = 'forge'
where u.email = 'forge-1.0@outlook.com'
on conflict (user_id, gym_id) do nothing;
