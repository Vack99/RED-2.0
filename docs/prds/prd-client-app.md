> Tracked in: https://github.com/Vack99/RED-2.0/issues/49

## Problem Statement

A gym member on the platform has no self-service surface. They cannot see the class schedule, book a class, check how many classes they have left, or manage their account â€” everything routes through the operator's WhatsApp or the front desk. Prospects are worse off: the gym has no public web presence at all â€” no pricing, no coach roster, no way to make contact â€” so every lead starts as a cold message. Meanwhile `apps/client` is an unstyled Phase-3 auth skeleton: the flows work, but nothing a member would recognize as the gym's app exists.

## Solution

Build the 12-screen member journey in the client app, faithful to the team-approved RED design mock (the interactive `RED-1.0-Design/index.html` â€” layout, behavior, and copy implemented exactly; paint delivered through the brand token system so RED hosts render the mock pixel-true and Forge hosts render the same pages in Forge paint).

Five tracer-bullet vertical slices, each shippable alone, in this order:

1. **marketing** â€” public comercial / nosotros / precios / contacto pages reading the real curated catalog anonymously (the deferred decision-(b) anon-read policies land here, with their consumer), plus a stored contact-form intake.
2. **auth** â€” the RED-designed entrar / registro / restablecer screens over the already-shipped Phase-3 flows (email+password, claim-by-match, host-resolved gym).
3. **booking** â€” the real thing: a `reservation` table, atomic book/cancel RPCs that consume the existing class balance, live derived occupancy, mis reservas, and a reservation-aware Pasar lista in the admin app.
4. **membresÃ­a** â€” plan status + usage from existing balance data, and a change-plan flow that ends in honest "paga en tu gym" instructions (payments stay gym-managed for now; Stripe is future scope).
5. **perfil** â€” the account hub (identity, settings, notifications toggle, cerrar sesiÃ³n), completing the consolidated Perfil overlay the mock designed.

## User Stories

**Marketing (prospect, unauthenticated)**

1. As a prospect, I want a landing page with the gym's identity, a today-schedule teaser, and a pricing teaser, so that I can decide whether to try the gym.
2. As a prospect, I want a precios page showing the gym's real plans with prices, features, and badges, so that I can compare options before committing.
3. As a prospect, I want a pricing FAQ, so that policy questions (freezes, cancellations, payment methods) don't require contacting anyone.
4. As a prospect, I want a nosotros page with the gym's story, values, coach roster, class formats, and facilities, so that I can trust who I'd be training with.
5. As a prospect, I want a contacto page with address, hours, and direct channels (WhatsApp, email, Instagram, open-in-maps), so that I can reach the gym my preferred way.
6. As a prospect, I want to send a message through a contact form, so that I can ask something without leaving the page.
7. As an operator, I want contact-form messages stored and readable in my admin app, so that leads don't evaporate.
8. As a prospect, I want to see all of this without creating an account, so that there is zero friction before my decision.
9. As a prospect, I want every marketing CTA to route me toward registering or booking, so that the next step is always one tap away.

**Auth (member)**

10. As a new member, I want to register with my name, email, password, and phone, accepting terms and privacy, so that I get an account at the gym whose site I'm on â€” with no gym selector, because the domain decides.
11. As an existing front-desk client, I want registering with my known email to claim my existing record, so that my class balance and history carry over instead of duplicating.
12. As a new member, I want to confirm my email and land signed in, so that registration is one continuous flow.
13. As a member, I want to log in with email and password, so that access is simple and predictable.
14. As a member who forgot their password, I want a reset-by-email flow, so that I can recover access myself.
15. As a gym owner, I want captcha and rate limiting on registration and the contact form, so that bots can't spam a shared-project quota.

**Booking (member)**

