# Handoff — booking-app fix batch, 2026-08-24 (for porting into a stale worktree)

Three commits, all on `main` and pushed (`origin/main = ad5ff77`). A worktree branched off an
older `main` is missing all of them.

**Fastest path: don't cherry-pick.** From the worktree: `git merge main` (or rebase onto it) —
the three commits are contiguous on `main` and self-contained. Cherry-pick
(`git cherry-pick 50a6a20 c54b656 ad5ff77`) only if the worktree must not take the rest of main.
If the worktree has diverged copies of the files below, resolve conflicts toward the invariants
in §4 — they are owner rulings, not suggestions.

## 1. `50a6a20` — fix(client+admin): login-first booking CTAs, iOS zoom, session survival

Three owner tickets: (a) book-a-class asked visitors to REGISTER instead of login; (b) iOS
zoom/side-drift on login; (c) member asked for password again after a week away.

- **Login-first funnel**: every booking CTA targets `/reservar` unconditionally; the page guard
  (`reservar/page.tsx`) sends unauth → `/entrar`; `/registro` is reachable only via /entrar's
  "Crea tu cuenta". Files: `(home)/page.tsx` (ternary dropped + unused `getClaims` removed),
  `_components/public-header.tsx`, `precios/page.tsx` (×2).
- **iOS zoom root fix**: every form control in apps/client bumped to `text-[16px]` (iOS
  auto-zooms on focus of any input <16px and never zooms back). Files: `entrar-form.tsx`,
  `registro-form.tsx`, `contacto-form.tsx`, `activar-form.tsx`, `activar-contrasena-form.tsx`,
  `restablecer-form.tsx`.
- **signOut scope**: `signOut({ scope: "local" })` at all 4 sites — auth-js defaults to
  `global`, so one "cerrar sesión" tap revoked EVERY device (proven root cause of (c): the
  owner's old session row was deleted, not expired). Files: `cerrar-sesion-link.tsx`,
  `perfil-overlay.tsx`, `vincular-form.tsx`, admin `logout-button.tsx`.
- **Proxy** (`apps/client/src/proxy.ts` + test): first cut of the parked-teardown mechanism
  (superseded by commit 2 — take commit 2's version).
- **Alert cron** (`apps/admin/.../alertas/resumen.ts`): first cut of the log-match fix
  (superseded by commit 2 — take commit 2's version).
- Commit 1 also added a `viewport` export with `maximumScale: 1` to client `layout.tsx` and an
  `overflow-x: hidden` fallback in `globals.css` — **both reverted in commit 2**; do not port
  them.

## 2. `c54b656` — fix(review): harden the session/CTA batch per two-axis review

Review-driven corrections on top of commit 1:

- `proxy.ts`: final parked-teardown shape. `esBorradoTotal` parks a deletions-only `setAll`
  batch; after `getClaims()` it rides ONLY on `CODIGOS_SESION_MUERTA`
  (`refresh_token_not_found`, `refresh_token_already_used`, `session_not_found`,
  `session_expired`) or on null-error + null-data (structurally invalid stored session).
  Transient failures (network, GoTrue 5xx) stay fail-soft. Tests in `proxy.test.ts`.
- `layout.tsx` (client): viewport export REMOVED — `maximumScale` is banned (Android honors it,
  WCAG 1.4.4; ruling documented in both app layouts). Next's default viewport is correct.
- `globals.css`: `overflow-x: clip` ONLY on html/body (never `hidden` — it turns the viewport
  into a scroll container, breaking sticky/momentum). This is the side-drift fix.
- `nosotros/page.tsx`: both "Empezar ahora" CTAs → `/reservar` (same label, one destination).
- `resumen.ts` + test: auth alert matches `invalid_grant` OR the `Invalid Refresh Token` prefix
  (old string NEVER matched a real failure); threshold `UMBRAL_AUTH = 10` tolerates one proxy
  fan-out burst per dead-session event, pages only on systemic counts.
- `public-header.tsx`: `navPublica(reservar)` param collapsed to `NAV_PUBLICA` const.
- `docs/adr/0016`: amendment — per-device sign-out, dead-cookie shedding, owner ruling that
  member sessions must survive multi-week absences (re-scopes §3's Pro time-box/inactivity
  posture; do NOT enable those project-wide settings without weighing the member surface).

## 3. `ad5ff77` — fix(brand): un-box the RED ignition on iOS Safari

`packages/brand/src/red/ring-mark.tsx` only. iOS rendered the logo ignition as boxed segments:
Safari promotes each animating child (arc draw, letter flick) into its own tightly-sized
compositing tile and hard-clips an ANCESTOR's `filter: drop-shadow` at the tile edge. Fix:
glow + `redBreathe` moved from the svg root onto the 5 animated elements. Two traps baked in:

- Filter px INSIDE a viewBox are **user units** (like stroke-width) — the chains scale by
  `viewBox-side / size` (`baseGlow(u)` / `peakGlow(u)`); copy them verbatim or the bloom
  collapses ~6×.
- Root svg needs `overflow: visible` — child filters render before the viewport clip (the old
  root filter applied after it), and login-hero's stage relies on the bloom bleeding.

## 4. Invariants (resolve any merge conflict toward these)

1. Booking CTAs never carry a signed-in ternary; unauth lands on `/entrar` via the /reservar
   guard, never directly on `/registro`.
2. Form controls in apps/client are ≥16px. No `maximumScale` anywhere. `overflow-x: clip`,
   never `hidden`.
3. `signOut` always `{ scope: "local" }` in both apps.
4. Proxy: teardown rides only on unrecoverable refresh failures (the codes above); a network
   blip must never sign a device out.
5. Never put a CSS filter on an ancestor of an animating SVG child (ring-mark traps above).

## 5. Verify after porting

`pnpm typecheck && pnpm test` (1700 green on main). If the worktree's merge touches the
auth/session surface (proxy, signOut, entrar), run the e2e gate before it fast-forwards
anywhere: `pnpm exec playwright install chromium` once, then
`E2E_EMAIL=demo@red-demo.test E2E_PASSWORD='RedDemo!2026' pnpm test:e2e` (3 Chromium checks).
The iOS symptoms (zoom, drift, boxed ignition) are only provable on a real iPhone.
