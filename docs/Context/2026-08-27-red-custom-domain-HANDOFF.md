# HANDOFF — RED custom-domain cutover (`www.redfunctionaltraining.com`)

**Session:** 2026-08-27 · **Type:** research only, **nothing applied, nothing committed, nothing pushed**
**Next session's job:** execute the cutover. Everything you need is below and in the two files it points at.

---

## 0. Read these three files, in this order

| File | What it is | Trust |
|---|---|---|
| **this file** | orientation: what happened, what we learned, what bit us | start here |
| **`docs/runbooks/red-custom-domain-cutover.md`** | **the instruction set.** Ordered steps, verification commands, rollbacks, no-ops, forbidden acts, follow-ups | **authoritative** |
| `docs/Context/2026-08-27-red-custom-domain-findings-appendix.md` | all 93 raw findings verbatim, by dimension, with verdicts | audit trail only — **superseded in 3 places, see its own header banner** |

Plus one uncommitted artifact already on disk:
**`supabase/migrations/20260827210000_red_custom_domain_client_host.sql`** — written, reviewed, **not applied**.

---

## 1. The ask

RED (a live gym tenant, 55 `clientes`, 33 with accounts) bought their own domain. The owner had
already added **both** `redfunctionaltraining.com` and `www.redfunctionaltraining.com` to Vercel;
both showed "Valid Configuration". The task: associate that domain with RED's **booking page**
(`apps/client`) correctly and completely — find every change needed, shield the process, assume
nothing.

Scope explicitly **excludes** the admin app. `red-admin.ibookit.lat` is untouched.

---

## 2. What we did

1. **Scouted the seam inline** — read `resolve-tenant.ts`, both `proxy.ts` files, `cookie-options.ts`,
   `invitaciones.ts`, `send-email/{index,correo}.ts`, `auth/confirm/route.ts`, the two `gym_domain`
   migrations, and `anon-read-allowlist.json`.
2. **Queried live prod** via Supabase MCP for the real `gym_domain` table state.
3. **Ran a 16-agent research workflow** (`wf_17fb695e-2e1`): 7 dimension finders → 7 adversarial
   verifiers (one per dimension, refute-by-default) → synthesizer → completeness critic.
   2.15M subagent tokens, 752 tool calls, 36 min, 0 errors.
   Result: **93 findings survived** (88 CONFIRMED, 5 CORRECTED, 0 refuted) + **17 misses** the
   verifiers caught + **6 gaps** the critic caught in the synthesized plan itself.
4. **Personally re-verified the three load-bearing claims** against live systems before believing them
   (§3 below). Two of them changed the plan.
5. Wrote the runbook, the migration, and the appendix. Stopped at the owner's instruction —
   **no console action, no migration, no commit, no push.**

---

## 3. What we verified live (not inferred — reproduce these to confirm nothing drifted)

```bash
# 1. www is the SERVING host; the apex 308s at the Vercel edge
curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n' https://redfunctionaltraining.com/
#   → 308 -> https://www.redfunctionaltraining.com/
curl -s -o /dev/null -w '%{http_code}\n' https://www.redfunctionaltraining.com/          # → 200

# 2. the new host resolves NO tenant today
curl -s https://www.redfunctionaltraining.com/ | grep -o 'data-brand="[a-z-]*"'          # → "base"
curl -s https://www.redfunctionaltraining.com/ | grep -o '<title>[^<]*</title>'          # → Inicio — Gimnasio
curl -s https://www.redfunctionaltraining.com/activar | grep -c 'Sitio no reconocido'    # → 1
curl -s https://red.ibookit.lat/ | grep -o 'data-brand="[a-z-]*"'                        # → "red"  (old host healthy)

# 3. THE ONE THAT MATTERS — the Auth redirect allow-list is missing the new host,
#    and the failure is SILENT with the path stripped. Bogus token, harmless.
curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n' \
 "https://hjppxawglmukfvsgmcog.supabase.co/auth/v1/verify?token=bogus&type=recovery&redirect_to=https%3A%2F%2Fwww.redfunctionaltraining.com%2Fauth%2Fconfirm%3Fnext%3D%2Frestablecer"
#   → 303 -> https://red.ibookit.lat/#error=access_denied…          ← CLAMPED, PATH GONE
# control, an allow-listed host:
curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n' \
 "https://hjppxawglmukfvsgmcog.supabase.co/auth/v1/verify?token=bogus&type=recovery&redirect_to=https%3A%2F%2Fred.ibookit.lat%2Fauth%2Fconfirm%3Fnext%3D%2Frestablecer"
#   → 303 -> https://red.ibookit.lat/auth/confirm?next=/restablecer#error=…   ← path echoed intact
```

