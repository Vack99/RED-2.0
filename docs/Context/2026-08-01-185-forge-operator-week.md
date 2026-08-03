# The Forge operator's real week, measured from their own rows

**Ticket:** [#185](https://github.com/Vack99/RED-2.0/issues/185) · **Map:** [#180](https://github.com/Vack99/RED-2.0/issues/180)
**Method:** read-only `SELECT` against LIVE production via Supabase MCP, 2026-08-02.
**Reference date for every "current" figure below: `2026-08-02`.**

This ticket asks nobody anything. `forge` is the only gym in the database with a real
human operator, and this document reconstructs that person's working week from the rows
they leave behind.

Every statistic carries its `n`. Where `n` is small it is called small. Where the schema
cannot answer the question, that is stated instead of proxied.

---

## GATE 0 — is `forge` organic? **YES. Verdict: ORGANIC. Proceed.**

`forge`'s transactional rows are human-generated. Six independent tests agree, and the
known-seeded gyms in the same database fail the same tests loudly.

### Test 1 — burst fingerprint (`created_at` collisions)

A seed writes rows in a tight loop; a human cannot. Rows sharing a single wall-clock second:

| gym | table | rows | distinct seconds | max rows in one second | % rows sharing a second |
|---|---|---:|---:|---:|---:|
| **forge** | **asistencias** | **339** | **335** | **2** | **2.4%** |
| **forge** | **ventas** | **41** | **41** | **1** | **0.0%** |
| red-demo | asistencias | 358 | 132 | 8 | 88.5% |
| red | ventas | 31 | 22 | 5 | 48.4% |
| forge-demo | asistencias | 72 | 61 | 5 | 26.4% |

`forge` is the only gym whose rows essentially never collide. `red-demo` writes 8 rows in
one second and shares a second with 88.5% of its rows — that is the seed fingerprint in
this database, and `forge` does not have it.

### Test 2 — spread across calendar days

| gym | table | rows | distinct create-days | span | rows/day |
|---|---|---:|---:|---|---:|
| **forge** | **asistencias** | **339** | **44** | **2026-06-09 → 2026-08-01** | **7.7** |
| **forge** | **ventas** | **41** | **21** | 2026-06-09 → 2026-07-30 | 2.0 |

44 active days inside a 54-day span — the gym is touched on **81% of all calendar days**.
The largest single day is 19 rows. There is no bulk-load day anywhere in the series.

### Test 3 — does `created_at` track `fecha`? (recorded live, or backfilled?)

| gym | rows | created same day as `fecha` | avg lag |
|---|---:|---:|---:|
| **forge** | **339** | **328 (96.8%)** | **0.1 d** |
| forge-demo | 72 | 51 (70.8%) | 1.3 d (range −4 … +30) |

**41 of 44 forge create-days contain exactly one distinct `fecha`** — each day's batch
records that same day's attendance. This is a live register, not a backfill.

### Test 4 — hour-of-day of row creation

`forge` asistencias peak at **18:00 (n=87)** and **20:00 (n=62)**, with a secondary
morning bump at 08:00–10:00 and an afternoon one at 13:00–15:00. That is a class
timetable. By contrast `red-demo` puts **132 of 358 rows in hour 07** alone — one dev
sitting.

### Test 5 — the pasa-lista signature repeats 44 times

Median burst duration is **103 seconds** (n=44 days); 24 of 44 days are a single sitting
under 5 minutes, 17 are spread over more than an hour (multiple classes). Example:
2026-07-29 wrote 17 rows between 21:25:15 and 21:26:00 — 45 seconds, one class register.
A seed does this once. `forge` does it 44 times, always at class-adjacent hours, always
for that day's date.

### Test 6 — a real human owns it

`forge`'s owner is `nahumtrevizo2@gmail.com` — a real consumer mailbox, not
`demo@red-demo.test` (red-demo) or the developer's own `forge-1.0@outlook.com`
(forge-demo).

### One caveat, dismissed

`gym.created_at` is **2026-07-02 15:53:25.958059+00 for both `forge` and `red` — the same
instant to the microsecond.** That column is a backfilled migration default and is not
evidence about either gym. It does not affect the verdict, which rests on the
transactional tables.

> **GATE 0 VERDICT: `forge` is organic. Persona reasoning on #186 and #187 may rest on it.**
> Sample-size caution still applies everywhere below — organic is not the same as large.

---

## Q1 — Cadence: when is this person at the desk?

**The gym runs Monday–Saturday. There is not one Sunday attendance row in the entire
history (n=339).**

Attendance by day of week (n=325 live rows, 44 distinct days):

| day | asistencias | days observed | avg/day |
|---|---:|---:|---:|
| Monday | 66 | 7 | 9.4 |
| Tuesday | 69 | 8 | 8.6 |
| **Wednesday** | **76** | 7 | **10.9** |
| Thursday | 58 | 7 | 8.3 |
| Friday | 37 | 7 | 5.3 |
| Saturday | 19 | 8 | 2.4 |
| Sunday | **0** | **0** | — |

Attendance decays monotonically from midweek to Saturday — Saturday runs at 22% of
Wednesday's volume.

**Visit hours** (`asistencias.hora`, n=317 with a time): a large evening block at
**18:00 (n=85)** and **20:00 (n=58)**, plus 21:00 (n=33) and 22:00 (n=28); a morning
block 08:00–10:00 (n=32); an afternoon one 13:00–15:00 (n=32).

**Sales are a Monday activity.** Ventas by day of week (n=41):

| Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---:|---:|---:|---:|---:|---:|---:|
| **18** | 7 | 2 | 4 | 7 | 3 | **0** |

**44% of all sales happen on Monday.** Selling is a start-of-week ritual; attendance is a
daily one.

**Weekly volume** (n=8 weeks) is flat-to-noisy, not trending:

| week of | asistencias | distinct members | ventas |
|---|---:|---:|---:|
| 2026-06-08 | 7 | 5 | 9 |
| 2026-06-15 | 36 | 15 | 6 |
| 2026-06-22 | 48 | 17 | 3 |
| 2026-06-29 | 45 | 18 | 2 |
| 2026-07-06 | 50 | 18 | 2 |
| 2026-07-13 | 47 | 15 | 7 |
| 2026-07-20 | 23 | 9 | 3 |
| 2026-07-27 | 69 | 18 | 9 |

The 2026-07-27 spike is a **cohort intake**: 8 people bought `RETO 21` / `Reto 21` in one
day, all expiring 2026-08-24 together.

---

## Q2 — Which surface do they live on?

**The 8:1 ratio is confirmed, and it is the ratio for *all of history*, not just 90 days**
— `forge` is younger than the 90-day window, so both figures are identical:

| window | asistencias (live) | ventas | ratio |
|---|---:|---:|---:|
| last 90d | 325 | 41 | **7.9 : 1** |
| all history | 325 | 41 | **7.9 : 1** |

Full write-surface inventory, all history (n = every row `forge` has ever produced):

| surface | rows | reading |
|---|---:|---|
| **asistencias (pasa lista)** | **339** | the job |
| class_session | 105 | schedule generated from templates |
| **ventas** | **41** | the till |
| clientes (fichas) | 34 | the roster |
| schedule_template | 21 | set up once |
| asistencias deleted (`deleted_at`) | 14 | corrections — see below |
| plantillas / paquetes / class_type | 4 / 4 / 4 | configured once |
| reservation | **3** | client app effectively unused |
| coach | 2 | configured once |
| clientes with `invitacion_enviada_at` | **1** | one invite, ever |
| contact_message | **0** | — |
| asistencias `perdonada` | **0** | never used |
| clientes with `auth_user_id` | **0** | **no forge member has ever activated an account** |
| class_session cancelled | 0 | never used |

Two structural facts fall out of this table:

1. **Pasa lista is free-form, not class-linked.** 336 of 339 asistencias have
   `class_session_id IS NULL` and `origen = 'libre'`. Only 3 arrived via the reservation
   path. The operator marks attendance against a flat member list; the whole
   class/reservation apparatus is built and unused at this gym.
2. **The client app has no users at `forge`.** 0 of 34 members have an `auth_user_id`, 1
   invite has ever been sent, 0 contact messages. Everything in this document is the
   admin app, single-handed.

**There is exactly one human on `forge`:** `gym_membership` holds 1 row, `role = owner`.
There are **zero `operator` rows in the entire database.** The map's "front desk /
operator" persona has **no instances in production** — at this gym the owner *is* the
front desk.

---

## Q3 — Do they ever work the directory? **The schema cannot answer this directly.**

The ticket proposes inferring directory work from `clientes.updated_at` deltas.
**`clientes` has no `updated_at` column.** Confirmed against
`information_schema.columns`: the table carries `created_at` only. Furthermore **the
entire `public` schema contains exactly one `updated_at` anywhere — on `gym_contact`** —
and there is no audit, history, or event table of any kind (29 tables, all inspected).

**There is no page-view telemetry in this product.** We cannot know what screens anyone
opened. Any number claiming otherwise would be invented. What follows are *proxies*,
labelled as such.

### Proxy 1 — the optional fields are empty, across the board (this one is a census)

| gym | clientes | with a venta | **no venta at all** | with email | with birthday |
|---|---:|---:|---:|---:|---:|
| **forge** | **34** | **34** | **0** | **1** | **0** |
| forge-demo | 22 | 15 | 7 | 3 | 0 |
| red-demo | 41 | 39 | 2 | 31 | 18 |

**All 34 of 34 forge fichas were born from a sale.** Not one member was ever added by
hand through the directory — the `/vender` flow created every single row. And of the
fields the sale flow does *not* fill, **1 of 34 has an email and 0 of 34 have a
birthday.**

This is `n = 34` but it is a **census of the gym, not a sample**. Every ficha holds
exactly what the checkout wrote and nothing more. There is no evidence anywhere in the
data that this operator has ever opened a ficha to enrich it.

### Proxy 2 — the one thing they demonstrably did per-ficha

`invitacion_enviada_at` is set on **1 of 34** members. That is the only per-ficha admin
action with a timestamp, and it happened once.

### Proxy 3 — corrections happen, but on the attendance surface

14 asistencias carry `deleted_at` — someone un-marked a mistaken check-in. That is real
per-row work, and **it is on the attendance list, not the directory.**

**Reading:** the directory is where members *land*, not where this person *works*. This
is inference from absence of evidence, and it is stated at that strength — but the
absence is total, and it is a census.

---

## Q4 — Renewal punctuality (extended, and the `n` is still small)

Consecutive-purchase pairs, all history, split by gym:

| gym | pairs (n) | before vence | exact vence day | late 1–7d | late 8–30d | late 30d+ | median lateness |
|---|---:|---:|---:|---:|---:|---:|---:|
| **forge** | **7** | 1 | 3 | 3 | **0** | **0** | **0 d** |
| red-demo *(seeded)* | 54 | 19 | 9 | 26 | 0 | 0 | 0 d |
| forge-demo *(seeded)* | 5 | 5 | 0 | 0 | 0 | 0 | −22 d |
| red *(seeded)* | 0 | — | — | — | — | — | — |

**The first pass's n=7 could not be widened — 7 pairs is all of `forge`'s history.** The
range is −2 to +2 days. Nobody has ever renewed more than 2 days late.

`red-demo` reproduces the same *shape* at n=54 (median 0, max +6, zero late beyond 7
days), which is structurally interesting but **behaviourally void — it is synthetic data
and cannot corroborate a human claim.** It is reported only to show the seed does not
contradict the shape.

**Confidence: directional, not conclusive.** n=7 supports "renewals cluster on the vence
day and nobody renews late" as a hypothesis. It cannot establish it as a law.

### The number that dwarfs the punctuality question

| gym | clientes | bought once | bought twice | bought 3+ | **ever renewed** |
|---|---:|---:|---:|---:|---:|
| **forge** | **34** | **27** | **7** | **0** | **20.6%** |
| red-demo *(seeded)* | 41 | 9 | 6 | 24 | 73.2% |
| red *(seeded)* | 31 | 31 | 0 | 0 | 0.0% |

**27 of 34 forge members bought exactly once and never came back. Not one member has ever
bought a third package.** Renewal *punctuality* is a rounding error next to renewal
*occurrence*: when they renew they are perfectly on time, and 79% of them never renew.

---

## Q5 — The silent lapsers. **The ~70-day prediction does not hold here, and the reason is structural.**

All 13 currently-expired `forge` members (`vence < 2026-08-02`), with both clocks:

| member | paquete | vence | days expired | last attended | visits | **stopped coming N days BEFORE vence** | clases left |
|---|---|---|---:|---|---:|---:|---:|
| MIGUEL ARREOLA | Ilimitado | 2026-07-12 | 21 | 2026-06-16 | 1 | **26** | ∞ |
| Roberto Dominguez | 8 clases | 2026-07-29 | 4 | 2026-07-06 | 2 | **23** | 6 of 8 |
| Laura Sanchez | Ilimitado | 2026-07-31 | 2 | 2026-07-16 | 8 | **15** | ∞ |
| IDEL RASCON | 12 clases | 2026-07-12 | 21 | 2026-07-01 | 12 | **11** | 0 |
| RENATO VALVERDE | 12 clases | 2026-07-12 | 21 | 2026-07-07 | 11 | 5 | 1 |
| Magdalena Garay | 8 clases | 2026-07-22 | 11 | 2026-07-18 | 8 | 4 | 0 |
| Irla Osornio | Ilimitado | 2026-07-27 | 6 | 2026-07-24 | 16 | 3 | ∞ |
| CAROLINA NIETO | 12 clases | 2026-07-12 | 21 | 2026-07-09 | 7 | 3 | 5 of 12 |
| Meredith Sinfuentes | 8 clases | 2026-07-16 | 17 | 2026-07-13 | 7 | 3 | 1 |
| EDITH RODRIGUEZ | 8 clases | 2026-07-13 | 20 | 2026-07-10 | 7 | 3 | 1 |
| David Lozano | Ilimitado | 2026-07-18 | 15 | 2026-07-16 | 16 | 2 | ∞ |
| Merary Trevizo | 8 clases | 2026-07-09 | 24 | 2026-07-08 | 8 | 1 | 1 |
| Natalia Martínez | Ilimitado | 2026-07-16 | 17 | 2026-07-16 | 23 | **0** | ∞ |

**Headline (n = 13, a census of every expired forge member):**

| statistic | value |
|---|---:|
| **Median days the attendance clock led the billing clock** | **3 days** |
| Mean | 7.6 days |
| Range | 0 – 26 days |
| Lead ≤ 7 days | **9 of 13 (69%)** |
| Lead 8–30 days | 4 of 13 (31%) |
| **Lead > 30 days** | **0 of 13** |

**#182 predicted ~70 days. The measured value is a median of 3 and a maximum of 26.**

### Why — and this is the important part

`forge` sells **prepaid, non-renewing packages only.** Every one of its 41 ventas is
`vigencia_tipo = 'dias'` with `vigencia_dias` of **28 or 30**:

| paquete | vigencia_dias | n | avg monto |
|---|---:|---:|---:|
| Ilimitado | 30 | 17 | $1,350 |
| 8 clases | 30 | 9 | $799 |
| 12 clases | 30 | 6 | $1,199 |
| Reto 21 / RETO 21 | 28 | 8 | $1,499 |
| Descuento Pareja | 30 | 1 | $675 |

The ~70-day figure in DellaVigna & Malmendier is a property of **auto-renewing monthly
contracts**, where a member keeps *paying* for months after they stop *attending*. That
mechanism does not exist in this product. Here the package simply stops after 30 days, so
**the billing clock is hard-capped at 30 days of lag and empirically lags by 3.**

> **This does not invalidate #182 — it bounds it.** The lagging-indicator finding is real
> for subscription gyms. On a prepaid-package gym the lag is roughly one package length,
> and the observed median is 3 days.

### The counterfactual: would an absence signal have fired *earlier*? Mostly **no.**

For each expired member, comparing when an absence-N flag would have fired
(`last_visit + N`) against when the red row actually appeared (`vence + 1`), n=13:

| absence threshold | fired **earlier** than red | median days of advantage |
|---|---:|---:|
| 7 days | 4 of 13 | **−3** (fires 3 days *later*) |
| 10 days | 4 of 13 | −6 |
| 14 days | 3 of 13 | −10 |
| 21 days | 2 of 13 | −17 |
| 30 days | **0 of 13** | −26 |

**A naive "absence tier fires earlier than the expiry tier" premise is false on this
gym's data.** Because members stop attending a median of 3 days before expiry, an
absence counter needs ~3 days to beat the billing clock; at any usable threshold it fires
*after* the row has already turned red.

**Note the selection effect and treat this table as bounded:** this cohort is defined by
`vence` being in the past, which biases it toward packages that ran their course. The
live-roster picture in Q6 is different, and that difference is the real design signal.

### Did anything happen in between? **No.**

**0 of 13** expired members had any venta between their last attendance and their vence
date. There is no partial payment, no top-up, no contact — the sequence is: last visit,
silence, expiry.

---

## Q6 — The live AUSENTE population: **2 people. Not zero, but small.**

All 21 `forge` members who are **not** expired (`vence >= 2026-08-02`), by current
absence gap:

| current gap | n | who |
|---|---:|---|
| 0–6 days | **18** | the bulk of the roster |
| 7–13 days | 1 | Evelin DB (11d) |
| 14–20 days | 1 | Jesus Ojeda (18d) |
| 21+ days | 1 | Hector Meño Gonzalez (24d) |
| never attended | 0 | — |

**Tier size at a 14-day threshold: 2 of 21 (9.5%). At 21 days: 1 of 21 (4.8%).**

The three absentees in detail:

| member | paquete | vence | days left | clases left | days absent |
|---|---|---|---:|---:|---:|
| **Hector Meño Gonzalez** | Ilimitado | 2026-08-14 | 12 | ∞ | **24** |
| **Jesus Ojeda** | 8 clases | 2026-08-06 | 4 | 3 of 8 | **18** |
| Evelin DB | Ilimitado | 2026-08-19 | 17 | ∞ | 11 |

**For these three the absence signal *does* beat the billing clock**, and by a lot — a
14-day flag would have fired on Hector on 2026-07-23, **23 days before** his row turns
red on 2026-08-15. On Jesus, 9 days early. On Evelin, 15 days early.

This is the reverse of the Q5 table, and the two results are consistent: the absence
signal has no value on members who trained until their package ran out (the majority), and
real value on the minority who paid for a window and abandoned it mid-flight.

### What the page shows these people today

Replicating `derivarEstado` + `urgenciaCliente` against live forge data (n=34):

| estado | urgencia | n |
|---|---|---:|
| sin_clases (expired) | **critico** | **13** |
| por_vencer | critico | 1 |
| por_vencer | urgente | 1 |
| activo | urgente | 2 |
| activo | pronto | 5 |
| activo | ok | 12 |

**`critico` fires on 14 rows. Exactly one of them is actionable** — VERONICA BARRERA, 1
class left with 10 days remaining. **Red precision at forge: 1/14 = 7.1%**, against a
roster-wide base rate of 34. This independently reproduces #184's RED measurement (5.3%
precision) on a second, organic tenant.

