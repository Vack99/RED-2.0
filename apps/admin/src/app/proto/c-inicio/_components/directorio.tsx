"use client";

import * as React from "react";
import { Icon } from "@gym/ui/forge/icon";
import { AppBar, Avatar, Badge, Eyebrow, H1, Input, Tnum } from "@gym/ui/forge/ui";
import { useRevealedWindow } from "@gym/ui/forge/use-revealed-window";
import type { RosterClient } from "../../_fixtures";
import { Nota } from "./nota";

// THROWAWAY — variant C, screen 2. See ../directorio/page.tsx.
//
// Deliberately ABSENT from this file, and that absence IS the variant:
// urgenciaCliente, urgencyColor, the días/nombre/asist sort switch, the filter
// funnel, the "por renovar" facet, the 3px accent bar, useFlip. Nothing here
// reorders and nothing here is red.

/** Accent-blind, case-blind fold. `chavez` must find CHÁVEZ — #184 finding 1
 *  measured that today's `toLowerCase().includes()` finds 0 of 4 Chávez, and
 *  that 13 of RED's 30 members carry an accent, i.e. search cannot reach 43% of
 *  the gym by name. NFD splits the letter from its mark; the range strips the
 *  combining marks. (Not \p{Diacritic}: that needs target ≥ ES2018.) */
