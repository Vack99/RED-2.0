> **Phase-2 kickoff prompt.** Paste the fenced block into a FRESH session on this repo (zero prior context). It runs the house pipeline (`grill-with-docs → to-prd → to-issues → to-goal`) to emit Phase-2's PRD + sliced issues + goal file, then STOPS for review. A later fresh session pastes the generated `docs/prompts/goal-multitenant-tracer.md` to execute the slices (as Phase 1 did). DRY against the docs — it points, it does not restate; only the two VERBATIM blocks are load-bearing text. Global promotion of the phase-local gate guard is deferred — decide after Phase 2 per the audit criterion.

```
PHASE 2 — "Multi-tenant tracer (de-risker)" of the RED-2.0 multi-gym platform. Fresh session, zero prior context. THIS session: run the house pipeline (grill-with-docs → to-prd → to-issues → to-goal) to emit 3 artifacts, then STOP for review. You are NOT implementing slices.

RECONCILIATION (the one thing to get right): Phase 2 adds a SKELETON apps/client (ONE trivial branded page) + a MINIMAL packages/brand (forge+red) + host→tenant→brand resolution in apps/client/proxy.ts, and proves 2 multi-tenant Vercel deploys resolving host→brand against the shared Supabase. The real 12-screen RED client app is Phase 6 — not here. admin stays Forge-only (no RED admin stub — that surface is Phase 4); the host→brand demo runs on apps/client, admin just re-deploys unchanged. Repo today = apps/admin + packages/{domain,format,data,ui} ONLY (no apps/client, no packages/brand). Confirm the tree with your own eyes.

READ FIRST (load-bearing; follow their own cross-links, don't expect me to duplicate them):
- docs/planning/2026-06-29-multi-gym-platform-roadmap.md — Phase-2 goal + exit criteria (row 2), the 3 riskiest assumptions, §5 guardrails. Honour these; do NOT restate them.
- docs/adr/0008-…gym-rls-brand-modules.md — host resolves brand/UX ONLY, never authz; brand = presentation-only; 2 deploys + shared DB. SETTLED — cite, don't re-mint.
- docs/adr/0011-…jit-packages-cross-package-boundary.md — JIT raw-TS via transpilePackages (no dist/), Tailwind v4 @source, Vercel per-app Root Directory, catalog-pinned deps; §6 brand✗→data/domain edge (Phase 2 adds it); §7 defers packages/config. Cite §; don't re-explain.
- docs/prds/prd-monorepo-conversion.md (Out-of-Scope = Phase-2 mandate), the tenancy spec + companion data-model doc (their tenant/RLS/schema model is DEFERRED to Phase 3), docs/superpowers/audits/2026-06-30-monorepo-conversion-audit.md (the green shields to keep + extend).
Next 16 has breaking changes vs your training data — read node_modules/next/dist/docs/ before specifying any Next code (proxy.ts, Node-only, is the middleware.ts successor; use getClaims not getSession). AGENTS.md carries the Husky-v9 caveat.

PIPELINE (run in order, quiz me at each checkpoint; exact skill names):
1. /grill-with-docs — ONE job: lock new terms into CONTEXT.md (tenant, host→tenant→brand, brand module/contract) + author exactly ONE ADR-0012 = dev/preview host→brand resolution strategy (candidates: env-default brand per Vercel project + ?brand=/cookie local override; assigned/custom subdomains; x-forwarded-host). Verify vs current Next 16 + Vercel docs. I provision the real Vercel hosts. Do NOT re-mint ADR-0008 decisions. Do NOT run writing-plans or brainstorming — the design is fixed, this is the one open decision.
2. /to-prd — publish Phase-2 PRD to the tracker + mirror to docs/prds/prd-multitenant-tracer.md. MUST embed the "### Design principles" block below VERBATIM.
3. /to-issues — thin vertical tracer-bullet slices with a Blocked-by DAG. Mark the Vercel deploy-verify slice `hitl` (I do provisioning); rest AFK `ready-for-agent`. Initiative label: platform-phase2-tracer-2026-07.
4. /to-goal — emit docs/prompts/goal-multitenant-tracer.md (K=3). Insert the Gate-1 guard below VERBATIM into the Gate 1 (Elegance) blockquote, AFTER "…minimum diff needed to satisfy the acceptance criteria." and BEFORE "Return `YES` or `NO`.". Do NOT edit the global gate-prompts.md — phase-local trial only.
Then STOP; summarize the 3 artifacts. Do not execute slices.

ANTI-CREEP DELTAS (the non-obvious traps — a thin tracer is assumed; these are the ones you'd still get wrong):
- ZERO schema / migration / RLS / cross-gym test. Leave current user_id=auth.uid() policies untouched. Tenant/identity model is Phase 3.
- host→brand map = a HARDCODED static registry object in packages/brand, consumed by both apps through that one seam. NOT a new packages/config (ADR-0011 §7); NOT hostname-parsing duplicated per app; view-only + safely deletable.
- brand type stays a thin TWO-implementation registry (forge+red): tokens + logo + at most ONE animation hook. No generic BrandModule<T>; the existing @gym/ui CSS-var token contract already IS the DIP seam — do not invent a second layer.
- Supabase proof = the @gym/data client FACTORY instantiates in apps/client with shared NEXT_PUBLIC_SUPABASE_*. Instantiation ONLY — no table/policy/anon-read.
- Add the brand✗→@gym/data + brand✗→@gym/domain edge to .dependency-cruiser.cjs (ADR-0011 §6).
- Keep ALL Phase-1 shields green (boundary, every tools/guards/, catalog, server-only; lint+typecheck+test+build exit 0 per commit) and update ARCHITECTURE.md + AGENTS.md + CONTEXT.md + README so tools/guards/docs.test.ts stays green once apps/client + packages/brand exist.
- Don't rename @gym/* ; don't add a build step/dist.

ACCEPTANCE — riskiest-assumption #3 "no FOUC" must be observable, not asserted (NOT in the docs — keep it concrete): brand tokens are SSR-inlined (no client-side flash), and the per-brand bundle-size delta is RECORDED in the slice. Otherwise "no FOUC" is unfalsifiable.

HITL PROVISIONING (I do these on the `hitl` slice; orchestrator must not): create the 2nd Vercel project (Root Directory=apps/client, auto-detected workspace install — don't override install cmd); set NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY per project (same shared Supabase); assign the hosts/domains ADR-0012 needs so forge-host and red-host each resolve their brand.

PER-SLICE SKILLS (the goal file wires these in): /turborepo-RED (load-bearing — every slice touching turbo.json / package.json / new-package wiring); /tdd ONLY on the pure proxy host→brand resolver (failing test first; rest is scaffolding); superpowers:using-git-worktrees + superpowers:verification-before-completion (latter CRITICAL — a live Vercel deploy + green build is the acceptance signal, not a claim). Do NOT invoke (cargo-cult for a zero-schema deploy+brand tracer): supabase-postgres-best-practices-RED, typescript-advanced-types-RED, sector-map, improve-codebase-architecture, to-map, setup-pre-commit, handoff.

------------------------------------------------------------------------------------------------
VERBATIM — "### Design principles" section for the PRD (paste as-is):

### Design principles

This phase is a thin tracer. YAGNI and KISS dominate every elegance call: ship the minimum diff that satisfies the acceptance criteria and nothing more. Reject any interface, generic, dependency injection, or extracted 'shared'/base Module that has a single caller in this phase — 'DRY' and 'SOLID' do not justify structure the acceptance criteria do not require, and premature abstraction fails YAGNI. Prefer a little duplication over the wrong abstraction. Any deliberate exception (an abstraction introduced with a concrete, present cross-slice need — e.g. an extraction whose second consumer exists in THIS phase) must be named explicitly in this section with its present-need justification; unnamed single-caller abstraction is a gate failure.

------------------------------------------------------------------------------------------------
VERBATIM — PHASE-LOCAL PRINCIPLE GUARD for the goal file's Gate 1 (Elegance) blockquote (do NOT edit the global gate-prompts.md):

This slice is a thin tracer: YAGNI and KISS dominate this call. Reject speculative abstraction — any new interface, generic, dependency injection point, indirection layer, or extracted 'shared'/base Module that has a SINGLE caller in this diff FAILS; 'DRY' and 'SOLID' are NOT a licence to add structure the acceptance criteria do not require. The deletion test decides: a one-caller wrapper whose removal makes complexity VANISH is a pass-through — cut it inline. Prefer a little duplication over the wrong abstraction.
------------------------------------------------------------------------------------------------
```

After paste: the session should confirm the current tree, run the four skills in order pausing at each checkpoint, then stop with a 3-artifact summary. Execution happens in a later session off the emitted goal file.
