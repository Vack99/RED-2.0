# Slice 6.5 — Entrar + Restablecer screens — Implementation Plan

> **For agentic workers:** shipping subagent executes inline, task-by-task, TDD.

**Goal:** Ship the RED-designed login and password-reset screens over the already-shipped
Phase-3 auth flows (UI only; server flows untouched), framed by the frozen brand login-hero.

**Architecture:** The `apps/client` `/entrar` and `/restablecer` pages render the resolved
brand's `loginAnimation` (login hero) with a brand-neutral, token-styled form slotted as
children — mirroring the admin login page. A base-brand host (no hero) falls back to a static
shell. The existing server actions (`entrarAction`, `resetAction`, `restablecerAction` → the
`@gym/data/server/sesion` DAL) are reused verbatim. The marketing header is hidden on the two
auth routes. Inline validation is a pure, tested module.

**Tech Stack:** Next 16 (proxy, RSC + client islands), React `useActionState`, `@gym/brand`
registry (`loginAnimation`), Tailwind v4 brand-token utilities, vitest.

## Global Constraints
- UI only. `@gym/data/server/sesion` DAL + the three server actions are untouched.
- `packages/brand/**` is FROZEN — consume `brand.loginAnimation`, never edit it.
- Brand-neutral components: paint via tokens only; no `RED`/crimson literals, no RED-only copy.
- Real behavior, not mock stubs: real failure state, working forgot-password, no prefilled creds.
- `"use client"` files must live under a `_components/` dir (client-seam guard).
- es-MX copy from CONTEXT vocabulary; LIVE DB read-only; no migrations.

---

### Task 1: Pure inline-validation module (TDD)
**Files:**
- Create: `apps/client/src/lib/auth-validacion.ts`
- Test: `apps/client/src/lib/auth-validacion.test.ts`
- Modify: `vitest.config.ts` (add a `client` project so app tests run)

**Produces:** `validarCorreo(email): string | null`, `validarPasswordRequerida(pw): string | null`,
`validarPasswordNueva(pw): string | null` — each returns an es-MX error message or null.

- [ ] Write failing tests: empty/invalid/valid correo; empty vs present password; `<8` vs `>=8` new password.
- [ ] Add `client` vitest project (`include: ["apps/client/src/**/*.test.ts"]`, node env).
- [ ] Run → fail (module missing).
- [ ] Implement the three pure validators.
- [ ] Run → pass.

### Task 2: Shared client-app chrome (brand resolver, static shell, header hide)
**Files:**
- Create: `apps/client/src/lib/brand.ts` — `resolveBrand(): Promise<BrandModule>` (mirror admin).
- Create: `apps/client/src/app/_components/auth-shell.tsx` — static fallback (logo + children).
- Create: `apps/client/src/app/_components/public-header.tsx` — `"use client"`; hides on `/entrar`,`/restablecer`.
- Modify: `apps/client/src/app/layout.tsx` — use `resolveBrand`; render `<PublicHeader>`.

- [ ] `resolveBrand` reads+validates `x-brand`, falls back to `DEFAULT_BRAND`.
- [ ] `PublicHeader` uses `usePathname()`, returns null on the two auth paths, else the sticky header (logo passed in).
- [ ] Layout wires both; brand token `<style>` injection unchanged (no-FOUC preserved).

### Task 3: Entrar screen (login + forgot mode)
**Files:**
- Modify: `apps/client/src/app/entrar/page.tsx` — `brand.loginAnimation` frames `<EntrarForm>`, else `<AuthShell>`.
- Modify: `apps/client/src/app/entrar/_components/entrar-form.tsx` — RED-designed, brand-neutral.

- [ ] Login mode: Correo + Contraseña (label row with "¿La olvidaste?"), password show/hide eye,
  inline validation on blur/submit, real failure banner from `entrarAction`, Entrar (accent) + Crear-cuenta link.
- [ ] Forgot mode: Correo + "Enviar enlace" via `resetAction`; always-sent confirmation; back to login.
- [ ] No prefilled credentials.

### Task 4: Restablecer screen
**Files:**
- Modify: `apps/client/src/app/restablecer/page.tsx` — hero frames `<RestablecerForm>`, else `<AuthShell>`.
- Modify: `apps/client/src/app/restablecer/_components/restablecer-form.tsx` — RED-designed.

- [ ] Nueva contraseña + show/hide eye + inline `validarPasswordNueva`; submit via `restablecerAction`; success → `/`.

### Task 5: Feedback loops + verify
- [ ] `pnpm lint && pnpm typecheck && pnpm test` green.
- [ ] Build the client app; drive login/forgot/reset paths for a smoke check.
- [ ] `keep-it-lean` on the diff; commit.
