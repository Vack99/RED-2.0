Resume the Forge → Supabase migration. We're mid-cycle on branch
`feat/supabase-infra-perfil` (local-only repo, no remote). Slices #1–#5 of 8 are
shipped and committed; #6–#8 remain. Plus a deferred Goal B (the `sector-map` skill).

## Read first, in this order
1. `docs/superpowers/handoffs/2026-05-29-forge-supabase-midcycle.md` — the full
   handoff: current state, the remaining queue with where to wire each, the
   operational gotchas learned last cycle, and Goal B. This is the source of truth.
2. `docs/issues/README.md` — live queue status (#1–#5 ✅; #6, #7, #8 open) + the
   dependency graph.
3. The issue file for the slice you're about to build (`docs/issues/0006-…md`, etc.).
4. Skim `docs/adr/0001-0004` and `src/domain/rules.ts` if you need the domain rules.

## Confirm the environment is live
Check the Supabase MCP responds (e.g. `list_tables` on project `hjppxawglmukfvsgmcog`)
and that `.env.local` + the auth user (`forge-1.0@outlook.com`) exist per the handoff.
If the MCP isn't connected, STOP and tell me.

## Build the remaining slices in order — #6 retención → #7 dashboard → #8 cleanup
One slice at a time, following the exact pattern from #1–#5:
- Schema via MCP `apply_migration` (RLS on every table, owner-scoped to
  `(select auth.uid())`), then MIRROR the SQL to
  `supabase/migrations/<version>_<name>.sql` (version from `list_migrations`);
  regenerate types into `src/lib/supabase/database.types.ts`; run
  `get_advisors(security)`. Seed operator-scoped data via `execute_sql` (not a migration).
- `server-only` DAL (returns DTOs, calls `src/domain` rules — never reimplement them)
  → thin Server Action (re-auth `getClaims`, Zod-validate, delegate,
  `revalidateTag('clientes','max')`) → wire the screen off real data.
- For #7: TDD the new pure `calcularResumenMes` domain rule like
  `src/lib/data/derive.test.ts` / `src/domain/rules.test.ts`.
- Do #8 LAST (after #6 + #7 stop importing `HOY`/`store.ts`); enable the deferred
  dependency-cruiser `no-orphans` rule.

## Verify + commit each slice
- Gates MUST be green before committing: `pnpm lint` (eslint + dependency-cruiser)
  · `pnpm test` · `pnpm build`. Plus a headless RLS check on any new table
  (`begin; set local role anon; select count(*) ...; rollback;` → expect 0).
- Commit per slice using the repo-local git identity already set
  (`vack99 <d3bigwlf@gmail.com>`); end messages with the Co-Authored-By trailer.
- Update the matching `docs/issues/000N` status line + the `docs/issues/README.md`
  progress block (mirrors how #1–#5 are tracked).

## Heed the gotchas (full list in the handoff)
- VERIFY Next/Supabase APIs against the BUNDLED docs (`node_modules/next/dist/docs`)
  + installed package types before writing — this is a pinned/vendored Next 16.
- `pnpm add <pkgs> --prefer-offline` (bare `pnpm add` 404s on `@next/swc`).
- Never commit `.mcp.json` (keep it untracked). Chihuahua-local dates via
  `src/lib/fecha.ts`. `forgeToast` tones are success|warning|info (no "error").

## After #8
Pause for my in-browser verification (login, sale+stack, attendance, roster/ficha,
dashboard) before we consider merging `feat/supabase-infra-perfil` / adding a remote.

## Goal B — the `sector-map` skill (don't forget)
The framework is now PROVEN end-to-end (5 real slices, the one enforced boundary never
violated), so this is unblocked. Once #6–#8 ship (or in a parallel session), extract the
reusable `sector-map` skill with `write-a-skill` per spec Appendix A
(`docs/superpowers/specs/2026-05-29-forge-sector-architecture-design.md`); the confirmed
framework learnings + the local-issue-store adaptation are in the handoff's GOAL B section.
Ask me whether to do it in this session or a separate one.

Check for skills that apply (to-goal / test-driven-development / write-a-skill) and use
them. If you'd prefer to run #6–#8 as one autonomous sweep, propose generating a
`/to-goal` orchestrator prompt for the local issue store instead of building each here.
