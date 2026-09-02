# T4 — the database write path for a new member

Cross-examination seat T4, 2026-09-02. Repo HEAD `33c9087a`. Live project `hjppxawglmukfvsgmcog`,
**SELECT-only** — no INSERT/UPDATE/DELETE, no migration, no function deploy was issued from this seat.
Member emails masked `xxx***@domain` except `marcerubiogarcia07@gmail.com`, already documented.

Territory: `clientes` / `gym_membership` / `ventas` / consent columns; constraints and missing
uniqueness; the `clientes.auth_user_id` FK and what deleting an auth user leaves; RLS each door
depends on; triggers including `senal_gym`'s `realtime.send`; the claim RPC bodies; the absence of
backfill/merge/dedup; and what survives when a multi-statement RPC or a client-side multi-call
sequence stops at statement *k*. Owns **Q2**, **Q5**, **Q7**, and the SQL-side half of **Q6**.

Everything below is either a `file:line` at HEAD, a query with its output, or tagged
`modelled` / `unmeasured` / `reasoning, not sourced`. Prior claims are attributed to their row id in
`03-prior-register.md` and either re-derived here or tagged `unverified this round`.

---

## Ranked findings — worst first

Twelve findings. Two of them (#10, #11) are entries where the code is **sound**; they are ranked
anyway per the honesty rule rather than dropped, because each is a place a reader would otherwise
assume a defect.

---

### 01 · A paid roster row with no email is one self-signup away from a zero-balance twin. 47 rows are in that state; 2 split pairs already exist live. — severity 5

**Claim.** `reclamar_o_crear_cliente` joins the login to the roster on **`lower(email)` only**. When
the roster row carries no email — or a different one — the RPC does not fail, it **mints a second
`clientes` row with `clases_restantes = 0`**. The member's paid row keeps sitting unclaimed beside it.

**Member-visible symptom.** They log in, `/reservar` renders, and `mi_membresia` reads the *new* row:
no `paquete_nombre`, no `vence`, zero classes. A member who paid last week is told to buy a plan.
No error, no operator alert — the desk roster now shows two people where there is one.

**Evidence.**
- `supabase/functions-canonical/reclamar_o_crear_cliente.sql:50-51` — the only match predicate:
  `where gym_id = p_gym_id and auth_user_id is null and lower(email) = lower(v_email)`.
  No `phone_e164` arm, no `tel` arm. Deliberate (ADR-0009 amendment 2026-07-02, row P-116) —
  phone-only claim would let anyone who knows a member's number take their balance.
- Same file `:74-86` — `if v_cli is null then … insert into public.clientes (… clases_restantes …)
  values (…, 0, …)`. The create branch is unconditional once the email misses.
- Live count of rows one signup away from this:
  ```sql
  select g.slug, count(*), count(*) filter (where c.vence >= current_date) as vigentes
    from public.clientes c join public.gym g on g.id = c.gym_id
   where c.claim_code is not null and c.email is null and c.auth_user_id is null
   group by g.slug;
  -- forge 24 (14 vigentes) · red-demo 11 (1) · red 8 (8) · forge-demo 4 (2)  → 47 total
  ```
  All 8 RED rows have a **current** `vence`. These are paying members with no email on file.
- Two split pairs **already exist in production**:
  ```sql
  with n as (select gym_id, id, lower(btrim(regexp_replace(nombre,'\s+',' ','g'))) nm,
                    auth_user_id, email, vence from public.clientes)
  select g.slug, n.nm, count(*), count(n.auth_user_id) reclamadas, array_agg(n.vence)
    from n join public.gym g on g.id=n.gym_id group by 1,2 having count(*)>1;
  -- red   | "karen lara"   | 2 | 0 reclamadas | {2026-09-12, 2026-07-16}
  -- forge | "joel trevizo" | 2 | 0 reclamadas | {2026-08-12, 2026-08-24}
  ```
  Both pairs are unclaimed and both have **no email**, so when either is invited, one code goes out
  and the other row's ventas are orphaned from that person's account permanently.
- `registrar_venta.sql:193-194` mints a `claim_code` on **every** new-client desk sale, email or not
  — so the population of "invitable-in-principle, unmailable-in-practice, claimable-only-by-code"
  rows grows with every walk-in sale.

**Basis.** measured.

**Breaking point.** 47 rows today (8 of them live-paying RED members). The component is
`reclamar_o_crear_cliente`'s single-key match; it breaks the moment a member's typed signup address
differs by one character from the desk-typed one, which is not a rare event — it is the default for
the 91 rows with no email at all.

**Fix hint.** Don't add a phone *claim*; add a phone *refusal*. Before the `insert` at :81, if an
unclaimed row in `p_gym_id` shares the caller's `phone_e164` (10-digit-normalized), raise a distinct
sentinel — `POSIBLE_DUPLICADO:<cliente_id>` — the way `registrar_venta:148` already does. The door
then shows "ya tienes una ficha en este gimnasio, pídele al gimnasio que te envíe tu invitación"
instead of silently minting a twin. That is a refusal, not a claim, so P-116's rule survives intact.

---

### 02 · There is no merge tool, and the only merge runbook hands the operator the wrong gym_id for RED. Every child FK is ON DELETE CASCADE. — severity 5

**Claim.** Deduplication is a hand-run service-role SQL runbook. Its Step 0 tells the operator that
"the RED gym is `d5f81022…`". Live, `d5f81022-…` is **Forge**. Following the runbook literally
resolves the pair against the wrong tenant's roster, and the delete at the end cascades revenue and
attendance away.

**Member-visible symptom.** A Forge member whose phone number happens to match a RED duplicate loses
their entire ventas ledger and attendance history, silently. There is no `updated_at` on `clientes`,
no history table, and `auth.audit_log_entries` is empty — after 24 hours the log stream is gone too,
so nobody can prove it happened or who did it.

**Evidence.**
- `docs/runbooks/duplicate-member-merge.md`, §"Step 0 — resolve the pair's UUIDs":
  `-- the RED gym is 'd5f81022…'` and the query template `where gym_id = '<red_gym_id>' -- d5f81022…`.
- Live gym ids:
  ```sql
  select id, slug from public.gym order by slug;
  -- d5f81022-0f3d-48ac-96b9-5e32a5214285 | forge
  -- 968bafb0-36d0-40ce-813c-d5cb1668dd39 | forge-demo
  -- ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9 | red
  -- daa1c888-192b-4cf6-9fc0-023e314a803f | red-demo
  ```
  (Aside, correcting `01-live-snapshot.md` §D: there are **4** gyms, not 3 — `forge-demo` has no
  `gym_domain` rows and fell out of that snapshot's domain-joined query.)
- Cascade, re-derived live at HEAD:
  ```sql
  select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='public.ventas'::regclass;
  -- ventas_cliente_id_fkey  FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
  ```
  This re-derives P-047 / P-034 at HEAD (prior claimed it from the runbook text; this round it is
  read from `pg_constraint`).
- No merge exists in code: `grep -rn "fusionar\|merge" supabase/functions-canonical/*.sql` → 0 hits.
- No forensic trail: `information_schema.columns` for `public.clientes` returns 19 columns, of which
  the only timestamps are `created_at`, `terms_accepted_at`, `privacy_accepted_at`,
  `invitacion_enviada_at` — **no `updated_at`, no `deleted_at`**.
  `select count(*) from auth.audit_log_entries` → **0** (re-derived; matches triage §1 and P-102).

**Basis.** measured.

**Breaking point.** 2 duplicate pairs are queued for merge today (finding 01) and the runbook is the
only path. The component is the runbook's hard-coded hint; it breaks on the first merge anyone runs
by copy-paste rather than by re-resolving the slug.

**Fix hint.** One line in the runbook: replace the `d5f81022…` hint with
`select id from public.gym where slug = 'red'`. Then, separately, make the merge an RPC with the
runbook's own pre-checks as `raise exception` guards, so the repoint-before-delete order is enforced
by the database instead of by a human reading carefully at 11pm.

---

### 03 · Every claim rail stamps consent that no member was shown. 51 of 51 consent stamps are versionless, because `gym_legal` is empty for all four gyms. — severity 4

**Claim.** Both claim RPCs write `terms_accepted_at = now()` and `privacy_accepted_at = now()`
unconditionally. Three of the five rails that reach them render **no consent surface at all** and
pass `avisoVersion = null` as a hard-coded literal. The database therefore asserts that 51 people
accepted an aviso de privacidad — and for 100% of them it cannot say which one, because there is
none: `gym_legal` has zero rows, so `identidadLegalCompleta` is false for every tenant and even the
two rails that *compute* a version compute `null`.

**Member-visible symptom.** None — which is the problem. The exposure is regulatory (LFPDPPP): the
consent evidence table says "accepted" and cannot name the text.

**Evidence.**
- `supabase/functions-canonical/reclamar_o_crear_cliente.sql:62-64` and
  `reclamar_por_codigo.sql:64-66` — `terms_accepted_at = now(), privacy_accepted_at = now(),
  privacy_aviso_version = p_aviso_version`. No branch on `p_aviso_version`.
- Rails that show nothing and stamp anyway, all three passing a literal `null`:
  - `apps/client/src/app/auth/confirm/route.ts:84` — `intentarReclamoConFirma(codigo, firma ?? "", null, supabase)` (its own comment: "this rail renders no aviso anywhere upstream").
  - `apps/client/src/app/activar/actions.ts:137` — `intentarReclamoPorCodigo(codigo, null)` ("the one-click bind is a bare button, no consent text, no checkbox").
  - `apps/client/src/app/reservar/page.tsx:65` — `intentarReclamoPorEmail(tenant.id, null, supabase)`.
- Live:
  ```sql
  select count(*) filter (where privacy_accepted_at is not null) con_consentimiento,
         count(*) filter (where privacy_accepted_at is not null and privacy_aviso_version is null) sin_version
    from public.clientes;
  -- 51 | 51
  ```
- Why even the honest rails stamp null:
  ```sql
  select g.slug, l.* from public.gym g left join public.gym_legal l on l.gym_id = g.id;
  -- forge | null … · forge-demo | null … · red | null … · red-demo | null …   (zero gym_legal rows)
  ```
  `packages/domain/src/legal.ts:269` `AVISO_PRIVACIDAD_VERSION = "0.1-borrador"`; the gate that
  decides whether it is stamped is `identidadLegalCompleta` in
  `apps/client/src/lib/aviso-legal.ts:45-58`, fed by `gym_legal` + `gym.legal_name` + `gym_contact`.
- Marce is the worked example: `terms_accepted_at` and `privacy_accepted_at` both
  `2026-09-02 16:31:48.74795+00`, `privacy_aviso_version` null, on the magic-link rail where no
  consent text exists (triage §4).

**Basis.** measured.

**Breaking point.** 51/51 today; every new member adds one. The component is the RPC's unconditional
`now()`.

**Fix hint.** One guard in each RPC: stamp `privacy_accepted_at` only when `p_aviso_version is not
null`, and leave it null otherwise. A null timestamp is a true statement ("we have no consent record
for this person"); a timestamp with no version is a false one. Then fill `gym_legal` for RED and
Forge, which is owner-owed input, not code.

---

### 04 · `registrar_venta`'s new-client insert retry has no exit for a non-email unique violation — and the exact one-line "missing constraint" the prior register keeps naming would turn it into an 8-second hang. Live data blocks that constraint anyway. — severity 4

**Claim.** The create branch loops minting a `claim_code`, catching `unique_violation`, and only
`exit`s on success. The handler's sole escape converts an **email** collision into
`CLIENTE_DUPLICADO`. Any other unique violation falls out of the handler with no `exit` and the loop
retries forever. Today that is unreachable (see the honest half below). Add `unique (gym_id, tel)`
— the constraint P-004, P-008 and P-009 all name as missing — and it becomes reachable immediately.

**Member-visible symptom (post-change).** The desk operator taps COBRAR on a walk-in whose phone
already exists and no email was typed. The spinner runs for 8 seconds and returns a raw
`57014 canceling statement due to statement timeout` instead of the "otro cliente tiene este
teléfono" dialog the UI is built to show. The operator retries; it hangs again.

**Evidence.**
- `supabase/functions-canonical/registrar_venta.sql:186-204`:
  ```sql
  loop
    v_code := …;                                  -- fresh 8-char code
    begin
      insert into public.clientes (…, claim_code) values (…, v_code) returning id into v_cliente_id;
      exit;                                       -- the ONLY exit
    exception when unique_violation then
      if exists (select 1 from public.clientes c
                  where c.gym_id = v_gym and lower(c.email) = lower(p_email)) then
        raise exception 'CLIENTE_DUPLICADO:%', (…);
      end if;                                     -- else: fall through, loop again
    end;
  end loop;
  ```
  With `p_email` null, `lower(c.email) = lower(null)` is NULL for every row, so `exists` is false
  and the loop always re-enters.
- **Honest half — sound as shipped.** The unique indexes on `clientes` live are exactly four:
  ```sql
  select indexname, indexdef from pg_indexes where tablename='clientes';
  -- clientes_pkey (id) · clientes_auth_user_id_per_gym (gym_id, auth_user_id) WHERE auth_user_id IS NOT NULL
  -- clientes_claim_code_key (claim_code) WHERE claim_code IS NOT NULL
  -- clientes_email_gym_uq (gym_id, lower(email)) WHERE email IS NOT NULL
  ```
  The insert sets `auth_user_id` to nothing, so with a null `p_email` the *only* violation possible
  is a `claim_code` collision — which is precisely what the retry is for. The loop is correct today.
- The blast radius of the change, measured: `authenticated` carries `statement_timeout=8s`
  (`select rolname, rolconfig from pg_roles` → `authenticated | {statement_timeout=8s}`;
  `anon | {statement_timeout=3s}`). So the spin is bounded at 8 s per request, not infinite — but it
  holds a pooler connection for the whole 8 s and returns 57014.
- Which gates would see it: `pnpm test` and CI would **not** —
  `packages/data/src/server/registro.test.ts:388` is "a fake client exposing exactly the
  `.rpc(name, args).single()/.maybeSingle()`" surface, so no vitest ever executes an RPC body
  (re-derives P-001 at HEAD). `pnpm test:denial` **would** — `supabase/tests/registrar_venta_stacking.sql:345`
  calls `registrar_venta(… p_tel := '6140000109', p_forzar_nuevo := true)` with no `p_email`, which
  is the exact shape that spins. But `test:denial` is in neither gate:
  `.husky/pre-commit` = `pnpm lint && pnpm typecheck && pnpm test`;
  `.github/workflows/ci.yml` = lint, typecheck, test, build.
- And the constraint would not create at all:
  ```sql
  with n as (select gym_id, id, right(regexp_replace(coalesce(tel,''),'\D','','g'),10) t,
                    auth_user_id from public.clientes where tel is not null and tel <> '')
  select gym_id, t, count(*), count(auth_user_id) from n group by 1,2 having count(*)>1;
  -- red | 6484657923 | 2 filas | 2 reclamadas
  -- red | 6142255823 | 2 filas | 2 reclamadas
  ```
  Both pairs are **two different people with two different email accounts** who share one phone —
  `Paola soto`/`Matia` created 77 s apart, `Alejandro Vill…`/`Natalia Irigoy…` 115 s apart, each
  pair with identical package/vence, i.e. sold together at the desk. `registrar_venta:142-149`
  raised `CLIENTE_DUPLICADO` on both and the operator correctly overrode with `p_forzar_nuevo`.
  **`(gym_id, tel)` is not a valid uniqueness key for this business** — a shared family phone is a
  legitimate state, and this is the correction to P-004 / P-008 / P-009's repeated framing.

**Basis.** measured (the loop, the indexes, the timeout, the live duplicate pairs); modelled for the
post-change symptom.

**Breaking point.** The desk sale path, at 8 s per attempt, from the moment a `(gym_id, tel)` unique
index exists. Zero live rows would allow that index today, so the change would have to be preceded
by a dedupe that destroys two legitimate member records.

**Fix hint.** Give the loop a bound (`for attempt in 1..5 loop … end loop; raise exception 'No se
pudo generar el código'`) so *any* future constraint surfaces as an error instead of a hang. That is
the whole fix; the tel-uniqueness idea should be dropped, not deferred.

---

### 05 · Ten already-claimed RED members still carry a live `claim_code`, and `invitacion_info` — anon-executable, no claim filter — returns their full name to any holder, forever. — severity 3

**Claim.** `reclamar_o_crear_cliente` never clears `claim_code`; only `reclamar_por_codigo` does. So
everyone who joined through the `/registro` + verified-email rail leaves their 8-character bearer
code alive in whatever inbox and browser history holds it. `invitacion_info` is `SECURITY DEFINER`
with `anon` EXECUTE and has no `auth_user_id is null` predicate, so those codes keep resolving to a
full name and gym after the account is claimed.

**Member-visible symptom.** None directly. The exposure: anyone holding a forwarded old invite URL
can post the code to `/rest/v1/rpc/invitacion_info` with the anon key and get back
`{gym_nombre, gym_slug, cliente_nombre}` for a live member. And if that row is ever unclaimed (the
documented remediation — null `auth_user_id`), the stale code becomes a working activation
credential again.

**Evidence.**
- Every write to `claim_code` in the canonical bodies:
  `grep -rn "claim_code" supabase/functions-canonical/*.sql` → 4 hits:
  `invitacion_info.sql:4` (read), `reclamar_por_codigo.sql:46` (read) and `:67` (`claim_code = null`),
  `registrar_venta.sql:193` (mint). **`reclamar_o_crear_cliente.sql` does not appear.**
- Live population:
  ```sql
  select count(*) from public.clientes where claim_code is not null and auth_user_id is not null;
  -- 10   (all gym = red)
  ```
- The RPC's exposure, live:
  ```sql
  select p.prosecdef, array_to_string(p.proacl::text[],' | ')
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='invitacion_info';
  -- true | postgres=X/postgres | anon=X/postgres | authenticated=X/postgres | service_role=X/postgres
  ```
  Body, `supabase/functions-canonical/invitacion_info.sql:1-4`:
  `select g.brand_name, g.slug, c.nombre from public.clientes c join public.gym g … where c.claim_code = p_codigo;`
  — no claim filter, and it returns `c.nombre` whole, not a first name.
- Called live against 4 of the 10 claimed rows:
  ```sql
  select x.gym_nombre, x.gym_slug, left(x.cliente_nombre,3)||'…', length(x.cliente_nombre)
    from public.clientes c cross join lateral public.invitacion_info(c.claim_code) x
   where c.claim_code is not null and c.auth_user_id is not null limit 4;
  -- RED | red | Mar… | 31    RED | red | Rox… | 17    RED | red | Yol… | 25    RED | red | Ayi… | 26
  ```
  Lengths 17–31 = first + last name.
- ADR-0015 (row P-123) scoped this as "holding the code reveals a first name + gym, nothing more",
  for an unclaimed invite. Live it is a full name, on a claimed account, with no expiry.

**Basis.** measured.

**Breaking point.** 10 rows today; grows by one per member who joins through `/registro` rather than
the invite — which, per the triage, is exactly the door RED's newest members are finding.

**Fix hint.** Two lines. `reclamar_o_crear_cliente`, on the claim branch, also `set claim_code =
null`. `invitacion_info`, add `and c.auth_user_id is null` to the where clause. Both take the
`test:denial` gate; `supabase/tests/reclamar_por_codigo.sql` already has the fixture shape.

---

### 06 · Q7 — every claim is a swallowed best-effort, so a half-completed network call lands a paying member on "Aún no eres miembro" with no error, no retry, and no log line. — severity 4

**Claim.** `intentarReclamo` turns *every* throw — a bad firma, a spent code, an unverified email, a
raw `23505` — into `{ok:false, motivo}`, and no caller on the new-member path inspects `motivo`. The
activation sequence is three network hops with the identity write **last**; stopping at *k* = 2
leaves an auth account with a password and a live session and no `clientes` claim, no
`gym_membership`.

**Member-visible symptom, verbatim.**
> **Aún no eres miembro** — Tu cuenta está lista, pero todavía no tienes una membresía activa en
> este gimnasio. Visita el gimnasio para activar tu paquete y empezar a reservar clases.

Shown to someone who paid $1,200 last Tuesday.

**Evidence.**
- `packages/data/src/server/registro.ts:323-330`:
  ```ts
  async function intentarReclamo(reclamo) {
    try { await reclamo(); return { ok: true }; }
    catch (e) { return { ok: false, motivo: e instanceof Error ? e.message : "No se pudo reclamar" }; }
  }
  ```
  No `console.warn`. Compare `auth/confirm/route.ts:43-60` `rechazar()`, which *does* log — the
  claim failure is the one exit on this path with no structured line.
- The 3-hop sequence, `packages/data/src/server/activacion.ts:151-167`:
  `getClaims` → `actualizarPassword` (GoTrue, committed independently) → `intentarReclamoPorCodigo`
  → `return {ok:true}` **regardless**. `ok:true` covers "claimed" and "silently did not claim".
- The caller then redirects unconditionally: `activar/contrasena/actions.ts:63` `redirect("/reservar")`.
- The self-heal at `/reservar` cannot cover the code rail:
  `apps/client/src/app/reservar/page.tsx:57-68` runs `intentarReclamoPorEmail` — the **email** rail
  — which matches nothing when the roster row has no email (47 rows, finding 01) or a different one.
- And `/auth/confirm` never falls back within the request:
  `apps/client/src/app/auth/confirm/route.ts:72-97` — `if (codigo) { …conFirma… } else if (!next) { …porEmail… }`.
  The magic-link rail always carries both `codigo` and `next=/reservar`
  (`activar/actions.ts:89`), so a failed code claim is never followed by the email claim.
- Symptom copy: `apps/client/src/app/reservar/_components/sin-membresia.tsx:21-24`.
- The gate that would catch a wrong RPC body does not run here: the claim body is mocked in vitest
  (`registro.test.ts:388`) and `test:denial` is convention-only (`.husky/pre-commit`, `ci.yml`).

**Basis.** measured for the code paths; the failure scenario is modelled — inputs: a Vercel→Supabase
leg that 502s or exceeds the fetch shield between hop 2 and hop 3 (the 2026-08-29 `iad1→us-west-2`
degradation, memory `supabase-degradation-2026-08-29.md`, is the documented precedent).

**Breaking point.** One dropped request between `actualizarPassword` and `intentarReclamoPorCodigo`
is enough. The window is one HTTP round trip, on the single most important click a new member makes.

**Fix hint.** `intentarReclamo` should `console.warn(JSON.stringify({event:"reclamo-fallido", motivo}))`
— the same shape `rechazar()` and `registrarSocio` already use — so the next wedge is diagnosable at
all. Then have `finalizarAuth` try the email rail when the codigo rail returned `ok:false`, instead
of `else if`.

---

### 07 · Q5 — `vincularAction` binds a paid roster row to whoever is signed in on that device, in one tap, and overwrites `clientes.email` with no history. There is no undo in the app. — severity 4

**Claim.** The logged-in short-circuit takes an invite code and the ambient session and writes the
join with no confirmation of identity. `reclamar_por_codigo` then **overwrites the roster row's
email** with the session account's address and clears the code. `clientes` has no `updated_at`, no
history table, and no soft delete, so the original address is gone with nothing recording that it
existed.

**Member-visible symptom.** Ana opens the gym's invite link on the family iPad where her husband's
account is still signed in and taps VINCULAR. Ana's paid package, her ventas, her attendance now
belong to his login; her own email is erased from the row; the invite code is spent. She logs in on
her phone and gets "Aún no eres miembro". Undoing it needs a service-role SQL session.

**Evidence.**
- `apps/client/src/app/activar/actions.ts:115-138` — `vincularAction`: parse code → Turnstile →
  `await intentarReclamoPorCodigo(codigo, null)` → `redirect("/reservar")`. No email echo, no
  "¿eres tú, Marcela?" step, no re-auth.
- The page renders it whenever a session exists: `activar/page.tsx:79-88` per row P-131
  (`sesionActiva && codigo && invitacion` → `<VincularForm>`), quoted from the prior register and
  **not re-opened this round** — tagged `unverified this round` for the line numbers; the action
  body above is read at HEAD.
- The destructive write, `supabase/functions-canonical/reclamar_por_codigo.sql:60-68`:
  ```sql
  update public.clientes
     set auth_user_id = v_uid,
         email = v_email,            -- the SESSION's address, replacing the roster address
         phone_e164 = coalesce(v_phone, phone_e164),
         terms_accepted_at = now(), privacy_accepted_at = now(),
         privacy_aviso_version = p_aviso_version,
         claim_code = null
   where id = v_cli;
  ```
- No forensic trail: `clientes` has 19 columns and no `updated_at` (queried above);
  `auth.audit_log_entries` count = **0**; the log stream is a 24-hour window (triage §1).
- No undo in the app: memory `unclaim-cliente-recipe.md` (row P-101) — clearing `clientes.email` is
  blocked by `actualizar_cliente:16-18` on a claimed row, nulling `auth_user_id` does not log the
  wrong person out, and deleting `gym_membership` nukes sessions globally.
- The one guard that exists, `reclamar_por_codigo.sql:54-58` (`v_owns > 0` → 'Ya tienes cuenta en
  este gimnasio'), only fires if the *signed-in* account already holds a row in that gym — which the
  husband, in the scenario above, does.

**Basis.** measured (code + schema); the scenario is reasoning, not sourced — no live instance of a
wrong-account vincular was found, and by construction none could be found after 24 hours.

**Breaking point.** One tap. There is no rate limit, no second factor, and no reversal path short of
the SQL editor.

**Fix hint.** Show the bound account's email on the vincular button — "Vincular a **a\*\*\*@gmail.com**"
— and, in the RPC, refuse when the roster row already carries a non-null `email` that differs from
`v_email` (raise `CORREO_NO_COINCIDE`), rather than overwriting it. That single predicate also
closes the silent-overwrite half of the finding.

---

### 08 · Q7 — the invite send writes "was it sent?" last, so a slow-but-successful Resend call produces a re-send, and re-sends are what 429'd Marce. — severity 3

**Claim.** `enviarInvitacion` is four steps: mint the code (**write**), build the URL, POST to Resend
under a 10-second abort, stamp `invitacion_enviada_at` (**write**). If Resend accepts at 10.1 s the
client aborts, the stamp never lands, the desk shows the member as un-invited, and the operator
re-sends. The invite code itself never rotates, so a duplicate invite mail is harmless — but it puts
the member back at `/activar`, and *that* door spends the per-address auth-mail window.

**Member-visible symptom.** A stack of identically-subjected mails, of which only the newest auth
link works, and — when the two doors are used within the same minute — "NO SALIÓ EL CORREO. No
pudimos enviarte el enlace ahora mismo."

**Evidence.**
- `packages/data/src/server/invitaciones.ts:224` `preparar_invitacion` (writes `claim_code`),
  `:230` `construirUrlInvitacion`, `:243` `transport.send`, `:248`
  `marcar_invitacion_enviada` — in that order, with the comment "Transport confirmed → record the
  send (best-effort: a stamp hiccup only re-invites later)".
- The abort: `invitaciones.ts:56` `signal: AbortSignal.timeout(10_000)`.
- The stamp is the only record: `marcar_invitacion_enviada.sql:17`
  `update public.clientes set invitacion_enviada_at = now() where id = p_cliente_id`. There is no
  send ledger table.
- The code does not rotate, so re-invites are idempotent:
  `preparar_invitacion.sql:30` `if v_code is null then …` — an existing code is reused. Confirmed
  end-to-end by the triage: `codigo=33SDA38A` and `firma=ef876e…` are byte-identical across mails
  #10, #11 and #13 (`2026-09-02-marce-triage.md` §3).
- The linkage to the 429 is the triage's, re-cited not re-derived: 3 invite mails to Marce
  (08-19, 09-01 17:18 owner re-send, 09-02 16:28 owner re-send) and 6 `Confirma tu cuenta` mails;
  `/otp` 429 `over_email_send_rate_limit` at 19:25:17Z and 19:25:27Z, 32 s after her `/registro`
  `/signup` at 19:24:45Z (triage §2, §3).

**Basis.** measured for the sequence and the timeout; the 10-second-race scenario is
`modelled — inputs: a Resend p99 above 10 s`. Resend latency was **not** measured this round.

**Breaking point.** 10 000 ms, `invitaciones.ts:56`.

**Fix hint.** Stamp `invitacion_enviada_at` **before** the send and clear it on a definite failure,
or add a `resend_message_id` column written from the 200 body. Either makes "did a mail go out?" a
fact rather than an inference from a write that happens after the risky call.

---

### 09 · `mi_membresia` sequential-scans the entire `ventas` table on every member page load. There is no `ventas.cliente_id` index. — severity 3

**Claim.** The member's plan card is anchored on "the newest venta for this cliente", and that query
has no usable index, so it scans all of `ventas` across **all tenants** on every render.

**Member-visible symptom.** None today (sub-millisecond). It becomes a whole-platform slowdown of
the first screen every member sees, growing linearly with total sales across every gym on the
instance.

**Evidence.**
- `supabase/functions-canonical/mi_membresia.sql:36-42` — `from public.ventas v where v.cliente_id =
  v_cli order by v.created_at desc, v.id desc limit 1`.
- Live plan for exactly that query (Marce's cliente id):
  ```
  Limit  (cost=12.12..12.13 rows=1) (actual time=0.105..0.106 rows=1)
    ->  Sort  (Sort Key: created_at DESC, id DESC)
          ->  Seq Scan on ventas v  (actual time=0.060..0.074 rows=4 loops=1)
                Filter: (cliente_id = '78d08c65-…'::uuid)
                Rows Removed by Filter: 296
                Buffers: shared hit=8
  Execution Time: 0.160 ms
  ```
- Indexes on `ventas`, live: `ventas_pkey`, `ventas_folio_gym_uq`, `ventas_gym_fecha_idx`,
  `ventas_gym_id_idx`, `ventas_idem_gym_uq`. **None on `cliente_id`.**
- Row counts live: `clientes` 183, `ventas` 300, `gym_membership` 58, `asistencias` 1240,
  `reservation` 761.
- This re-derives P-104 (`auth-structure-scale-audit.md`, "`ventas` has NO `cliente_id` index and
  `mi_membresia()` scans it on every plan-card render") at HEAD — prior stated it, this round
  produced the live plan.

**Basis.** measured (the plan at 300 rows); the projection below is `modelled — linear extrapolation
of an 8-page seq scan, not measured at scale`.

**Breaking point.** At 300 000 `ventas` rows across the instance the same scan reads ≈8 000 pages
(≈64 MB) and costs ≈160 ms, per member, per page load, with no tenant predicate to bound it. At the
platform's stated ambition (thousands of gyms) that is the first-screen budget spent on one lookup.

**Fix hint.** `create index concurrently ventas_cliente_created_idx on public.ventas (cliente_id,
created_at desc, id desc);` — it serves the anchor query and the `conteo_cargable` reads off the
same key. One migration, takes the `test:denial` gate, changes no behaviour.

---

### 10 · SOUND, ranked anyway — `realtime.send` cannot roll a member write back; it fails silently instead, and the rail goes dark after 4 idle days. — severity 2

**The mandate's question, answered directly: no.** If `realtime.send` raises, the member's write does
**not** roll back. The entire insert sits inside a subtransaction with a catch-all.

**Evidence.**
- Live body (`pg_get_functiondef` on `realtime.send`):
  ```sql
  BEGIN
    BEGIN
      generated_id := gen_random_uuid();  …
      EXECUTE format('SET LOCAL realtime.topic TO %L', topic);
      INSERT INTO realtime.messages (id, payload, event, topic, private, extension) VALUES (…);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'WarnSendingBroadcastMessage: %', SQLERRM;
    END;
  END;
  ```
  So the trigger at `supabase/migrations/20260901120000_senal_gym.sql:82` (`perform realtime.send(…)`)
  can never abort the statement that fired it. The migration's own header says so at :14-19; this
  round it is verified against the live function rather than the comment.
- The trigger set is live and enabled, re-derived: 15 `senal_*` triggers across
  `asistencias, class_session, clientes, reservation, ventas` (3 events each), all
  `tgenabled = 'O'`, plus `gym.gym_timezone_valid` and
  `gym_membership.revocar_sesiones`. **`gym_membership` carries no `senal` trigger** — so the claim's
  membership insert emits nothing on its own; the signal for a new member comes from the `clientes`
  UPDATE in the same transaction, deduped to one message by the `senal.g_<uuid>` GUC
  (`20260901120000_senal_gym.sql:78-84`).
- The cost of the swallow: every failure is a `WARNING` into a stream with no consumer —
  `apps/client/src/app/auth/confirm/route.ts:40-42`, "the only sink that exists (no log drain
  anywhere in the repo)".
- **Q4, with a number.** `realtime.messages` is RANGE-partitioned on `inserted_at` and the Realtime
  service creates yesterday..today+3 on tenant connect; the Janitor deletes >72 h. Live at
  2026-09-02:
  ```sql
  select c.relname, pg_get_expr(c.relpartbound, c.oid) from pg_inherits i
    join pg_class c on c.oid=i.inhrelid join pg_class p on p.oid=i.inhparent … ;
  -- messages_2026_09_01 … messages_2026_09_05  (5 daily partitions)
  ```
  **Four consecutive days with zero subscribes** exhausts the pre-created range; every subsequent
  `realtime.send` hits "no partition of relation messages found", the handler swallows it, and the
  freshness rail is dead until the next browser subscribe re-provisions partitions. Writes stay
  correct throughout. After a three-month idle every partition is gone and the first writes after
  wake are silently unsignalled until one tab connects.

**Basis.** measured.

**Keep-verdict.** Keep the swallow — a broadcast must never be able to fail a sale. See §Keeps for
the exit trigger.

---

### 11 · SOUND, ranked anyway — the claim RPCs' pre-checks are TOCTOU, but the unique indexes are the real guard and they hold. Zero of the 45 denial suites can test concurrency. — severity 2

**Claim.** Both claim RPCs check-then-act. Under READ COMMITTED the loser of a race re-qualifies its
`SELECT … FOR UPDATE` after the winner commits, finds `auth_user_id is null` now false, gets zero
rows, and falls into the create branch — which then hits `clientes_email_gym_uq` and raises 23505.
**But the racers must share a uid**, because `auth.users.email` is globally unique, so this is one
person double-submitting; the winner already claimed and the loser's error is swallowed into a
redirect the member cannot distinguish from success. Benign as shipped.

**Evidence.**
- `reclamar_o_crear_cliente.sql:50-56` — `count(*)` at :50, `select … for update` at :54-56, then
  `if found then v_reclamado := true; else v_cli := null; end if;` at :66-70, then the create branch
  at :74.
- `reclamar_por_codigo.sql:44-58` — `for update` on the code, then a separate
  `select count(*) … where gym_id = v_gym and auth_user_id = v_uid` ownership check. The structural
  guard behind it is `clientes_auth_user_id_per_gym` UNIQUE `(gym_id, auth_user_id) WHERE
  auth_user_id IS NOT NULL` (live index list above) — the index, not the count, is what makes two
  concurrent claims by one uid land as one row.
- Live consistency, both directions, right now:
  ```sql
  -- claimed clientes with no matching membership: 0
  -- member memberships with no matching claimed cliente: 0
  -- duplicate (gym_id, lower(email)) in clientes: 0
  -- clientes.auth_user_id pointing at a missing auth.users row: 0 (01-live-snapshot §G, re-cited)
  ```
- The coverage gap is structural, not an omission: `grep -rln "dblink\|pg_background" supabase/tests/`
  → no matches. Every suite is one `BEGIN … ROLLBACK` in one session, so **no vector in the 45-file
  suite can express a second concurrent transaction**. This is the correct trade for a
  transaction-local, reusable suite — it just means concurrency is proven by the indexes, not by tests.

**Basis.** measured; the READ COMMITTED re-qualification behaviour is
`reasoning, not sourced — confirmation would be a two-session probe on a scratch project`.

---

### 12 · `registrar_venta` can overwrite a CLAIMED member's email; `actualizar_cliente` explicitly refuses to. Only a UI condition stops it today. — severity 2, and the sharpest Q6 one-liner

**Claim.** Two write paths reach `clientes.email`. One checks whether the row is claimed; the other
does not. The unguarded one is reachable from the sale screen the moment a one-line UI condition
changes.

**Evidence.**
- Guarded: `supabase/functions-canonical/actualizar_cliente.sql:16-18`
  ```sql
  if p_email is not null and v_auth_user_id is not null then
    raise exception 'No se puede editar el correo de una cuenta activa';
  end if;
  ```
- Unguarded: `supabase/functions-canonical/registrar_venta.sql:175-183`
  ```sql
  update public.clientes c
     set clases_restantes = …, vence = …, paquete_nombre = …,
         email = coalesce(p_email, c.email)          -- no claimed-row check
   where c.id = p_cliente_id;
  exception when unique_violation then
    raise exception 'Este correo ya pertenece a otro registro de este gym';
  ```
  The handler only renames the collision error; it does not refuse the edit.
- **Not reachable today — honest.** The DAL forwards `p_email` whenever the form has one
  (`packages/data/src/server/ventas.ts:307` `...(input.email ? { p_email: input.email } : {})`), but
  the sale screen only renders the field for an existing member in EXISTING mode when that member has
  **no** email: `apps/admin/src/app/(app)/vender/_components/vender.tsx:66-67` ("Backfill email for
  an EXISTENTE renewal (C7) — only surfaced when the picked member has no email on file") and `:151`
  `const emailEnviado = mode === "new" ? nuevo.email : backfillEmail;`. And live:
  ```sql
  select count(*) filter (where auth_user_id is not null and email is null) claimed_sin_email,
         count(*) filter (where auth_user_id is not null
                            and lower(email) is distinct from
                                lower((select u.email from auth.users u where u.id = c.auth_user_id))) desalineado
    from public.clientes c;
  -- 0 | 0
  ```
  Zero claimed rows have a null email, and zero claimed rows disagree with their auth identity.
- **Q6 (SQL-adjacent one-liner).** Widening `vender.tsx:151`/`:66` so the email field renders for
  every EXISTENTE sale — a plausible "let the operator fix a typo'd address while they're already on
  the ficha" request — silently un-does `actualizar_cliente`'s claimed-row lock. It would ship green:
  `pnpm test` never executes the RPC body (`registro.test.ts:388`), and no denial vector asserts
  that `registrar_venta` refuses an email edit on a claimed row —
  `supabase/tests/registrar_venta_email.sql` covers capture and backfill on the *new-client* path
  and seeds no claimed cliente (`grep "auth_user_id" supabase/tests/registrar_venta_email.sql` → no
  hits), and `registrar_venta_stacking.sql` V10 covers backfill/keep, not refusal.

**Basis.** measured.

**Fix hint.** Copy `actualizar_cliente.sql:16-18` into `registrar_venta`'s existing-client branch.
Three lines, one migration, one denial vector.

---

## The owner's questions, by number

### Q2 — where are the weak spots that would actually pop?

Ranked by "would pop", not by how bad it sounds:

1. **The single-key claim (finding 01).** 47 loaded rounds today, 8 of them paying RED members. It
   pops the next time a member's typed address differs from the desk's — the most ordinary event on
   this path.
2. **The swallowed claim (finding 06).** It has already popped and left no trace; the "Aún no eres
   miembro" screen is the only artifact, and it reads to the member as "the gym didn't register my
   payment".
3. **The one-tap vincular (finding 07).** Low frequency, irreversible from the UI, and it destroys
   the roster email with no history.
4. **`invitacion_info` on claimed rows (finding 05).** Already true for 10 live RED members; it pops
   the moment anyone forwards an old invite.

What is **not** a weak spot, despite the prior register saying so: missing `(gym_id, tel)`
uniqueness. The live data refutes the premise — two RED pairs are two different people sharing one
phone, and the constraint would not create (finding 04).

### Q5 — corrupting user data as a human using the app normally

| Human act | What the database ends up holding | Reversible? |
|---|---|---|
| Tap VINCULAR on a device with someone else's session | Paid row's `auth_user_id` = wrong person, `email` overwritten, `claim_code` cleared | Only by service-role SQL (`unclaim-cliente-recipe.md`); the original email is unrecoverable — no `updated_at`, no history |
| Sign up at `/registro` with a slightly different address than the desk typed | A second `clientes` row, `clases_restantes = 0`; the paid row stays unclaimed | Yes, but only via the manual merge runbook — which currently names the wrong gym (finding 02) |
| Force-quit between "set password" and the claim | Auth account + password + session, no `clientes` claim, no membership | Self-heals only if the email rail matches; otherwise permanent |
| Double-tap the confirm link / two tabs | One claim wins, the other raises 23505 and is swallowed | Benign — the unique indexes hold (finding 11) |
| Lose signal mid-invite while Resend succeeds | `claim_code` minted, mail delivered, `invitacion_enviada_at` null → desk re-sends | Benign for the invite; feeds the auth-mail 429 (finding 08) |
| Operator sells to an existing member and types an email | `clientes.email` overwritten with no claimed-row check | Not reachable from the UI today; one line away (finding 12) |

The common denominator: **`clientes` has no `updated_at`, no history table, no soft delete, and
`auth.audit_log_entries` is empty.** After 24 hours nothing on this list is even detectable.

### Q7 — every await takes 30 s and every network call fails halfway

**Inside the database: safe.** Each PostgREST RPC is one statement in one transaction, and
`authenticated` carries `statement_timeout = 8s` (`pg_roles.rolconfig`). A 30-second RPC is killed
at 8 s and rolled back whole. `registrar_venta` writing `clientes` + `ventas` + the folio counter is
therefore all-or-nothing; so is `reclamar_o_crear_cliente` writing `clientes` + `gym_membership`;
`ventas_idem_gym_uq` makes a retried sale a replay rather than a double charge
(`registrar_venta.sql:39-49`). **This is genuinely well built and it is the reason no partial DB
state exists on this path.**

**Between the database and everything else: not safe.** Four sequences cross a transaction boundary:

| Sequence | Stops at *k* | What remains |
|---|---|---|
| `completarActivacion` (`activacion.ts:151-167`) — getClaims → set password → claim | 2 | Auth account with a password and a live session; no `clientes` claim, no membership. Self-heal only via the email rail. |
| `/auth/confirm` (`route.ts:122-147`) — redeem token (GoTrue commit) → `finalizarAuth` claim | 1 | Session established, nothing claimed; redirect still lands on `/reservar`. |
| `enviarInvitacion` (`invitaciones.ts:224-249`) — mint code → send → stamp | 3 | Mail delivered, `invitacion_enviada_at` null; the desk re-invites (finding 08). |
| `crearVentaAction` (`vender/actions.ts:52-71`) — sale RPC → `Promise.all([invite, recibo])` | 1 | Sale committed and correct; no invite, no receipt. Recoverable from the desk. |

The last one is the model the other three should copy: the money write is atomic and everything
after it is explicitly best-effort with a visible retry. The activation sequence has the same shape
but no visible retry — the claim failure is invisible.

### Q6 — the most plausible ONE-LINE change that breaks a guarantee with tests still green

**Primary, SQL-side:** `alter table public.clientes add constraint clientes_tel_gym_uq unique
(gym_id, tel);` — the constraint P-004/P-008/P-009 keep naming as missing. It turns
`registrar_venta.sql:186-204`'s unbounded retry into an 8-second spin ending in `57014`, on the desk
sale path, for the most common shape (duplicate phone, no email). `pnpm test` and CI stay green
because vitest mocks `.rpc()`. `test:denial` V9 would catch it — and `test:denial` is in neither
gate. It would also fail to apply against live data (finding 04).

**Runner-up, app-side but with a database guarantee behind it:**
`apps/admin/src/app/(app)/vender/_components/vender.tsx:151` — dropping the "only when the member
has no email" condition on the backfill field. That silently un-does
`actualizar_cliente.sql:16-18`'s explicit "No se puede editar el correo de una cuenta activa" rule,
because `registrar_venta` has no equivalent check. Every gate green, including `test:denial`
(finding 12).

**Third, the trigger loop:** adding a sixth table name to
`supabase/migrations/20260901120000_senal_gym.sql:127`'s array before that table has a `gym_id`
column. The migration's own header calls this out at :43-46 and the `where gym_id is not null` filter
is already there for it — so this one is *guarded*, and I name it only to say it is covered.

### What deleting an auth user actually leaves (the 09-01 Marce question)

Asked explicitly by the mandate: the 09-01 deletion of Marce's `auth.users` row was self-voided when
she re-registered an hour later. **Had it not been, nothing would have been lost.** The FK graph
from `auth.users` into `public` is four constraints, read live:

```sql
select conrelid::regclass, conname, pg_get_constraintdef(oid) from pg_constraint
 where contype='f' and confrelid='auth.users'::regclass and connamespace::regnamespace::text not in ('auth','storage');
-- acuerdo_aceptacion.accepted_by  → ON DELETE SET NULL
-- clientes.auth_user_id           → ON DELETE SET NULL
-- gym.owner_user_id               → ON DELETE SET NULL
-- gym_membership.user_id          → ON DELETE CASCADE
```

So deleting a member's auth user:
- **`clientes.auth_user_id` → NULL.** The paid row survives whole — her 4 ventas (folios 1066, 1072,
  1088, 1091), her `claim_code`, her `vence`, her email. `ventas` hangs off `cliente_id`, never off
  the auth user, so the money is never in the cascade's path.
- **`gym_membership` row → deleted by cascade**, which fires the row-level AFTER DELETE trigger
  `revocar_sesiones_al_quitar_membresia` (`supabase/functions-canonical/revocar_sesiones_al_quitar_membresia.sql:5-9`)
  and deletes **all** of that identity's sessions across every gym. Correct here; a footgun in
  general (ADR-0016, row P-125).
- **Consent stamps survive** from the deleted identity — `terms_accepted_at` and
  `privacy_accepted_at` are not nulled, so the row would claim consent from a person who no longer
  exists. Cosmetic next to finding 03, which is the same defect at 51 rows.
- The row is then re-claimable by **either** rail: by code (`claim_code` intact) or by email
  (`reclamar_o_crear_cliente` matches on `auth_user_id is null and lower(email) = …`, and the phone
  requirement at `:75-77` is on the *create* branch only, so the match path needs no metadata).

**Verdict: sound.** Deleting an auth user is a clean unclaim by construction, not by luck. The one
irreversible thing it does is revoke sessions globally, and that is documented behaviour. The
09-01 remediation cost time, not data.

---

## Keep-verdicts

| Keep | Exit trigger |
|---|---|
| `clientes_email_gym_uq` as the sole structural identity key. It is what makes every claim race benign (finding 11) and what keeps duplicate-email rows at 0 across 183 rows. | When a **3rd** split-identity pair appears live (today: 2 — "karen lara", "joel trevizo"), or when rows with a live code and no email cross **60** (today: 47). Either means the email key stopped covering the population. |
| `ON DELETE SET NULL` on `clientes.auth_user_id`. Verified above: it preserves the paid row and every venta while cleanly unclaiming. | Re-open only if `clientes` gains a column whose meaning depends on the identity that set it — today there are **0** such columns (consent stamps are the near-miss, covered by finding 03). |
| `realtime.send`'s catch-all swallow. A broadcast must never be able to fail a sale (finding 10). | When the repo gains its **1st** log drain, add a counter/metric for `WarnSendingBroadcastMessage` at the same time — today there are **0** drains, so a louder failure would be shouted into a void. |
| `SECURITY DEFINER` + Vault-HMAC firma on both claim RPCs. It is the only un-spoofable channel available (D2, rows P-090/P-091), and the firma is re-verified before any read or write. | When a **2nd** legitimate caller of `reclamar_*` appears that is not a server action holding `TENANT_ASSERTION_KEY` — today there is exactly **1** (`packages/data/src/server/registro.ts`). |
| `ventas_idem_gym_uq` and the RPC's replay arm (`registrar_venta.sql:39-49`). It is why a 30-second-await double submit cannot double-charge. | When any caller ships that does not send `p_idempotency_key` — today there is **1** caller and it always sends it (`ventas.ts:283`). |
| `test:denial` as the only gate that can see an RPC write regression. Keeping it is not in question; keeping it *out of CI* is. | **25** migrations landed in the last 24 days (17% of the 145-migration history; 14 in the last 8 days). Move it into CI, or record a per-migration run-green line, before migration **#26** in this window. |
| Transaction-local, single-session denial suites. The reusability is worth more than concurrency coverage. | Undecided — *does concurrency on the claim path need a test at all, given the unique indexes carry it?* Owner (or the T-owner of the test strategy) must answer; my read is no. |

---

## Could not determine

| Question | The experiment that would settle it |
|---|---|
| What do the 15 `senal_gym` triggers actually cost per write on the member path? | On a scratch project: `\timing` 1 000 iterations of `update public.clientes set nombre = nombre where id = $1`, then `alter table public.clientes disable trigger senal_clientes_upd` and repeat. Report the per-statement delta in µs. Not runnable from this seat — it is a write. |
| Does `pnpm test:denial` pass at HEAD? | `SUPABASE_TARGET_REF=<scratch> SUPABASE_ACCESS_TOKEN=<pat> pnpm test:denial`, or the local-docker path in memory `local-docker-denial-path.md`. Memory `ibookit-app-ui-worktree.md` records the scratch PAT as **dead**, so the docker path is the live one. |
| How often does a member actually hit a swallowed claim (finding 06)? | Add one `console.warn(JSON.stringify({event:"reclamo-fallido", motivo}))` at `registro.ts:328` and count over 30 days. Today `intentarReclamo` writes nothing, so the answer is unknowable — including retroactively. |
| Were there historical split-identity pairs that got merged or abandoned? | Not recoverable. No `updated_at` on `clientes`, no history table, `auth.audit_log_entries` = 0, log stream capped at 24 h. Only `ventas.created_at` clustering per cliente gives a weak hint. |
| Does the live project pause after idle (the real Q4 ceiling)? | Dashboard → Project Settings → Subscription / Compute. Not readable via SQL or MCP from this seat. |
| Is Resend's p99 ever above the 10 s abort (finding 08)? | Resend dashboard latency, or instrument `resendTransport` with a duration log. Not measured this round. |

---

## Blind spots — what I did not examine

- **`supabase/functions/activar-cuenta/nucleo.ts`** — I read its *contract* through `activacion.ts`'s
  error taxonomy but never opened the body. Its `email_no_coincide` / `sin_email` branches are the
  gate that decides how reachable finding 01 is from the invite rail specifically; I bounded finding
  01 on the `/registro` rail only, which I could read end to end.
- **`activar/page.tsx`'s vincular short-circuit** — finding 07's trigger condition is cited from
  row P-131, tagged `unverified this round`. The action body itself is read at HEAD.
- **The other ~45 canonical RPC bodies** — `reservar_clase`, `pasar_lista_sesion`, `toggle_pase`,
  `editar_venta`, `eliminar_venta`, `cambiar_modo_reservas`. Those are the post-join write path, not
  the new-member one.
- **Migration bodies vs. what actually ran live.** `01-live-snapshot.md` §B compared names and
  version prefixes (122/148 applied versions have no matching repo filename); I did not diff a
  single migration's SQL text against its applied counterpart. Every claim I make about a *current*
  DB object is read from `pg_proc`/`pg_constraint`/`pg_indexes`/`pg_policies` live, not from a
  migration file, precisely because of that drift.
- **RLS by role-switch.** The mandate is SELECT-only, so I read `pg_policies` and function ACLs
  rather than running `set local role authenticated` probes. Every policy claim here is a catalog
  read, not an executed denial.
- **The senal write-path latency** — see could-not-determine.
- **`apps/mobile/`** (untracked at session start) and the admin ficha's write path beyond
  `reenviarInvitacionAction`'s call shape.
- **I did not run `pnpm test`, `pnpm test:denial`, or `pnpm test:e2e`.** Every statement about what a
  gate would or would not catch is derived from reading `.husky/pre-commit`, `.github/workflows/ci.yml`,
  `package.json`, the suite sources, and the test doubles — never from a run.

---

## Draft audit — what I cut or retagged, and the rule that caught it

Seven. None of these reached the ranked list in their original form.

1. **Cut:** *"the claim race lets two members claim each other's rows."* — Rule 4 (the incumbent is a
   candidate) applied in reverse: I had a criticism I could not support. `auth.users.email` is
   globally unique, so both racers must share one uid; the outcome is one person double-submitting
   and the winner's claim standing. Rewritten as finding 11, ranked **as sound**.
2. **Cut:** *"there is no unique `(gym_id, tel)` and that is the fix"* — carried in from P-004,
   P-008 and P-009. Rule 4 + Rule 7: the live query returns two RED phone pairs that are two
   different people with two different email accounts, sold together at the desk. The prior claim is
   a substitution-test failure — "everyone knows you need a phone constraint" is not evidence.
   Rewritten as finding 04, where the constraint is the *hazard*, not the fix.
3. **Retagged:** *"`registrar_venta` lets the desk overwrite a claimed member's email"* — from a
   live defect to a latent one. Rule 5: `claimed_sin_email = 0` and `email_desalineado = 0` live,
   and the UI gates the field. Demoted to finding 12 and reframed as the Q6 one-liner.
4. **Cut:** *"if `realtime.send` raises, the member write rolls back."* — Rule 5: the live
   `pg_get_functiondef` shows the whole INSERT inside `EXCEPTION WHEN OTHERS`. Rewritten as finding
   10, an explicitly sound entry, with the migration's comment verified against the function rather
   than trusted.
5. **Cut:** *"`registrar_venta`'s retry loop is an infinite loop."* — Rule 2 (name the number) and
   Rule 5: it is bounded at `statement_timeout = 8s`, and it is not reachable at HEAD at all,
   because with a null `p_email` the only possible violation is the `claim_code` collision the retry
   exists for. Rewritten as a conditional Q6 hazard.
6. **Retagged:** the 300 000-ventas figure in finding 09, from `measured` to
   `modelled — linear extrapolation from the measured 300-row plan`. Rule 5: the plan is measured,
   the projection is not.
7. **Cut:** *"the 09-01 auth-user deletion could have orphaned Marce's ventas."* — Rule 5 and Rule 7:
   `clientes.auth_user_id` is `ON DELETE SET NULL` and `ventas` hangs off `cliente_id`, so her money
   was never in the cascade's path. Rewritten as an explicit **sound** verdict in the Q-section,
   because the mandate asked the question and "it was fine by construction" is the honest answer.
