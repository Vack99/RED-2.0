# RED custom-domain cutover — `www.redfunctionaltraining.com`

**Date:** 2026-08-27 · **Scope:** `apps/client` (the socios' booking panel) only. RED's admin
address `red-admin.ibookit.lat` is untouched.

**The serving host is `www.redfunctionaltraining.com`.** Vercel 308-redirects the apex at the
edge, so `apps/client/src/proxy.ts` never receives `Host: redfunctionaltraining.com`. Every
hostname written anywhere in this cutover must be that exact lowercase string. Verified live:

```
curl -o /dev/null -w '%{http_code} %{redirect_url}' https://redfunctionaltraining.com/
  → 308  https://www.redfunctionaltraining.com/
curl -o /dev/null -w '%{http_code}' https://www.redfunctionaltraining.com/   → 200
```

---

## 0. This is not a greenfield cutover — it is a live, half-broken surface

The domain is already attached to the client project's **production** deployment and serving.
Verified live 2026-08-27:

| URL | Today |
|---|---|
| `/` | 200, `data-brand="base"`, `<title>Inicio — Gimnasio</title>`, empty schedule, empty prices |
| `/registro`, `/activar` | 200 with `<h1>Sitio no reconocido</h1>` — refuse outright (safe) |
| `/entrar` | 200, **full login form including the "¿La olvidaste?" reset link** |
| `/legal` | the generic unattributed aviso, not RED's |

`/entrar` being live is the problem. **Password reset from the new host is silently broken right
now.** Proven with a bogus-token probe against GoTrue:

```
# NEW host — not allow-listed → clamped to the Site URL, PATH STRIPPED
303 → https://red.ibookit.lat/#error=access_denied&error_code=otp_expired…

# CONTROL: allow-listed host → full path echoed back verbatim
303 → https://red.ibookit.lat/auth/confirm?next=/restablecer#error=access_denied…
```

A non-allow-listed `redirect_to` is **silently replaced** by the Site URL. GoTrue returns 303 with
no complaint and `POST /auth/v1/recover` returns `200 {}` either way. The send-email hook then
faithfully mints the link on `https://red.ibookit.lat/` — the marketing **home page**, with no
`/auth/confirm` path — so nothing reads `token_hash`, no session is established, and the member is
stranded on a page that looks fine.

> `docs/runbooks/hitl-72-resend-live.md:224,248` claims a missing allow-list entry produces a loud
> `redirect_to not allowed` error. **That is false**, and believing it is why this went unnoticed.
> Correct those lines (see F2).

---

## 1. Which links move, and which do not

This is the fact the cutover turns on. **Only one of four link-minting rails uses the
oldest-row-wins host picker.** The other three derive `origin` from the live request host, so they
follow whichever door the member walked in through.

| Rail | Origin source | On the new host |
|---|---|---|
| Admin invite email | `construirUrlInvitacion` — `invitaciones.ts:112` `.order('created_at').limit(1)` | **holds** at `red.ibookit.lat` |
| Password reset | `entrar/actions.ts:34` `` `${x-forwarded-proto}://${host}` `` | **moves** to the new domain |
| `cuenta_existente` magic link | `activar/actions.ts:85`, same idiom | **moves** |
| Plain-signup confirm | `registro/actions.ts:45,49` | **moves** |

So "hold the emails on the old domain" is **not** free and **not** achievable without a code
change. Adding the `gym_domain` row is precisely what arms rails 2–4 onto a domain registered
hours ago (RDAP: `2026-08-28T01:38:57Z`) — which is why the allow-list entry must land first.

---

## 2. Blockers — all five, or the cutover is broken

| ID | Blocker | Executor |
|---|---|---|
| **B1** | Serving host is `www.redfunctionaltraining.com` (confirmed above) | — |
| **B2** | ✅ **DONE 2026-08-27** — Supabase Auth **Redirect URLs** gained `https://www.redfunctionaltraining.com/**`. Verified by probe (§3 Step 1), incl. a negative control. | owner (console) |
| **B3** | ✅ **DONE 2026-08-27** — Cloudflare **Turnstile** widget `0x4AAAAAADw0zgE_N--iabPb` gained `www.redfunctionaltraining.com` (now 6 of 10 hostnames). Browser check still owed (§3 Step 2). | owner (console) |
| **B4** | `gym_domain` gains one `app='client'` row → gym `red` | migration (this repo) |
| **B5** | Verification walked in a **fresh incognito profile**, no `gym` cookie, no `?gym=` | human |

**B5 is a blocker, not a nicety.** `proxy.ts:99` accepts `?gym=` *or* a persisted `gym` cookie as
an override, and on an unmapped host that override arm fires and the cookie is persisted. Anyone
who has ever loaded `https://www.redfunctionaltraining.com/?gym=red` sees a perfect RED site
forever, while every real member sees the base-brand shell. That is how a broken cutover gets
signed off.

---

## 3. Execution order

Every step is **additive**. `red.ibookit.lat` keeps its row and its Vercel attachment throughout,
so there is no half-cut state and no member is ever worse off than they are today.

### Step 1 — Supabase Auth allow-list. **THIS GOES FIRST.**

Console → Authentication → URL Configuration → Redirect URLs. Add exactly:

```
https://www.redfunctionaltraining.com/**
```

Keep every existing entry. Keep each entry single-host — never `https://**`, never a wildcard
subdomain. **Leave the Site URL alone** (`https://red.ibookit.lat`, path-less): it is the
platform-wide clamp target for all four gyms, and giving it an `/auth/confirm` path would arm the
#217 cross-tenant enrollment path.

Before editing, transcribe the current list verbatim and diff it against the 6-entry list at
`hitl-72-resend-live.md:246`; record any drift.

**Verify** (bogus token, harmless):
```
curl -s -o /dev/null -w '%{redirect_url}\n' \
  "https://hjppxawglmukfvsgmcog.supabase.co/auth/v1/verify?token=bogus&type=recovery&redirect_to=https%3A%2F%2Fwww.redfunctionaltraining.com%2Fauth%2Fconfirm%3Fnext%3D%2Frestablecer"
```
Expected **after**: the Location echoes `https://www.redfunctionaltraining.com/auth/confirm?next=/restablecer#error=…`
Expected **before** (today): `https://red.ibookit.lat/#error=…`

**Rollback:** delete the entry. Instant, no deploy.

> ✅ **APPLIED AND VERIFIED 2026-08-27.** Live probe results, with controls:
> ```
> NEW  www.redfunctionaltraining.com → 303 …/auth/confirm?next=/restablecer#error=…   path echoed  ✅
> APEX redfunctionaltraining.com     → 303 https://red.ibookit.lat/#error=…           clamped (correct — see below)
> CTRL red.ibookit.lat               → 303 …/auth/confirm?next=/restablecer#error=…   path echoed  ✅
> NEG  not-a-real-host-xyz.com       → 303 https://red.ibookit.lat/#error=…           clamped      ✅
> ```
> The negative control is what makes this proof rather than coincidence — it shows the probe
> discriminates. **The silent password-reset outage documented in §0 is closed.**
>
> **The apex is deliberately NOT allow-listed.** Vercel 308s it at the edge, so
> `headers().get("host")` is always `www.…` and no code path can mint a `redirect_to` on the apex
> origin. Adding it would be dead config. If Vercel's primary is ever flipped to the apex, that
> flip must carry this entry, the Turnstile hostname, and the `gym_domain` row together.

This step is a pure widening with zero user-visible effect, it closes an active silent outage, and
it is **safe in isolation** — with `next=/restablecer` present, `finalizarAuth` takes neither claim
branch (`auth/confirm/route.ts:56` gates the claim on `else if (!next)`), so no tenant resolution
is needed, and the hook degrades the sender to a neutral `Notificaciones` on an unknown host rather
than failing. Apply it today regardless of when the rest lands.

### Step 2 — Turnstile domains

Cloudflare → Turnstile → widget `0x4AAAAAADw0zgE_N--iabPb` → Settings → Domains. **Add**
`www.redfunctionaltraining.com`, keeping every existing entry. Via API use **PUT**, never PATCH.

**Do not mint a new sitekey.** `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is build-inlined
(`apps/client/turbo.json`), so a new key forces a Vercel env change plus a full redeploy.

**Verify:** open `https://www.redfunctionaltraining.com/contacto` with devtools — no `110200` in
console, widget renders, submit enabled. **Rollback:** remove the hostname. Instant.

> ✅ **APPLIED 2026-08-27.** Widget hostnames are now, verbatim: `forge-demo.ibookit.lat`,
> `forge.ibookit.lat`, `localhost`, `red-demo.ibookit.lat`, `red.ibookit.lat`,
> `www.redfunctionaltraining.com` — **6 of 10**. The browser check above is still owed; it cannot
> be curl'd, because hostname validation happens in the browser at challenge time, not at
> `siteverify`. The same production sitekey is served on both hosts (confirmed by curl), and it is
> **not** Cloudflare's always-pass test pair.
>
> **Why `www.` here while every other entry is bare** — this looks inconsistent and is not. Turnstile
> matches by suffix: *"adding a root domain covers all subdomains beneath it, while adding a specific
> subdomain restricts the widget to only that subdomain and its children"*
> (`developers.cloudflare.com/turnstile/concepts/hostname-management/`). Every entry in this list is
> the **exact serving host** — none of the `ibookit.lat` entries has a `www` variant, because
> `red.ibookit.lat` *is* the host the widget renders on. The proof that this is the intended
> discipline: `ibookit.lat` was **not** added, though one such entry would have covered all four
> tenants at once. `www.redfunctionaltraining.com` is the narrowest grant covering the actual
> serving host, so it follows the same rule. **Do not add the bare apex** — it can never render a
> widget (the 308 fires first), and under suffix matching it would silently widen the grant to every
> future subdomain.
>
> ### ⚠️ Platform ceiling discovered here: 10 hostnames per widget
> There is **one** Turnstile widget for the whole platform, and its sitekey is build-inlined
> (`NEXT_PUBLIC_TURNSTILE_SITE_KEY` via `apps/client/turbo.json`), so it cannot vary per tenant
> without a rebuild. Four gyms plus `localhost` already consume 5 slots; **every future BYO domain
> consumes one more, and the widget is full after 4 more.** At that point the fix is per-tenant
> sitekeys, which collides head-on with build-time inlining — i.e. it is an architecture change, not
> a config change. This is a gym-count scaling limit, the same axis as the domain-count analysis.
> Worth a ticket before the 3rd BYO domain, not the 9th.

**Why before step 3:** the four Turnstile-guarded forms fail **silently** — `turnstile.ts:22` is
`if (!token) return false` and none of the four `<Script>` tags has an `onError` handler, so the
member gets a permanently disabled submit button with no message. Today `/registro` and `/activar`
refuse outright and are therefore *honest*. Step 3 turns them into forms. Turning on the forms
before the captcha trades an honest refusal for a silent dead end.

### Step 3 — the `gym_domain` row

`supabase/migrations/20260827210000_red_custom_domain_client_host.sql`, applied via MCP
`apply_migration`. **Never** `supabase db push`, **never** `supabase link` to prod (56 of 78
filenames are unrecognized upstream → it would re-apply, seeds included).

**Verify — SQL first.** `on conflict do nothing` makes the step idempotent, which also means a
typo'd hostname inserts silently. Confirm the literal string landed:
```sql
select d.hostname, d.app, d.created_at
from public.gym_domain d join public.gym g on g.id = d.gym_id
where g.slug = 'red' order by d.created_at;
```
Expect **4** rows: `red.localhost/client`, `red.ibookit.lat/client`, `red-admin.ibookit.lat/admin`,
`www.redfunctionaltraining.com/client`.

**Verify — HTTP, after waiting 60 s** (`resolve-tenant.ts:62` `CACHE_TTL_MS = 60_000`, positive
*and* negative caching, per warm lambda — expect up to ~60 s of mixed results if you refresh):
```
curl -s https://www.redfunctionaltraining.com/ | grep -o 'data-brand="[a-z-]*"'      # → "red"   (today: "base")
curl -s https://www.redfunctionaltraining.com/ | grep -o '<title>[^<]*</title>'       # → Inicio — RED
curl -s https://www.redfunctionaltraining.com/activar | grep -c 'Sitio no reconocido' # → 0       (today: 1)
curl -s https://red.ibookit.lat/ | grep -o 'data-brand="[a-z-]*"'                     # → still "red"
```

**Rollback:** `delete from public.gym_domain where hostname='www.redfunctionaltraining.com';` —
reversible, but not instant (warm lambdas hold the positive resolution ≤60 s).

**Do NOT redeploy to bust the cache.** A cold start is the same 0–60 s window, and a push to `main`
deploys **both** Vercel apps and needs explicit owner consent for that specific push.

### Step 4 — auth walk on the new host

Human, with a disposable `+alias` — never a real member, never by deleting an auth user.

1. `/entrar` → login → lands authenticated on `/reservar`.
2. Close the browser, reopen → still logged in.
3. `/entrar` → "¿La olvidaste?" → mail arrives **From: `RED <no-reply@ibookit.lat>`** (a neutral
   `Notificaciones` sender proves the row didn't take) **and** the link host is
   `www.redfunctionaltraining.com` (a `red.ibookit.lat` link proves the allow-list entry is missing).
4. Click → lands on `/restablecer` on the new host with a live recovery session.
5. `/registro` and `/contacto` → Turnstile renders, submit succeeds.

### Step 5 — commit locally

Pre-commit runs `pnpm lint && pnpm typecheck && pnpm test`. **All three will be green and none of
them carries any information about this cutover** — every test that touches `gym_domain` injects a
fake, no test asserts a row count or a host list, and `git grep redfunctional` returns zero hits.
Do not cite "tests pass" as cutover evidence; the step 1–4 verifications are the evidence.

`pnpm test:denial` is the migration-bearing pre-merge convention. **Trap:** the scratch PAT is dead
(`401`), so this runs via the local docker path, which does **not** auto-apply migrations — apply
this migration to the scratch DB by hand first, or the green run never exercised it. The derived
obligation set is unchanged (DML only, no function body touched): **no** new suite file, **no**
`rpc-coverage.json` entry, **no** `pnpm gen:rpc-canon`.

**Do not push.** Push is owner-gated per push.

### Step 6 — tell the humans (the only irreversible step)

Do not start until every verification above is green.

- Announce as an **additional** address, never as a migration. Include verbatim: *"si el link no
  abre, prueba con datos móviles"* — a domain this new is exactly the FortiGuard-uncategorized case
  behind the 2026-08-19 block.
- Members sign in **once** on the new address: *"la primera vez que entres a la dirección nueva te
  va a pedir tu correo y contraseña otra vez; la dirección anterior sigue funcionando."* This is
  unavoidable and has no technical mitigation — `__Host-sb-auth-token`
  (`cookie-options.ts:36`) forbids a `Domain` attribute by RFC and the two registrable domains
  differ, so no cookie can span them.
- Do **not** tell anyone to stop using `red.ibookit.lat`.
- RED's admin address is unchanged: `red-admin.ibookit.lat`.
- Before announcing, have the desk confirm which members have never activated — an accountless
  member typing email+password gets the opaque `"Correo o contraseña incorrectos."`
  (`sesion.ts:78`), so a re-login prompt will surface them as tickets. **Do not mass-mint magic
  links** to migrate sessions: that many auth mails against a 50/hr GoTrue cap on a Resend free
  tier is the weakest link in the system.
- **Rollback: NONE.** You cannot un-send a WhatsApp.

---

## 4. Proven no-ops — do not do these

- **No redeploy.** `apps/client/turbo.json` declares exactly three build-inlined env vars
  (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY`); none carries a tenant host. Every host-shaped string is
  derived per-request.
- **No `next.config.ts` / `vercel.json` change.** Only path-scoped `Referrer-Policy` rules and HSTS
  on `/(.*)`; both apply to the new host automatically. No `redirects()`, `rewrites()`, `basePath`,
  or `assetPrefix`.
- **No CSP / CORS / frame-ancestors anywhere in the repo.** There is no host allow-list to extend.
- **No `gym_id_por_host` change.** Live body is byte-identical to
  `supabase/functions-canonical/`, single overload. A new row is just data. Host is lower-cased and
  port-stripped before the lookup (`resolve-tenant.ts:168`), so no case/port variant row is needed.
- **No `gym_domain` DDL.** There is no unique on `(gym_id, app)`, so a second client row is
  structurally legal.
- **No test / guard / suite edits.** `gym_tenant_anon_read.sql:53` picks `order by hostname limit 1`
  = `forge-admin.ibookit.lat`, unchanged. `anon-read-allowlist.json` is keyed on tables and
  deliberately excludes `gym_domain` (#216). Adding `gym_id_por_host` to `rpc-coverage.json` would
  **fail** `rpc-write-coverage.test.ts` — it is a pure reader. `playwright.config.ts` is pinned to
  the `red-demo-client.localhost` twin.
- **No SPF / DKIM / Resend work on the new domain.** `correo.ts:16` hardcodes
  `no-reply@ibookit.lat`; only the display name is per-gym. The new domain never appears in an
  envelope, only in an href.
- **No in-flight invite is invalidated.** `firmaCodigo` (`registro.ts:178`) signs
  `activar:v1:${codigo}` — the HMAC has **no host component**.
- **`PLATFORM_CLIENT_FALLBACK_HOST` stays `app.ibookit.lat`.** Pointing it at the new domain would
  make `?gym=` structurally inert there (host wins), so every *unmapped* gym's fallback invite
  would resolve to RED.
- **No persisted row anywhere carries a hostname except `gym_domain.hostname`** — proven twice
  against prod. No consent record, receipt, or WhatsApp template embeds a URL.
- **No PWA / service worker / manifest / robots / sitemap / analytics / OAuth origin exists.**
- **No scheduled path mints a member-facing URL** — the single Vercel cron is path-scoped and the
  single pg_cron job (`roll-class-horizon`) is pure SQL.
- **The `/activar` cross-tenant shield does not misfire** with two hosts per gym:
  `activar/page.tsx:46` compares gym **slugs**, and both RED hosts stamp `x-gym=red`.
- **`red-admin.ibookit.lat` is untouched.** `apps/admin/src/proxy.ts:33` declares `'admin'` and
  `gym_id_por_host` filters on `d.app = p_app`.

---

## 5. Forbidden — irreversible or outage-grade

1. **Deleting the `red.ibookit.lat` row.** The row comes back with one statement, but the window
   strands every already-sent auth link and unclaimed invite at `Sitio no reconocido`, and for a
   multi-gym member `resolverMiembroGym` falls back to their **oldest membership** — silently
   serving the wrong gym's agenda. A Vercel 308 preserves path and query; an unmapped host does not.
2. **Widening `gym_id_por_host`'s argument list.** `create or replace` at a new signature creates a
   **second overload** → PostgREST 300/PGRST203 on the host lookup in **both** proxies on **every**
   host: an instant platform-wide outage. This is the 2026-08-27 `registrar_venta` shape on a hotter
   path. The canonical-host rule belongs in the DAL selectors, never in the resolver.
3. **Giving the Supabase Site URL a path.** The #217 cross-tenant enrollment fuse is disarmed *only*
   because the clamp target is a bare origin.
4. **Publishing a partial CAA record** on the new zone. Currently NODATA, which is correct and safe.
   A partial set fails renewal silently ~60–90 days later. Either publish none, or mirror Vercel's
   full set (`letsencrypt.org`, `globalsign.com`, `pki.goog`, `sectigo.com`).
5. **Editing WHOIS registrant data.** Restarts a 15-day ICANN re-verification clock — now a risk on
   two domains.

### Out-of-order blast radius

| Wrong order | What breaks |
|---|---|
| Row **before** allow-list | `/registro` + `/activar` go live; members register; confirm/reset links clamp to the *home page* with the path stripped; token burned, no session, member stranded, zero signal |
| Row **before** Turnstile | Forms render, submit stays permanently disabled with **no error text**; account creation dead on the new domain, undiagnosable from the client |
| Announce **before** verification | Members meet `Inicio — Gimnasio`, empty schedule, empty prices, a generic aviso, and two doors that refuse |
| Verify with a `gym` cookie or `?gym=red` | A perfect RED site for you, a base-brand shell for every member — sign-off theatre |
| Allow-list **before** row | **Benign.** Unbranded sender, base-brand `/restablecer`, session established, no claim attempted. Step 1 is safe alone. |

**Emergency stopgap:** `https://www.redfunctionaltraining.com/?gym=red` renders a fully correct,
fully branded RED site right now, and the `gym` cookie keeps it working across navigations. Valid
to hand out; **not** valid as verification.

---

## 6. Follow-ups (batch into one owner-consented push, after the cutover)

**F1 — canonical-host precedence.** There are **five** oldest-row-wins selectors, not one:
`construirUrlInvitacion` (`invitaciones.ts:114`), `getClientHost` (`gym.ts:146`), `getAdminHosts`
(`gym.ts:123`), plus two reimplemented client-side on the `mobile-admin` branch
(`apps/mobile/src/data/cuenta.ts:72,107` → `cuenta/legal.ts:129`, and `data/respaldo.ts:81`).
Visible consequence today: the admin CUENTA screen previews the aviso's `{{url_aviso_integral}}` as
`https://red.ibookit.lat/legal` while members on the new host read
`https://www.redfunctionaltraining.com/legal` (`aviso-legal.ts:33` derives it from the live
request). Ship as schema + code:
1. `alter table public.gym_domain add column es_principal boolean not null default false;` +
   `create unique index gym_domain_principal_uniq on public.gym_domain (gym_id, app) where es_principal;`
   + backfill the current non-localhost winner per `(gym_id, app)`. The **partial unique index is
   the only shield in this repo's toolkit that binds a row typed into the Supabase dashboard** —
   every `tools/guards/*` replays migrations and is blind to prod drift, which is exactly how the
   2026-08-27 `registrar_venta` outage happened.
2. Replace `.order('created_at')` with `.eq('es_principal', true)` in all three DAL selectors.
3. Regenerate `packages/data/src/database.types.ts` in the same commit (pre-commit runs typecheck).
4. ~15 lines in `supabase/tests/gym_tenant_anon_read.sql` (already in `SUITE`) proving the index
   refuses a second `es_principal` row per `(gym_id, app)`.
5. Invert `gym.test.ts:213` and `:296` (both pin oldest-wins *and* `orderCalls == ['created_at']`);
   add the arm to `invitaciones.test.ts` beside the existing `:237` localhost case.
6. Flip RED last, one statement, when the domain has a web-filter category:
   `update public.gym_domain set es_principal = true where hostname = 'www.redfunctionaltraining.com';`
7. **Mobile-lane merge obligation** — record in `docs/mobile/HANDOFF-2026-08-26-RESKIN-EXECUTION.md`,
   same mechanism as the `registrar_venta` migration-dedupe trap: patch `cuenta.ts` (SELECT list +
   filter), `legal.ts:129`, `respaldo.ts:83`, and `filas.ts:122`
   (`HOST_FALLBACK = "ibookit.lat"`, printed to a BYO-domain operator). Otherwise merging the mobile
   lane silently reintroduces oldest-wins in two more places that cannot even see `es_principal`.

*Rejected:* backdating `created_at` (encodes a lie in a column three surfaces tie-break on);
deleting the old row (see Forbidden #1).

**F2 — docs that will actively mislead the next agent.**
`hitl-72-resend-live.md:224,248` (the false "loud error" claim — replace with the curl probe above;
update §C2 and the `:246` count from 6 to 7 and the host table at `:19-22`);
amend **ADR-0012 §5** (a BYO-domain customer gets a *second* `app='client'` row — inbound resolution
is genuinely N→1, but **outbound** link minting must name exactly one canonical host, and that must
be a declared fact rather than an insertion-order accident);
`ADR-0015:15` ("canonical client host", undefined);
`CONTEXT.md:51` (states a one-host-per-gym shape);
`2026-08-19-member-reachability-todo.md` (mark D3 partially resolved for RED only; the
"Rejected → NRD blocking" reasoning was derived from `ibookit.lat` being 41 days old and does not
cover a domain registered hours ago; add both hostnames to items 6 and 10);
one-line staleness banners on `docs/brand/07-app-ui/AUDITORIA-BRANDING.md` (finding 6 closed by
#275) and `hitl-16-vercel-deploy-verify.md:32-52` (tells you to edit a deleted file and push to
`main`) — leave those bodies untouched, they are dated evidence logs;
`invitaciones.ts:88-96` TSDoc (frames multiple client hosts as a "dev mirror + live" artefact —
after this cutover both are live and member-facing);
`cookie-options.ts:42` (the stale "shared `ibookit.lat` registrable domain" premise invites someone
to "fix" it by adding a `Domain` attribute, which would break `__Host-` outright).

**F3 — `docs/operador/red-tu-direccion.md`**, mirroring `forge-tu-direccion.md`. Two addresses kept
apart: RED's panel (`red-admin.ibookit.lat`, unchanged) and the socios' address, plus a
copy-pasteable WhatsApp line and *"la dirección anterior sigue funcionando — no le pidas a nadie que
la borre."* Step 6 is irreversible and currently has no written source of truth for what to paste.

**F4 — make the magic-link rail observable.** `sesion.ts:119-130` discards the SDK result entirely
— no `error` binding to log — so the `cuenta_existente` activation rail fails with no trace at all.
One line, matching `:97-105`.

**F5 — TLS fuses.** Add both new hostnames to the reachability item-6 monitor
(`notAfter 2026-11-26`). Separately **calendar 2026-09-10**: the nine `ibookit.lat` certs expire
**2026-10-07** and renewal has never once run. HSTS is `max-age=86400` with no
`includeSubDomains`/`preload`, so a lapse is a 24h rolling lockout for active members, not a total
one — worth the calendar entry, not worth reordering this cutover.

**F6 — DMARC.** `_dmarc.ibookit.lat` is `p=none` with **no `rua=`**, so there is no way to detect
RED's mail landing in Junk once the link domain diverges from the sender domain. Add `rua=`.
`_dmarc.redfunctionaltraining.com` is NXDOMAIN — anyone can spoof
`From: recepcion@redfunctionaltraining.com` at RED's own members; publish `p=none` with `rua=`.
**Do not** touch that zone's MX or SPF (it would delete RED's email forwarding), and if RED ever
adds a mailbox, **merge** the include into the single existing SPF TXT — a second record is a
PermError that fails all their mail.

**F7 — operator data.** RED's `gym_contact` and `gym_legal` are **empty**, so `/contacto` on the new
branded domain lists zero channels and `/legal` serves the generic unattributed aviso — while that
aviso tells members to exercise ARCO rights "por los canales de la sección Ayuda y contacto". One
form fill in the admin app closes both.

---

## 7. Standing rule for this and every future BYO domain

**Every step is additive. A platform-subdomain host is never un-mapped** — not "later", not "once
everyone has moved". It lives in members' bookmarks, in their chat history, and in every invitation
ever sent. If a host must ever be retired, convert it to a Vercel **308 to the new host first**
(which preserves path and query, so old `/auth/confirm` and `/activar` links land correctly), and
only then delete the row.

---

## ⚠️ Owner-owed inputs

1. **B2 + B3** — the two console actions above. Neither is reachable from this repo: the
   `SUPABASE_ACCESS_TOKEN` in `apps/admin/.env.local` returns `401` (dead PAT) and there is no
   Cloudflare credential here.
2. **Company Name + public reply-to email** for the FortiGuard / seven-vendor categorization
   submissions (still unpaid from the 2026-08-19 reachability TODO). Longest-latency item;
   submit `www.redfunctionaltraining.com` **and** the apex, category *Health and Wellness*.
3. **Who holds the `redfunctionaltraining.com` registration** — your Namecheap account or RED's?
   If RED holds it and stops paying, their booking page disappears with no path back; RDAP exposes
   no auto-renew field, so it is not externally monitorable. Confirm auto-renew ON, registrar lock
   ON (RDAP shows `client transfer prohibited` — good), 2FA ON. Expiry `2027-08-28`.
4. **SAT persona-física details** (nombre, RFC, régimen, domicilio fiscal, correo) — pre-existing
   debt, now doubly load-bearing: editing WHOIS registrant data arms a 15-day ICANN re-verification
   clock, and that risk now applies to two domains.
