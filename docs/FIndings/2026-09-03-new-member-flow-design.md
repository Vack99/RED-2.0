# New-member flow — measured state machine, prior art, and the simplest fix

DESIGN seat, 2026-09-03. HEAD `6937aa7e`. Live `hjppxawglmukfvsgmcog`, SELECT-only; emails masked.
Inputs: owner's report ("first instinct is to make the account in the booking site"), today's hand-link
by SQL, `docs/FIndings/2026-09-02-new-user-VERDICT.md` §1–§4, `2026-09-02-marce-triage.md` §2.
Nothing was written. Every number is either cited to a query re-run here or tagged **unmeasured**.

---

## 1. MEASURE — the doors at HEAD

### 1.1 State vector

For one person, one email `e`, one gym `G`:

| axis | values |
|---|---|
| **A** `auth.users` for `e` | `∅` · `unconfirmed` · `confirmed` |
| **C** `clientes` row in `G` matching `e` | `∅` · `unclaimed(email set)` · `unclaimed(email null)` · `claimed` |
| **L** `clientes.auth_user_id` | `null` · `= A.id` |
| **K** `clientes.claim_code` | `null` · armed (8 chars, `preparar_invitacion.sql:30-44`) |
| **M** `gym_membership(A.id, G)` | absent · present |

The intended terminal state is `(confirmed, claimed, =A, null, present)`. Everything below is about
which doors can reach it and which cannot.

### 1.2 Doors (8 surfaces + the desk)

| # | Door | File | Mails it can send | Session mint | Claim RPC |
|---|---|---|---|---|---|
| D0 | Desk sale + invite | `packages/data/src/server/invitaciones.ts:215` | **1** Resend invite (not GoTrue, not throttled) | – | `preparar_invitacion` + `marcar_invitacion_enviada` |
| D1 | `/registro` self-signup | `apps/client/src/app/registro/actions.ts:34` | 1 GoTrue "Confirma tu cuenta" | later, at D6 | – |
| D2 | `/registro` resend | `registro/actions.ts:92` | 1 (same rail, rotates the token) | – | – |
| D3 | `/entrar` password login | `entrar/actions.ts:23` | 0 | **yes** | **none — see M1** |
| D4 | `/entrar` resend / reset | `entrar/actions.ts:50,79` | 1 each | – | – |
| D5 | `/activar` invite code | `activar/actions.ts:45` → `activacion.ts:77` → edge `activar-cuenta` | **0** (createUser `email_confirm:true` + generateLink consumed server-side) | **yes, in-request** | `reclamar_por_codigo` at `activacion.ts:166` |
| D5b | `/activar` → `cuenta_existente` | `activar/actions.ts:80-95` | 1 magic link | – | – |
| D5c | `/activar` with a live session (VINCULAR) | `activar/actions.ts:115` | 0 | – | `reclamar_por_codigo` at `:137` |
| D6 | `/auth/confirm` link landing | `apps/client/src/app/auth/confirm/route.ts:106` | 0 | **yes** | `reclamar_por_codigo` (`:84`) **or** `reclamar_o_crear_cliente` (`:95`) |
| D7 | `/codigo` 6-digit OTP | `codigo/actions.ts:27` | 0 | **yes** | **none — see M2** |
| D8 | `/reservar`, `/saldo` self-heal | `reservar/page.tsx:65`, `saldo/page.tsx:41` | 0 | – | `reclamar_o_crear_cliente`, gated |

