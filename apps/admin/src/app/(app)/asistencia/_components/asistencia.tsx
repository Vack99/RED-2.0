"use client";

import * as React from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@gym/ui/forge/icon";
import { Sheet } from "@gym/ui/forge/sheet";
import { forgeToast } from "@gym/ui/forge/toaster";
import { Avatar, Eyebrow, H1, Input, Tnum } from "@gym/ui/forge/ui";
import { useRevealedWindow } from "@gym/ui/forge/use-revealed-window";
import type { PaseClienteDTO } from "@gym/data/server/clientes";
import { addDays, DOW, firstName, fmtFull, foldDiacritics, isoDay, MON, parseDay, sameDay } from "@gym/format";
import { scrollBehavior } from "@gym/ui/motion";
import type { MarcadasInicial, Presencia, ReservaDelDia } from "@gym/data/server/asistencia";
import { markInAppNav } from "../../../../lib/nav";
import { marcadasDeMesAction, togglePaseAction, visitasDelDiaAction } from "../actions";
import { ctxDe, LIBRE, personasEn, reciboResultado, setVisita, sugerenciaVenta, visitaDe, type Visita, type VentaSugerida } from "./marcadas";

// The day strip reaches this many days back from today, each rendering a has-marks dot.
// getMarcadas' INITIAL window (in @gym/data's asistencia.ts) is sized to cover exactly this
// reach, so every strip dot renders on first paint. This is a "use client" file and cannot
// import that `server-only` constant, so the value is duplicated here under the SAME name and
// MUST stay equal to it (an off-by-one drops marks off the far end of the strip). The lockstep
// is guarded by asistencia-lockstep.test.ts, which fails if either side changes alone.
export const DIAS_TIRA_INICIAL = 104;

// How often the desk re-renders itself off the server (#231). This screen is a KIOSK — left
// open at the counter all day — so every server-resolved instant it was handed at SSR decays
// under it, above all `hoyIso`, which is the toggle's WRITE key. 5 minutes, not 1: the
// rollover this exists to catch happens at an hour nobody is at the counter, and the other
// things the tick freshens (the class pills, the ±90 preselect, the RESERVA chips) are all
// measured against 90-minute windows, so 5 minutes of lag is inside their own resolution.
// Each tick is a full RSC round trip (roster + marcadas + agenda + reservas); at 1 minute a
// single open tab would pay for ~1,400 of them a day.
const REFRESCO_MS = 5 * 60_000;

/** One of today's classes, as the pill row needs it. Built server-side (page.tsx) from
 *  getAgendaDia — `hora` is the gym-local label, `tipo` the Agenda's display name for
 *  the session. The nearest-class default is resolved server-side (sesionCercana reads
 *  the DTO's own `startsAt`), so no absolute instant is serialized to the client. */
export interface SesionDelDia {
  id: string;
  hora: string;
  tipo: string;
  capacidad: number;
}

