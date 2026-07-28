# Handoff — finish the RED gym live seed (Stage 5: members + sales)

**Date:** 2026-07-20 · **Updated:** 2026-07-24 (roster reconciled with the owner) · **For:** the next session · **DB:** live prod `hjppxawglmukfvsgmcog` (Supabase MCP is bound to LIVE — every write hits real data)

## TL;DR

The RED gym go-live seed is **4 of 5 stages done and verified on live prod**. Stage 5 (members + one real sale each) was reconciled with the owner **2026-07-24** and is now partly unblocked:
- **19 rows are seedable NOW** — 13 Mensualidad ilimitada + 5 Clase individual (already attended) + 1 test member (Aaron, removed after testing). One atomic SQL block; folios **1001..1019**. The exact copy-runnable SQL is in the plan (`…/plans/2026-07-20-red-gym-live-seed.md`, Stage 5).
- **9 remain second-pass**, blocked on real **phone numbers** (`clientes.tel` is NOT NULL); Abrham Lara's package is resolved (Ilimitada, vence 2027-01-07) and he is *additionally* pending only the prepay **monto**.
- **Emails ARE carried in the seed now** (lowercased) — this REVERSES the old "email = NULL" rule. Rows land `sin_invitar` (email set, no `claim_code`).
- **Invites are sent IN-CLASS, one ficha at a time — never a batch.** See the invite section below.

**Do not seed until you run the pre-flight reconciliation check below** — the owner may have added members by hand while we waited (no unique constraint on tel/email → a manual add duplicates).

## What's already LIVE (do not redo)

- **Owner account:** `narda_m11@hotmail.com` (user id `aaad35a8-3661-472a-bdf4-06457093112d`) — SQL-minted `auth.users` + `auth.identities`, `gym_membership(owner)`, `gym.owner_user_id`. Login verified green.
- **Catalog:** 4 plans, 6 class types, 2 coaches (Narda, Martin).
- **Schedule:** 21 templates + 126 sessions (6-week buffer), coaches linked, gym-local times correct.
- **Config:** `perfil` (negocio "RED Functional Training", coach "Narda"; `tel`/`ciudad` NULL) + 4 default WhatsApp `plantillas`.
- **Target gym_id:** `ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9` · **TZ:** `America/Chihuahua`.
- Full detail + verified counts: memory `red-gym-live-seed-progress`; spec `docs/superpowers/specs/2026-07-20-red-gym-live-seed-design.md`; plan/runbook `docs/superpowers/plans/2026-07-20-red-gym-live-seed.md` (Stage 5 has the exact SQL shape + the full roster table with computed `vence`).

## What's seedable now vs still blocked (2026-07-24 reconciliation)

**Seedable now — 19 rows** (source: `docs/supabase/seeding-contacts.json`, arrays `mensualidad` + `clase_individual` + `test_member`):
- **13 Mensualidad ilimitada** — the `mensualidad` array (includes Elsa María "Sama" Rodríguez, owner-confirmed she IS roster "Sama"). `clases_restantes` NULL, `monto` 1200, `vence = last_payment + 30`.
- **5 Clase individual** — the `clase_individual` array. Owner confirmed everyone with contact info NOT on the Inscritos list bought a single class and already attended it: `clases_restantes` 0, venta `clases` 1, `monto` 120, `fecha` 2026-07-21 (approx), `vence` 2026-08-20. Includes "Jaime Hernandez" (PROVISIONAL name for `jaimehdzh04@`).
- **1 test member** — Aaron Talavera, Mensualidad ilimitada, venta dated the seed-execution day, folio LAST (1019) so his post-test removal leaves the gap at the tail. Teardown SQL is in the plan.