**Counts.** 5 doors mint a session (D3, D5, D6, D7, and D5's contrasena continuation). **6 GoTrue-mail
call sites**: `signUp` (`registro.ts:132`), `reenviarConfirmacion` ×2 actions, `solicitarReset`,
`enviarMagicLink` — of which only 3 sit behind `permitirReenvio` (`reenvio-limite.ts:69`);
`solicitarReset` and `enviarMagicLink` are **ungated** (verdict §2 Q1-2, re-confirmed by grep at HEAD).
Plus 1 Resend invite and 1 Resend recibo from the desk. **RPCs per path**: invite-only = 3
(`invitacion_info`, `preparar_invitacion`, `reclamar_por_codigo`); self-register = 1
(`reclamar_o_crear_cliente`). **Mails per member**: invite-only path = **1**; the measured platform
average is **2.9** (verdict R2-R2 §4); Marce's actual was 1 invite + 6 "Confirma tu cuenta".

### 1.3 The five transitions that write `L` (the link)

| T | Trigger | Site | Preconditions that can silently fail |
|---|---|---|---|
| T1 | plain-signup confirm | `route.ts:95` `intentarReclamoPorEmail` | **only if `next` is absent** (`:85`); host must resolve a tenant; **exactly one** unclaimed `lower(email)` match in `G` (`reclamar_o_crear_cliente.sql:50-53`) |
| T2 | visiting `/reservar` or `/saldo` | `reservar/page.tsx:65`, `saldo/page.tsx:41` | **only if `getEsMiembro()` is false** — and that read is **gym-blind** (below) |
| T3 | set-password after `/activar` | `activacion.ts:166` | needs a live recovery session and a live code |
| T4 | VINCULAR one-click | `activar/actions.ts:137` | needs a live session on the same device |
| T5 | magic-link rescue landing | `route.ts:84` | needs `codigo`+`firma` on the URL |

**Defect found while measuring — `getEsMiembro` has no gym filter:**

```ts
// packages/data/src/server/agenda-miembro.ts:139-143
const { data } = await supabase.from("gym_membership").select("gym_id").limit(1).maybeSingle();
return data != null;
```

RLS scopes it to the caller's own rows **across every gym**. A member with a membership anywhere reads
`true`, so the T2 self-heal — the only retry the product has — **never runs for a second gym**. Same
family as the multi-gym RPC roulette already on record.

### 1.4 MISSING transitions

| M | Missing edge | Evidence |
|---|---|---|
| **M1** | **login → claim-by-email.** `entrarAction` mints a session and claims nothing (`entrar/actions.ts:23-46`); the only retry is T2, gated on the gym-blind read above. | code |
| **M2** | **`/codigo` → claim.** `codigo/actions.ts:14-17` says so in prose: it delegates to T2 and inherits its gate. | code |
| **M3** | **recovery / any `next`-bearing mint → claim.** `route.ts:85` `else if (!next)` skips the claim whenever a `next` is present. A reset-first member is never claimed on that mint. | code |
| **M4** | **`/registro` → invite-code claim.** Deliberately removed ("H2v2 option b", `registro/actions.ts:54-55`). The self-register rail can bind only by email match — never by code. | code |
| **M5** | **`/activar` + existing account → "inicia sesión".** No such state exists. The sole branch is a magic-link mail (`activar/actions.ts:80-95`) → the 60 s window → 429 → `cuentaExistenteFallo` → a reload button that re-enters the window (`activar-form.tsx:145-166`). | 2 × 429, 09-01 19:25:17Z / 19:25:27Z, the only account in the window (triage §2) |
| **M6** | **"no match" is not an outcome.** `reclamar_o_crear_cliente` falls through to `INSERT` when `v_n ≠ 1` (`.sql:74-86`) with `clases_restantes 0`. A twin is created silently and `reclamado:false` is indistinguishable from "already mine". | SQL |
| **M7** | **desk → "that email already has an account".** `preparar_invitacion.sql:26` refuses only a *claimed* row; it cannot see `auth.users`. The desk cheerfully mails an `/activar` invite to an address guaranteed to land on M5. | SQL |
| **M8** | **unlink / merge.** No RPC clears `auth_user_id`; no twin-row merge. Today's repair was hand SQL. | live, §1.5 |
| **M9** | **`reclamar_por_codigo` overwrites `email` unconditionally** (`.sql:60-68`) — the VINCULAR takeover of row #2. | SQL |
| **M10** | **nobody is told.** `registros_atorados()` has mailed 0 alerts in 196 Resend mails (verdict §2 Q1-4). | carried |

### 1.5 The 09-03 hand-link, read live

`Iván Montañez`, gym `red`:

| fact | value |
|---|---|
| `auth.users.created_at` | `2026-08-29 13:43:32Z`; `raw_user_meta_data` carries `phone_e164` → **`/registro` shape** |
| `clientes.created_at` | `2026-08-29 20:48:22Z` — the **desk sale landed 7 h AFTER his signup**; 1 venta |
| `email_confirmed_at` | `2026-08-30 23:33:39Z` |
| `md5(lower(email))` cliente vs auth | **identical** — no typo; exactly 1 row with that email in the gym |
| `last_sign_in_at` | **null** — he has never logged in, not once, in 5 days |
| `gym_membership.created_at` | `2026-09-03 01:21:42Z`, `terms_accepted_at`/`privacy_accepted_at` **null** → written by hand SQL, not by any RPC |

So: the only claim opportunity he ever had was T1 at confirm time, and it did not take (the auth log
window is 24 h and 08-30 is gone, so **why is unmeasurable** — candidates: a `next` on the URL (M3), an
unmapped host, or the two-RED-hosts cookie-jar split of `95583ac9`). He then never reached `/reservar`
with a session, so T2 never fired either. **The link failed on a row whose email matched perfectly.**
That is the shape of the problem: the claim is bolted to one moment, and a miss is permanent and silent.

### 1.6 Population, re-run 2026-09-03

| gym | claimed | unclaimed w/ email | unclaimed, **no email** | armed codes |
|---|---|---|---|---|
| red | 44 | 8 | 15 | 16 |
| forge | 2 | 4 | **44** | 28 |
| red-demo | 6 | 26 | 11 | 17 |
| forge-demo | 1 | 2 | 21 | 6 |

`auth.users` = 63; **5 unconfirmed**; 10 with no `clientes` row. Of those 10, **4 are real people with
`/registro` metadata who never confirmed**: `mar***@gmail.com` (09-02 21:28Z), `die***@hotmail.com`
(09-02 18:35Z), `pau***@hotmail.com` (08-24), `jes***@hotmail.com` (08-13) — two from today.

**4 rows sit unclaimed while a confirmed `auth.users` row with the identical email exists** (2
forge-demo, 1 red = the owner's own, 1 red-demo) — M1/M2/M3 made visible, though all four are
test/owner rows.

**Twins: 3 candidates, 0 confirmed.** Claimed rows with zero ventas = red 2, red-demo 1; joining them
back to a paid row in the same gym on last-10-digit phone **or** first name returns **[]**. The
desk-typo twin class is structurally live (M6) but has **no measured instance** — do not price it as
observed.

---

## 2. OWN PRIOR ART — what already works, defended honestly

1. **The invite rail is the good one and it is nearly free.** `/activar` → `activar-cuenta` mints the
   user with `email_confirm:true` and hands back a recovery `token_hash` consumed in the same request
   (`activacion.ts:99-125`). **Zero mails, zero round trips, no throttle, no stale-link class.** The
   member's whole journey is: open the desk's one invite mail → type your email → set a password → in.
   That is the design's best idea and nothing here proposes touching it.
2. **`reclamar_o_crear_cliente` already claims by `lower(email)`** (`.sql:50-56`, the `v_n = 1` arm) with
   `for update`, an `auth_user_id is null` re-check inside the UPDATE, and an `email_confirmed_at` gate
   (`:34`). The *matching logic* is correct. What is missing is **when it runs**, not what it does.
3. **`/registro` works for most people.** 20 of 30 signups since 08-10 confirmed within 10 min (verdict
   §1). It is also the only door a walk-in with no desk row can use. Keeping it is right; the verdict's
   §4 KEEP stands.
4. **The claim ceremony is already centralised.** `intentarReclamo*` (`registro.ts:308-378`) makes a
   refusal a value, so no door strands an authenticated member. Both RPCs are idempotent. Adding claim
   sites is cheap *because* this exists.
5. **The three-outcome `/registro` screens** (`success` / `cuentaExistente` / `yaEnviado`,
   `registro/actions.ts:71-74`) already refuse to collapse into one "Revisa tu correo". The
   "Ya tienes una cuenta" screen the alternative below would need **already exists**
   (`registro-form.tsx:197`).
6. **`firmaCodigo` / `firmaTenant`** close the direct-PostgREST and appended-`&codigo=` holes. Any
   redesign must keep them; both candidates do.
7. **`permitirReenvio`** is one counter across three doors, best-effort by construction and honest about
   it (`reenvio-limite.ts:22-30`).

The incumbent's real failure is narrower than "the flow is wrong": **the claim runs at one moment, and
the two doors that mint a session without passing that moment (login, `/codigo`) delegate to a retry
whose gate is broken.**

---

## 3. CANDIDATE A — "one key, claim on every mint"

**Rule:** the identity key is the **verified email**. The desk records it. The member's only instruction
is *"crea tu cuenta / entra con ESTE correo."* Every session mint runs an idempotent claim for the
current gym. `/activar` on an existing account says **"inicia sesión"** and sends nothing.

Six edits, four of them deletions.

**A1 — one line: give `getEsMiembro` the gym.**
`packages/data/src/server/agenda-miembro.ts:141` → add `.eq("gym_id", gymId)` (both call sites already
resolved the tenant). This alone turns T2 from "runs once, for your first gym only" into "runs on every
visit until this gym's row is linked", which closes **M1** and **M2** for everyone who logs in — since
`entrarAction` redirects to exactly those two pages.
*+2 lines.*

**A2 — one deletion: drop the `!next` guard.**
`auth/confirm/route.ts:85` `} else if (!next) {` → `} else {`. A recovery or `next`-bearing mint now
claims too (**M3**). The comment's worry ("a plain password reset must not claim a membership") is
answered by A3 and by the fact that the caller is an inbox-proven owner of the address.
*−1 line.*

**A3 — `p_crear boolean default true` on `reclamar_o_crear_cliente`; the self-heal call sites pass
`false`.** The only migration. It makes **M6** an explicit outcome: `/registro`'s own confirm (T1) may
still create a walk-in row, but a *self-heal* claim in a gym that never sold you anything writes nothing
instead of minting a phantom 0-class row. It is also the guard that makes A1 safe (§5 BP2).
*+5 lines SQL, +2 TS, 1 migration, 1 denial vector.*

**A4 — delete the magic-link rescue rail; `/activar` + existing account → "inicia sesión".**
Replace `activar/actions.ts:80-95` with a bare `return { status: "cuentaExistente" }` that sends
nothing, and change the screen (`activar-form.tsx:130-143`) to:

> **Ya tienes una cuenta con este correo.** Entra con tu contraseña — al entrar, tu paquete se vincula
> solo. Si nunca confirmaste tu correo, abre el correo *"Confirma tu cuenta"* más reciente.
> [ INICIAR SESIÓN ]

linking to `/entrar?next=/activar%3Fcodigo=…`, because after login the member lands back on
`/activar?codigo=` where **`VincularForm` already exists** and binds in one click (D5c). Then delete:

- `enviarMagicLink` (`sesion.ts:179-202`) — its only caller is gone; **−24**
- the `cuentaExistenteFallo` state + screen (`activar/actions.ts:40,94`; `activar-form.tsx:145-166`); **−24**
- the `codigo`+`firma` arm of `/auth/confirm` (`route.ts:72-84`) and `intentarReclamoConFirma`
  (`registro.ts:344-362`) — the *only* legit caller of the URL-borne firma was that magic link
  (`route.ts:76-79` says so); **−28**, and it removes an unverified-input path from the confirm route.

This kills **M5**, the 429 loop, the second identical mail, and one whole security surface.
*≈ −80 lines, +12.*

**A5 — put the address in the invite mail body.**
`mensajeInvitacion` already has `email` in scope (`invitaciones.ts:150-160`): one sentence,
*"Crea tu cuenta o entra con este correo: **{email}**."* This is the whole "the member's only
instruction" idea, and it does **not** re-introduce the `&correo=` URL param that was cut on purpose
(`invitaciones.ts:236-240` — a claim code plus a plaintext address in one URL outlives the code).
*+2 lines.*

**A6 — refuse the email overwrite in `reclamar_por_codigo`** (`.sql:60-68`): raise when the row's
`email` is non-null and differs from the verified one. Verdict fix #4 unchanged; closes **M9** (VINCULAR
takeover of row #2) and flips one existing denial assertion.
*+3 lines SQL, same migration as A3.*

**Net: ≈ −80 / +26 lines, one migration, two denial-suite edits.** No new module, no new abstraction, no
new door, no new mail rail.

### 3.1 Against the measured state machine

| | effect |
|---|---|
| **adds** | claim edges at login and `/codigo` (via A1, reusing T2), at recovery mints (A2), and a refusal outcome (A3) |
| **removes** | door D5b entirely; transition T5; one unverified-firma input path |
| **closes** | FC-a self-register-first (no rail flip: `/activar` now routes to login), FC-b 429 loop, FC-d unlinked-after-login, FC-g takeover |
| **partly closes** | FC-c identical mails — the invite rail stops adding one, but the `/registro` stack is untouched; that needs verdict fix #2 (send time in the subject) |
| **does NOT close** | **FC-e desk typo → twin.** If the desk typed `ivan@gmial.com` and the member owns `ivan@gmail.com`, no amount of claim-on-mint helps: `/activar` answers `email_no_coincide` (`nucleo.ts:121`) and `/registro` creates a walk-in row. **This stays a desk edit**, and the honest ask is a "corregir correo y reenviar" control on the roster row — not a matching heuristic. |
| **does NOT close** | **FC-f wedged invites nobody notices** — that is the cron heartbeat (verdict fixes #3/#7), unrelated to flow shape |
| **does NOT close** | Iván's exact miss, *if* its cause was the two-host cookie split (`95583ac9`) — A1 makes it recoverable on his next login rather than preventing it |

---

## 4. ALTERNATIVE B — the desk pre-creates the auth user

`admin.createUser` + `inviteUserByEmail` at sale time (necessarily inside the `activar-cuenta` edge
function, since neither app holds a service-role client — ADR/#126). One `auth.users` row per member,
ever. `/registro` on an invited address hits GoTrue's already-registered answer and renders the
**existing** "Ya tienes una cuenta" screen (`registro-form.tsx:197`) with no new code. The GoTrue invite
link lands on `/auth/confirm` → set password → claimed.

Genuinely attractive on paper — one account, one mail, one link, and the self-register-first conflict
becomes structurally impossible. Four things sink it:

1. **It hands the desk an account-minting primitive.** A one-character typo now mails a *live login link
   to a real paid membership* into a stranger's inbox. The `cuenta_existente` branch this design deletes
   exists precisely to refuse that (`activar/actions.ts:28-31`: "provisioning a session for a
   pre-existing account with no inbox proof would let a hostile operator take it over"). B inverts that
   ruling without an owner decision.
2. **The big deletion does not land.** **91 `clientes` rows platform-wide have no email at all** (forge
   44 of 50, red 15) — there is nothing to invite. The `/activar` code rail, `activar-cuenta` and
   `activacion.ts` all have to survive for them, so B pays a full add (~120 lines of edge + sale-path
   wiring, plus a backfill for 67 armed codes) and deletes almost nothing.
3. **It moves mail onto the money path.** A sale can now be delayed or fail on GoTrue, and the shared
   50/hr auth bucket + GoTrue's 30-new-users/hour get spent in the desk's busiest minute rather than at
   the members' leisure. A 20-member seed day (one is on record) becomes 20 new users in ~10 minutes.
4. **Two rails still coexist** through and after migration: 14 already-invited-but-unclaimed rows and 63
   existing `auth.users` have to be reconciled by hand or by a backfill nobody can test against live.

---

## 5. RANKING

Incumbent **C** = HEAD + verdict fix #1 (a wait state on the 429).

| axis | **A — claim on every mint** | **B — desk pre-creates** | **C — incumbent + fix #1** |
|---|---|---|---|
| failure classes closed (of a–g) | **a, b, d, g** (4) + partial c | a, b, c, d (4) — but **opens a new takeover class** | b only (the loop becomes a wait screen); a, c, d, e, f, g stay |
| mails per member | invite path **1**, self-register **1** — the 2nd mail of the conflict path is deleted | **1** (GoTrue invite replaces the Resend one) or 2 if the branded invite is kept | 2–3 on the conflict path (measured avg 2.9) |
| code deleted vs added | **≈ −80 / +26**, one migration | ≈ −40 / +150 plus an edge-function rewrite | −0 / +35 |
| migration needed | **1** (`p_crear` + the `reclamar_por_codigo` email guard) | 0 DDL, but a **data backfill** over 63 users / 67 armed codes | 0 |
| security — what must be verified before a claim | unchanged: `email_confirmed_at` (`.sql:34`) + tenant firma; A **removes** the URL-borne-firma path | **weakened**: a desk operator's typed string becomes an account + a login link, with no inbox proof | unchanged |
| multi-gym behaviour | **fixed** — the gym-blind `getEsMiembro` is the one-line root of it; A3 stops a phantom row in gym B | unchanged (per-gym invites still work) | **broken** — a member of gym A never self-heals in gym B |
| reversibility | every piece is a small diff; A4 is the only one-way door (reverting restores a rail with a live incident) | one-way: minted accounts cannot be un-minted | trivially reversible |

**Rank: A > C > B.** A is also the only option that is *smaller* than what it replaces.

---

## 6. BREAKING POINTS + EXIT TRIGGERS

### A — claim on every mint

- **BP1 — it still needs the member to arrive.** A1/A2 fire on a session mint, and Iván went 5 days with
  `last_sign_in_at = null`. A member who confirms and closes the tab is still unlinked; A makes the next
  login fix it, it does not fix an absent member. **Exit trigger:** any *real* member with a confirmed
  `auth.users` row and a same-email unclaimed `clientes` row older than 48 h — today **4 rows, all
  test/owner**; trip on the first real one.
- **BP2 — A1 without A3 mints phantom rows.** Once `getEsMiembro` is per-gym, a member of gym A who
  opens gym B's host runs `reclamar_o_crear_cliente` there, and its create arm would insert a 0-class
  row in gym B (it needs `phone_e164` metadata, which every `/registro` user has). A3's `p_crear=false`
  is therefore **not optional** — ship them together or not at all. **Exit trigger:** any `clientes` row
  with 0 ventas whose owner already holds a membership in another gym; today **0** (measured).
- **BP3 — A4's login redirect is a two-step for an unconfirmed self-registrant.** Marce's exact sequence
  ends at "abre el correo más reciente" instead of a fresh mail. Honest, sends nothing, but it is one
  more thing to read. **Exit trigger:** more than 2 members in 30 days who reach `/activar`, are told to
  log in, and have no confirmed address — **unmeasured; needs one counter** (a `console.warn` on that
  branch, the only sink the repo has).
- **BP4 — why T1 missed for Iván is still unknown.** If the cause is the two-RED-hosts cookie split, A
  recovers it on the next login but does not prevent it. **Experiment:** one structured line per claim
  attempt (`{event:"reclamo", rail, ok, motivo}`) for 30 days; the current sink is `console.warn` inside
  Vercel's 24 h window, so this needs the owner's decision on a log drain.
- **BP5 — A4 is the one irreversible piece.** Deleting `enviarMagicLink` and T5 removes the only rescue
  for a member who has an account, forgot the password, and whose reset mail is throttled. The reset
  rail still exists (`solicitarReset`) and is **ungated**, so it is not a dead end — but that also means
  the 60 s window can still bite there. **Exit trigger:** `/entrar` reset requests above 3 per member per
  day, or any `over_email_send_rate_limit` on `/recover` — today **0** in the 24 h window.

### B — desk pre-creates

- **BP1 — one typo mails a stranger a live login link to a paid membership.** Occurrence = the same
  unmeasured typo rate as FC-e; damage is full account takeover, not a duplicate row. **Exit trigger:
  one.**
- **BP2 — the sale path now depends on GoTrue.** **Exit trigger:** any `registrar_venta` blocked by an
  auth outage = 1 → revert.
- **BP3 — mail concentrates at the desk's peak.** GoTrue's 30-new-users/hour becomes the binder before
  Resend's daily cap. Measured peak is 37 mails/day; a 21-invite seed wave is on record (verdict §1).
  **Exit trigger:** any hour above 25 new `auth.users`.
- **BP4 — the deletion never lands** while 91 email-less rows exist. **Exit trigger:** if the email-less
  share ever falls below ~10% platform-wide (today **56%** — 91 of 184 rows), B is worth re-costing.

### C — incumbent + fix #1

- **BP1 — the conflict path is unchanged**, only better-worded: a self-registrant who taps the invite
  inside 60 s waits instead of looping. 2 of 2 members hit this on 09-01. **Exit trigger** (from the
  verdict, unchanged): 3 members in 30 days reaching the wait state.
- **BP2 — the multi-gym self-heal stays dead** (`agenda-miembro.ts:141`). **Exit trigger:** the first
  member sold a package in a second gym who reports "no aparece mi paquete" — **unmeasured**; RED and
  forge share no members today.
- **BP3 — every future miss is repaired by hand SQL**, as Iván's was (`terms_accepted_at` null is the
  fingerprint). **Exit trigger:** a second hand-link in 30 days. **Today: 1.**

---

## 7. Not established

1. **Why T1 missed for Iván** — the auth log window is 24 h and 08-30 is gone. Needs BP4's log line.
2. **The desk-typo rate** — the twin join returns [] today; occurrence is unmeasured, so FC-e must not be
   priced as observed.
3. **Whether members act on the invite mail's address instruction** (A5) — unmeasured; the instrument is
   the `email_no_coincide` count at `/activar`, today 0 of 6 in 24 h (verdict §4).
4. **Whether A4's "inicia sesión" screen converts** — unmeasured, needs BP3's counter.
