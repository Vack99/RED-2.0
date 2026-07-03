# Slice #30 — Structured brand tokens + the single serializer

> Executed inline by the shipping subagent (no sub-agent dispatch available). TDD on the serializer; mechanical restructuring elsewhere.

**Goal:** Replace forge/red's pre-serialized CSS strings with structured token objects rendered by one exported serializer; add each module's `copy: { name, description }`; keep `css` as the precomputed baseline so both layouts render byte-for-byte-equivalent output with zero consumer rewiring.

**Architecture:** New `packages/brand/src/tokens.ts` owns the ~28-key `TokenKey` contract, the `BrandTokens` (light/dark) shape, and the exported `tokensToCss` serializer (TDD, pure). `forge/tokens.ts` and `red/tokens.ts` swap their exported CSS string for a structured `BrandTokens` object. New `forge/copy.ts` / `red/copy.ts` export each `BrandCopy`. `registry.ts` gains `BrandCopy`, extends `BrandModule` with `tokens` + `copy`, and precomputes `css: tokensToCss(tokens)` at module load — same field name/shape existing layouts already index.

**Tech Stack:** TypeScript, Vitest, pnpm workspace (`@gym/brand` package).

## Global Constraints
- No consumer rewiring: both `apps/*/layout.tsx` keep indexing `brands[id].css` unchanged.
- Registry census test untouched (still exactly forge/red).
- No edits to `resolve-brand-id.ts`, `host-map.ts`, either `proxy.ts`, or the `HOST_TO_BRAND` block/index re-export.
- Zero DB work.
- CSS equivalence proven via a normalized-whitespace comparison against the original string constants (captured as fixtures in the test), not byte-exact formatting.

---

### Task 1: TDD the token contract + serializer

**Files:**
- Create: `packages/brand/src/tokens.ts`
- Create: `packages/brand/src/tokens.test.ts`

**Interfaces:**
- Produces: `TOKEN_KEYS` (readonly tuple of 28 contract var names), `TokenKey` (union), `TokenScheme` (`Record<TokenKey, string>`), `BrandTokens` (`{ light: TokenScheme; dark: TokenScheme }`), `tokensToCss(tokens: BrandTokens): string`.

- [ ] Write failing tests in `tokens.test.ts`: minimal 2-key fixture in/exact-block out; every `TOKEN_KEYS` entry appears in both `:root,.light{}` and `.dark{}` sections for a full fixture; output contains `:root,` and `.dark {`.
- [ ] Run `pnpm --filter @gym/brand test` — confirm fails (`tokensToCss` undefined).
- [ ] Implement `tokens.ts` minimally to pass.
- [ ] Run tests again — confirm pass.

### Task 2: Restructure forge tokens + prove CSS equivalence

**Files:**
- Modify: `packages/brand/src/forge/tokens.ts` (export `forgeTokens: BrandTokens` instead of `forgeTokenCss: string`)
- Modify: `packages/brand/src/tokens.test.ts` (add an equivalence test importing `forgeTokens`, `tokensToCss`, and a copy of today's rendered string, comparing with a whitespace-normalizer)

- [ ] Convert the 28 light + 28 dark `--var: value;` lines into a `TokenScheme` object per scheme, preserving every value verbatim.
- [ ] Add equivalence test: `normalize(tokensToCss(forgeTokens)) === normalize(<original string fixture>)`.
- [ ] Run tests — confirm pass.

### Task 3: Restructure red tokens + prove CSS equivalence

**Files:**
- Modify: `packages/brand/src/red/tokens.ts` (export `redTokens: BrandTokens`)
- Modify: `packages/brand/src/tokens.test.ts` (same equivalence test for red)

- [ ] Same conversion + equivalence test as Task 2, for red.
- [ ] Run tests — confirm pass.

### Task 4: Module copy records

**Files:**
- Modify: `packages/brand/src/registry.ts` (inline copy object literals in the `brands` record)

- [x] Inlined `copy: { name: ..., description: ... }` directly in each `brands[id]` entry instead of new `forge/copy.ts` / `red/copy.ts` files — each would have had exactly one caller (`registry.ts`) in this diff with no second consumer/boundary/name earned (keep-it-lean deletion test); `tokens.ts`/`logo.tsx` earn their file split via real multi-consumer or package-subpath boundaries, copy does not (yet).

### Task 5: Registry — structured tokens + precomputed baseline + copy

**Files:**
- Modify: `packages/brand/src/registry.ts`

**Interfaces:**
- Produces: `BrandCopy` (`{ readonly name: string; readonly description: string }`), extended `BrandModule` (`tokens: BrandTokens; css: string; copy: BrandCopy` alongside existing `id/logo/loginAnimation`).

- [ ] Import `forgeTokens`/`redTokens`, `forgeCopy`/`redCopy`, `tokensToCss`.
- [ ] Add `BrandCopy` interface + extend `BrandModule` with `tokens: BrandTokens` and `copy: BrandCopy`; update the doc comment.
- [ ] Build each `brands[id]` entry with `tokens`, `css: tokensToCss(tokens)` (computed once, module load), `copy`.
- [ ] Run full brand test suite — confirm `brand.test.ts` census/shape assertions still pass unmodified.

### Task 6: Full verification

- [ ] `pnpm lint` (incl. dependency-cruiser boundary)
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build` (both apps render unchanged CSS)
- [ ] `keep-it-lean` self-check: deletion test on `tokens.ts`/`copy.ts` files, no unused exports, no speculative structure beyond the AC.