**Still blocked — 9 rows (second pass), do NOT seed yet:** the `roster_without_contact` array (Fer la mexicana, Bibi, Brenda Chávez, Dulce Chávez, Alva Valles, Karen Lara, Gaby Bustillos, Diana Hernández, Abrham Lara).
1. **Real phone numbers.** `clientes.tel` is `NOT NULL` / exactly 10 digits. **No placeholder/fake phones in a real gym** — wait for the real ones. They seed in a later pass, folios continuing from the counter (`next_folio` → 1020+; Aaron's 1019 gap stays reserved).
2. **Abrham Lara — package RESOLVED (2026-07-24).** Mensualidad ilimitada prepaid Ago 2026 → Ene 2027 (roster "Agosto a enero 7") → `vence` **2027-01-07**, `clases_restantes` NULL, venta `fecha` 2026-07-07. He is blocked only like the other 8 (**phone number**), plus one extra: the **monto** actually paid for the prepay — pin both when the WhatsApp round returns.

## Why the 9 still wait (operational hazard)

Waiting on the 9 has **zero cost to the seed work** — their shape is identical to the 19. The only downside is **operational**: if the owner records a sale or adds an existing member through the app **before** we seed, she creates a duplicate `clientes` row — this DB has **no unique constraint on `tel`/`email`** (the root cause of the renewal-duplicate mess). She was asked to **hold off entering her existing roster** until we seed. Placeholder-seed-now was rejected (fake data in a real gym) — real phones or nothing.

## Invite delivery — IN-CLASS, one by one (NEVER a batch send)

The seed only creates `sin_invitar` rows (email set, `invitacion_enviada_at` NULL, no `claim_code`); it sends nothing. The owner opens each member's ficha in the admin app and presses **"Enviar invitación"** (the ficha's `sin_invitar` affordance, issue #71) at the moment she tells that member about the app in person.
- Live per-member verification kills the bounce-budget risk — this **supersedes** the two-wave bulk protocol from the 2026-07-22 email audit; there is no batch path.
- The invite's claim link **never expires** (only the on-demand magic link is 1-hour), so late openers lose nothing.
- Trickle sending doubles as sender-reputation warm-up.
- The lapsed / used-up members (~9: the 4 Mensualidad past `vence` + the 5 Clase individual at 0 classes) will **truthfully** show "Plan vencido" / "sin clases" on screen — the owner should expect that in front of the member (correct, not a bug).
- A member who later gives an email gets it added via the ficha edit (`actualizar_cliente` email arm), which **auto-fires the invite** on the unclaimed row — desired, done in person.

## ⚠️ Pre-flight — run FIRST, before any Stage-5 insert

The owner may have used the app during the wait. Check current state:

```sql
select
  (select count(*) from clientes where gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9') as clientes,
  (select count(*) from ventas   where gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9') as ventas,
  (select last_folio from gym_folio_counter where gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9') as last_folio;
```

- **`clientes=0`, `ventas=0`, `last_folio=1000`** → clean. Proceed with the plan's Stage 5 verbatim (folios **1001..1019**). The Stage-5 `DO` block re-asserts all three in its firewall and aborts otherwise.
- **Any non-zero** → the owner operated. **Do NOT bulk-insert blindly.** Reconcile: pull existing `clientes` by name, match against the 19 in `docs/supabase/seeding-contacts.json`; for anyone she already added, **UPDATE** (fill `tel`/`email`/`vence`, add the missing venta) rather than INSERT; **INSERT only the missing ones**. Start folios at `last_folio + 1`, not 1001. Watch for name-spelling mismatches when matching (the JSON carries both roster nickname and real name).

## Stage 5 seed spec (the 19 — copy-runnable SQL is in the plan)

Source: `docs/supabase/seeding-contacts.json` (reconciled 2026-07-24 — 19 seedable + 9 second-pass). The full VALUES list, verify, rollback, and Aaron teardown are in `…/plans/2026-07-20-red-gym-live-seed.md` Stage 5; this is the shape summary.

**Emails ARE carried now** (lowercased on insert) — reverses the old "email = NULL" rule. Every row lands **`sin_invitar`**: email set, `invitacion_enviada_at` NULL, `auth_user_id` NULL, and **no `claim_code`** (that is minted only by `preparar_invitacion` at send time — the seed must not set it).

Per member — one `clientes` row + one `ventas` row, linked by `tel`, `gym_id` = red on every write:
- **Mensualidad ilimitada (13 + Aaron):** cliente `clases_restantes` NULL, `paquete_nombre` 'Mensualidad ilimitada', `vence` = venta fecha + 30, `created_at` = venta fecha; venta `clases` NULL, `vigencia_tipo` 'dias', `vigencia_dias` 30, `monto` 1200, `metodo` 'efectivo', `fecha` = last_payment_date (Aaron = seed-execution day).
- **Clase individual (5):** cliente `clases_restantes` **0** (sold 1, already attended), `paquete_nombre` 'Clase individual', `vence` 2026-08-20; venta `clases` **1** (the sale granted one), `vigencia_tipo` 'dias', `vigencia_dias` 30, `monto` 120, `metodo` 'efectivo', `fecha` 2026-07-21 (approx).

Folios run **1001..1019** chronological by venta fecha (single-class 07-21 ventas near the end; Aaron's seed-day venta last). After the inserts: `update gym_folio_counter set last_folio = 1019 where gym_id = red` (direct inserts bypass `next_folio()`).

Execution: MCP `execute_sql` (LIVE), **one atomic `DO` block** opening with the gym_id firewall (assert red; refuse if `clientes` already exist for red; refuse if `last_folio ≠ 1000`). Verify after: `clientes=19`, `ventas=19`, `ilimitado=14`, `clase_indiv=5`, every `tel` passes the 10-digit CHECK (`bad_tel=0`), `sin_invitar=19`, folios `1001..1019` contiguous + counter `1019`. Cross-tenant leakage is structurally impossible (every INSERT hard-codes the literal red gym_id) — Forge is untouched by construction.

## Loose ends (optional, non-blocking)

- **Owner's city** → `perfil.ciudad`. Renders on the **sale receipt footer** (member-facing, printed + emailed) and the admin account header; NULL degrades gracefully (receipt omits it, header shows "—"). One `UPDATE` if the owner gives it. **Owner's phone is NOT needed** — `perfil.tel` is unused in the UI.
- **Docs stay UNTRACKED — do NOT commit them.** This handoff, the plan (`…/plans/2026-07-20-red-gym-live-seed.md`), and `docs/supabase/seeding-contacts.json` now carry **real member PII** (emails + phones) — they are deliberately git-ignored/untracked. Never `git add`/commit/push them. Only the PII-free design spec (`…/specs/2026-07-20-red-gym-live-seed-design.md`) goes to `main`.
- **Materialization issue #136** (filed this session): classes are recurring (active templates) but there's **no auto-roll cron** — decided leave-as-is for go-live. Not part of Stage 5; just be aware the horizon extends only when staff open the admin Agenda tab.

## Hard rules / gotchas

- **MCP = LIVE prod.** Forge (`d5f81022-0f3d-48ac-96b9-5e32a5214285`) is a REAL gym one gym_id away and **actively transacting** (a real Forge sale landed mid-session). Every statement carries the literal red gym_id; verify isolation after.
- Seeds go through `execute_sql`, **never** `apply_migration` (keeps seeds out of migration history — see memory `prod-migration-version-drift`).
- **No fabricated data** — real phones or nothing; no invented attendance/history. Ilimitado ⇔ `clases_restantes NULL` (never a number by accident).
- Owner password is not in any file — it's in the prior session only; the owner has it.
