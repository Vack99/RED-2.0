"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CountUp } from "@gym/ui/forge/count-up";
import { Icon, type IconName } from "@gym/ui/forge/icon";
import { Sheet } from "@gym/ui/forge/sheet";
import { forgeToast } from "@gym/ui/forge/toaster";
import { Avatar, Badge, Button, Eyebrow, H1, Input, Tnum } from "@gym/ui/forge/ui";
import type { ClienteLiteDTO } from "@gym/data/server/clientes";
import type { PaqueteDTO } from "@gym/data/server/paquetes";
import type { Metodo as MetodoEnum, ReciboResult } from "@gym/data/server/ventas";
import { calcVigenciaEnd } from "@gym/domain/rules";
import { DOW, fmtFull, fmtNavegadorDia, fmtShort, isoDay, MON, parseDay, pesos, sameDay } from "@gym/format";
import { crearVentaAction } from "../actions";
import { PersonalizadoEditor } from "./personalizado-editor";
import { Recibo } from "./recibo";
import {
  clienteListo,
  CUSTOM_VACIO,
  customSeleccion,
  customValido,
  inicioEfectivo,
  inicioMinIso,
  paqueteListo,
  PERSONALIZADO,
  precioSeleccionado,
  telError,
  type CustomForm,
} from "./vender-vm";

type Mode = "new" | "existing";
type Metodo = "Efectivo" | "Tarjeta" | "Transferencia";

const METODO_ENUM: Record<Metodo, MetodoEnum> = {
  Efectivo: "efectivo",
  Tarjeta: "tarjeta",
  Transferencia: "transferencia",
};

