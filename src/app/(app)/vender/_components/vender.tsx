"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CountUp } from "@/components/forge/count-up";
import { Icon, type IconName } from "@/components/forge/icon";
import { Sheet } from "@/components/forge/sheet";
import { forgeToast } from "@/components/forge/toaster";
import { Avatar, Button, Eyebrow, H1, Input, Tnum } from "@/components/forge/ui";
import type { ClienteLiteDTO } from "@/lib/data/clientes";
import type { PaqueteDTO } from "@/lib/data/paquetes";
import type { Metodo as MetodoEnum, VentaResult } from "@/lib/data/ventas";
import { isTelValido, pesos } from "@gym/format";
import { crearVentaAction } from "../actions";
import { Recibo } from "./recibo";

type Mode = "new" | "existing";
type Metodo = "Efectivo" | "Tarjeta" | "Transferencia" | "Por pagar";

const METODO_ENUM: Record<Metodo, MetodoEnum> = {
  Efectivo: "efectivo",
  Tarjeta: "tarjeta",
  Transferencia: "transferencia",
  "Por pagar": "pendiente",
};

export function VenderScreen({
  paquetes,
  clientes,
}: {
  paquetes: PaqueteDTO[];
  clientes: ClienteLiteDTO[];
}) {
  const router = useRouter();

  const [mode, setMode] = React.useState<Mode>("new");
  const [nuevo, setNuevo] = React.useState({ nombre: "", tel: "" });
  const [clientId, setClientId] = React.useState<string | null>(null);
  const [sel, setSel] = React.useState<string | null>(null);
  const [metodo, setMetodo] = React.useState<Metodo | null>(null);
  const [openSection, setOpenSection] = React.useState<string | null>("cliente");
  const [submitting, setSubmitting] = React.useState(false);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [pickerQuery, setPickerQuery] = React.useState("");
  const [recibo, setRecibo] = React.useState<VentaResult | null>(null);

  const existing = clientes.find((x) => x.id === clientId) ?? null;
  const paq = sel ? (paquetes.find((p) => p.id === sel) ?? null) : null;
  const vigenciaEnd = paq?.hasta ?? null;

  const clienteValid =
    mode === "new"
      ? nuevo.nombre.trim().length >= 3 && isTelValido(nuevo.tel)
      : !!existing;
  const canSubmit = clienteValid && !!sel && !!metodo && !submitting;

  const clienteSummary = (() => {
    if (mode === "new") {
      const n = nuevo.nombre.trim();
      if (!n) return null;
      return nuevo.tel.trim() ? `${n} · ${nuevo.tel.trim()}` : `${n} · Nuevo`;
    }
    return existing ? `${existing.nombre} · ${existing.tel}` : null;
  })();
  const paqueteSummary = paq ? `${paq.nombre.toUpperCase()} · ${pesos(paq.precio)}` : null;
  const pagoSummary = metodo ? (metodo === "Por pagar" ? "POR PAGAR" : metodo.toUpperCase()) : null;

  const toggle = (k: string) => setOpenSection((s) => (s === k ? null : k));

  // Auto-advance once per section as it first completes. Fired from the events
  // that cause completion (not effects): a guarded 320ms timeout that only
  // advances if the just-completed section is still the open one.
  const advanced = React.useRef<{ cliente: boolean; paquete: boolean; metodo: boolean }>({
    cliente: false,
    paquete: false,
    metodo: false,
  });
  const advanceFrom = (section: "cliente" | "paquete" | "metodo", nextSection: string | null) => {
    if (advanced.current[section]) return;
    advanced.current[section] = true;
    setTimeout(() => setOpenSection((s) => (s === section ? nextSection : s)), 320);
  };

  // "cliente" validity derives from multiple inputs (new: nombre len>=3 AND a
  // valid tel; existing: a picked client). Each event that can flip it computes
  // the would-be-valid state and, if newly valid while still on "cliente",
  // schedules the advance.
  const maybeAdvanceCliente = (wouldBeValid: boolean) => {
    if (wouldBeValid && openSection === "cliente") advanceFrom("cliente", "paquete");
  };

  // Tab switch (new↔existing) can flip validity: e.g. switching to "existing"
  // with a client already picked, or back to "new" with valid fields.
  const handleSetMode = (m: Mode) => {
    setMode(m);
    const wouldBeValid =
      m === "new" ? nuevo.nombre.trim().length >= 3 && isTelValido(nuevo.tel) : !!existing;
    maybeAdvanceCliente(wouldBeValid);
  };

  const selectPaquete = (id: string) => {
    setSel(id);
    if (openSection === "paquete") advanceFrom("paquete", "metodo");
  };

  const selectMetodo = (m: Metodo) => {
    setMetodo(m);
    if (openSection === "metodo") advanceFrom("metodo", null);
  };

  const finish = async () => {
    if (!canSubmit || !sel || !metodo) return;
    setSubmitting(true);
    try {
      const result = await crearVentaAction({
        mode,
        nuevoNombre: mode === "new" ? nuevo.nombre : undefined,
        nuevoTel: mode === "new" ? nuevo.tel : undefined,
        clienteId: mode === "existing" ? (clientId ?? undefined) : undefined,
        paqueteId: sel,
        metodo: METODO_ENUM[metodo],
      });
      setRecibo(result);
    } catch {
      forgeToast({ tone: "warning", title: "No se pudo cobrar", body: "Revisa los datos e intenta de nuevo." });
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setMode("new");
    setNuevo({ nombre: "", tel: "" });
    setClientId(null);
    setSel(null);
    setMetodo(null);
    setOpenSection("cliente");
    advanced.current = { cliente: false, paquete: false, metodo: false };
    setRecibo(null);
  };

  if (recibo) {
    return (
      <Recibo
        result={recibo}
        onClose={resetForm}
        onOtra={resetForm}
        onVerCliente={(id) => router.push(`/clientes/${id}`)}
      />
    );
  }

  const filteredClients = clientes.filter(
    (c) =>
      !pickerQuery ||
      c.nombre.toLowerCase().includes(pickerQuery.toLowerCase()) ||
      c.tel.replace(/\D/g, "").includes(pickerQuery.replace(/\D/g, "")),
  );

  const missing: string[] = [];
  if (!clienteValid) missing.push("cliente");
  if (!sel) missing.push("paquete");
  if (!metodo) missing.push("método");

  return (
    <div className="bg-canvas">
      <div className="flex items-center justify-between" style={{ padding: "14px 22px 4px" }}>
        <Eyebrow>NUEVA VENTA</Eyebrow>
        <div style={{ width: 38 }} />
      </div>
      <div style={{ padding: "20px 22px 28px" }}>
        <H1 size={44}>
          NUEVA
          <br />
          VENTA
        </H1>
      </div>

      {/* Accordion — flows into the shell's <main> scroller (no nested scroll container) */}
      <div>
        <AccordionSection label="CLIENTE" summary={clienteSummary} emptyHint="Agregar cliente" complete={clienteValid} open={openSection === "cliente"} onToggle={() => toggle("cliente")}>
          <ClienteEditor mode={mode} setMode={handleSetMode} nuevo={nuevo} setNuevo={setNuevo} existing={existing} openPicker={() => setPickerOpen(true)} onMaybeValid={maybeAdvanceCliente} />
        </AccordionSection>

        <AccordionSection label="PAQUETE" summary={paqueteSummary} emptyHint="Elegir paquete" complete={!!sel} open={openSection === "paquete"} onToggle={() => toggle("paquete")}>
          <PaqueteEditor paquetes={paquetes} sel={sel} setSel={selectPaquete} vigenciaEnd={vigenciaEnd} />
        </AccordionSection>

        <AccordionSection label="MÉTODO" summary={pagoSummary} emptyHint="Elegir método" complete={!!metodo} open={openSection === "metodo"} onToggle={() => toggle("metodo")} last>
          <MetodoEditor metodo={metodo} setMetodo={selectMetodo} />
        </AccordionSection>

        <div style={{ height: 28 }} />
      </div>

      {/* Footer — sticky to the bottom of <main> so COBRAR stays reachable while content scrolls behind it */}
      <div className="bg-canvas" style={{ position: "sticky", bottom: 0, zIndex: 1, borderTop: "1px solid var(--line)", padding: "18px 22px 22px" }}>
        <div className="flex items-baseline justify-between" style={{ marginBottom: 14 }}>
          <Eyebrow>TOTAL</Eyebrow>
          <span className="tnum font-extrabold" style={{ fontSize: 30, color: paq ? "var(--fg)" : "var(--muted-soft)", letterSpacing: -0.6 }}>
            {paq ? (
              // No `key`: reuse the one CountUp instance so switching packages
              // tweens price→price via its fromRef (the continuity the primitive
              // exists for) instead of remounting and flashing $0→price each time.
              <CountUp value={paq.precio} format={pesos} />
            ) : (
              <>$<span style={{ opacity: 0.6 }}>—</span></>
            )}
            <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 6, fontWeight: 600 }}>MXN</span>
          </span>
        </div>
        <Button variant="primary" size="lg" full disabled={!canSubmit} iconRight={submitting ? undefined : "arrow"} onClick={finish}>
          {submitting ? "PROCESANDO…" : paq ? `COBRAR ${pesos(paq.precio)}` : "CONFIRMAR VENTA"}
        </Button>
        {missing.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 11, color: "var(--muted)", letterSpacing: 0.4, textAlign: "center" }}>
            Falta {missing.join(" · ")}
          </div>
        )}
      </div>

      {/* Existing-client picker */}
      <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)}>
        <div style={{ padding: "8px 22px 12px" }}>
          <H1 size={22}>ELIGE CLIENTE</H1>
        </div>
        <div style={{ padding: "0 16px 12px" }}>
          <Input icon="search" placeholder="Nombre o teléfono…" value={pickerQuery} onChange={setPickerQuery} autoFocus />
        </div>
        <div>
          {filteredClients.length === 0 && (
            <div style={{ padding: "40px 24px", textAlign: "center" }}>
              <div className="uppercase font-extrabold" style={{ fontSize: 13, color: "var(--fg)", letterSpacing: 0.4 }}>Sin resultados</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>Crea un cliente nuevo en su lugar.</div>
              <div style={{ marginTop: 14, display: "flex", justifyContent: "center" }}>
                <Button variant="secondary" size="sm" icon="plus" onClick={() => { setPickerOpen(false); setMode("new"); }}>CAMBIAR A NUEVO</Button>
              </div>
            </div>
          )}
          {filteredClients.map((cc) => (
            <button
              key={cc.id}
              onClick={() => { setClientId(cc.id); setMode("existing"); setPickerOpen(false); setPickerQuery(""); maybeAdvanceCliente(true); }}
              className="forge-pressable flex w-full items-center text-left"
              style={{ gap: 12, padding: "14px 22px", background: cc.id === clientId ? "var(--surface)" : "transparent", border: "none", borderBottom: "1px solid var(--line)", cursor: "pointer", color: "var(--fg)" }}
            >
              <Avatar initial={cc.inicial} size={36} />
              <div className="min-w-0 flex-1">
                <div className="uppercase font-semibold" style={{ fontSize: 14, letterSpacing: 0.4 }}>{cc.nombre}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}><Tnum>{cc.tel}</Tnum> · {cc.paqueteLabel}</div>
              </div>
              {cc.id === clientId && <Icon name="check" size={16} color="var(--gold)" />}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

function AccordionSection({
  label,
  summary,
  emptyHint,
  complete,
  open,
  onToggle,
  children,
  last,
}: {
  label: string;
  summary: string | null;
  emptyHint?: string;
  complete: boolean;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div style={{ borderTop: "1px solid var(--line)", borderBottom: last ? "1px solid var(--line)" : "none" }}>
      <button onClick={onToggle} className="flex w-full items-center justify-between text-left" style={{ padding: 22, background: "transparent", border: "none", cursor: "pointer", color: "var(--fg)", gap: 12 }}>
        <div className="flex min-w-0 flex-1 flex-col" style={{ gap: 6 }}>
          <div className="flex items-center" style={{ gap: 8 }}>
            <Eyebrow color={open ? "var(--yellow)" : "var(--muted)"}>{label}</Eyebrow>
            {complete && !open && <span style={{ width: 5, height: 5, borderRadius: 999, background: "var(--yellow)", opacity: 0.7 }} />}
          </div>
          {!open && summary && (
            <span className="overflow-hidden font-semibold" style={{ fontSize: 16, color: "var(--fg)", letterSpacing: 0.2, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{summary}</span>
          )}
          {!open && !summary && (
            <span className="flex items-center font-medium" style={{ fontSize: 14, color: "var(--muted)", letterSpacing: 0.2, gap: 6 }}>
              {emptyHint || "Sin completar"}
              <Icon name="arrow" size={11} color="var(--muted)" />
            </span>
          )}
        </div>
        <div className="flex items-center justify-center" style={{ width: 30, height: 30, transition: "transform 220ms ease", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>
          <Icon name="chev" size={14} color="var(--muted)" />
        </div>
      </button>
      {open && <div style={{ padding: "4px 22px 28px", animation: "forge-enter 220ms ease both" }}>{children}</div>}
    </div>
  );
}

function ClienteEditor({
  mode,
  setMode,
  nuevo,
  setNuevo,
  existing,
  openPicker,
  onMaybeValid,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
  nuevo: { nombre: string; tel: string };
  setNuevo: React.Dispatch<React.SetStateAction<{ nombre: string; tel: string }>>;
  existing: ClienteLiteDTO | null;
  openPicker: () => void;
  onMaybeValid: (wouldBeValid: boolean) => void;
}) {
  return (
    <>
      <div className="flex" style={{ marginBottom: 22, borderBottom: "1px solid var(--line)" }}>
        {([{ k: "new", l: "NUEVO" }, { k: "existing", l: "EXISTENTE" }] as const).map((t) => {
          const on = mode === t.k;
          return (
            <button
              key={t.k}
              onClick={() => setMode(t.k)}
              className="flex-1 font-bold"
              style={{ padding: "10px 0", marginBottom: -1, background: "transparent", border: "none", borderBottom: `2px solid ${on ? "var(--yellow)" : "transparent"}`, color: on ? "var(--yellow)" : "var(--muted)", fontSize: 11, letterSpacing: 1.4, cursor: "pointer" }}
            >
              {t.l}
            </button>
          );
        })}
      </div>

      {mode === "new" && (
        <div className="flex flex-col" style={{ gap: 12 }}>
          <Input placeholder="Nombre completo" value={nuevo.nombre} onChange={(v) => { setNuevo((n) => ({ ...n, nombre: v })); onMaybeValid(v.trim().length >= 3 && isTelValido(nuevo.tel)); }} autoFocus />
          <Input icon="phone" placeholder="614 000 0000" value={nuevo.tel} onChange={(v) => { setNuevo((n) => ({ ...n, tel: v })); onMaybeValid(nuevo.nombre.trim().length >= 3 && isTelValido(v)); }} suffix="MX" inputMode="tel" />
        </div>
      )}

      {mode === "existing" &&
        (existing ? (
          <button onClick={openPicker} className="flex w-full items-center text-left" style={{ padding: "14px 16px", background: "var(--surface)", border: "1px solid var(--line)", gap: 12, cursor: "pointer", color: "var(--fg)" }}>
            <Avatar initial={existing.inicial} accent size={40} />
            <div className="min-w-0 flex-1">
              <div className="uppercase font-bold" style={{ fontSize: 14, letterSpacing: 0.4 }}>{existing.nombre}</div>
              <Tnum style={{ display: "block", fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>{existing.tel}</Tnum>
            </div>
            <span className="font-bold" style={{ fontSize: 10, color: "var(--gold)", letterSpacing: 1.2 }}>CAMBIAR</span>
          </button>
        ) : (
          <button onClick={openPicker} className="flex w-full items-center justify-center" style={{ padding: "22px 16px", background: "transparent", border: "1px dashed var(--line)", gap: 10, cursor: "pointer", color: "var(--gold)" }}>
            <Icon name="search" size={16} color="var(--gold)" />
            <span className="uppercase font-bold" style={{ fontSize: 12, letterSpacing: 1.2 }}>Elegir cliente</span>
          </button>
        ))}
    </>
  );
}

function PaqueteEditor({
  paquetes,
  sel,
  setSel,
  vigenciaEnd,
}: {
  paquetes: PaqueteDTO[];
  sel: string | null;
  setSel: (id: string) => void;
  vigenciaEnd: string | null;
}) {
  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      {paquetes.map((p) => {
        const on = sel === p.id;
        return (
          <button
            key={p.id}
            onClick={() => setSel(p.id)}
            className="forge-pressable flex items-center justify-between text-left"
            style={{ padding: 18, background: "transparent", border: `1px solid ${on ? "var(--yellow)" : "var(--line)"}`, color: "var(--fg)", cursor: "pointer", transition: "border-color 140ms ease" }}
          >
            <div className="flex flex-col" style={{ gap: 4 }}>
              <div className="uppercase font-bold" style={{ fontSize: 16, letterSpacing: -0.1 }}>{p.nombre}</div>
              <div className="uppercase" style={{ fontSize: 11, color: "var(--muted)", letterSpacing: 0.8 }}>{on && vigenciaEnd ? `Hasta ${vigenciaEnd}` : p.vigencia}</div>
            </div>
            <Tnum className="font-extrabold" style={{ fontSize: 22, color: on ? "var(--yellow)" : "var(--fg)", letterSpacing: -0.4 }}>{pesos(p.precio)}</Tnum>
          </button>
        );
      })}
    </div>
  );
}

function MetodoEditor({ metodo, setMetodo }: { metodo: Metodo | null; setMetodo: (m: Metodo) => void }) {
  const opts: { k: Metodo; icon: IconName }[] = [
    { k: "Efectivo", icon: "cash" },
    { k: "Tarjeta", icon: "card" },
    { k: "Transferencia", icon: "swap" },
  ];
  const porPagar = metodo === "Por pagar";
  return (
    <>
      <div className="grid grid-cols-3" style={{ gap: 8 }}>
        {opts.map((o) => {
          const on = metodo === o.k;
          return (
            <button
              key={o.k}
              onClick={() => setMetodo(o.k)}
              className="forge-pressable flex flex-col items-center"
              style={{ padding: "18px 6px", background: "transparent", border: `1px solid ${on ? "var(--yellow)" : "var(--line)"}`, color: on ? "var(--yellow)" : "var(--fg)", cursor: "pointer", gap: 8, transition: "border-color 140ms ease" }}
            >
              <Icon name={o.icon} size={20} color={on ? "var(--gold)" : "var(--muted)"} />
              <span className="uppercase font-bold" style={{ fontSize: 10.5, letterSpacing: 1.2 }}>{o.k}</span>
            </button>
          );
        })}
      </div>
      <button
        onClick={() => setMetodo(porPagar ? "Efectivo" : "Por pagar")}
        className="forge-pressable flex items-center uppercase font-bold"
        style={{ marginTop: 16, padding: "12px 0", background: "transparent", border: "none", color: porPagar ? "var(--yellow)" : "var(--muted)", fontSize: 11, letterSpacing: 1.2, cursor: "pointer", gap: 8 }}
      >
        <span className="flex items-center justify-center" style={{ width: 20, height: 20, border: `1.5px solid ${porPagar ? "var(--yellow)" : "var(--line)"}`, background: porPagar ? "var(--yellow)" : "transparent" }}>
          {porPagar && <Icon name="check" size={12} color="var(--ink)" />}
        </span>
        Registrar como por pagar
      </button>
    </>
  );
}
