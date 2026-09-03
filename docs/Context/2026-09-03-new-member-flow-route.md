# New-member flow — route (finding-the-standard, 2026-09-03)

Question: members self-register at /registro before tapping the desk invite → 429 loop, duplicate mails, roster row
never linked. Is the two-door flow over-complicated, and what is the simplest flow that closes every observed class?

## MEASURE (done, live 09-03, HEAD 6937aa7e)
- RED: 44 claimed members; **17 (39%) created their account BEFORE the desk invite** (auth.users.created_at < invitacion_enviada_at).
  Self-register-first is the norm, not an edge case. forge: 0 conflicts, 4 unclaimed invites, **44/50 rows have no email**.
- Missing transitions (design doc): login → claim (M1), recovery → claim (M3), /activar + existing account → "inicia sesión" (M5),
  no-match → silent twin INSERT (M6), `getEsMiembro` has no gym filter → self-heal never re-runs (root defect).
- Claim RPC raises 'Teléfono requerido' when phone null → 29/63 auth users silently no-op on claim.
- Cost of nothing: every self-register-first member = one hand-link by SQL (Iván 09-03) or a lost tester (Marce 09-02).
- Sources: docs/FIndings/2026-09-03-new-member-flow-design.md, -redteam.md; docs/FIndings/2026-09-02-new-user-VERDICT.md.

## RESEARCH (done) — docs/research/2026-09-03-member-onboarding-standard.md
Convergent pattern (Glofox, TeamUp, Trainerize, PushPress, Wodify, Zen Planner, Gymdesk; Mindbody deviates and leaks
duplicates): business creates the record; member CLAIMS it by verified email; same-email signup merges or degrades to
login; exactly ONE claim mail, resendable; claim state visible on the desk. No vendor uses a code/PIN as claim credential.
We are the only one sending two mails from two doors into one GoTrue bucket (2/hr built-in, 30/hr custom SMTP, 60 s/address).

## Options (design doc ranking)
A. Claim on every session mint + /activar existing → login + one mail (≈ −80/+26 lines, 1 migration). Deletes the
   magic-link rail (`enviarMagicLink`, `cuentaExistenteFallo`, `codigo`+`firma` arm of /auth/confirm, `intentarReclamoConFirma`).
   Cannot fix a desk typo (stays a desk EDITAR).
B. Desk pre-creates the auth user (admin.createUser + invite). One account ever, but desk gets an account-minting primitive; 91 rows without email can't use it.
C. Incumbent + 429 wait state (fix #1 only). Loop fixed, conflicts stay hand-SQL.
Red-team ship-gate for A: claim may only LINK an existing unclaimed row, never INSERT a cliente/membership (kills the
`?gym=` twin/authz surface). Keep codes for email-less members (forge 88%). Make phone optional in the claim RPC.

## RULINGS (owner) — recorded below when made
- R1 identity key = verified email; claim links only, never creates: **YES (owner, 09-03)**
- R2 one mail per member; /activar magic-link rail deleted; invite = "crea tu cuenta con este correo" → /registro prefilled: **YES (owner, 09-03)**
- R3 codes: **DELETE codes; desk types the email (owner, 09-03)**

## Route
| # | question | type | blocked by | artifact |
|---|---|---|---|---|
| U1 | which RED member is in Iván's state right now? | measure | — | SQL result, hand-link or wait for P1 |
| U2 | R1–R3 | ruling | MEASURE+RESEARCH (done) | this file |
| U3 | does option A feel right on a phone, red-demo, +alias accounts, both orders (register-first / invite-first)? | prototype | U2 | branch `new-member-one-door`, owner walk |
| U4 | tickets from the prototype that survives U3 | ruling→tickets | U3 | GitHub issues |
Dropped angles: no browser test yet; Supabase plan/rate-limit dashboard values unread (owner); different-email-than-desk case has no standard (all vendors: staff edits).
