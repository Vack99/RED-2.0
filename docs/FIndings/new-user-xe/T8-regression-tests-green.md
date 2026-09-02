# T8 — "All tests still green": the one-line changes that break a guarantee

Cross-examination seat T8, 2026-09-02. HEAD = `33c9087a`. Territory: **Q6 only** —
the most plausible one-line change a well-meaning developer ships next month that
breaks a guarantee this code depends on, with every gate still green.

Everything below is read at HEAD with `cat`/`sed`/`grep`. Live reads are `select`-only
against `hjppxawglmukfvsgmcog`. Where a prior doc already held a claim it is attributed
by row id and re-derived at HEAD (or tagged `unverified this round`).

---

## 0. What "green" means here — measured, not assumed

| gate | what runs it | what it is | on the new-user path |
|---|---|---|---|
| `pnpm lint` | `.husky/pre-commit`, CI | `eslint .` + `depcruise apps packages` | boundary + one import rule (see T8-13) |
| `pnpm typecheck` | pre-commit, CI | `tsc --noEmit` | types only |
| `pnpm test` | pre-commit, CI | `vitest run`, 9 projects | **`.rpc()` is a stub; `.tsx` has no test infra at all** |
| `pnpm build` | CI only | `next build` both apps | catches a `server-only` pill violation, nothing else |
| `pnpm test:coverage` | **nothing** | v8, `thresholds: { 100: true }` | not in `.husky/pre-commit`, not in `.github/workflows/ci.yml` — the 100% threshold gates nothing |
| `pnpm test:denial` | **nothing** | SQL suites vs a scratch project | AGENTS.md convention; needs a PAT + scratch ref |
| `pnpm test:e2e` | **nothing** | Playwright, 6 tests | AGENTS.md convention; **unset `E2E_EMAIL`/`E2E_PASSWORD` ⇒ `test.skip` ⇒ exit 0** |

Cites: `.husky/pre-commit` (one line: `pnpm lint && pnpm typecheck && pnpm test`);
`.github/workflows/ci.yml:26-45` (lint, typecheck, test, build — no coverage, no denial, no e2e);
`vitest.config.ts:30-58` (the coverage block, `thresholds: { 100: true }`) against
`package.json:11-19` (`"test": "vitest run"`; `"test:coverage"` is a separate script no hook
or workflow calls); `apps/client/e2e/session.spec.ts:63-66` and `signup.spec.ts:116-119`
(`test.skip(!ARMADA, …)`).

