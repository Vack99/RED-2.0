# T9 — Partial failure on the new-user path (Q7)

Cross-examine, territory T9. **Q7 is mine**: assume every `await` takes 30 s and every network
call fails halfway — which operations leave the system broken?

Repo HEAD `33c9087a`. Live project `hjppxawglmukfvsgmcog`, SELECT-only. Member addresses masked
(first 3 chars + domain) except `marcerubiogarcia07@gmail.com`, already documented in
`docs/FIndings/2026-09-02-marce-triage.md`.

---

## 0. The premise, restated as a rule the code must survive

"Every await takes 30 s and every network call fails halfway" is really two different attacks and
this path answers them differently:

- **Stall.** Only GET/HEAD is bounded. `packages/data/src/server/fetch-shield.ts:140` — `if (method
  !== "GET" && method !== "HEAD") return fetch(input, init);` — every POST runs on the platform's
  function limit, which this repo never sets (`apps/{client,admin}/vercel.json` carry `regions` +
  `headers` + `crons` and **no `maxDuration`**; `grep -rn maxDuration apps` returns nothing). So the
  real bound on a 30-s await is Vercel's per-plan default, not code.
- **Cut.** The damaging case is not "the write failed". It is **"the write succeeded and the
  acknowledgement did not"** — because on this path the leg that commits (GoTrue's user row, the
  one-time-token rotation, `registrar_venta`) is upstream of the leg that reports (the mail, the
  cookie, the action's return value). Nine of the twenty-two operations in §2 fail in exactly that
  direction.

Two structural facts govern everything after this:

1. **There is no error boundary in either app.** `find apps/{client,admin}/src -name "error.tsx" -o
   -name "global-error.tsx"` → **zero files**. Next's contract
   (`node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md:201-209`,
   `.../03-api-reference/03-file-conventions/error.md:80,106`) is that an uncaught exception is
   caught by an `error.js` boundary and that in **production the error `message` is stripped from
   what reaches the client**. With no boundary and no `global-error.js`, every timed-out or thrown
   server action and every failed RSC render on the new-user path renders Next's built-in fallback:
   no Spanish, no brand, no `unstable_retry()` control, no link back to `/entrar`.
2. **There is no queue, no outbox and no retry anywhere on the mail path** (prior register P-105,
   `email-capacity-ceilings.md`, 2026-07-22 — re-derived at HEAD: `resendTransport` carries an
   explicit "No retry here" comment at `invitaciones.ts:71-73`; the hook has none; `sesion.ts` has
   none).

---

## 1. Ranked findings — worst first

Ranking axis is probability × member-visible damage. Twelve rows; the floor was eight.

---

### T9-01 — GoTrue commits the account and rotates the one-time token BEFORE the mail can fail, and the member is told the account failed. Retry rotates again.

**Severity 5. Basis: measured (live).**

`registro/actions.ts:57` → `registrarSocio` → `supabase.auth.signUp(...)`
(`packages/data/src/server/registro.ts:153`). Inside GoTrue that is: create/update `auth.users`,
mint-or-rotate the single `auth.one_time_tokens` row for `(user_id, 'confirmation_token')`, stamp
`confirmation_sent_at`, **then** invoke the Send Email Hook. If the hook leg fails, the first three
are already durable.

**Live proof at HEAD** — the one account whose signups all failed at the hook:

```sql
select id, left(email,3)||'@'||split_part(email,'@',2), created_at, confirmation_sent_at,
       email_confirmed_at, last_sign_in_at
  from auth.users where id='7c464e4f-a15d-4192-9aa2-89d728c249ef';
-- del@resend.dev | created 2026-08-31 00:55:37Z | confirmation_sent_at 2026-08-31 01:53:02Z
--                | email_confirmed_at NULL | last_sign_in_at NULL

select token_type::text, count(*), max(created_at) from auth.one_time_tokens group by 1;
-- confirmation_token | 6 | 2026-08-31 01:53:02.562756
-- recovery_token     | 2 | 2026-08-28 23:24:05.379269
```

Every `/signup` for that user returned `500: Invalid payload sent to hook` and **zero mail ever
left** (marce triage §5 — six occurrences, 09-01 21:40 → 09-02 08:53). The user row, the
`confirmation_sent_at` stamp and a live `confirmation_token` row all exist anyway. That is the
whole claim, proven on this project's own data: **the hook is not in the signup transaction's
rollback path.**

**Member-visible symptom.** "No pudimos crear tu cuenta. Inténtalo de nuevo en unos minutos."
(`registro.ts:90`) for an account that now exists. They retry; the retry rotates the token again;
if a mail from an earlier attempt *did* land, that mail is now dead. This is the 2026-08-30 Sarahí
wedge mechanism (prior register P-092/P-064 — attributed, and re-derived here from the
`del@resend.dev` row rather than restated).

**Anti-idempotent: YES.** Retry strictly worsens state — one more dead link in the inbox, one more
spend against the project auth-mail bucket.

**Breaking point.** `signUp` under any hook failure: 100% of the member's held links die per retry.
The token table holds exactly ONE confirmation row per user (marce triage §1; re-observed here: 6
rows, 6 distinct users).

**Fix hint.** The mail is already best-effort in fact; make it best-effort in the UI. Since the
account exists, `/registro`'s failure screen must be the "abre el más reciente + reenviar" screen
(the `yaEnviado` arm at `registro/actions.ts:73`), not "no pudimos crear tu cuenta" — the one
message that is provably false on this arm.

---

### T9-02 — The hook's 503 "retry" is not a retry. Supabase only retries a 429/503 that carries a non-empty `Retry-After`; this hook never sets one.

**Severity 5. Basis: measured (primary source + code at HEAD).**

`supabase/functions/send-email/index.ts:127-128` — `catch { status = null; // network error →
respuestaEnvio maps it to a 503 retry }`, and `correo.ts:206-213` returns HTTP 503 for
`status === null || 429 || >= 500`. `index.ts:137-140` builds that response with
`headers: { "Content-Type": "application/json" }` — **no `Retry-After`**.

Supabase Auth docs (fetched this round via `search_docs`, Auth Hooks page), verbatim:

> "On a retry-able error, such as an error with a `429` or `503` status code, HTTP Hooks will
> attempt up to three retries with a back-off of two seconds. **We have a time budget of 5s for the
> entire webhook invocation, including retry requests.**"

> "Return a retry-able error by attaching a appropriate status code (`429`, `503`) **and a
> non-empty `retry-after` header**."

So the branch the code calls "a 503 retry" is, in production, a hard failure: GoTrue surfaces it to
the caller and the already-minted OTP is burned (T9-01). The comment is the only thing that retries.

**Member-visible symptom.** Resend is slow / 429 / 5xx for one second → `/registro` says "No pudimos
crear tu cuenta", or `/activar` says **"NO SALIÓ EL CORREO"**
(`activar/_components/activar-form.tsx:145-152`) — and the token was consumed either way.

**Breaking point, with the number.** The hook's total budget is **5 s** (primary source above).
Measured live latency of `send-email` over the last 24 h (`function_edge_logs`; function_id
`45070cf2-20cd-4fcf-a016-2530576e63ff` = `send-email` per `list_edge_functions`): **n=14, avg
581 ms, max 2 594 ms.** The worst observed invocation already spends **52% of the budget**; headroom
is **1.93×**. The hook makes THREE unbounded network calls inside that budget: `gym_id_por_host` RPC
+ the `gym` select in `gymNombrePorHost` (`index.ts:53-67`, plain supabase-js in Deno — the fetch
shield is `server-only` and cannot be imported there), plus the Resend POST at `index.ts:115`, which
has **no `AbortSignal`** — unlike its sibling `resendTransport`, which does (`invitaciones.ts:58`).

**Fix hint.** Two one-liners: add `"retry-after": "true"` to the 503 response (literally what the
doc asks for), and put `signal: AbortSignal.timeout(3000)` on the Resend POST so a stalled Resend
leaves room inside the 5 s budget instead of eating it.

---

### T9-03 — Two of the five GoTrue-mail doors do not consult the one shared throttle. That gap is Marce's 429.

**Severity 5. Basis: measured (code at HEAD + the live auth log).**

`packages/data/src/server/reenvio-limite.ts` exists so that "the second door reopens what the first
closes" cannot happen (its own module note, :6-9). `grep -rn "reenvio-limite|permitirReenvio|
enEsperaReenvio"` over `apps` + `packages`, tests excluded, returns exactly **three** consumers:

| door | file:line | GoTrue call | gated? |
|---|---|---|---|
| `/registro` signup | `registro.ts:149,177` | `signUp` | **yes** |
| `/registro` resend | `registro/actions.ts:97` | `resend({type:'signup'})` | **yes** |
| `/entrar` resend | `entrar/actions.ts:84` | `resend({type:'signup'})` | **yes** |
| `/activar` cuenta_existente | `activar/actions.ts:87` → `sesion.ts:185` | `signInWithOtp` | **NO** |
| `/entrar` forgot-password | `entrar/actions.ts:57` → `sesion.ts:109` | `resetPasswordForEmail` | **NO** |

Marce's incident is exactly this collision: `/registro`'s `signUp` at `2026-09-01 19:24:45Z` charged
the counter; her `/activar` press 32 s later called the **ungated** `signInWithOtp` and hit GoTrue's
own 60-s-per-address floor — `429 over_email_send_rate_limit`, twice (marce triage §2, rows 3-4,
with verbatim log JSON). She was the only account to hit that code in the whole 24-h window.

**Member-visible symptom.** "NO SALIÓ EL CORREO / No pudimos enviarte el enlace ahora mismo. Intenta
de nuevo." — with **no wait time named**, on the rail whose entire purpose is rescue.
`activar/actions.ts:94` collapses every send failure into one `cuentaExistenteFallo`, so a 429 (wait
28 s) and a dead Resend key (wait forever) print the same screen. That is why she pressed it twice,
ten seconds apart.

**Anti-idempotent: no** — the 429 fires before the token is minted, so nothing is destroyed. But the
retry is **guaranteed** to fail again for up to 60 s and the screen does not say so.

**Breaking point.** GoTrue's floor is **60 s per address**. The shared project bucket is **50/hr**
(prior register P-069/P-105 — **unverified this round**; `supabase/config.toml:199` says
`email_sent = 2`, which is the local-dev value, not the live one). The app's own counter is
5 min/address and 5/UTC day. Two of five doors bypass all three.

**Fix hint.** Route `enviarMagicLink` and `solicitarReset` through `permitirReenvio`, and give
`cuentaExistenteFallo` a `segundos` field so the screen can say "espera 28 segundos".

---

### T9-04 — Neither app has a single error boundary, so any timed-out await on the new-user path ends on Next's built-in production error page.

**Severity 4. Basis: measured (file tree + Next docs at HEAD).**

`find apps/{client,admin}/src -name "error.tsx" -o -name "global-error.tsx"` → **0 results**. Six
`loading.tsx` files exist (`(home)`, `clase/[sessionId]`, `nosotros`, `precios`, `reservar`,
`saldo`) — and **none** on `/activar`, `/activar/contrasena`, `/registro`, `/entrar` or
`/auth/confirm`, i.e. none of the five doors a new member walks.

Every door's form dispatches through `useActionState` inside `startTransition`
(`activar-form.tsx:5,106`; `registro-form.tsx:5,177`). A server action that **throws** — or whose
function is killed by the platform limit — rejects that transition; React rethrows during render;
with no boundary it reaches Next's built-in fallback, whose `message` is stripped in production
(`error.md:106`).

**Member-visible symptom.** Mid-activation, on a phone, in a Spanish flow: an unstyled English error
page with a digest hash. No retry, no "iniciar sesión", no way back. The member's account may or may
not exist; nothing on screen says which.

**Breaking point.** Unmeasured — **the experiment**: read the Vercel plan for these two projects and
the default `maxDuration` it applies (Hobby / Pro / Fluid differ), then POST `activarAction` with
`TURNSTILE_SECRET_KEY` pointed at a black-holed host and time the 500. Until then the platform
default is the only bound, and this repo does not state it.

**Fix hint.** One `app/error.tsx` per app, in Spanish, with `unstable_retry()` — the API the
installed Next version documents (`error.md:121`). This is the cheapest single item in this document
and it covers every row below it.

---

### T9-05 — The whole new-user path runs on unbounded POSTs. The shield covers the two shapes this path uses least.

**Severity 4. Basis: measured (code) + measured latency (live logs).**

`fetch-shield.ts` bounds `jwks.json` at 2 500 ms and every other GET/HEAD at 8 000 ms + **one
untimed retry** (`:143-147`). Everything else is `return fetch(input, init)` (`:140`), on purpose,
for two load-bearing reasons the module states.

Counted at HEAD, one `GET /auth/confirm?token_hash=…` — the single most important request a new
member ever makes — makes **at least four unbounded network legs**:

| # | leg | file:line | bounded? |
|---|---|---|---|
| 1 | `gym_id_por_host` RPC (proxy tenant resolve, every matched request) | `resolve-tenant.ts:146` | **no** — POST, documented exception `fetch-shield.ts:48` |
| 2 | `POST /auth/v1/token` refresh inside `getClaims()` | `apps/client/src/proxy.ts:168` | **no** — documented, `fetch-shield.ts:30-36` |
| 3 | `verifyOtp` / `exchangeCodeForSession` | `sesion.ts:240,216` | **no** |
| 4 | `reclamar_por_codigo` **or** `reclamar_o_crear_cliente` | `registro.ts:291,230` | **no** |

The first member render of `/reservar` adds a fifth: `mi_membresia`, which `fetch-shield.ts:51`
explicitly documents as un-GET-able ("plpgsql with no volatility marker, i.e. VOLATILE: PostgREST
refuses GET"), called at `agenda-miembro.ts:494`.

Leg 1 is the systemic one: `resolveTenant` runs at the **top** of both proxies before anything else
(`proxy.ts:102`), on every non-asset request of both apps. A stall there hangs the **entire
platform**, signed in or not. Its only mitigation is the 60-s TTL cache (`resolve-tenant.ts:71`),
which does nothing for the first request after any cold start or TTL expiry.

**Honest counter-evidence (M2).** Today's numbers say this is latent, not active. Live `auth_logs`,
last 24 h, durations parsed out of the log line:

| path | n | avg | max |
|---|---|---|---|
| `/.well-known/jwks.json` | 744 | 2.9 ms | 51.3 ms |
| `/token` (the unbounded refresh) | 143 | 160.9 ms | 392.5 ms |
| `/signup` (includes the hook) | 21 | 285.1 ms | 908.2 ms |
| `/otp` | 8 | 254.7 ms | 683.5 ms |
| `/verify` | 10 | 79.2 ms | 155.4 ms |
| `/recover` | 3 | 914.5 ms | **2 678.1 ms** |

jwks runs **49× under** its 2 500 ms bound. `/token` runs 76× under the 30-s premise. The one number
that is not comfortable is `/recover` at 2.68 s max on n=3.

**Breaking point.** Unmeasured for legs 1-4 — they have **no bound at all**, and the last measured
pathological value on this project was **266 s** (2026-08-29, ADR-0017; prior register P-063,
not re-measured this round). **The experiment**: point `NEXT_PUBLIC_SUPABASE_URL` at a TCP black
hole in a preview deploy and time `GET /auth/confirm` end to end.

---

### T9-06 — `iniciarActivacion` is a three-leg distributed transaction with no compensation, and a cut after leg 1 moves the member permanently onto a rail production has never exercised.

**Severity 4. Basis: measured (code at HEAD) + measured (live census). Prior claim: P-022 / P-054 /
catalog F-32 — attributed, and re-derived at HEAD below rather than restated.**

`supabase/functions/activar-cuenta/index.ts`:

- L92-95 `admin.auth.admin.createUser({ email, email_confirm: true })` — **commits**.
- L105-108 `admin.auth.admin.generateLink({ type: "recovery" })` — **commits**, rotating the user's
  recovery token.
- then `packages/data/src/server/activacion.ts:124` `confirmarTokenHash("recovery", tokenHash)` —
  **consumes** it and sets cookies.

There is no `deleteUser` on the L110 failure path and no compensation anywhere. Cut after leg 1:

- the edge fn returns 500 → `activacion.ts:113` maps it to `error_interno` → `activar/actions.ts:103`
  renders `GENERICO` = "No pudimos activar tu cuenta. Intenta de nuevo.";
- the member retries → `createUser` now fails `email_exists` → `esErrorEmailExistente`
  (`nucleo.ts:133`) → **`cuenta_existente`** → the magic-link rail, permanently. The claim code is
  still unclaimed, so no data is lost — but the door they were told to retry is a different door
  now, with different failure modes, and nothing on screen says so.

**Why that matters more than it reads.** Live census, this round:

```sql
select count(*) from (select auth_user_id from public.clientes
  where auth_user_id is not null group by auth_user_id having count(distinct gym_id) > 1) z;
-- 0
```

**Zero multi-gym users exist.** The `cuenta_existente` rail's designed case — a member of a second
gym — has **never once occurred in production**. Every `cuenta_existente` this project has ever
served was a self-registration collision: Marce's. So the fallback for T9-06 is a rail with exactly
one real-world data point, and that data point ended in a 429 and a 21-hour outage for a member who
had just paid $1 200 (marce triage §4).

**Fix hint.** Leg 2 is the only one worth compensating and it is cheap: on `linkErr`, call
`admin.auth.admin.deleteUser(created.user.id)` before returning 500, so the retry stays on the
fresh-provision rail. Safe only because leg 1 created that user in this same invocation.

---

### T9-07 — `registrar_venta`'s idempotency short-circuit silently discards a corrected resubmit, and the failure copy actively invites that correction.

**Severity 4. Basis: measured (RPC body + client code at HEAD).**

`supabase/functions-canonical/registrar_venta.sql:37-49`:

```sql
select v.folio, v.cliente_id into v_folio, v_cliente_id
  from public.ventas v
  where v.gym_id = v_gym and v.idempotency_key = p_idempotency_key;
if found then
  return query select v_folio, c.id, c.clases_restantes, ... ;
  return;
end if;
```

It returns **before validating a single argument**. `vender.tsx:82` holds `idemKey` in component
state and resets it **only** inside `resetForm()` (`:296`), i.e. only after a *successful* sale is
closed; the error path at `:274-279` keeps it.

So: the RPC commits, the acknowledgement is lost (30-s premise, or a halfway cut), `finish()`'s
`catch` fires (`vender.tsx:274`) and toasts **"No se pudo cobrar — Revisa los datos e intenta de
nuevo."** The operator does exactly that — changes the monto, the paquete, the método — and
resubmits under the same key. The RPC returns the **original** row and the UI renders a success
recibo. The correction is gone, silently, with a receipt printed for the uncorrected sale.

**Member-visible symptom.** The member is handed a receipt for the wrong package or price, and their
`clases_restantes` / `vence` reflect the first attempt. On a roster where 8 of 66 RED clientes are
still un-activated, a wrong balance is also a wrong first impression of the app.

**Anti-idempotent: no** — nothing is double-written. It is **anti-truthful**, which on the money path
is worse: the write is discarded and reported as success.

**Fix hint.** The copy is the bug. "Revisa los datos e intenta de nuevo" must not be the message on a
network failure, because the data cannot change under a live idempotency key. Either mint a fresh
key when the operator edits any field after a failure, or say "no supimos si se cobró — vuelve a
enviar sin cambiar nada".

---

### T9-08 — A replayed sale re-fires both mails, because `isNew` is a client-declared flag, not a database fact.

**Severity 3. Basis: measured (code at HEAD).**

`ventas.ts:225` — `const isNew = input.mode === "new";` — and `:388` puts it straight into the
result. `vender/actions.ts:109` branches on it: `if (!result.cliente.isNew) return { estado:
"no-aplica" }`.

A replayed submit (T9-07's path) therefore runs the **full** post-sale fan-out again:
`resolverInvitacion` → `enviarInvitacion` (a second "Tu gimnasio RED te invita a su app", with the
same `claim_code` — `preparar_invitacion.sql:30` only mints a code when `v_code is null`) **and**
`enviarReciboDeVenta` (a second receipt). Both spend the single shared Resend account.

**Member-visible symptom.** Two identical invites in the inbox. Marce's inbox already held six
"Confirma tu cuenta" mails of which only the newest worked (marce triage §3); duplicate "te invita"
mails are the same confusion by a different door — with the difference that these two ARE
interchangeable (same code), so it is noise, not a wedge.

**Anti-idempotent: mildly** — each replay costs 2 of the Resend daily budget (prior register P-105:
Free tier 100/day, 3 000/month, account-level bounce ceiling 4%; **unverified this round**).

**Fix hint.** Derive `isNew` from the RPC — it already knows whether it inserted — or skip the
fan-out when the RPC took the idempotency short-circuit, which requires the RPC to say so (e.g. a
`replayed boolean` out-column).

---

### T9-09 — `enviarInvitacion` sends, then stamps. A cut between them makes the desk under-report, and the operator's fix is another mail.

**Severity 3. Basis: measured (code at HEAD).**

`packages/data/src/server/invitaciones.ts:244-249`: `transport.send(mensaje)` → `if (!envio.ok)
return` → `await supabase.rpc("marcar_invitacion_enviada", …)`. The ORDER is right — never claim a
send that did not happen — and the failure direction is the safe one. But it is still a partial
failure with a cost: mail delivered, `clientes.invitacion_enviada_at` still null, the ficha shows the
member as not-yet-invited, the operator presses **REENVIAR INVITACIÓN**
(`clientes/[id]/actions.ts:64`), and a second identical mail goes out.

The stamp RPC is also the only leg here with **no** timeout — `resendTransport` bounds itself at 10 s
(`invitaciones.ts:58`); neither RPC does.

**Anti-idempotent: no.** Same code, same URL; the second mail is redundant, not destructive.

**Fix hint.** None needed at this volume. Keep-verdict in §4.

---

### T9-10 — The per-address throttle is per-instance and forgotten on cold start, so it refuses nothing precisely when it matters.

**Severity 3. Basis: measured (code) — the module documents the limitation; the NUMBER is what is missing.**

`reenvio-limite.ts:38` — `const envios = new Map<…>()` at module scope. The module's own note
(:23-29) is honest: "the counter lives in the serverless instance's memory, so N warm instances allow
up to N× this rate and a cold start forgets everything."

What the note does not name is the number, so name it: the policy is **1 send / 5 min / address and
5 / UTC day** (`:31-33`), against a GoTrue floor of **60 s/address** and a project bucket of
**50/hr**. With N concurrent warm lambdas the effective policy becomes **N sends / 5 min / address**.
At **N ≥ 5** the app-level throttle is looser than GoTrue's own floor and therefore contributes
nothing. After the three-months-idle scenario every instance is cold, so **the first send of every
address is always allowed** — which is exactly the send that matters.

Compounding: two of five doors bypass it entirely (T9-03), so even a warm instance cannot see the
`/activar` magic link that is about to trip the 60-s floor.

**Fix hint.** The shield plan's §(e) (shared-state per-gym budgets) is the real fix. The cheap interim
is one Postgres table `(email, ultimo, dia, enviados)` and an upsert — the DB is already on every one
of these code paths.

---

### T9-11 — Turnstile verification is an unbounded fetch that blames the member for our outage, on three of the four doors.

**Severity 3. Basis: measured (code at HEAD).**

`apps/client/src/lib/turnstile.ts:33` — `await doFetch(SITEVERIFY_URL, { method: "POST", body })`
with **no `AbortSignal`** and no timeout. It is a raw global `fetch` (`:27`), so the fetch shield —
which only ever wraps Supabase clients — does not touch it either.

It is the **first** await in `activarAction` (`activar/actions.ts:62`), `vincularAction` (`:127`) and
`registrarAction` (`registro/actions.ts:47`). Under the 30-s premise the whole action hangs before it
has done anything. Under the halfway-cut premise the `catch` at `:36` returns `false`, and every
caller renders:

> "No pudimos verificar que no eres un robot. Intenta de nuevo."

**Member-visible symptom.** A Cloudflare degradation reads to the member as an accusation, on a
screen with no bypass. The client half already has a 10-s floor for the widget never loading
(`activar-form.tsx:82`, `sinCargar`) — the server half has no equivalent.

**Fix hint.** `signal: AbortSignal.timeout(5000)`, and split the return so a *verification outage*
(network/timeout) is a distinct state from a *failed challenge*. The first should retry, not accuse.

---

### T9-12 — The señal rail swallows every failure by design. That is correct for the write, and invisible to the member.

**Severity 2. Basis: measured (live `pg_proc` body + live partition list).**

`supabase/functions-canonical/senal_gym.sql:20` calls `realtime.send(...)` inside the AFTER trigger
that fires on the claim's own transaction. Read live:

```sql
select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'realtime' and p.proname = 'send';
-- BEGIN ... INSERT INTO realtime.messages (...)
--   EXCEPTION WHEN OTHERS THEN RAISE WARNING 'WarnSendingBroadcastMessage: %', SQLERRM;
```

**This is sound and I want it on the record as sound (M2).** A Realtime outage, a missing daily
partition, or a full `realtime.messages` cannot roll back `reclamar_por_codigo`'s claim. Partitions
are present and ahead of today (`messages_2026_09_05`, `…_09_04`, `…_09_03`, bounds read live). The
`set_config(..., true)` de-dupe guard at `senal_gym.sql:17-19` is transaction-local, so it cannot
leak across statements.

The cost is that the rail's failure mode is **total silence in both directions**: nothing surfaces
server-side beyond a `RAISE WARNING` nobody reads, and the browser's only tell is
`console.warn("[senal] canal", estado)` (`client-senal.ts:219`). A new member on `/reservar` whose
channel never subscribed sees a page that is simply never fresh, with no complaint.

**Honest mitigation, also worth recording:** `useSenalGym` does not depend on the socket for
correctness — the `visibilitychange` listener (`client-senal.ts:184-195`) re-requests a refresh
whenever the tab foregrounds, so a dead socket degrades to "fresh on every app switch" rather than to
"stale forever". That floor is real and it is why this ranks twelfth and not fifth.

---

## 2. The operation table (Q7, answered row by row)

Every operation on the new-user path, with the state each leaves when step *k* hangs or is cut.
"mail?" = did a mail leave. "truth?" = is the member told what actually happened.

| # | operation | file:line | cut at | browser | cookies | auth.users / one_time_tokens | clientes / gym_membership | mail? | idempotent retry? | truth? | retry → |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | desk `crearVentaAction` → `registrar_venta` | `vender/actions.ts:55`, `registrar_venta.sql:209` | after RPC commit | toast "No se pudo cobrar" | — | — | cliente + venta **written** | no | **yes**, by key | **NO** | replay returns original; **edits discarded** (T9-07) |
| 2 | …then `enviarInvitacion` | `invitaciones.ts:244` | after `transport.send` | recibo shows `fallo` | — | — | `invitacion_enviada_at` null | **yes** | yes (same code) | partial | 2nd identical mail (T9-09) |
| 3 | …then `marcar_invitacion_enviada` | `invitaciones.ts:248` | during | as above | — | — | stamp missing | yes | yes | partial | 2nd mail |
| 4 | ficha `REENVIAR INVITACIÓN` | `clientes/[id]/actions.ts:65` | any | button error | — | — | — | maybe | yes | yes | 2nd mail, same code |
| 5 | `/registro` `signUp` | `registro.ts:153` | GoTrue committed, hook fails | "No pudimos crear tu cuenta" | none | **user created, token rotated, `confirmation_sent_at` set** | none | **no** | **NO — destructive** | **NO** | every held link dies (T9-01) |
| 6 | send-email hook → Resend | `send-email/index.ts:115` | Resend 5xx / 429 / net | see #5 | — | token already burned | — | no | **NO** | no | 503 GoTrue will not retry (T9-02) |
| 7 | send-email hook → Resend | same | **200, then the hook crashes** | error | — | token burned | — | **yes** | no | no | duplicate mail + error. Prior P-055 stated this as a mapped-status case; re-derived: `respuestaEnvio` returns 200 only on a 2xx, so it needs a post-Resend crash, not a mapping |
| 8 | `/activar` `iniciarActivacion` leg 1 `createUser` | `activar-cuenta/index.ts:92` | after commit | GENERICO | none | **user created (pre-confirmed)** | none | no | **no — the rail changes** | **NO** | falls to `cuenta_existente` (T9-06) |
| 9 | leg 2 `generateLink` | `.../index.ts:105` | after commit | GENERICO | none | recovery token minted + orphaned | none | no | no | NO | as above |
| 10 | leg 3 `confirmarTokenHash` | `activacion.ts:124` | response lost | GENERICO | **none** | recovery token **consumed**, session created server-side | none | no | no | NO | as above; an orphan `auth.sessions` row survives |
| 11 | `/activar` `cuenta_existente` → `signInWithOtp` | `sesion.ts:185` | GoTrue 429 | **"NO SALIÓ EL CORREO"** | — | untouched | — | no | yes | partial — no wait named | fails again for ≤ 60 s (T9-03) |
| 12 | `/auth/confirm` `verifyOtp` | `sesion.ts:240` | **response lost** | `/entrar?error=token-rechazado` | **none** | **token consumed, `email_confirmed_at` set, session created** | none | — | **NO** | half-true: "ya se usó" is true, "expiró" is not (`entrar-form.tsx:31`) | resend mints a new token |
| 13 | `/auth/confirm` → `intentarReclamoConFirma` | `route.ts:84` | any | still redirected to `/reservar` | set | — | claim not written | — | **yes** — `reclamar_por_codigo` refuses a spent code (`.sql:44-51`) | **yes — never strands** | `/reservar` self-heal, or an operator |
| 14 | `/auth/confirm` → `intentarReclamoPorEmail` | `route.ts:95` | any | redirected | set | — | not written | — | **yes** — `reclamar_o_crear_cliente` re-upserts membership (`.sql:44-48`) | yes | `/reservar` retries (#16) |
| 15 | `/activar/contrasena` `completarActivacion` | `activacion.ts:161-166` | between password-set and claim | error or redirect | set | **password set** | claim missing | — | yes | yes | `/reservar` self-heals |
| 16 | `/reservar` first-render self-heal claim | `reservar/page.tsx:65` | any | `SinMembresia` | set | — | may **create** a cliente row in the HOST gym | — | yes | yes | re-fires on every load |
| 17 | `/reservar` `mi_membresia` | `agenda-miembro.ts:494` | 30-s stall | **no error boundary** → Next fallback | set | — | — | — | n/a | **NO** | manual reload |
| 18 | proxy `resolveTenant` | `resolve-tenant.ts:146` | 30-s stall | whole app hangs | untouched | — | — | — | n/a | NO | — |
| 19 | proxy `getClaims()` refresh | `proxy.ts:167-181` | throws / net cut | serves with existing cookies | **preserved** | — | — | — | yes | yes | **fail-soft — correct** |
| 20 | proxy `getClaims()` refresh | `proxy.ts:173` | `refresh_token_already_used` | signed out | **torn down** | RT consumed past the 10-s reuse interval | — | — | no | partly | re-login. Prior P-002/P-006 — **unverified this round**: I read the code, I did not reproduce a rotation race |
| 21 | señal trigger `realtime.send` | `senal_gym.sql:20` | any | nothing | — | — | **claim still commits** | — | yes | no (silent) | `visibilitychange` floor |
| 22 | Turnstile siteverify | `turnstile.ts:33` | stall / cut | action hangs, then "no eres un robot" | — | — | — | — | yes | **NO** | reload (T9-11) |

### Anti-idempotent operations — retry makes it strictly worse

Only three, and all three are on the mail rail:

1. **`signUp` after a hook failure** (#5) — each retry rotates `auth.one_time_tokens` and kills every
   link the member is still holding. This is the mechanism behind Marce's six-deep inbox and Sarahí's
   34-hour wedge.
2. **`resend({type:'signup'})` / `signInWithOtp`** (#11, and #12's retry) — same table, same rotation.
   The `/entrar` and `/registro` resend buttons are gated by `reenvio-limite`; the `/activar` one is
   not (T9-03).
3. **`iniciarActivacion` leg 1** (#8) — not destructive to data, but the retry lands on a *different
   rail* with different failure modes, which is worse than a plain failure because the member cannot
   tell the door changed.

Everything else on this path is retry-safe, and deliberately so: both claim RPCs are idempotent
(`reclamar_o_crear_cliente.sql:44-48` returns `reclamado:false` for an already-claimed row and
re-upserts membership `on conflict do nothing`; `reclamar_por_codigo.sql:44-51` takes `for update` on
an unclaimed code and refuses a spent one), `registrar_venta` is keyed, and the claim ceremony turns
every refusal into a value (`registro.ts:323-330`). **That is real engineering and it holds under the
premise.** Prior register P-046 said the same; re-derived at HEAD above.

### Fetch shield — what is bounded, what is not

| shape | bound | where |
|---|---|---|
| `GET /auth/v1/.well-known/jwks.json` | **2 500 ms** → pinned `JWKS_FALLBACK` | `fetch-shield.ts:83,123-137` |
| every other GET/HEAD (PostgREST reads) | **8 000 ms** → **one UNTIMED retry** | `:84,142-148` |
| every POST/PATCH/DELETE | **none, on purpose** | `:140` |
| `resendTransport` (invite + receipt) | **10 000 ms** `AbortSignal.timeout` | `invitaciones.ts:58` |
| send-email hook → Resend | **none** | `send-email/index.ts:115` |
| send-email hook → `gym_id_por_host` + `gym` select | **none** (Deno; shield is `server-only`) | `send-email/index.ts:53-67` |
| Turnstile siteverify | **none** | `turnstile.ts:33` |
| `activar-cuenta` edge-fn POST from the app | **none** | `activacion.ts:99` |

The unbounded POSTs are deliberate and the reasons are correct — a timed-out write may have
committed, and aborting a refresh past the 10-s reuse interval manufactures real sign-outs
(`fetch-shield.ts:30-36`). The last three rows are **not** deliberate: they are plain `fetch` calls
outside the shield's reach, and two of them sit inside a documented 5-second budget.

The residual the module names itself, re-derived: the 8-s read retry is **untimed** (`:147`), so the
worst case for a read is 8 s + however long the origin takes — which in the 2026-08-29 incident was
266 s (prior P-027/P-063, ADR-0017; not re-measured this round).

---

## 3. Answers by Q-number

### Q7 (mine) — which operations leave the system broken?

Six, ranked. **(1)** `signUp` when the hook fails (T9-01) — user and rotated token committed, mail
lost, member told the account failed, retry destroys their remaining links. **(2)** Any Resend
non-2xx (T9-02) — the 503 is not retried because it carries no `Retry-After`, so the OTP is burned
for nothing. **(3)** `/auth/confirm`'s `verifyOtp` when the response is lost (#12) — token consumed,
email confirmed, session created server-side, no cookie in the browser, member sent to a login form
that tells them the link "expiró". **(4)** `iniciarActivacion` cut after `createUser` (T9-06) — no
compensation, the rail changes permanently. **(5)** `registrar_venta` acknowledged-but-lost
(T9-07) — a corrected resubmit is silently discarded and reported as success. **(6)** Any 30-s await
anywhere (T9-04 / T9-05) — no error boundary, so it lands on Next's built-in production error page.

Everything else degrades rather than breaks, and I have named where and why (#13-16, #19, #21) — the
claim ceremony and the proxy's fail-soft refresh are the two designs carrying that weight.

### Q1 — where are the drifts? (partial-failure share)

The drift T9 owns is not a code change; it is **traffic composition**. The path was built for one
door: invite → `/activar` → fresh provision. Live, `/registro` is linked from `/entrar`
(`entrar-form.tsx:343`, per the marce triage), and the last 24 h show **21 `/signup` vs 8 `/otp`** —
self-registration is now the majority door. Every finding above is worse on that door: it is the one
that mints an `auth.users` row before any mail can fail (T9-01), the one whose retry rotates the
token, and the one that pushes members onto `cuenta_existente` — a rail with **zero** legitimate
users in the database (0 multi-gym users, measured) and one real-world data point, which failed.
"These issues were not presenting before" is consistent with that: the invite-only door does not
have T9-01 at all.

### Q3 — stressed to the top (partial-failure share)

Three ceilings, all mail: GoTrue **60 s/address**, the project auth bucket **50/hr** (P-069/P-105,
unverified this round), and Resend Free **100/day** shared across auth mail + invites + receipts +
the alert cron. The app-side defence is a per-instance `Map` that N warm lambdas multiply by N
(T9-10) and that two of five doors ignore (T9-03). Under a burst — a gym onboarding 30 members in an
afternoon, which is exactly what RED's 08-02 seed was — the failures arrive as 429s that the
`/activar` screen reports as "NO SALIÓ EL CORREO" with no wait time.

### Q4 — three months idle (partial-failure share)

`reenvio-limite`'s Map is empty on every cold start, so the throttle is a no-op for the first send of
every address — the one that matters after a quiet period. `resolve-tenant`'s 60-s TTL cache is
likewise cold, so the first request after idle pays the unbounded `gym_id_por_host` POST (T9-05,
leg 1). And `JWKS_FALLBACK` (`fetch-shield.ts:66-80`) is a key read on 2026-08-29 with a stated
rotation obligation: three idle months is exactly long enough for a key rotation to make the pin
wrong, at which point an unreachable `jwks.json` bounces **every** operator to the login form — the
module says so itself at `:61-64`.

### Q5 — corrupting your own data by hand (partial-failure share)

The one that bites: **double-tap on `/registro`**. Each submit rotates the token; the
`enEsperaReenvio` guard at `registro.ts:149` absorbs it **only** if both taps hit the same warm
instance within 5 min (T9-10). Second: **force-quit during `/auth/confirm`** — the token is consumed
by GoTrue regardless of whether the browser ever sees the redirect (#12). Third: **switching
account** — `/activar` renders `VincularForm` for whoever is signed in on the device
(`activar/page.tsx:84`), which binds the paid row to *that* session; the screen does show the
signed-in email (`:78`, #150), but on a shared family phone one tap still binds the wrong account,
and `reclamar_por_codigo` clears `claim_code` (`.sql:67`) so there is no second chance from inside
the app.

### Q6 — the one-line change that breaks a guarantee with all tests green

`packages/data/src/server/fetch-shield.ts:140`, changing

```ts
if (method !== "GET" && method !== "HEAD") return fetch(input, init);
```

to route POSTs through `withTimeout` — "completing the shield", the most natural-looking tidy-up in
the file. It mass-signs-out every operator and member: aborting a refresh past GoTrue's 10-s reuse
interval yields `refresh_token_already_used`, which the client proxy classifies as a dead session and
rides the cookie teardown (`proxy.ts:35-40,173`). The module warns about it in prose at `:30-36`, and
the only test asserts a `/rpc/registrar_venta` POST is unbounded — **the `/auth/v1/token` URL is
untested** — so `pnpm test` stays green (prior register P-012/P-039, catalog F-14; re-derived here
from the shield's own comment and its documented test coverage — I did **not** re-open
`fetch-shield.test.ts` this round).

Runner-up, same rule: `nucleo.ts:118`, `if (fila.auth_user_id !== null) return { ok: false, error:
"ya_reclamado" }`. Flipping that to allow re-activation of a claimed row passes every unit test
(`nucleo.test.ts` is pure) and hands an invite code the power to re-provision a live account.

---

## 4. Keep-verdicts (each with a digit-bearing exit trigger)

| keep | exit trigger |
|---|---|
| **The unbounded-POST policy in `fetch-shield.ts`** — the two reasons are correct and the measured numbers support it (`/token` avg 161 ms, max 393 ms over 143 calls in 24 h). | Exit when `/token` p99 exceeds **5 000 ms** over ≥ **200** calls in a 24-h window, or when any single `POST /auth/v1/token` exceeds **30 000 ms**. Then bound it and accept the sign-outs. |
| **The claim ceremony (`intentarReclamo*`) swallowing refusals** — the design that keeps a verified member from stranding; it holds under every cut in §2. | Exit when more than **3** members in any 30-day window reach `/reservar` with `SinMembresia` and stay there. Today **4** of **61** auth users have no membership — measure how many are real members vs test rows before acting. |
| **`realtime.send`'s blanket `EXCEPTION WHEN OTHERS`** — a broadcast must never roll back a claim. | Exit when a **1**-in-N sampled `senal_gym` failure is needed for diagnosis; then add a counter table, never a re-raise. |
| **`resendTransport`'s 10-s abort with no retry** (`invitaciones.ts:58,71-73`) — a retry on the sale critical path could turn a committed sale into a stuck spinner. | Exit when invite `motivo:"envio-fallido"` exceeds **5** per **100** sales, measured over ≥ **100** sales. |
| **`marcar_invitacion_enviada` after the send, unstamped on failure** (T9-09). | Exit at **2** duplicate-invite complaints from one gym in a month. RED currently has **8** invitable-but-unactivated clientes, so this is under the noise floor. |
| **The `send-email` hook's fail-closed 400 on a bad `redirect_to`** (`index.ts:106-111`) — the #217 cross-tenant guard, and it works. | Exit **undecided** — the open question is whether the Playwright host belongs in the Auth Redirect-URL allow-list so `pnpm test:e2e` stops manufacturing `500: Invalid payload sent to hook` noise (**6** occurrences in 24 h). **The owner must answer**: it is a dashboard setting this repo cannot hold. |

---

## 5. Could not determine — and the experiment that settles each

| question | experiment |
|---|---|
| What is the actual function timeout that kills a 30-s await? (Hobby 10 s vs Pro 15 s vs a Fluid default — the repo sets none.) | Read the Vercel plan for both projects, then deploy a preview route that `await new Promise(r => setTimeout(r, 30000))` and record the status and elapsed time. |
| Does the 8-s read retry's **untimed** second attempt actually cost ~266 s under a stall, at HEAD? | In a preview deploy, point PostgREST at a TCP black hole via a proxy that accepts and never answers; time `GET /reservar` end to end. |
| Is the project auth-mail bucket still 50/hr? | Read the Supabase dashboard Auth rate-limit page. Not queryable via MCP; `supabase/config.toml:199` says `email_sent = 2`, which is the LOCAL dev value, not the live one. |
| Does GoTrue emit `email_action_type: "magiclink"` for `signInWithOtp` against a **confirmed** account — making `bloqueCodigo` return null (`correo.ts:91`) and leaving that cohort with no 6-digit fallback and a "Continúa en tu cuenta" subject? | Confirm a scratch account, call `signInWithOtp` against it, read the hook payload. Live evidence is absent because **0 multi-gym users exist** — the cohort has never occurred. Marce's magic links were `signup`-typed (she was unconfirmed), so they DID carry the code. |
| Do Next's `cookies().set()` mutations inside `/auth/confirm` survive the freshly-built `NextResponse.redirect` at `route.ts:103`? | It demonstrably works (Marce's `/verify` at 16:31:48Z produced a live session) — but confirm the contract in `node_modules/next/dist/docs` before anyone refactors that redirect. |
| How long does `crearVentaAction` actually take end to end (RPC + two mails in `Promise.all`)? | Vercel function logs for `/vender`, p50/p99 over a week. Not reachable from here. |

---

## 6. Blind spots — what I did not examine

- **`apps/mobile/`** — untracked at session start, explicitly out of the task's scope.
- **`fetch-shield.test.ts`, `proxy.test.ts`, `route.test.ts` bodies.** I read the shield's own comment
  about what its test asserts and did not open the test to confirm the coverage gap in Q6. Tagged.
- **The Vercel dashboard**: plan, `maxDuration` default, function logs, cron arming. Everything I say
  about the platform timeout is therefore unmeasured.
- **The Supabase Auth dashboard**: rate limits, the Redirect-URL allow-list, the Send Email Hook
  toggle. `supabase/config.toml` is the local-dev file, not live config.
- **`pnpm test`, `pnpm test:denial`, `pnpm test:e2e` were not run.** No verdict here rests on a green
  gate.
- **The admin app's own partial-failure surface** beyond `crearVentaAction` and
  `reenviarInvitacionAction` — the roster, `/asistencia`, `pasar_lista_sesion`, the alert cron.
- **Realtime capacity** (concurrent channels, message throughput). I only proved the trigger's failure
  is swallowed and that today's partitions exist.
- **The browser side of a half-failed action.** I read the forms' dispatch and error branches but ran
  no browser; "what a member actually sees when the action rejects" is inferred from the absent
  `error.tsx` plus Next's documented contract, not observed.
- **Resend's account state** (bounce rate, daily usage against the 100/day cap). The API key was not
  used this round.

---

## 7. Draft audit — sentences cut or retagged

| cut / retagged | rule that caught it |
|---|---|
| Draft said "the 503 will be retried three times, so a Resend blip is absorbed" — cut and inverted after reading the primary doc, which requires a non-empty `Retry-After` this hook never sets. | Rule 5 (cite or drop) — the reassurance was unsourced, and the source refuted it. |
| Draft said "GoTrue rolls back the signup when the hook fails, so nothing is lost" — deleted. The `del@resend.dev` row proves the opposite on this project's own data. | Rule 4 (the incumbent is a candidate) + Rule 7 (never invent a reassurance). |
| Draft ranked "`cuenta_existente` is a well-trodden rail for multi-gym members" as a mitigating factor — retagged after the census returned **0** multi-gym users. It is now the aggravating factor in T9-06. | Rule 4 — "it's the standard fallback" survives the substitution test and is not evidence; the count is. |
| Draft asserted "Vercel kills the function at 10 s" — retagged to "unmeasured — read the plan, then time a 30-s route". | Rule 2 (name the number) + Rule 5. |
| Draft claimed the magic-link mail has no 6-digit fallback **for Marce** — corrected: her links were `signup`-typed (she was unconfirmed), so they DID carry the code. The gap is real only for a confirmed account, and that cohort is empty today. Demoted from a finding to a could-not-determine row. | Rule 7 — a criticism you cannot support is cut exactly like an unsupported reassurance. |
| Draft claimed "`/reservar` materializes the week on a member render, so a stalled write hangs the first load" — cut. `agenda-miembro.ts:37,321` states the member reader never materializes, and `ensureSemanaMaterializada` lives only in `agenda.ts` (admin, `:304-310`). | Rule 5 — the claim did not survive reading the code. |
| Draft listed "optimistic UI on the new-user path" as a risk — cut. Every door dispatches through `useActionState` with a `pending` flag; there is no optimistic write on this path. The optimistic flip that exists (`pasar-lista`, commit `0994b843`) is the admin desk. | Rule 7. |
| Draft asserted prior-register rows P-002/P-006 (refresh consume-not-deliver) as verified — retagged "unverified this round"; I read the code but reproduced no rotation race. | Rule 5 + the reuse rule (never present a prior finding as newly verified). |
| Draft called the señal trigger "a partial-failure hazard on the claim" — inverted to an M2 soundness row after reading `realtime.send`'s body live: it swallows everything, so it cannot roll back the claim. | Rule 7 (honesty outranks severity — say so where it is sound, with evidence, then rank it anyway). |
