# Email deliverability: build vs buy â€” decision document

## 1. TL;DR

**Verdict: stay on Resend, buy nothing, and build one thing â€” the bounce/complaint feedback loop that does not exist today.** "Guaranteed inbox" is not sold by anyone [1][14][30].
**The one thing to buy: nothing.** The only spend that clears its bar is the Resend plan upgrade you'd make anyway (the free tier's 100/day cap breaks at under 20 gyms) [14].
**Do now:** F3 (Postmaster, free, not retroactive) â†’ F1 (rua, but via a managed processor, never a mailto on `ibookit.lat`) â†’ F2 (Reply-To + a real MX) â†’ per-stream tags â†’ **F0: Svix-verified bounce/complaint webhook â†’ one member-visible `correo_estado` column.**
**Defer:** F6 (only after `mensajeInvitacion` gets HTML-escaping â€” it has none today). **Never as scoped:** F4 and F5.
**Worst risk found:** one Resend account, one key, no tenant isolation, and an AUP with account-wide hard thresholds (complaint <0.08%, bounce <4%, "may be shut down without warning") [15] â€” one gym's stale-list invite blast can terminate auth, invites and receipts for all 1000 tenants at once, and nothing in the code would see it coming or notice it happened.

## 2. Is "guaranteed inbox" a thing you can buy? (the honest market answer)

No, and this is structural rather than a gap in any one vendor's product. Inbox-vs-spam is decided unilaterally by Gmail, Microsoft and Yahoo; no ESP has authority over that decision, so none of them sells it.

The evidence is one-sided and comes from parties with every incentive to claim otherwise. Resend's own dedicated-IP page: a dedicated IP "is not a fix for underlying sending problems," and placement is "driven mostly by domain reputation, authentication, list hygiene, and engagement" [16]. AWS SES's Virtual Deliverability Manager "provides insights" and "advice" â€” advisory language throughout [30]. Mailgun's SLA guarantees 99.99% uptime of its API/SMTP/delivery *services*, explicitly not placement [32]. Valimail â€” a DMARC-enforcement vendor whose revenue depends on the opposite claim â€” states that spam domains publishing `p=reject` "in the mistaken belief that this will help their deliverability" get "ultimately... no benefit" [35].

What you *can* buy is grunt work removal: DMARC report parsing, IP warmup, reputation dashboards, suppression handling, per-tenant isolation. Only one of those is genuinely hard to build yourself at our shape, and it is per-tenant isolation.

**Corollary that reframes the whole exercise:** no mailbox provider requires more than DMARC `p=none` at any volume â€” Google says verbatim "Your DMARC enforcement policy can be set to none" [1], Yahoo asks only that a policy be published [6], and Microsoft's May 2025 hard-reject rule is satisfied by `p=none` with alignment [7]. We already satisfy every published requirement. There is no compliance cliff to buy our way over.

## 3. Provider options table

Volume assumptions (mine, from the brief): 200 members/gym Ã— ~60% active = ~120 active; receipts 120â€“520/gym/mo (monthly vs weekly cadence), invites ~10, auth ~15 â†’ **145â€“545/gym/month**. So 100 gyms â‰ˆ 15â€“55k/mo; 1000 gyms â‰ˆ **150â€“550k/mo (â‰ˆ5â€“18k/day)**.

| Option | What it takes off our plate | Today (~180/mo) | 100 gyms (15â€“55k/mo) | 1000 gyms (150â€“550k/mo) | Migration effort |
|---|---|---|---|---|---|
| **Resend (incumbent) â€” RECOMMENDED** | Managed warmup, auto-suppression, bounce/complaint/suppression webhooks, DKIM/SPF setup, 1,000 domains on Scale. **Not** tenant isolation â€” none exists [17] | $0 (free 3k/mo, but **100/day cap breaks at <20 gyms**) | Pro $20â€“35 | Scale ~$90 (100k) â†’ ~$350 (500k) â†’ ~$400 | â€” |
| **Postmark** | Hard transactional/broadcast IP separation ("traffic does not mix... including IP ranges"), per-client Servers, managed suppressions, guided onboarding. Still no per-tenant reputation isolation [23][25] | Basic $15 | Pro â‰ˆ $16.50 + overage â‰ˆ **$75** | Platform â‰ˆ $18 + overage â‰ˆ **$666** âš ï¸ | **Medium (2â€“4 days):** mandatory Message-Stream modeling, per-event-type webhooks, rewrite 2 Resend-specific error branches, DNS/DKIM cutover, re-register the Supabase hook [26] |
| **Amazon SES Pro + Tenant Management** | The **only** mainstream native tenant primitive: per-tenant sending identity, IP pool, bounce/complaint metrics, auto-suspend policies, 10k tenants default (300k on request) [29]. Bundles VDM. **Adds** to our plate: suppression handling, SNS event pipeline, domain lifecycle, all DNS self-service | ~$0.04 | ~$12 | **~$120/mo** | **High (1â€“2 weeks + ongoing ops):** everything Postmark needs, plus building the event/suppression/tenant plumbing Resend gives free. No paste-and-convert path exists |
| **Resend + services (status quo hardened)** | Postmark DMARC Digests **free**, Google Postmaster **free**, GlockApps $59â€“129/mo *occasionally* (pre/post a change), one-time consultant audit $1.5â€“5k if ever [27][46] | $0 | $0 | $0â€“129 | Zero |
| Bird (ex-SparkPost) | â€” | â€” | â€” | ~$295 | **Reject.** Deprecated endpoints, broken integrations, plugin pulled 2025 [33] |
| Loops | â€” | â€” | â€” | â€” | **Reject.** Contact-priced (100â€“300k contacts), single-brand, no multi-tenancy [34] |