16. As a member, I want to browse this week's classes (Lunâ€“SÃ¡b) with type, coaches, time, and spots left, so that I can pick a session.
17. As a member, I want spots-left to be live and truthful (derived from actual reservations), so that I never show up to an oversold class.
18. As a member, I want to tap a class and see a summary sheet (coaches, duraciÃ³n, sala, nivel, cupo, description) before committing, so that I know what I'm booking.
19. As a member, I want to book in one tap and see a celebratory confirmation, so that booking feels instant and certain.
20. As a member on a finite plan, I want booking to use exactly one class from my balance and tell me so ("usa 1 de tus N"), so that I always know my remaining classes.
21. As a member on Ilimitado, I want to book without any balance being touched, so that unlimited means unlimited.
22. As a member with no classes left or an expired package, I want booking blocked with a clear message, so that I know to renew at the gym.
23. As a member, I want a full class to show as Lleno and be unbookable, so that capacity is respected (no waitlist in v1 â€” full stays full).
24. As a member, I want to be prevented from booking the same session twice, so that I can't waste balance by accident.
25. As a member, I want to see my upcoming reservations in my account, so that I know my week at a glance.
26. As a member, I want to cancel a reservation before the session starts and get my class back (finite plans), so that changing plans doesn't cost me.
27. As a member, I want a full class-detail page (datos, coaches, la sesiÃ³n, quÃ© trabajamos, quÃ© traer, cupo roster), so that I arrive prepared.
28. As a member, I want a confirmation page with a ticket-style summary and arrival reminders, so that I have everything for the session in one place.
29. As a member, I want to mark a class type as my favorite and see it tagged across the app, so that my usual training is one glance away.
30. As a gym owner, I want a no-show on a finite plan to stay consumed (no refund), so that held spots have a cost.

**Booking (operator, admin app)**

31. As an operator, I want each session's roster of booked members in my Agenda, so that I know who is coming.
32. As an operator, I want Pasar lista to mark reserved members as attended â€” writing attendance without double-consuming their already-consumed class, so that the ledger stays exact.
33. As an operator, I want walk-ins to keep working exactly as today (attendance + consume at Pasar lista), so that booking doesn't break the front desk.

**MembresÃ­a (member)**

34. As a member, I want to see my current plan, price, usage ("N de N clases"), and expiry, so that I know where my membership stands.
35. As a member, I want to pick a different plan and get a confirmation that ends in clear "paga en tu gym" instructions, so that I know exactly how to complete the change.
36. As a member, I want the app to state plainly that payments are managed by my gym for now, so that I never expect an in-app charge that won't happen.

**Perfil (member)**

37. As a member, I want an account hub with my identity, member-since date, plan card, and upcoming reservations, so that everything about me lives in one place.
38. As a member, I want a notifications on/off toggle that persists, so that my preference survives sessions.
39. As a member, I want to read the terms and privacy notice from my account, so that the legal texts are reachable.
40. As a member, I want to log out with a confirmation, so that shared devices are safe.

**Platform**

41. As the platform owner, I want the same pages to render RED paint on RED hosts and Forge paint on Forge hosts, so that one deployment serves every brand.
42. As the platform owner, I want the red-demo sandbox reachable from the client app, so that the member journey is testable end-to-end before go-live.
43. As a gym owner, I want members of another gym unable to see or book into my gym, so that tenant isolation holds at the database layer.

## Implementation Decisions

**Slicing and sequencing.** Five vertical slices (marketing â†’ auth â†’ booking â†’ membresÃ­a â†’ perfil), each end-to-end: migration â†’ RLS test â†’ DAL/DTO â†’ server action â†’ screen. Expand/contract only; the live admin app stays green at every commit.

**Design contract.** The approved RED mock is the design source of truth for layout, behavior, and copy â€” including the consolidated Perfil overlay (Reservas + MembresÃ­a/Plan + Cuenta as modes of one slide-in panel opened from Reservar) and both confirmation experiences (in-sheet morph on Reservar; standalone Confirmada page). Paint (colors, logo, type) comes exclusively from the brand token system â€” components are brand-neutral. The mock's dev toolbar/gallery harness, prefilled credentials, and toast-stub integrations are explicitly not part of the spec. Mock-only mechanics are translated, never copied: occupancy derived instead of mutated, real auth instead of always-succeed, no dead controls.