And the concrete miss: **Hector Meño Gonzalez — paid for Ilimitado, absent 24 days, 12
days of value left — renders as `activo` / `pronto`.** A calm, mid-priority row. He is
the single clearest renewal risk on the roster and the page is quiet about him, while
shouting about 13 people who already left.

### Directional backtest: does the absence flag predict non-renewal?

All closed package windows at `forge` (n=20), classified by whether the member went absent
before the package ended, against whether they ever bought again:

| signal during the package | windows (n) | renewed | renewal rate |
|---|---:|---:|---:|
| trained to the end (<7d gap) | 15 | 6 | **40%** |
| absent 7–13d before vence | 2 | 1 | 50% |
| **absent ≥14d before vence** | **3** | **0** | **0%** |

**Confidence: directional only. n=3 in the decisive cell.** Three windows where a 14-day
absence preceded expiry, and all three failed to renew, against 40% for members who
trained to the end. That is the right sign and a plausible effect size, and it is nowhere
near enough rows to be called a finding. It is a hypothesis worth a threshold, not a
number worth a decision.

---

## Verdict: **is CLIENTES a surface this operator works, or one they pass through?**

**They pass through it.** The evidence is one-sided:

1. **They live on the attendance list.** 325 asistencias to 41 ventas — **7.9 : 1** — laid
   down in 44 register sessions with a median duration of **103 seconds**, at class hours,
   six days a week. That is the job.