âš ï¸ The Postmark 100k/500k figures are naive `base + published overage` arithmetic; Postmark's own calculator returns banded prices that do not reconcile with it. Treat as directional, get a quote before acting.

**Reading of the table:** SES is ~3Ã— cheaper than Resend at 1000 gyms *and* is the only option that structurally fixes the worst risk in Â§1. It is still the wrong move today, because $250/mo of savings does not buy back 2â€“4 ops-hours/month from a solo developer, and Resend's `MailTransport` seam (`packages/data/src/server/invitaciones.ts`) already makes the swap cheap later â€” for three of four send sites. The fourth, the Deno auth hook, bypasses that seam entirely and would be rewritten from scratch.

## 4. The six fixes â€” risk audit

### F1 â€” add `rua=` to DMARC â†’ **DO NOW (redesigned)**

| | |
|---|---|
| What could break | Nothing in mail flow. What breaks is the *fix itself*, silently |
| Failure chain | `rua=mailto:dmarc@ibookit.lat` is added â†’ `dig` confirms it â†’ **the apex has no MX** (verified: SOA-only for TXT and MX) â†’ every report bounces or is dropped. Alternative: `rua=` a personal Gmail â†’ RFC 9990 Â§4 requires the destination to publish `ibookit.lat._report._dmarc.gmail.com`; Google never will â†’ conformant receivers silently discard [10] |
| **Worst plausible failure** | It *looks done* â€” the record is live, the checkbox is ticked â€” and the feed is permanently empty, removing the exact safety instrument any later policy change depends on |
| Blast radius at 1000 gyms | Flat. Report volume is per-reporting-provider-per-day, not per-tenant. No PII (aggregate counts + source IPs only) |
| Detection | Send a test message to the chosen address and confirm it doesn't bounce, *before* the DNS edit. Then confirm actual reports arrive at 24â€“48h |
| Rollback | One TXT edit, no mail-flow dependency |
| **Verdict** | **Do now â€” but the target must be a managed processor** (Postmark DMARC Digests: free, ESP-agnostic, no account, weekly email; paid tier is $14/mo **per domain**, not flat) [27]. Caveat: Postmark sends **no digest at all** in a week with zero reports, so silence is ambiguous at our current volume |

### F2 â€” Reply-To header â†’ **DO NOW (paired with a real mailbox)**

| | |
|---|---|
| What could break | The same dead-mailbox mechanism as F1, plus a support surface that scales with tenant count |
| Failure chain | Reply-To points at an unmonitored or MX-less address â†’ a member replies *"is this a scam?"* or *"I didn't request this reset"* â†’ hard bounce or silent black hole. Worse variant: pointing it at a free personal Gmail while From claims an institutional domain â€” a documented phishing tell that actively undercuts F6 |
| **Worst plausible failure** | A genuine account-security report from a member vanishes, indistinguishable from success, while we simultaneously train members that From/Reply-To mismatch is normal for our brand |
| Blast radius at 1000 gyms | If it points at the platform, **every** reply from every gym lands in one inbox with no tenant context and no ticketing code anywhere in the repo. If it points at the gym, it stays flat |
| Detection | None automatic. Neither existing test suite checks the wire. A camelCase `replyTo` sent to a snake_case REST API is silently ignored. Requires a live send + raw-header inspection |
| Rollback | One-line revert, no DNS |
| **Verdict** | **Do now.** Reply-To = the gym's own address where known, `soporte@ibookit.lat` fallback. **Use Namecheap's free email forwarding for the MX** â€” `ibookit.lat` runs on `dns1/dns2.registrar-servers.com`, and Cloudflare Email Routing requires the zone to be *on Cloudflare's nameservers* [40][41]. Proposing Cloudflare here would silently convert a 15-minute task into a full nameserver migration that could break live SPF/DKIM/DMARC. Apply to **both** send paths |

### F3 â€” Google Postmaster Tools â†’ **DO NOW**

| | |
|---|---|
| What could break | Only the DNS-verification step. Zero code coupling â€” no keys, no webhooks, no write access |
| Failure chain | The verification TXT is pasted into the *existing* `send.ibookit.lat` host on a registrar UI that allows one TXT per host â†’ SPF is overwritten. Muted, not fatal: DKIM is aligned and DMARC passes on either leg, but standalone SPF checks would degrade |
| **Worst plausible failure** | False confidence â€” reading an empty low-volume dashboard as a working early-warning system. Google publishes **no** minimum-volume threshold; the "~100/day" figure everyone repeats is folklore [3] |
| Blast radius at 1000 gyms | None on the send path. The data becomes genuinely useful somewhere in the low hundreds of gyms |
| Detection | `dig TXT send.ibookit.lat` immediately after, confirming SPF is byte-identical |
| Rollback | Remove one TXT record |
| **Verdict** | **Do now, first.** GPT data is **not retroactive** â€” registering late permanently costs you the baseline. Verification is **DNS-only** (TXT or CNAME); there is no Search Console or HTML-file path for Postmaster Tools [3]. Add as a **new** host, never edit SPF's value |

### F4 â€” ratchet DMARC p=none â†’ quarantine â†’ reject â†’ **DO NEVER as scoped**