/** "YYYY-MM" key for a Date's calendar month — the lazy-load bookkeeping unit. */
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * The front desk ("Puerta", #89). TODAY is class-aware: the class is SCREEN STATE, picked
 * from a one-line pill row that opens on the class nearest now and falls back to ACCESO
 * LIBRE — which is the whole screen for a gym with no maintained schedule (no schedule ⇒ no
 * pill row, by design, not by degradation). The full member list IS the screen: always
 * present, stationary, tap-to-mark; search only filters it. In a class context the members
 * who BOOKED it lead as a CON RESERVA group — membership keyed on the booking, never on the
 * check, so marking someone changes their row in place and the list never jumps under a
 * moving thumb. One number: presentes in the selected context. A visit in another context
 * today shows as a gold stamp on the row, never a ×2 badge; undo is tap-again.
 *
 * An ACCESO LIBRE tap on a member holding a booking is ATTRIBUTED by the server to that
 * class when its arrival window contains now (ruling 2026-07-29), so the desk discloses it
 * on both sides: a RESERVA HH:MM chip before, and after, the mark lands in the class it
 * really went to — gold stamp, lit pill dot, and a toast that names the class.
 *
 * A PAST day (strip or calendar pick) runs the SAME per-visit model with the context
 * locked to ACCESO LIBRE — the only one its 2-arg toggle can write. Its class visits
 * therefore render as the same read-only gold stamps instead of as a check the tap
 * cannot undo; a past day just has no pill row to pick a class with.
 */
export function AsistenciaScreen({
  clientes,
  marcadas: inicial,
  hoyIso,
  sesiones,
  reservas,
  reservaAtribuible,
  ctxInicial,
}: {
  clientes: PaseClienteDTO[];
  marcadas: MarcadasInicial;
  hoyIso: string;
  /** Today's classes (empty for a gym with no schedule ⇒ no pill row). */
  sesiones: SesionDelDia[];
  /** sessionId → the clientes holding a `reservada`/`asistida` booking for it. */
  reservas: Record<string, ReservaDelDia[]>;
  /** clienteId → the session a LIBRE tap would be attributed to (the RESERVA chip's
   *  source). Resolved server-side so SSR and hydration agree on "nearest to now". */
  reservaAtribuible: Record<string, string>;
  /** The opening context, resolved server-side so SSR and hydration agree. */
  ctxInicial: string;
}) {
  const hoy = React.useMemo(() => parseDay(hoyIso), [hoyIso]);
  // Imperative nav for the #237 sale bridge below: its href carries a dynamic `?cliente=`
  // query Next's typed routes cannot type as a Link literal (matches clientes.tsx/cliente-detalle.tsx's
  // own router.push for this identical #77 deep link).
  const router = useRouter();

  // Two states, split by purpose:
  //  • `presencia` — per-day COUNTS across the window, driving the strip/calendar dots.
  //    Grows as the calendar browses past months (getMarcadasDeMes).
  //  • `visitasPorDia` — the visit rows of every LOADED day (one per member per context),
  //    seeded with today's from the initial payload so the first tap needs no fetch; a
  //    picked past day is fetched on demand (visitasDelDiaAction). ONE state model for
  //    every day — an absent key means "not loaded yet", never "nobody came".
  const [presencia, setPresencia] = React.useState<Presencia>(inicial.presencia);
  const [visitasPorDia, setVisitasPorDia] = React.useState<Record<string, Visita[]>>({
    [hoyIso]: inicial.visitasHoy,
  });
  // Mirror for the toggle callback to read current state at call time WITHOUT closing
  // over it — that would change the callback identity on every flip and defeat PaseRow's
  // React.memo (re-rendering the whole roster per tap). Kept in sync on every commit.
  const visitasRef = React.useRef(visitasPorDia);
  React.useEffect(() => {
    visitasRef.current = visitasPorDia;
  }, [visitasPorDia]);

  const [ctx, setCtx] = React.useState<string>(ctxInicial);
  const [selDate, setSelDate] = React.useState<Date>(() => parseDay(hoyIso));
  const [query, setQuery] = React.useState("");
  const [calOpen, setCalOpen] = React.useState(false);

  // ── The kiosk outlives the day (#231) ─────────────────────────────────────────
  // `hoyIso` is stamped ONCE, at SSR, and is the `fecha` every toggle below writes — so a
  // tab left open past gym-local midnight goes on dating attendance YESTERDAY, silently and
  // with no affordance that says so. The tick is what re-stamps it: a plain re-render of the
  // route, which also brings the new day's schedule and the freshly-measured preselect and
  // RESERVA chips (both resolved server-side against an absolute now). This is the tick
  // agenda.tsx's `runAgregar` says it defers to.
  React.useEffect(() => {
    const id = setInterval(() => router.refresh(), REFRESCO_MS);
    return () => clearInterval(id);
  }, [router]);

  // And this is the other half — WITHOUT it the tick makes midnight worse, not better.
  // `selDate` and `ctx` are seeded state, not props, so a bare refresh advances `hoyIso`
  // alone: `esHoy` flips false and the desk silently becomes a read-only past-day screen
  // mid-shift. On a rollover, re-seed exactly what the new day invalidated —
  //  • the SELECTION, but only if it was still tracking the old today. A deliberate
  //    past-day pick (the batch-entry workflow) is the operator's; the tick must not steal
  //    it out from under them.
  //  • the CONTEXT, always. Its session id belongs to a schedule that no longer exists, so
  //    a tap would write into yesterday's class — invisible while they sit on a past day
  //    (which pins ctxSel to LIBRE), but still armed for the moment they tap HOY. Note
  //    `ctxInicial` is read HERE and nowhere else: an ordinary tick never touches `ctx`, so
  //    this can't fight a manually picked pill.
  //  • today's VISIT ROWS, from the same fresh payload. An absent key means "not loaded
  //    yet" (see the state's own comment) and the day fetch below is past-days-only, so an
  //    unseeded new today would hang the roster on "Cargando…" forever.
  // Adjusted during render off the prop's identity, matching `prevClientes` below — an
  // effect would be a second commit AND is rejected outright by react-hooks/set-state-in-effect.
  const [prevHoyIso, setPrevHoyIso] = React.useState(hoyIso);
  if (prevHoyIso !== hoyIso) {
    if (isoDay(selDate) === prevHoyIso) setSelDate(parseDay(hoyIso));
    setPrevHoyIso(hoyIso);
    setCtx(ctxInicial);
    setVisitasPorDia((m) => ({ ...m, [hoyIso]: inicial.visitasHoy }));
  }

  // A day's dot/count: a LOADED day counts its visits' distinct members (matching
  // marcadas_presencia' `count(distinct cliente_id)`), any other day falls back to the
  // server's presence count. For a loaded day an optimistic flip moves the dot instantly —
  // that IS the count↔identity reconciliation. Memoized so unrelated commits hand DayStrip
  // the same callback.
  const countFor = React.useCallback(
    (iso: string): number => {
      const vs = visitasPorDia[iso];
      return vs ? personasEn(vs) : (presencia[iso] ?? 0);
    },
    [visitasPorDia, presencia],
  );

  // Lazy-load past months' presence dots. The server ships only the INITIAL
  // window; older months the calendar can browse to are fetched on demand and merged in.
  // Refs, not state — they gate refetching without themselves driving a render (dots
  // re-render off `presencia` when a fetch merges). `loadedMonths` is seeded with the window
  // the server already sent, computed identically to getMarcadas' bound so the two agree.
  const loadedMonths = React.useRef<Set<string> | null>(null);
  if (loadedMonths.current === null) {
    const s = new Set<string>();
    let cur = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const first = addDays(hoy, -DIAS_TIRA_INICIAL);
    const floor = new Date(first.getFullYear(), first.getMonth(), 1);
    while (cur >= floor) {
      s.add(monthKey(cur));
      cur = new Date(cur.getFullYear(), cur.getMonth() - 1, 1);
    }
    loadedMonths.current = s;
  }
  const fetchingMonths = React.useRef<Set<string>>(new Set());

  // Past days whose visits are loaded / in flight — gates the identity fetch. Today is
  // never in here: it is seeded from the initial payload and the effect below never asks.
  const loadedDays = React.useRef<Set<string>>(new Set());
  const fetchingDays = React.useRef<Set<string>>(new Set());

  // Fetch a month's presence once and merge it in, never clobbering existing counts on key
  // collision. Best-effort: a failed fetch stays unloaded so a later navigation retries.
  const ensureMonth = React.useCallback((d: Date) => {
    const mk = monthKey(d);
    if (loadedMonths.current!.has(mk) || fetchingMonths.current.has(mk)) return;
    fetchingMonths.current.add(mk);
    void marcadasDeMesAction(mk)
      .then((pres) => {
        loadedMonths.current!.add(mk);
        setPresencia((p) => ({ ...pres, ...p }));
      })
      .catch(() => {})
      .finally(() => fetchingMonths.current.delete(mk));
  }, []);

  // Fetch a past day's visits once and merge them in (existing wins, so it never clobbers
  // a toggle). Best-effort: a failed fetch stays unloaded so re-selecting retries.
  const ensureDiaVisitas = React.useCallback((iso: string) => {
    if (loadedDays.current.has(iso) || fetchingDays.current.has(iso)) return;
    fetchingDays.current.add(iso);
    void visitasDelDiaAction(iso)
      .then((vs) => {
        loadedDays.current.add(iso);
        setVisitasPorDia((m) => (m[iso] !== undefined ? m : { ...m, [iso]: vs }));
      })
      .catch(() => {})
      .finally(() => fetchingDays.current.delete(iso));
  }, []);

  // Selecting a day loads its month's dots (a calendar pick of an old month) AND, for a
  // PAST day, that day's visits. Strip picks stay inside the initial window, so the
  // month fetch is a no-op for them; today's visits are already seeded.
  const selIso = isoDay(selDate);
  const esHoy = selIso === hoyIso;
  React.useEffect(() => {
    ensureMonth(selDate);
    if (!esHoy) ensureDiaVisitas(selIso);
  }, [selDate, selIso, esHoy, ensureMonth, ensureDiaVisitas]);

  const visitasDia = visitasPorDia[selIso]; // undefined while a picked past day loads
  const diaCargando = visitasDia === undefined;
  const visitas = visitasDia ?? [];

  // The context the tap writes: the picked class on today, ACCESO LIBRE on a past day —
  // the only context a back-dated 2-arg toggle can own.
  const ctxSel = esHoy ? ctx : LIBRE;
  // The selected class (today only). `undefined` ⇒ ACCESO LIBRE.
  const sesionActual = esHoy ? sesiones.find((s) => s.id === ctx) : undefined;
  const presentesEnCtx = visitas.filter((v) => ctxDe(v) === ctxSel).length;

  // Short label for a context, used by the gold other-context stamps. A past day's class
  // ids are not in `sesiones` (which is TODAY's schedule), so they fall back to "CLASE" —
  // the stamp still says a class was attended, just not which one.
  const etiqueta = React.useCallback(
    (k: string) => (k === LIBRE ? "LIBRE" : (sesiones.find((s) => s.id === k)?.tipo ?? "CLASE")),
    [sesiones],
  );

  // Diacritic-folded (#224): "chavez" must find "Chávez" at PASA LISTA too.
  const filtered = clientes.filter((c) =>
    foldDiacritics(c.nombre).includes(foldDiacritics(query.trim())),
  );
  // Booked members lead in a class context. Both halves keep the roster's alphabetical
  // order and a row NEVER moves when marked — group membership is the booking, not the
  // check. Empty on a past day and in ACCESO LIBRE, where the list is simply flat.
  const reservados = React.useMemo(
    () => new Set((esHoy && sesionActual ? (reservas[ctx] ?? []) : []).map((r) => r.clienteId)),
    [esHoy, sesionActual, reservas, ctx],
  );
  const conReserva = reservados.size ? filtered.filter((c) => reservados.has(c.id)) : [];
  const sinReserva = reservados.size ? filtered.filter((c) => !reservados.has(c.id)) : filtered;

  // clienteId → the HORA of the class a LIBRE tap on them would be attributed to. Which
  // booking that is was decided server-side (`reservaAtribuible`: unmarked, non-walk-in,
  // nearest to now — the RPC's own candidate filter and tie-break); all that is left here
  // is naming it, so the chip cannot promise a class the tap would not land on. The
  // reverse — a chip on an already-marked or walk-in booking — would advertise
  // attribution on exactly the rows the tap refuses or charges.
  const reservaPorCliente = React.useMemo(() => {
    const horaDe = new Map(sesiones.map((s) => [s.id, s.hora]));
    const m = new Map<string, string>();
    for (const [clienteId, sessionId] of Object.entries(reservaAtribuible)) {
      const hora = horaDe.get(sessionId);
      if (hora) m.set(clienteId, hora);
    }
    return m;
  }, [sesiones, reservaAtribuible]);

  // Balances repainted from a toggle's authoritative post-write count, by clienteId. The
  // route never refetches, so without this every row shows the count it had at page load
  // for the whole rush.
  const [clasesLabels, setClasesLabels] = React.useState<Record<string, string>>({});
  // A new `clientes` prop is server truth and therefore fresher than anything we patched
  // in, so drop every patch when one arrives. Without this the map outlives its rows: a
  // row tapped once would keep its stale patched label forever, and no later refresh of
  // the route (a sale, an edit) could ever repaint it. Reset DURING render off the prop's
  // identity — React's own adjust-state-on-prop-change idiom, the same one the Agenda uses
  // for its tipos — because an effect would be a second commit AND is rejected outright by
  // react-hooks/set-state-in-effect.
  const [prevClientes, setPrevClientes] = React.useState(clientes);
  if (prevClientes !== clientes) {
    setPrevClientes(clientes);
    setClasesLabels({});
  }

  // Windowed initial paint (useRevealedWindow): the server + first hydration paint only the
  // opening window, then a mount effect reveals the rest below the fold. Search still runs
  // over the FULL dataset from the first keystroke (that is `filtered` above); only how many
  // of it we paint is gated, and `filtered.length` (the empty-state check) stays exact. The
  // CON RESERVA group is never windowed — it is the operator's working set.
  const { visible: sinReservaVisible } = useRevealedWindow(sinReserva);

  // Marks mid-flight, keyed by `${dia}:${id}` — the CONTEXT is deliberately not in the
  // key: since the server may attribute a LIBRE tap to the member's class, two taps on the
  // same member in two contexts are two competing writes on one member, not two
  // independent ones. A second tap before the server answers is ignored, so the
  // already-applied optimistic flip stands instead of racing.
  const inFlight = React.useRef<Set<string>>(new Set());

  // The sale bridge (#237, owner ruling 2026-08-04): a hard-refused tap ('Sin clases disponibles'
  // / 'Paquete vencido') names the member and offers VENDER instead of leaving the operator to
  // re-search them. PERSISTENT — it survives the warning toast's own dismissal — and cleared at
  // the start of the NEXT tap, so it never lingers over an unrelated member's row.
  const [ventaSugerida, setVentaSugerida] = React.useState<VentaSugerida | null>(null);

  // The tap: mark the member in the selected day's selected context, or — the same gesture
  // — undo that visit (Wodify's "click again to undo a sign-in"). At most one visit per
  // (member, context), so the undo is exactly per-visit. A past day rides the identical
  // path with ctxSel pinned to LIBRE and no sessionId, i.e. the 2-arg back-entry toggle.
  const onTap = React.useCallback(
    async (c: PaseClienteDTO) => {
      const key = `${selIso}:${c.id}`;
      if (inFlight.current.has(key)) return;
      inFlight.current.add(key);
      // This tap supersedes any earlier sale bridge — clear it now so a banner for a
      // PREVIOUS member never survives onto this one, win or lose.
      setVentaSugerida(null);

      // Flip optimistically on this tick so the bounce, tint, avatar fill and the one
      // number move instantly; the server result reconciles below. Read current state from
      // the ref (not closed-over state) so this callback stays referentially stable.
      const previa = visitaDe(visitasRef.current[selIso] ?? [], ctxSel, c.id);
      const willBePresent = previa === undefined;
      const aplicar = (ctx: string, present: boolean, hora: string | null) =>
        setVisitasPorDia((m) => ({
          ...m,
          [selIso]: setVisita(m[selIso] ?? [], ctx, c.id, present, hora),
        }));
      aplicar(ctxSel, willBePresent, null);

      try {
        const res = await togglePaseAction({
          clienteId: c.id,
          fecha: selIso,
          ...(ctxSel !== LIBRE && { sessionId: ctxSel }),
        });
        if (!res.ok) {
          // The RPC refused with a reason ('Paquete vencido' at the C9 vence gate, or
          // 'Ya marcada en la clase de 18:00' when the member's booking is already
          // marked) — a typed result, because prod Next.js masks thrown action messages.
          // Roll the optimistic flip back (restoring the undone visit's hora) and say WHY.
          aplicar(ctxSel, !willBePresent, previa?.hora ?? null);
          forgeToast({ tone: "warning", title: "No se pudo registrar", body: res.message });
          // #237: a zero-balance or lapsed-vigencia refusal gets a persistent sale bridge
          // alongside the toast — an operator's easiest recovery is the sale, not a re-search.
          setVentaSugerida(sugerenciaVenta(res.message, c));
          return;
        }
        // Reconcile against the authoritative result. The context the visit LANDED in is
        // the server's, not ours: a LIBRE tap on a member inside their booking's arrival
        // window is attributed to that class (ruling 2026-07-29). When it differs, undo
        // the optimistic LIBRE flip and apply the visit into the class instead — the row
        // then renders as marked-elsewhere (its gold stamp) and that class's pill dot
        // lights, so the screen shows where the mark actually went.
        const ctxLanded = res.sessionId ?? LIBRE;
        if (ctxLanded !== ctxSel) aplicar(ctxSel, !willBePresent, previa?.hora ?? null);
        // This is also where the server's arrival hora lands on the row the optimistic
        // flip appended without one (a back-dated mark has none, and keeps the untimed
        // placeholder).
        aplicar(ctxLanded, res.present, res.hora);
        // Repaint the row's balance from the post-write count. Ilimitado (null) never
        // moves, and a member with no package has no count to show — both keep their
        // label. Mirrors derivarPaseCliente's rule (@gym/data's derive.ts), which is
        // `server-only` and unreachable from this "use client" module — the same
        // deliberate duplication as DIAS_TIRA_INICIAL above.
        const n = res.clasesRestantes;
        if (n !== null && c.paquete !== "Sin paquete") {
          setClasesLabels((l) => ({ ...l, [c.id]: `${n} clase${n === 1 ? "" : "s"}` }));
        }
        if (res.present) {
          const horaClase = ctxLanded !== ctxSel ? sesiones.find((s) => s.id === ctxLanded)?.hora : undefined;
          // The capture receipt (#233/#246 story 6): the outcome word leads, prominent and
          // uppercase (#232 ruling) — the name/CLASE-hora info that was already here joins
          // it in the body, unchanged.
          forgeToast({
            tone: "success",
            title: reciboResultado(res.resultado) ?? "Asistencia registrada",
            body: horaClase
              ? `${firstName(c.nombre)} · CLASE ${horaClase}`
              : `${firstName(c.nombre)}${res.hora ? " · " + res.hora : ""}`,
          });
        }
      } catch {
        // Unexpected failure (network, invalid input) — roll the optimistic flip back.
        aplicar(ctxSel, !willBePresent, previa?.hora ?? null);
        forgeToast({ tone: "warning", title: "No se pudo registrar", body: "Intenta de nuevo." });
      } finally {
        inFlight.current.delete(key);
      }
    },
    [selIso, ctxSel, sesiones],
  );

  // One row. `otras` is pre-joined to a STRING so every prop is primitive and PaseRow's
  // memo actually holds: only the tapped row re-renders.
  const fila = (c: PaseClienteDTO) => {
    const mia = visitaDe(visitas, ctxSel, c.id);
    const otras = visitas
      .filter((v) => v.clienteId === c.id && ctxDe(v) !== ctxSel)
      .map((v) => (v.hora ? `${v.hora} ${etiqueta(ctxDe(v))}` : etiqueta(ctxDe(v))))
      .join(" · ");
    return (
      <PaseRow
        key={c.id}
        cliente={c}
        present={mia !== undefined}
        hora={mia?.hora ?? null}
        otras={otras}
        clasesLabel={clasesLabels[c.id] ?? c.clasesLabel}
        // Only on TODAY's LIBRE tab: inside a class the CON RESERVA group already says
        // it, and `reservas` is today-only so a past day would show today's bookings.
        reservaHora={esHoy && ctxSel === LIBRE ? (reservaPorCliente.get(c.id) ?? null) : null}
        onToggle={onTap}
      />
    );
  };

  return (
    <div>
      {/* Header: the title and the calendar. Every count that used to stack here moved
          into the one number below (no hero card, no % meter — design §3). */}
      <div className="flex items-start justify-between" style={{ padding: "14px 22px 4px", gap: 8 }}>
        <H1 size={38}>ASISTENCIA</H1>
        <button
          onClick={() => setCalOpen(true)}
          aria-label="Abrir calendario"
          className="forge-hit forge-pressable flex shrink-0 items-center justify-center border bg-surface"
          style={{
            width: 38,
            height: 38,
            padding: 0,
            cursor: "pointer",
            borderColor: !esHoy ? "var(--yellow)" : "var(--line)",
          }}
        >
          <Icon name="cal" size={17} color={!esHoy ? "var(--gold)" : "var(--muted)"} />
        </button>
      </div>

      {/* Day strip */}
      <DayStrip hoy={hoy} countFor={countFor} selDate={selDate} onSelect={setSelDate} />

      {/* Context block: the thin pill selector + the one number. */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "var(--canvas)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        {/* One-line pills. A context with marks gets a dot (the day strip's has-marks
            idiom), never a count. With no schedule — or on a past day — the row does not
            render at all: the screen is ACCESO LIBRE + list, intentional. */}
        {esHoy && sesiones.length > 0 && (
          <div
            className="forge-scroll flex overflow-x-auto"
            style={{ gap: 6, padding: "4px 16px 8px", scrollSnapType: "x proximity" }}
          >
            {[{ id: LIBRE, hora: "", tipo: "ACCESO LIBRE" }, ...sesiones].map((s) => {
              const on = s.id === ctx;
              const marcado = visitas.some((v) => ctxDe(v) === s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => setCtx(s.id)}
                  className="flex shrink-0 items-center uppercase"
                  style={{
                    gap: 6,
                    padding: "8px 12px",
                    scrollSnapAlign: "start",
                    background: on ? "var(--yellow)" : "transparent",
                    border: `1px solid ${on ? "var(--yellow)" : "var(--line)"}`,
                    color: on ? "var(--ink)" : "var(--fg)",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    transition:
                      "background-color 150ms cubic-bezier(.32,.72,0,1), border-color 150ms cubic-bezier(.32,.72,0,1)",
                  }}
                >
                  {s.hora && (
                    <Tnum style={{ fontSize: 10, fontWeight: 800, opacity: on ? 0.7 : 1, color: on ? "var(--ink)" : "var(--muted)" }}>
                      {s.hora}
                    </Tnum>
                  )}
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6 }}>{s.tipo}</span>
                  {marcado && (
                    <span style={{ width: 4, height: 4, borderRadius: 999, background: on ? "var(--ink)" : "var(--gold)" }} />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* The ONE number: presentes in this context (against cupo for a class); on a past
            day, that day's registradas. */}
        <div className="flex items-baseline justify-between" style={{ gap: 8, padding: "8px 22px 10px" }}>
          <div className="flex items-baseline" style={{ gap: 7 }}>
            {esHoy && sesionActual && (
              <Tnum style={{ fontSize: 12, fontWeight: 800, color: "var(--gold)" }}>{sesionActual.hora}</Tnum>
            )}
            <span className="uppercase" style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.8 }}>
              {!esHoy ? fmtFull(selDate) : sesionActual ? sesionActual.tipo : "ACCESO LIBRE"}
            </span>
          </div>
          <div className="flex items-baseline" style={{ gap: 3 }}>
            <Tnum style={{ fontSize: 17, fontWeight: 800, lineHeight: 1, color: "var(--gold)" }}>
              {esHoy ? presentesEnCtx : countFor(selIso)}
            </Tnum>
            {esHoy && sesionActual && (
              <Tnum style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)" }}>/ {sesionActual.capacidad}</Tnum>
            )}
          </div>
        </div>
      </div>

      {/* The sale bridge (#237): a hard-refused tap ('Sin clases disponibles' / 'Paquete
          vencido') names the member and offers the fix — persistent until the next tap,
          not tied to the toast's own timeout. */}
      {ventaSugerida && (
        <div
          className="flex items-center justify-between"
          style={{ gap: 8, padding: "10px 22px", background: "var(--yellow-soft)", borderBottom: "1px solid var(--yellow-edge)" }}
        >
          <span className="uppercase" style={{ fontSize: 12, fontWeight: 700 }}>
            {ventaSugerida.nombre} necesita un paquete
          </span>
          <button
            // Its href carries a dynamic `?cliente=` query — `as Route` is Next's own marker for
            // an intentional route Next's static typegen cannot verify (matches apps/client's
            // public-header.tsx idiom).
            onClick={() => router.push(ventaSugerida.href as Route)}
            className="forge-pressable shrink-0 uppercase font-extrabold"
            style={{ padding: "7px 14px", background: "var(--yellow)", color: "var(--ink)", fontSize: 11, letterSpacing: 0.8, cursor: "pointer", border: "none" }}
          >
            Vender
          </button>
        </div>
      )}

      {/* Search is a FILTER over the list, never the path to it. */}
      <div className="flex items-stretch" style={{ padding: "12px 16px 4px", gap: 8 }}>
        <Input icon="search" placeholder="Filtrar…" value={query} onChange={setQuery} style={{ flex: 1 }} />
        <Link
          href="/vender"
          prefetch
          aria-label="Registrar nuevo"
          className="forge-pressable flex shrink-0 items-center justify-center"
          style={{ width: 50, background: "var(--yellow)", color: "var(--ink)", cursor: "pointer" }}
        >
          <Icon name="plus" size={20} color="var(--ink)" />
        </Link>
      </div>

      {/* The list. In a class context the members who BOOKED it lead — the operator's
          working set when the class starts. Marking someone changes their row in place
          (tint + check + hora), never its position. While a picked past day's visits load,
          the same "Cargando…" affordance the agenda roster uses. */}
      <div style={{ paddingTop: 4 }}>
        {diaCargando ? (
          <div style={{ padding: "40px 22px", textAlign: "center", fontSize: 13, color: "var(--muted)" }}>
            Cargando asistencias…
          </div>
        ) : (
          <>
            {conReserva.length > 0 && (
              <>
                <div className="flex items-baseline" style={{ gap: 7, padding: "12px 22px 8px" }}>
                  <Eyebrow>CON RESERVA</Eyebrow>
                  <Tnum style={{ fontSize: 11, fontWeight: 800, color: "var(--gold)" }}>{conReserva.length}</Tnum>
                </div>
                <div style={{ borderTop: "1px solid var(--line)" }}>{conReserva.map(fila)}</div>
                <div style={{ padding: "16px 22px 8px" }}>
                  <Eyebrow>SIN RESERVA</Eyebrow>
                </div>
              </>
            )}
            <div style={{ borderTop: "1px solid var(--line)" }}>{sinReservaVisible.map(fila)}</div>
            {filtered.length === 0 && (
              <div style={{ padding: "40px 22px", textAlign: "center", fontSize: 13, color: "var(--muted)" }}>
                Sin clientes que coincidan.
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ height: 24 }} />

      <Sheet open={calOpen} onClose={() => setCalOpen(false)}>
        <PaseCalendar
          hoy={hoy}
          countFor={countFor}
          selDate={selDate}
          onViewMonth={ensureMonth}
          onPick={(d) => {
            setSelDate(d);
            setCalOpen(false);
          }}
        />
      </Sheet>
    </div>
  );
}

function DayStrip({
  hoy,
  countFor,
  selDate,
  onSelect,
}: {
  hoy: Date;
  /** Presence count for a day's iso — its length-or-count reconciliation (see parent). */
  countFor: (iso: string) => number;
  selDate: Date;
  onSelect: (d: Date) => void;
}) {
  const scroller = React.useRef<HTMLDivElement>(null);
  const selRef = React.useRef<HTMLButtonElement>(null);
  const centered = React.useRef(false);

  const selKey = isoDay(selDate);
  // Center the selected day (today by default). Instant on first mount so
  // entering the screen doesn't animate a full-width scroll; smooth thereafter
  // on a user day-pick (always instant for reduced-motion users — scrollIntoView's
  // behavior is JS-driven, so the global CSS reduced-motion block can't reach it).
  React.useEffect(() => {
    selRef.current?.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: centered.current ? scrollBehavior() : "auto",
    });
    centered.current = true;
  }, [selKey]);

  // Desktop click-drag to pan.
  const drag = React.useRef<{ x: number; left: number; on: boolean }>({ x: 0, left: 0, on: false });
  const onDown = (e: React.PointerEvent) => {
    if (!scroller.current) return;
    drag.current = { x: e.clientX, left: scroller.current.scrollLeft, on: true };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current.on || !scroller.current) return;
    scroller.current.scrollLeft = drag.current.left - (e.clientX - drag.current.x);
  };
  const endDrag = () => (drag.current.on = false);

  const items: React.ReactNode[] = [];
  for (let off = -DIAS_TIRA_INICIAL; off <= 0; off++) {
    const d = addDays(hoy, off);
    if (off === -DIAS_TIRA_INICIAL || d.getDate() === 1) {
      items.push(
        <div key={`m${off}`} className="flex shrink-0 flex-col items-center justify-center" style={{ width: 30 }}>
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1, color: "var(--muted-soft)" }}>{MON[d.getMonth()]}</span>
        </div>,
      );
    }
    const isSel = sameDay(d, selDate);
    const isToday = off === 0;
    const hasMarks = countFor(isoDay(d)) > 0;
    items.push(
      <button
        key={`d${off}`}
        ref={isSel ? selRef : undefined}
        onClick={() => onSelect(d)}
        className="flex shrink-0 flex-col items-center"
        style={{
          width: 46,
          padding: "8px 0 6px",
          gap: 3,
          scrollSnapAlign: "center",
          background: isSel ? "var(--yellow)" : "transparent",
          border: `1px solid ${isSel ? "var(--yellow)" : isToday ? "var(--yellow-edge)" : "var(--line)"}`,
          color: isSel ? "var(--ink)" : "var(--fg)",
          cursor: "pointer",
          transition: "background-color 150ms cubic-bezier(.32,.72,0,1), border-color 150ms cubic-bezier(.32,.72,0,1)",
        }}
      >
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.6, color: isSel ? "var(--ink)" : "var(--muted)" }}>{DOW[d.getDay()]}</span>
        <Tnum style={{ fontSize: 16, fontWeight: 800, lineHeight: 1 }}>{d.getDate()}</Tnum>
        <span style={{ width: 4, height: 4, borderRadius: 999, background: hasMarks ? (isSel ? "var(--ink)" : "var(--gold)") : "transparent" }} />
      </button>,
    );
  }

  return (
    <div
      ref={scroller}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      className="forge-scroll flex cursor-grab overflow-x-auto active:cursor-grabbing"
      style={{ gap: 6, padding: "10px 16px 2px", scrollSnapType: "x proximity" }}
    >
      {items}
    </div>
  );
}