export function VenderScreen({
  paquetes,
  clientes,
  initialClienteId = null,
  hoyGym,
  lockup,
}: {
  paquetes: PaqueteDTO[];
  clientes: ClienteLiteDTO[];
  /** Preselected cliente id from `/vender?cliente=<id>` (#77). Mount-time only
   *  (Q3): read once into the initial state; later same-route query changes are
   *  not a supported flow. */
  initialClienteId?: string | null;
  /** The gym's calendar day ("YYYY-MM-DD"), for the custom package's "Hasta …" hint.
   *  Never `new Date()` in here: that is the operator's timezone, not the gym's. */
  hoyGym: string;
  /** The resolved marca's lockup for the receipt (grill lock (g)). */
  lockup: React.ReactNode;
}) {
  const router = useRouter();

  // Preselect: land on EXISTENTE with this client picked ONLY if the id is a
  // real member in the loaded roster; an unknown/absent id falls back to the
  // blank NUEVO form. Read once at mount (deps intentionally omitted).
  const preselectId = clientes.some((c) => c.id === initialClienteId) ? initialClienteId : null;

  const [mode, setMode] = React.useState<Mode>(preselectId ? "existing" : "new");
  const [nuevo, setNuevo] = React.useState({ nombre: "", tel: "", email: "" });
  // Backfill email for an EXISTENTE renewal (C7) — only surfaced when the picked
  // member has no email on file; forwarded so registrar_venta coalesces it in.
  const [backfillEmail, setBackfillEmail] = React.useState("");
  const [clientId, setClientId] = React.useState<string | null>(preselectId);
  const [sel, setSel] = React.useState<string | null>(null);
  const [custom, setCustom] = React.useState<CustomForm>(CUSTOM_VACIO);
  const [metodo, setMetodo] = React.useState<Metodo | null>(null);
  // Backdated sold date (spec D6). The raw pick defaults to today (== "not backdated");
  // `inicioEfectivo` clamps it against the current client's alta floor so the label,
  // preview, confirm line and submit always agree on the day that will actually be sent.
  const [inicioPick, setInicioPick] = React.useState<string>(hoyGym);
  const [inicioOpen, setInicioOpen] = React.useState(false);
  // Submission-stable idempotency key (C6): one key per sale ATTEMPT. A retry after
  // an error (or the "crear nuevo de todos modos" override) replays the SAME key, so
  // the RPC returns the already-written sale instead of double-charging. Reset only
  // when a fresh sale starts (resetForm).
  const [idemKey, setIdemKey] = React.useState(() => crypto.randomUUID());
  // The RPC's duplicate guard tripped (D2): the matched existing client id, driving
  // the "¿usar existente?" dialog.
  const [duplicado, setDuplicado] = React.useState<{ id: string } | null>(null);
  const [openSection, setOpenSection] = React.useState<string | null>("cliente");
  const [submitting, setSubmitting] = React.useState(false);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [pickerQuery, setPickerQuery] = React.useState("");
  const [recibo, setRecibo] = React.useState<ReciboResult | null>(null);
  // Snapshotted at finish() (never derived at render — resetForm nulls clientId):
  // the receipt reads the selected client's first-purchase state from here (#77).
  const [reciboExtra, setReciboExtra] = React.useState<{ primeraCompra: boolean; cuentaActiva: boolean }>({
    primeraCompra: false,
    cuentaActiva: false,
  });
  // Clients sold to during THIS mount — their loaded `primeraCompra: true` is now
  // stale, so treat them as not-first-purchase for the marker/receipt (#77 §7).
  // State (not a ref) so the marker re-renders and reads are render-safe.
  const [soldIds, setSoldIds] = React.useState<Set<string>>(() => new Set());

  const existing = clientes.find((x) => x.id === clientId) ?? null;
  /** First purchase, minus this-mount stale flags (a client just sold to). */
  const esPrimera = (cli: ClienteLiteDTO | null): boolean =>
    !!cli && cli.primeraCompra && !soldIds.has(cli.id);
  const esCustom = sel === PERSONALIZADO;
  const paq = sel && !esCustom ? (paquetes.find((p) => p.id === sel) ?? null) : null;
  const vigenciaEnd = paq?.hasta ?? null;

  // Backdate resolution (spec D6). `altaIso` is null for a NUEVO sale — only the 30-day
  // floor applies there (the RPC exempts a client born in the same txn). The effective
  // date is what the label, preview, confirm and submit all read.
  const altaIso = existing?.altaIso ?? null;
  const inicioMin = inicioMinIso(hoyGym, altaIso);
  const { iso: inicioIso, backdate: esBackdate } = inicioEfectivo(inicioPick, hoyGym, altaIso);
  const hoyGymDate = parseDay(hoyGym);

  // The custom package's expiry, derived in the GYM's timezone from the typed `dias`.
  // Anchored on the (possibly backdated) sold date, not today — so the "Hasta …" preview
  // reads as-of the day the sale is being registered for. Fresh-sale semantics only (base
  // 0, no stacking); an EXISTENTE backdate with carry is not previewed here (RPC is truth).
  // Plain value (React Compiler memoizes it): a manual useMemo can't be preserved once the
  // dep is the derived `inicioIso`.
  const customHasta = (() => {
    const dias = Number(custom.dias);
    if (!Number.isSafeInteger(dias) || dias < 1) return null;
    return fmtShort(calcVigenciaEnd(parseDay(inicioIso), dias));
  })();

  // Soft (never blocking) NUEVO duplicate warn (audit #7): a NEW sale whose typed
  // phone or email already matches an existing member in the gym almost certainly
  // means "sell EXISTENTE onto their row", not "mint a duplicate". Matched entirely
  // client-side against the already-loaded picker roster — no extra round trip.
  const [dismissedDupId, setDismissedDupId] = React.useState<string | null>(null);
  const dupMatch = React.useMemo(() => {
    if (mode !== "new") return null;
    const telDigits = nuevo.tel.replace(/\D/g, "");
    const email = nuevo.email.trim().toLowerCase();
    if (telDigits.length < 10 && !email) return null;
    return (
      clientes.find((c) => {
        const telHit = telDigits.length >= 10 && c.tel.replace(/\D/g, "") === telDigits;
        const emailHit = !!email && !!c.email && c.email.toLowerCase() === email;
        return telHit || emailHit;
      }) ?? null
    );
  }, [mode, nuevo.tel, nuevo.email, clientes]);
  const showDup = dupMatch && dupMatch.id !== dismissedDupId ? dupMatch : null;

  const clienteValid = clienteListo(mode, nuevo.nombre, nuevo.tel, !!existing);
  const paqueteValid = paqueteListo(sel, custom);
  const precio = precioSeleccionado(sel, paq?.precio ?? null, custom);
  const canSubmit = clienteValid && paqueteValid && !!metodo && !submitting;

  const clienteSummary = (() => {
    if (mode === "new") {
      const n = nuevo.nombre.trim();
      if (!n) return null;
      return nuevo.tel.trim() ? `${n} · ${nuevo.tel.trim()}` : `${n} · Nuevo`;
    }
    return existing ? `${existing.nombre} · ${existing.tel}` : null;
  })();
  // The relative sold-date label ("Hoy" / "Ayer" / "Hace N días") — the affordance row's
  // value and the collapsed-section suffix, so a backdate reads even with PAQUETE closed.
  const inicioLabel = fmtNavegadorDia(parseDay(inicioIso), hoyGymDate);
  const paqueteBase = esCustom
    ? customValido(custom)
      ? `${custom.nombre.trim().toUpperCase()} · ${pesos(precio ?? 0)}`
      : "PERSONALIZADO"
    : paq
      ? `${paq.nombre.toUpperCase()} · ${pesos(paq.precio)}`
      : null;
  const paqueteSummary = paqueteBase && esBackdate ? `${paqueteBase} · Inicia ${inicioLabel}` : paqueteBase;
  const pagoSummary = metodo ? metodo.toUpperCase() : null;

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
    maybeAdvanceCliente(clienteListo(m, nuevo.nombre, nuevo.tel, !!existing));
  };

  const selectPaquete = (id: string) => {
    setSel(id);
    // A registered plan completes the section the instant it is picked. The custom
    // tile does not: it advances only once its form validates (see setCustomForm).
    if (id !== PERSONALIZADO && openSection === "paquete") advanceFrom("paquete", "metodo");
  };

  // Advance out of PAQUETE the moment the custom form first becomes valid — the same
  // "advance once, on the event that completes the section" discipline as CLIENTE.
  const setCustomForm = (f: CustomForm) => {
    setCustom(f);
    if (sel === PERSONALIZADO && openSection === "paquete" && paqueteListo(PERSONALIZADO, f)) {
      advanceFrom("paquete", "metodo");
    }
  };

  const selectMetodo = (m: Metodo) => {
    setMetodo(m);
    if (openSection === "metodo") advanceFrom("metodo", null);
  };

  const finish = async (opts: { forzarNuevo?: boolean } = {}) => {
    if (!canSubmit || !sel || !metodo) return;
    setSubmitting(true);
    try {
      const email = (mode === "new" ? nuevo.email : backfillEmail).trim() || undefined;
      const res = await crearVentaAction({
        mode,
        nuevoNombre: mode === "new" ? nuevo.nombre : undefined,
        nuevoTel: mode === "new" ? nuevo.tel : undefined,
        email,
        clienteId: mode === "existing" ? (clientId ?? undefined) : undefined,
        paquete: esCustom
          ? customSeleccion(custom)
          : { tipo: "registrado" as const, paqueteId: sel },
        metodo: METODO_ENUM[metodo],
        idempotencyKey: idemKey,
        forzarNuevo: opts.forzarNuevo,
        // Backdated sold date (D6) — sent only for a real past date; a today-sale omits it
        // entirely, so the RPC takes its p_fecha_inicio default and behaves byte-for-byte.
        fechaInicio: esBackdate ? inicioIso : undefined,
      });
      if (!res.ok) {
        if ("duplicado" in res) {
          // The RPC's dup guard tripped — open the dialog; keep the same idemKey so
          // "crear nuevo de todos modos" replays this exact attempt (D2/C6).
          setDuplicado(res.duplicado);
        } else {
          // A message-bearing refusal (C7: the backfill email belongs to another
          // record) — toast the RPC's own actionable message, not the generic one.
          forgeToast({ tone: "warning", title: "No se pudo cobrar", body: res.mensaje });
        }
        return;
      }
      // Snapshot the receipt's first-purchase state from the selected DTO before
      // resetForm nulls clientId; record the sale so a later OTRA VENTA to the
      // same client no longer reads its now-stale `primeraCompra` (#77 §6/§7).
      setReciboExtra({
        primeraCompra: mode === "existing" && esPrimera(existing),
        cuentaActiva: mode === "existing" && existing?.invitacion.estado === "cuenta_activa",
      });
      if (mode === "existing" && clientId) setSoldIds((s) => new Set(s).add(clientId));
      setRecibo(res.recibo);
    } catch {
      forgeToast({ tone: "warning", title: "No se pudo cobrar", body: "Revisa los datos e intenta de nuevo." });
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setMode("new");
    setNuevo({ nombre: "", tel: "", email: "" });
    setBackfillEmail("");
    setClientId(null);
    setSel(null);
    setCustom(CUSTOM_VACIO);
    setMetodo(null);
    setInicioPick(hoyGym);
    setInicioOpen(false);
    setOpenSection("cliente");
    advanced.current = { cliente: false, paquete: false, metodo: false };
    setRecibo(null);
    setDuplicado(null);
    // A brand-new sale gets a fresh idempotency key (the prior key belonged to the
    // now-finished sale).
    setIdemKey(crypto.randomUUID());
  };

  if (recibo) {
    return (
      <Recibo
        result={recibo}
        primeraCompra={reciboExtra.primeraCompra}
        cuentaActiva={reciboExtra.cuentaActiva}
        lockup={lockup}
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
  if (!paqueteValid) missing.push("paquete");
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
          <ClienteEditor
            mode={mode}
            setMode={handleSetMode}
            nuevo={nuevo}
            setNuevo={setNuevo}
            backfillEmail={backfillEmail}
            setBackfillEmail={setBackfillEmail}
            existing={existing}
            existingPrimera={esPrimera(existing)}
            openPicker={() => setPickerOpen(true)}
            onContinue={() => setOpenSection("paquete")}
            dup={showDup}
            onUseExisting={() => {
              if (!showDup) return;
              setClientId(showDup.id);
              setMode("existing");
              setBackfillEmail("");
              maybeAdvanceCliente(true);
            }}
            onDismissDup={() => showDup && setDismissedDupId(showDup.id)}
          />
        </AccordionSection>

        <AccordionSection label="PAQUETE" summary={paqueteSummary} emptyHint="Elegir paquete" complete={paqueteValid} open={openSection === "paquete"} onToggle={() => toggle("paquete")}>
          <PaqueteEditor
            paquetes={paquetes}
            sel={sel}
            setSel={selectPaquete}
            vigenciaEnd={vigenciaEnd}
            custom={custom}
            setCustom={setCustomForm}
            customHasta={customHasta}
            inicioLabel={inicioLabel}
            inicioBackdate={esBackdate}
            onEditInicio={() => setInicioOpen(true)}
          />
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
          <span className="tnum font-extrabold" style={{ fontSize: 30, color: precio !== null ? "var(--fg)" : "var(--muted-soft)", letterSpacing: -0.6 }}>
            {precio !== null ? (
              // No `key`: reuse the one CountUp instance so switching packages
              // tweens price→price via its fromRef (the continuity the primitive
              // exists for) instead of remounting and flashing $0→price each time.
              <CountUp value={precio} format={pesos} />
            ) : (
              <>$<span style={{ opacity: 0.6 }}>—</span></>
            )}
            <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 6, fontWeight: 600 }}>MXN</span>
          </span>
        </div>
        {/* F2 confirm (spec D6): a quiet, non-blocking line so a backdated sale can't be
            charged by surprise. Only shown when the sold date differs from today. */}
        {esBackdate && (
          <div style={{ marginBottom: 10, fontSize: 11.5, color: "var(--muted)", letterSpacing: 0.2, textAlign: "center" }}>
            Se registrará con fecha <span className="font-bold" style={{ color: "var(--fg)" }}>{fmtShort(parseDay(inicioIso))}</span>
          </div>
        )}
        <Button variant="primary" size="lg" full disabled={!canSubmit} iconRight={submitting ? undefined : "arrow"} onClick={() => finish()}>
          {submitting ? "PROCESANDO…" : precio !== null ? `COBRAR ${pesos(precio)}` : "CONFIRMAR VENTA"}
        </Button>
        {missing.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 11, color: "var(--muted)", letterSpacing: 0.4, textAlign: "center" }}>
            Falta {missing.join(" · ")}
          </div>
        )}
      </div>

      {/* Backdate picker (spec D6): the same Sheet + calendar pattern as the asistencia
          day-picker. Future days are disabled; days before the alta/30-day floor are too. */}
      <Sheet open={inicioOpen} onClose={() => setInicioOpen(false)}>
        <div style={{ padding: "8px 22px 4px" }}>
          <H1 size={22}>FECHA DE INICIO</H1>
          <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
            El día en que arranca la vigencia. Úsalo solo para registrar una venta que ya ocurrió.
          </div>
        </div>
        <InicioCalendar
          hoy={hoyGymDate}
          min={parseDay(inicioMin)}
          sel={parseDay(inicioIso)}
          onPick={(d) => {
            setInicioPick(isoDay(d));
            setInicioOpen(false);
          }}
        />
      </Sheet>

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
              onClick={() => { setClientId(cc.id); setMode("existing"); setBackfillEmail(""); setPickerOpen(false); setPickerQuery(""); maybeAdvanceCliente(true); }}
              className="forge-pressable flex w-full items-center text-left"
              style={{ gap: 12, padding: "14px 22px", background: cc.id === clientId ? "var(--surface)" : "transparent", border: "none", borderBottom: "1px solid var(--line)", cursor: "pointer", color: "var(--fg)" }}
            >
              <Avatar initial={cc.inicial} size={36} />
              <div className="min-w-0 flex-1">
                <div className="uppercase font-semibold" style={{ fontSize: 14, letterSpacing: 0.4 }}>{cc.nombre}</div>
                <div className="flex flex-wrap items-center" style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, gap: 6 }}>
                  <span><Tnum>{cc.tel}</Tnum> · {cc.paqueteLabel}</span>
                  {cc.email ? (
                    <span className="min-w-0" style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cc.email}</span>
                  ) : (
                    <span className="uppercase font-bold" style={{ background: "var(--yellow-soft)", color: "var(--fg)", padding: "1px 5px", fontSize: 8.5, letterSpacing: 0.6 }}>Sin email</span>
                  )}
                  <Badge
                    state={cc.invitacion.estado === "cuenta_activa" ? "success" : "info"}
                    style={{ padding: "2px 6px", fontSize: 8.5, letterSpacing: 0.9 }}
                  >
                    {cc.invitacion.badge}
                  </Badge>
                </div>
              </div>
              {cc.id === clientId && <Icon name="check" size={16} color="var(--gold)" />}
            </button>
          ))}
        </div>
      </Sheet>

      {/* Duplicate guard (D2): registrar_venta refused a NUEVO whose tel/email already
          exists. Same visual language as the soft dupMatch banner, raised to a blocking
          decision here since the sale was actually attempted. */}
      <Sheet open={!!duplicado} onClose={() => setDuplicado(null)}>
        <div style={{ padding: "8px 22px 24px" }}>
          <div className="flex items-start" style={{ gap: 10, padding: "14px 15px", background: "var(--yellow-soft)", border: "1px solid var(--yellow)" }}>
            <Icon name="alert" size={18} color="var(--gold)" />
            <div className="min-w-0 flex-1">
              <div className="font-bold" style={{ fontSize: 13.5, color: "var(--fg)", letterSpacing: 0.2 }}>Ya existe este cliente</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3, lineHeight: 1.5 }}>
                Otro cliente tiene este teléfono o email. Véndele como EXISTENTE para no duplicar su ficha, o crea uno nuevo si de verdad es otra persona.
              </div>
              {/* CREAR NUEVO bypasses only the tel guard; a repeated email stays blocked by the
                  per-gym unique index, so without this hint the dialog reopens unexplained. */}
              {nuevo.email.trim() !== "" && (
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6, lineHeight: 1.5 }}>
                  Ojo: si el email es el repetido, crear uno nuevo seguirá bloqueado — corrígelo o déjalo vacío primero.
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col" style={{ gap: 10, marginTop: 18 }}>
            <Button
              variant="primary"
              full
              onClick={() => {
                if (!duplicado) return;
                setClientId(duplicado.id);
                setMode("existing");
                setBackfillEmail("");
                setDuplicado(null);
                maybeAdvanceCliente(true);
              }}
            >
              USAR EXISTENTE
            </Button>
            <Button
              variant="secondary"
              full
              onClick={() => {
                setDuplicado(null);
                void finish({ forzarNuevo: true });
              }}
            >
              CREAR NUEVO DE TODOS MODOS
            </Button>
          </div>
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
  backfillEmail,
  setBackfillEmail,
  existing,
  existingPrimera,
  openPicker,
  onContinue,
  dup,
  onUseExisting,
  onDismissDup,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
  nuevo: { nombre: string; tel: string; email: string };
  setNuevo: React.Dispatch<React.SetStateAction<{ nombre: string; tel: string; email: string }>>;
  /** EXISTENTE renewal email backfill (C7) — surfaced only when the picked member has no email. */
  backfillEmail: string;
  setBackfillEmail: (v: string) => void;
  existing: ClienteLiteDTO | null;
  /** The picked EXISTENTE client is on their first purchase (stale-guarded). */
  existingPrimera: boolean;
  openPicker: () => void;
  /** Explicit CONTINUAR advance to PAQUETE — replaces the removed auto-advance (#76). */
  onContinue: () => void;
  /** A same-gym cliente matching the typed phone/email — the soft duplicate warn. */
  dup: ClienteLiteDTO | null;
  onUseExisting: () => void;
  onDismissDup: () => void;
}) {
  // Blur tracking for the inline tel error (#48): a partial 1–9 digit number only
  // errors once the operator leaves the field; an over-long one errors on sight.
  const [telBlurred, setTelBlurred] = React.useState(false);
  const telErr = telError(nuevo.tel, telBlurred);
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
          <Input placeholder="Nombre completo" value={nuevo.nombre} onChange={(v) => setNuevo((n) => ({ ...n, nombre: v }))} autoFocus />
          {/* The wrapping div's onBlur (React focusout, which bubbles) tracks the
              tel field losing focus without touching the shared Input primitive. */}
          <div onBlur={() => setTelBlurred(true)}>
            <Input icon="phone" placeholder="614 000 0000" value={nuevo.tel} onChange={(v) => setNuevo((n) => ({ ...n, tel: v }))} suffix="MX" inputMode="tel" />
            {telErr && (
              <div role="alert" style={{ marginTop: 6, fontSize: 12, color: "var(--red)", fontWeight: 600, letterSpacing: 0.2 }}>{telErr}</div>
            )}
          </div>
          <div className="flex flex-col" style={{ gap: 6 }}>
            <Input
              placeholder="Email para la app (opcional)"
              value={nuevo.email}
              onChange={(v) => setNuevo((n) => ({ ...n, email: v }))}
              inputMode="email"
            />
            <div style={{ fontSize: 11, color: "var(--muted)", letterSpacing: 0.2 }}>Si agregas su correo, recibe la invitación a la app.</div>
          </div>
          {dup && (
            <div
              className="flex items-start"
              style={{ gap: 10, padding: "12px 13px", background: "var(--yellow-soft)", border: "1px solid var(--yellow)" }}
            >
              <Icon name="alert" size={16} color="var(--gold)" />
              <div className="min-w-0 flex-1">
                <div className="font-bold" style={{ fontSize: 12.5, color: "var(--fg)", letterSpacing: 0.2 }}>¿Es este cliente?</div>
                <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
                  Ya existe <span className="font-semibold" style={{ color: "var(--fg)" }}>{dup.nombre}</span> con este teléfono o email. Véndele como EXISTENTE.
                </div>
                <div className="flex items-center" style={{ gap: 14, marginTop: 10 }}>
                  <button
                    onClick={onUseExisting}
                    className="uppercase font-bold"
                    style={{ background: "transparent", border: "none", padding: 0, color: "var(--gold)", fontSize: 10.5, letterSpacing: 1, cursor: "pointer" }}
                  >
                    Usar EXISTENTE
                  </button>
                  <button
                    onClick={onDismissDup}
                    className="uppercase font-bold"
                    style={{ background: "transparent", border: "none", padding: 0, color: "var(--muted)", fontSize: 10.5, letterSpacing: 1, cursor: "pointer" }}
                  >
                    Es otra persona
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* Explicit CONTINUAR (#76): the yellow primary stays reserved for
              COBRAR, so this is secondary. No auto-advance — the operator commits
              the section themselves. */}
          <Button
            variant="secondary"
            full
            disabled={!clienteListo("new", nuevo.nombre, nuevo.tel, false)}
            onClick={onContinue}
          >
            CONTINUAR
          </Button>
        </div>
      )}

      {mode === "existing" &&
        (existing ? (
          <div className="flex flex-col" style={{ gap: 12 }}>
            <button onClick={openPicker} className="flex w-full items-center text-left" style={{ padding: "14px 16px", background: "var(--surface)", border: "1px solid var(--line)", gap: 12, cursor: "pointer", color: "var(--fg)" }}>
              <Avatar initial={existing.inicial} accent size={40} />
              <div className="min-w-0 flex-1">
                <div className="uppercase font-bold" style={{ fontSize: 14, letterSpacing: 0.4 }}>{existing.nombre}</div>
                <div className="flex min-w-0 items-center" style={{ gap: 6, marginTop: 3, fontSize: 11.5, color: "var(--muted)" }}>
                  <Tnum className="shrink-0">{existing.tel}</Tnum>
                  <span className="shrink-0" style={{ color: "var(--muted-soft)" }}>·</span>
                  {existing.email ? (
                    <span className="min-w-0" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{existing.email}</span>
                  ) : (
                    <span className="shrink-0 uppercase font-bold" style={{ background: "var(--yellow-soft)", color: "var(--fg)", padding: "1px 5px", fontSize: 8.5, letterSpacing: 0.6 }}>Sin email</span>
                  )}
                </div>
                {existingPrimera && (
                  <span className="inline-flex items-center uppercase font-bold" style={{ marginTop: 6, gap: 4, background: "var(--yellow-soft)", color: "var(--gold)", padding: "2px 6px", fontSize: 8.5, letterSpacing: 0.9 }}>
                    <Icon name="alert" size={10} color="var(--gold)" />
                    PRIMERA COMPRA
                  </span>
                )}
              </div>
              <span className="shrink-0 font-bold" style={{ fontSize: 10, color: "var(--gold)", letterSpacing: 1.2 }}>CAMBIAR</span>
            </button>
            {/* C7: a member with no email on file can pick one up on renewal — the
                RPC coalesces it into their row so the app invite becomes reachable. */}
            {!existing.email && (
              <div className="flex flex-col" style={{ gap: 6 }}>
                <Input
                  placeholder="Email para la app (opcional)"
                  value={backfillEmail}
                  onChange={setBackfillEmail}
                  inputMode="email"
                />
                <div style={{ fontSize: 11, color: "var(--muted)", letterSpacing: 0.2 }}>Si agregas su correo, recibe la invitación a la app.</div>
              </div>
            )}
          </div>
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
  custom,
  setCustom,
  customHasta,
  inicioLabel,
  inicioBackdate,
  onEditInicio,
}: {
  paquetes: PaqueteDTO[];
  sel: string | null;
  setSel: (id: string) => void;
  vigenciaEnd: string | null;
  custom: CustomForm;
  setCustom: (f: CustomForm) => void;
  customHasta: string | null;
  /** Relative sold-date label — "Hoy" for a normal sale, "Ayer"/"Hace N días" backdated. */
  inicioLabel: string;
  /** The sold date is a real past date — highlights the row so it doesn't read as a default. */
  inicioBackdate: boolean;
  onEditInicio: () => void;
}) {
  const onCustom = sel === PERSONALIZADO;
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

      {/* Promos, discounts and one-off deals. Never becomes a paquetes row, so it can
          never reach the gym's public catalog (spec §2). */}
      <div style={{ border: `1px solid ${onCustom ? "var(--yellow)" : "var(--line)"}`, transition: "border-color 140ms ease" }}>
        <button
          onClick={() => setSel(PERSONALIZADO)}
          className="forge-pressable flex items-center justify-between text-left"
          style={{ width: "100%", padding: 18, background: "transparent", border: "none", color: "var(--fg)", cursor: "pointer" }}
        >
          <div className="flex flex-col" style={{ gap: 4 }}>
            <div className="uppercase font-bold" style={{ fontSize: 16, letterSpacing: -0.1 }}>Personalizado</div>
            <div className="uppercase" style={{ fontSize: 11, color: "var(--muted)", letterSpacing: 0.8 }}>Promo · descuento · plan especial</div>
          </div>
          <Icon name="plus" size={20} color={onCustom ? "var(--gold)" : "var(--muted)"} />
        </button>
        {onCustom && (
          <div style={{ padding: "0 18px 18px" }}>
            <PersonalizadoEditor form={custom} setForm={setCustom} hasta={customHasta} />
          </div>
        )}
      </div>

      {/* Quiet backdate affordance (spec D6): reads "Inicia: Hoy" by default and stays out
          of the way; tap to register a sale that already happened on a past date. */}
      <button
        onClick={onEditInicio}
        className="forge-pressable flex items-center justify-between text-left"
        style={{ marginTop: 2, padding: "12px 4px", background: "transparent", border: "none", cursor: "pointer", color: "var(--fg)" }}
      >
        <span style={{ fontSize: 12.5, color: "var(--muted)", letterSpacing: 0.2 }}>
          Inicia:{" "}
          <span className="font-semibold" style={{ color: inicioBackdate ? "var(--gold)" : "var(--fg)" }}>{inicioLabel}</span>
        </span>
        <Icon name="chev" size={13} color="var(--muted)" />
      </button>
    </div>
  );
}

/** The backdate month calendar — the asistencia PaseCalendar pattern, minus the presence
 *  dots, plus a lower `min` bound. Both future days (> hoy) and days before the alta/30-day
 *  floor (< min) are disabled and unselectable; the RPC re-checks all of it (the real gate). */
function InicioCalendar({
  hoy,
  min,
  sel,
  onPick,
}: {
  hoy: Date;
  min: Date;
  sel: Date;
  onPick: (d: Date) => void;
}) {
  const [view, setView] = React.useState({ y: sel.getFullYear(), m: sel.getMonth() });

  const first = new Date(view.y, view.m, 1);
  const lead = first.getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const atCurrentMonth = view.y === hoy.getFullYear() && view.m === hoy.getMonth();
  // The previous month has a selectable day iff its last day is still ≥ the floor.
  const prevMonthLast = new Date(view.y, view.m, 0);
  const atFloorMonth = prevMonthLast < min;

  const cells: (Date | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(view.y, view.m, d));

  const stepMonth = (delta: number) => {
    const next = new Date(view.y, view.m + delta, 1);
    setView({ y: next.getFullYear(), m: next.getMonth() });
  };

  return (
    <div style={{ padding: "8px 18px 18px" }}>
      {/* month nav */}
      <div className="flex items-center justify-between" style={{ padding: "6px 2px 14px" }}>
        <button
          onClick={() => stepMonth(-1)}
          disabled={atFloorMonth}
          aria-label="Mes anterior"
          className="forge-hit forge-pressable flex items-center justify-center border border-line bg-surface"
          style={{ width: 34, height: 34, cursor: atFloorMonth ? "not-allowed" : "pointer", opacity: atFloorMonth ? 0.35 : 1 }}
        >
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
          const disabled = d > hoy || d < min;
          const isSel = sameDay(d, sel);
          const isToday = sameDay(d, hoy);
          return (
            <button
              key={isoDay(d)}
              onClick={() => !disabled && onPick(d)}
              disabled={disabled}
              className="relative flex aspect-square items-center justify-center"
              style={{
                background: isSel ? "var(--yellow)" : "transparent",
                border: `1px solid ${isSel ? "var(--yellow)" : isToday ? "var(--yellow-edge)" : "var(--line)"}`,
                color: isSel ? "var(--ink)" : disabled ? "var(--muted-soft)" : "var(--fg)",
                cursor: disabled ? "default" : "pointer",
                transition: "background-color 150ms cubic-bezier(.32,.72,0,1), border-color 150ms cubic-bezier(.32,.72,0,1)",
              }}
            >
              <Tnum style={{ fontSize: 14, fontWeight: 700 }}>{d.getDate()}</Tnum>
            </button>
          );
        })}
      </div>

      {/* footer */}
      <div className="flex items-center justify-between" style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
        <div className="uppercase" style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.4 }}>{fmtFull(sel)}</div>
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

function MetodoEditor({ metodo, setMetodo }: { metodo: Metodo | null; setMetodo: (m: Metodo) => void }) {
  const opts: { k: Metodo; icon: IconName }[] = [
    { k: "Efectivo", icon: "cash" },
    { k: "Tarjeta", icon: "card" },
    { k: "Transferencia", icon: "swap" },
  ];
  return (
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
  );
}
