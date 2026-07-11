# PRD — Forge client branding & seed: calm-gold dark client, F-mark landing ignition, real program + content

> Tracker: GitHub issue (filed with `ready-for-agent`, `prd`). This file is the committed mirror.
> Origin: 2026-07-10 grilling session (destination, dark-leakage ruling, content rulings all locked there).

## Problem Statement

A prospect or member who visits the Forge client app today does not see Forge. They see the shared
member screens in a light, generic-feeling paint, a fallback tagline ("Reserva. Entrena. Avanza."),
an empty `/nosotros`, a `/contacto` with no channels, a landing page with no class schedule, and no
trace of the hand-crafted identity the Forge **admin** app already has (black canvas, gold `#f5c542`
accents, the animated F-mark ignition). RED's client got a full design pass in Phase 6; Forge's
client never got one. Forge — gym client #1 — currently has the weakest client-app presence of the
two brands, and the gym's real offering (weekly program, horarios, single-class price, phone,
Instagram) exists nowhere in the product.

## Solution

Apply the branding Forge already owns — the admin app's dark calm-gold look and the F-mark bar-build
ignition — to the client app, and seed the real gym's data so the screens have something true to
show. Concretely, from the user's perspective:

- The Forge client renders **dark-only** (like RED does), in Forge's existing dark tokens: black
  canvas, gold accents, calm animations — the admin app's dark look, no neon choreography.
- The landing hero plays the **animated F-mark bar-build ignition** (the same animation the auth
  screens already have, sans form) where RED's landing plays its neon ring.
- A Forge **tagline** replaces the generic fallback.
- RED's neon glow layers (currently scoped to `.dark`, i.e. to *any* dark brand) are re-scoped to
  the RED brand, so Forge dark never paints literal RED reds.
- The real forge gym is seeded with its true program (LUNES lower body → SÁBADO core), horarios
  (L–V 6:00/7:00 am + 6:00/7:00 pm, sáb 8:00 am, cupo 15), a 4th paquete (CLASE INDIVIDUAL $150),
  contact (phone + Instagram only), and agent-drafted marketing copy in Forge's
  functional-bootcamp voice (story, values, facilities, stats, FAQ) that the owner corrects after
  seeing it live.
- **forge-demo** mirrors everything (plus demo coaches) and gets a client host, so the whole result
  is walkable end-to-end before the real gym shows it.

## User Stories

### Prospect (visiting the Forge client site, signed out)

1. As a prospect, I want the Forge site to open dark with Forge's gold-on-black identity, so that the brand hits me the way the gym's own material does.
2. As a prospect, I want the landing hero to play the F-mark bar-build ignition, so that the site feels crafted, not templated.
3. As a prospect, I want a real Forge tagline under the logo, so that I'm not reading a generic placeholder.
4. As a prospect, I want today's real class schedule on the landing page, so that I can see when I could actually train.
5. As a prospect, I want `/precios` to show all four plans — 8 clases $799, 12 clases $1,199, Ilimitado $1,350, and CLASE INDIVIDUAL $150 — so that I can pick an entry point without asking.
6. As a prospect, I want `/nosotros` to tell Forge's story with values, stats, and facilities, so that I can judge the gym before visiting.
7. As a prospect, I want `/contacto` to offer exactly Forge's real channels — phone +52 614 370 4989 and Instagram @forge_trainingfunctional — so that I reach a channel the gym actually answers.
8. As a prospect, I want the FAQ to answer Forge-specific questions (program, blocks, single class), so that objections are handled before I write.
9. As a prospect, I want the contact form to keep working as it does for RED, so that the branding pass changes paint, not behavior.
10. As a prospect on a slow connection, I want the first byte already dark-branded (no light flash), so that the dark identity never flickers.

### Member (signed in, Forge)

11. As a Forge member, I want `/reservar` to show the real weekly program (LOWER/UPPER/FULL BODY, CORE) at the real hours, so that I book actual classes, not sandbox data.
12. As a Forge member, I want each session to carry cupo 15 with calm gold occupancy pips, so that I see availability without RED's ember glow.
13. As a Forge member, I want the booking-confirmed ring animation in Forge's gold, so that the celebratory moment matches the brand.
14. As a Forge member, I want my membresía plan bar in calm gold, so that plan progress reads in Forge's language.
15. As a Forge member, I want the auth screens' bar-build hero to sit on the dark canvas, so that login and landing feel like one product.
16. As a Forge member, I want class detail and roster screens dark with token-driven paint, so that no screen falls back to a light look mid-journey.

### RED member (regression)

17. As a RED member, I want my client experience byte-identical after this ships, so that Forge's pass costs RED nothing — neon layers, ring hero, copy all unchanged.

### Gym owner (Forge)

18. As the Forge owner, I want the seeded program to materialize sessions automatically week by week (existing materialization), so that I never hand-create the recurring schedule.
19. As the Forge owner, I want no coaches published on the real gym, so that the site doesn't name staff I haven't confirmed.
20. As the Forge owner, I want the drafted marketing copy clearly correctable from the admin/data side, so that I can fix voice and numbers after seeing them live.
21. As the Forge owner, I want the admin app untouched (light default + toggle), so that my desk workflow doesn't change.

### Platform operator

22. As the operator, I want forge-demo seeded identically plus demo coaches, so that I can judge every screen (including coach roster) without touching the real gym.
23. As the operator, I want a forge-demo client host mapped, so that the HITL walkthrough runs against a real deployed URL.
24. As the operator, I want the per-brand JS bundle delta re-recorded after the animation slot changes, so that the ADR-0012 observability rule stays honored.
25. As the operator, I want the seed to be an idempotent, self-asserting migration (red-demo pattern), so that a re-run or a scratch replay can't corrupt rows.
26. As the operator, I want the migration-bearing change to pass the scratch `test:denial` gate before merge, so that the RPC contract regression net stays intact.