| | |
|---|---|
| What could break | All outbound mail for all tenants, simultaneously, invisibly |
| Failure chain | Both auth legs fail together in exactly one realistic case: an intermediary that *modifies the body* (Proofpoint URL Defense, Mimecast, Barracuda link rewriting) â€” and our mail is HTML-heavy, link-dense, with links on a domain that differs from From, the exact shape those gateways rewrite. Microsoft's own doc concedes the class: "Normal for forwarded mail. Use ARC or accept some failures" [8]. Second trigger: our SPF, DKIM and DMARC all sit on **one DNS provider with no secondary NS**; at `p=none` a resolution failure is harmless, at `p=reject` it is total rejection |
| **Worst plausible failure** | At Microsoft consumer (heavy in Mexico), `p=reject` is a hard `550 5.7.515`, not junk-foldering [7][8]. A hotmail member's confirmation is permanently rejected; GoTrue does not retry; `reenvio-limite.ts` then caps them at 5 resends per UTC day across all three doors â€” so they **burn their daily budget retrying mail that structurally cannot arrive, and are locked out until tomorrow** |
| Blast radius at 1000 gyms | Total, all tenants, all three streams |
| Detection | **Structurally impossible today.** Resend returns 200; the receiver rejects downstream; `send-email/index.ts` logs only on non-2xx. Time-to-detect = time until a human complains |
| Rollback | 30 minutes (TTLs ~1800s) and recovers **nothing** â€” 550 is permanent, there is no queue, no retry, no bounce record of who was affected |
| **Verdict** | **Never as scoped.** Three independent disqualifiers: (a) the benefit is unevidenced â€” Valimail says enforcement gives "no benefit" on its own [35], and we are already aligned on both legs; (b) **there is no safe ramp any more** â€” RFC 9989 (May 2026) removed `pct=`, so a conformant receiver treats `pct=10` as full enforcement, while the replacement `t=y` has unproven adoption and Microsoft's docs still cite RFC 7489 and `pct=` [9][8]; (c) a monitoring period at 180 emails/month across 2 gyms is a false green for a policy governing 100k+/month across 1000 unknown mail environments |
| **Do this instead (free, zero delivery risk)** | Publish `v=DMARC1; p=none; sp=reject; np=reject;` â€” no production mail is ever sent From any `ibookit.lat` subdomain (auth hardcodes the apex; `RESEND_FROM` is pinned to it), so this closes the *easier* spoof (`no-reply@mail.ibookit.lat`) at zero cost [9 Â§4.7]. **And publish DMARC on the per-gym link domains** â€” `_dmarc.redfunctionaltraining.com` is NXDOMAIN with a live MX and `~all` SPF. F4 hardens the domain nobody wants to spoof and leaves the one members actually recognize wide open |

### F5 â€” List-Unsubscribe + one-click â†’ **DO NEVER as scoped / conditional later**

