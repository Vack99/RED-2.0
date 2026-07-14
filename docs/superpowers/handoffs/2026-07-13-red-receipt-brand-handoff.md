# Handoff · RED receipt de-Forge-ing (3 items)

**Written** 2026-07-13, at the end of a RED-branding UI-polish session.
**Predecessor work** is in this same working tree, **UNCOMMITTED** — read "State of the tree" first.

---

## 1. State of the tree — read this before anything

The RED login + brand-mark work from the previous session is **done, gate-green, and uncommitted** on `main`.
Gate at handoff time: `pnpm lint` 0 errors + no dependency-cruiser violations (276 modules), `pnpm typecheck` clean, `npx vitest run` **939 passed**.

**Do not start the receipt work on top of a dirty tree without first committing or stashing what is there.**

Changed / new files:

| File | What changed |
|---|---|
| `packages/brand/src/red/mark-geometry.ts` | **NEW** — the single geometry source: the ring paths + R/E/D letter paths once, plus three named optical CUTS (`HERO` ring 14/letters 37 · `CHROME` ring 32/letters 64 · `ICON` ring 80, ring-only), each carrying the `viewBox` that clears its own stroke overhang |
| `packages/brand/src/red/mark-geometry.test.ts` | **NEW** — guards that each cut's viewBox actually contains its own stroke (the shipped mark was clipped for months), and that the favicon stays free of `var()`/gradients/filters |
| `packages/brand/src/red/neon.css` | **NEW** — the neon band + tagline CSS, lifted out of `apps/client/globals.css` and rescoped `.dark[data-brand="red"]` → `[data-brand="red"]` |
| `packages/brand/src/red/logo.tsx` | `RedMark` is now the real logo at the CHROME cut (was: a fat stroke-74 ring with the letters **deleted** + a `<span>RED</span>` in the app UI font). `RedLockup` renders the mark alone at `size * 2.4` — the wordmark lives inside the ring — and takes a `glow` flag |
| `packages/brand/src/red/ring-mark.tsx` | Consumes `mark-geometry` instead of its own copy of the paths |
| `packages/brand/src/red/app-icon.ts` | Favicon = the `ICON` cut (ring only, flat token colors) |
| `packages/brand/src/red/login-hero.tsx` | Ring 140→200, stack vertically centered, `marginTop:"auto"` (which pinned the tagline to the viewport floor) removed, neon dash band added, optional `tagline` rendered **above** the form |
| `packages/brand/src/registry.ts` | `logo` slot widened with `glow?: boolean`; `loginAnimation` slot widened with `tagline?: string` |
| `packages/brand/package.json` | exports `./red/neon.css` |
| `apps/admin/src/app/globals.css` | imports `@gym/brand/red/neon.css` |
| `apps/client/src/app/globals.css` | 114 lines of RED-specific CSS **deleted** (moved to the brand package) + the import |
| `apps/admin/src/app/layout.tsx` | stamps `data-brand` on `<html>` (without it the RED hero's neon classes were inert in admin) |
| `apps/admin/src/app/(auth)/login/page.tsx` | passes `tagline="ADMINISTRADOR"` |
| `apps/admin/src/app/(app)/vender/page.tsx` | passes `glow={false}` — the receipt is a fixed cream card and the neon halo prints as a pink smudge there |

**Open question the owner has not yet answered:** at the sizes it ships (receipt 26.4px, home header 28.8px, drawer 33.6px) the CHROME ring stroke lands at **0.69–0.88 CSS px** — an antialiased hairline. He approved it after seeing it at true size, but if it reads too faint on a real screen the fix is one constant: `CHROME.ring` in `mark-geometry.ts`. The test will fail if a heavier weight clips.

---

## 2. What this handoff is for

Three fixes to the **sale receipt** (`apps/admin/src/app/(app)/vender/_components/recibo.tsx`), the cream ticket shown after a sale in `/vender`. The small RED logo on it is **fine — do not touch it.**

Reproduce it: `pnpm dev` → admin (watch the log, the two apps race for port 3000, admin usually lands on **3001**) → `http://localhost:3001/login?gym=red-demo` → sign in → **VENDER** → complete a sale → the receipt renders.

---

## Item 1 — the receipt footer says "FORGE" on a RED gym  ⚠️ this is the real one

**Symptom.** The centred line at the bottom of the cream ticket (`recibo.tsx:134-136`) renders `FORGE` for the RED gym. It should be the gym the sale came from.

```tsx
// recibo.tsx:134-136
<div className="uppercase" style={{ marginTop: 14, fontSize: 10.5, color: "#7a5a26", letterSpacing: 1, textAlign: "center" }}>
  {`${negocio}${ciudad ? ` · ${ciudad}` : ""}`}
</div>
```

**Root cause — and it is NOT a UI bug.** `packages/data/src/server/perfil.ts:27-37`:

```ts
export function resolverIdentidad(p: {...}): {...} {
  return {
    negocio: p.negocio?.trim() || 'FORGE',   // <-- line 33
    coach:   p.coach?.trim()   || 'Coach',   // <-- line 34  (this is Item 2's "COACH")
    ciudad:  p.ciudad?.trim()  || null,
  }
}
```

A blank/missing `perfil.negocio` falls back to the **hard-coded string `'FORGE'`** — a competitor's brand name baked into the shared data layer of a multi-tenant platform. RED is not special; **every** tenant whose operator never filled in a business name prints FORGE. ADR-0002 is cited as the reason this default lives in one place, and the *centralisation* is right — the *value* is wrong.

**Blast radius is wider than the receipt.** `negocio` is also a WhatsApp template token (`packages/domain/src/types.ts:176-177`, `renderPlantilla("{negocio}")`, asserted in `packages/domain/src/rules.test.ts:202-206`) and is read in `packages/data/src/server/clientes.ts:272-282` for the cliente ficha. **Grep `negocio` across the repo before changing the default** — a fix here changes messages customers receive, not just a ticket.

**Step 1 (do this FIRST — it decides the whole fix).** Determine whether this is a data hole or a code hole. I was *denied* this query: the Supabase MCP in this repo is bound to **LIVE PRODUCTION** (see project memory), and a UI task is not a licence to read prod. Get the owner's explicit go-ahead, or run it against a scratch project:

```sql
select g.slug, g.nombre as gym_nombre, g.brand_module_id,
       p.id as perfil_id, p.negocio, p.ciudad, p.tel
from gym g
left join perfil p on p.gym_id = g.id
order by g.slug;
```

- If `perfil.negocio` is **populated for forge-demo but blank for red-demo** → primarily a data hole. Seed it. But the `|| 'FORGE'` default is still a landmine for every future gym and should be fixed anyway.
- If it is **blank for everyone** → the default is doing all the work and this is squarely a code hole.

**Design fork for the next session (needs a decision, do not guess):**

- **(a) Derive the default from the gym row.** `gym.nombre` is the tenant's real name and `@gym/data` can already read it. This makes the fallback structurally correct for every tenant. Cost: `resolverIdentidad` is currently *pure* (trim + fallback, no I/O) and is unit-tested as such — passing a gym name in means threading it from each call site, so check every caller.
- **(b) Derive it from the resolved brand module** (`brand.copy.name`). Cheap, but note the boundary: `@gym/brand ✗→ @gym/data` is machine-enforced; the dependency would have to run the other way or be injected by the app, and the brand name ("RED") is not necessarily the *business* name.
- **(c) Make the fallback neutral** (e.g. empty → hide the line) and require operators to set `negocio`. Smallest diff, but the receipt loses its footer for unconfigured gyms.

Recommendation: **(a)**, with the gym name injected as an argument so `resolverIdentidad` stays pure. Confirm with the owner.

---

## Item 2 — remove the "ATIENDE · COACH" row (temporary)

`recibo.tsx:114-124` — the metadata table. Drop **only** the `ATIENDE` entry:

```tsx
{[
  ["FECHA", fechaDisplay.toUpperCase()],
  ["VIGENCIA", `${compradoDisplay.toUpperCase()} → ${venceDisplay.toUpperCase()}`],
  ["MÉTODO", metodoDisplay],
  ["ATIENDE", coach.toUpperCase()],   // <-- remove this line
].map(...)}
```

**The owner explicitly said he will put this back later.** So: remove the ROW only. Do **not** rip out the `coach` field from the DTO, the `resolverIdentidad` default, the data reads, or the tests — that would make restoring it a re-implementation instead of a one-line revert. Leave `coach` flowing through `result`; just stop rendering it. Expect an unused-variable lint warning on the `coach` destructure at `recibo.tsx:33` and handle it deliberately (keep the destructure with a short comment saying it is coming back, or drop it from the destructure only).

Note the row currently reads `COACH` (not a person's name) precisely because of the `|| 'Coach'` default in Item 1 — the two are the same bug wearing different hats.

---

## Item 3 — the receipt's lower half still "feels Forge"

**The ask, in the owner's words:** the bottom section was designed specifically for Forge; now that RED exists, give it some RED feel.

**What is actually Forge-flavoured today** — the receipt hard-codes a *warm gold/cream* palette in inline styles, in both themes, for every brand:

- cream card `#f5f1ea` and ink `#1c1917` (`recibo.tsx:82`)
- the gold-brown label colour `#7a5a26` — used on **every** label, the phone number, the "Vigencia" line, the metadata rows, the `MXN` suffix and the footer (`recibo.tsx:89, 97, 98, 101, 105, 110, 120, 130, 134`)
- the `NUEVO` badge's gold wash `rgba(199,149,69,0.18)` (`recibo.tsx:98`)
- the `TOTAL` rule: `2px solid #1c1917` (`recibo.tsx:126`)
- the perforation bars top and bottom: `background: perf` (`recibo.tsx:83-84`) — find where `perf` is defined

None of it is token-driven; it is a paper-ticket aesthetic built for one brand.

**The constraint that makes this delicate:** it is a *printed/cream* surface, so it cannot simply inherit RED's dark neon tokens. And **Forge's receipt must not change** — whatever you do must be brand-gated, exactly as the login neon was. Precedents to copy:

- the `[data-brand="red"]` CSS scope in `packages/brand/src/red/neon.css` (Forge cannot match it)
- the `glow={false}` flag already threaded to this very component for the cream surface (`vender/page.tsx` → `Lockup`)

**Recommended approach:** keep the cream paper (it *is* a receipt), and re-key the accent — the gold-brown `#7a5a26` and the gold `NUEVO` wash — to a brand-scoped value so RED gets a crimson/deep-red accent on cream and Forge keeps its gold. Do it in `red/neon.css`-style brand-scoped CSS rather than by adding more inline-style props. **Get the owner's eyes on a rendering before committing to a palette** — the previous session's win came from showing him true-size candidates and letting him pick (see the mark artifact pattern below).

---

## 4. Constraints that apply to all three items

- **Forge must stay visually unchanged.** Verify it, do not assume: `curl -s "http://localhost:3001/login?gym=forge-demo"` and diff the surfaces you touched. The previous session proved Forge untouched by checking its SSR carried `data-brand="forge"`, its own hero, and zero RED copy.
- **The cross-package boundary is machine-enforced** (`.dependency-cruiser.cjs`, runs in `pnpm lint`): the pure/server tiers `@gym/domain` + `@gym/format` + `@gym/data` ✗→ `@gym/ui` + `apps/*`; also `@gym/ui` ✗→ `@gym/data`, and `@gym/brand` ✗→ `@gym/data` + `@gym/domain`. Item 1's design fork runs straight into this — plan for it.
- **Admin's `globals.css` `@source`s only `packages/ui/src`, NOT `packages/brand/src`.** A *new Tailwind class* authored inside `packages/brand` tree-shakes to nothing in the admin app. Use inline styles or literal classes shipped from a stylesheet (this is why `red/neon.css` exists). The client app does `@source` the brand package, so it will look like it works there — test in **admin**.
- **`pnpm test` cannot see the database.** `packages/data` mocks the RPC boundary. If Item 1 ends up touching a migration or an RPC's writes, the real contract is `pnpm test:denial` against a scratch project — see `AGENTS.md`.
- **Keep it lean.** The previous session added exactly two flags (`glow`, `tagline`), each with two real consumers on the day it landed. Do not add a knob for a caller that does not exist yet.

## 5. What worked well last session (reuse it)

- **Show, don't describe, for anything visual.** The mark fix was unblockable in prose — the owner picked candidate "B" only after seeing six candidates rendered at *true pixel size* on both the dark app and the cream receipt, as a published artifact. Item 3 (the palette) is exactly this kind of question. Build the comparison first, ask second.
- **Verify against the running app, not the test suite.** Every claim last session was checked by curling the real SSR output and grepping for the marker (`data-brand="red"`, the compiled `[data-brand="red"]` selectors in the CSS bundle, DOM order of band → tagline → form). Tests passing proved nothing about whether the neon painted.
- **Adversarial review of the diff.** A 4-lens review (regression / geometry / leanness / architecture) with a skeptic pass told to *refute* each finding: 12 raised, 12 refuted, 0 confirmed. Worth re-running on the receipt diff.

## 6. Owner preferences observed

- **No Fable models, at all** (stated explicitly). Use opus / sonnet.
- Solo repo: implementation ships on a branch, then fast-forwards to `main`.
