# Handoff — 2026-07-24: activation cutover SHIPPED + RED Stage-5 seed EXECUTED

One session did two releases. Both are **done and live-verified** — do not re-run either. What's left
is a short, ordered tail: one test walk, one teardown, owner-paced invites, and a second seeding pass
gated on owner inputs.

**PII rule:** this file is committed to a PUBLIC repo — no member names/emails/phones here. The member
roster lives in `docs/supabase/seeding-contacts.json` (gitignored) and the two untracked 07-20 seed docs.
Keep it that way.

## Verify ground truth before trusting a word of this

```sql
-- RED tenant (gym_id ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9): expect 19 / 19 / 1019
select
  (select count(*) from clientes where gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9'),
  (select count(*) from ventas   where gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9'),
  (select last_folio from gym_folio_counter where gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9');
-- Activation door: expect (p_codigo text, p_firma text) — two args
select pg_get_function_identity_arguments(p.oid) from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='reclamar_por_codigo';
```

```bash
git log --oneline -2          # expect 1cd8b6b (H2v2 ruling doc) on 16a18b7 (option b) — main == origin/main
gh issue list --repo Vack99/RED-2.0 --state open   # expect #149 #150 #151 #152 among them
```

Also check the test member's state before assuming anything (Aaron may have walked his activation
between sessions): `select claim_code is null as invited, auth_user_id is not null as activated from
clientes where gym_id='ca1954bc-...' and folio-1019-venta's cliente` — or just look at ficha folio 1019.

## What shipped this session (all verified — details in memory + docs)

1. **Activation cutover LIVE** (~60s window): `20260722120000` applied via MCP (two-arg firma-gated
   `reclamar_por_codigo`, one-arg dropped → H1/H2v1 closed), `origin/main` merged, pushed, deploy
   confirmed by prod behavior flip, magic-link activation walked end to end on forge-demo, test rows
   cleaned. `test:denial` 37/37 post-merge on scratch.
2. **H2v2 ruled option (b) and shipped** (`16a18b7`, +22/−171): `/registro` code-claim arm deleted;
   `/activar` is the sole invite door. Pre-implementation audit confirmed both email rails are
   roster-email-bound (the handoff's deletion map had 2 errors — corrected). Ruling recorded in
   `docs/Context/2026-07-22-activation-security-audit.md`; `activation-magic-link` branch swept.
3. **Push audited clean**: exactly 9 commits (not the feared 66), no secrets, no seed PII, repo-public
   `.gitignore` shield for `/docs/supabase/` confirmed. One accepted residual: the owner's own test
   email in the public audit doc (offered redaction, not requested).
4. **Pre-seeding capacity review** (read `docs/Context/2026-07-22-invite-mail-capacity-audit.md`, do
   NOT re-run its fan-out): no bulk path exists by design; binding risk = shared Resend bounce budget;
   Supabase-side all green at RED scale (auth mail 50/hr project-wide, durable claim link +
   on-demand 1h magic link). All 18 contact domains MX-validated canonical (gmail/hotmail/icloud).
5. **Invite strategy DECIDED: in-class, per-ficha, one by one — never a batch.** Supersedes the
   audit's two-wave protocol. Seeded rows land `sin_invitar`; the ficha's "Enviar invitación"
   (first-send, issue #71 affordance) mints the code and sends at the moment the owner tells the
   member in person. Verified the full chain exists in code (derive.ts:136, cliente-detalle.tsx:367,
   preparar_invitacion mint-or-reuse).
6. **Roster reconciled with the owner** (all in `seeding-contacts.json`): one nickname resolved to a
   paid Mensualidad; everyone with contact info but no roster payment = single-class buyer (attended,
   0 left, venta 2026-07-21 approx); one provisional-name contact; the prepay member's package resolved
   (Ilimitada Ago 2026→Ene 2027, vence 2027-01-07); one out-of-state phone confirmed current; Aaron
   added as test member.
7. **Stage 5 EXECUTED on live**: 19 clientes + 19 ventas (13+1 Ilimitada, 5 Clase individual), folios
   1001–1019 chronological, counter 1019, all rows `sin_invitar`, 0 cross-tenant writes. Verify query
   returned every expected value. Plan doc holds the rollback + the Aaron-teardown SQL.
8. **Issues filed**: #149 (audit §5 deferrals), #150 (vincular UX: show signed-in account + surface
   refused claim), #151 (mail delivery resilience: 429s, bounce webhook, suppression, ficha chip),
   #152 (LatAm ~3,000-gym scale readiness — the full ceiling map + sequencing).

## Pending, in order

1. **Aaron's test walk (member folio 1019)** — log into `red-admin.ibookit.lat` as the gym owner →
   ficha 1019 → "Enviar invitación" → invite arrives at his gmail → activation takes the
   **cuenta_existente magic-link rail** (his address already holds an auth account) → should land
   signed-in at `red.ibookit.lat/reservar` → book a class. Then check DB stamps (auth_user_id set,
   claim_code null, membership row, email unchanged).
2. **Aaron teardown AFTER the walk passes** — exact SQL in the plan doc (deletes venta 1019 +
   red membership + cliente; keeps auth.users and the counter; the 1019 folio gap stays reserved).
3. **Owner starts in-class sends** at her own pace. Brief her: ~4 Mensualidad rows show "Plan
   vencido" and the 5 single-class rows show "sin clases" — truthful state, not bugs. A failed send
   = chip on the ficha + re-click (no auto-retry until #151).
4. **Forge loose end from the cutover**: ONE real Forge member's outstanding invite link predates
   `/activar` and broke with option (b) — owner re-sends it in one click (REENVIAR on her ficha).
   Identity in private memory (`activation-cutover-shipped`).
5. **Second seeding pass** when the owner's WhatsApp round returns: 9 members' phones, the prepay
   member's actual monto, the provisional name confirmation, optional real single-class dates.
   Folios continue 1020+ (reconcile-don't-bulk-insert if the owner hand-added anyone meanwhile —
   the pre-flight in the plan doc is mandatory again).
6. **Future sessions**: #151 (before gym #2 onboards is ideal), #150, #149, #152 (LatAm — also fold
   in the Resend Free→Pro $20 decision). Cleanup candidate: the stale `docs/supabase/seeding` file
   (superseded by `seeding-contacts.json`; keep until the second pass lands, then archive/delete).

## Rules that bind

- Supabase MCP is bound to **LIVE**. `execute_sql` for data; `apply_migration` only for DDL; never
  `supabase link`/`db push` to prod (schema_migrations drift — memory `prod-migration-version-drift`).
- No member PII in anything committed — the repo is PUBLIC. PII home: `docs/supabase/` (gitignored)
  + the two untracked 07-20 seed docs (they carry an explicit do-not-commit warning).
- Invites: in-class, one by one. There is no batch path and none should be built (#151/#152 track
  the resilience/scale work).
- Pre-commit runs lint+typecheck+test; never `husky` with an argument; migration-bearing changes
  need scratch `test:denial` green before main.

## Pointers

- Seed plan + SQL (rollback, teardown, second-pass rules): `docs/superpowers/plans/2026-07-20-red-gym-live-seed.md` (untracked)
- Member roster + decisions: `docs/supabase/seeding-contacts.json` (gitignored)
- Capacity/email model: `docs/Context/2026-07-22-invite-mail-capacity-audit.md`
- Activation audit + H2v2 ruling: `docs/Context/2026-07-22-activation-security-audit.md`
- Memory: `red-gym-live-seed-progress`, `activation-cutover-shipped`, `email-capacity-ceilings`