| | |
|---|---|
| What could break | Permanent, silent, member-facing unreachability â€” the only irreversible failure on the whole list |
| Failure chain | Naive address-keyed suppression ships â†’ 200 invites go out, ~2% tap unsubscribe (some deliberately, some a thumb on Gmail mobile) â†’ months later one hits "olvidÃ© mi contraseÃ±a" â†’ `respuestaEnvio` maps the outcome to a 200 DROP by design, and on the invite rail the desk sees a generic retryable `envio-fallido` and re-sends forever into a wall. It is *worse* than described: a send to a Resend-suppressed address most likely returns **HTTP 200**, so even the `console.error` never fires |
| **Worst plausible failure** | A paying member is locked out of the only account-recovery channel we have (no SMS, no support login-as, and the email is already unclearable on a claimed row) â€” and **address-keyed suppression leaks across tenants**: one annoyed member at gym A silences gym B, who never complained and is paying us to reach them |
| Blast radius at 1000 gyms | Per-member but unbounded in *time*, and cross-tenant by construction |
| Detection | None. The send path is designed to be quiet |
| Rollback | Instant if the flag is in our Postgres; **not rollbackable at speed if it lands in Resend's team-wide suppression list** [18] |
| **Verdict** | **Never as scoped.** Google states verbatim: "One-click unsubscribe is required only for marketing and promotional messages. Transactional messages are excluded" â€” naming password resets and reservation confirmations [2]. Yahoo scopes it identically [5]. Microsoft never adopted RFC 8058. **All three of our streams are transactional.** F5 buys zero compliance and spends real reachability. It is also not a header change: RFC 8058 Â§3 requires the URI to identify recipient *and list*, and we have no list â€” so it is a schema change, a public endpoint, and a copy change [11] |
| If ever revisited | Only if Postmaster shows spam rate walking toward 0.30%. Then: **invite stream only**, token = HMAC over `(cliente_id, gym_id, canal)` never a bare address, idempotent upsert (Gmail retries), mounted on the From domain not a tenant host (RFC 8058 forbids redirects and cookies â€” our tenant middleware would break it), and the body link must render a confirmation page that mutates nothing (scanners GET, they don't POST) [11] |

### F6 â€” reshape invite content â†’ **DO LATER (gated on an escaping fix)**

| | |
|---|---|
| What could break | The activation link itself |
| Failure chain | `mensajeInvitacion` interpolates `gymNombre`, `saludo` and `url` into raw HTML with **zero escaping** â€” unlike the sibling receipt template, which defines and applies `escapeHtml()` to every field. F6 means *adding personalization fields*; every new field inherits the unescaped pattern, and no test or lint would catch it |
| **Worst plausible failure** | A reshape moves any user-influenced field into an **attribute context** (a `title=`, a personalized href) â†’ an unescaped `"` breaks out and corrupts or hijacks `href="${url}"`, the activation link. Even without that, `Iron & Steel Gym` or `Gym <3 Fitness` renders visibly broken |
| Blast radius at 1000 gyms | `gymNombre` is admin-typed by up to 1000 uncoordinated onboarders â€” a metacharacter collision goes from latent to **near-certain**, with zero malicious intent required |
| Detection | None today. Needs an explicit test feeding `< > & "` through both fields |
| Rollback | Template revert. But a shipped injection needs a hotfix plus an audit of live gym names |
| **Verdict** | **Do later â€” after adding `escapeHtml()` to every interpolated field and a metacharacter regression test.** Note the premise is folklore: no provider documents a "short single-link mail = phishing" heuristic. The *defensible* version is carrying the transaction forward â€” "tu pago de $X del [fecha] en [gym]" â€” which is both the anti-phishing signal and the truth, plus naming the destination domain in the body so the From/link mismatch is pre-announced. **Do not** add hero images (image-to-text ratio), link shorteners or click-tracking redirects (this repo already paid down exactly that debt in the auth mail), or urgency copy |

**Sequencing between them:** F3 â†’ F1 â†’ F2 â†’ (F0, below) â†’ F6 â†’ *stop*. F4 and F5 do not enter the sequence. F1 must precede any policy discussion, and F3 must precede F6 so the content change has a before-and-after.

## 5. Recommended architecture for 1000 gyms

### Settled (both architecture tracks agreed)

- **One org sending domain family under `ibookit.lat`.** Never per-gym sending domains on gyms' own DNS: it hands our deliverability to non-technical operators, inherits ~10 emails/day per sender (cold forever), and converts one thing we own into 1000 support tickets we don't. Per-gym identity is already met by the From display name + copy + link domain.
- **Never per-tenant subdomains.** At 1000 gyms that shards a stream into 1000 buckets too small for any provider to form an opinion about â€” the opposite of isolation.
- **Shared IPs until >3,000/day sustained AND ~90k/month** (~250â€“400 gyms). Resend won't sell a dedicated IP below 3k/day and explicitly advises against it below 90k/mo [16]. Our traffic is lumpy (onboarding bursts, month-start receipt compression, Sunday sag) â€” exactly what a shared pool absorbs and a dedicated IP punishes. Buy one on one falsifiable condition: **Postmaster shows IP reputation degraded while domain reputation is good, and volume exceeds 5k/day.** Then take Resend's managed pool (auto-warm, shared/dedicated traffic split during transition), not a hand-built schedule.
- **Stream separation by tag first** (`tipo=auth|invitacion|recibo`), because Postmaster reports per *domain* â€” one domain carrying three streams gives one blended complaint number, and tags are the only way to know which stream caused a spike.
- **A per-gym-per-day bulk send cap, shipped with the bulk-import feature.** This is the mitigation for the Â§1 worst risk and it is ~20 lines. Scope it to *any* bulk-triggered stream, not just invites â€” a bulk historical-sale import firing receipts hits the identical shared-domain blast radius.
- **Monitoring is email-shaped, not dashboard-shaped.** A solo operator reads email; a dashboard is a thing you stop logging into.
- **DMARC enforcement is last or never** (see F4).

### CONFLICT: domain/stream split â€” three per-stream subdomains vs. one apex + tags

*arch-reliability* wants `auth.` / `recibos.` / `invitaciones.ibookit.lat` split now while it's free. *arch-ops* wants one apex domain forever, separated only by tags, and cited a ~40â€“50k/month threshold below which subdomains are counterproductive â€” **that threshold is fabricated**; the sources it cites explicitly reject volume as the deciding factor and argue for separation by purpose and risk.

**Pick â€” a two-way split, which is neither track's answer:** **auth and receipts stay on the apex; invites move to `invitaciones.ibookit.lat`, before the first bulk onboarding.** Reasoning: (a) the risky stream is the invite â€” unexpected mail, Fromâ‰ link domain, a login link, bursty, and the only stream that would ever carry an unsubscribe; (b) auth is the stream that must never degrade, and it is also the *smallest*, so it should ride the domain that receipts keep warm rather than starve on its own subdomain (arch-reliability's own volume figure for the auth subdomain conflated fleet-wide totals with auth-only volume); (c) two domains is half the ops of three on a single-provider DNS zone with a 1024-bit single-selector DKIM key and no second selector to roll to. The split isolates blast radius; it buys **zero** relief from Gmail's 5,000/day threshold, which sums across subdomains to the primary domain [2] â€” do not design it as an escape hatch.

### CONFLICT: second provider for auth mail

*arch-reliability* wants a fallback transport for the auth stream. *arch-ops* says stay single-provider; the `MailTransport` seam is the insurance.

**Pick: not now, with two corrections to the proposal.** First, "SES direct" is **not** diversification â€” Resend rides SES, so it defends only against a Resend-account event, not an SES-layer one; name Postmark if the goal is real. Second, "trip after N consecutive failures" needs durable cross-invocation state, which `correo.ts` deliberately cannot hold (it is a pure, I/O-free decision core) â€” that is a new store, not an implementation swap. Revisit at ~100 gyms, when auth volume makes an outage matter. Until then the cheaper mitigation is not tripping the AUP in the first place (the send cap) plus keeping the seam swappable.

### CONFLICT: durable outbox with retries

*arch-reliability* wants receipts and invites in a `correo_pendiente` table with backoff. *arch-ops* wants no queue at all.

**Pick: no outbox now.** Build the webhook first and let it tell you whether the transient-failure rate is nonzero. If it is, build the outbox then â€” and when you do, note the trap: an idempotency key derived from a bare `venta_id` or invite code collides with Resend's own 24h dedup window [20], so a staff-pressed REENVIAR within 24h of a failed attempt returns the *cached* response and the desk shows success while the member gets nothing again. Key on `(business id, attempt nonce)`.