/** One member row. Sub-line = membership + today's visits in OTHER contexts (gold, one
 *  stamp per visit — never a ×2). The right cluster = THIS context: the arrival hora when
 *  marked + the check. Every prop is primitive so the memo holds and a tap re-renders
 *  exactly one row. */
const PaseRow = React.memo(function PaseRow({
  cliente,
  present,
  hora,
  otras,
  clasesLabel,
  reservaHora,
  onToggle,
}: {
  cliente: PaseClienteDTO;
  present: boolean;
  /** Arrival "HH:MM" in the current context, or null when unmarked (or untimed). */
  hora: string | null;
  /** Pre-joined labels of this member's visits in the OTHER contexts today ("" = none). */
  otras: string;
  /** The member's remaining-classes label — the DTO's, or the fresher one a toggle
   *  returned. Passed in (not read off `cliente`) so the repaint is a primitive change
   *  the memo sees. */
  clasesLabel: string;
  /** "HH:MM" of the class this member booked today, or null. Only ever set on the
   *  LIBRE tab, where it warns that a tap will be attributed to that class. */
  reservaHora: string | null;
  onToggle: (c: PaseClienteDTO) => void;
}) {
  const c = cliente;
  return (
    <div
      onClick={() => onToggle(c)}
      className="forge-pressable flex w-full items-center select-none"
      style={{
        gap: 14,
        padding: "12px 22px",
        borderBottom: "1px solid var(--line)",
        cursor: "pointer",
        background: present ? "var(--yellow-soft)" : "transparent",
        transition: "background-color 180ms cubic-bezier(.32,.72,0,1)",
      }}
    >
      <Avatar initial={c.inicial} size={40} accent={present} />
      <Link
        href={`/clientes/${c.id}`}
        // No explicit `prefetch`: one per roster row would FULL-prefetch every
        // in-viewport client's ~7-call ficha route. Default 'auto' partial
        // prefetch + loading.tsx keep the tap instant. (Matches clientes.tsx.)
        // Stop the tap bubbling to the row (which would toggle attendance), and
        // arm the in-app breadcrumb so the ficha back returns here (see lib/nav).
        onClick={(e) => {
          e.stopPropagation();
          markInAppNav();
        }}
        className="min-w-0 flex-1 text-left"
        style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--fg)" }}
      >
        <div className="flex items-center" style={{ gap: 7 }}>
          <span className="uppercase font-semibold" style={{ fontSize: 14, letterSpacing: 0.4 }}>{c.nombre}</span>
          {reservaHora && (
            <span
              className="shrink-0 uppercase"
              style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 0.8, color: "var(--gold)", border: "1px solid var(--yellow-edge)", padding: "1px 4px", whiteSpace: "nowrap" }}
            >
              Reserva {reservaHora}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>
          {clasesLabel}
          {c.porRenovar && <span style={{ color: "var(--gold)", fontWeight: 700 }}> · VENCE {c.diasRest}D</span>}
          {otras && (
            <span className="uppercase" style={{ color: "var(--gold)", fontWeight: 700 }}> · {otras}</span>
          )}
        </div>
      </Link>
      <div className="flex shrink-0 items-center" style={{ gap: 8 }}>
        {present && hora && (
          <Tnum style={{ fontSize: 11, fontWeight: 700, color: "var(--gold)" }}>{hora}</Tnum>
        )}
        <div
          className="flex items-center justify-center"
          style={{
            width: 28,
            height: 28,
            background: present ? "var(--yellow)" : "transparent",
            border: `1.5px solid ${present ? "var(--yellow)" : "var(--muted-soft)"}`,
            transition: "background-color 180ms cubic-bezier(.32,.72,0,1), border-color 180ms cubic-bezier(.32,.72,0,1)",
          }}
        >
          {/* Check mark scales/fades both ways so uncheck mirrors check (forge-pop
              on entry; a symmetric scale-down + fade on exit). */}
          <span
            aria-hidden
            className="flex items-center justify-center"
            style={{
              transformOrigin: "center",
              transform: present ? "scale(1)" : "scale(0.4)",
              opacity: present ? 1 : 0,
              animation: present ? "forge-pop 280ms cubic-bezier(.32,.72,0,1)" : "none",
              transition: "transform 160ms cubic-bezier(.32,.72,0,1), opacity 160ms cubic-bezier(.32,.72,0,1)",
            }}
          >
            <Icon name="check" size={16} color="var(--ink)" />
          </span>
        </div>
      </div>
    </div>
  );
});