**No subscription table.** The existing stored balance â€” `clases_restantes` (NULL = ilimitado) + `vence` + package-name snapshot on the client row â€” remains the single source of member entitlement. Booking consumes it through the same guarded-decrement pattern the attendance RPC uses today. The membresÃ­a screen derives plan name, price, "N de N" usage gauge, and renewal date from the client row + sales ledger exactly as the admin ficha already derives them; "renovaciÃ³n" displays the existing expiry date. The target-model `subscription` entity (status/freeze/renews_on) ships only when real payments do.

**Reservation schema.** New `reservation` table: gym-scoped, member-owned RLS class (owning member writes/reads own; staff of the gym read/write; nothing anon), states `reservada | cancelada | asistida | no_show`, `UNIQUE(member, session)` â€” re-booking a cancelled slot reuses the row. "Active" (occupies a spot) = `reservada` or `asistida`. No automated `no_show` writer in v1: a reservation still `reservada` after the session displays as "no asistiÃ³", and the absence of a refund is what makes a no-show consume â€” the state exists in the enum for the target model, unwritten for now.

**Booking RPCs.** `reservar_clase` and `cancelar_reserva`, following the established atomic-RPC posture (SECURITY INVOKER, empty search_path, EXECUTE to authenticated only, smoke-tested rolled-back on the real schema). Reserve = insert reservation + guarded decrement in one transaction (blocked at zero balance or expired package; Ilimitado short-circuits, never decremented; capacity checked against the derived active count). Cancel before session start = state to `cancelada` + refund on finite plans only. Exactly one consume per finite-plan reservation, at reservation creation â€” never a second time.

**Pasar lista becomes reservation-aware.** For a booked member: transition their reservation to `asistida` and write the attendance row without consuming (their class was consumed at booking). For a walk-in: create an `is_walk_in` reservation at that moment and consume exactly as today. Untoggling reverses symmetrically. Today's front-desk semantics are preserved unchanged for clients who never booked.

**Occupancy seam.** The single occupancy projection function (today a constant 0) is repointed to count active reservations per session. Every existing consumer â€” availability, session state ladder, day summaries, both apps â€” updates through that one seam with no other changes.

**Member-facing reads.** New DAL readers with RLS as the only gate (no operator check): week/day agenda for members, my upcoming reservations, my own profile row, my plan/balance snapshot. Marketing pages read the curated catalog and gym content through the existing readers over an anon server client.

**Anon-read policies (decision b).** Land in the marketing slice, with their consumer pages, recorded as the conscious "the catalog is public" decision: coach, class types (+workblocks/bring-items), class sessions (+coach join), schedule templates, the package catalog's marketing surface + plan features, gym content (about values, facilities, stats, FAQs), room. Follows the existing Phase-3 anon precedent (gym/gym_domain); per-gym scoping stays a query concern; no other anon widening; the auto-RLS-enable trigger stays on.

**Contact intake.** New `contact_message` table: anon INSERT guarded by captcha (Turnstile) + a per-IP limit â€” the abuse posture the data-model doc assigns to this exact surface â€” staff-only read. A minimal read surface (list + mark-read) rides in the admin app so stored messages are actually reachable.

**Auth slice is UI only.** The shipped Phase-3 flows (login, register, reset, PKCE confirm, claim-by-match RPC) are reused as-is behind the RED-designed screens; the existing brand login-hero component frames the entrar form. Registration adds the captcha. The claim-by-match RPC's documented accepted-debt item (gym argument callable by any authenticated user) is explicitly left alone â€” its ADR names the real mitigation and the reopen trigger; no naive guard.

**MembresÃ­a flow.** Plan cards from the real catalog; "Elegir" opens a confirmation ending in "paga en tu gym" instructions. No entitlement is written from the client app â€” the change becomes real when the operator registers the sale at the desk through the existing sale flow. Copy states that payments are managed by the gym for now.