### The feedback loop + suppression semantics (build this first)

One route in the admin app, `/api/webhooks/resend`:

1. **Verify the Svix signature before trusting anything.** Resend's webhooks are Svix-signed for exactly this reason. Without it, anyone who finds the URL can inject fake `suppression.added` events to mass-flag real members as dead, or fake `delivered` events to mask an outage.
2. Accept `email.bounced`, `email.complained`, `suppression.added`. Dedupe on `svix-id`; order by `created_at` (delivery is at-least-once and unordered).
3. **Discriminate on `bounce_type`.** Resend emits `Permanent`, `Transient` and `Undetermined`. Writing a permanent status on any bounce replaces today's silent "enviado" lie with a new silent "rebotÃ³" lie. Key off `Permanent` or the authoritative `suppression.added`.
4. Write **one** thing: `clientes.correo_estado` (`rebotado` | `queja` | `baja`) + `correo_estado_at`, matched by address across tenants â€” which mirrors Resend's team-wide suppression semantics exactly [18].
5. The ficha and the invite/receipt buttons read it and say *"este correo rebotÃ³ â€” pÃ­dele otro"* instead of pretending. Editing the email clears it. **The repair mechanism is the gym staff standing in front of the member** â€” that is why a badge beats backend machinery.

**Suppression rules, non-negotiable:**
- **Auth mail is never suppressed and never carries List-Unsubscribe.** A member must not be able to opt out of their own ability to log in.
- **Receipts are never gated on `baja`.** If F5 ever ships and reuses this column, a `baja` value must be excluded from the receipt gate â€” a receipt for money paid is not opt-outable. Spell this precedence out at build time or the column reuse silently violates it the first time anyone unsubscribes.
- Suppression is keyed on `(identity, channel)`, **never** on a bare address. Resend's list is team-wide; ours must not be.
- Never retry a permanent failure. Never re-send on `delivery_delayed` â€” that means the provider is still trying.

### Monitoring

