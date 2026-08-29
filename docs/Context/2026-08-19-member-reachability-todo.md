# Member reachability — ordered TODO

**Created:** 2026-08-19
**Trigger:** a RED member on iPhone/Safari, on WiFi, opened a WhatsApp link to `https://red.ibookit.lat/` and got a Fortinet FortiGuard block page — `Category: No categorizado` (Not Rated).
**Status of that incident:** root-caused. **Not our bug** — a FortiGate on that member's network blocks the Unrated category, which is Fortinet's shipped `default` web-filter profile behaviour. Our app served HTTP 200 throughout, and all eight public reputation resolvers (Cloudflare 1.1.1.1 + 1.1.1.2, Quad9, OpenDNS + FamilyShield, CleanBrowsing, ControlD, AdGuard) resolve us clean. We are not on any blocklist.

**Why this doc exists:** the investigation found two problems that outrank the Fortinet block. This is the tracking list for a **planning session** and then an **execution session**.

**Evidence base:** two agent workflows (17 agents, ~1.77M subagent tokens) plus direct verification by the lead. Every claim marked ✅ below was re-run by hand this session. Claims that failed adversarial review are in [Rejected](#rejected--do-not-re-litigate) — do not resurrect them.

---

## How to use this file

- `[ ]` / `[x]` — check items off in place, commit the diff.
- **OWNER** items need a human with dashboard access or a CAPTCHA. An agent cannot do them.
- **CODE** items are executable by an agent in the execution session.
- Each item states **why**, **where**, and **how to verify**. Do not re-derive.
- Items are ordered by (severity × likelihood × silence) ÷ effort. Work top-down.

---

## Tier 0 — OWNER, do first, unblocks the rest

These are minutes each and several of them gate the code work.

- [ ] **O1. Ask the affected member which network they were on.** One WhatsApp message settles the blast radius:
  > ¿A qué WiFi estabas conectado cuando salió ese mensaje — trabajo, escuela, el gym o tu casa? Y por favor apaga el WiFi, usa solo datos móviles, y vuelve a abrir el link — dime si así sí abre.

  Cellular data bypasses the FortiGate entirely. A second report from a *different* network = broad exposure; same employer/venue = one managed network.

- [ ] **O2. Load `https://red.ibookit.lat/` from the gym's own WiFi.** ⚠️ **Escalation trigger.** If it blocks there, this stops being "one member" and becomes gym-wide today.

- [ ] **O3. Look up our actual FortiGuard rating** at `https://www.fortiguard.com/webfilter` — human, in a browser, CAPTCHA-gated. Query `red.ibookit.lat` and `ibookit.lat`.
  - If it already shows a real category → the block was a **rating-server reachability failure on that FortiGate**, not our rating, and the fix is different. Distinguishing test: does that same WiFi also block other small legitimate sites as "No categorizado"?
  - ⚠️ **Nobody in the investigation could fetch this** — `fortiguard.com` returns HTTP 403 to every scripted client ✅. "Not Rated" is inferred solely from the member's block page. This is the single largest unverified assumption in the whole analysis.

- [ ] **O4. Submit for categorization** at `https://www.fortiguard.com/faq/wfratingsubmit` ✅ (verified 200; the variant `wfratingsubmission` is a **404** ✅ — an agent got this wrong).
  - No login. Fields: URL / suggested category / optional screenshot ≤2 MB / Name / Email / Company.
  - Suggested category: **Health and Wellness**.
  - One submission **per hostname**: `red.ibookit.lat`, `forge.ibookit.lat`, `app.ibookit.lat`, `ibookit.lat`, `www.ibookit.lat`. Cloud-database subdomain inheritance is *not* documented (only the local per-FortiGate Web Rating Override is), so do not assume the apex covers the rest.
  - Fortiguard states reviews process within ~24h — that is time-to-rating-update, **not** time-to-unblock. The blocking appliance must also refresh its cache; Fortinet publishes no figure for that.
  - **Needs a ruling first:** what Company Name and public reply-to email do we use? See [D1](#decisions-needed).

- [ ] **O5. Namecheap panel — 10 minutes.** Auto-renew **ON**, 2FA **ON**, registrar lock **ON**, registrant email verified and one you read daily. RDAP exposes none of this externally, so it cannot be checked any other way. Domain expires **2027-07-09T23:59:59Z**.

- [ ] **O6. Vercel → Settings → Billing: which plan?** Hobby's terms restrict to "non-commercial, personal use only" and pause with a 503 `DEPLOYMENT_PAUSED` requiring manual resume. This also closes item E7/#7 in your own 2026-07-28 audit, open since then.

- [ ] **O7. Supabase dashboard: (a) plan, (b) is custom SMTP still enabled?** If custom SMTP silently reverted, auth mail is capped at ~2 emails/hour **platform-wide**, which would masquerade as nearly every other symptom in this document. Free tier also means **no backups at all**.

- [ ] **O8. Resend dashboard: current bounce + complaint rates.** Suspension takes down invites, receipts *and* auth mail simultaneously (shared key) with no partial mode.

- [ ] **O9. Read the apex A-record value off the Vercel project's domain card.** Needed for [I2](#i2). ⚠️ Do **not** hardcode `76.76.21.21` — Vercel's KB says use the value shown on the card, because verification checks for that exact record and newer projects get pool IPs (e.g. `216.198.79.1`). An agent recommended the hardcoded value; its verifier refuted it ✅.

---

## Tier 1 — CODE, highest value-per-effort

### The silent lockout (do these two together)

- [ ] **1. Make the auth-link failure visible.** ~10 minutes, and it converts an unfalsifiable risk into a countable number — do it *before* the fix so you can measure the fix.
  - `apps/client/src/app/auth/confirm/route.ts:110` redirects to `/entrar?error=confirmacion` and **discards** `confirmed.error` entirely. Add `console.warn` of the error (never the token).
  - `apps/client/src/app/entrar/page.tsx:11` declares `EntrarPage()` with **no `searchParams` argument** and never reads it — so the member sees a clean, blank login form with no message. Add `searchParams`, render *"Ese enlace ya se usó o venció. Pide otro."* with a one-tap resend.
  - **Why it matters:** today a member whose link died sees nothing, and you see nothing. This is the detection gap that makes item 2 unrecoverable.

- [ ] **2. POST interstitial on `/auth/confirm`.** ⚠️ **Highest-severity finding in the whole investigation.**
  - **Mechanism:** Microsoft Defender Safe Links, Proofpoint URL Defense, Mimecast URL Protect and friends **fetch URLs in email before the member clicks**. `apps/client/src/app/auth/confirm/route.ts:104-110` consumes the single-use `token_hash` on a bare GET. The scanner burns it. The member gets a dead link and — per item 1 — no message. For password reset there is **no other recovery door**.
  - **Fix:** convert `route.ts:78-110` from a route handler into a page rendering one **CONTINUAR** button that POSTs to a server action calling `verifyOtp`. A scanner GET then renders a button and burns nothing.
  - **This is Supabase's own recommendation:** *"Consider if your system can be configured to invalidate the OTP token only after a user explicitly submits it"* — https://supabase.com/docs/guides/troubleshooting/otp-verification-failures-token-has-expired-or-otp_expired-errors-5ee4d0
  - **Scope note:** exposure is concentrated on the **`token_hash` rail** (the live Send Email Hook rail). The PKCE `?code=` rail additionally needs a `code_verifier` cookie a scanner does not have. The invite rail is already immune by design (ADR-0015). Do not over-build.
  - **Sizing query — run this first** (I deliberately did not): count the domain part of `clientes.email` across both gyms — gmail/hotmail/outlook/live.com.mx/yahoo vs everything else. Corporate-hosted mailboxes are where this bites. That single number decides whether this is 1-in-100 or 1-in-10.

### Cheap hardening

- [ ] **3. DMARC reporting.** ✅ Verified live: `_dmarc.ibookit.lat` = `v=DMARC1; p=none;` — **no `rua=`**, so we have zero visibility into whether auth mail is landing in Junk. Change to `v=DMARC1; p=none; rua=mailto:dmarc@ibookit.lat; fo=1;`.

- [ ] **4. `reply_to` on both mailers.** ✅ Verified live: `ibookit.lat` has **no MX record** — every reply to `no-reply@ibookit.lat` hard-bounces into nowhere, at the member's provider, where you never see it.
  - `supabase/functions/send-email/index.ts:116-122`
  - `packages/data/src/server/invitaciones.ts:60-66`
  - Use the gym's own address for invite/receipt mail; `getMarketingGym` already returns `email` at `packages/data/src/server/marketing.ts:190`.
  - ⚠️ Edge-function changes require a **separate deploy before push** — the pre-push hook blocks any range touching `supabase/functions/**`. Deploy first, then `EDGE_DEPLOY_OK=1 git push`.

- [ ] **5. Turnstile failure fallback.** Today, if the challenge token is never obtained — blocker, widget error, expiry, or the script simply not loading — the submit button is **silently disabled forever with no message**. There is no `onError` on any of the four `<Script>` tags, and the error callbacks only `setTurnstileToken(null)` with no UI. If the script never loads they never fire at all.
  - `activar-form.tsx:107` (button `:199`) · `registro-form.tsx:108` (`:284`) · `vincular-form.tsx:71` (`:111`) · `contacto-form.tsx:56` (`:133`)
  - Add `onError` + a ~10s load timeout rendering *"no pudimos cargar la verificación"*, and log it.
  - Hits every **first-time** member (`/registro`, `/activar`, `/vincular`, `/contacto`). Login is unaffected.
  - Scope note: the "network filters block `challenges.cloudflare.com`" framing was **downgraded** in review — that claim is forum-sourced, and the FortiGuard incident argues against it (that appliance blocked *uncategorized* domains; Cloudflare's is heavily categorized). The finding stands on far likelier causes: ad blockers, widget error codes, token expiry.

---

## Tier 2 — Infrastructure

- [ ] **6. External TLS + uptime monitor.** ⚠️ **This is the item that defuses the Oct 7 bomb permanently.** UptimeRobot / BetterStack / Checkly free tier on `red.ibookit.lat`, `forge.ibookit.lat`, `www.redfunctionaltraining.com` (2026-08-28, RED's second live client host — its own registrar/cert lifecycle, not covered by the `ibookit.lat` cert batch below) and both `-admin` hosts, with **TLS expiry alerts at 21 / 14 / 7 days**. Closes both the certificate time bomb and the "is Vercel up" gap in one move.

- [ ] <a id="i2"></a>**7. Give the domain a real front door.** Fixes the `www` hard-failure and the missing apex.
  - Namecheap Advanced DNS: **A record, Host `@`**, value from [O9](#tier-0--owner-do-first-unblocks-the-rest).
  - Create a **new Vercel static project** for the marketing page; add **both** `ibookit.lat` and `www.ibookit.lat` to it. That is what issues the certs and clears the current `X-Vercel-Error: DEPLOYMENT_NOT_FOUND`. Set `www` → apex redirect.
  - ⚠️ Do **not** add the apex to the *client* project: `resolveTenant` returns null on an unmapped host with no `?gym=` override (`packages/data/src/server/resolve-tenant.ts:175-177`) and the layout paints `DEFAULT_BRAND` — the generic "Inicio — Gimnasio / Hoy no hay clases programadas" page `app.ibookit.lat` serves today.
  - ⚠️ Do **not** map the apex in `gym_domain` — `app.ibookit.lat` must stay unmapped per `supabase/migrations/20260709090000_ibookit_host_map.sql:7-9`.
  - **Framing correction:** do this on its own merits. It is *not* what caused the Fortinet block — `red.ibookit.lat` resolves and serves 200 with real content, and no Fortinet source says a non-resolving apex prevents rating. See [Rejected](#rejected--do-not-re-litigate).

- [ ] **8. Ship a marketing page at the apex.** Six candidates are ready at `docs/brand/05-marketing/candidates/{a-tipografico,b-mostrador,c-venta,d-camaleon,e-cartel,f-antes-despues}/index.html`.
  - ⚠️ **All six carry the wrong domain** — `ibooki.lat` in `og:url` and in every contact `mailto:`; zero occurrences of the correct `ibookit.lat`. Must be fixed before deploy.
  - Also swap `d-camaleon`'s fake "Escríbenos por WhatsApp" `mailto:` for a real `wa.me` link.
  - **Needs a ruling:** which candidate. See [D2](#decisions-needed).

- [ ] **9. Crawl affordances on the client app.** ✅ Verified: `robots.txt`, `sitemap.xml` and `favicon.ico` all 404 on `red.ibookit.lat` (robots also 404s on forge and app).
  - Add `apps/client/src/app/robots.ts` + `sitemap.ts`. Allow `/`, `/nosotros`, `/precios`, `/contacto`, `/legal`; disallow `/reservar`, `/entrar`, `/activar`, `/auth`, `/registro`, `/restablecer`, `/confirmada`, `/clase`.
  - Add `metadataBase` + an `openGraph` block to the client root layout's `generateMetadata()`.
  - Note: the app *does* ship a per-brand `/icon` route returning 200 — that is not a gap.
  - Note: Open Graph richness is **not** a categorization input per any vendor doc. This is for the human-visible WhatsApp preview and for crawlability, nothing more.

- [ ] **10. Submit to the remaining categorization vendors.** All require a human browser. Include
  `www.redfunctionaltraining.com` in every submission alongside the O4 hostname list — it's RED's
  second live client host (2026-08-28) and, per D3 below, does not inherit `ibookit.lat`'s aged-out
  NRD status.

  | Vendor | URL | Note |
  |---|---|---|
  | Palo Alto PAN-DB | `https://urlfiltering.paloaltonetworks.com/` | "Test A Site" → "Request Change". PAN does **not** accept recategorization requests for `unknown`, and its own docs list **Block** as the recommended action for `unknown`/`not-resolved`. |
  | Symantec / Bluecoat | `https://sitereview.bluecoat.com/` | JS app; `/lookup` is a 404, don't use it. |
  | Zscaler | `https://sitereview.zscaler.com/` | "Request Category Change" inside Site Review. |
  | Check Point | `https://usercenter.checkpoint.com/ucapps/urlcat/` | The old `checkpoint.com/urlcat/main.htm` 301s here. |
  | Forcepoint | `https://support.forcepoint.com/s/site-lookup` | Submission how-to: `https://forcepoint2.my.site.com/ForcepointCustomerHub/s/article/How-To-Submit-Uncategorized-Sites` |
  | Cisco Talos | `https://talosintelligence.com/reputation_center` | Umbrella *category* disputes go via the Umbrella dashboard, not Talos. |
  | BrightCloud | `https://www.brightcloud.com/tools/change-request-url-categorization.php` | |

  **Skip Microsoft Defender** — its "Uncategorized" bucket contains only newly-registered (<30 day) and parked domains per Microsoft's docs; we are at 41 days. **Skip Google Safe Browsing** — malware/phishing only, no content categories.

---

## Tier 3 — Structural

- [ ] **11. Error boundaries + telemetry.** Neither `apps/client` nor `apps/admin` has a single `error.tsx` or `global-error.tsx`. There is no Sentry, no PostHog, no analytics, and no `console.*` call anywhere in `apps/client/src`.
  - Add `global-error.tsx` + per-route `error.tsx` in both apps.
  - Add free-tier Sentry. ⚠️ "Just `console.error` it" is weak on the current plan — **Vercel Runtime Logs retain 1 hour on Hobby, 1 day on Pro**, and Log Drains are Pro-only. Nothing survives overnight without Sentry.
  - Scope correction: the "a Supabase blip crashes the root layout for every member" and "flaky WiFi throws through `reservarClaseAction`" mechanisms are both **wrong at source level** (verified in `@supabase/auth-js@2.106.2`; `getClaims()` returns network failures as `{data:null,error}`, and `packages/data/src/server/reservas.ts:22-36` returns a typed refusal, never throws). The boundary gap is real; those two mechanisms are not. Build the boundary, don't chase those.

- [ ] **12. Give members a door that survives a domain-level block.** Today they have none: password-reset and confirm links are minted from the *current request's host* (`apps/client/src/app/entrar/actions.ts:34,38`), so a member stuck on a blocked host gets sent right back to it. And `/activar` is **not** host-independent — `apps/client/src/app/activar/page.tsx:47` calls `resolveTenant` inside a cross-tenant shield that redirects a mismatch back to the canonical host or renders "Sitio no reconocido" (verified live on both `app.ibookit.lat/activar` and `red-2-0-client.vercel.app/activar`).
  - **(a) cheap:** always append `?gym=<slug>` to fallback URLs in `construirUrlInvitacion`.
  - **(b) durable:** register a **second, independently-registered domain** and map it as a real `app='client'` row per gym, so links can be re-minted onto a host with an independent category.
  - **Needs a ruling.** See [D3](#decisions-needed).

- [ ] **13. Move primary DNS to Cloudflare free; keep Namecheap as registrar only.** Decouples "I need to change a record" from "my registrar's control panel is down" — Namecheap had a ~28h control-plane outage on 2026-08-13 that froze DNS *management* (resolution survived).
  - ⚠️ Namecheap **PremiumDNS does not fix this** — `pdns1/pdns2` resolve to `156.154.132.100`/`.133.100`, the same Vercara range as `dns1/dns2`. It buys an SLA credit, not resilience.
  - ⚠️ Do this **before** the September cert-renewal window, never during it.

- [ ] **14. Drop the wildcard `*.ibookit.lat` → `cname.vercel-dns.com`.** Any typo'd or unprovisioned subdomain reaches Vercel's edge and dies with a **hard TLS abort** — Safari says "cannot establish a secure connection", which reads as an attack. Because the handshake dies before the HTTP request there is no 404 to count, so this is invisible to us. Publish explicit CNAMEs per provisioned gym instead; unknown hosts then return NXDOMAIN ("server not found"). One record per gym, in a flow you already touch at onboarding.
  - **Needs a ruling** — the wildcard buys zero-DNS-write tenant provisioning. See [D4](#decisions-needed).

- [ ] **15. Google Postmaster Tools + Microsoft SNDS.** Free, and the only way "are we landing in Junk" becomes a number rather than a guess. Pairs with item 3.

- [ ] **16. New-gym launch checklist, as one file.** DNS record → Vercel domain → categorization submissions to all vendors → Supabase Redirect-URL allowlist entry.
  - ⚠️ That last one is a **Dashboard-only setting, not code**. `supabase/functions/send-email/index.ts:11-14` flags it as a SECURITY DEPENDENCY, and `docs/runbooks/hitl-72-resend-live.md:224` documents the failure mode: mail sends fine, the click errors `redirect_to not allowed`. A second fallback domain also needs a **Site URL** decision — `hitl-72-resend-live.md` §C1 pins it to `https://red.ibookit.lat`.
  - Make categorization submission a **day-one launch step** for every new domain or tenant hostname. Network-edge filters intercept *any* client on a LAN, including a personal iPhone on venue WiFi.

- [ ] **17. Plan upgrades before the next paying gym**, not at the 4th. **Supabase Pro matters more than Vercel Pro** — backups; the free tier has none and pauses on inactivity. Cross-ref `docs/Context/2026-07-28-audit-evidence/arch-runtime.md:202-216,585,608` — the domain-ceiling analysis is already done, don't redo it.

- [ ] **18. WhatsApp/iOS in-app browser friction.** iOS WhatsApp's in-app browser doesn't share cookies with Safari, so a session completed in-app doesn't exist in Safari later — reads to the member as "it logged me out". Hits iOS members reaching the app via WhatsApp, i.e. the primary channel. Degrades, doesn't lock out. Add an "Abrir en Safari" banner on UA detection.

- [ ] **19. Copy change:** add *"si el link no abre, prueba con datos móviles"* to the WhatsApp copy the desk pastes, and to invite emails. One line, permanently deflects the Fortinet class of complaint.

---

## Time bombs — dated

| Fuse | Fires | Defusing check |
|---|---|---|
| ⚠️ **TLS certificates.** ✅ Verified by hand: all 9 hosts issued in one 19-min window on 2026-07-09, `notAfter` **2026-10-07**. Renewal has **never once run**. `red` `Oct 7 06:39:43` · `forge` `06:40:00` · `app` `06:24:48` · `red-admin` `06:42:29`. Vercel renews 14–30 days out → first-ever attempt **2026-09-07 to 09-23**. HSTS `max-age=86400` makes the browser interstitial non-bypassable. | **~49 days** | **Calendar item 2026-09-10:** `echo \| openssl s_client -servername red.ibookit.lat -connect red.ibookit.lat:443 2>/dev/null \| openssl x509 -noout -enddate` on all 9 hosts. If `notAfter` hasn't moved past Oct 7, you have 4 weeks to fix manually instead of zero. Also confirm every host reads "Valid Configuration" in Vercel → Settings → Domains. Item 6 automates this. |
| **ICANN registrant re-verification.** Currently satisfied. Editing registrant name/email restarts a 15-day clock; Namecheap enforces by swapping the zone onto *verification nameservers* — the whole zone stops resolving. | Arms the day the **SAT persona-física details** land and you update WHOIS | Click the verification email the same day; re-check resolution 24h later. Treat that edit as a scheduled outage risk. |
| **CAA.** ✅ Verified: no CAA record today, which is safe — every gym host is a CNAME to `cname.vercel-dns.com`, whose CAA already permits `letsencrypt.org`, and CAA resolves at the alias without climbing. **Arms the moment you add A records for the apex (item 7).** | 60–90 days *after* the mistake, when a cert expires | Either publish no CAA at all, or publish it **before** pointing the apex, mirroring Vercel's set exactly: `0 issue "letsencrypt.org"`, `"globalsign.com"`, `"pki.goog"`, `"sectigo.com"`. Verify: `curl 'https://dns.google/resolve?name=ibookit.lat&type=257'` |
| **Let's Encrypt 50 certs / registered domain / week.** 2 hostnames per gym ⇒ ~25 new gyms/week ceiling. External, unfixable in-app. Renewals exempt. | Binds at ~20+ gyms; we have 9 hosts | Before any onboarding push: file the ISRG rate-limit adjustment (weeks of lead time), or move to a wildcard cert (requires Vercel nameservers). |
| **Domain expiry** `2027-07-09T23:59:59Z`. RDAP exposes no auto-renew field — **not externally checkable**. | ~10.7 months | [O5](#tier-0--owner-do-first-unblocks-the-rest). Consider multi-year now. |
| **Supabase free tier** — pauses on inactivity, no backups. | Whenever it decides to | [O7](#tier-0--owner-do-first-unblocks-the-rest). Higher likelihood than the Vercel pause. |

---

## The silent failures — everything above that nobody would ever report

Ranked by how invisible they are. Each ends with a member unable to use the app and **zero signal reaching us**.

1. **Burned auth link** (items 1+2) — member sees a blank login form; we log nothing.
2. **Network filter block** (O2–O4, item 10) — the appliance answers before Vercel does; never reaches our logs. Only closable by getting categorized.
3. **Dead Turnstile button** (item 5) — no `onError`, no logging, no analytics.
4. **TLS abort on a wildcard host** (item 14) — handshake dies before the HTTP request, so there is no 404 to count.
5. **Bounced replies** (item 4) — generated at the member's provider, never touches an inbox we own.
6. **Render exceptions** (item 11) — no boundary, no telemetry, 1h log retention.

---

## Decisions needed

<a id="decisions-needed"></a>

- [ ] **D1.** Public **Company Name** and reply-to **email** for vendor categorization submissions. Blocks [O4](#tier-0--owner-do-first-unblocks-the-rest) and item 10.
- [ ] **D2.** Which of the six marketing candidates ships at the apex. Blocks item 8.
- [ ] **D3.** Fallback door: cheap `?gym=` appending, or register a second independent domain? Blocks item 12. Note a second domain also needs a Supabase **Site URL** ruling, not just an allowlist entry. **Partially resolved for RED only (2026-08-28):** `www.redfunctionaltraining.com` is exactly path (b), live and mapped (`gym_domain` + `es_principal`, `docs/runbooks/red-custom-domain-cutover.md`). This is not a general resolution, and it does **not** inherit the "aged out" NRD reasoning in [Rejected](#rejected--do-not-re-litigate) — that was derived from `ibookit.lat` being 41 days old at the time; RED's new domain was registered 2026-08-28 and starts its own categorization/NRD clock from zero. Other gyms and the general D3 ruling remain open; item 12 still blocked for them.
- [ ] **D4.** Keep or scope the `*.ibookit.lat` wildcard. Blocks item 14.
- [ ] **D5.** Does this become a GitHub issue set (`to-tickets`) or stay a single tracked doc? Per [[pipeline-earns-its-place]], decompose only if pieces ship and verify independently — items 1–5 plausibly ship as one slice.

---

## Rejected — do not re-litigate

Each of these was raised by an agent and killed under adversarial review. They are recorded so nobody proposes them again.

- ❌ **"The apex must be fixed before submitting for categorization."** Unsourced. `red.ibookit.lat` resolves and serves 200 with real content, and no Fortinet source says a non-resolving apex prevents rating. Fix the apex as hygiene (item 7), not as a gate. ⚠️ One workflow ranked this as the *root cause*; its verifier for that chunk died mid-run (connection lost), so the overstatement went unchecked there. The other workflow's verifier refuted it explicitly. **Treat it as refuted.**
- ❌ **`https://www.fortiguard.com/faq/wfratingsubmission`** — 404 ✅. Correct URL is `.../faq/wfratingsubmit` ✅.
- ❌ **Hardcoding `76.76.21.21`** as the apex A record. Read it off the Vercel domain card ([O9](#tier-0--owner-do-first-unblocks-the-rest)).
- ❌ **Newly-Registered-Domain blocking.** Fortinet's NRD window is 10 days; Newly-Observed is ~30 min. RDAP puts registration at `2026-07-09T06:41:23Z` — 41 days. Aged out. Same for Microsoft's <30-day bucket.
- ❌ **Any malware/phishing/abuse blocklist.** ✅ Eight resolvers checked, all clean.
- ❌ **`.lat` TLD penalty.** No evidence found either way — Spamhaus's per-TLD abuse table isn't fetchable. This is absence-of-evidence, *not* a clean bill of health.
- ❌ **Mexican carrier / residential-ISP default filtering** (Telmex, Totalplay, Izzi, Megacable, Telcel, AT&T, Movistar). No evidence any deploys FortiGuard filtering by default.
- ❌ **"Missing Open Graph markup makes the link low-trust to filters."** No vendor doc supports it. Affects the human WhatsApp preview only.
- ❌ **"A bad apex rating would be inherited by a FortiGate Web Rating Override."** Wrong — that is a local admin config a cloud submission cannot touch.
- ❌ **"/activar is host-independent and works on any fallback."** Refuted — `activar/page.tsx:47` calls `resolveTenant`; verified live returning "Sitio no reconocido".
- ❌ **"Short 1-year registration term is a low-trust signal."** Unsourced; 1 year is the ordinary default.
- ❌ **"Vercel gives no notice on billing pauses"** — contradicted by `vercel.com/docs/spend-management` (50/75/100% notifications). And spend management is opt-in **and Pro-only**, so it cannot fire on Hobby at all.
- ❌ **DNSSEC.** Off today. Turning it on now *adds* total-outage risk (a DNSSEC misconfig is fatal on validating resolvers) for no benefit against this threat.
- ❌ **iCloud Private Relay** — verified non-issue.
- ❌ **Namecheap outage "30h32m"** — arithmetically impossible from the stated 12:35 UTC start; it was ~28h25m. And a management freeze does **not** endanger cert renewal (Vercel renews against existing CNAMEs with no DNS change).

---

## Known unknowns

- **Our actual live FortiGuard category.** Blocked by CAPTCHA + 403 ✅. → [O3](#tier-0--owner-do-first-unblocks-the-rest).
- **Whether the block was category policy or a rating-server reachability failure on that specific FortiGate.** → [O3](#tier-0--owner-do-first-unblocks-the-rest) distinguishing test.
- **Whose WiFi it was.** → [O1](#tier-0--owner-do-first-unblocks-the-rest).
- **Google Safe Browsing / SmartScreen current verdict** — status widget is JS-rendered; needs a real browser.
- **Vercel plan** — no dashboard access. Item 17's ranking is conditional on it.
- **Whether FortiGuard's cloud DB inherits an apex rating to subdomains** — undocumented. Hence: submit all five hostnames.
- **Whether a different registrable domain evades the block** — nobody fetched `red-2-0-client.vercel.app`'s category.
- **Live `MAILER_OTP_EXP`** — the `auth_otp_long_expiry` advisor didn't fire, proving ≤3600s, but the exact hosted value isn't readable. ⚠️ `supabase/config.toml:234` governs **local dev only** — it does not prove the live TTL.
- **Unconfirmed secondary sources** (community/third-party, not vendor docs): Netskope "sinkholes NRDs by default"; Qustodio "blocks uncategorized by default"; WhatsApp-on-Android using Chrome Custom Tabs.

---

## Working fallback, verified live today

For a member blocked right now, in order of preference:

1. **Cellular data** — turn WiFi off. Bypasses the appliance entirely. Always works.
2. `https://app.ibookit.lat/?gym=red` — ✅ verified live: HTTP 200, `Set-Cookie: gym=red`, `<title>Inicio — RED</title>`, `data-brand="red"`.
   Activation: `https://app.ibookit.lat/activar?gym=red&codigo=<CODIGO>` — **the `?gym=red` is mandatory**; without it the page renders "Sitio no reconocido".
   ⚠️ Same registrable domain, so if the FortiGate policy keys at domain level this blocks too. Unverified.
3. `https://red-2-0-client.vercel.app/?gym=red` — ✅ verified live with full RED branding. Different registrable domain, but its FortiGuard category is unknown and `vercel.app` is shared free hosting, not obviously safer.

---

⚠️ **Standing owner debt, unrelated to this incident and still unpaid: SAT persona-física details (nombre, RFC, régimen, domicilio fiscal, correo).** Now load-bearing here — see the ICANN row in [Time bombs](#time-bombs--dated).