**Member profile fields.** The member row gains a nullable favorite-class-type reference (heart on the class detail toggles it; tags render wherever the mock shows them) and a persisted notifications-enabled flag (the Perfil toggle; in-app only, no delivery channel built).

**Tenancy and host plumbing.** The existing hostâ†’tenant seam is consumed untouched; the tenant header stays presentation-only and RLS-by-membership remains the isolation boundary. red-demo gains its client-app host row, and its empty gym-content sections get seeded with the marketing slice so the sandbox exercises every new page.

**Framework conventions.** Next 16 idioms as established: proxy (not middleware), claims-based auth checks (never session), server-only DAL, RSC-first pages with client islands only where the mock's interactivity demands them, SSR-inlined brand tokens untouched.

## Testing Decisions

Tests assert external behavior, never implementation details.

- **Domain math** (vitest, existing suites as prior art): any new pure rules ride the existing rules module â€” booking eligibility (balance/expiry/capacity edge cases), refund-on-cancel boundaries, favorite/usage display derivations.
- **RPC + RLS SQL tests** (rolled-back transactions on a real schema via the scratch-project pattern; Phase-3/5 suites as prior art): `reservar_clase` â€” consume-once, ilimitado exemption, zero-balance block, capacity block at full, double-book rejection; `cancelar_reserva` â€” refund finite-only, no refund after start; reservation-aware Pasar lista â€” no double consume, walk-in parity; RLS matrix â€” member reads/writes own reservations only, cross-tenant denial, anon can read every decision-(b) table and nothing member-owned, anon cannot execute booking RPCs; contact_message â€” anon insert works, anon/member read denied.
- **No automated UI tests.** Visual fidelity to the mock is verified at the HITL exit gate (per-screen walkthrough on red-demo + Forge paint spot-check), as in every prior phase.

## Out of Scope

- **Payments processing** â€” no Stripe, no processor, no card fields anywhere. (Stripe is the stated future direction; revisit before onboarding the first non-founder gym.)
- **`subscription` table, freeze/pause, renewals, auto-renew** â€” deferred with payments.
- **Waitlist** â€” no `waitlist_entry`, no join-waitlist control; a full class stays full.
- **Member stats surface** (clases tomadas, racha, monthly usage) â€” on no approved screen; the stats VIEW waits for a screen that needs it.
- **Member profile editing** ("Datos personales" is a stub in the mock) â€” the row is dropped in v1 rather than shipped dead; editing ships when designed.
- **Past-bookings history** â€” mis reservas shows upcoming only, matching the mock.
- **Push/WhatsApp notifications** â€” the toggle persists a preference; no delivery channel exists.
- **CRM/table renames from the target model** (clientesâ†’member, ventasâ†’payment) â€” the evolution map waits; Phase 6 builds on today's names.
- **Multi-gym membership picker** â€” one login = one gym holds.
- **Phase-7 work** â€” go-live (#35), SMTP (#27), member-auth security review, adversarial RLS audit, perf budgets.

## Further Notes

- Design source: `C:\Users\Aaron\Desktop\Pending\Red-1.0 Client App Frontend Design\RED-1.0-Design\index.html` (open in a browser; the 12 conceptual screens live in 9 slots â€” Reservas/Plan/Perfil are modes of the Perfil overlay by design). The sibling backup file documents that consolidation as intentional.
- The five slices map to the mock as: marketing = Comercial/Nosotros/Precios/Contacto Â· auth = Entrar/Registro (+ existing Restablecer) Â· booking = Reservar/Clase/Confirmada + the overlay's reservas section (the overlay shell ships here, since Reservar's avatar opens it) Â· membresÃ­a = the overlay's plan card + plans mode Â· perfil = the overlay's cuenta section + logout.
- Delta #48 (vender phone silent validation) may ride any slice or ship solo.
- Operational execution facts (scratch-project serialization, HITL apply gates, pre-DDL dumps, token location) are encoded in the goal file, not here.
