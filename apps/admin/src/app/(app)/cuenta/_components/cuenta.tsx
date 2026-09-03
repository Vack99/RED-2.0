"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@gym/ui/forge/icon";
import { ThemeToggle } from "@gym/ui/forge/theme-toggle";
import { forgeToast } from "@gym/ui/forge/toaster";
import {
  AppBar,
  Avatar,
  Badge,
  Card,
  Eyebrow,
  H1,
  SectionHeader,
  Tnum,
} from "@gym/ui/forge/ui";
import { identidadDesde, identidadLegalCompleta } from "@gym/domain/legal";
import type { Modo, ResumenMes } from "@gym/domain/types";
import type { ClassTypeDTO } from "@gym/data/server/class-type";
import type { CoachDTO } from "@gym/data/server/coach";
import type { CobroDTO } from "@gym/data/server/cobro";
import type { AboutValueDTO, FacilityDTO, FaqDTO, StatDTO } from "@gym/data/server/gym-content";
import type { IdentidadLegalDTO } from "@gym/data/server/legal";
import type { MensajeDTO } from "@gym/data/server/mensajes";
import type { PlanEditorDTO } from "@gym/data/server/paquetes";
import type { PerfilDTO } from "@gym/data/server/perfil";
import type { PlantillaDTO } from "@gym/data/server/plantillas";
import type { MesRespaldo } from "@gym/data/server/respaldo";
import { pesos } from "@gym/format";

import { cambiarCorteReservasAction } from "../actions";
import { LogoutButton } from "../../_components/logout-button";
import { ClassTypesSheet } from "./class-types-sheet";
import { CoachesSheet } from "./coaches-sheet";
import { GymContentSheet } from "./gym-content-sheet";
import { LegalIdentitySheet } from "./legal-identity-sheet";
import { MensajesSheet } from "./mensajes-sheet";
import { PaquetesSheet } from "./paquetes-sheet";
import { PlantillasSheet } from "./plantillas-sheet";
import { ReservasEnLineaSheet } from "./reservas-en-linea-sheet";

interface CuentaScreenProps {
  /** The gym's booking door (spec #326). Lista hides Clases, Coaches and Plantillas —
   *  the AJUSTES rows this screen has no use for when there's no schedule to staff or
   *  book-triggered WhatsApp templates to send — and doesn't mount their sheets, so
   *  none is reachable by any deep link or search param either. */
  modo: Modo;
  perfil: PerfilDTO | null;
  resumen: ResumenMes;
  cobro: CobroDTO | null;
  paquetes: PlanEditorDTO[];
  plantillas: PlantillaDTO[];
  coaches: CoachDTO[];
  classTypes: ClassTypeDTO[];
  /** Real es-MX month label, e.g. "MAYO 2026". */
  mesLabel: string;
  /** Resolved marca name — the "negocio" fallback when the perfil row has none (grill lock (c)). */
  brandName: string;
  /** The gym's OWN legal/commercial name (gym.brand_name), distinct from `brandName` above (a
   *  per-brand-module literal shared by every gym on that module) — the identidad-legal path needs
   *  the per-gym value; review finding 1. */
  gymBrandName: string;
  aboutValues: AboutValueDTO[];
  facilities: FacilityDTO[];
  stats: StatDTO[];
  faqs: FaqDTO[];
  mensajes: MensajeDTO[];
  /** Months-with-data for the respaldo picker, newest first (spec 2026-07-13 §2.5). */
  mesesRespaldo: MesRespaldo[];
  /** The gym's legal identity (razón social + gym_legal's domicilio/contacto ARCO) — #255. */
  identidadLegal: IdentidadLegalDTO;
  /** The aviso's real telefono/email source (#256 correction): `gym_contact`'s whatsapp/email,
   *  NOT `perfil?.tel` below (the profile header's own, unrelated, per-OPERATOR display) —
   *  `perfil.tel` is never anon-readable and isn't gym-scoped, so a member could never see it on
   *  the public aviso; gym_contact is both. See `identidadDesde`'s own doc comment. */
  telefonoContactoAviso: string | null;
  emailContactoAviso: string | null;
  /** The aviso's own stable public URL on this gym's mapped CLIENT host — null when unmapped
   *  (#256). */
  urlAvisoIntegral: string | null;
  /** `gym_contact.hours_text` (#332) — the ONE free-text opening-hours field, editable in the
   *  same contenido sheet as the four "Contenido del gimnasio" resources above and rendered on
   *  the client app's Lista public landing. Content, not mode — any gym may fill it in. */
  horarioTexto: string | null;
  /** Future `reservada` bookings of this gym (#331) — the OFF-direction confirm sheet's `N`.
   *  0 on Lista (turning ON ignores the count) or when there is simply nothing ahead. */
  reservasFuturas: number;
  /** `gym.corte_reservas` — the booking cutoff's current position. A SECOND switch beside
   *  "Reservas en línea": bookings stay on, they just close 3 h before the class. */
  corteReservas: boolean;
}