**Live `gym_domain` for `red` (2026-08-27):**

| hostname | app | created_at |
|---|---|---|
| `red.localhost` | client | 2026-07-02 15:53:25 |
| `red.ibookit.lat` | client | 2026-07-09 07:50:17 |
| `red-admin.ibookit.lat` | admin | 2026-07-09 07:50:17 |

No row for the new domain. That is the entire DB delta.

---

## 4. What we learned — the five things that change how you'd do this

### 4.1 This is not a greenfield switch. The domain is already serving production, half-broken.

Adding the domain in Vercel was enough to make it **serve** — it just serves the tenant-less base
brand. `/registro` and `/activar` refuse with `Sitio no reconocido` (honest, safe), but **`/entrar`
is live, including the password-reset link**, and reset from that door is silently broken today
(probe 3 above). A member who resets there burns their token on RED's marketing home page and is
stranded, with no error surfaced to them, to the desk, or to any log.

**Consequence for sequencing:** the Supabase allow-list entry is not just cutover prep — it closes a
live outage, and it is safe to apply completely alone (proven: with `next=/restablecer` present,
`auth/confirm/route.ts:56` gates the claim on `else if (!next)`, so no tenant resolution happens;
the send-email hook degrades to a neutral sender on an unknown host rather than failing).

### 4.2 The failure mode of a missing allow-list entry is SILENT, and our own runbook says otherwise.

`docs/runbooks/hitl-72-resend-live.md:224,248` claims a non-allow-listed `redirect_to` produces a
loud `redirect_to not allowed` error. **Live-disproven.** GoTrue returns a 303 to the Site URL with
the path stripped and no complaint; `POST /auth/v1/recover` returns `200 {}` either way. That false
belief is the reason this went unnoticed. **Fixing those two lines is a follow-up (F2) and matters
more than it looks** — it is the doc a future agent will trust.

### 4.3 The "oldest-row-wins" trap is real but covers only 1 of 4 link rails. The other 3 follow the request host.

This was the single biggest correction of the session — the synthesized plan got it wrong, and the
completeness critic caught it.

| Rail | Origin source | Behaviour on the new host |
|---|---|---|
| Admin invite email | `construirUrlInvitacion` (`invitaciones.ts:112`, `.order('created_at').limit(1)`) | **holds** at `red.ibookit.lat` |
| Password reset | `entrar/actions.ts:34` `` `${x-forwarded-proto}://${host}` `` | **moves** |
| `cuenta_existente` magic link | `activar/actions.ts:85`, same idiom | **moves** |
| Plain-signup confirm | `registro/actions.ts:45,49` | **moves** |

So **"hold the emails on the old domain while the new one ages" is not free and not achievable
without a code change.** Adding the `gym_domain` row is exactly what arms rails 2–4 onto a domain
registered hours before (RDAP `2026-08-28T01:38:57Z`). This is what forces the ordering:
**allow-list → Turnstile → row**, never any other order.

### 4.4 Zero code changes, zero redeploy. It is three external/data actions.

`apps/client/turbo.json` declares exactly three build-inlined env vars
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`NEXT_PUBLIC_TURNSTILE_SITE_KEY`) — **none carries a tenant host.** Every host-shaped string in the
client app is derived per-request. There is no CSP, no CORS list, no `redirects()`, no `basePath`,
no manifest, no robots, no sitemap, no service worker. See the runbook's no-op list (it is long, and
each entry is proven — it exists so you don't re-derive them).

Do **not** redeploy to bust the 60s tenant cache. A cold start is the same window, and a push to
`main` deploys **both** Vercel apps and needs explicit owner consent for that specific push.

### 4.5 Two of the three actions are not reachable from this repo.

