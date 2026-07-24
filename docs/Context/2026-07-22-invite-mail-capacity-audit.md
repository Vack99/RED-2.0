# Invitation-email capacity audit — can the mail rails carry 3,000 gyms?

**Date:** 2026-07-22 · **Trigger:** about to send the RED gym's first real member invitations · **Method:** code cartography + fetched vendor docs (16 pages) + live-prod reads, then three adversarial verifiers on separate lenses. Verifier corrections are folded in; the two vendor facts everything else rests on were independently re-fetched and confirmed.

## Answers to the three questions

**How many can we send at a time?** There is no "at a time". **No bulk path exists anywhere in the repo** — no CSV import, no multi-select in the clientes list, no script, no SQL trigger. One invite = one operator click = one `fetch` to Resend. The most any single operator action can produce is **2 emails** (a new-client sale fires invite + receipt concurrently, `apps/admin/src/app/(app)/vender/actions.ts:49-54`). The ceilings that would bind if a bulk path existed: **100 emails/day** (Resend Free, hard 429) and **10 requests/second per team**.

**Is there a queue?** **No.** Every send is an inline `fetch` awaited on the request path with a 10s timeout (`packages/data/src/server/invitaciones.ts:59-77`). No outbox, no job table, no cron, no retry, no backoff. This is a deliberate documented non-goal (`supabase/migrations/20260706200000_clientes_notificaciones_toggle.sql`: *"no framework, no queue, no cron"*). A 429 is handled identically to a 500 — `{ok:false}`, dropped, and `invitacion_enviada_at` stays unstamped so the invite is re-sendable **only if a human notices the failure chip and clicks again**.

**Would 3,000 gyms saturate it?** Yes — but the first thing to break is not throughput, it's the **shared bounce budget**, and it can break today.

## The six mail rails

All six hit the same Resend REST endpoint through the same transport, with the same no-retry posture.

| # | Rail | Trigger | Emails |
|---|---|---|---|
| 1 | Invite (auto) | New-client sale **with** an email in `/vender` | 0 or 1 |
| 2 | Receipt (auto) | **Every** sale where an email is on hand — carries the PNG twin | 0 or 1 |
| 3 | Invite (auto, **easy to miss**) | Editing a ficha to set/change an email on an **unclaimed** row — `packages/data/src/server/clientes.ts:455-461` | 1 per edit |
| 4 | Invite resend (manual) | REENVIAR on the ficha | 1 per click |
| 5 | Receipt resend (manual) | REENVIAR on the recibo card | 1 per click |
| 6 | Auth mail | Supabase GoTrue → send-email hook → Resend | 1 per auth action |

Rail 3 was missed on the first pass and matters operationally: **correcting a typo'd email twice sends two invites.** No dedupe on 3/4/5 — by design for the manual ones, unintentionally for 3.

**Rails 1–5 never touch Supabase's auth rate limit** — they go direct to `api.resend.com`. Only rail 6 draws on the 50/hour bucket. Confusing the two invalidates any capacity model; keep them separate.

**Activation costs zero extra mail.** `supabase/functions/activar-cuenta/index.ts:92-95` uses `admin.createUser({email_confirm:true})`, which queues no GoTrue mail. One member = one email, not two.

## What breaks first, in the order a growing platform actually hits it

**1. Shared bounce/complaint budget — binds TODAY.**
One Resend account, one sending domain `ibookit.lat`, one mailbox. Per-gym identity is only the `From:` display name. Thresholds are **account-level**: bounce **<4%**, complaint **<0.08%**, and *"your account may be shutdown without warning"* (resend.com/legal/acceptable-use). Lifetime denominator is tiny — **28 invites stamped platform-wide, ever**. One hard bounce in an 18-address batch is **5.6%**. Suspension stops invites, receipts *and* auth mail for every gym at once, because the same API key is also the Supabase SMTP password.

**2. Resend Free 100/day (hard 429 `daily_quota_exceeded`) — binds at ~3 gyms onboarding in one day.**
3 × 40-member rosters = 120 > 100. Or ~50 new-member sales in a day (2 emails each).

**3. Resend Free 3,000/month — binds at ~66 gyms** (3,000 ÷ 45 emails per gym-month).

