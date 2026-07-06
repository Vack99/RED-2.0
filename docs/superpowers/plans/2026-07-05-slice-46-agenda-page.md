# Slice #46 — Agenda page + nav restructure Implementation Plan

> **For agentic workers:** executed inline (no subagents) by the shipping subagent, TDD per unit.

**Goal:** Wire the DÍA + SEMANA Agenda page (editor + quick-glance) to the #44 DAL and #41 primitives, and swap AGENDA into vender's tab slot while keeping vender reachable.

**Architecture:** One `getAgendaSemana(?d)` server read feeds both views (DÍA slices one day; SEMANA groups the week). A server component builds a fully-serializable view model (all six days' cards + week rows + navigator labels) and hands it to a thin client orchestrator that owns view toggle, in-week day selection, the sheets, and week paging (via `?d` navigation). Writes go through `"use server"` actions wrapping the DAL RPCs; the tipo `+` mints a real `class_type` via a direct RLS-scoped insert.

**Tech Stack:** Next 16 App Router (async server components, `searchParams` Promise), `@gym/data` server DAL, `@gym/ui` forge/agenda primitives, `@gym/format` tz calendar, `@gym/domain` estado rules, sonner toasts.

## Global Constraints
- Brand-neutral: `var(--*)` tokens only, zero hex in page code (mock gold is paint).
- es-MX copy verbatim from the mock digest. Toasts (app title/body split): "Clase creada" · "Visible en la app"; recurring body `N días`; "Clase actualizada" · "Visible en la app"; "Clase cancelada" · "Se avisó a los reservados". Empty DÍA: "Sin clases este día · toca + para crear una".
- No migrations, no live DDL. Editing one session never fans out. Vender flow untouched + reachable.
- `prefers-reduced-motion` respected (inherited from primitives + motion.css).
- tz always the operator's gym (getOperatorGym); no fixed constant.

---

### Task 1: `horaEnZona` wall-clock formatter (@gym/format)
**Files:** Modify `packages/format/src/fecha.ts`; Test `packages/format/src/fecha.test.ts`.
**Produces:** `horaEnZona(startsAt: Date, tz: string): string` → "HH:MM" gym-local (read-side sibling of instanteEnZona/fechaEnZona).
- Test: an absolute instant renders the correct wall clock in America/Chihuahua (UTC-6) and America/Mexico_City; a UTC instant crossing the day boundary maps to the right local hour.
- Impl: `Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false })` → normalize "24:MM"→"00:MM".

### Task 2: Catalog DAL — coaches, class types, mint (@gym/data)
**Files:** Create `packages/data/src/server/catalog.ts` + `catalog.test.ts`; Modify `packages/data/package.json` (add `./server/catalog` export).
**Consumes:** `AgendaResultado` from `./agenda`.
**Produces:**
- `getCoaches(client?): Promise<{ id: string; label: string }[]>` — `coach` where is_active, order sort_order,name.
- `getClassTypes(client?): Promise<{ id: string; name: string }[]>` — `class_type` order name.
- `crearClassType(raw, client?): Promise<AgendaResultado<{ id: string }>>` — Zod name 1..60, insert `{ gym_id, name }` (gym from getOperatorGym), RLS `is_staff_of`.
- Tests: readers map rows; crearClassType inserts gym_id+name and returns id; blank name rejected pre-insert; duplicate-name RPC error surfaced as `{ ok:false }`.

### Task 3: Session view-model mapping (pure)
**Files:** Create `apps/admin/src/app/(app)/agenda/_components/session-vm.ts` + `session-vm.test.ts`.
**Consumes:** `SesionAgendaDTO` from `@gym/data/server/agenda`.
**Produces:** `type CardVM`; `toCardVM(dto, hora: string): CardVM` mapping domain estado→UI 4-state + `isNext` (a_continuacion→normal+isNext), coaches join ("Por asignar" when empty), card `isSpecial`=muestraEspecial, keeps `esEspecial`/coachIds/specialName for the editor.
- Tests: a_continuacion→estado "normal"+isNext true; termino/lleno/casi_lleno/normal pass through, isNext false; empty coaches→"Por asignar"; multi-coach joined "A, B"; muestraEspecial drives card isSpecial.

### Task 4: Server actions
**Files:** Create `apps/admin/src/app/(app)/agenda/actions.ts`.
**Produces:** `"use server"` thin wrappers: `crearSesionAction`, `crearHorarioRecurrenteAction`, `editarSesionAction`, `cancelarSesionAction`, `crearClassTypeAction` → the DAL fns. (No test — thin seam, matches asistencia/actions.ts.)

### Task 5: Agenda server page (view-model builder)
**Files:** Create `apps/admin/src/app/(app)/agenda/page.tsx`.
- await `getOperatorGym()` → tz; `d = (await searchParams).d ?? hoyIsoEnZona(tz)`.
- `Promise.all([getAgendaSemana(d), getCoaches(), getClassTypes()])`.
- Build: stripDays (DOW+dnum+iso ×6), todayIndex, initialSelectedIndex; per-day DiaVM (dateLabel=fmtDiaAgenda, navRel=fmtNavegadorDia, summary=fmtResumenDia, cards=toCardVM w/ horaEnZona, occupancyPct); weekNav {label range, rel=fmtNavegadorSemana}, weekFooter=fmtResumenSemana; editor option sets (HORA/DURACION/CUPO from fixtures, coaches, tipos).
- Render `<AgendaScreen key={weekMondayIso} ... />`.

### Task 6: Agenda client orchestrator
**Files:** Create `apps/admin/src/app/(app)/agenda/_components/agenda.tsx`.
- State: view "dia"|"semana"; selectedIndex (seed initial, reset on weekMondayIso change); tipos (seed, optimistic mint append); quick-glance {open,card}; editor {open,mode,editId,draft}.
- Header: "AGENDA." title + `+` (open create); navigator (DÍA: dias[i].dateLabel+navRel; SEMANA: weekNav); DateStrip (onSelect=setIndex; onPrev/onNext=step); DÍA/SEMANA underline toggle.
- DÍA: day-header row (dateLabel + summary) + SessionCard list (card tap→quick-glance) or empty state.
- SEMANA: WeekGroup per day (rows from cards; selected=i; row tap→setIndex+quick-glance) + week footer.
- step(dir): SEMANA→push `?d=addDays(sel,7·dir)`; DÍA→ in-week setIndex else push `?d=pasoDia(sel,dir)`.
- Sheets: QuickGlanceSheet (esEspecial identity); EditorSheet (create defaults / edit seed from card; onAddTipo mint; save routes one-off/recurring/edit; cancel; toasts + router.refresh()).

### Task 7: Nav restructure
**Files:** Modify `apps/admin/src/app/(app)/layout.tsx` (vender→agenda tab, icon "cal"); Modify `ARCHITECTURE.md` (add agenda sector row). Verify vender reachable (ficha RENOVAR + INICIO NUEVO CLIENTE already link `/vender`).

### Verify
`pnpm lint && pnpm typecheck && pnpm test` green; `next build` (admin) to catch RSC/client-boundary errors.