- **Supabase Auth allow-list** — the `SUPABASE_ACCESS_TOKEN` in `apps/admin/.env.local` returns
  **`401 Unauthorized`** (dead PAT, consistent with the known scratch-PAT expiry). The Management API
  cannot read or write the allow-list from here. Console only.
- **Cloudflare Turnstile domains** — no credential in this repo at all. Console only.

Plan for them as owner actions, not agent actions. The migration (action 3) *is* applicable from
here via MCP `apply_migration`.

---

## 5. What we encountered — traps, surprises, and things that would have bitten us

| # | What | Why it matters |
|---|---|---|
| 1 | **`www` vs apex.** The screenshot showed both "Valid Configuration", which reads as "both serve". They don't — Vercel 308s the apex. An apex `gym_domain` row would never be consulted *and* would add a second `limit 1` candidate to three host pickers. | The synthesizer originally recommended the apex row. Killed by a live probe. |
| 2 | **Backdating `created_at`** to move invite mail was recommended by two finder agents. | Rejected: it encodes a lie in a column three surfaces tie-break on, and a future "cleanup" of that timestamp silently walks every RED invite back. Real fix = `es_principal` column (F1). |
| 3 | **There are FIVE oldest-row-wins selectors, not three.** Two are reimplemented client-side on the untracked `mobile-admin` branch (`apps/mobile/src/data/cuenta.ts:72,107` → `cuenta/legal.ts:129`; `data/respaldo.ts:81`), and they can't even see an `es_principal` column since `SELECT_DOMINIO` is the literal string `"hostname"`. Also `filas.ts:122` hardcodes `HOST_FALLBACK = "ibookit.lat"` and prints it to the operator. | Ship F1 on `main`, merge the mobile lane, and the trap silently returns in two more places. Recorded as a merge-time obligation. |
| 4 | **`?gym=` / the `gym` cookie make verification lie.** `proxy.ts:99` accepts either as an override, and on an unmapped host the override arm fires and persists the cookie. Anyone who has ever loaded `…/?gym=red` sees a perfect RED site forever while every member sees the base shell. | **Verify only in a fresh incognito profile.** This is how a broken cutover gets signed off. It is a blocker in the runbook, not a footnote. |
| 5 | **Turnstile fails silently.** `turnstile.ts:22` is `if (!token) return false`, and none of the four `<Script>` tags has an `onError`. A member gets a permanently disabled submit button with no message. | The `gym_domain` row converts `/registro` + `/activar` from an honest refusal into a silent dead end. Turnstile **must** precede the row. |
| 6 | **`gym_id_por_host` must not be touched.** Live body is byte-identical to `functions-canonical/`, single overload. Widening its signature via `create or replace` would create a second overload → PostgREST 300/PGRST203 on the host lookup in **both** proxies on **every** host. | That is the 2026-08-27 `registrar_venta` outage shape on a hotter path. The canonical-host rule belongs in the DAL selectors. |
| 7 | **Session loss is unavoidable and has no mitigation.** `__Host-sb-auth-token` (`cookie-options.ts:36`) forbids a `Domain` attribute by RFC; the two registrable domains differ. 33 RED users see a login form on the new host. | Must be communicated, not engineered around. And **do not mass-mint magic links** to migrate them: 33 auth mails against a 50/hr GoTrue cap on Resend free tier is the weakest link in the system. |
| 8 | **22 of RED's 55 `clientes` have no `auth.users` row.** An accountless member typing email+password gets the opaque `"Correo o contraseña incorrectos."` (`sesion.ts:78`). | A re-login prompt will surface them all as desk tickets at once. Have the desk pre-identify them. |
| 9 | **RED's `gym_contact` and `gym_legal` are EMPTY.** `/contacto` lists zero channels; `/legal` serves the generic unattributed aviso — while that aviso tells members to exercise ARCO rights "por los canales de la sección Ayuda y contacto". | Branding the new domain makes this newly visible on RED's own domain. One admin form fill closes both. (F7) |
| 10 | **The `pnpm test` suite carries zero information about this cutover.** Every test touching `gym_domain` injects a fake; none asserts a row count or host list; `git grep redfunctional` returns zero hits. | Green tests are **not** cutover evidence. The runbook's HTTP/SQL probes are. Say so out loud in the commit. |
| 11 | **`pnpm test:denial` trap.** The scratch PAT is dead, so it runs via the local docker path — which **does not auto-apply migrations**. | Apply this migration to the scratch DB by hand first, or the green run never exercised it. |
| 12 | **`_dmarc.redfunctionaltraining.com` is NXDOMAIN** and the zone has Namecheap forwarding MX + an SPF record. | Anyone can spoof `From: recepcion@redfunctionaltraining.com` at RED's own members. Publish `p=none; rua=`. **Do not** touch the MX/SPF — that would delete RED's email forwarding — and never add a *second* SPF TXT (PermError fails all their mail). |
| 13 | **CAA on the new zone is NODATA, which is correct.** The apex is an A record, so CAA resolves at the zone and does not climb to Vercel's alias. | Publishing a *partial* CAA set fails cert renewal silently ~60–90 days later, behind HSTS. Either none (current) or Vercel's full set. Listed as forbidden. |