Attribution: this is P-001 / P-005 (`2026-09-01-project-breaking-points.md` ranked #1) —
**re-derived at HEAD**, plus one fact those rows do not carry: the 100%-coverage threshold
exists but is wired to a script nothing invokes.

The two mocks that decide almost every finding below:

1. **`packages/data/src/server/supabase-fake.test-helper.ts:166-169`** — `.rpc(fn, args)`
   pushes the call name and resolves `opts.rpc.data` **for every RPC in the test**. No SQL is
   executed, ever. A migration can change what an RPC writes and `pnpm test` cannot see it.
2. **same file, :101-106** — *"Filters RECORD but never narrow the seeded list."* `.eq()`,
   `.in()`, `.is()`, `.gte()` are recorded, never applied. **Deleting a filter changes the
   returned rows in production and nothing in the suite**, unless a test explicitly asserts
   `eqCalls`.

Measured on that second point: **82 `.eq("gym_id", …)` call sites** in the non-test DAL,
against **22 test lines anywhere in `packages/data`** that assert a recorded `gym_id` filter
(`grep -rn eqCalls packages/data/src/server/*.test.ts | grep -i gym_id | wc -l` → 22). The
member booking-home DAL, `agenda-miembro.ts`, holds 4 of those call sites (`:160`, `:279`,
`:495`, `:621`) and **its test file asserts none of them**.

---

## 1. The guarantee → guard inventory

Every guarantee the mandate named, with the machine guard that actually covers it at HEAD.
"✗" is a claim, not a shrug: I looked for the guard and it is not there.

| # | Guarantee | Where it lives at HEAD | Machine guard | Verdict |
|---|---|---|---|---|
| G1 | Tenant scoping `.eq('gym_id')` on member/staff reads | 82 sites, e.g. `agenda-miembro.ts:160,279,495,621` | vitest **only where a test asserts `eqCalls`** — 22 assertions / 82 sites | ✗ mostly uncovered |
| G2 | `/auth/confirm` `next` is a local path (no open redirect) | `auth/confirm/route.ts:117-120` | none — `route.test.ts` has 4 tests, all on failure logging | ✗ |
| G3 | `emailRedirectTo` / outbound host = the request `host` | `registro/actions.ts:52,99`, `activar/actions.ts:86` | none (no test names `host` vs `x-forwarded-host`) | ✗ |
| G3b | Outbound invite host = `es_principal` first | `invitaciones.ts:134-135`, `gym.ts:139,165` | `invitaciones.test.ts:262`, `gym.test.ts:278`, `tools/guards/es-principal-invariant.test.ts` | ✓ covered |
| G4 | Cookie-option exhaustiveness at all 4 `@supabase/ssr` sites | `cookie-options.ts:35`, used at `admin/proxy.ts:75`, `client/proxy.ts:157`, `server/supabase.ts:48`, `client.ts:18` | **none** — `fetch-shield-coverage.test.ts` checks `fetch:`, not `cookieOptions`, and explicitly excludes browser clients (:11-12) | ✗ |
| G5 | `__Host-` prefix constant-folded at build | `cookie-options.ts:33-37` (`NODE_ENV === 'production'` ternary) | only `pnpm test:e2e` (convention, skips) | ✗ in CI |
| G6 | `where auth_user_id is null` in claim RPCs | `reclamar_o_crear_cliente.sql:51,55,65`; `reclamar_por_codigo.sql:47` | `test:denial` (convention) — and **no vector for an already-claimed target row** in either suite | ✗ |
| G6b | Ambiguous email match → create, never guess (`v_n = 1`) | `reclamar_o_crear_cliente.sql:50-53` | `registro_claim.sql` V4a asserts the *unique index*, not the `v_n` branch | ✗ |
| G7 | One-class-per-instant / slot exclusivity | `20260823120000`, `20260823120100` | `agenda_slot_guards.sql` via `test:denial` (convention) + `rpc-write-coverage` wiring | partial |
| G8 | Send-Email hook payload → correct link / OTP type / copy | `supabase/functions/send-email/correo.ts` | `correo.test.ts` — 25 tests | ✓ covered |
| G8b | The hook **shell** (`index.ts`) | `send-email/index.ts` | **none** — excluded from eslint (`eslint.config.mjs:56`), from tsc, and from vitest coverage (`vitest.config.ts:54-56`) | ✗ |
| G9 | SECURITY INVOKER/DEFINER choice per RPC | migrations | `rpc-canon-drift.test.ts` re-derives the *same* replay — it detects staleness, never semantics | ✗ semantically |
| G10 | RLS predicates (`is_member_of`, `has_role`, `is_staff_of`, `staff_gym`) | `functions-canonical/*.sql` | `test:denial` suites (convention) | ✗ in CI |
| G11 | `senal_gym` trigger list (5 tables × 3 ops) | `20260901120000_senal_gym.sql:127` — a **single array literal** | `senal_gym.sql` via `test:denial` (convention); nothing checks the array against the write surface | ✗ |
| G11b | Señal channel is `private: true` | `client-senal.ts:209` | none — `client-senal.test.ts`'s 7 tests cover only the debounce regulator | ✗ |
| G12 | fetch-shield exemptions (POST stays unbounded) | `fetch-shield.ts:140` | `fetch-shield.test.ts:79-92` asserts **only `/rpc/registrar_venta`**; `/auth/v1/token` occurs in this repo exactly once — in a comment (`fetch-shield.ts:30`) | ✗ for the token path |
| G12b | Every server Supabase client installs the shield | 5 sites | `tools/guards/fetch-shield-coverage.test.ts` | ✓ covered |
| G13 | `signOut({ scope: 'local' })` at all 4 sites | 4 `.tsx` files | **none** — all 4 are `.tsx`; the repo has no DOM test infra (`vitest.config.ts:39-46` states it) | ✗ |
| G14 | Client→server import seam | `eslint.config.mjs:20-38` | ESLint rule scoped to `apps/admin/**` **only**; `client-seam.test.ts` checks file *location*, not the rule's glob | ✗ for `apps/client` |
| G15 | No RPC overload | migrations | `tools/guards/rpc-overload.test.ts` | ✓ covered |
| G16 | Every write RPC has a wired suite | `supabase/tests/rpc-coverage.json` | `rpc-write-coverage.test.ts` — but `if (entry.quarantined) continue;` (:56) | ✗ one-line dodge |
| G17 | Every suite file is wired | `run-denial-suite.mjs` SUITE/QUARANTINE | `denial-suite-drift.test.ts` | ✓ covered |
| G18 | Anon-read surface does not widen | migrations | `tools/guards/anon-read-surface.test.ts` | ✓ covered |
| G19 | `server-only` pill on every DAL module | `packages/data/src/server/**` | `server-only-coverage.test.ts` (3 exempt: `derive.ts`, `plantilla-ctx.ts`, `export/rows.ts`) | ✓ covered |
| G20 | The proxy's fail-soft teardown rule | `client/proxy.ts:167-181` | `proxy.test.ts` covers **only** the two pure helpers `esBorradoTotal`/`esSesionMuerta` (7 tests). `proxy()` itself is never invoked; `apps/admin` has no proxy test at all | ✗ |
| G21 | A live session never sees `/entrar`'s password form | `entrar/page.tsx:34-40` | `e2e/session.spec.ts:94` — real, and skipped without creds | ✗ in CI |

Also measured: **9 of the 10 untested `.ts` files under `apps/client/src` are Server Action
modules**, and they are every auth door a member touches — `activar/actions.ts`,
`activar/contrasena/actions.ts`, `codigo/actions.ts`, `entrar/actions.ts`,
`registro/actions.ts`, `restablecer/actions.ts`, plus `reservar/actions.ts`,
`clase/[sessionId]/actions.ts`, `contacto/actions.ts`. (19 non-test `.ts` files total under
`apps/client/src`, 9 with a sibling `.test.ts`.) The one untested non-action file is
`lib/turnstile-site-key.ts`.

---

## 2. The ranked one-line diffs

Ranked by **likelihood × blast radius**. Every hunk is written against the literal text at
HEAD. "Why green" names the specific mock or gap.

---

### T8-01 — Delete `.eq("gym_id", gymId)` as "redundant with RLS" (severity 4)

```diff
--- a/packages/data/src/server/agenda-miembro.ts
+++ b/packages/data/src/server/agenda-miembro.ts
@@ -157,7 +157,6 @@ async function fetchSesionesMiembro(
   const { data: sesiones, error } = await supabase
     .from("class_session")
     .select("id, class_type_id, starts_at, duration_min, capacity")
-    .eq("gym_id", gymId)
```

**Guarantee broken.** `class_session_member_select` is
`using (gym_id in (select m.gym_id from public.gym_membership m where m.user_id = (select auth.uid())))`
— `supabase/migrations/20260714080000_rls_uncorrelated_predicates.sql:79-81`. RLS permits
**every gym the caller is a member of**, so the explicit filter is the *only* thing making
the week one gym's week. The comment at `agenda-miembro.ts:41` calls it "a belt on top of
RLS" — which is precisely the sentence a lean-pass deletes.

**Why every test stays green.** `supabase-fake.test-helper.ts:101-106` records `.eq()` and
**never narrows the seeded list**; `agenda-miembro.test.ts` seeds `gym_id: "gym-1"` rows and
asserts the shaped output, never `eqCalls`. `depcruise`/`tsc` see nothing. `test:denial` runs
SQL, not the DAL. `test:e2e` signs in one single-gym sandbox account.

**Member sees.** A member of two gyms opens `/reservar` on RED and sees Forge's 06:15 class
in the RED week, bookable. Second-order: `mi_membresia` is `p_gym_id`-scoped
(`functions-canonical/mi_membresia.sql:21`), so the week and the plan card disagree.

**Breaking point.** Live today: `select user_id, count(*) from gym_membership group by 1
having count(*) > 1` returns **exactly 1 row** (an owner+operator staff identity, no member).
So this is **latent, not live, as of 2026-09-02** — it goes live on the first member who
claims in a second gym. The perf half is not latent, but the number is borrowed: memory
`adr-0013-rls-per-row-claim-is-false.md` (2026-07-28) measured 1,056 ms → 1.58 ms (667×) at
611k rows for the equivalent filter on `gym_membership` — **unverified this round, and on a
different table**.

**Cheapest guard.** One line per reader in the existing test:
`expect(fake.eqCalls.class_session).toContainEqual(["gym_id", "gym-1"])`. Or a
`tools/guards/` test that greps every `@gym/data/server` `.from("<gym-scoped table>")` for a
sibling `.eq("gym_id"` — the same shape `fetch-shield-coverage.test.ts` already uses.

Basis: **measured** (files + one live query). Prior: P-112 / the ADR-0013 memory warning,
re-derived at HEAD.

---

### T8-02 — `cache()`-wrap `getEsMiembro` for consistency with the rest of the DAL (severity 4)

```diff
--- a/packages/data/src/server/agenda-miembro.ts
+++ b/packages/data/src/server/agenda-miembro.ts
@@ -139 +139 @@
-export async function getEsMiembro(client?: SupabaseServer): Promise<boolean> {
+export const getEsMiembro = cache(async function getEsMiembro(client?: SupabaseServer): Promise<boolean> {
```

**Guarantee broken.** `/reservar` self-heals a dropped claim by calling `getEsMiembro`,
running `intentarReclamoPorEmail`, then calling `getEsMiembro` **again with the same client
instance** (`reservar/page.tsx:58-68`). React `cache()` keys on argument identity, and
`createClient()` is itself `cache()`-wrapped (`server/supabase.ts`), so the second call
returns the memoized `false`. The doc comment at `agenda-miembro.ts:133-138` says exactly
this — *"Deliberately NOT `cache()`-wrapped … a stale per-request-memoized `false` would
defeat the retry."* A comment is not a guard.

**Why it is the most plausible edit on this list.** The surrounding convention is uniform
memoization: `resolverMiembroGym` (`inquilino.ts:72`), `slugDelHost` (`:30`),
`getSaldoMiembro`, and `createClient` are all `cache()`-wrapped, and `reservar/page.tsx:74-76`
explicitly praises that. A perf pass that "finishes the job" writes this line.

**Why every test stays green.** `agenda-miembro.test.ts:436-442` calls `getEsMiembro` twice
with **two different fakes** — two different `cache()` keys. Both assertions pass. No test
drives `reservar/page.tsx` (`.tsx`, no DOM infra). `test:e2e` signs in an account that is
already a member, so the self-heal branch never executes.

**Member sees.** Exactly the Marce shape: a verified, logged-in member lands on `/reservar`
and gets `<SinMembresia />` — "no membership" — permanently, on every reload, with no error
anywhere. The retry that exists to rescue them is silently disarmed.

**Breaking point.** Fires for 100% of members whose claim did not land at the door — the
whole cohort the self-heal was built for (audit #10/#15; the 2026-08-30 Sarahí wedge).

**Cheapest guard.** One test that calls `getEsMiembro(sameFake)` twice across a mutated
membership list and asserts the second call re-reads. ~6 lines.

Basis: **measured** for the code and the test; **modelled** for the React `cache()` behaviour
in a live request (see §7). Not in the prior register.

---

### T8-03 — Drop `cookieOptions` at one of the four `@supabase/ssr` sites (severity 5)

```diff
--- a/packages/data/src/client.ts
+++ b/packages/data/src/client.ts
@@ -15,5 +15,4 @@ export function createClient() {
   return createBrowserClient<Database>(
     process.env.NEXT_PUBLIC_SUPABASE_URL!,
     process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
-    { cookieOptions: SUPABASE_COOKIE_OPTIONS },
   )
```

…or, equivalently, add a **fifth** `createBrowserClient`/`createServerClient` anywhere and
forget the option.

**Guarantee broken.** `cookieOptions.name` becomes `auth.storageKey`, the base key the SDK
chunks and later recombines (`cookie-options.ts:8-14`). A site that omits it mints and reads
`sb-<ref>-auth-token` while the other three use `__Host-sb-auth-token`. **Sessions stop
resolving at that site silently — they do not fail loudly.**

**Why every test stays green.** There is **no exhaustiveness guard**. The one that looks like
it — `tools/guards/fetch-shield-coverage.test.ts` — matches
`create(?:ServerClient|SupabaseClient)` (:15) and asserts `fetch: shieldedFetch`; its header
(:11-12) says browser clients are **out of scope by design**. `pnpm test` never constructs a
real client. `pnpm build` compiles fine. And the `__Host-` name is a
`NODE_ENV === 'production'` ternary (`cookie-options.ts:33`), so a developer testing locally
compares `undefined` to `undefined` and sees no difference at all.

**Member sees.** Signs in, gets bounced back to `/entrar` on the next navigation — or stays
signed in on the server and signed out in the browser (`packages/data/src/client.ts` is what
`senal-gym`, `perfil-overlay`, `cerrar-sesion-link` and `vincular-form` use).

**Breaking point.** All members on the affected surface, immediately on deploy. Prod-only:
the divergence does not exist in dev, so a local walk-through proves nothing.

**Cheapest guard.** Copy `fetch-shield-coverage.test.ts`, swap the assertion to
`cookieOptions: SUPABASE_COOKIE_OPTIONS`, drop the browser-client exclusion. ~15 lines, and
it is the guard shape the repo already trusts.

Basis: **measured** (`grep -rn "cookieOptions" apps packages` → 4 usage sites + the module).
Prior: P-011 / P-038 (F-13, one-liners #1) — **re-derived at HEAD**, and this round adds that
the near-miss guard explicitly excludes the browser site.

---

### T8-04 — Widen the proxy's teardown-ride condition (severity 5)

```diff
--- a/apps/client/src/proxy.ts
+++ b/apps/client/src/proxy.ts
@@ -173 +173 @@
-      if (esSesionMuerta(error) || (!error && !data)) {
+      if (error || !data) {
```

**Guarantee broken.** The fail-soft rule shipped at 465dcf4: a failed refresh must **not**
sign the device out unless GoTrue said the token is gone server-side
(`CODIGOS_SESION_MUERTA`, `proxy.ts:35-40`). The rewritten condition rides auth-js's cookie
wipe on **any** error — a network blip, a GoTrue 5xx, the 2026-08-29 IAD stall.

**Why it is plausible.** The two-branch condition with its
`console.warn("[proxy] refresh failure suppressed cookie wipe")` else-arm reads like a
leftover; "if it errored, shed the cookie" is the naive simplification, and it makes a noisy
warn line disappear from the logs.

**Why every test stays green.** `apps/client/src/proxy.test.ts` has 7 tests and **never calls
`proxy()`** — it exercises only the two exported pure helpers, both untouched by this diff.
There is no `apps/admin/src/proxy.test.ts` at all. `test:e2e`'s three session tests run
against a healthy GoTrue, so no error path fires.

**Member sees.** During any Supabase degradation, every member on the site is signed out and
walked to the password form — the 2026-08-21 incident, re-shipped.

**Breaking point.** 0 members on a healthy day; approaching 100% of active sessions during a
GoTrue 5xx window. The 2026-08-29 event produced 65 stalls over 5 s in 24 h from one colo
(`fetch-shield.ts:10-19`) — the same class of event is the trigger.

**Cheapest guard.** A `proxy()` unit test with a fake `createServerClient` that returns
`{ data: null, error: { code: "unexpected_failure", status: 500 } }` and asserts the response
carries no cookie deletions. The pure helpers already exist; the missing piece is one test
that runs the function.

Basis: **measured**. Prior: P-002 / P-006 (F-04) touch the adjacent refresh-consume axis, not
this condition; "there is no `proxy()` test" is new this round.

---

### T8-05 — Timeout `POST /auth/v1/token` "to finish the shield" (severity 4)

```diff
--- a/packages/data/src/server/fetch-shield.ts
+++ b/packages/data/src/server/fetch-shield.ts
@@ -140 +140,2 @@
-  if (method !== "GET" && method !== "HEAD") return fetch(input, init);
+  if (method !== "GET" && method !== "HEAD")
+    return url.includes("/auth/v1/token") ? withTimeout(input, init, 8_000, callerSignal) : fetch(input, init);
```

**Guarantee broken.** `fetch-shield.ts:30-36` states the reason in the module header:
aborting a refresh past GoTrue's ~10 s `refresh_token_reuse_interval` makes the retry come
back `refresh_token_already_used`, which `client/proxy.ts:35-40` classifies as a dead session
and **rides the teardown** — i.e. a real sign-out. *"Do NOT 'complete' this shield by adding
a timeout there."*

**Why every test stays green.** The POST test at `fetch-shield.test.ts:79-92` uses
`/rpc/registrar_venta` and asserts `signal` is `undefined`. A **blanket** POST timeout fails
it — which is why the plausible edit is the *targeted* one above. Measured: the string
`auth/v1/token` occurs exactly once in the repo's `.ts` files, in the comment at
`fetch-shield.ts:30`. Nothing asserts it.

**Member sees.** Under any slow-network condition, sign-outs that look random.

**Breaking point.** Any refresh whose round trip exceeds the chosen bound while GoTrue still
commits the rotation. Prior probe (`fetch-shield.ts:25-28`): healthy p-max from the bad colo
was ~800 ms against 40–260 s stalls, so an 8 s bound fires only in exactly the window where
the damage is worst.

**Cheapest guard.** Two lines in the existing POST test: a second case asserting
`shieldedFetch("https://x.supabase.co/auth/v1/token?grant_type=refresh_token", { method: "post" })`
is called with `signal: undefined`.

Basis: **measured**. Prior: P-012 / P-039 (F-14, one-liners #2) — **re-derived at HEAD**,
with the exact hunk that dodges the existing assertion.

---

### T8-06 — Simplify `/auth/confirm`'s `next` validation (severity 4)

```diff
--- a/apps/client/src/app/auth/confirm/route.ts
+++ b/apps/client/src/app/auth/confirm/route.ts
@@ -117,4 +117 @@
-  const next =
-    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") && !nextParam.startsWith("/\\")
-      ? nextParam
-      : null;
+  const next = nextParam?.startsWith("/") ? nextParam : null;
```

**Guarantee broken.** The three-clause check is the open-redirect guard, and the comment at
:115-116 says why: `//host` is protocol-relative and `/\` is treated as `//` by browsers and
by `URL`. The simplified version passes both into
`NextResponse.redirect(new URL(next ?? "/reservar", request.url))` at :103.

**Why every test stays green.** `route.test.ts` has **4 tests** (`:69`, `:81`, `:100`, inside
one describe at `:57`), all about *failure* logging — none reaches `finalizarAuth`, none
passes a `next`. `signup.spec.ts` exercises `/auth/confirm` only for the dead-link motivos.
Lint and typecheck are indifferent.

**Member sees.** A mail link of the form `…/auth/confirm?token_hash=…&next=//attacker.tld`
establishes a real session and then lands the member on an attacker page one screenshot away
from the real password form. The link is *legitimately* clickable — the token verifies first,
so every warning sign a member is taught to look for is absent.

**Breaking point.** One crafted URL. The attacker needs a valid `token_hash`, i.e. the ability
to trigger a mail to the victim — which `/registro`'s public door provides.

**Cheapest guard.** Three `expect` lines in `route.test.ts` asserting `//evil`, `/\evil` and
`https://evil` all resolve to `/reservar`.

Basis: **measured**. Not in the prior register.

---

### T8-07 — Drop `{ scope: "local" }` from one `signOut` (severity 4)

```diff
--- a/apps/client/src/app/reservar/_components/cerrar-sesion-link.tsx
+++ b/apps/client/src/app/reservar/_components/cerrar-sesion-link.tsx
@@ -28 +28 @@
-    const { error: signOutError } = await createClient().auth.signOut({ scope: "local" });
+    const { error: signOutError } = await createClient().auth.signOut();
```

**Guarantee broken.** ADR-0016 Amendment 2026-08-24: `signOut()`'s default is
`scope: 'global'` — one tap revokes every device. All 4 call sites carry the explicit scope
today: `admin/.../logout-button.tsx:30`, `client/.../vincular-form.tsx:61`,
`cerrar-sesion-link.tsx:28`, `perfil-overlay.tsx:396`.

**Why every test stays green.** All four are `.tsx`. `vitest.config.ts` has no `.tsx` in any
project's `include`, no jsdom, no testing-library — the repo cannot test a component at all,
and `vitest.config.ts:41-46` says so in prose. Zero coverage, by construction.

**Member sees.** Signs out on their phone; their tablet and the browser they left open at the
gym are signed out too — the literal 2026-08-24 incident that produced the ADR amendment.

**Breaking point.** Every member with more than one device or browser, from the first tap.

**Cheapest guard.** A `tools/guards/` grep test: every `.signOut(` under `apps/**` must be
followed by `{ scope: "local" }`. ~12 lines, no DOM infra needed — the same shape as
`client-seam.test.ts`.

Basis: **measured** (`grep -rn signOut apps packages` → 4 sites, all scoped). Prior: P-010 /
P-040 (F-12, one-liners #3) — **re-derived at HEAD**.

---

### T8-08 — Drop the `v_n = 1` ambiguity rule (or the claim's compare-and-set) (severity 4)

```diff
   (a new migration, one changed line, then `pnpm gen:rpc-canon`)
-  if v_n = 1 then
+  if v_n >= 1 then
```

…or the sibling of the same shape, at `reclamar_o_crear_cliente.sql:65`:

```diff
-       where id = v_cli and auth_user_id is null;
+       where id = v_cli;
```

**Guarantee broken.** ADR-0009 Amendment 2026-07-02: *"Ambiguous match (>1 unclaimed row) →
create, never guess"*; and the `and auth_user_id is null` re-check on the UPDATE is the
concurrency backstop that makes the claim a compare-and-set rather than a blind write (the
`if found` at :66 is meaningless without it).

**Why it is plausible.** `registro_claim.sql`'s own header (lines 11-16) argues the `v_n=1`
count is now redundant because `clientes_email_gym_uq` makes duplicates impossible. That
sentence is an invitation. The second hunk is what someone writes when an operator has edited
a claimed row's email and the member now cannot claim.

**Why every test stays green.** `pnpm test` mocks `.rpc()` outright. `pnpm test:denial` is not
in CI — and even when run, the 10 vectors in `registro_claim.sql` are V1 claim-on-match, V2
create-on-no-match, V3 phone-never-claims, V4a/V4b unique-index + now-unique claim, V5
unverified, V6 atomicity, V7 cross-gym, V8 RLS self-read, V9 firma, V10 aviso version.
**None presents an already-claimed row to a different caller.** `rpc-write-coverage.test.ts`
still passes — the function is listed and `registro_claim.sql` still invokes it; that guard's
own header states it cannot prove the suite asserts the right rows. `rpc-canon-drift.test.ts`
passes after `pnpm gen:rpc-canon`, because it re-derives from the same migrations.

**Member sees.** A second person sharing an address on a roster row takes over the first
member's paid balance and history. On the concurrency arm, two simultaneous claims both
"succeed" and the later one wins.

**Breaking point.** Requires a `clientes` row whose email was edited after a claim, or two
concurrent claims on one row. Rare — but it is the #78/#80 failure class exactly: a write
whose contract no test asserts.

**Cheapest guard.** One vector in `registro_claim.sql`: seed a cliente already bound to uid A,
call the RPC as uid B with a matching email, assert `auth_user_id` is unchanged.

Basis: **measured** (canonical body + the suite's vector list, both read at HEAD).
Prior: P-046 covers the mechanics; the *missing vector* is new this round.

---

### T8-09 — Quarantine one write-RPC coverage entry (severity 3, meta)

```diff
--- a/supabase/tests/rpc-coverage.json
+++ b/supabase/tests/rpc-coverage.json
-    "reclamar_o_crear_cliente": { "suites": ["registro_claim.sql", "gym2_probe.sql"] },
+    "reclamar_o_crear_cliente": { "quarantined": "flaky on scratch, see #NNN" },
```

**Guarantee broken.** `rpc-write-coverage.test.ts:56` — `if (entry.quarantined) continue;`.
One line turns off the obligation for a write-bearing RPC, and the guard reports a pass.

**Why every test stays green.** By construction: the quarantine arm checks only that the
reason string is non-empty and that any named suite is in QUARANTINE.

**Why it is plausible.** `test:denial` needs a scratch project and a PAT; the last known
scratch PAT is dead (memory `ibookit-app-ui-worktree.md`). A suite that cannot be run is a
suite that gets parked. Measured: `grep -n quarantined supabase/tests/rpc-coverage.json`
returns **nothing** today and the runner's `QUARANTINE` array is empty — so there is no
precedent yet to normalize it.

**Member sees.** Nothing, immediately. This is the meta-defect: it is how a *later* one-liner
in that RPC ships unnoticed.

**Cheapest guard.** Make `quarantined` require a tracker id **and** an expiry date, and fail
once the date passes — the same posture `anon-read-surface.test.ts` argues for in its header
("a PASS with no expiry and no re-runner is a belief"). ~8 lines.

Basis: **measured**.

---

### T8-10 — Drop `{ config: { private: true } }` from the señal channel (severity 3)

```diff
--- a/packages/data/src/client-senal.ts
+++ b/packages/data/src/client-senal.ts
@@ -209 +209 @@
-        .channel(`gym:${gymId}`, { config: { private: true } })
+        .channel(`gym:${gymId}`)
```

**Guarantee broken.** `senal_gym()` publishes with
`realtime.send(jsonb_build_object('t', tg_table_name), 'cambio', 'gym:' || v_gym::text, true)`
— `20260901120000_senal_gym.sql:82`, the trailing `true` being `private`. A non-private
subscription does not receive it. The whole freshness rail dies, and the one diagnostic that
exists (`console.warn("[senal] canal", estado)` at `client-senal.ts:215`, fired only on
`CHANNEL_ERROR`/`TIMED_OUT`) stays quiet, because the subscribe itself succeeds.

**Why it is plausible.** It is what a developer writes while debugging "why won't this channel
connect" — the `private` flag is the first thing you remove, and locally, with a stale JWT, it
is the thing that appears to be at fault.

**Why every test stays green.** `client-senal.test.ts` has 7 tests, all on `crearRegulador`
(the debounce). `useSenalGym` and the channel construction are never exercised. The consumers
are `.tsx`. `senal_gym.sql` (denial, convention) tests the DB half only.

**Member sees.** The regression the señal rail shipped 2026-09-02 to fix returns: the agenda
shows a class as available that filled 40 seconds ago; the pase checkbox on a second device
never updates. Nobody gets an error.

**Cheapest guard.** A unit test around `useSenalGym` with a fake supabase client, asserting
the second argument to `.channel()` is `{ config: { private: true } }`. ~10 lines.

Basis: **measured** for the code; **modelled** for the exact Realtime behaviour of a
non-private subscribe on this project (see §7).

---

### T8-11 — Re-point `JWKS_FALLBACK` at the wrong key during a rotation (severity 4, likelihood low)

```diff
--- a/packages/data/src/server/fetch-shield.ts
       kid: "76da07da-65ca-404a-a1ab-00c3d0b59d38",
-      x: "WmTwZR8rVIGrBbU2NZuH3Nxx6DjEbyum9Hy9u2a7g6E",
+      x: "<a well-formed but wrong P-256 x>",
```

**Guarantee broken.** The pin is the fallback verification key when `jwks.json` is unreachable
(`fetch-shield.ts:56-65`, with the ROTATION OBLIGATION stated in the comment).

**Why every test stays green.** `fetch-shield.test.ts:133-140` asserts only that
`crypto.subtle.importKey` accepts the JWK. **Any** well-formed P-256 JWK passes. Nothing
compares the pinned `kid` to the live endpoint.

**Member sees.** Nothing — until the next `jwks.json` outage, at which point every
`getClaims()` fails on an unknown `kid` and every member and operator is bounced to a login
form. The fallback becomes the outage it was written to prevent.

**Breaking point.** Only during a jwks outage — but that is precisely the 2026-08-29 event
this module exists for, and the failure is then 100% of requests for its duration.

**Cheapest guard.** A dated assertion plus a staleness rule: fail the test once a
`JWKS_PINNED_ON` constant is older than 90 days, so the pin is re-read on a schedule rather
than remembered at rotation time.

Basis: **measured**. Prior: P-015 / P-043 (F-18, one-liners #8) — **re-derived at HEAD**.

---

### T8-12 — Revert `/entrar`'s live-session redirect (severity 4)

```diff
--- a/apps/client/src/app/entrar/page.tsx
@@ -35,5 +35,0 @@
-  if (data?.claims?.sub) {
-    const miembro = await resolverMiembroGym(supabase);
-    redirect(destinoClases(modo(miembro?.reservasHabilitadas ?? true)));
-  }
```

**Guarantee broken.** 465dcf4's whole finding: the auth surface must not be session-blind.
Deleting this is the exact inverse of the one-line fix that shipped.

**Why it is plausible.** The block now costs a `resolverMiembroGym` round trip on every
`/entrar` render, including a signed-out visitor's first paint. "Don't query the DB on the
public login page" is a defensible-sounding perf note.

**Why the gates stay green — with an honest caveat.** `pnpm test` has no test for
`entrar/page.tsx` (it is `.tsx`). `e2e/session.spec.ts:94` — *"/entrar manda al panel a quien
ya tiene sesión"* — **does** cover it, and that is the counterweight: this is one of the few
items here with a real regression test. But it is not in CI or pre-commit, and
`session.spec.ts:63-66` skips the whole group when `E2E_EMAIL`/`E2E_PASSWORD` are unset,
exiting 0. A developer who never provisioned the sandbox credentials sees a green
`pnpm test:e2e`.

**Member sees.** The 2026-08-21 defect: a member with a healthy, auto-refreshing session is
shown a password form 37 seconds after a successful token rotation.

**Cheapest guard.** Make the skip loud — `test:e2e` should exit non-zero, or print a red
banner, when credentials are absent, rather than reporting a pass. One line in the skip
predicate.

Basis: **measured**. Prior: P-062 (evidence.md, incidents § 465dcf4) — **re-derived at HEAD**.

---

### T8-13 — Value-import a pill-less server module from an `apps/client` component (severity 2)

```diff
--- a/apps/client/src/app/reservar/_components/reservar-semana.tsx
+import { derivarEstadosDia } from "@gym/data/server/derive";
```

**Guarantee broken.** The client→server seam (audit 2026-06-30, shield S3).

**Why every gate stays green — and this is the interesting part.** The ESLint rule at
`eslint.config.mjs:20-38` has
`files: ["apps/admin/src/**/_components/**/*.{ts,tsx}", "apps/admin/src/app/providers.tsx", "apps/admin/src/**/template.tsx"]`
— **`apps/client` is not in the glob at all.** The guard that is supposed to keep that scope
exhaustive, `tools/guards/client-seam.test.ts`, walks `workspaceDirs("apps")` (both apps) but
only asserts that every `'use client'` file *lives under* `_components/`; it never checks the
ESLint `files` list. So the guard is green, the rule silently does not apply to the client
app, and the `server-only` poison pill is the only remaining backstop.

**Bounded, honestly.** Three modules are pill-exempt — `derive.ts`, `plantilla-ctx.ts`,
`export/rows.ts` (`server-only-coverage.test.ts:14`) — and all three are pure. So today the
worst outcome is bundle bloat, not a leaked secret. The defect is that the *scope* is silently
wrong, so the next pure carve-out added to `PURE_EXEMPT` inherits the hole. Measured:
`apps/client/src` holds **18** `'use client'` files, all under `_components/`, and **none**
currently value-imports `@gym/data/server`.

**Cheapest guard.** Add `"apps/client/src/**/_components/**/*.{ts,tsx}"` to the ESLint `files`
array — one line — and extend `client-seam.test.ts` to assert the glob covers every app the
walker visits.

Basis: **measured**. Not in the prior register.

---

## 3. Two more one-liners worth naming, and where they stop

### T8-14 — The `senal_gym` trigger table set is a single array literal

`20260901120000_senal_gym.sql:127`:
`foreach t in array array['reservation', 'class_session', 'clientes', 'ventas', 'asistencias']`.

Next month's feature adds a member-visible table (a pases ledger, a notification row) and its
writes emit no signal. Nothing derives the required set from the write surface, so no test can
go red. **This is an omission, not a diff that breaks a stated guarantee** — which is why it is
here rather than ranked — but the machine-guard gap is identical to G11's row. Cheapest guard:
a `tools/guards/` test that derives "tables with a `gym_id` column that a member-facing DAL
reads" from the migration replay and requires each to appear in the array.

### T8-15 — The `send-email` shell is triple-excluded

`supabase/functions/send-email/index.ts` is excluded from eslint (`eslint.config.mjs:56`),
from tsc, and from vitest coverage (`vitest.config.ts:54-56`). Any one-line change in it —
e.g. `p_app: "client"` → `p_app: null` in the gym lookup at `:57-60`, which would let an
admin-host `gym_domain` row win and put the wrong brand name on a member's confirmation mail —
passes every gate that exists, and `.husky/pre-push` only enforces that the function was
*deployed*, never that it is correct. Its pure core `correo.ts` is genuinely well covered (25
tests); the shell is the uncovered half.

---

## 4. What is genuinely sound here, with evidence (M2)

Stated because an unsupported criticism is cut the same way an unsupported reassurance is.

- **`enviarMagicLink`'s `shouldCreateUser: false`** — the guarantee that `/activar`'s
  `cuenta_existente` rail never provisions an account — **is** tested:
  `sesion.test.ts:293` *"forwards the trimmed email + shouldCreateUser:false + emailRedirectTo"*.
  A one-line flip fails `pnpm test`.
- **The firma-provenance split** (`intentarReclamoPorCodigo` mints vs `intentarReclamoConFirma`
  forwards) is the single most tempting DRY target on this path, and it is guarded:
  `registro.test.ts:500` *"forwards the RECEIVED firma verbatim — never mints one (audit §3 H2)"*
  and `:516` (an empty firma passes through for the RPC to reject). Folding the two fails `pnpm test`.
- **The `es_principal` outbound-host order** is guarded on two axes: the DAL ordering
  (`invitaciones.test.ts:262` — named for the 2026-08-28 live regression — and `gym.test.ts:278`),
  and the data invariant (`tools/guards/es-principal-invariant.test.ts`, with a parser tripwire
  and an explicitly stated scope limit).
- **Password trim parity** — the trap the module comment warns about ("trimming one alone is the
  bug, in either direction") — is covered at both ends: `sesion.test.ts:29` (verify) and `:157`
  (set), plus `registroSchema`'s `.trim()` at `registro.ts:37`. `iniciarSesion` has 11 tests.
- **RPC overloads** (the 9-hour 2026-08-27 sales outage) are now machine-refused from the
  migration replay by signature, not name: `tools/guards/rpc-overload.test.ts`. That class
  cannot silently recur.
- **`server-only` pill coverage** is enforced per module with an explicit 3-item exempt list and
  a "the glob never silently empties" tripwire (`server-only-coverage.test.ts:40-42`).
- **Transitive write detection**: `denial-suite.ts:181-195` closes the writer set over call
  sites to a fixpoint, so extracting a shared core cannot dissolve a coverage obligation — the
  #136 shape, anticipated and handled.
- Three fs-derived guards (`anon-read-surface`, `denial-suite-drift`, `es-principal-invariant`)
  carry **parser tripwires** — an assertion that the replay still finds a corpus. That directly
  prevents the "guard silently turned off but still green" mode, and most repos do not have it.

The pattern: **anything with a pure function and a `.test.ts` beside it is well guarded.
Everything that needs a request, a browser, or SQL is guarded by convention only.** The
new-user path is disproportionately made of the second kind.

---

## 5. Q6 — the explicit answer

> **Q6. If a developer adds a new feature next month, what is the most plausible ONE-LINE
> change that breaks a guarantee this code depends on, with all tests still green?**

**The single most plausible one is T8-02**: `cache()`-wrapping `getEsMiembro`. It is one word,
it makes the code *more* consistent with four neighbouring functions and with the file's own
`/reservar` comment praising memoization, it passes every gate — including a test written
specifically for that function — and it silently disarms the retry that rescues exactly the
cohort the owner is worried about: members whose claim did not land at the door. The only
thing between HEAD and that edit is a prose comment.

**The most damaging ones are T8-04 and T8-03**: widening the proxy teardown, or dropping one
`cookieOptions`. Both sign members out en masse, both are invisible to `pnpm test`, and
neither has any machine guard at all.

**The structural answer, which matters more than any single hunk:** the gates that can see this
path's failures are the two that nothing runs — `test:denial` and `test:e2e` — and the third
(`test:coverage`, threshold 100) is wired to a script that appears in no hook and no workflow.
`pnpm test` sees this path through two mocks that were built to make it testable and, in doing
so, made filters and SQL semantics unobservable: `.rpc()` returns a seeded constant, and `.eq()`
is recorded but never applied. **A one-line change is dangerous here in exact proportion to how
close it sits to a request, a browser, or Postgres** — and the member's whole journey is made
of those three.

---

## 6. Keep-verdicts (each with a digit-bearing exit trigger)

| # | Keep | Exit trigger |
|---|---|---|
| K1 | Keep `test:denial` and `test:e2e` as pre-merge conventions rather than CI gates — the credential / scratch-project reasons in AGENTS.md are real. | Exit when **2** production incidents in a rolling **90** days trace to a change a green-but-unrun convention gate would have caught. Count today = **1** (465dcf4: the defect was visible only to `session.spec.ts`, which did not yet exist). |
| K2 | Keep the `.rpc()` stub in `supabase-fake.test-helper.ts`; executing SQL in vitest needs a container per run. | Exit when `pnpm test:denial` has not been run green against a scratch or local-docker target for **30** consecutive days on `main`. |
| K3 | Keep `.eq("gym_id", …)` as a belt over RLS at all **82** sites. It is not redundant: `class_session_member_select` permits every gym the caller belongs to (`20260714080000:79-81`). | Exit only if a migration makes the member policy single-gym **and** a denial vector proves it — never on a reading of ADR-0013. |
| K4 | Keep `pnpm test:coverage`'s `thresholds: { 100: true }` in the config as a target. | Exit — i.e. wire it into CI — when measured statement coverage on `apps/client/src/app/**/actions.ts` first reaches **50%**. Today **9 of 10** of those files have zero tests. Until then the config should say "target", not read like a gate. |
| K5 | Keep the 4-site `cookieOptions` duplication; a wrapper around `createServerClient` would fight `@supabase/ssr`'s per-context cookie adapters. | Exit when the count of `@supabase/ssr` construction sites reaches **5**. At 5, "read all four and compare" stops being a reliable review habit and the exhaustiveness guard becomes mandatory. |
| K6 | Keep `rpc-coverage.json`'s `quarantined` escape hatch. | Exit when any entry carries `quarantined` for more than **14** days, or when the quarantined count exceeds **0** for two consecutive releases. Today the count is **0**. |
| K7 | Keep the `send-email` shell excluded from lint/tsc/vitest — Deno + `esm.sh` URL imports genuinely do not resolve in this toolchain. | Exit when `index.ts` exceeds **80** lines of non-comment logic; at HEAD it is **141 lines including comments** and delegates every decision to `correo.ts`. The exclusion is only safe while the shell is thin. |

---

## 7. Could not determine

| Question | The experiment that would settle it |
|---|---|
| Does React `cache()` actually memoize across the two `getEsMiembro(supabase)` calls in one Next 16 request — i.e. is T8-02's production failure certain rather than modelled? | Apply the diff on a branch, `next build && next start`, sign in as a member whose `gym_membership` row has been deleted, load `/reservar`, and count `gym_membership` SELECTs in the Supabase logs: **1** = the memoization bites and the member is stranded; **2** = it does not. I applied `inquilino.ts:62-66`'s own stated reasoning for `resolverMiembroGym`; I did not run it. **modelled — inputs: React `cache()` argument-identity semantics + `createClient()` being `cache()`-wrapped.** |
| Would a non-private Realtime subscription (T8-10) fail loudly or silently on this project? | Subscribe a browser to `gym:<id>` without `config.private` against live and observe whether `subscribe()` reports `SUBSCRIBED` or `CHANNEL_ERROR`. The `senal_gym_select` policy is on `realtime.messages` and gates the *private* path; the public path's behaviour with public channels disabled is not derivable from this repo. **reasoning, not sourced.** |
| Is the Supabase Auth Redirect-URL allow-list currently host-scoped to **both** of RED's client hosts? | A dashboard read, or a `signInWithOtp` probe from each host observing whether GoTrue clamps `redirect_to`. Not visible from the repo (`send-email/index.ts:11-14` says as much). Out of my territory, but it bounds T8-15's blast radius. |
| Does `pnpm test` actually pass at HEAD right now? | Run it. I did not (read-only mandate). Every "stays green" claim above means *"this diff touches no assertion I could find, and I read the assertions"* — not "I ran the suite before and after". |
| What is the real statement coverage of `apps/client/src/app/**/actions.ts`? | `pnpm test:coverage`, then read `coverage/coverage-summary.json`. I counted files-with-no-sibling-test (**9 of 10**) instead, which is a floor, not the number. |

---

## 8. Blind spots — what I did not examine

- **I ran no gate.** No `pnpm test`, no `test:denial`, no `test:e2e`, no `build`. Every
  green/red claim is derived from reading assertions and config at HEAD.
- **`apps/mobile/`** — untracked at HEAD, outside the stated scope; not opened.
- **`apps/admin` beyond `proxy.ts`** and the vender/clientes files named in the surface map. I
  confirmed there is no `apps/admin/src/proxy.test.ts`; I did not hunt admin-side one-liners.
- **`packages/ui` and `packages/brand`.** No one-liner from those packages is on this list. A
  brand-module change that alters the `/entrar` hero could plausibly break a form; I did not look.
- **The `.tsx` surface generally.** ~95 components, zero test infrastructure. I named the
  `signOut` case because it was greppable; I did not review components for other
  one-line-fatal props.
- **Live DB state beyond one query.** I ran exactly one live `select` (multi-gym membership
  count). I did **not** verify that the committed migrations match what is deployed
  (`list_migrations` not invoked), so a canonical body I quote could differ from prod — the same
  drift class that produced the 2026-08-27 overload outage.
- **`tools/guards/{docs,manifests,turbo,public-assets,loading-coverage,aviso-legal-drift}.test.ts`**
  — noted as existing, not read. One of them may already cover something I marked ✗.
- **Next 16's own docs** (`node_modules/next/dist/docs`). I made no framework-behaviour claim
  that needed them (the `cache()` claim is tagged `modelled`), so I did not read them — but the
  T8-02 memoization question is exactly the kind they would settle.
- **Q1–Q5 and Q7.** Out of territory. Where a finding here has a stress/idle/partial-failure
  face (T8-05 and T8-11 both are), I named it but did not develop it.

---

## 9. Draft audit — sentences cut or retagged, and the rule that caught each

| Draft sentence | Rule | Action |
|---|---|---|
| *"Removing `and auth_user_id is null` from `reclamar_por_codigo.sql:47` lets a second person re-claim a spent invite code."* | R5 (cite or drop) | **Cut.** The RPC sets `claim_code = null` on claim (`:67`), so a spent code is unfindable regardless of that predicate. The takeover needs a row holding *both* a live `claim_code` and a non-null `auth_user_id` — reachable only via the email rail, which does not clear the code. Too conditional to rank; the compare-and-set concern moved into T8-08's second hunk. |
| *"The ESLint seam gap lets a client component leak the service key."* | R5 / R7 | **Retagged and demoted to severity 2.** The `server-only` pill blocks every module holding a secret; only the 3 pure exempt modules are reachable. Rewritten to claim the *scope* defect, not a secret leak. |
| *"`shouldCreateUser: false` could be flipped in one line with tests green."* | R7 (honesty outranks severity) | **Cut and inverted into §4.** `sesion.test.ts:293` asserts it. Shipping it as a gap would have been an invented finding. |
| *"DRYing `intentarReclamoPorCodigo` and `intentarReclamoConFirma` is a green one-liner."* | R7 | **Cut and inverted into §4.** `registro.test.ts:500,516` guard exactly that. |
| *"Changing the `es_principal DESC` ordering is untested."* | R4 / R7 | **Cut and inverted into §4.** Three guards cover it, including a test named for the 2026-08-28 cutover regression. |
| *"`.eq('gym_id')` removal is a live cross-tenant data leak."* | R2 (name the number) | **Retagged to latent.** The live query returns exactly 1 multi-gym identity and it is staff, not a member. Rewritten as "latent, not live, as of 2026-09-02", with the go-live trigger named. |
| *"667× slower without the filter."* | R5 (the qualitative premise under a number is its own claim) | **Retagged `unverified this round`.** The measurement is from memory `adr-0013-rls-per-row-claim-is-false.md`, 2026-07-28, on `gym_membership` at 611k rows — not re-measured here, and not on `class_session`. |
| *"A blanket POST timeout in fetch-shield is the plausible edit."* | R1 / R5 | **Rewritten.** The blanket version fails `fetch-shield.test.ts:79-92`. Only the *targeted* `/auth/v1/token` hunk stays green, so that is the hunk written. |
| *"The 100% coverage threshold guards the app tier."* | R4 (the incumbent is a candidate) | **Cut.** `thresholds: { 100: true }` lives under `coverage`, `pnpm test` does not run coverage, and neither the hook nor CI invokes `pnpm test:coverage`. The threshold gates nothing. Turned into a measured row in §0 and exit-trigger K4. |
| *"The `senal_gym` array is a one-line break."* | R1 (rank, don't rate) / R5 | **Demoted out of the ranked list.** It is an omission-shaped drift, not a diff that breaks a stated guarantee; moved to §3 with its guard gap intact. |
| *"The `send-email` shell has no tests, so anything in it is dangerous."* | R5 | **Narrowed.** Replaced with one concrete, checkable hunk (`p_app: "client"` → `p_app: null`, `index.ts:57-60`) and the three exclusion cites, rather than a blanket worry. |
