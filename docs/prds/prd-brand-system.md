> Tracked in: https://github.com/Vack99/RED-2.0/issues/29

# PRD — Phase 4: Brand system (full brand modules, base + row-override merge, admin de-brand)

## Problem Statement

The platform serves many gym clients from one deployment per app, but today the brand layer is a Phase-2 tracer, not a system. The admin shell still hardcodes Forge in four user-visible places (title, toaster, two receipt/home lockups, the login animation), so a RED gym's staff tool would wear Forge's identity. The client app has no reduced-motion coverage at all and its Skeleton placeholders reference a keyframe that only exists in the admin app's stylesheet, so loading states render frozen. Most importantly, the thousands-scale mechanism ADR-0012 rests on — **brand is CODE, per-gym personalization is DATA** — has no working data path: there is no neutral `base` module, no token-override schema, and no merge, so a gym without bespoke code cannot render at all, and the `token_overrides` jsonb Phase 3 creates would flow into a `dangerouslySetInnerHTML` sink unvalidated.

## Solution

Build the full `@gym/brand` system as a depth pass over the existing seam, without touching Phase 3's tenancy surface:

- Brand tokens become **structured objects** rendered by **one serializer**; each module (base, forge, red) carries tokens + logo + copy + an optional bespoke login animation.
- A **zod token-override schema** (closed key-enum of the ~28 contract vars, independent `light`/`dark` maps, charset-whitelisted values) guards the `<style>` sink; a pure **module ⊕ overrides** merge serves personalized CSS, falling back to the intact module baseline on any invalid payload.
- A neutral **`base` module** joins the census and becomes `DEFAULT_BRAND`, so an unknown host wears neutral chrome instead of Forge's, and a gym with zero bespoke code renders from base + row data.
- The **admin shell de-brands**: title/description and the receipt "negocio" fallbacks come from module copy, the theme colors come from module tokens, the lockup sites render the resolved module's logo, the Forge login sequence is extracted into a brand animation module, the toaster becomes a neutral `@gym/ui` component, and the favicon becomes a dynamic per-brand icon route.
- **Product motion** (the `forge-*` keyframes, including the Skeleton's `forge-flash`) moves to a shared `@gym/ui` motion sheet imported by both apps, which also carries the `prefers-reduced-motion` block (extended to zero animation delays) — closing the client app's reduced-motion gap and repairing the Skeleton with zero duplication.

Either app then renders fully in either brand by host, with no FOUC, reduced motion respected, and onboarding a generic gym remains a config act, never a deploy.

## User Stories

1. As a RED gym operator, I want the admin app to render fully in RED when served on a RED host, so that my staff tool wears my brand, not Forge's.
2. As the Forge operator, I want the admin shell's title, toaster, receipt lockups, and login animation to come from the resolved brand module, so that my app keeps its identity while the shell stops hardcoding it.
3. As a future gym with no bespoke code, I want to render from the neutral `base` module plus my gym-row data, so that onboarding me is a config act (row + domain), never a deploy.
4. As a gym owner, I want my palette personalization stored as data on my gym row, so that a color tweak never requires a code change or release.
5. As the platform developer, I want token overrides validated by a closed key-enum zod schema, so that only the ~28 contract variables are overridable and unknown keys are rejected.
6. As the platform developer, I want light and dark overridable independently in the override shape, so that a gym can personalize one scheme without ambiguity about which section a value lands in.
7. As a security reviewer, I want a test proving a hostile override value (e.g. containing `</style>`) is rejected on the exact path that feeds `dangerouslySetInnerHTML`, so that the injection surface is provably guarded.
8. As the platform developer, I want an invalid override payload to fall back to the module's intact baseline, so that a bad row half-brands nothing and the page always renders safely.
9. As the platform developer, I want ONE serializer producing every brand's CSS from structured tokens, so that the token pipeline has a single home now that its second producer (the merge) exists.
10. As the platform developer, I want the merge to be a pure function receiving overrides as an argument, so that `@gym/brand` stays presentation-only and the frozen `brand ✗→ data/domain` boundary holds.
11. As a visitor on an unknown host, I want neutral `base` chrome instead of Forge's, so that no gym's brand bleeds onto unclaimed hosts.
12. As a motion-sensitive user with OS reduced motion set, I want both apps to land every animation on its final frame immediately (durations AND delays zeroed), so that login heroes and entrances never animate at me and content is usable at once.
13. As a member on the client app, I want Skeleton placeholders to actually animate, so that loading states read as alive (the cross-package `forge-flash` dependency repaired).
14. As a member on the client app with reduced motion set, I want the Skeleton shimmer stilled, so that even loading states respect my preference.
15. As a RED member, I want the RED ignition login animation preserved exactly as shipped, so that the bespoke brand experience survives the refactor.
16. As a Forge staff member, I want the Forge login sequence (bars wipe, wordmark rise, shine, form entrance) preserved as a brand animation module, so that extraction changes ownership, not the experience.
17. As a staff member on a base-brand gym, I want a login page that renders cleanly without a bespoke animation, so that the optional-animation contract holds for modules that omit one.
18. As the platform developer, I want the registry census test updated to exactly `base`, `forge`, `red`, so that the deliberate tripwire keeps guarding against silent brand additions.
19. As a gym with `brand_name` on its row, I want that name to override the module's copy name in titles and receipts when the data path is wired, so that per-gym naming is data, not code.
20. As the platform developer, I want module copy limited to a closed `{ name, description }` record, so that brand voice stays a small enumerable code artifact and everything per-gym stays row data.
21. As the future RED-admin operator, I want local-host proof that the admin app renders RED end-to-end (chrome, logo, login), so that live go-live after Phase 3's swap is a config-and-verify step, not new engineering.
22. As a browser user, I want the admin favicon to reflect the resolved brand via a dynamic icon route, so that a RED gym's tab doesn't show the Forge mark.
23. As the operator of the live Forge deployment, I want the de-brand to be visually reviewed by a human before cutover, so that a behavior-visible shell change ships with sign-off, not silently.
24. As the Phase-3 track, I want Phase 4 to depend only on the pinned `x-brand` header contract and never edit resolver/host-map/proxy files, so that both initiatives execute in parallel without collision.
25. As the platform developer, I want the per-brand JS bundle delta re-recorded after animation modules land, so that riskiest assumption #3 (runtime brand swap at acceptable bundle cost) stays falsifiable.
26. As the Phase-4 executor, I want the base + row-override exit demo driven by a fixture override object through the REAL merge and render path, so that the phase completes AFK with no cross-initiative blocker.
27. As a maintainer, I want the whole system to keep every shield green (dependency boundary, guards, catalog, server-only, lint+typecheck+test per commit), so that the depth pass adds capability without eroding the machine-checked structure.

## Implementation Decisions

All ten open decisions from the Phase-4 kickoff grill are locked below. Nothing here contradicts ADR-0012 — every lock refines its Forward-looking design, so **no ADR-0015 is minted**; a short "Amended: (Phase 4)" pass lands on ADR-0012 in the final code slice, after Phase 3's edits to that file have settled.

**(a) Token-override schema shape.** A closed key-enum of the brand contract's ~28 CSS variable names (the schema is the machine-checked mirror of the *contrato de marca* — unknown keys are typos or attacks, both rejected). Top level is scheme-keyed: `{ light?: partial map, dark?: partial map }`, so light and dark are overridable independently and a value's destination section is never ambiguous. Values are validated against a conservative charset whitelist (letters, digits, `# % ( ) , . / space -`; length-capped; no `: ; < > { } " ' \`) — enough for every color syntax the contract uses while making `</style>` breakout, `url(...:...)`, and declaration injection unrepresentable. Validation failure rejects the WHOLE payload and renders the module baseline (fail-safe, never half-branded), with a dev-visible warning. The schema lives in `@gym/brand`, which takes `zod` from the workspace catalog as a regular dependency (boundary-legal; no cruiser edit).

**(b) Merge + serialization seam.** Brand tokens stop being pre-serialized strings: each module carries structured token objects (light + dark records keyed by contract name), and ONE exported serializer renders the `:root,.light { } .dark { }` block. The condition that inlined `tokensToCss` in Phase 2 (single caller) ends now — the merge is the second producer. Each module's baseline CSS is precomputed once at module load, so the zero-override path (thousands of generic gyms, and both current apps) costs nothing per request. A pure `brandCss(module, overrides)` entry point returns the precomputed baseline when overrides are empty and merges-then-serializes otherwise (per-request; no caching until measured). Both layouts switch from indexing a raw `.css` string to calling this entry point; override data arrives as an ARGUMENT fetched by the app — `@gym/brand` never fetches.

**(c) Copy code/data split.** A brand module gains a closed `copy: { name, description }` record — the brand-voice minimum that is genuinely code. `name` feeds the metadata title, the login wordmark, and the receipt/template "negocio" fallbacks (replacing hardcoded `'FORGE'` literals); `description` feeds metadata description. Per-gym `brand_name` (Phase 3 row data) overrides `copy.name` at render wherever the row-data path is wired; `tagline` has no consumer this phase and stays unwired (YAGNI). The base module ships neutral es-MX placeholder copy, flagged for the HITL voice decision.

**(d) prefers-reduced-motion expression.** The reduce block lives ONCE in the shared `@gym/ui` motion sheet (which must exist anyway for decision (h)) and reaches both apps through their single import of it — closing the client app's total gap with zero duplication. The block is extended with `animation-delay: 0s !important` so staggered sequences don't leave content invisible while delays elapse. "Respected" for a login hero means: **final frame, immediately** — content fully visible and the form usable at once, no motion. Imperative motion keeps consulting the existing `@gym/ui` JS seam. Observed in-slice via emulated reduced-motion driving both apps' login heroes; OS-level real-device verification is HITL.

**(e) Render-layer keyspace.** `BrandId` grows to `'forge' | 'red' | 'base'` and **`DEFAULT_BRAND` becomes `'base'`** — the one fallback knob both pinned contracts (header and column) defer to. An unknown or absent `x-brand` now renders neutral chrome instead of Forge's; every mapped host is unaffected. The registry census test updates to exactly three brands and the DEFAULT_BRAND assertions to `'base'` — the deliberate tripwire consciously updated, in the same slice that ships the base module (the default must never point at a module that doesn't exist yet).

**(f) Exit-demo path (∥ Phase 3).** The base + row-override exit demo drives a **fixture override object through the REAL merge path and the REAL layout render** — the only faked element is the data source, which is exactly the seam's design (overrides are an argument). Therefore **NO cross-initiative Blocked-by exists**; every Phase-4 slice is ordinary AFK work. Wiring the layout's override source to the live gym row is a one-line swap that belongs to the post-Phase-3 world and is noted in the HITL go-live step. Demo evidence: an unmapped host (e.g. `base.localhost`) renders the base module with fixture overrides visibly applied — screenshot/DOM proof, not a unit test alone.

**(g) Admin de-brand boundary.** IN scope beyond the four settled audit sites: the viewport theme-color hexes (derived from module tokens: canvas light/dark), the two `negocio ?? 'FORGE'` fallbacks (→ module `copy.name`), and the admin favicon (static Forge `icon.svg` replaced by a dynamic icon route reading `x-brand` — Next 16's icon routes become dynamic when they use request-time APIs, confirmed against the bundled docs; re-verify in-slice). OUT (product naming, not brand leakage): the `forge:cameFromApp` storage key, `forge-*` class/keyframe NAMES, the `@gym/ui/forge/*` subpath namespace at large, and any client-app favicon (none exists; a browser default is neutral).

**(h) Animation ownership.** Keyframes consumed by `@gym/ui` product components (`forge-enter`, `forge-flash`, `forge-pop`, `forge-spin`, `forge-rise`) are PRODUCT motion, not brand: they move out of the admin stylesheet into a shared `@gym/ui` motion sheet imported by both apps — one source, so a Skeleton rendered in the client app finally animates. Names are unchanged (no rename crusade). Brand-BESPOKE animation (the Forge login sequence, the RED ignition) lives in the brand module as a self-contained component carrying its own locally-scoped keyframes — the pattern RED already models; the extracted Forge sequence becomes self-contained the same way rather than leaning on globals.

**(i) RED-admin go-live.** Local-host-only proof during the parallel window: the shared host map already resolves `red.localhost` to RED for BOTH apps, so running the admin app on that host proves the de-branded shell end-to-end with zero map edits (the map is Phase-3-owned and read-only for this phase). Live go-live is a post-Phase-3-swap HITL step — the human inserts the `gym_domain` row and provisions the hostname. Not a second cross-initiative edge.

**(j) Toaster / `@gym/ui/forge/*` namespace.** Narrow move only: the toaster relocates to a neutral `@gym/ui` subpath exporting a neutral `Toaster`, and the admin layout imports that; any brand copy found inside it during extraction sources from module copy per (c). The rest of the `forge/*` namespace is product naming and stays put — no repo-wide rename.

**Suggested slice decomposition (guidance — /to-issues owns the final cut):**

- **S0 — Structured tokens + the one serializer.** Forge/red token strings become structured objects; serializer TDD'd; rendered CSS equivalent to today's; registry carries tokens + precomputed baseline. (sonnet-5 bulk restructuring under review; TDD on the serializer.)
- **S1 — Product motion sheet + reduced-motion coverage.** `forge-*` keyframes move to `@gym/ui`; both apps import the sheet; reduce block (with delay-zeroing) covers both apps; Skeleton animates in the client. (/verify: Skeleton in-browser + emulated reduced motion.)
- **S2 — Login animation modules.** Forge sequence extracted into the module as a self-contained animation (module-optional contract exercised); login page renders the resolved module's animation with a clean no-animation fallback; both heroes verified under reduced motion. (frontend-design + taste≥7 model; /verify.)
- **S3 — Admin shell de-brand + local RED-admin proof + bundle delta.** Title/description/negocio fallbacks from copy; themeColor from tokens; lockup sites render the resolved logo; Toaster move; dynamic icon route; RED-admin proven on `red.localhost`; per-brand JS bundle delta RE-RECORDED (first slice after animation modules land). (frontend-design + taste≥7; /verify both hosts, no FOUC.)
- **S4 — LAST: zod override schema + ⊕-merge + base module + keyspace flip + exit demo.** Schema TDD'd incl. the hostile `</style>` rejection on the sink path (typescript-advanced-types territory); merge TDD'd; base module (neutral tokens/logo/copy); `DEFAULT_BRAND = 'base'`; census tripwire updated; fixture demo screenshot through the real path; ADR-0012 "Amended: (Phase 4)" pass.
- **S5 — HITL terminal slice** (visual fidelity vs the RED mock, admin-change approval, OS-level reduced motion, base copy voice, live RED-admin go-live post-swap).

Every slice: /keep-it-lean, superpowers:writing-plans, superpowers:using-git-worktrees (parallel with Phase 3), superpowers:requesting-code-review + verification-before-completion; TDD on the pure targets (serializer, schema, merge, census); bulk mechanical work on sonnet-5, taste-bearing work on fable-5/opus-4.8.

### Design principles

This work favors YAGNI and KISS: ship the minimum diff that satisfies the acceptance criteria and nothing more. Reject any interface, generic, dependency injection, or extracted 'shared' / base module with a single caller in this diff — DRY and SOLID do not justify structure the criteria do not require, and premature abstraction fails YAGNI. Prefer a little duplication over the wrong abstraction. Any deliberate exception must name its concrete present need; unnamed single-caller abstraction is a failure.

**Named present-need exceptions (Phase 4 — these structures are REQUIRED by the acceptance criteria and PASS the gate; reject structure BEYOND them):** (1) the neutral `base` brand module — its consumer is the phase's own exit criterion (a gym with no dedicated code module renders from base + row data); (2) the zod token-override schema — it guards an existing dangerouslySetInnerHTML sink in BOTH apps' layouts, a real injection surface today; (3) the module-baseline ⊕ row-overrides merge/serializer — its legitimate second producer exists in-phase (ADR-0012 recorded that tokensToCss was inlined in Phase 2 precisely because it had one caller; that condition ends now); (4) animation modules — two concrete in-phase members (the Forge login sequence extracted from login-form.tsx; the extant RED ignition) plus the cross-package forge-flash Skeleton dependency to repair. Anything beyond this list — a third brand, brand presets, a theming DSL, an override editor or authoring surface, a config package — fails the gate.

## Testing Decisions

Good tests here exercise external behavior through the public surface, never implementation details — the same discipline the existing brand tests model.

- **Serializer (TDD):** structured tokens in, the exact `:root,.light`/`.dark` block out; equivalence with today's rendered CSS for forge/red proven at refactor time.
- **Override schema (TDD):** accepts partial light-only/dark-only maps of known keys; rejects unknown keys, oversized values, and hostile payloads — including a value containing `</style>` — in a test that exercises the exact path feeding `dangerouslySetInnerHTML` (acceptance-critical, not just schema-unit).
- **Merge (TDD):** module ⊕ overrides precedence, empty-overrides fast path returns the precomputed baseline identity, invalid payload → intact baseline.
- **Registry census:** the tripwire updates to exactly `base`/`forge`/`red` with `DEFAULT_BRAND = 'base'` assertions — prior art: the existing registry describe block.
- **Observable acceptance (not unit-testable):** /verify drives both apps on forge/red hosts (no FOUC), the Skeleton animating in the client, both login heroes under emulated reduced motion, and the base + fixture-override demo with screenshot/DOM evidence; the per-brand bundle delta is re-recorded and written down.
- All shields stay green per commit: lint (incl. dependency-cruiser boundary), typecheck, full test suite — the pre-commit hook enforces this.

## Out of Scope

- **ZERO database work** — no gym/gym_membership tables, no migrations, no RLS, no resolver async swap, no HOST_TO_BRAND retirement, no proxy edits. Phase 4 reads pinned column SHAPES; Phase 3 creates them. `resolve-brand-id.ts` and `host-map.ts` are read-only.
- The 12-screen RED client app (Phase 6); catalog/booking schema (Phases 5/6).
- Any third brand, speculative presets, theming DSL, or gym-facing override editor/authoring UI — the phase ships the merge MECHANISM; overrides arrive as row data.
- `dynamic()` per-brand code-splitting, Edge/multi-region work (Phase 7, audit-parked); per-gym env vars; BYO-domain queue; parametrizing es-MX/MXN/+52.
- Repo-wide `forge` renames (classes, `@gym/ui/forge/*` subpaths, storage keys) beyond the sites the grill ruled IN.
- Payments, notification channels, observability (Phases 6/7).

## Further Notes

**Coordination (∥ Phase 3, label-isolated):** initiative label `platform-phase4-brand-2026-07` (Phase 3 uses `platform-phase3-rls-2026-07`; never shared). Phase 4 OWNS `brand-id.ts`, `registry.ts`, the new base module, the override merge, and BOTH apps' layouts (rebase hotspot — Phase 3 never edits layouts). Phase 3 OWNS `resolve-brand-id.ts`, `host-map.ts`, both proxies, and the HOST_TO_BRAND scrub. Split file `brand.test.ts`/`index.ts`: Phase 4 owns the registry describe block + new exports; Phase 3 owns the HOST_TO_BRAND block/export. The `brand ✗→ data/domain` cruiser edge is frozen for both.

**Pinned header contract (quote wherever slices need it):** the proxy stamps `x-gym` = the resolved tenant id/slug (NEW, Phase 3 adds it; presentation/UX only, NEVER authz — ADR-0008 hinge) and `x-brand` = a registry key (today from the static host-map; = the gym row's `brand_module_id` once Phase 3's DB lookup lands), ALWAYS validated in the layout via `Object.hasOwn` with `DEFAULT_BRAND` fallback — `DEFAULT_BRAND`'s value is Phase 4's grill (e) call. Phase 3 stamps; Phase 4's layouts read both and never re-resolve.

**Gym-row interface (Phase 3 defined, Phase 4 consumes, read-only):** `brand_module_id text NOT NULL` (opaque registry key, no FK/CHECK/default — render-side validation is Phase 4's) and `token_overrides jsonb NOT NULL DEFAULT '{}'::jsonb` (value shape is Phase 4's schema above); forge/red rows seeded by Phase 3's S0 (issue #18). Because grill (f) locked the fixture demo, #18 is context, not a blocker.

**HITL (terminal slice; orchestrator must not attempt):** RED design-mock fidelity sign-off; approval of the visible admin-shell change; live RED-admin go-live post-swap (gym_domain row + Vercel host + deploy-verify mirroring the Phase-2 pattern); OS-level reduced-motion on a real device; the base module's neutral copy voice.
