-- Invite-token claim rail, slice S1 (issue #65; ADR-0015; design 2026-07-08 §4). Expand-only schema:
-- `clientes` gains a nullable single-use invite code + the invite-sent timestamp. The code is the
-- deterministic join between the two member doors (staff sale ↔ self-registration) — it resolves the row,
-- the row resolves the gym; email is thereby demoted to contact info (ADR-0015). Lifecycle states
-- (`sin email` → `invitación enviada` → `cuenta activa`) are DERIVED from email / invitacion_enviada_at /
-- auth_user_id, never stored as an enum (design §3).
--
-- claim_code is a bearer credential for a member's paid balance: 8-char crypto-random (A-Z, 2-9), globally
-- unique, no expiry, single-use (cleared on claim). A PARTIAL unique index enforces global uniqueness while
-- leaving the many NULL-code rows (legacy + claimed) unconstrained. It is never readable by anon/members —
-- staff read it via the existing staff RLS policies on `clientes`; the pre-signup page reads only the
-- {gym, nombre} projection through invitacion_info (ADR-0015 consequence). No new policy is needed: the
-- column rides the table's existing RLS classes untouched. Idempotent + additive (Forge-safe, out-of-order).
alter table public.clientes add column if not exists claim_code text;
alter table public.clientes add column if not exists invitacion_enviada_at timestamptz;

create unique index if not exists clientes_claim_code_key
  on public.clientes (claim_code)
  where claim_code is not null;