function PaseCalendar({
  hoy,
  countFor,
  selDate,
  onViewMonth,
  onPick,
}: {
  hoy: Date;
  /** Presence count for a day's iso — its length-or-count reconciliation (see parent). */
  countFor: (iso: string) => number;
  selDate: Date;
  /** Notified with the first-of-month whenever the viewed month changes, so the parent
   *  can lazy-load a past month's marks and its dots fill in. */
  onViewMonth: (d: Date) => void;
  onPick: (d: Date) => void;
}) {
  const [view, setView] = React.useState({ y: selDate.getFullYear(), m: selDate.getMonth() });

  // Load the viewed month's marks on open and on every nav. The current month (initial
  // view) is already in the window, so this is a no-op until the user steps to an older
  // one — which then fills its dots (an empty→filled flash on far-past months is fine).
  React.useEffect(() => {
    onViewMonth(new Date(view.y, view.m, 1));
  }, [view, onViewMonth]);

  const first = new Date(view.y, view.m, 1);
  const lead = first.getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const atCurrentMonth = view.y === hoy.getFullYear() && view.m === hoy.getMonth();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(view.y, view.m, d));

  const stepMonth = (delta: number) => {
    const next = new Date(view.y, view.m + delta, 1);
    if (next > hoy) return;
    setView({ y: next.getFullYear(), m: next.getMonth() });
  };

  const selCount = countFor(isoDay(selDate));

  return (
    <div style={{ padding: "8px 18px 6px" }}>
      {/* month nav */}
      <div className="flex items-center justify-between" style={{ padding: "6px 2px 14px" }}>
        <button onClick={() => stepMonth(-1)} aria-label="Mes anterior" className="forge-hit forge-pressable flex items-center justify-center border border-line bg-surface" style={{ width: 34, height: 34, cursor: "pointer" }}>
          <Icon name="back" size={16} color="var(--fg)" />
        </button>
        <div className="uppercase font-extrabold" style={{ fontSize: 15, letterSpacing: 1 }}>
          {MON[view.m]} {view.y}
        </div>
        <button
          onClick={() => stepMonth(1)}
          disabled={atCurrentMonth}
          aria-label="Mes siguiente"
          className="forge-hit forge-pressable flex items-center justify-center border border-line bg-surface"
          style={{ width: 34, height: 34, cursor: atCurrentMonth ? "not-allowed" : "pointer", opacity: atCurrentMonth ? 0.35 : 1 }}
        >
          <Icon name="chev" size={16} color="var(--fg)" />
        </button>
      </div>

      {/* weekday header */}
      <div className="grid" style={{ gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
        {DOW.map((d) => (
          <div key={d} style={{ textAlign: "center", fontSize: 9, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.5 }}>{d}</div>
        ))}
      </div>

      {/* days */}
      <div className="grid" style={{ gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={`b${i}`} />;
          const future = d > hoy;
          const isSel = sameDay(d, selDate);
          const isToday = sameDay(d, hoy);
          const has = countFor(isoDay(d)) > 0;
          return (
            <button
              key={isoDay(d)}
              onClick={() => !future && onPick(d)}
              disabled={future}
              className="relative flex aspect-square items-center justify-center"
              style={{
                background: isSel ? "var(--yellow)" : "transparent",
                border: `1px solid ${isSel ? "var(--yellow)" : isToday ? "var(--yellow-edge)" : "var(--line)"}`,
                color: isSel ? "var(--ink)" : future ? "var(--muted-soft)" : "var(--fg)",
                cursor: future ? "default" : "pointer",
                transition: "background-color 150ms cubic-bezier(.32,.72,0,1), border-color 150ms cubic-bezier(.32,.72,0,1)",
              }}
            >
              <Tnum style={{ fontSize: 14, fontWeight: 700 }}>{d.getDate()}</Tnum>
              {has && !isSel && (
                <span className="absolute" style={{ bottom: 4, width: 4, height: 4, borderRadius: 999, background: "var(--gold)" }} />
              )}
            </button>
          );
        })}
      </div>

      {/* footer */}
      <div className="flex items-center justify-between" style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
        <div>
          <div className="uppercase" style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.4 }}>{fmtFull(selDate)}</div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
            <Tnum style={{ color: "var(--gold)", fontWeight: 700 }}>{selCount}</Tnum> asistencias registradas
          </div>
        </div>
        <button
          onClick={() => onPick(hoy)}
          className="forge-pressable uppercase font-extrabold"
          style={{ padding: "10px 16px", background: "var(--yellow)", color: "var(--ink)", fontSize: 12, letterSpacing: 1, cursor: "pointer" }}
        >
          HOY
        </button>
      </div>
    </div>
  );
}
