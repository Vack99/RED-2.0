"use client";

// apps/admin/src/app/proto/e-ventana/_components/ventana.tsx — THROWAWAY (see
// ../page.tsx). OPTION E of map #180: the directory Fitco/Gymflow actually
// ship. ONE FLAT LIST, and `estado` is a column on it.
//
// Why flat, and why this is the load-bearing difference from variant A:
// #181 D1 found that every vendor which RELOCATES lapsed members (tab, page,
// archive) has a declared "gone" lever — cancel / archive / dar de baja — and
// relocates ON THAT ACT. RED has no such lever and no `baja` state exists
// (map #180). The matching precedent is therefore the purely-derived family —
// Gymflow, Glofox, Fitco, Arketa — and all four of them keep ONE list where
// the label simply flips. So: no sections, no headers, no fold, no tabs. The
// only thing that moves is the ORDER, and ordering a flat list is not
// sectioning it.
//
// What that buys, and what it costs, is stated at the bottom of the screen.

import * as React from "react";
import { Icon } from "@gym/ui/forge/icon";
import { Avatar, Eyebrow, H1, Input, Tnum } from "@gym/ui/forge/ui";
import { useRevealedWindow } from "@gym/ui/forge/use-revealed-window";
import type { RosterClient } from "../../_fixtures";
import { ProtoShell } from "../../_components/shell";
import { AUSENTE_DIAS, RECUPERAR_DIAS, RENOVACION_DIAS, coincide, derivar, ordenar, type Fila } from "./lifecycle";
import { Nota } from "./nota";

type Filtro = "renovar" | "aTiempo" | null;

const FILTRO_LABEL: Record<"renovar" | "aTiempo", string> = {
  renovar: "POR RENOVAR",
  aTiempo: "AÚN A TIEMPO",
};

