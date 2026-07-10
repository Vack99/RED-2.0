# Admin desk flow — first purchase, member visibility, and the NUEVO/EXISTENTE seam

**Status:** context capture for a future session. **Not a PRD, not a spec.** Deliberately no solution design here — the point is to hand the next session everything it needs to *start thinking*, not to pre-commit an answer.

**Raised by:** the owner, during the #73 exit-gate walk on live (`red-demo`, 2026-07-09).
**Existing issues that live inside this problem:** #76, #77, #79. (#78 is fixed and closed.)

---

## The one-sentence problem

**The admin app has no concept of a member who has never paid** — so taking their first payment means pressing a button that says RENOVAR, choosing EXISTENTE, and searching for the person whose profile you were already standing on.

---

## What the owner actually hit

Walking journey 3 of #73 (online self-registrant → desk payment → member books), on a real member on live:

1. **The ficha shows the ingredients and hides the meaning.** For a self-registered, never-paid member the screen reads `SIN CLASES`, `CUENTA ACTIVA`, `SIN PAQUETE`, `CLASES RESTANTES 0`, `COMPRADO —`, `HISTORIAL DE PAGOS · 0 VENTAS · "Sin ventas registradas."` Six separate signals that this person has never bought anything, and **no statement of it.** The operator assembles the fact themselves, every time.

2. **The only affordance is RENOVAR.** You cannot *renew* a package that was never bought. The word describes the opposite of what is happening.

3. **RENOVAR does not take you to a purchase for that member.** It routes to `/vender`, where you must then pick the **EXISTENTE** tab and search for the member by name or phone — the member whose ficha you just left. The operator's identity context is dropped and handed back to them as a search box.

   > Owner, verbatim: *"in the renew button I have to pick existente and pick the same member. this is the most stupid thing I have seen in a long time."*

4. **The member's email is invisible.** Once a row is claimed, the email appears nowhere in read mode — only inside the EDITAR sheet. So the operator cannot see, verify, or read back the contact address of the member in front of them.

5. **And the form races you past the email on the way in.** In NUEVO, the client section auto-advances the instant a valid 10-digit phone is typed — before the email field is reached (#76). Email is the invite trigger. The form quietly manufactures the unclaimable rows the whole initiative exists to eliminate.

Every one of these lands on the same two screens: the **ficha** and **Vender**.

---

## Why it matters more than a label

This is the seam where the two doors of #64 are supposed to meet. A member walks in having already registered online; the desk takes their money; their app lights up. That is the payoff of the entire invite/claim rail.

Today the operator's path to that payoff runs through a button labelled with the wrong verb, into a flow that has forgotten who they were talking about. The failure mode is not confusion — it is **the operator reaching for NUEVO instead**, minting a duplicate row, stranding the member's paid balance on a record their app will never see. That is precisely the root defect of #64 (`renewal-duplicate-rootcause`: RENOVAR drops client identity → blank NUEVO form → duplicate INSERT), re-entering through a different door.

The duplicate warning (S4, #69) is a backstop, not a fix. It catches the operator after the mistake is in motion.

---

## The load-bearing discovery

**The domain concept already exists.** `packages/data/src/server/derive.ts:163-168`:

```ts
/** Tile/filter population — a "registro online pendiente": an auth-linked member
 *  (Door 2 self-registrant) with no active package. */
export function esRegistroOnlinePendiente(
  invitacion: EstadoInvitacion,
  estado: EstadoCliente,
): boolean {
  return invitacion === "cuenta_activa" && estado === "sin_clases";
}
```

That predicate is exactly the two badges on the screenshot. It already drives the dashboard tile and the roster filter (S4, #69). **The ficha and the Vender flow simply never call it.** The concept is named, tested, and shipped; only its surfacing is missing. This should make the work considerably smaller than the symptom count suggests.

Note the predicate keys on *no active package*, not *no sale ever*. A member whose package expired is also `sin_clases`. Whether "first purchase" means **no `ventas` row ever** (the strict reading, and the one the copy implies) or **no active package** (what the predicate computes today) is an open question below — the two diverge for a lapsed member, who should see "renovar", not "primera compra".

---

## Code anchors for the next session

| what | where |
|---|---|
| `esRegistroOnlinePendiente` — the existing predicate | `packages/data/src/server/derive.ts:163-168` |
| Invite-state badges + their es-MX copy | `packages/data/src/server/derive.ts:141-156` |
| Ficha identity block — renders nombre, badges, `tel`; **no email** | `apps/admin/src/app/(app)/clientes/[id]/_components/cliente-detalle.tsx:203-223` |
| Email loaded but only fed to the EDITAR form | `…/cliente-detalle.tsx:180` |
| The RENOVAR button → `router.push("/vender")`, identity dropped | `…/cliente-detalle.tsx:291` |
| The design assumption that broke | `packages/data/src/server/clientes.ts:190` — *"claimed (`cuenta_activa`): the verified login email owns it then"* |
| NUEVO auto-advance, email excluded from validity | `apps/admin/src/app/(app)/vender/_components/vender.tsx:111-120` |
| Duplicate detection (tel OR email) | `…/vender.tsx:61-71` |

The `clientes.ts:190` assumption is worth dwelling on. The app stopped showing the email *because it believed a claimed row always had a verified one*. #78 proved the assumption false (the create path never wrote it). #78 is fixed — but the UI is still built on the belief, which is why the absence was unobservable.

---

## Open questions to settle next session

1. **What is a "first purchase"?** No `ventas` row ever, or no active package? They diverge for a lapsed member. The copy ("primera compra", "activar membresía") only makes sense under the strict reading.
2. **Does a staff-created member who has never paid get the same treatment?** They are not an *online* registrant, but they have equally never bought. `esRegistroOnlinePendiente` would say no; the operator's mental model probably says yes.
3. **Should RENOVAR carry the member into `/vender`** pre-selected as EXISTENTE — or should the purchase happen on the ficha itself, without leaving? The second removes the duplicate-minting opportunity entirely.
4. **Where else does the operator need the email?** Roster row, Vender picker, receipt. #79 scopes the ficha; the identify-the-member decision happens in the picker.
5. **What does an email-less claimed row look like now?** Post-#78 it should not occur, but legacy/edge rows may exist. The absence must be legible, not silent.
6. **Is the NUEVO auto-advance (#76) worth keeping at all**, or is section auto-advance the wrong interaction for a form whose last field is the most important one?

---

## Scope note

Treat #76, #77 and #79 as **one design problem on two screens**, not three patches. Three separate fixes will produce three separate visual languages on the same ficha.

Per `CLAUDE.md`, this is user-facing surface: `taste >= 7`. It wants a design pass, not a badge bolted onto an existing layout.
