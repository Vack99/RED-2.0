-- #226 (E · VENTANA epic #222; comment obligations 1+2) — the last-consuming-visit aggregate the
-- lifecycle engine needs (#223's clases clock + the {n}D SIN VENIR badge's ausente clock), the serving
-- index the two existing partial indexes cannot serve, and the two plantilla fixes #225's review picked
-- up to ride this migration batch.
--
-- Idempotent (create-index-if-not-exists, create-or-replace-function, guarded UPDATEs) and forward-only;
-- safe out-of-order on live.

-- ══════════════════════════════════════════════════════════════════════════════════
-- 1. asistencias_gym_cliente_fecha_idx — the serving index.
-- ══════════════════════════════════════════════════════════════════════════════════
-- The two existing per-cliente indexes are partial and MUTUALLY EXCLUSIVE by origen:
--   asistencias_sesion_cliente_activa_uq  (class_session_id, cliente_id) where … and class_session_id is not null  (20260728120000)
--   asistencias_cliente_fecha_libre_uq    (cliente_id, fecha)           where … and class_session_id is null       (20260728120000)
-- Neither can serve "per cliente, the max fecha across BOTH origins" — the query the RPC below runs.
-- This index is composite on (gym_id, cliente_id, fecha), partial on deleted_at is null ONLY (unconditional
-- on origen/consumio, unlike the two above): an index-ordered scan feeds the GROUP BY cliente_id directly
-- (no sort step), and the running max(fecha) / max(fecha) filter (where consumio) fall out of one forward
-- pass per group — the FILTER clause needs no index of its own, only the ORDER this one supplies.
create index if not exists asistencias_gym_cliente_fecha_idx
  on public.asistencias (gym_id, cliente_id, fecha)
  where deleted_at is null;

-- ══════════════════════════════════════════════════════════════════════════════════
-- 2. asistencias_ultima_visita_por_cliente — the read RPC (#226 AC1/AC2).
-- ══════════════════════════════════════════════════════════════════════════════════
-- Two facts per cliente, both #223's lifecycle engine consumes (comment obligation 2 — #223 needs TWO
-- visit facts, not one):
--   ultima_visita            — max fecha over EVERY visit (not soft-deleted) — the AUSENTE clock.
--   ultima_visita_consumida  — max fecha over CONSUMING visits only (consumio = true) — the CLASES clock
--                               (a walk-in ACCESO LIBRE visit that never decremented a class must not
--                               reset it — #222 "the clases arm's clock is the last CONSUMING visit").
--
-- deleted_at / perdonada discipline (read 20260728120000 + 20260729120000 first — perdonada's own column
-- comment is the primary source; 20260803120000_mi_membresia_visit_count.sql is the freshest precedent):
--   * deleted_at is not null → an UNDONE toggle; excluded from BOTH facts, exactly like every existing
--     asistencias aggregate (asistencias_mes_por_cliente, marcadas_por_gym, marcadas_presencia, and now
--     mi_membresia's attended_since_purchase, #173).
--   * perdonada = true means "this row is the SECOND RECORD of ONE arrival" — the 15-minute cooldown
--     pairing a door check-in with a class mark (or the reverse). `deleted_at is null and not perdonada`
--     is now the canonical VISIT predicate — asistencias_mes_por_cliente (20260729120000) and, as of
--     #173 (20260803120000_mi_membresia_visit_count.sql), mi_membresia's attended_since_purchase both
--     filter on it. This query adopts the same predicate for consistency, though for THIS query's shape
--     it is provably a no-op rather than a load-bearing filter: the cooldown only pairs SAME-fecha rows
--     (visita_reciente's whole predicate is "on this fecha"), so a perdonada row's pair always shares its
--     exact date — a perdonada row is therefore NEVER the sole row on its date, and a MAX(fecha) cannot
--     change whether it is included or excluded. (perdonada is a COUNT correction — its own column
--     comment says "aggregates that count VISITS must skip it" — a concern a MAX(fecha) never has.)
--   * `ultima_visita_consumida` needs no separate perdonada guard on top of the WHERE clause below: every
--     branch in pasar_lista_sesion/toggle_pase that stamps perdonada = true first sets v_consumio :=
--     false (the pardon always frees the class), so `consumio = true` already excludes every perdonada
--     row from this fact by construction — asserted directly in the denial suite below.
--
-- Tenant discipline (#203 "no auth-derived gym roulette" — see is_staff_of / staff_gym in
-- 20260702161010 + 20260713190200): p_gym_id is a PARAMETER, never resolved from the caller's JWT or
-- session. SECURITY INVOKER (not DEFINER) — the established convention for every sibling asistencias
-- aggregate reader (asistencias_mes_por_cliente, marcadas_por_gym, ventas_count_por_cliente: all
-- SECURITY INVOKER + search_path=''), so the caller's OWN role runs the query and the existing
-- `asistencias_staff_select` RLS policy (using is_staff_of(gym_id), 20260702173309) still enforces
-- tenant scoping — PER ROW, keyed on that row's OWN gym_id, never on "the caller's current gym". A
-- caller who is staff of gym A but passes gym B's id gets an EMPTY result set (RLS admits zero of gym
-- B's rows) — never gym B's data, and never an auth-derived guess. The explicit `gym_id = p_gym_id`
-- filter is defense-in-depth ON TOP of RLS (mirrors 20260714090000's stated posture), not a substitute.
create or replace function public.asistencias_ultima_visita_por_cliente(p_gym_id uuid)
returns table (cliente_id uuid, ultima_visita date, ultima_visita_consumida date)
language sql
stable
security invoker
set search_path to ''
as $$
  select
    cliente_id,
    max(fecha) as ultima_visita,
    max(fecha) filter (where consumio) as ultima_visita_consumida
  from public.asistencias
  where gym_id = p_gym_id and deleted_at is null and not perdonada
  group by cliente_id;
$$;

revoke execute on function public.asistencias_ultima_visita_por_cliente(uuid) from public, anon;
grant execute on function public.asistencias_ultima_visita_por_cliente(uuid) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════════
-- 3. Plantilla reseed — the two obligations #225's review picked up (issue #226 comment).
-- ══════════════════════════════════════════════════════════════════════════════════
-- (1) Renovación: "Tu paquete vence en {dias} — ¿lo renovamos?" cannot render correct Spanish for
--     negative días from the bare {dias} token alone — no fallback WORD substituted for {dias} can fix
--     "vence en <word>" (present tense + a fixed preposition), because an already-expired package needs
--     a DIFFERENT verb ("venció"), not just a different number. The TS-side fmtDias (packages/data/src/
--     server/plantilla-ctx.ts) is rewritten in lockstep (see that file) to emit the WHOLE verb phrase —
--     "vence en N días" / "vence mañana" / "vence hoy" / "venció ayer" / "venció hace N días" — and the
--     body is rewritten to embed the token directly ("Tu paquete {dias} — ¿lo renovamos?") instead of
--     hardcoding "vence en" around it. Chosen over splitting into two templates: a single {dias} token
--     already carries a Renovación-only value (grep confirms no other seeded body reads it), so widening
--     its OWN contract costs nothing else and keeps one operator-facing template name instead of two
--     near-duplicates on the editor's list. día 0 (the vence day itself) is a valid training day
--     (rules.ts estaVencido/ruling C9) and now reads "vence hoy", never "vencido" — the #222 story 20
--     off-by-one ("vence en vencido" must never render).
-- (2) Última llamada: the hardcoded "*1 clase*" is tokenized to *{clases}* (fmtClases), and the verb
--     changes queda → quedan to agree with fmtClases's own established convention (it never singularizes
--     — "1 clases", matching the Recordatorio template's existing "Aún te quedan {clases}" phrasing, so
--     this template stops being the one place with divergent grammar for the same token).
--
-- Both UPDATEs are guarded by an exact match on the OLD stock body (the byte-identical text every
-- CREATE OR REPLACE of sembrar_plantillas_default has shipped since 20260602130100) — never a blanket
-- `where nombre = …` — so a gym that hand-edited its Renovación/Última llamada body through the freeform
-- editor keeps its own words; only rows still holding the untouched seed text are rewritten.
update public.plantillas
set body = $newbody$Hola {nombre}, soy del coach de {negocio}.

Tu paquete {dias} — ¿lo renovamos? 🔥

📦 *Paquetes disponibles:*
{precios}

Avísame cuál te conviene y te lo apartamos. 💪$newbody$
where nombre = 'Renovación'
  and body = $oldbody$Hola {nombre}, soy del coach de {negocio}.

Tu paquete vence en {dias} — ¿lo renovamos? 🔥

📦 *Paquetes disponibles:*
{precios}

Avísame cuál te conviene y te lo apartamos. 💪$oldbody$;

update public.plantillas
set body = $newbody$Hola {nombre} 👋

Te aviso que solo te quedan *{clases}* de tu paquete y vence el {vence}.

Si quieres seguir entrenando con nosotros, renovamos después de la próxima clase. 💪
— {negocio}$newbody$
where nombre = 'Última llamada'
  and body = $oldbody$Hola {nombre} 👋

Te aviso que solo te queda *1 clase* de tu paquete y vence el {vence}.

Si quieres seguir entrenando con nosotros, renovamos después de la próxima clase. 💪
— {negocio}$oldbody$;

-- sembrar_plantillas_default — the same two bodies, for every gym seeded from now on. CREATE OR REPLACE
-- preserves the function's ACL (no grant/revoke to re-issue); byte-identical everywhere else to
-- 20260705082018's body (the Recordatorio + Recibo bodies are untouched).
create or replace function public.sembrar_plantillas_default()
 returns void
 language plpgsql
 set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_gym uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  v_gym := public.staff_gym();
  if exists (select 1 from public.plantillas where gym_id = v_gym) then return; end if; -- idempotent
  insert into public.plantillas (nombre, body, gym_id) values
    ('Recordatorio', $body$Hola {nombre} 👋

Aún te quedan {clases} de tu paquete (*{paquete}*), vence el {vence}.

¡Te esperamos en el bootcamp! 💪🔥
— {negocio}$body$, v_gym),
    ('Recibo', $body$Hola {nombre} 👋

¡Gracias por tu compra en {negocio}! Tu paquete *{paquete}* queda activo hasta el {vence}.

Nos vemos en el bootcamp. 💪🔥$body$, v_gym),
    ('Renovación', $body$Hola {nombre}, soy del coach de {negocio}.

Tu paquete {dias} — ¿lo renovamos? 🔥

📦 *Paquetes disponibles:*
{precios}

Avísame cuál te conviene y te lo apartamos. 💪$body$, v_gym),
    ('Última llamada', $body$Hola {nombre} 👋

Te aviso que solo te quedan *{clases}* de tu paquete y vence el {vence}.

Si quieres seguir entrenando con nosotros, renovamos después de la próxima clase. 💪
— {negocio}$body$, v_gym);
end;
$function$;
