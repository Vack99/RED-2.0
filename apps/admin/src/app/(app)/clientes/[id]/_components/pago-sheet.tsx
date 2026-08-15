"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@gym/ui/forge/icon";
import { Sheet } from "@gym/ui/forge/sheet";
import { forgeToast } from "@gym/ui/forge/toaster";
import { Button, Eyebrow, H1, Input, Tnum } from "@gym/ui/forge/ui";
import type { FichaPago } from "@gym/data/server/derive";
import type { PaqueteDTO } from "@gym/data/server/paquetes";
import { calcVigenciaEnd } from "@gym/domain/rules";
import { fmtShort, isoDay, parseDay, pesos } from "@gym/format";
import { InicioCalendar } from "../../../_components/inicio-calendar";
import { MetodoEditor } from "../../../_components/metodo-editor";
import { PaqueteTiles } from "../../../_components/paquete-tiles";
import {
  CUSTOM_VACIO,
  customSeleccion,
  PERSONALIZADO,
  type CustomForm,
} from "../../../vender/_components/vender-vm";
import { editarVentaAction, eliminarVentaAction } from "../actions";
import {
  clawbackPisaCero,
  customPaqueteValido,
  debeSeedCustom,
  dentroDeVentanaEliminar,
  esVentaMasReciente,
  fechaEditada,
  fechaSeed,
  inicioMinIso,
  montoEditado,
  previewEliminarVenta,
  previewRederivarVenta,
  razonSwapBloqueado,
  rederivaSaldo,
  siguientePaqSel,
  swapDirty,
  vigenciaDiasVenta,
} from "./pago-sheet-vm";

/**
 * One sale, opened from HISTORIAL DE PAGOS (#269) — the desk's correction surface.
 *
 * Three modes, the agenda's QuickGlanceSheet → EditorSheet shape: `detalle` is what a tap
 * opens (the whole sale, read-only — most taps are a look, not a correction), and EDITAR is
 * the deliberate step into `editar`. `confirmar` is the delete's own panel.
 *
 * It's the gym's data (owner ruling 2026-08-13): monto, método, the sold fecha AND the
 * package are correctable at ANY age (the swap itself windowed 30 d from registration,
 * paquete-swap ruling 2/D0.7), and only DESTRUCTION is windowed (#266.2/3). So GUARDAR is
 * always available and ELIMINAR is simply ABSENT past 30 days from registration — never a
 * disabled button explaining a rule; the same discipline governs the floor-clip gate (ruling
 * 3): once the balance can't absorb the clawback, the button is REPLACED by a muted note, not
 * disabled. Deleting swaps this panel for a confirm that previews the exact clawback (#267.6)
 * instead of a `window.confirm`, because the numbers are the whole decision. A package swap
 * gets the same discipline inline (not a second confirm step): the re-derive preview renders
 * live above GUARDAR as the operator picks — re-correctable, unlike a delete, so it doesn't
 * earn a modal.
 */