2. **They have never edited a ficha.** All **34 of 34** members were created by the
   checkout flow. **1 of 34** has an email, **0 of 34** have a birthday, **1** invite has
   ever been sent. The directory's own fields are untouched — a census, not a sample.
3. **The CLIENTES page reaches them through `/vender`.** Selling is a **Monday** ritual
   (18 of 41 sales); attendance is daily. The directory is the corridor between the two,
   not a destination.
4. **The page's loudest signal is noise to them.** `critico` fires on 14 rows with 1
   actionable — **7.1% precision** — and the 13 false positives are all people who have
   already gone. Reproduced independently on RED by #184 at 5.3%.
5. **The one persona the page is nominally designed for does not exist.** There are
   **zero `operator` rows in the entire database**. At `forge` the owner is the front
   desk, and that one person's measured behaviour is: mark attendance daily, sell on
   Monday, never open a ficha.

**Consequences for #186 and #187:**

- **The lapsed tier is not a work queue, and now it is measured on our own gym.** 13
  expired members, **0** of whom did anything between their last visit and expiry, **0**
  of whom renewed late by 8+ days, and **0** of whom returned. Whatever the doctrine does
  with the expired, it must not present them as work — this operator has never worked
  them, and nothing they left behind suggests they intend to.
- **An AUSENTE tier is justified but must be small and must sit inside the paid window.**
  Its real size today is **2 of 21 (9.5%)** at 14 days, **1 of 21** at 21 days. It is not
  zero, so the tier should exist — but it is 2 people, so it must be a quiet marker on the
  active roster, not a section, tab, or count. A tier that renders as a heading would be
  empty most weeks.
- **Do not sell the absence signal as "earlier warning".** On already-expired members it
  fires *later* than the red row at every threshold ≥7 days (n=13). Its value is
  precisely and only the mid-package abandoner — the member whose money is already
  collected and whose window is being wasted. That is Hector, and today that is the whole
  population.
- **The renewal-punctuality result stays at n=7 and must not harden into a rule.** All of
  `forge`'s history is 7 pairs. The far larger fact sitting next to it is that **27 of 34
  members bought once and never returned (20.6% ever-renewed, 0 have bought three
  times)** — an acquisition-retention problem the directory's tiering cannot touch.

### What the schema still cannot tell us, and no query will fix

- **Whether anyone ever opened the CLIENTES page.** No page-view telemetry exists.
- **When a ficha was last edited.** `clientes` has no `updated_at`; the only one in the
  whole schema is on `gym_contact`. There is no audit table.
- **Whether a member declared they were leaving.** No cancellation reason, no freeze/hold,
  no notes field — confirmed by #183 and re-confirmed here.

Q3 is therefore answered by census and absence rather than by observation, and is labelled
that way above. The inference is strong because the absence is total, not because a query
observed the behaviour.