function fold(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** The row's state, in words, for every member — no colour, no ranking.
 *  Note what it does NOT say on an expired row: "∞ clases". #184 finding 6 —
 *  13 of 30 rows currently tell the owner an ex-member has unlimited classes
 *  left, because the roster renders `clasesRestLabel` without checking expiry. */
function enPalabras(c: RosterClient): string {
  if (c.diasRest < 0) {
    const d = -c.diasRest;
    return d === 1 ? "venció ayer" : `venció hace ${d} días`;
  }
  const clases = c.clasesRest === "ilimitado" ? Infinity : c.clasesRest;
  const cuando =
    c.diasRest === 0 ? "vence hoy" : c.diasRest === 1 ? "vence mañana" : `vence en ${c.diasRest} días`;
  if (clases <= 0) return `sin clases · ${cuando}`;
  if (clases !== Infinity) return `${clases === 1 ? "1 clase" : `${clases} clases`} · ${cuando}`;
  return cuando;
}

export function DirectorioC({
  clientes,
  n,
  q0,
}: {
  clientes: RosterClient[];
  n: number;
  /** Pre-filled search, set when INICIO deep-links a person over here. */
  q0: string;
}) {
  const [query, setQuery] = React.useState(q0);

  // A true partition — the three buckets sum to the roster, exactly, always.
  // #184 finding 8: today's `total · vigentes · por renovar` overlaps, so the
  // header renders 32 of 30.
  const conPaquete = clientes.filter((c) => c.estado !== "sin_clases").length;
  const vencidos = clientes.filter((c) => c.diasRest < 0).length;
  const paseUsado = clientes.length - conPaquete - vencidos;

  // ONE order, always: A→Z. There is no sort control on this screen.
  const ordenado = React.useMemo(
    () => clientes.toSorted((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [clientes],
  );

  const lista = React.useMemo(() => {
    const q = fold(query.trim());
    if (!q) return ordenado;
    const digitos = query.replace(/\D/g, "");
    return ordenado.filter(
      (c) => fold(c.nombre).includes(q) || (digitos.length >= 3 && !!c.tel?.includes(digitos)),
    );
  }, [ordenado, query]);

  const { visible } = useRevealedWindow(lista);

  // Letter dividers. Derived from the FULL ordered roster (not the filtered
  // list) so the jump rail doesn't flicker while typing; it only shows when
  // there's no query anyway.
  const letras = React.useMemo(() => {
    const set = new Set(ordenado.map((c) => fold(c.nombre).charAt(0).toUpperCase()));
    return [...set].toSorted((a, b) => a.localeCompare(b, "es"));
  }, [ordenado]);

  const saltarA = (l: string) =>
    document.getElementById(`ltr-${l}`)?.scrollIntoView({ block: "start" });

  const buscando = query.trim().length > 0;

  return (
    <div>
      <AppBar
        onBack={() => {
          window.location.href = `/proto/c-inicio?n=${n}`;
        }}
        center="DIRECTORIO"
        trailing={
          <div
            aria-hidden
            className="flex items-center justify-center"
            style={{ width: 38, height: 38, background: "var(--yellow)" }}
          >
            <Icon name="plus" size={18} color="var(--ink)" />
          </div>
        }
      />

      {/* SEARCH FIRST — literally. The real page puts the title and three
          counts above the field; here the field is the first thing under the
          bar, because looking someone up is the only job left on this screen. */}
      <div style={{ padding: "10px 16px 0" }}>
        <Input icon="search" placeholder="Nombre o teléfono…" value={query} onChange={setQuery} />
      </div>

      <div style={{ padding: "16px 22px 0" }}>
        <H1 size={34}>CLIENTES</H1>
        <div className="flex flex-wrap" style={{ gap: 10, marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
          <span><Tnum style={{ color: "var(--fg)", fontWeight: 700 }}>{conPaquete}</Tnum> con paquete</span>
          <span style={{ color: "var(--muted-soft)" }}>·</span>
          <span><Tnum style={{ color: "var(--fg)", fontWeight: 700 }}>{vencidos}</Tnum> vencidos</span>
          <span style={{ color: "var(--muted-soft)" }}>·</span>
          <span><Tnum style={{ color: "var(--fg)", fontWeight: 700 }}>{paseUsado}</Tnum> pase usado</span>
        </div>
        <div style={{ fontSize: 10.5, color: "var(--muted-soft)", marginTop: 6, letterSpacing: 0.3 }}>
          Suman {clientes.length} de {clientes.length}. Nadie cuenta dos veces.
        </div>
      </div>

      {/* A→Z jump rail — the compensation for losing the ranking: if nothing is
          sorted to the top, the list has to be navigable by hand. */}
      {!buscando && (
        <div className="flex" style={{ padding: "14px 12px 0", gap: 1 }}>
          {letras.map((l) => (
            <button
              key={l}
              onClick={() => saltarA(l)}
              className="flex-1 font-bold"
              style={{
                minWidth: 0,
                padding: "8px 0",
                background: "transparent",
                border: "none",
                color: "var(--muted)",
                fontSize: 10.5,
                letterSpacing: 0.2,
                cursor: "pointer",
              }}
            >
              {l}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between" style={{ padding: "12px 22px 6px" }}>
        <Eyebrow style={{ fontSize: 10 }}>
          {lista.length} {lista.length === 1 ? "CLIENTE" : "CLIENTES"}
        </Eyebrow>
        {buscando && (
          <button
            onClick={() => setQuery("")}
            className="forge-pressable uppercase font-bold"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "8px 6px",
              margin: "-8px -6px",
              color: "var(--gold)",
              fontSize: 10,
              letterSpacing: 0.8,
            }}
          >
            Limpiar
          </button>
        )}
      </div>

      <div style={{ paddingBottom: 4 }}>
        {lista.length === 0 && (
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <Icon name="search" size={26} color="var(--muted-soft)" />
            <div className="uppercase font-extrabold" style={{ fontSize: 14, color: "var(--fg)", marginTop: 12, letterSpacing: 0.4 }}>
              Nadie con ese nombre
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6, lineHeight: 1.5 }}>
              La búsqueda ignora acentos: <b style={{ color: "var(--fg)" }}>chavez</b> encuentra CHÁVEZ.
            </div>
          </div>
        )}

        {visible.map((c, i) => {
          const letra = fold(c.nombre).charAt(0).toUpperCase();
          const letraAnterior = i === 0 ? null : fold(visible[i - 1].nombre).charAt(0).toUpperCase();
          const nuevaLetra = !buscando && letra !== letraAnterior;
          return (
            <React.Fragment key={c.id}>
              {nuevaLetra && (
                <div
                  id={`ltr-${letra}`}
                  className="sticky uppercase font-extrabold"
                  style={{
                    top: 0,
                    zIndex: 2,
                    padding: "7px 22px",
                    background: "var(--sunk)",
                    borderTop: "1px solid var(--line)",
                    borderBottom: "1px solid var(--line)",
                    fontSize: 10.5,
                    letterSpacing: 1.6,
                    color: "var(--muted)",
                  }}
                >
                  {letra}
                </div>
              )}
              <div
                className="flex w-full items-center"
                style={{ gap: 14, padding: "13px 22px", borderBottom: "1px solid var(--line)" }}
              >
                <Avatar initial={c.inicial} size={42} />
                <div className="min-w-0 flex-1">
                  <div className="uppercase font-semibold" style={{ fontSize: 14, color: "var(--fg)", letterSpacing: 0.4 }}>
                    {c.nombre}
                  </div>
                  {/* The state, in words. No accent bar, no red, no number
                      shouting from the right edge — and no reordering: this row
                      sits in the same place whatever it says. */}
                  <div style={{ fontSize: 11.5, color: "var(--fg)", marginTop: 4 }}>{enPalabras(c)}</div>
                  <div className="flex flex-wrap items-center" style={{ fontSize: 11, color: "var(--muted)", marginTop: 3, gap: 6 }}>
                    <span className="uppercase" style={{ letterSpacing: 0.4 }}>{c.paquete}</span>
                    {c.tel && (
                      <>
                        <span style={{ color: "var(--muted-soft)" }}>·</span>
                        <Tnum>{c.tel}</Tnum>
                      </>
                    )}
                    <Badge
                      state={c.invitacion.estado === "cuenta_activa" ? "success" : "info"}
                      style={{ padding: "2px 6px", fontSize: 8.5, letterSpacing: 0.9 }}
                    >
                      {c.invitacion.badge}
                    </Badge>
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      <div style={{ padding: "16px 16px 0" }}>
        <a
          href={`/proto/c-inicio?n=${n}`}
          className="forge-pressable flex w-full items-center border border-line bg-surface"
          style={{ padding: "14px 16px", gap: 12, textDecoration: "none" }}
        >
          <Icon name="alert" size={16} color="var(--warning)" />
          <div className="min-w-0 flex-1">
            <Eyebrow color="var(--warning)">QUIÉN NECESITA ATENCIÓN</Eyebrow>
            <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 3, letterSpacing: 0.3 }}>
              Ya no vive aquí. Está en INICIO.
            </div>
          </div>
          <Icon name="chev" size={14} color="var(--muted)" />
        </a>
      </div>

      <Nota
        lines={[
          <>
            Cero jerarquía: A→Z fijo, sin “ORDEN”, sin filtros, sin rojo, sin barra de acento. Ninguna fila
            se mueve nunca. Es el patrón que #181 encontró en 20 sistemas: la recencia vive en un reporte,
            nunca como orden del directorio.
          </>,
          <>
            Cada fila <b style={{ color: "var(--fg)" }}>dice</b> su estado en palabras — “vence en 4 días”,
            “venció hace 20 días”. Nadie tiene que traducir un color, y a los vencidos ya no les dice “∞
            clases”.
          </>,
          <>
            El encabezado ahora <b style={{ color: "var(--fg)" }}>parte</b>: {conPaquete} + {vencidos} +{" "}
            {paseUsado} = {clientes.length}, exacto. Hoy “vigentes” y “por renovar” se traslapan y suman
            más que el total. Y la búsqueda ignora acentos: hoy “chavez” no encuentra a ninguna CHÁVEZ.
          </>,
          <>
            Costo honesto: esta pantalla ya no te dice <b style={{ color: "var(--fg)" }}>nada</b> por sí
            sola. Si abres CLIENTES sin pasar por INICIO, Diana vence mañana y no te enteras. ¿Se busca
            mejor, o nada más quedó vacía?
          </>,
          <>
            A 500 socios lo único que la salva es el riel A→Z y la búsqueda; pruébala en 500 antes de
            opinar. Las filas aquí no abren ficha — es prototipo.
          </>,
        ]}
      />

      <div style={{ height: 24 }} />
    </div>
  );
}