export function DirectorioVentana({
  clientes,
  n,
  f0,
}: {
  clientes: RosterClient[];
  n: number;
  f0: Filtro;
}) {
  const [query, setQuery] = React.useState("");
  const [filtro, setFiltro] = React.useState<Filtro>(f0);

  const filas = React.useMemo(() => ordenar(clientes.map(derivar)), [clientes]);

  // The header. Connect Gym's ratio form — `Alumnos Activos 47 de 52 totales`,
  // OBSERVED on their own product screenshot — anchors ONE subset to the whole
  // roster. It structurally cannot reproduce today's `32 of 30` (#184 defect
  // 8), because it never claims a partition in the first place. Three numbers
  // that are supposed to add up is exactly the shape that broke.
  const activas = filas.filter((f) => f.activa).length;

  const totRenovar = filas.filter((f) => f.renovar).length;
  const totRecuperar = filas.filter((f) => f.aTiempo).length;
  const totFuera = filas.filter((f) => f.fueraDeAlcance).length;
  const totAusentes = filas.filter((f) => f.ausente).length;

  const q = query.trim();
  const lista = React.useMemo(() => {
    let l = filas;
    if (filtro === "renovar") l = l.filter((f) => f.renovar);
    if (filtro === "aTiempo") l = l.filter((f) => f.aTiempo);
    // Search reaches the WHOLE roster, always: a filter that swallowed the
    // people past day 16 would hide them, and search is the only door they
    // still have. Typing therefore drops the filter.
    if (q) l = filas.filter((f) => coincide(f, q));
    return l;
  }, [filas, filtro, q]);

  const { visible } = useRevealedWindow(lista);
  const inicio = `/proto/e-ventana/inicio?n=${n}`;

  return (
    <ProtoShell
      title="DIRECTORIO"
      trailing={
        <div
          className="flex items-center justify-center"
          style={{ width: 38, height: 38, background: "var(--yellow)" }}
        >
          <Icon name="plus" size={18} color="var(--yellow-fg)" />
        </div>
      }
    >
      <div style={{ padding: "14px 22px 4px" }}>
        <H1 size={38}>CLIENTES</H1>
        <div
          className="flex items-baseline"
          style={{ gap: 6, marginTop: 9, fontSize: 12.5, color: "var(--muted)" }}
        >
          <Tnum className="font-extrabold" style={{ fontSize: 17, color: "var(--fg)", lineHeight: 1 }}>
            {activas}
          </Tnum>
          <span>activos de</span>
          <Tnum style={{ color: "var(--fg)", fontWeight: 700 }}>{clientes.length}</Tnum>
          <span>totales</span>
        </div>
        <a
          href={inicio}
          className="inline-flex items-center"
          style={{ gap: 5, marginTop: 10, fontSize: 10.5, letterSpacing: 1.1, color: "var(--muted-soft)", textDecoration: "none" }}
        >
          VER EL TABLERO
          <Icon name="chev" size={11} color="var(--muted-soft)" />
        </a>
      </div>

      <div style={{ padding: "14px 16px 0" }}>
        <Input icon="search" placeholder="Nombre o teléfono…" value={query} onChange={setQuery} />
      </div>

      {/* The deep-link chip. It arrives from a dashboard tile (`?f=`), it says
          which set it is showing, and it is one tap to clear. It is a FILTER,
          not a tab: nothing is hidden by default and there is no second tab to
          discover. */}
      {filtro && !q && (
        <div style={{ padding: "12px 16px 0" }}>
          <button
            onClick={() => setFiltro(null)}
            className="forge-pressable flex w-full items-center text-left"
            style={{
              gap: 10,
              padding: "10px 13px",
              background: "var(--surface)",
              border: `1px solid ${filtro === "renovar" ? "var(--warning)" : "var(--line)"}`,
              cursor: "pointer",
            }}
          >
            <Icon
              name="filter"
              size={14}
              color={filtro === "renovar" ? "var(--warning)" : "var(--muted)"}
            />
            <div className="min-w-0 flex-1">
              <div
                className="uppercase font-extrabold"
                style={{ fontSize: 11, letterSpacing: 0.8, color: "var(--fg)" }}
              >
                {FILTRO_LABEL[filtro]}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2 }}>
                {filtro === "renovar"
                  ? `Vencen en ${RENOVACION_DIAS} días o menos`
                  : `Se acabaron hace 1–${RECUPERAR_DIAS} días`}
              </div>
            </div>
            <span
              className="uppercase font-bold"
              style={{ fontSize: 9.5, letterSpacing: 1, color: "var(--muted)" }}
            >
              Quitar
            </span>
            <Icon name="close" size={13} color="var(--muted)" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between" style={{ padding: "16px 22px 6px" }}>
        <Eyebrow style={{ fontSize: 10 }}>
          {lista.length} {lista.length === 1 ? "CLIENTE" : "CLIENTES"}
        </Eyebrow>
        <span style={{ fontSize: 10, color: "var(--muted-soft)", letterSpacing: 0.8 }}>
          ESTADO
        </span>
      </div>

      {lista.length === 0 && (
        <div style={{ padding: "54px 24px", textAlign: "center" }}>
          <Icon name="search" size={28} color="var(--muted-soft)" />
          <div
            className="uppercase font-extrabold"
            style={{ fontSize: 14, color: "var(--fg)", marginTop: 12, letterSpacing: 0.4 }}
          >
            Sin resultados
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
            Nadie con ese nombre o teléfono.
          </div>
        </div>
      )}

      {visible.map((f) => (
        <FilaCliente key={f.c.id} f={f} />
      ))}

      <Nota
        volver={inicio}
        lines={[
          <>
            <b style={{ color: "var(--fg)" }}>E · VENTANA — una sola lista plana.</b> Sin secciones,
            sin pestañas, sin pliegue. <i>Estado</i> es una <b style={{ color: "var(--fg)" }}>columna</b>{" "}
            (VIGENTE / VENCIDO / SIN CLASES). Los sistemas que no tienen un botón de
            «dar de baja» hacen exactamente esto, y RED tampoco lo tiene. Sólo cambia el{" "}
            <i>orden</i>: primero quien vence, luego quien está al corriente, y al final los
            inactivos por el que se acaba de ir.
          </>,
          <>
            El encabezado es una <b style={{ color: "var(--fg)" }}>razón</b>, no una partición:{" "}
            <Tnum style={{ color: "var(--fg)", fontWeight: 700 }}>{activas}</Tnum> activos de{" "}
            <Tnum style={{ color: "var(--fg)", fontWeight: 700 }}>{clientes.length}</Tnum>. Hoy la
            página muestra tres números que deberían sumar y suman de más (32 de 30). Éste no puede
            romperse porque nunca promete una partición.
          </>,
          <>
            Dos relojes, no uno. La fecha y las clases se acaban por separado —{" "}
            <i>venció</i> vs <i>sin clases</i>— y la insignia{" "}
            <b style={{ color: "var(--fg)" }}>«d sin venir»</b> (a partir de {AUSENTE_DIAS} días) sólo
            la puede llevar quien <i>sí</i> tiene paquete vivo. Hoy son{" "}
            <Tnum style={{ color: "var(--fg)", fontWeight: 700 }}>{totAusentes}</Tnum> (Héctor). No
            ordena, no cuenta, no crea sección.
          </>,
          <>
            <b style={{ color: "var(--warning)" }}>CUESTA —</b> los{" "}
            <Tnum style={{ color: "var(--fg)", fontWeight: 700 }}>{totFuera}</Tnum> que pasaron el
            corte de 15 días siguen aquí abajo, ocupando{" "}
            <Tnum>{Math.round((totFuera / clientes.length) * 100)}</Tnum>% de las filas. La lista
            plana los ordena bien pero no los <i>acota</i>: a 500 socios eso son{" "}
            <Tnum>{Math.round((totFuera / clientes.length) * 500)}</Tnum> filas que hay que
            scrollear. Lo que los acota es el tablero, no esta pantalla.
          </>,
          <>
            <b style={{ color: "var(--warning)" }}>CUESTA —</b> sin encabezados de sección, nada
            grita. Un dueño apurado ve 30 filas iguales y las{" "}
            <Tnum style={{ color: "var(--warning)", fontWeight: 700 }}>{totRenovar}</Tnum> que
            cobran hoy sólo se distinguen por la barra ámbar y por estar arriba. Si no entra por{" "}
            <a href={inicio} style={{ color: "var(--fg)", fontWeight: 700 }}>
              el tablero
            </a>
            , esta variante confía en que lea el orden — y{" "}
            <Tnum style={{ color: "var(--fg)", fontWeight: 700 }}>{totRecuperar}</Tnum> por
            recuperar no se ven distintos de los {totFuera} que ya no valen.
          </>,
        ]}
      />
    </ProtoShell>
  );
}