---

## 6. Decisions already made (with reasons — don't relitigate without new evidence)

| Decision | Ruling | Reason |
|---|---|---|
| Serving host | **`www.redfunctionaltraining.com`**, no apex row | Vercel 308s the apex; an apex row is unreachable and adds a `limit 1` candidate |
| `red.ibookit.lat` | **Keep mapped, permanently** | Unclaimed invites carry never-expiring codes on it; it's in bookmarks and chat history. Deleting the row does **not** redirect — it degrades to `Sitio no reconocido` |
| Supabase Site URL | **Leave as `https://red.ibookit.lat`, path-less** | It's the platform-wide clamp target for all four gyms; giving it a path arms the #217 cross-tenant enrollment fuse |
| `created_at` on the new row | **Leave at `now()`** | Keeps invite mail on the aged domain for free; backdating encodes a lie (trap 2) |
| Move emailed links now | **Cannot be held anyway** for 3 of 4 rails (§4.3) — the honest framing is "they follow the door the member used" | |
| Admin host on the new domain | **Out of scope** | Owner asked for the booking page. Would need its own Vercel domain + `app='admin'` row, and arms the `getAdminHosts` picker |
| Announce timing | **Owner deferred** — research-only this session | Domain is hours old, uncategorized by every web filter; the 2026-08-19 FortiGuard block is the precedent |

---

## 7. Where to pick up

**The next session's first action is the runbook's Step 1**, which is safe in isolation and closes a
live outage. Then Step 2, then Step 3 (the migration is already written and reviewed on disk), then
the auth walk, then a local commit. **No push without explicit consent for that specific push.**

Then the follow-up batch (runbook §6), of which **F1 (the `es_principal` canonical-host column) is
the one that actually earns a code change** — it's the only shield in this repo's toolkit that binds
a row typed directly into the Supabase dashboard, since every `tools/guards/*` replays migrations
and is blind to prod drift. That blindness is exactly how the 2026-08-27 `registrar_venta` outage
happened.

### Not done this session (deliberately)
- Nothing applied to live. Nothing committed. Nothing pushed.
- The two console actions — owner asked to be walked through them at the end of this session.
- FortiGuard / 7-vendor categorization submissions — still blocked on owner-owed inputs.

---

## ⚠️ Owner-owed inputs

1. **Company Name + public reply-to email** for the FortiGuard and seven-vendor categorization
   submissions. Still unpaid from the 2026-08-19 reachability TODO. Longest-latency item in the plan.
2. **Who holds the `redfunctionaltraining.com` registration** — your Namecheap account or RED's? If
   RED holds it and stops paying, their booking page disappears with no path back; RDAP exposes no
   auto-renew field, so it is not externally monitorable. Confirm auto-renew ON, registrar lock ON
   (RDAP currently shows `client transfer prohibited` — good), 2FA ON. Expiry `2027-08-28`.
3. **SAT persona-física details** (nombre, RFC, régimen, domicilio fiscal, correo) — pre-existing
   debt, now doubly load-bearing: editing WHOIS registrant data arms a 15-day ICANN re-verification
   clock, and that risk now applies to two domains.
