# Forge Gym Admin — Client Brief

**Date:** 2026-05-27
**Purpose:** Capture what the client explicitly needs from the app. Nothing else.
**Hand-off:** This doc feeds into claude.ai/design for UX/UI design.

---

## The client

A functional gym (gimnasio funcional) about to open in **Chihuahua, Chihuahua, México**. New business — small client base at launch, expected to grow.

---

## What they sell

Class packages only. No monthly memberships, no per-class drop-in pricing stated.

The client's literal pricing:

> **Paquetes**
> - 8 clases · $750 · 20 días
> - 12 clases · $1,100 · 25 días
> - ilimitado · $1,350 · todo el mes

Each package has a **class count** and a **validity window** (in days). The "ilimitado" package has no class limit; it's bounded only by the month.

---

## What they need the app to do

Stated verbatim by the client:

> *necesito control de asistencias, control de vigencias y algun tipo de lista de clientes.*

Three jobs:

1. **Track attendance** — record when each client attends. Adjustment from the dev side: the owner will mostly mark attendance in the moment (one client at a time), but sometimes will need to enter several visits at once (e.g., catching up on a week's worth from a written list).
2. **Track validity / expiration** — know how many classes a client has left and when their package expires.
3. **Keep a client list** — some form of client roster.

---

## How they will use it

- **One person operates the app** — the owner, who is also the coach. No other staff at launch.
- **All data is entered manually by the owner.** No automation needed.
- **Per-class scheduling is not wanted** in this version (no class times, no rosters, no booking).

---

## Language and region

- **Spanish (es-MX), exclusively.** No English UI.
- **Timezone:** Chihuahua local time.
- **Currency:** Mexican pesos (MXN).

---

## Access

The client requires **login credentials** so that the gym's information stays private to the gym (no one else can see it).

---

## Form factor

- **Mobile-first responsive web app.**
- The owner will mostly use it from their phone; it should also work from a laptop.

---

## Out of scope for this version (explicit)

The client did not ask for these and is not getting them in v1:

- A member-facing app or website
- Online class booking / scheduling
- Per-class rosters or capacity management
- Automated payments, payment processing, or billing integrations
- CFDI / invoice generation
- WhatsApp, SMS, or email automation
- Bulk client import (CSV, etc.)

---

## Open questions to confirm with the client before design or build

These are ambiguities in what the client stated — they need to answer, not us.

1. **"Ilimitado · todo el mes"** — does "the month" mean 30 days from purchase, or the current calendar month? YES
2. **Classes left when validity expires** — what happens? Forfeited, refunded, extended? FORFEITED 
3. **Validity left when classes run out** — what happens? Package ends, or client can still come? PACKAGE ENDS
4. **What client info should be stored?** They said "alguna lista de clientes" — minimum is name; do they also want phone, email, birthdate, notes, photo? FULL NAME, PHONE NUMBER (OPTIONAL), EMAIL (OPTIONAL), PAYMENT AND SUBSCRIPTION RESUME AS DATA, AGE OR BIIRTHDAY (OPTIONAL)
5. **Two packages at the same time** — allowed (e.g., buy a new one early)? Or only one active at a time? ALLOWED, IF THE CLIENT BUYS ONE EARLIER IT JUST ADDS IN TIME AND CLASSES AVAILABLE TO THE CURRENT ONES REGISTERED 
6. **Same-day duplicate attendance** — should the app block it, or allow it (e.g., two classes in one day for ilimitado clients)? ALLOW IT 
7. **Sale and payment recording** — when the client sells a package, do they also want to record *how* it was paid (efectivo, transferencia, etc.) — or is that out of scope and they just want to track the package itself? YES, THIS HAS TO BE OPTIONAL, FOR THE USER TO REGISTER 
8. **Existing clients at launch** — how many clients do they expect to enter manually before going live? Will they do it themselves? THE USER WILL REGISTER ALL CLIENTS BY HIMSELF 
9. **Reactivating clients** — when someone stops coming and comes back later, do they want to see the old history, or start fresh? KEEP THE HISTORY (DATA IS ALWAYS GOOD)
10. **Gym name and domain** — what's the gym called, and is there a domain registered? GYM NAME IS " FORGE " 