export function PagoSheet({
  open,
  onClose,
  pago,
  clasesRestantes,
  vence,
  hoyIso,
  paquetes,
  pagos,
}: {
  open: boolean;
  onClose: () => void;
  /** The tapped sale — held past `open: false` so the close animation has content to slide. */
  pago: FichaPago | null;
  /** The client's stored balance the preview subtracts from (null = ilimitado). */
  clasesRestantes: number | null;
  /** The client's stored vence ("YYYY-MM-DD"), or null. */
  vence: string | null;
  /** The gym's calendar day — the date picker's upper bound (never `new Date()`: that is the
   *  operator's timezone, not the gym's). */
  hoyIso: string;
  /** The gym's package catalog — the swap picker's tiles (paquete-swap spec §5.3). */
  paquetes: PaqueteDTO[];
  /** `ficha.pagos` — the SAME list the historial renders, already read `created_at desc, id
   *  desc` (derive.ts). FIX4: the sheet reads this to tell whether `pago` is the cliente's own
   *  most-recent sale, the RPC's own "only the top of the stack can re-derive" precondition. */
  pagos: FichaPago[];
}) {
  const router = useRouter();
  const [modo, setModo] = React.useState<"detalle" | "editar" | "confirmar">("detalle");
  const [monto, setMonto] = React.useState("");
  const [metodo, setMetodo] = React.useState<FichaPago["metodo"] | null>(null);
  const [fecha, setFecha] = React.useState("");
  const [calOpen, setCalOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  // The package swap picker (paquete-swap spec §5.3). `paqSel` starts null — `ventas` stores
  // no `paquete_id`, so any "which tile is the current one" match would be a guess; a
  // selection always means "swap to this," never "this is what's already there."
  const [paqSel, setPaqSel] = React.useState<string | null>(null);
  const [custom, setCustom] = React.useState<CustomForm>(CUSTOM_VACIO);
  // Whether the custom form has already been seeded from the CURRENT sale once this `editar`
  // session started (FIX3c). A ref, not state: flipping it must never itself trigger a
  // re-render, and `debeSeedCustom` is the pure decision this only feeds — switching to a
  // registrado tile and back to PERSONALIZADO must NOT re-seed and wipe what was typed.
  const customSeeded = React.useRef(false);

  // Every tap on a pago row lands on `detalle`, never on a half-edited form.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset on open (mirrors EditarClienteSheet)
    if (open) setModo("detalle");
  }, [open]);

  // The fields are seeded ENTERING `editar`, not on open — so leaving via CANCELAR really
  // discards (the next EDITAR re-reads the stored sale) with no second reset path to keep in step.
  const abrirEditar = () => {
    if (!pago) return;
    setMonto(String(pago.monto));
    setMetodo(pago.metodo);
    setFecha(pago.fechaIso);
    setCalOpen(false);
    // No preselection (spec §5.3) — a stored venta has no `paquete_id`, so any "which tile
    // is current" match would be a guess. Selection always means "swap to this."
    setPaqSel(null);
    setCustom(CUSTOM_VACIO);
    customSeeded.current = false;
    setModo("editar");
  };

  // Picking a tile (paquete-swap spec §5.3, FIX3). Tapping the tile ALREADY selected
  // DESELECTS it (`siguientePaqSel`, FIX3a) — back to null, "sin cambio: manten el paquete
  // actual" — instead of re-running the monto reseed below; every OTHER tap is a real
  // selection change. A registrado pick reseeds MONTO to the package's own price (ruling 4 —
  // still editable, FIX3b: only on that real change, never on a deselect or a re-tap).
  // PERSONALIZADO leaves MONTO alone, since it IS the personalizado price, and seeds the
  // custom form from the CURRENT sale's own facts EXACTLY ONCE per `editar` session
  // (`debeSeedCustom`, FIX3c) — so switching to a registrado tile and back does not wipe
  // whatever the operator already typed.
  const selectPaq = (id: string) => {
    const next = siguientePaqSel(paqSel, id);
    if (next !== null && next !== PERSONALIZADO) {
      const p = paquetes.find((pp) => pp.id === next);
      if (p) setMonto(String(p.precio));
    } else if (next === PERSONALIZADO && debeSeedCustom(customSeeded.current, next) && pago) {
      setCustom({
        nombre: pago.paquete,
        precio: monto,
        clases: pago.clases === null ? "" : String(pago.clases),
        ilimitado: pago.clases === null,
        dias: String(vigenciaDiasVenta(pago.vigenciaTipo, pago.vigenciaDias)),
      });
      customSeeded.current = true;
    }
    setPaqSel(next);
  };

  const montoLabelRef = React.useRef<HTMLLabelElement | null>(null);
  // The Sheet's own autofocus (sheet.tsx:142-166) fires exactly once, on the initial
  // slide-in — and every open lands on `detalle` (the effect above), so the editar
  // panel doesn't exist yet when it runs. Entering `editar` later leaves nothing
  // focused; restore it ourselves. `[data-autofocus]` on the MONTO Input below is the
  // SAME marker the Sheet queries, kept for the shared idiom even though this effect
  // — not the Sheet's — is what calls `.focus()` here. FIX5f: MONTO now sits BELOW the
  // PAQUETE tile catalog, so `preventScroll` alone can leave it stranded above the fold once
  // the on-screen keyboard rises — scroll it into view explicitly, after focusing.
  React.useEffect(() => {
    if (modo !== "editar") return;
    const input = montoLabelRef.current?.querySelector<HTMLInputElement>("[data-autofocus]");
    input?.focus({ preventScroll: true });
    input?.scrollIntoView({ block: "center" });
  }, [modo]);

  const montoNum = montoEditado(monto);
  const fechaNueva = pago ? fechaEditada(pago.fechaIso, fecha) : undefined;
  const inicioMin = inicioMinIso(hoyIso);
  const dias = pago ? vigenciaDiasVenta(pago.vigenciaTipo, pago.vigenciaDias) : 0;

  // Render-time clock read, the agenda's `ahora` idiom (#238): this decides only what to SHOW,
  // and the RPC re-checks both windows server-side — so nothing refreshes it. The swap window
  // reuses the SAME 30-days-from-registration bound as the delete window (paquete-swap D0.7).
  const dentroVentana = !!pago && dentroDeVentanaEliminar(pago.createdAt, new Date());
  // The floor-clip gate (ruling 3, spec §1.3/§3): once the clawback would push the balance
  // below zero, ELIMINAR is replaced by a muted note rather than disabled.
  const clipeado = !!pago && clawbackPisaCero(pago.clases, clasesRestantes);
  const puedeEliminar = dentroVentana && !clipeado;
  // FIX4: the RPC now also refuses ANY re-derive (package OR fecha change) on a sale that
  // isn't the cliente's own latest, or past the same 30-day window — 'Solo la venta más
  // reciente puede cambiar de paquete o fecha' / 'Ya pasaron 30 días: esta venta ya no se
  // puede recalcular'. `esMasReciente` mirrors the RPC's own `(created_at, id) desc` tiebreak
  // off `pagos`, the SAME list already ordered that way (derive.ts) — no re-sort here.
  const esMasReciente = !!pago && esVentaMasReciente(pago.id, pagos);
  const puedeSwap = dentroVentana && esMasReciente;

  // The custom package's expiry, anchored on the (possibly corrected) sold `fecha` — the
  // re-grant date "vence follows fecha" swaps onto (vender's own `customHasta` idiom).
  const customHasta = (() => {
    const dias2 = Number(custom.dias);
    if (!fecha || !Number.isSafeInteger(dias2) || dias2 < 1) return null;
    return fmtShort(calcVigenciaEnd(parseDay(fecha), dias2));
  })();

  // The PERSONALIZADO door's own validity gate (FIX2) — nombre/clases/días/ilimitado ONLY,
  // NEVER precio: the sheet's MONTO field above already IS the price
  // (`mostrarPrecio={false}` hides the form's own PRECIO input), so gating on
  // vender's `customValido` here silently disabled GUARDAR off a field the operator never
  // sees — a MONTO like "850.00" fails `entero()`'s digits-only regex even though
  // `montoEditado` accepts it, and a MONTO over 100 000 failed vender's personalizado cap.
  // MONTO's own validity is `montoEditado`'s job, uncapped, entirely separate.
  const swapResuelto = paqSel !== PERSONALIZADO || customPaqueteValido(custom);
  // `fecha` is "" until `abrirEditar` first seeds it — guard every date-parsing computation
  // below on it being populated, or the very first render (still in `detalle`, before EDITAR
  // is ever tapped) would hand `parseDay`/`fmtShort` an empty string.
  const nuevo =
    !pago || !fecha
      ? null
      : (() => {
          if (paqSel === null) return { clases: pago.clases, vigTipo: pago.vigenciaTipo, vigDias: pago.vigenciaDias };
          if (paqSel === PERSONALIZADO) {
            const c = Number(custom.clases);
            const d = Number(custom.dias);
            return {
              clases: custom.ilimitado ? null : Number.isSafeInteger(c) ? c : null,
              vigTipo: "dias" as const,
              vigDias: Number.isSafeInteger(d) ? d : null,
            };
          }
          const p = paquetes.find((pp) => pp.id === paqSel);
          // FIX1: the RAW facts, straight off the DTO — never re-derived by parsing the
          // DISPLAY `vigencia` string ("30 días" reads identically for a 'dias' package of 30
          // and a 'mes' package, but the RPC keys its whole re-derive off `vigencia_tipo`, not
          // the day count alone; a 'mes' catalog row used to silently disagree with the RPC).
          return p ? { clases: p.clases, vigTipo: p.vigenciaTipo, vigDias: p.vigenciaDias } : null;
        })();

  const cambia =
    !!pago &&
    !!fecha &&
    !!nuevo &&
    rederivaSaldo({
      ventaClases: pago.clases,
      ventaVigTipo: pago.vigenciaTipo,
      ventaVigDias: pago.vigenciaDias,
      nuevoClases: nuevo.clases,
      nuevoVigTipo: nuevo.vigTipo,
      nuevoVigDias: nuevo.vigDias,
      fechaOriginalIso: pago.fechaIso,
      fechaIso: fecha,
    });

  const previewSwap =
    pago && fecha && nuevo && cambia && swapResuelto
      ? previewRederivarVenta({
          clasesRestantes,
          vence,
          viejo: { clases: pago.clases, dias: vigenciaDiasVenta(pago.vigenciaTipo, pago.vigenciaDias) },
          nuevo: { clases: nuevo.clases, dias: vigenciaDiasVenta(nuevo.vigTipo, nuevo.vigDias) },
          fechaIso: fecha,
        })
      : null;

  const dirty =
    !!pago &&
    (montoNum !== pago.monto || metodo !== pago.metodo || fechaNueva !== undefined || swapDirty(paqSel, custom));
  const canSave =
    !!pago && montoNum !== null && dirty && !busy && (paqSel !== PERSONALIZADO || customPaqueteValido(custom));

  const guardar = async () => {
    if (!canSave || !pago || montoNum === null || !metodo) return;
    setBusy(true);
    try {
      // `fecha` rides only when the operator actually moved it — omitted, the RPC keeps the
      // stored timestamp untouched (mirrors vender's `esBackdate` spread). `paquete` rides only
      // when a tile was picked — omitted, the RPC's D0.5 no-op path never claws back/re-grants.
      // The personalizado arm's `precio` is IGNORED on this door (MONTO above is the price;
      // `editarVentaSchema`'s own personalizado arm drops the bound, FIX2) — still synced from
      // the live MONTO field here rather than left blank, since a wire payload that names a
      // price is cheaper to read in a log than one that silently omits it.
      const res = await editarVentaAction({
        ventaId: pago.id,
        monto: montoNum,
        metodo,
        fecha: fechaNueva,
        paquete:
          paqSel === null
            ? undefined
            : paqSel === PERSONALIZADO
              ? customSeleccion({ ...custom, precio: monto })
              : { tipo: "registrado" as const, paqueteId: paqSel },
      });
      if (!res.ok) {
        // The RPC refused with a reason it wrote for a human ('No autorizado', 'Método
        // inválido', …) — keep the sheet open and toast it verbatim, like the vender path.
        forgeToast({ tone: "warning", title: "No se pudo guardar", body: res.mensaje });
        return;
      }
      // Reads the NEW package name once a swap was posted — falls back to the sale's own
      // stored name when nothing was swapped. FIX5c: shown AS STORED (trimmed), never
      // uppercased — the nombre the operator typed is what the client's own cuenta will show.
      const nombreNuevo =
        paqSel === null
          ? pago.paquete
          : paqSel === PERSONALIZADO
            ? custom.nombre.trim()
            : (paquetes.find((p) => p.id === paqSel)?.nombre ?? pago.paquete);
      forgeToast({ tone: "success", title: "Venta actualizada", body: `${nombreNuevo} · ${pesos(montoNum)}` });
      onClose();
      router.refresh();
    } catch {
      forgeToast({ tone: "warning", title: "No se pudo guardar", body: "Intenta de nuevo." });
    } finally {
      setBusy(false);
    }
  };

  const eliminar = async () => {
    if (!pago || busy) return;
    setBusy(true);
    try {
      const res = await eliminarVentaAction({ ventaId: pago.id });
      if (!res.ok) {
        forgeToast({ tone: "warning", title: "No se pudo eliminar", body: res.mensaje });
        return;
      }
      forgeToast({ tone: "success", title: "Venta eliminada", body: `${pago.paquete} · ${pago.montoDisplay}` });
      onClose();
      router.refresh();
    } catch {
      forgeToast({ tone: "warning", title: "No se pudo eliminar", body: "Intenta de nuevo." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose}>
      {pago &&
        (modo === "confirmar" ? (
          /* Confirm step — the duplicate-guard idiom (vender.tsx): one alert banner, then the
             two choices stacked. The banner IS the disclosure (#267.6 + #266.1). */
          <div style={{ padding: "8px 22px 24px" }}>
            <div className="flex items-start" style={{ gap: 10, padding: "14px 15px", background: "var(--yellow-soft)", border: "1px solid var(--yellow)" }}>
              <Icon name="alert" size={18} color="var(--gold)" />
              <div className="min-w-0 flex-1">
                <div className="font-bold" style={{ fontSize: 13.5, color: "var(--fg)", letterSpacing: 0.2 }}>
                  ¿Eliminar esta venta?
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3, lineHeight: 1.5 }}>
                  {previewEliminarVenta({
                    clases: pago.clases,
                    dias,
                    clasesRestantes,
                    vence,
                    monto: pago.monto,
                    mes: pago.mes,
                  })}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6, lineHeight: 1.5 }}>
                  No se puede deshacer.
                </div>
              </div>
            </div>
            <div className="flex flex-col" style={{ gap: 10, marginTop: 18 }}>
              <Button variant="danger" full disabled={busy} onClick={eliminar}>
                {busy ? "ELIMINANDO…" : "SÍ, ELIMINAR"}
              </Button>
              <Button variant="secondary" full disabled={busy} onClick={() => setModo("detalle")}>
                CANCELAR
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ padding: "8px 22px 16px" }}>
              <Eyebrow color="var(--gold)">VENTA</Eyebrow>
              <H1 size={22} style={{ marginTop: 6, letterSpacing: -0.3 }}>
                {pago.paquete}
              </H1>
            </div>

            {modo === "detalle" ? (
              <>
                {/* The whole sale, read-only — a tap on a pago row is a LOOK far more often
                    than a correction, so nothing is editable until EDITAR is pressed. */}
                <div style={{ padding: "0 22px" }}>
                  <Dato k="FOLIO" v={`F-${pago.folio}`} />
                  <Dato k="FECHA" v={pago.fechaDisplay} />
                  <Dato k="CLASES" v={pago.clases === null ? "Ilimitado" : String(pago.clases)} />
                  <Dato k="VIGENCIA" v={`${dias} días`} />
                  <Dato k="MONTO" v={pago.montoDisplay} />
                  <Dato k="MÉTODO" v={pago.metodoDisplay} />
                </div>

                <div style={{ padding: "20px 16px 0" }}>
                  <Button variant="primary" size="lg" full icon="edit" onClick={abrirEditar}>
                    EDITAR
                  </Button>

                  {/* A wrong PAQUETE is now EDITAR's own picker (paquete-swap spec §5.3) — the
                      old "vuelve a venderle" deep-link is gone; it would be wrong advice now
                      that the sheet can swap in place. ELIMINAR itself is windowed (30 d from
                      registration) AND floor-clipped (ruling 3): past the window nothing
                      renders here at all — same "absent, not disabled" discipline the note
                      below applies inside the window. */}
                  {dentroVentana && (
                    <div style={{ marginTop: 14 }}>
                      {puedeEliminar ? (
                        <Button variant="danger" size="sm" full icon="trash" onClick={() => setModo("confirmar")}>
                          ELIMINAR VENTA
                        </Button>
                      ) : (
                        <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5 }}>
                          Esta venta ya no se puede eliminar: se usaron clases de ella. Cambia el paquete.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* What a correction can change: monto, método, the sold fecha, AND the package,
                    at any age (#266.3) — the swap itself windowed 30 d from registration
                    (paquete-swap D0.7, same bound as ELIMINAR). */}
                <div className="flex flex-col" style={{ padding: "0 16px", gap: 18 }}>
                  {puedeSwap && (
                    <div className="flex flex-col" style={{ gap: 10 }}>
                      <Eyebrow style={{ paddingLeft: 2 }}>PAQUETE</Eyebrow>
                      {/* The picker starts with NOTHING selected (spec §5.3) — `ventas` stores
                          no `paquete_id`, so guessing "which tile is current" would be a lie.
                          This line states the current facts read-only; a tap below means swap. */}
                      <div style={{ paddingLeft: 2, fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
                        Actual: <span className="font-semibold" style={{ color: "var(--fg)" }}>{pago.paquete}</span>
                        {" · "}
                        {pago.clases === null ? "Ilimitado" : `${pago.clases} ${pago.clases === 1 ? "clase" : "clases"}`} ·{" "}
                        {dias} {dias === 1 ? "día" : "días"}
                      </div>
                      <PaqueteTiles
                        paquetes={paquetes}
                        sel={paqSel}
                        setSel={selectPaq}
                        vigenciaEnd={null}
                        custom={custom}
                        setCustom={setCustom}
                        customHasta={customHasta}
                        mostrarPrecio={false}
                      />
                    </div>
                  )}

                  <label ref={montoLabelRef} className="flex flex-col" style={{ gap: 8 }}>
                    <Eyebrow style={{ paddingLeft: 2 }}>MONTO</Eyebrow>
                    <Input inputMode="numeric" placeholder="850" value={monto} onChange={setMonto} autoFocus />
                  </label>
                  <div className="flex flex-col" style={{ gap: 8 }}>
                    <Eyebrow style={{ paddingLeft: 2 }}>MÉTODO</Eyebrow>
                    <MetodoEditor metodo={metodo} setMetodo={setMetodo} />
                  </div>
                  {puedeSwap ? (
                    <div className="flex flex-col" style={{ gap: 8 }}>
                      <Eyebrow style={{ paddingLeft: 2 }}>FECHA</Eyebrow>
                      {/* Same calendar and the same bounds as vender's backdate (not future,
                          ≤ 30 días back) — inline rather than a nested Sheet, which would fight this
                          one's scrim and Esc handler. */}
                      <div style={{ border: `1px solid ${calOpen ? "var(--yellow)" : "var(--line)"}`, transition: "border-color 140ms ease" }}>
                        <button
                          onClick={() => setCalOpen((o) => !o)}
                          className="forge-pressable flex items-center justify-between text-left"
                          style={{ width: "100%", padding: 15, background: "transparent", border: "none", color: "var(--fg)", cursor: "pointer" }}
                        >
                          <Tnum className="uppercase font-bold" style={{ fontSize: 13, letterSpacing: 0.4, color: fechaNueva ? "var(--gold)" : "var(--fg)" }}>
                            {fmtShort(parseDay(fecha))}
                          </Tnum>
                          <Icon name="cal" size={16} color="var(--muted)" />
                        </button>
                        {calOpen && (
                          <InicioCalendar
                            hoy={parseDay(hoyIso)}
                            min={parseDay(inicioMin)}
                            // Display-only clamp (vender's `inicioEfectivo` idiom): a >30d-old
                            // `fecha` would otherwise open the calendar on a month with every
                            // day disabled. The FECHA text above and the omission logic in
                            // `fechaNueva` keep reading the real `fecha` state.
                            sel={parseDay(fechaSeed(fecha, inicioMin, hoyIso))}
                            onPick={(d) => {
                              setFecha(isoDay(d));
                              setCalOpen(false);
                            }}
                          />
                        )}
                      </div>
                      <div style={{ paddingLeft: 2, fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5 }}>
                        {/* FIX5e: conditional on whether picking GUARDAR right now would actually
                            recalculate anything (`rederivaSaldo`) — asserting "se recalcula" on a
                            no-op fecha (nothing picked yet, or the operator landed back on the
                            stored day) over-promises. Was a static "No mueve el saldo ni la
                            vigencia", FALSE under ruling 1 ("vence follows fecha"). */}
                        {cambia
                          ? "Corrige el día en que se cobró. La vigencia se recalcula desde ese día."
                          : "Corrige el día en que se cobró."}
                      </div>
                    </div>
                  ) : (
                    // FIX4: the picker above is likewise absent — the RPC refuses ANY re-derive
                    // (package or fecha change) on a non-latest sale or past the swap window, so
                    // showing either affordance here would be a dead control the round trip
                    // rejects. One muted line, never a disabled button explaining the rule.
                    <div style={{ paddingLeft: 2, fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5 }}>
                      {razonSwapBloqueado(dentroVentana, esMasReciente)}
                    </div>
                  )}
                </div>

                <div style={{ borderTop: "1px solid var(--line)", margin: "24px 0 0", padding: "20px 16px 0" }}>
                  {/* Inline re-derive preview (spec §5.3) — NOT a second confirm step: a swap is
                      re-correctable (swap back), unlike a delete, so it renders live as the
                      operator picks rather than earning its own modal (#267.6's discipline,
                      applied without the extra step). */}
                  {previewSwap && (
                    <div style={{ marginBottom: 12, fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5 }}>
                      {previewSwap}
                    </div>
                  )}
                  <Button variant="primary" size="lg" full icon="check" disabled={!canSave} onClick={guardar}>
                    {busy ? "GUARDANDO…" : "GUARDAR"}
                  </Button>
                  <div style={{ marginTop: 10 }}>
                    <Button variant="secondary" full disabled={busy} onClick={() => setModo("detalle")}>
                      CANCELAR
                    </Button>
                  </div>
                </div>
              </>
            )}
          </>
        ))}
    </Sheet>
  );
}

/** One fact of the sale: uppercase label, tnum value — the ficha's own detail idiom. */
function Dato({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between" style={{ padding: "11px 0", borderBottom: "1px solid var(--line)" }}>
      <span className="uppercase font-semibold" style={{ fontSize: 10.5, letterSpacing: 1.6, color: "var(--muted)" }}>{k}</span>
      <Tnum className="uppercase font-bold" style={{ fontSize: 13, color: "var(--fg)", letterSpacing: 0.4 }}>{v}</Tnum>
    </div>
  );
}
