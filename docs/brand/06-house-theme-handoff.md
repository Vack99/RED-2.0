# Handoff — iBookit house brand in the product (next session)

Activate `/caveman` + `/keep-it-lean`. Fable agents: owner grants per job — ask before staffing.

## Mission

Build **iBookit's own version of the product**: the house brand expression of the admin app and
the booking (client) app — what a client with no brand wears. Make **2–3 alternatives** the owner
can compare in the running apps, plus **1–2 niche sample brands** (pilates first) as showcase
material.

## Why now

The marketing page (see below) needs **real product context** — screenshots/demos of the apps
wearing real brands. We have 2 real client brands (`forge`, `red`) and zero representation of
ourselves or of an unbranded client. That gap is what made every abstract marketing candidate
feel fake.

## State

- Identity locked: `docs/brand/03-visual-identity/IDENTITY.md` + `final/` assets.
- Marketing candidates: `docs/brand/05-marketing/candidates/` — **d-camaleon, e-cartel,
  f-antes-despues all liked, kept, iterate only after this session's output exists.** a/b/c
  rejected (lesson: the page sells; brand is skin).
- House-theme token spec already written: `docs/brand/04-fable-prompt.md` **Target B** — the
  exact 33-key contract, mapped from the locked identity, "deliberate but self-effacing"
  (BRAND-PLAN rule 5, Polaris-vs-Dawn).

## Where to build

- `packages/brand/src/` — `registry.ts` (brand modules), `tokens.ts` (the 33-key contract),
  `token-overrides.ts`, `brand-css.ts`. House alternatives = candidate token sets here.
- Tenant seam: host → `x-gym` + `x-brand` (`resolveTenant`, ADR-0012). View a candidate by
  pointing a demo tenant at it.
- Demo twins are the sandbox (memory: demo-gym-testing-model). **Supabase MCP is bound to
  LIVE** — any seed/tenant rows are prod rows; scratch-test migrations per AGENTS.md.

## Definition of done

Owner can open admin + booking app on a demo tenant and flip between house-theme alternatives
and the pilates sample; picks one house theme; marketing candidates then get fed real captures.

## Not in scope

Marketing-page iteration/polish, productionizing the landing (stack/hosting undecided),
Phase D Target A tokens, WhatsApp number + `hola@ibooki.lat` mailbox (owner-side, still open).