### Future brand developer

27. As a future brand developer, I want dark-scheme styling and RED's bespoke glow layers separated by an explicit brand scope, so that the next dark brand starts calm instead of inheriting RED's neon.
28. As a future brand developer, I want the landing's animated-logo mechanism to be the widened `logo` slot (not a second contract member), so that brand modules stay one-slot-per-concern.
29. As a future brand developer, I want zero new TOKEN_KEYS from this pass, so that the 28-key contract and override schema stay stable.

## Implementation Decisions

**Brand module (`forge`):**
- `defaultScheme: "dark"` — the client layout already appends the `dark` class for dark-default brands; this is the entire scheme flip. The admin app does not consume `defaultScheme` (it uses its own theme provider, light default + toggle) and is untouched.
- Add `copy.tagline` (agent-drafted, Forge functional-bootcamp voice) — the landing already prefers a module tagline over the generic fallback.
- Widen the existing `logo` slot to accept an animate mode (per the Phase-6 animation cross-app record's recommendation; RED's animated ring migrates to the same mechanism if it isn't already there). Forge's animate mode is the bar-build ignition adapted from the existing login hero: zero-JS server component, locally-scoped keyframes, token-driven paint. No new brand-module contract member.
- No new TOKEN_KEYS, no override-schema change, no `@gym/brand` boundary change.

**RED glow re-scoping (client app):**
- The client root layout stamps `data-brand="<brand.id>"` on `<html>` alongside the existing scheme class — the one new seam.
- Every RED-literal glow layer currently scoped `.dark` (landing copy-reveal neon, reservar ember bar, membresía plan bar, clase roster pips/strobe) re-scopes to dark+RED. Forge dark renders those surfaces' calm token-driven base layers only.

**Seeding — real forge (data migration, red-demo pattern):**
- 4 `class_type` rows: LOWER BODY, UPPER BODY, FULL BODY, CORE.
- 21 recurring `schedule_template` rows, cupo 15, no coach links: L–V at 06:00, 07:00, 18:00, 19:00 (day's focus applies to all four: lunes/jueves LOWER, martes/viernes UPPER, miércoles FULL), sábado 08:00 CORE. 60-minute sessions. Sessions are NOT seeded — the existing week-materialization generates them at view time.
- 4th paquete: CLASE INDIVIDUAL, $150, 1 clase, 30-día vigencia (consistent with the existing three; owner-correctable).
- `gym_contact`: exactly two rows — phone +52 614 370 4989, Instagram https://www.instagram.com/forge_trainingfunctional?igsh=NmlvNmZ1bXd3ZWNu.
- `gym.about_story` / `about_pull_quote` / `about_tagline`, plus stats, about_values, facilities, FAQs: agent-drafted in Forge's voice; stats are plausible placeholders explicitly pending owner correction.
- No coach rows on real forge.

**Seeding — forge-demo:**
- Mirrors all of the above, plus 3 agent-drafted demo coaches (red-demo pattern).
- Its pre-existing sandbox templates are retired going forward (historical sessions/attendance untouched) so the demo shows the real program.
- New `gym_domain` row mapping a forge-demo client host; attaching the domain in Vercel is an owner HITL step.

**Sequencing:** paint (module + re-scoping + hero) and seed (migrations) are independent workstreams; either may land first, but the HITL walkthrough needs both.

## Testing Decisions

- Good tests here assert external behavior: what a brand module publishes, what CSS the serializer emits, what rows the seed leaves — never component internals or keyframe timings.
- Brand census vitest (existing) extends: forge's `defaultScheme`, tagline presence, widened logo slot shape, serialized CSS for forge dark. Prior art: the Phase-4 census tripwire tests in the brand package.
- Seed migrations self-assert (RAISE on missing gym row / wrong counts) and are idempotent — prior art: the red-demo seed migrations.
- The change is migration-bearing → the documented pre-merge gate applies: `pnpm test:denial` green against a scratch project. No new SQL suites: no RPC changes what it writes.
- Visual fidelity is a HITL walkthrough on the forge-demo client host (prior art: the Phase-6 #63 exit-gate runbook), checking: dark-only render, F-mark ignition, calm-gold surfaces on reservar/membresía/roster, zero RED bleed, real program bookable, RED host regression spot-check.
- Bundle delta per brand re-recorded after the animation-slot change (ADR-0012: observed, not asserted).

## Out of Scope

- A theme toggle in the client app (Forge client is dark-only, like RED).
- Promoting glow/ember colors into TOKEN_KEYS or the override schema.
- Coaches on the real forge gym; real photography or bitmap assets.
- Final marketing copy — drafts ship, the owner corrects post-ship.
- Any RED client change beyond the scoping mechanics (byte-identical paint), any admin-app change, any payment/Stripe work, member profile editing, waitlists (PRD #49 carve-outs carry over).
- New brands or a fourth brand-module census entry.

## Further Notes

- Hosts: real forge client is already mapped (forge.ibookit.lat + legacy Vercel host). forge-demo currently has admin-only mapping; the client host row ships here, the Vercel domain attach is HITL.
- The gym rows (timezone, slugs) already exist — the seed migration asserts them rather than creating gyms.
- The brand-module census stays at three (base, forge, red); this pass adds content to `forge`, not a new module.