interface AjusteRow {
  icon: IconName;
  label: string;
  sub: string;
  /** Present on rows that WRITE IN PLACE instead of opening a sheet: the row renders a real
   *  switch instead of the drill-in chevron, and the whole row becomes that switch's label —
   *  so the setting reads as a thing you flip, not a screen you open. */
  interruptor?: { encendido: boolean; pendiente: boolean };
  onClick: () => void;
}

const SW_ANCHO = 46;
const SW_ALTO = 26;
const SW_PERILLA = 20;

/**
 * The AJUSTES switch: a real `<input type="checkbox" role="switch">` — focusable,
 * keyboard-operable and state-announced — with an iOS-style track and knob drawn around it
 * in tokens only (`--yellow` is the FILL accent, `--yellow-fg` its contrast-checked
 * foreground, so the knob stays legible on every brand module). The input itself is the
 * full-size invisible hit target; the visible chrome is `aria-hidden`.
 *
 * Its focus ring can't be expressed inline (:focus-visible), so it lives in the screen's own
 * one `<style>` below — never here, where it would be phrasing-invalid inside the row's
 * `<label>` and re-emitted once per switch.
 */
function Interruptor({
  encendido,
  pendiente,
  etiqueta,
  onChange,
}: {
  encendido: boolean;
  pendiente: boolean;
  etiqueta: string;
  onChange: () => void;
}) {
  return (
    <span
      className="relative inline-flex shrink-0 items-center"
      style={{ width: SW_ANCHO, height: SW_ALTO, opacity: pendiente ? 0.45 : 1 }}
    >
      <input
        type="checkbox"
        role="switch"
        className="forge-switch absolute inset-0 h-full w-full opacity-0"
        style={{ margin: 0, cursor: pendiente ? "default" : "pointer" }}
        checked={encendido}
        disabled={pendiente}
        onChange={onChange}
        aria-label={etiqueta}
      />
      <span
        aria-hidden
        className="forge-switch-riel pointer-events-none absolute inset-0 flex items-center"
        style={{
          borderRadius: 999,
          background: encendido ? "var(--yellow)" : "var(--sunk)",
          border: `1px solid ${encendido ? "var(--yellow)" : "var(--line)"}`,
          transition: "background-color 160ms ease, border-color 160ms ease",
        }}
      >
        <span
          style={{
            width: SW_PERILLA,
            height: SW_PERILLA,
            borderRadius: 999,
            background: encendido ? "var(--yellow-fg)" : "var(--muted)",
            transform: `translateX(${encendido ? SW_ANCHO - SW_PERILLA - 4 : 2}px)`,
            transition: "transform 160ms ease, background-color 160ms ease",
          }}
        />
      </span>
    </span>
  );
}

// Sub-editors (Paquetes editor, Plantillas, Cobro, Perfil) stay read-only this
// slice — their entry points surface a "próximamente" toast but show real data.
function proximamente(label: string) {
  forgeToast({ tone: "info", title: "Próximamente", body: `${label} llega en la siguiente entrega.` });
}