**4. Supabase auth 50/hour, scoped `"Sum of combined requests project-wide"`** — one bucket for all tenants. Binds at **~3,000 gyms** on steady-state resets, **or instantly** at any single gym running a >50-signup/hour drive. Symptom: a member at gym #7 can't reset a password because gym #412 ran a signup push.

**5. Resend 10 req/s, per team** — *"applies across all API keys associated with your team"*, so per-gym keys buy nothing, and splitting across accounts is an explicit AUP violation. Unreachable by hand (peak concurrency in the codebase is 2). Binds around 3,000 gyms on month-start renewal clustering — **or immediately, the day a bulk-invite path ships**.

**6–7. Degradations, live today:** every send blocks the request path up to 10s; no dedupe on manual resends.

## Volume model

Per 40-member gym at full email coverage: `40 renewals + 4 new-join + 1.2 resets ≈ 45/month ≈ 1.5/day`.
At 3,000 gyms: **135,600 emails/month ≈ 4,520/day**, with month-start clustering pushing minute-level peaks toward the 10/s ceiling.

| Plan | Volume | Gyms supported |
|---|---|---|
| Free $0 | 3,000/mo, **100/day cap** | ~66 (and ~3/day onboarding) |
| Pro $20 | 50,000/mo, no daily cap | ~1,100 |
| Pro $35 | 100,000/mo | ~2,200 |
| Scale $160 | 200,000/mo | ~4,400 |

**3,000 gyms needs Scale (~$160/mo)** and a dedicated IP (Scale-only, gated at >3,000 emails/day ≈ 2,000 gyms).

## Fixes, ranked — each removes a named ceiling

1. **Resend Free → Pro ($20).** Kills ceilings #2 and #3 at once. Billing toggle, zero code, same API key. **Needed before the 3rd gym onboards in one day.**
2. **Two-wave sends for hand-transcribed rosters.** Send ~5, read the bounce log, then the rest. Caps exposure on a 4% account threshold with no history to dilute it. Process only. **Needed now.**
3. **Honor the 429 in `resendTransport`.** It already discards `retry-after` / `ratelimit-reset` / `x-resend-daily-quota` (`invitaciones.ts:73`). Retry once on `rate_limit_exceeded`; return a distinct value for quota walls so "we're out of quota" doesn't read like "bad address". ~15 lines, seam already exists. **Do it with #1.**
4. **Raise `rate_limit_email_sent` above 50/hour.** Strictly *downstream* of #1 — the runbook set 50 specifically so an hourly burst couldn't outrun Resend's 100/day. Raising it on Free just relocates the failure. Max settable value is **UNVERIFIED** (no Supabase doc publishes one).
5. **Batch endpoint** (100/call, counts as 1 request). Only if a bulk-invite path ships — and it **cannot** carry receipts: *"the attachments field is not supported yet."*
6. **An outbox/queue — not yet, and say so plainly.** Peak concurrency today is 2; platform volume is ~1–4 emails/day. It becomes mandatory at exactly two triggers: (a) the day one action fans out past ~10 emails, since a partial 429 then has no human watching per-recipient chips; (b) ~3,000 gyms. Building it before either is premature.

## Today's send is safe

18 invites against a 100/day cap with a ~1–2/day baseline. Nothing touches the Supabase bucket. Nothing approaches 10 req/s. `red.ibookit.lat` is mapped, so every link resolves and no invite returns `sin-host`.

The risk today is **address quality, not capacity** — 18 addresses transcribed by hand from WhatsApp forwards against a 4% account-level bounce threshold with a ~28-email lifetime denominator. Hence fix #2.

## Unverified — do not design around these

- Whether the send-email hook lifts the auth rate limit. The hook's doc page contains **no** mention of "rate limit". This repo keeps custom SMTP on deliberately, consistent with the hook *not* lifting it.
- Supabase's maximum settable email rate limit.
- Whether Resend evaluates bounce ratio over a rolling window or lifetime.
- Supabase Edge Function concurrency/RPS (unpublished).
- Two live doc conflicts: OTP limit 30/hr vs 360/hr, MFA 15/hr vs 15/min, unreconciled between Supabase's own pages.