| Layer | Tool | Cost | Ops |
|---|---|---|---|
| DMARC visibility | Postmark DMARC Digests (free, ESP-agnostic, weekly email) [27] | $0 | ~5 min/mo |
| Gmail | Google Postmaster Tools, registered now; per-domain after the invite split [3] | $0 | 0 now, ~15 min/mo at scale |
| Microsoft | **Gap â€” honest uncertainty.** SNDS/JMRP are gated to the IP owner, which is Resend on a shared pool. Ask Resend whether they expose it. Roughly half our recipient base is hotmail-shaped and Microsoft enforces its own independent 5,000/day rule with a hard 550 [7] | â€” | â€” |
| Alerting | Extend the existing hourly `api/cron/alertas` â€” complaint rate >0.10% warn / >0.30% page [1], hard-bounce >2%/>5%, plus a **zero-auth-sends-in-60-minutes heartbeat** (the auth path's failure mode is silence, and that is how the last several incidents here went undetected) | $0 | ~15 min/mo |
| Placement | GlockApps, bought *occasionally* around a change, not as a subscription [46] | $0â€“129 | â€” |

**Steady-state ops: ~1 h/month at 2 gyms, ~2 h/month at 1000.** Nothing in this design scales with tenant count; the only component that would have â€” per-gym DNS â€” is ruled out permanently.

### One structural guard worth an hour

There are **two** Resend code paths, not one: the Deno auth hook does its own raw `fetch` with no `reply_to`, no headers, no tags, and no abort timeout on a call GoTrue is blocking on. Every header policy here must be applied twice, and the auth stream is exactly the one that will silently drift out of policy. They cannot share a module (Deno vs Node), so add a source-text drift test asserting both send sites carry the same envelope key set â€” the same shape as the existing `denial-suite-drift` guard.

## 6. Rollout order

1. **Register Google Postmaster Tools (apex).** *Why first:* free, zero code coupling, and the data is **not retroactive** â€” every day unregistered is baseline you can never get back. *Risk:* only the DNS verification step. *Rollback:* remove one TXT.
2. **Add `rua=` pointed at Postmark DMARC Digests.** *Why here:* it is the instrument every later decision reads, and it needs 24â€“48h to prove itself. *Risk:* a same-domain or bare-Gmail target silently receives nothing. *Rollback:* one TXT edit.
3. **Publish `sp=reject; np=reject` alongside `p=none`.** *Why here:* free anti-spoofing on the easier attack, zero delivery risk since no production mail is sent From any subdomain. *Risk:* any *future* feature sending from a subdomain is rejected until it publishes its own `_dmarc` â€” record this in the runbook. *Rollback:* one TXT edit.
4. **Reply-To on both send paths + Namecheap email forwarding on the apex.** *Why here:* it is the highest UX-per-minute item, it stops replies hard-bouncing, and a reply is the strongest positive engagement signal a provider can observe. *Risk:* a wrong field name is silently ignored by the API. *Rollback:* one-line revert. **Verify with a live send and raw-header inspection.**
5. **Tags (`tipo=â€¦`) on both send paths + the envelope drift guard.** *Why here:* free per-stream visibility from the first day of measurement, and the guard stops the auth path drifting again. *Risk:* none. *Rollback:* revert.
6. **The Svix-verified bounce/complaint webhook â†’ `correo_estado` â†’ desk badge.** *Why here and not first:* steps 1â€“5 are five-minute items that would otherwise never get done. **But this is the item that matters most** â€” it is the only one fixing a defect hurting members today rather than a threshold arriving at 500 gyms. *Risk:* a wrong `bounce_type` rule brands live addresses dead. *Rollback:* one migration down + a route delete; the column is ours, not Resend's.
7. **`escapeHtml()` in `mensajeInvitacion` + a metacharacter regression test.** *Why before F6:* F6 means adding fields, and every added field inherits the hole. *Risk:* none. *Rollback:* revert.
8. **Reshape the invite body** (carry the transaction forward, name the destination domain, drop the all-caps CTA). *Why here:* GPT (step 1) now gives a before-and-after. *Risk:* rendering regressions in Outlook/Gmail-iOS dark mode. *Rollback:* template revert.
9. **DMARC on the per-gym link domains, starting with `redfunctionaltraining.com`.** *Why here:* this is the actual phishing lane, it generalizes to a per-tenant provisioning step, and it is where the anti-spoofing budget belongs. *Risk:* none at `p=none`. *Rollback:* remove the record.
10. **Per-gym-per-day bulk send cap â€” ships with the bulk-import feature, not before.** *Why gated:* dead code at 2 gyms; catastrophic to lack the day someone imports a five-year-old 300-address list. *Risk:* a legitimate large onboarding is throttled â€” surface it as an alert, not a silent drop.
11. **Split the invite stream onto `invitaciones.ibookit.lat` â€” before the first bulk onboarding.** *Why last of the routine items:* it is the only step that changes an authenticated identity, and by then you can measure the result. *Risk:* a new unwarmed subdomain; mitigate by sending canaries only for 7 days while live mail keeps signing as the apex. *Rollback:* one-line From/key change back.
12. **On measured triggers only:** Resend Scale + managed dedicated pool (Postmaster shows IP-vs-domain divergence AND >5k/day); a Postmark fallback transport for auth (~100 gyms); an outbox (only if the webhook shows a real transient-failure rate); a one-time consultant audit ($1.5â€“5k, if placement problems survive steps 1â€“11).

## 7. What we deliberately do NOT do

- **Cold-email warmup tools (InboxAlly, Warmup Inbox, lemwarm).** Inapplicable and actively dangerous. They manufacture fake engagement inside a vendor's network of unrelated inboxes â€” no gym member is in that pool, so the "reputation" is disconnected from how real members treat real mail. Google revoked Gmail-API access for these tools in Feb 2023 for violating anti-spam/fake-engagement policy [44]. InboxAlly's *own* docs warn the patterns are detectable, can trigger suspension, and **expose your email content to other customers sharing the network** [45]. Our problems are DNS, headers, content and list hygiene â€” none of which warmup touches.
- **Per-gym sending domains on gyms' own DNS.** Available in Resend's API; still wrong. It hands deliverability to people who cannot carry it.
- **Per-tenant subdomains.** Manufactures 1000 permanently-unknown senders.
- **A dedicated IP now.** Unbuyable below 3,000/day, and our bursty shape is exactly what a dedicated IP punishes. The lazy "serious senders have a dedicated IP" instinct is the expensive answer here.
- **DMARC `p=quarantine`/`p=reject` on the apex.** No provider requires it, the deliverability benefit is unevidenced, there is no working partial-enforcement dial after RFC 9989 removed `pct=`, and we cannot detect the failure it causes.
- **One-click unsubscribe on receipts or auth mail.** Explicitly not required; on auth mail it is a self-service account lockout.
- **Address-keyed suppression of any kind.** Leaks across tenants and collides with the standing ruling that gym data belongs to the gym.
- **A retry/queue engine now.** Retrying a hard bounce is the fastest way to destroy reputation; soft failures are already retried inside Resend/SES.
- **Migrating to SES today.** ~3Ã— cheaper and the only native tenant isolation, but 20+ build hours and 2â€“4 ops-hours/month forever. The ~$250/mo premium is the cheapest purchase of ops hours available anywhere in this architecture.
- **Migrating to Postmark today.** The best-defaults product, but the default we'd be buying (auto-unsubscribe on Broadcast streams) doesn't apply to mail that is 100% transactional.
- **Bird (ex-SparkPost)** â€” degraded platform. **Loops** â€” contact-priced, single-brand, structurally wrong shape.
- **Validity Everest** ($1kâ€“10k+/mo, sized for >5M/mo senders), **paid MXToolbox** (~$99â€“129/mo; low-end pricing isn't published, and blocklist delisting is always free â€” paying to delist is a red flag), **Valimail** ($5k/yr floor, and DKIM rotation isn't even in the Starter tier), **a deliverability retainer** ($1.5â€“10k/mo).
- **Any dashboard, analytics pipeline, or per-gym deliverability report for gym owners.**
- **Link shorteners, click-tracking redirect domains, hero images in invite mail.** This repo already paid down the redirect-link debt once in the auth mail.

## 8. Open questions for the owner

1. **Does a per-gym contact email field exist on the gym table?** If not, ship the `soporte@` Reply-To fallback first and add per-gym routing when the field exists â€” do not block the fix on the schema. This decides whether reply triage stays at ~10 min/month or grows with tenant count.
2. **Who owns `soporte@ibookit.lat`, and what is the triage cadence?** A Reply-To with no reader is worse than today's honest no-reply, because a genuine account-security report disappears into it.
3. **Will Resend expose Microsoft SNDS/JMRP data for their shared pool?** Roughly half the recipient base is Microsoft-shaped, Microsoft enforces its own 5,000/day rule with a hard 550, and we currently have no visibility there at all. Worth one support ticket.
4. **Is a bulk member-import feature on the roadmap?** It is the trigger for the send cap (item 10) and, per the volume math, the single most likely way we cross Gmail's 5,000/day threshold â€” a ~39-gym onboarding week does it at any gym count, and **bulk-sender classification is permanent once triggered** [2].
5. **Counsel question (LFPDPPP):** is the gym the *responsable* and iBookit the *encargado*? If so, a platform-level unsubscribe is us unilaterally severing a gym's channel to its own member, which conflicts with the gym-data-belongs-to-the-gym ruling. The cheap hedge that costs no reachability: a plain-language line pointing at the gym's aviso de privacidad and an ARCO contact, with no machine-readable header.
6. **DKIM: rotate to 2048-bit and add a second selector?** The current key is 1024-bit on a single literal-TXT selector with no make-before-break path. Harmless at `p=none`, load-bearing if enforcement is ever revisited.

### Remaining uncertainty, stated honestly

- **The premise that invites are failing is unverified.** "Recibos pass filters, invites look phishy" rests on template shape and an absence of complaints at 180 emails/month across 2 gyms â€” too small a sample either way. Step 1 (Postmaster) exists partly to convert this from an impression into a number before spending effort on step 8.
- **Postmark's cost at 100k/500k** in Â§3 is naive arithmetic that doesn't reconcile with Postmark's own banded calculator. Get a quote before acting on it.
- **`t=y` adoption** at Gmail/Yahoo/Microsoft is unknown; none has published an updated spec, and Microsoft's docs still document the removed `pct=` tag. This is why there is no safe DMARC ramp right now.
- **Yahoo publishes no numeric bulk threshold** â€” "we will not specify a volume threshold" [5]. Every source claiming "Google and Yahoo both use 5,000/day" is attributing Google's number to Yahoo by convention.
- **Gmail's Primary/Promotions ranking signals are not published.** Claims that List-Unsubscribe pushes mail toward Promotions, or that image ratio does, are practitioner consensus, not documented policy.

---

### Sources

[1] Google, Email sender guidelines â€” support.google.com/a/answer/81126
[2] Google, Email sender guidelines FAQ â€” support.google.com/a/answer/14229414
[3] Google, Postmaster Tools setup â€” support.google.com/mail/answer/9981691
[4] Google, Postmaster Tools dashboards (spam rate) â€” support.google.com/mail/answer/14668346
[5] Yahoo Sender Hub FAQ â€” senders.yahooinc.com/faqs/
[6] Yahoo sender best practices â€” senders.yahooinc.com/best-practices/
[7] Microsoft, "Strengthening Email Ecosystem: Outlook's New Requirements for High-Volume Senders" â€” techcommunity.microsoft.com/blog/microsoftdefenderforoffice365blog/â€¦/4399730
[8] Microsoft Learn, Configure DMARC (ms.date 2026-07-03) â€” learn.microsoft.com/defender-office-365/email-authentication-dmarc-configure
[9] RFC 9989 (DMARC, May 2026; obsoletes RFC 7489; removes `pct=`, adds `t=`) â€” rfc-editor.org/rfc/rfc9989.html
[10] RFC 9990 Â§4 (DMARC aggregate reporting; external-destination verification)
[11] RFC 8058 (One-Click Unsubscribe)
[12] RFC 2369 (List-* header fields)
[13] RFC 8301 (DKIM key-size requirements)
[14] Resend pricing â€” resend.com/pricing
[15] Resend Acceptable Use Policy â€” resend.com/legal/acceptable-use
[16] Resend, dedicated IPs â€” resend.com/features/dedicated-ips, resend.com/docs/knowledge-base/how-do-dedicated-ips-work
[17] Resend, "Setting up Resend for Multi-Tenant Applications" â€” resend.com/docs/knowledge-base/setting-up-resend-for-multi-tenants
[18] Resend, Email Suppressions â€” resend.com/docs/dashboard/emails/email-suppressions
[19] Resend, Webhook event types + signature verification â€” resend.com/docs/dashboard/webhooks/event-types, /verify-webhooks-requests
[20] Resend, Idempotency keys â€” resend.com/docs/dashboard/emails/idempotency-keys
[21] Resend, DMARC + DMARC analyzer â€” resend.com/docs/dashboard/domains/dmarc, github.com/resend/resend-dmarc-analyzer
[22] Resend, API rate limit â€” resend.com/docs/api-reference/rate-limit
[23] Postmark pricing â€” postmarkapp.com/pricing
[24] Postmark dedicated IPs â€” postmarkapp.com/dedicated-ips
[25] Postmark, bulk vs transactional message streams â€” postmarkapp.com/support/article/can-i-send-bulk-emails
[26] Postmark, Resend migration guide â€” postmarkapp.com/migration-guides/resend
[27] Postmark DMARC Digests â€” dmarc.postmarkapp.com, postmarkapp.com/blog/introducing-dmarc-digests
[28] AWS, SES pricing plans (launched 2026-07-21) â€” aws.amazon.com/about-aws/whats-new/2026/07/amazon-ses-pricing-plans/, aws.amazon.com/ses/pricing/
[29] AWS, Tenant management in Amazon SES â€” aws.amazon.com/blogs/messaging-and-targeting/improve-email-deliverability-with-tenant-management-in-amazon-ses
[30] AWS, SES Virtual Deliverability Manager â€” docs.aws.amazon.com/ses/latest/dg/vdm.html
[31] SendGrid, Shared IP Pools 101 / Expert Services â€” support.sendgrid.com/hc/en-us/articles/17326626295579
[32] Mailgun pricing, Optimize pricing, SLA â€” mailgun.com/pricing/, /pricing/optimize/, /legal/sla/
[33] Bird (ex-SparkPost) pricing â€” bird.com/pricing/email
[34] Loops pricing â€” loops.so/pricing
[35] Valimail, "DMARC authentication doesn't guarantee inbox placement" â€” valimail.com/blog/dmarc-authentication-deliverability/
[36] Valimail pricing â€” valimail.com/pricing/
[37] dmarcian pricing â€” dmarcian.com/pricing/
[38] EasyDMARC pricing â€” easydmarc.com/pricing/easydmarc/businesses
[39] Cloudflare DMARC Management â€” blog.cloudflare.com/dmarc-management-ga/
[40] Cloudflare Email Service, domain requirements â€” developers.cloudflare.com/email-service/configuration/domains/
[41] Namecheap free email forwarding â€” namecheap.com/support/knowledgebase/article.aspx/308/2214/
[42] Spamhaus Domain Blocklist (DBL) â€” spamhaus.org/blocklists/domain-blocklist/
[43] Microsoft SNDS/JMRP overview â€” litmus.com/blog/what-is-microsoft-sndsâ€¦, iterable.com/blog/improve-deliverability-with-snds/
[44] Growbots, "Google bans cold email warmup" â€” growbots.com/blog/google-bans-cold-email-warmup/
[45] InboxAlly, "The dangers of using an automated email warmup service" â€” inboxally.com/docs/warm-up-sending-strategy/â€¦
[46] GlockApps pricing â€” puzzleinbox.com/compare/glockapps-pricing-review
[47] Validity Everest â€” validity.com/everest/inbox-placement/
[48] supabase/auth issue #1957 (custom SMTP sender-address swap, OPEN, unassigned)
[49] Repo (verified by direct read): `packages/data/src/server/invitaciones.ts`, `apps/admin/src/app/(app)/vender/recibo-envio.ts`, `apps/admin/src/app/(app)/vender/_components/ticket-twin.ts`, `supabase/functions/send-email/{index.ts,correo.ts}`, `packages/data/src/server/reenvio-limite.ts`, `apps/admin/src/app/api/cron/alertas/route.ts`, `docs/runbooks/hitl-72-resend-live.md`, `docs/Context/2026-08-27-red-custom-domain-findings-appendix.md`
[50] Live DNS (verified 2026-09-01): `ibookit.lat` SOA-only for apex TXT/MX; `_dmarc.ibookit.lat` = `v=DMARC1; p=none;`; `resend._domainkey.ibookit.lat` decoded to 1024-bit RSA, single selector; NS = dns1/dns2.registrar-servers.com; `_dmarc.redfunctionaltraining.com` NXDOMAIN with live MX

---

## Appendix: completeness critique (verbatim, from the verification critic)

Resolutions by the orchestrating session, 2026-09-01:

- Gap "per-gym contact email field": ANSWERED — `gym_contact.email` exists (migration `20260706165900_create_gym_contact.sql`, nullable, staff-editable, 1:1 satellite of `gym`; there is also `gym_legal.email_arco`). Reply-To can route per-gym today with a `soporte@ibookit.lat` fallback for gyms that left it empty.
- Remaining gaps below are citation/rigor caveats to carry into implementation, not blockers; treat the Resend Scale $ figures and the ~$250/mo premium arithmetic with the same get-a-quote skepticism the doc applies to Postmark.

- Â§3/Â§5 CONFLICT resolution: "Resend rides SES" is the sole load-bearing reason offered for rejecting SES-direct as real diversification and naming Postmark instead â€” no citation number attached, and it isn't listed among the document's own "Remaining uncertainty" items.
- Â§3 table: Resend's own Scale-tier figures at 1000 gyms (~$90â†’~$350â†’~$400 across 100k-550k/mo) get no "naive arithmetic, get a quote" caveat, even though the document applies that exact caveat to Postmark's base+overage math one row up â€” the recommended provider's cost at the volume that matters most is unchecked by the same rigor.
- F0 (the webhook â€” "the one thing to build," the headline recommendation) never gets the F1-F6 risk-table treatment; its one named risk in Â§6 step 6 ("a wrong bounce_type rule brands live addresses dead") has a rollback but no detection method, i.e. the owner's "what could break / where's the worst failure" ask is answered for the 6 fixes but not for the build item that matters most.
- Resend's API rate-limit doc is cited as [22] in Sources but never referenced in the body â€” the claim that a shared pool "absorbs" bursty traffic (onboarding waves, month-start receipt compression) at 1000 gyms is asserted, not checked against actual requests/sec ceilings, leaving the "reliable structure for 1000 gyms" answer untested on throughput.
- Â§7's dismissed alternatives (Validity Everest $1kâ€“10k+/mo, MXToolbox ~$99â€“129/mo, Valimail $5k/yr floor, a deliverability retainer $1.5â€“10k/mo) carry no inline citation markers at all, unlike every other cost figure in the document.
- Open question #1 ("does a per-gym contact email field exist on the gym table?") is punted to the owner even though the repo was already read directly for schema/code per source [49] â€” this looks like an answerable lookup, not a judgment call, and it gates rollout step 4 (Reply-To).
- The "~$250/mo premium" figure used in Â§7 to justify "stay on Resend" doesn't reconcile with the table's own numbers (~$400 Resend âˆ’ ~$120 SES â‰ˆ $280, or $350âˆ’$120=$230) â€” the same naive-arithmetic imprecision the document explicitly calls out for Postmark is present, unflagged, in its own headline verdict math.
- Monitoring table's hard-bounce alert thresholds (">2%/>5%") carry no citation, unlike the adjacent complaint-rate thresholds which cite [1] â€” an unsourced number setting the paging policy for a system covering 1000 tenants.
