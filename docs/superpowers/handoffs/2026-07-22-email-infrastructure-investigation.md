# Handoff — the email situation: what to do about it

**Date:** 2026-07-22 · **For:** a fresh session owning the email-infrastructure decision · **Status:** audit complete, **no decision made, no code written**

## Why you exist

The platform is about to mail its first real member roster (RED gym, ~18 invitations). A capacity audit was run first, and it found the mail rails work fine at today's scale but have **no headroom design at all** — no queue, no retry, no per-tenant metering, and a set of ceilings that are *shared by every tenant*. The business target is **3,000 gyms**.

Your job is to decide what the email architecture should become and in what order. **Not** to build a queue — see "The trap" below.

**Read first:** [`docs/Context/2026-07-22-invite-mail-capacity-audit.md`](../../Context/2026-07-22-invite-mail-capacity-audit.md) — the full audit with all numbers, citations, and the break-order table. This handoff is framing + open questions; the audit is the evidence.

**Method note:** the audit ran 3 recon agents → a capacity model → 3 adversarial verifiers on separate lenses (code / vendor docs / arithmetic). All three verifiers returned PARTIALLY_WRONG and their corrections are already folded into the audit doc. Treat the audit as post-correction. Do not re-run the fan-out.

## The architecture in one paragraph

Six mail rails, all hitting `POST api.resend.com/emails` through one injectable transport (`packages/data/src/server/invitaciones.ts:49-80`). Five are direct from the admin app; one is Supabase Auth's GoTrue routed through a Send Email Hook edge function. One Resend account, one API key, one sending domain (`ibookit.lat`), one mailbox (`no-reply@ibookit.lat`) — **a gym's identity is only the `From:` display name**. One Supabase project for all tenants. Every send is an inline `fetch` awaited on the request path with a 10s timeout.

## The five findings that should drive the decision

**1. The bounce budget is shared, account-level, and the penalty is suspension.**
Bounce <4%, complaint <0.08%, *"your account may be shutdown without warning"* (resend.com/legal/acceptable-use). Lifetime volume is **28 stamped invites, ever** — there is no history to dilute a single bad address. Suspension takes down invites, receipts **and auth mail** simultaneously, because the same API key is the Supabase SMTP password. This is the only ceiling that can bind *today*, and it's the one with no graceful degradation. **This is the finding most likely to be under-weighted.**

**2. Every failure is a silent, unretried drop.**
`invitaciones.ts:73` — a 429 is indistinguishable from a 500. Single attempt, no backoff, `retry-after` / `ratelimit-reset` / `x-resend-daily-quota` headers all discarded. `invitacion_enviada_at` is only stamped on transport success, so the invite survives as re-sendable — but **only if a human notices the failure chip and clicks again**. That's tolerable at 1 click/member and invisible the moment anything fans out.

**3. Rails 1–5 never touch Supabase's rate limit; rail 6 is the only one that does.**
Invites and receipts go direct to Resend. Only GoTrue mail draws on the 50/hour bucket. **Conflating these invalidates any model.** Relatedly: activation costs **zero** extra mail — `activar-cuenta/index.ts:92-95` uses `admin.createUser({email_confirm:true})`, which queues no GoTrue mail. One member = one email.

**4. The Supabase auth limit is scoped `"Sum of combined requests project-wide"`.**
One hourly bucket for all 3,000 gyms. Gym #412's signup drive 429s password resets at gym #7. Currently 50/hr, set deliberately so an hourly burst couldn't outrun Resend's 100/day — **so raising it while on Resend Free just relocates the failure downstream.**

**5. There is a sixth rail that auto-sends and is easy to miss.**
Editing a ficha to set/change an email on an unclaimed row fires an invite with no confirmation (`packages/data/src/server/clientes.ts:455-461`). Correcting a typo'd address twice sends two invites. No dedupe. This one was missed on the first pass and found by the code verifier.

## The trap

**Do not open with "build an outbox/queue."** It is the obvious-looking answer and it is premature:

- Peak concurrency in the entire codebase is **2** (one sale's invite + receipt).
- Platform volume is **~1–4 emails/day** across all four gyms.
- **No loop over recipients exists anywhere** — an agent was tasked with refuting this and failed.
- The repo has an explicit standing decision against it (`supabase/migrations/20260706200000_clientes_notificaciones_toggle.sql`: *"no framework, no queue, no cron"*).

It becomes mandatory at exactly two triggers, whichever lands first: **(a)** the day one operator action fans out past ~10 emails, because a partial 429 then has nobody watching per-recipient chips; **(b)** ~3,000 gyms, where month-start renewal clustering pushes minute peaks toward 10 req/s. Both are real. Neither is now. If you propose it, name which trigger you're pricing.

## Open questions you own

1. **Resend plan.** Free (100/day, 3,000/mo) → Pro $20 (50k, no daily cap) is a billing toggle with zero code. Trivially correct *eventually*; the question is the trigger. Free dies at ~66 gyms, or the 3rd gym onboarding in a day.
2. **Per-tenant metering.** Nothing anywhere caps or meters one gym's sends. One operator mailing a cold roster can spend the platform's day, or its bounce budget. Does a per-gym budget belong in the DB, and enforced where?
3. **Sender identity.** Per-gym subdomains isolate sending reputation (resend.com/docs/dashboard/domains/introduction) but multiply DNS onboarding per gym — and interact with the BYO-domain queue already flagged in the `vercel-domain-scale-verdict` memory. Root-domain-forever is a real choice too; just make it deliberately.
4. **Address hygiene.** Nothing validates an address before it's mailed. Given the 4% account threshold, is a verification step (or a bounce-webhook → suppression list) needed before the platform mails rosters it didn't collect itself?
5. **429 semantics.** `resendTransport` should at minimum distinguish `rate_limit_exceeded` (retryable) from `daily_quota_exceeded` / `monthly_quota_exceeded` (wait for the wall to clear) from a bad address. ~15 lines; the injectable seam already exists.
6. **Whether the batch endpoint matters.** 100/call, counts as 1 request against the rate limit — but **`attachments` is not supported**, so it can never carry receipts (every receipt has the PNG twin). Invite-only.

## Verified vs. not

**Verified** (fetched + independently re-fetched by a second agent): Resend 10 req/s per team across all keys; Free = 100/day + 3,000/mo; batch = 100/call, no attachments; bounce 4% / complaint 0.08% / suspension without warning; multi-account circumvention is an explicit AUP violation; Supabase email limit scoped project-wide; custom-SMTP starting value 30/hr; Auth Hook budget 5s with ≤3 retries on 429/503; Edge Function 150s wall / 2s CPU.

**UNVERIFIED — do not design around these:**
- Whether the Send Email Hook lifts the auth rate limit. Its doc page contains **no** mention of "rate limit". This repo keeps custom SMTP on deliberately, which is consistent with the hook *not* lifting it. Verify empirically before assuming.
- Supabase's **maximum settable** email rate limit — no doc publishes one.
- Whether Resend evaluates bounce ratio over a rolling window or lifetime. Changes how bad a single early bounce is.
- Supabase Edge Function concurrency/RPS — unpublished.
- Two live Supabase doc conflicts, unreconciled between their own pages: OTP 30/hr vs 360/hr; MFA 15/hr vs 15/min.

## Live state (2026-07-22)

4 gyms · 86 clientes · 34 with an email · 4 claimed accounts · 28 invites stamped, lifetime. RED tenant is still **empty** (0 clientes, 0 ventas, `last_folio` 1000). ~27 sales in the last 14 days, 14 on clients with an email. No 429s or rate-limit errors in the 24h log window. Resend account is on **Free**. Supabase auth email limit is **50/hour**.

## Constraints inherited from the repo

- `RESEND_API_KEY` / `RESEND_FROM` / `PLATFORM_CLIENT_FALLBACK_HOST` live on the **admin** Vercel project (`docs/runbooks/hitl-72-resend-live.md` §D).
- ADR-0014 pins **one platform sender**, gym-neutral address, gym name in the display name and copy. Changing that is an ADR amendment, not a config tweak.
- ADR-0015 makes invite send **best-effort by contract** — a failed send must never break a sale. Any retry/queue design has to preserve that.
- Supabase MCP is bound to **LIVE prod**. Seeds go through `execute_sql`, never `apply_migration` (memory `prod-migration-version-drift`).

## Not blocking you

The RED roster send itself is safe and can proceed independently: ~18 emails against a 100/day cap with a ~1–2/day baseline, nothing touching the Supabase bucket, `red.ibookit.lat` mapped so every link resolves. The only live risk there is address quality on hand-transcribed addresses — mitigated by sending in two waves (~5, read the bounce log, then the rest). Roster data and the open owner questions are in `docs/supabase/seeding-contacts.json` — **local-only,
gitignored**: it holds real member names, phones and emails, and this repo is public.
