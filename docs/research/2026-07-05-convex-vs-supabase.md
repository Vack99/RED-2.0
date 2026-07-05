# Convex migration evaluation — verdict: stay on Supabase (2026-07-05)

Deep-research run (103 agents, 21 sources, 25 claims adversarially verified: 22 confirmed 3-0,
3 refuted/excluded). Trigger: Supabase free-tier gates hit pre-launch (preview branching Pro-only;
2/hr default mailer). Full context: the #28 cutover session.

## Recommendation

**Do not migrate RED-2.0 to Convex.** Stay on Supabase; pay Pro ($25/mo) only when an
upgrade trigger fires (second paying gym, public member self-registration, or manual-backup
fatigue). For future **greenfield** projects with lighter isolation needs, Convex's free
previews and pay-as-you-go Starter plan are genuinely attractive — remember it there.

## The four load-bearing findings (all verified 3-0)

1. **Convex would have avoided today's paywall.** Preview deployments are included on
   Convex Free/Starter since Dec 2025 (5-day retention; per-branch isolated backend, empty
   DB seeded from fixtures). Supabase hosted branching stays Pro-only + $0.01344/branch-hr
   (compute credits don't cover it). — docs.convex.dev/production/hosting/preview-deployments,
   supabase.com/docs/guides/platform/manage-your-usage/branching

2. **But Convex has no database-native RLS — by design.** Official position (CTO-authored):
   authorization belongs in server functions; data-layer rules are a fallback whose violation
   "should indicate that there is a bug". The closest analogue (convex-helpers
   `wrapDatabaseReader/Writer`) is **opt-in per function and allow-by-default** — a function
   built on the raw builders bypasses rules entirely; dashboard edits and `npx convex import`
   bypass triggers (documented + reproduced in the wild, convex-backend#114 aggregate drift).
   That is the inverse of this platform's deliberately chosen posture (ADR-0001/0008/0013:
   default-deny RLS enforced regardless of caller). For money + PII multi-tenant data,
   isolation would rest on developer discipline + lint rules instead of engine guarantees.
   — stack.convex.dev/row-level-security, stack.convex.dev/authorization

3. **Migration is a from-scratch rewrite of exactly our load-bearing layer.** Convex's
   official Postgres migration guide covers data import only — silent on transactions,
   unique constraints, per-tenant sequences/counters (folios!), SQL RPCs, and RLS policies.
   No native uniqueness constraints or stored procedures out of the box.
   — stack.convex.dev/migrate-data-postgres-to-convex

4. **The price delta is ~zero at our scale.** Both first real paid tiers are $25/mo
   (Convex per developer, Supabase per org). Convex Starter softens the *pricing* cliff
   (pay-as-you-go), not the feature cliff. The mailer pain is fixed by custom SMTP on
   either platform — that's #27's Resend runbook, not a plan question.

## Caveats recorded by the run

Pricing verified live 2026-07-05 but both vendors churn plans; Convex's preview
de-paywalling is ~7 months old. Security-posture sources are vendor-authored (accurate for
mechanism, framing is ours). Convex Free/Starter exact resource caps and the Convex-side
email story failed verification / were not answered — irrelevant to this verdict, relevant
if evaluating Convex for a greenfield project. Convex previews start EMPTY (fixture-seeded);
for rehearsing destructive migrations against production-shaped data, Supabase branches are
actually the closer fit.

## Open questions (only if revisiting for future projects)

- Convex Auth maturity + transactional-email cost vs Supabase-with-Resend.
- Billing-grade per-tenant counters in Convex given the trigger bypass profile.
- Whether the referenced MIT Convex RLS Component ships and flips the enforcement default.
