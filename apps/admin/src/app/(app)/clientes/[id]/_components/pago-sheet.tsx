"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@gym/ui/forge/icon";
import { Sheet } from "@gym/ui/forge/sheet";
import { forgeToast } from "@gym/ui/forge/toaster";
import { Button, Eyebrow, H1, Input, Tnum } from "@gym/ui/forge/ui";
import type { FichaPago } from "@gym/data/server/derive";
import { fmtShort, isoDay, parseDay, pesos } from "@gym/format";
import { InicioCalendar } from "../../../_components/inicio-calendar";
import { MetodoEditor } from "../../../_components/metodo-editor";
import { editarVentaAction, eliminarVentaAction } from "../actions";
import {
  dentroDeVentanaEliminar,
  fechaEditada,
  inicioMinIso,
  montoEditado,
  previewEliminarVenta,
  vigenciaDiasVenta,
} from "./pago-sheet-vm";

/**
 * One sale, opened from HISTORIAL DE PAGOS (#269) — the desk's correction surface.
 *
 * Three modes, the agenda's QuickGlanceSheet → EditorSheet shape: `detalle` is what a tap
 * opens (the whole sale, read-only — most taps are a look, not a correction), and EDITAR is
 * the deliberate step into `editar`. `confirmar` is the delete's own panel.
 *
 * It's the gym's data (owner ruling 2026-08-13): monto, método and the sold fecha are
 * correctable at ANY age, and only DESTRUCTION is windowed (#266.2/3). So GUARDAR is always
 * available and ELIMINAR is simply ABSENT past 30 days from registration — never a disabled
 * button explaining a rule. Deleting swaps this panel for a confirm that previews the exact
 * clawback (#267.6) instead of a `window.confirm`, because the numbers are the whole decision.
 * A wrong PAQUETE still isn't an edit — the hint deep-links VENDER, which can backdate.
 */
export function PagoSheet({
  open,
  onClose,
  pago,
  clienteId,
  clasesRestantes,
  vence,
  hoyIso,
  altaIso,
}: {
  open: boolean;
  onClose: () => void;
  /** The tapped sale — held past `open: false` so the close animation has content to slide. */
  pago: FichaPago | null;
  clienteId: string;
  /** The client's stored balance the preview subtracts from (null = ilimitado). */
  clasesRestantes: number | null;
  /** The client's stored vence ("YYYY-MM-DD"), or null. */
  vence: string | null;
  /** The gym's calendar day — the date picker's upper bound (never `new Date()`: that is the
   *  operator's timezone, not the gym's). */
  hoyIso: string;
  /** The client's alta as a gym-tz ISO day — the picker's lower bound alongside the 30-day cap. */
  altaIso: string;
}) {
  const router = useRouter();
  const [modo, setModo] = React.useState<"detalle" | "editar" | "confirmar">("detalle");
  const [monto, setMonto] = React.useState("");
  const [metodo, setMetodo] = React.useState<FichaPago["metodo"] | null>(null);
  const [fecha, setFecha] = React.useState("");
  const [calOpen, setCalOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

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
    setModo("editar");
  };

  const montoNum = montoEditado(monto);
  const fechaNueva = pago ? fechaEditada(pago.fechaIso, fecha) : undefined;
  const dirty = !!pago && (montoNum !== pago.monto || metodo !== pago.metodo || fechaNueva !== undefined);
  const canSave = !!pago && montoNum !== null && dirty && !busy;
  // Render-time clock read, the agenda's `ahora` idiom (#238): this decides only what to SHOW,
  // and `eliminar_venta` re-checks the window server-side — so nothing refreshes it.
  const puedeEliminar = !!pago && dentroDeVentanaEliminar(pago.createdAt, new Date());
  const dias = pago ? vigenciaDiasVenta(pago.vigenciaTipo, pago.vigenciaDias) : 0;

  const guardar = async () => {
    if (!canSave || !pago || montoNum === null || !metodo) return;
    setBusy(true);
    try {
      // `fecha` rides only when the operator actually moved it — omitted, the RPC keeps the
      // stored timestamp untouched (mirrors vender's `esBackdate` spread).
      const res = await editarVentaAction({ ventaId: pago.id, monto: montoNum, metodo, fecha: fechaNueva });
      if (!res.ok) {
        // The RPC refused with a reason it wrote for a human ('No autorizado', 'Método
        // inválido', …) — keep the sheet open and toast it verbatim, like the vender path.
        forgeToast({ tone: "warning", title: "No se pudo guardar", body: res.mensaje });
        return;
      }
      forgeToast({ tone: "success", title: "Venta actualizada", body: `${pago.paquete} · ${pesos(montoNum)}` });
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

                  {/* A wrong PAQUETE is not an edit (ruling #266.3) — it's a re-sell on the
                      backdate-capable VENDER flow. Offered at any age; deleting the old one is a
                      separate, windowed act below. */}
                  <button
                    onClick={() => router.push(`/vender?cliente=${clienteId}`)}
                    className="forge-pressable"
                    style={{ width: "100%", marginTop: 14, padding: "4px 2px", background: "transparent", border: "none", textAlign: "left", cursor: "pointer", fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5 }}
                  >
                    ¿Paquete equivocado?{" "}
                    <span className="uppercase font-bold" style={{ color: "var(--gold)", letterSpacing: 0.6 }}>
                      Vuelve a venderle
                    </span>
                  </button>

                  {puedeEliminar && (
                    <div style={{ marginTop: 14 }}>
                      <Button variant="danger" size="sm" full icon="trash" onClick={() => setModo("confirmar")}>
                        ELIMINAR VENTA
                      </Button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* What a correction can change: monto, método and the sold fecha, at any age (#266.3). */}
                <div className="flex flex-col" style={{ padding: "0 16px", gap: 18 }}>
                  <label className="flex flex-col" style={{ gap: 8 }}>
                    <Eyebrow style={{ paddingLeft: 2 }}>MONTO</Eyebrow>
                    <Input inputMode="numeric" placeholder="850" value={monto} onChange={setMonto} />
                  </label>
                  <div className="flex flex-col" style={{ gap: 8 }}>
                    <Eyebrow style={{ paddingLeft: 2 }}>MÉTODO</Eyebrow>
                    <MetodoEditor metodo={metodo} setMetodo={setMetodo} />
                  </div>
                  <div className="flex flex-col" style={{ gap: 8 }}>
                    <Eyebrow style={{ paddingLeft: 2 }}>FECHA</Eyebrow>
                    {/* Same calendar and the same bounds as vender's backdate (not future, ≥ alta,
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
                          min={parseDay(inicioMinIso(hoyIso, altaIso))}
                          sel={parseDay(fecha)}
                          onPick={(d) => {
                            setFecha(isoDay(d));
                            setCalOpen(false);
                          }}
                        />
                      )}
                    </div>
                    <div style={{ paddingLeft: 2, fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5 }}>
                      Corrige el día en que se cobró. No mueve el saldo ni la vigencia.
                    </div>
                  </div>
                </div>

                <div style={{ borderTop: "1px solid var(--line)", margin: "24px 0 0", padding: "20px 16px 0" }}>
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
