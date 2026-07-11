# Slice #84 — Forge client goes calm-gold dark, RED glows brand-scoped — Implementation Plan

> **For agentic workers:** executed inline in this session (subagents unavailable). TDD, checkbox steps.

**Goal:** Flip the Forge client to dark-only in Forge's own tokens, stamp `data-brand` on `<html>`, and re-scope RED's literal-red glow layers so Forge dark shows only calm token base layers — RED byte-identical.

**Architecture:** Two seams. (1) `forge.defaultScheme = "dark"` in the `@gym/brand` registry drives the existing `<html>` scheme-class append. (2) The client root layout adds `data-brand={brand.id}` to `<html>`; the four RED glow blocks in `apps/client/src/app/globals.css` move from `.dark ` to `.dark[data-brand="red"] `. The calm base layers already exist (unscoped Tailwind/token classes in JSX + globals.css), so Forge dark simply stops receiving the RED overlay.

**Tech Stack:** Next.js (client app RSC layout), Tailwind v4 (`@custom-variant dark`), `@gym/brand` module registry, Vitest (node env).

## Global Constraints

- No new TOKEN_KEYS, no override-schema change, no `@gym/brand` boundary change (never import `@gym/data`/`@gym/domain`).
- Brand census stays at exactly three modules (base, forge, red).
- `apps/admin/**` untouched — admin does NOT consume `defaultScheme` (own theme provider, light+toggle).
- RED client paint byte-identical: re-scoped selectors must still match RED (higher specificity, no competing rule).
- No DB changes in this slice. Live DB is read-only.

---

### Task 1: Forge defaultScheme = dark (census-guarded)

**Files:**
- Modify: `packages/brand/src/registry.ts` (forge module gains `defaultScheme: "dark"`)
- Test: `packages/brand/src/brand.test.ts`

- [ ] Step 1: Write failing census assertions — forge & red `defaultScheme === "dark"`, base undefined.
- [ ] Step 2: Run `pnpm vitest run --project brand` → FAIL (forge undefined).
- [ ] Step 3: Add `defaultScheme: "dark"` to forge module.
- [ ] Step 4: Run brand project → PASS.

### Task 2: `data-brand` stamp + testable html seam

**Files:**
- Modify: `apps/client/src/lib/brand.ts` (add pure `brandHtmlSeam(brand)` helper)
- Modify: `apps/client/src/app/layout.tsx` (stamp `data-brand`, consume helper for scheme class)
- Test: `apps/client/src/lib/brand.test.ts` (new)

**Interfaces:**
- Produces: `brandHtmlSeam(brand: BrandModule): { dataBrand: BrandId; schemeClass: "" | " dark" }` — the layout can't be node-rendered (RSC, no RTL), so the stamp+scheme derivation is a pure seam the census asserts.

- [ ] Step 1: Write failing test — forge → `{ dataBrand: "forge", schemeClass: " dark" }`, red → `{ "red", " dark" }`, base → `{ "base", "" }`.
- [ ] Step 2: Run client project → FAIL (no export).
- [ ] Step 3: Add helper; wire layout to stamp `data-brand={seam.dataBrand}` and append `seam.schemeClass`.
- [ ] Step 4: Run client project → PASS.

### Task 3: Re-scope RED glow layers to dark+RED

**Files:**
- Modify: `apps/client/src/app/globals.css` (four blocks: `.cm-sub`/`.cm-vals` copy-reveal, `.rcard-pips` ember, `.mb-prog` plan bar, `.cd-roster .pips` roster — `.dark ` → `.dark[data-brand="red"] `)

- [ ] Step 1: Replace each `.dark ` prefix on the RED-literal selectors with `.dark[data-brand="red"] `; update the block comments (`.dark` → dark+RED).
- [ ] Step 2: Verify no RED-literal `.dark ` selector remains; base/unscoped calm layers untouched.
- [ ] Step 3: `pnpm lint && pnpm typecheck && pnpm test` green.

### Verification

- keep-it-lean before done.
- RED regression: rendered-output spot-check on the red host (selectors still match; specificity only rises).
- Forge admin untouched (grep: `defaultScheme` unused in admin).