/** Whole-percent change vs the prior month, or null when there's no baseline. */
function deltaPct(actual: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((actual - prev) / prev) * 100);
}

/** Compact "+18% VS PERIODO ANT." caption (color-coded), or growth/no-baseline indicator. */
function DeltaCaption({ actual, prev }: { actual: number; prev: number }) {
  const pct = deltaPct(actual, prev);
  if (pct === null) {
    // prev === 0 → no like-for-like baseline. Distinguish "up from zero"
    // (real momentum this period) from genuinely-nothing-to-compare.
    if (actual > 0) {
      return (
        <div style={{ fontSize: 10, color: "var(--green)", marginTop: 4, fontWeight: 700 }}>
          NUEVO
        </div>
      );
    }
    return (
      <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4, fontWeight: 600 }}>
        SIN MES ANT.
      </div>
    );
  }
  const color = pct > 0 ? "var(--green)" : pct < 0 ? "var(--gold)" : "var(--muted)";
  return (
    <div style={{ fontSize: 10, color, marginTop: 4, fontWeight: 700 }}>
      {pct > 0 ? "+" : ""}
      {pct}% VS PERIODO ANT.
    </div>
  );
}

export function CuentaScreen({
  modo,
  perfil,
  resumen,
  cobro,
  paquetes,
  plantillas,
  coaches,
  classTypes,
  mesLabel,
  brandName,
  gymBrandName,
  aboutValues,
  facilities,
  stats,
  faqs,
  mensajes,
  mesesRespaldo,
  identidadLegal,
  telefonoContactoAviso,
  emailContactoAviso,
  urlAvisoIntegral,
  horarioTexto,
  reservasFuturas,
  corteReservas,
}: CuentaScreenProps) {
  const [plantillasOpen, setPlantillasOpen] = React.useState(false);
  const [paquetesOpen, setPaquetesOpen] = React.useState(false);
  const [coachesOpen, setCoachesOpen] = React.useState(false);
  const [classTypesOpen, setClassTypesOpen] = React.useState(false);
  const [contenidoOpen, setContenidoOpen] = React.useState(false);
  const [mensajesOpen, setMensajesOpen] = React.useState(false);
  const [legalOpen, setLegalOpen] = React.useState(false);
  const [reservasEnLineaOpen, setReservasEnLineaOpen] = React.useState(false);
  // The cutoff row writes straight through — nothing cascades, so there is no confirm sheet
  // to own the pending ceremony the way ReservasEnLineaSheet does; the row owns it itself.
  // Its switch is driven by local state so the knob moves on the tap and rolls back if the
  // write fails (the asistencia desk's optimistic-flip pattern), with `router.refresh()`
  // landing the server's own value underneath.
  const [cortePending, setCortePending] = React.useState(false);
  const [corteOn, setCorteOn] = React.useState(corteReservas);
  // …and the server's value wins whenever it lands: SenalGym refreshes this route when ANOTHER
  // device flips the cutoff, and without this the knob and its sentence would keep showing the
  // local value — the opposite of the DB — with the next tap re-asserting it.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing local switch state to a changed server prop is exactly the sanctioned use
  React.useEffect(() => setCorteOn(corteReservas), [corteReservas]);
  const router = useRouter();
  const sinLeer = mensajes.filter((m) => !m.leido).length;

  // perfil.coach/negocio are already resolved (resolverIdentidad); the ?? is only
  // a null-perfil guard (the perfil row may not be seeded yet).
  const coach = perfil?.coach ?? "Coach";
  const inicial =
    coach
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "C";
  const negocio = perfil?.negocio ?? brandName;

  const { ingresosMes, ventasMes, asistMes, ingresosMesPrev, ventasMesPrev, asistMesPrev } =
    resumen;

  // Datos de cobro subtitle, derived from the real cobro row.
  const metActivos = cobro
    ? [cobro.aceptaEfectivo, cobro.aceptaTransferencia, cobro.aceptaTarjeta].filter(Boolean)
        .length
    : 0;
  const cobroSub = cobro
    ? `${metActivos} método${metActivos === 1 ? "" : "s"}${cobro.banco?.trim() ? " · " + cobro.banco.trim() : ""}`
    : "Próximamente";

  // #255/#256: the AJUSTES row's own status line — "listo" only once the rendered aviso has zero
  // unresolved merge-field tokens (review finding 3), via the SAME shared helper the sheet's own
  // preview uses (review finding 8) — never a second hand-built identity object. telefono/email
  // come from gym_contact (#256), never `perfil?.tel` (the header's own, unrelated display below).
  const legalCompleta = identidadLegalCompleta(
    identidadDesde(identidadLegal, gymBrandName, telefonoContactoAviso, emailContactoAviso, urlAvisoIntegral),
  );

  const esCupo = modo === "cupo";

  const cambiarCorte = async () => {
    if (cortePending) return;
    const siguiente = !corteOn;
    setCorteOn(siguiente);
    setCortePending(true);
    try {
      await cambiarCorteReservasAction(siguiente);
      forgeToast({
        tone: "success",
        title: siguiente ? "Cierre activado" : "Cierre desactivado",
        body: siguiente
          ? "Las reservas se cierran 3 horas antes de cada clase."
          : "Las reservas están abiertas hasta que empieza la clase.",
      });
      router.refresh();
    } catch {
      setCorteOn(!siguiente);
      forgeToast({ tone: "warning", title: "No se pudo cambiar", body: "Intenta de nuevo." });
    } finally {
      setCortePending(false);
    }
  };

  // Cupo-only rows (schedule staffing + booking-triggered messaging) — omitted from the
  // array entirely on Lista, not just hidden, so there's no click handler left to reach
  // them by any deep link or search param either (spec #326, ticket #327 AC4).
  const ajustesCupo: AjusteRow[] = esCupo
    ? [
        {
          icon: "users",
          label: "COACHES",
          sub: `${coaches.length} coach${coaches.length === 1 ? "" : "es"}`,
          onClick: () => setCoachesOpen(true),
        },
        {
          icon: "flame",
          label: "TIPOS DE CLASE",
          sub: `${classTypes.length} tipo${classTypes.length === 1 ? "" : "s"} de clase`,
          onClick: () => setClassTypesOpen(true),
        },
        {
          icon: "wa",
          label: "PLANTILLAS DE WHATSAPP",
          sub: `${plantillas.length} configurada${plantillas.length === 1 ? "" : "s"}`,
          onClick: () => setPlantillasOpen(true),
        },
      ]
    : [];

  // Both modes get this row (#331): the door itself is the same switch, whichever direction
  // it currently points — tapping proposes the OPPOSITE of `modo`.
  const ajustes: AjusteRow[] = [
    {
      icon: "cal",
      label: "RESERVAS EN LÍNEA",
      // Says what is true NOW, in the same plain voice as the cutoff row below it — the row
      // opens a confirm sheet (turning it off cancels bookings), so it keeps its chevron.
      sub: esCupo
        ? "Tus socios apartan su lugar desde la app."
        : "Tus socios no pueden apartar lugar desde la app.",
      onClick: () => setReservasEnLineaOpen(true),
    },
    // The cutoff only means anything while the gym takes bookings at all, so it rides
    // directly under that row on Cupo and is absent on Lista — same containment rule as
    // `ajustesCupo` below (spec #326).
    ...(esCupo
      ? [
          {
            icon: "clock" as IconName,
            label: "CIERRE DE RESERVAS",
            // Reads off the SWITCH, not the server prop, so the sentence flips with the knob
            // on the same tap. It states what is true NOW, never what the switch would do —
            // the rule paragraph under an off switch was the confusion (owner, 2026-09-02).
            // 24h times throughout, matching the member-facing copy.
            sub: corteOn
              ? "Las reservas se cierran 3 horas antes de cada clase. Si la clase es antes de las 9:00, se cierran a las 22:00 del día anterior."
              : "Las reservas están abiertas hasta que empieza la clase.",
            // No chevron: this row IS the switch, it opens nothing.
            interruptor: { encendido: corteOn, pendiente: cortePending },
            onClick: cambiarCorte,
          },
        ]
      : []),
    ...ajustesCupo,
    {
      icon: "flame",
      label: "CONTENIDO DEL GIMNASIO",
      sub: "Valores, instalaciones, stats y FAQ",
      onClick: () => setContenidoOpen(true),
    },
    {
      icon: "wa",
      label: "MENSAJES",
      sub:
        mensajes.length === 0
          ? "Sin mensajes"
          : sinLeer > 0
            ? `${sinLeer} sin leer · ${mensajes.length} total`
            : `${mensajes.length} mensaje${mensajes.length === 1 ? "" : "s"}`,
      onClick: () => setMensajesOpen(true),
    },
    {
      icon: "lock",
      label: "IDENTIDAD LEGAL",
      sub: legalCompleta ? "Aviso de privacidad listo" : "Completa tu aviso de privacidad",
      onClick: () => setLegalOpen(true),
    },
    { icon: "bell", label: "NOTIFICACIONES", sub: "Próximamente", onClick: () => proximamente("Notificaciones") },
    { icon: "card", label: "DATOS DE COBRO", sub: cobroSub, onClick: () => proximamente("Datos de cobro") },
    { icon: "user", label: "EDITAR PERFIL", sub: "Nombre, teléfono, contraseña", onClick: () => proximamente("Editar perfil") },
  ];

  return (
    <div>
      {/* The screen's one local rule — a :focus-visible ring can't be expressed inline
          (same idiom as LogoutButton). */}
      <style>{`
        .forge-switch:focus-visible + .forge-switch-riel {
          outline: 2px solid var(--gold);
          outline-offset: 3px;
        }
      `}</style>

      {esCupo && (
        <>
          <PlantillasSheet
            open={plantillasOpen}
            onClose={() => setPlantillasOpen(false)}
            plantillas={plantillas}
            negocio={negocio}
            brandName={brandName}
          />

          <CoachesSheet open={coachesOpen} onClose={() => setCoachesOpen(false)} coaches={coaches} />

          <ClassTypesSheet
            open={classTypesOpen}
            onClose={() => setClassTypesOpen(false)}
            classTypes={classTypes}
          />
        </>
      )}

      <PaquetesSheet open={paquetesOpen} onClose={() => setPaquetesOpen(false)} paquetes={paquetes} />

      <GymContentSheet
        open={contenidoOpen}
        onClose={() => setContenidoOpen(false)}
        aboutValues={aboutValues}
        facilities={facilities}
        stats={stats}
        faqs={faqs}
        horarioTexto={horarioTexto}
      />

      <MensajesSheet open={mensajesOpen} onClose={() => setMensajesOpen(false)} mensajes={mensajes} />

      <LegalIdentitySheet
        open={legalOpen}
        onClose={() => setLegalOpen(false)}
        identidad={identidadLegal}
        nombreComercial={gymBrandName}
        telefonoContacto={telefonoContactoAviso}
        emailContacto={emailContactoAviso}
        urlAvisoIntegral={urlAvisoIntegral}
      />

      <ReservasEnLineaSheet
        open={reservasEnLineaOpen}
        onClose={() => setReservasEnLineaOpen(false)}
        activar={!esCupo}
        reservasFuturas={reservasFuturas}
      />

      <AppBar center="CUENTA" trailing={<ThemeToggle />} />

      {/* Coach identity */}
      <div className="flex items-center" style={{ padding: "20px 22px 16px", gap: 16 }}>
        <Avatar initial={inicial} accent size={72} style={{ fontSize: 26 }} />
        <div className="min-w-0 flex-1">
          <H1 size={24} style={{ letterSpacing: -0.3, lineHeight: 1.05 }}>
            {coach}
          </H1>
          <Tnum style={{ display: "block", marginTop: 6, fontSize: 11.5, color: "var(--muted)" }}>{perfil?.tel ?? ""}</Tnum>
          <div style={{ marginTop: 6 }}>
            <Badge state="success">
              {`${negocio} · ${perfil?.ciudad ?? "—"}`.toUpperCase()}
            </Badge>
          </div>
        </div>
      </div>

      {/* Resumen del mes — real ventas + asistencias, prior-period deltas */}
      <SectionHeader trailing={mesLabel}>RESUMEN DEL MES</SectionHeader>
      <Card style={{ margin: "0 16px" }}>
        <div className="grid grid-cols-3" style={{ gap: 18 }}>
          <div>
            <Eyebrow style={{ fontSize: 9.5 }}>INGRESOS</Eyebrow>
            <Tnum className="font-extrabold" style={{ display: "block", marginTop: 4, fontSize: 22, lineHeight: 1, letterSpacing: -0.4 }}>
              {pesos(ingresosMes)}
            </Tnum>
            <DeltaCaption actual={ingresosMes} prev={ingresosMesPrev} />
          </div>
          <div>
            <Eyebrow style={{ fontSize: 9.5 }}>VENTAS</Eyebrow>
            <Tnum className="font-extrabold" style={{ display: "block", marginTop: 4, fontSize: 22, lineHeight: 1 }}>{ventasMes}</Tnum>
            <DeltaCaption actual={ventasMes} prev={ventasMesPrev} />
          </div>
          <div>
            <Eyebrow style={{ fontSize: 9.5 }}>ASIST.</Eyebrow>
            <Tnum className="font-extrabold" style={{ display: "block", marginTop: 4, fontSize: 22, lineHeight: 1 }}>{asistMes}</Tnum>
            <DeltaCaption actual={asistMes} prev={asistMesPrev} />
          </div>
        </div>
      </Card>

      {/* Respaldo — descargable Excel, por mes o últimos 24 meses. ONE download
          affordance (the form's submit) — a second header anchor would silently
          ignore the month the operator just picked. */}
      <SectionHeader>RESPALDO</SectionHeader>
      <div style={{ margin: "0 16px" }}>
        {/* Native GET form (spec 2026-07-13 §2.5): no client JS — the route's
            Content-Disposition: attachment fires the save dialog. The select
            picks one month (?mes=YYYY-MM); the empty value is the capped
            "Últimos 24 meses" default (?mes absent). */}
        <form
          method="get"
          action="/cuenta/respaldo"
          className="flex w-full items-center border border-line bg-surface"
          style={{ gap: 14, padding: "14px 16px", color: "var(--fg)" }}
        >
          <div
            className="flex shrink-0 items-center justify-center border border-line"
            style={{ width: 32, height: 32, background: "var(--canvas)" }}
          >
            <Icon name="receipt" size={15} color="var(--gold)" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold" style={{ fontSize: 12.5, letterSpacing: 0.6 }}>
              DESCARGAR RESPALDO
            </div>
            <select
              name="mes"
              aria-label="Mes del respaldo"
              className="w-full border border-line bg-canvas"
              style={{ marginTop: 6, padding: "6px 8px", fontSize: 11.5, color: "var(--fg)" }}
            >
              <option value="">Últimos 24 meses</option>
              {mesesRespaldo.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="inline-flex shrink-0 items-center uppercase font-extrabold transition-transform active:scale-[0.97]"
            style={{ gap: 5, background: "transparent", border: "none", cursor: "pointer", padding: "8px 0", fontSize: 10.5, letterSpacing: 1.2, color: "var(--gold)" }}
          >
            DESCARGAR
            <Icon name="arrow" size={13} color="var(--gold)" />
          </button>
        </form>
      </div>

      {/* Paquetes y precios — real catalog (read-only) */}
      <SectionHeader
        trailing={
          <button
            onClick={() => setPaquetesOpen(true)}
            className="inline-flex items-center uppercase font-extrabold"
            style={{ gap: 5, background: "transparent", border: "none", cursor: "pointer", padding: 0, fontSize: 10.5, letterSpacing: 1.2, color: "var(--gold)" }}
          >
            <Icon name="edit" size={12} color="var(--gold)" />
            EDITAR
          </button>
        }
      >
        PAQUETES Y PRECIOS
      </SectionHeader>
      <div style={{ margin: "0 16px" }}>
        {paquetes.map((p, i) => (
          <button
            key={p.id}
            onClick={() => setPaquetesOpen(true)}
            className="forge-pressable flex w-full items-center justify-between border border-line bg-surface text-left"
            style={{
              gap: 12,
              padding: "14px 16px",
              borderBottom: i === paquetes.length - 1 ? "1px solid var(--line)" : "none",
              marginTop: i === 0 ? 0 : -1,
              cursor: "pointer",
              color: "var(--fg)",
            }}
          >
            <div className="min-w-0">
              <div className="flex items-center" style={{ gap: 7 }}>
                <div className="uppercase font-bold" style={{ fontSize: 14, letterSpacing: 0.4 }}>{p.nombre?.trim() || "Sin nombre"}</div>
                {p.popular && <Icon name="star" size={11} color="var(--gold)" />}
              </div>
              <div className="uppercase" style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 3, letterSpacing: 0.6 }}>
                {p.vigencia?.trim() ? `VIGENCIA · ${p.vigencia.toUpperCase()}` : "SIN VIGENCIA"}
              </div>
            </div>
            <div className="flex shrink-0 items-center" style={{ gap: 12 }}>
              <Tnum className="font-extrabold" style={{ fontSize: 18 }}>{pesos(p.precio)}</Tnum>
              <Icon name="chev" size={14} color="var(--muted)" />
            </div>
          </button>
        ))}
      </div>

      {/* Ajustes */}
      <SectionHeader>AJUSTES</SectionHeader>
      <div style={{ margin: "0 16px" }}>
        {ajustes.map((row, i) => {
          const clase = "forge-pressable flex w-full items-center border border-line bg-surface text-left";
          const estilo: React.CSSProperties = {
            gap: 14,
            padding: "14px 16px",
            borderBottom: i === ajustes.length - 1 ? "1px solid var(--line)" : "none",
            marginTop: i === 0 ? 0 : -1,
            cursor: "pointer",
            color: "var(--fg)",
          };
          const contenido = (
            <>
              <div className="flex shrink-0 items-center justify-center border border-line" style={{ width: 32, height: 32, background: "var(--canvas)" }}>
                <Icon name={row.icon} size={15} color="var(--gold)" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold" style={{ fontSize: 12.5, letterSpacing: 0.6 }}>{row.label}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{row.sub}</div>
              </div>
              {row.interruptor ? (
                <Interruptor
                  encendido={row.interruptor.encendido}
                  pendiente={row.interruptor.pendiente}
                  etiqueta={row.label}
                  onChange={row.onClick}
                />
              ) : (
                <Icon name="chev" size={14} color="var(--muted)" />
              )}
            </>
          );
          // A switch row is the switch's own <label> — the whole row is its hit area, and
          // nesting a control inside a <button> would be invalid anyway.
          return row.interruptor ? (
            <label
              key={row.label}
              className={clase}
              style={{ ...estilo, cursor: row.interruptor.pendiente ? "default" : "pointer" }}
            >
              {contenido}
            </label>
          ) : (
            <button key={row.label} onClick={row.onClick} className={clase} style={estilo}>
              {contenido}
            </button>
          );
        })}
      </div>

      <div
        className="flex flex-col items-center"
        style={{ padding: "24px 22px 28px", marginTop: 16, borderTop: "1px solid var(--line)", gap: 14 }}
      >
        <LogoutButton />
        <div
          className="uppercase"
          style={{ textAlign: "center", fontSize: 10, color: "var(--muted-soft)", letterSpacing: 1.6 }}
        >
          {`${negocio} · v1.0`}
        </div>
      </div>
    </div>
  );
}
