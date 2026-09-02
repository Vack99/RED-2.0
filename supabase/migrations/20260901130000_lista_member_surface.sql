-- Modos Lista/Cupo, #332 — the Lista public landing's ONE hours field, plus letting the public
-- (anon) surface read the gym's mode before login.
--
-- ── `gym_contact.hours_text` — one free-text opening-hours field ───────────────────────────────
-- A gym's real opening hours as free text ("Lun-Vie 6:00-21:00, Sáb 8:00-14:00"), operator-
-- authored in the existing CONTENIDO sheet (apps/admin cuenta), rendered on the client app's
-- public landing when the gym has no booking surface (`gym.booking_enabled = false`).
-- Deliberately NOT the existing `gym_contact.hours` jsonb (the structured per-day open/close
-- array the Contacto page already renders — unpopulated for forge, and with no admin editor at
-- all today): #326/#332 ask for "one text column", the cheapest field that answers "when is this
-- gym open" without building the day-by-day editor nobody asked for. Cupo may fill it too; it is
-- content, not mode.
--
-- Lands on `gym_contact` (not a new table, not `gym`): it is already the 1:1 satellite for
-- exactly this class of marketing-contact fact (whatsapp/email/instagram/hours), already
-- staff-write + member-read + anon-read RLS (20260706165900_create_gym_contact — curated/
-- showcased class, ADR-0013 §3), and — unlike `gym`'s `legal_name`/`booking_enabled` — this
-- table's grants were NEVER narrowed to an explicit column list (20260713190100/20260802120000
-- narrowed `gym`, not `gym_contact`), so a plain ADD COLUMN is immediately staff-writable and
-- anon-readable through the policies that already exist. No new policy, no new grant, no RPC —
-- the write is a direct RLS-gated upsert, the same shape `actualizarIdentidadLegal` uses for
-- `gym_legal`.
alter table public.gym_contact
  add column if not exists hours_text text
    check (hours_text is null or char_length(hours_text) between 1 and 200);

comment on column public.gym_contact.hours_text is
  'Free-text opening hours the operator authors in Cuenta''s contenido sheet, rendered on the client app''s public landing (Lista mode). Distinct from `hours` (the structured per-day jsonb the Contacto page renders) — this is the simple one-field answer, not a day-by-day schedule.';

-- ── `gym.booking_enabled` — widen the existing column grant to `anon` ──────────────────────────
-- 20260826120100 granted this column to `authenticated` only ("the pre-auth host->brand lookup
-- has no booking surface to gate" — true then, before there was a Lista public landing). #332
-- adds one: the client app's public landing and its drawer nav/footer CTA now read the gym's
-- mode BEFORE login (an anonymous visitor must see the Lista landing, never a "Reservar" CTA
-- that would only dead-end in `reservar_clase`'s own refusal). Additive only — same idiom as
-- 20260713190100_gym_anon_column_grants, no revoke needed since anon never held this column.
grant select (booking_enabled) on public.gym to anon;