function FilaCliente({ f }: { f: Fila }) {
  const { c, activa, eje, diasDesdeFin, renovar, ausente } = f;

  // Colour, floored. #184 measured `critico` firing on 19/30 rows with 1
  // actionable (5.3% precision, BELOW the base rate) while the perfect
  // classifier rendered at 1.84:1. So: --warning (#e8902a, 7.9:1) goes ONLY to
  // the genuinely actionable, --muted to everyone whose package already ended,
  // and there is no red anywhere on this screen at all.
  const color = renovar ? "var(--warning)" : activa ? "var(--fg)" : "var(--muted)";
  const metrica = activa ? c.diasRest : (diasDesdeFin ?? null);
  const pie = activa
    ? renovar
      ? "por vencer"
      : "restantes"
    : eje === "clases"
      ? "sin clases"
      : "venció";

  return (
    <div
      className="relative flex w-full items-center"
      style={{ gap: 14, padding: "13px 22px", borderBottom: "1px solid var(--line)" }}
    >
      {renovar && (
        <span
          className="absolute"
          style={{ left: 0, top: 0, bottom: 0, width: 3, background: "var(--warning)" }}
        />
      )}
      <div style={{ opacity: activa ? 1 : 0.45 }}>
        <Avatar initial={c.inicial} size={42} />
      </div>

      <div className="min-w-0 flex-1">
        <div
          className="uppercase font-semibold"
          style={{ fontSize: 14, color: activa ? "var(--fg)" : "var(--muted)", letterSpacing: 0.4 }}
        >
          {c.nombre}
        </div>
        <div
          className="flex flex-wrap items-center"
          style={{ fontSize: 11, color: "var(--muted)", marginTop: 3, gap: 6 }}
        >
          <span className="uppercase" style={{ letterSpacing: 0.4 }}>
            {c.paquete}
          </span>
          {c.tel && (
            <>
              <span style={{ color: "var(--muted-soft)" }}>·</span>
              <Tnum>{c.tel}</Tnum>
            </>
          )}
          {/* TeamUp's `Slipping Away`, rendered the way Wodify renders its
              equivalent (a ring on the avatar): quiet, inline, and structurally
              incapable of appearing on someone without an active package. */}
          {ausente && (
            <span
              className="inline-flex items-center uppercase font-bold"
              style={{
                gap: 4,
                padding: "2px 6px",
                border: "1px solid var(--line-soft)",
                color: "var(--silver-dim)",
                fontSize: 8.5,
                letterSpacing: 0.9,
              }}
            >
              <Icon name="clock" size={9} color="var(--silver-dim)" />
              <Tnum>{c.diasSinVenir}</Tnum>d sin venir
            </span>
          )}
        </div>
      </div>

      {/* The ESTADO column — Fitco's `Cliente Activo` / `Cliente Inactivo` as a
          per-row value, in RED's voice. Never a section, never a tab. */}
      <div className="shrink-0" style={{ textAlign: "right", minWidth: 88 }}>
        <div
          className="uppercase font-extrabold"
          style={{
            fontSize: 9,
            letterSpacing: 1.1,
            color: activa ? "var(--silver-dim)" : "var(--muted-soft)",
          }}
        >
          {activa ? "VIGENTE" : eje === "clases" ? "SIN CLASES" : "VENCIDO"}
        </div>
        <div className="flex items-baseline justify-end" style={{ gap: 3, marginTop: 3 }}>
          {metrica == null ? (
            <span style={{ fontSize: 12, color: "var(--muted-soft)" }}>—</span>
          ) : (
            <>
              <Tnum className="font-extrabold" style={{ fontSize: 18, lineHeight: 1, color }}>
                {metrica}
              </Tnum>
              <span style={{ fontSize: 10, color: "var(--muted)" }}>
                {metrica === 1 ? "día" : "días"}
              </span>
            </>
          )}
        </div>
        <div style={{ fontSize: 9.5, color: "var(--muted-soft)", marginTop: 3, letterSpacing: 0.3 }}>
          {pie}
        </div>
      </div>
    </div>
  );
}
