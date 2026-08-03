"use client";

// apps/admin/src/app/proto/b-desk/_components/desk.tsx — THROWAWAY (map #180,
// variant B). Everything here is local state and mock sessions; nothing writes.
//
// THE ARGUMENT. #185 measured the operator's real week: 7.9 asistencias per
// venta, laid down daily at class hours, versus a directory they pass through on
// the way to /vender and have never once edited. So this variant moves the
// lifecycle signal onto the DESK — the screen they open 8× more often — and puts
// COBRAR in the same row, so the decision and the charge happen in one gesture
// while the member is physically standing there.
//
// CLIENTES gets exactly two changes, no more (see DirectorioView): urgency with
// a FLOOR (an expired ex-member stops sharing red with someone expiring in 2
// days) and a header that actually partitions (8 + 4 + 18 = 30, not 32 of 30).
//
// The weakness is rendered, not hidden: NoCruzanLaPuerta at the bottom is the
// cohort this whole design can never reach.

import * as React from "react";
import { Icon } from "@gym/ui/forge/icon";
import { AppBar, Avatar, Eyebrow, H1, Input, Segmented, Tnum } from "@gym/ui/forge/ui";
import { useRevealedWindow } from "@gym/ui/forge/use-revealed-window";

import type { RosterClient } from "../../_fixtures";

// ── The one rule, shared by both surfaces ────────────────────────────────
//
// Today's urgenciaCliente has no floor: dias = -44 and dias = +2 both return
// `critico` (#184 — 5.3% precision at RED, 7.1% at Forge, both BELOW their base
// rate). The floor is the whole fix: once the package is gone the member leaves
// the urgency ladder entirely instead of sitting at the top of it.

type Tier = "sinSaldo" | "cobrar" | "vigente";

function tierDe(c: RosterClient): Tier {
  const clases = c.clasesRest === "ilimitado" ? Infinity : c.clasesRest;
  if (c.diasRest < 0 || clases <= 0) return "sinSaldo"; // the floor
  if (c.diasRest <= 7 || clases <= 3) return "cobrar";
  return "vigente";
}

/** The colour hierarchy, inverted from today's. The loudest token goes to the
 *  4 rows that are actionable; the 18 with nothing left go QUIET. #184's
 *  measured defect was the reverse — and `--warning` (#e8902a, 7.9:1) is the
 *  legible token that was sitting unused next to `--gold` (#7e0d10, 1.84:1). */
const TIER_COLOR: Record<Tier, string> = {
  cobrar: "var(--warning)",
  vigente: "var(--fg)",
  sinSaldo: "var(--muted)",
};

/** #185: the AUSENTE population is 2 of 21 at 14 days. Real, so it earns a
 *  marker — never a section, a tab, or a count. */
const AUSENTE_DIAS = 14;

function esAusente(c: RosterClient): boolean {
  return c.diasSinVenir != null && c.diasSinVenir >= AUSENTE_DIAS;
}

function dLabel(n: number): string {
  return n === 1 ? "1 día" : `${n} días`;
}

// ── Mock schedule. Chrome, not roster data (hard rule 5 governs the roster) —
//    #89's desk is class-aware, and the pill row is how it reads. ──
const LIBRE = "libre";
const SESIONES = [
  { id: "s-07", hora: "07:00", tipo: "FUNCIONAL", capacidad: 18 },
  { id: "s-18", hora: "18:00", tipo: "CROSSFIT", capacidad: 20 },
  { id: "s-19", hora: "19:00", tipo: "CROSSFIT", capacidad: 20 },
];

type Vista = "puerta" | "directorio";

export function DeskScreen({ clientes, escala }: { clientes: RosterClient[]; escala: number }) {
  const [vista, setVista] = React.useState<Vista>("puerta");
  const [query, setQuery] = React.useState("");

  return (
    <div>
      <AppBar
        center={vista === "puerta" ? "PUERTA" : "DIRECTORIO"}
        trailing={
          <a
            href="/proto"
            aria-label="Volver al índice"
            className="flex items-center justify-center border border-line bg-surface"
            style={{ width: 38, height: 38 }}
          >
            <Icon name="close" size={16} color="var(--muted)" />
          </a>
        }
      />

      <div style={{ padding: "6px 16px 2px" }}>
        <Segmented<Vista>
          items={[
            { k: "puerta", l: "PUERTA" },
            { k: "directorio", l: "CLIENTES" },
          ]}
          value={vista}
          onChange={setVista}
        />
      </div>

      {vista === "puerta" ? (
        <PuertaView clientes={clientes} query={query} onQuery={setQuery} />
      ) : (
        <DirectorioView clientes={clientes} query={query} onQuery={setQuery} />
      )}

      <QueEstasViendo escala={escala} clientes={clientes} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// PUERTA — the desk. Mirrors the shipped #89 shape: class pill row, ONE
// number, search as a filter over a stationary list, tap-to-mark.
// ─────────────────────────────────────────────────────────────────────────

function PuertaView({
  clientes,
  query,
  onQuery,
}: {
  clientes: RosterClient[];
  query: string;
  onQuery: (v: string) => void;
}) {
  const [ctx, setCtx] = React.useState<string>(LIBRE);
  // Marks are per-context (`${ctx}:${id}`), exactly like the real per-visit
  // ledger. A charge is global — a sale is a sale in any context.
  const [marcados, setMarcados] = React.useState<Record<string, true>>({});
  const [bloqueados, setBloqueados] = React.useState<Record<string, true>>({});
  const [cobrados, setCobrados] = React.useState<Record<string, true>>({});

  const onTap = React.useCallback(
    (id: string, tier: Tier, cobrado: boolean) => {
      const k = `${ctx}:${id}`;
      // A dead package REFUSES the check-in (the real toggle_pase throws
      // 'Paquete vencido'). Instead of a toast that vanishes, the refusal opens
      // the charge rail: the reason and the remedy in one place.
      if (tier === "sinSaldo" && !cobrado) {
        setBloqueados((b) => {
          const n = { ...b };
          if (n[k]) delete n[k];
          else n[k] = true;
          return n;
        });
        return;
      }
      setMarcados((m) => {
        const n = { ...m };
        if (n[k]) delete n[k];
        else n[k] = true;
        return n;
      });
    },
    [ctx],
  );

  const onCobrar = React.useCallback(
    (id: string) => {
      const k = `${ctx}:${id}`;
      setCobrados((x) => ({ ...x, [id]: true }));
      setBloqueados((b) => {
        const n = { ...b };
        delete n[k];
        return n;
      });
      setMarcados((m) => ({ ...m, [k]: true }));
    },
    [ctx],
  );

  const sesion = SESIONES.find((s) => s.id === ctx);
  const filtrados = clientes.filter((c) => c.nombre.toLowerCase().includes(query.trim().toLowerCase()));
  const { visible } = useRevealedWindow(filtrados);

  const presentes = clientes.filter((c) => marcados[`${ctx}:${c.id}`]).length;
  // The money standing at the door right now: everyone in front of you whose
  // package is dead or nearly dead and who hasn't been charged yet.
  const porCobrar = clientes.filter((c) => {
    const k = `${ctx}:${c.id}`;
    if (cobrados[c.id]) return false;
    if (!marcados[k] && !bloqueados[k]) return false;
    const t = tierDe(c);
    return t === "cobrar" || t === "sinSaldo";
  }).length;

  return (
    <div>
      <div style={{ padding: "12px 22px 4px" }}>
        <H1 size={38}>ASISTENCIA</H1>
        <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 6 }}>
          Domingo 2 de agosto · toca para marcar entrada
        </div>
      </div>

      {/* Context pills — the #89 signature. */}
      <div
        className="forge-scroll flex overflow-x-auto"
        style={{ gap: 6, padding: "12px 16px 8px", scrollSnapType: "x proximity" }}
      >
        {[{ id: LIBRE, hora: "", tipo: "ACCESO LIBRE" }, ...SESIONES].map((s) => {
          const on = s.id === ctx;
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
                color: on ? "var(--yellow-fg)" : "var(--fg)",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {s.hora && (
                <Tnum style={{ fontSize: 10, fontWeight: 800, color: on ? "var(--yellow-fg)" : "var(--muted)" }}>
                  {s.hora}
                </Tnum>
              )}
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6 }}>{s.tipo}</span>
            </button>
          );
        })}
      </div>

      {/* The ONE number, plus the one this variant adds. */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "var(--canvas)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <div className="flex items-baseline justify-between" style={{ gap: 8, padding: "8px 22px 8px" }}>
          <span className="uppercase" style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.8 }}>
            {sesion ? `${sesion.hora} ${sesion.tipo}` : "ACCESO LIBRE"}
          </span>
          <div className="flex items-baseline" style={{ gap: 3 }}>
            <Tnum style={{ fontSize: 17, fontWeight: 800, lineHeight: 1, color: "var(--gold)" }}>{presentes}</Tnum>
            {sesion && (
              <Tnum style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)" }}>/ {sesion.capacidad}</Tnum>
            )}
          </div>
        </div>
        {porCobrar > 0 && (
          <div
            className="flex items-center uppercase"
            style={{
              gap: 7,
              padding: "7px 22px 8px",
              background: "var(--warning-soft)",
              borderTop: "1px solid var(--line)",
              color: "var(--warning)",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: 0.8,
            }}
          >
            <Icon name="cash" size={14} color="var(--warning)" />
            <Tnum>{porCobrar}</Tnum>
            <span>por cobrar en la puerta</span>
          </div>
        )}
      </div>

      <div style={{ padding: "12px 16px 4px" }}>
        <Input icon="search" placeholder="Filtrar…" value={query} onChange={onQuery} />
      </div>

      <div style={{ paddingTop: 4, borderTop: "1px solid var(--line)" }}>
        {visible.map((c) => {
          const k = `${ctx}:${c.id}`;
          return (
            <DeskRow
              key={c.id}
              cliente={c}
              presente={!!marcados[k]}
              bloqueado={!!bloqueados[k]}
              cobrado={!!cobrados[c.id]}
              onTap={onTap}
              onCobrar={onCobrar}
            />
          );
        })}
        {filtrados.length === 0 && (
          <div style={{ padding: "40px 22px", textAlign: "center", fontSize: 13, color: "var(--muted)" }}>
            Sin clientes que coincidan.
          </div>
        )}
      </div>

      <NoCruzanLaPuerta clientes={clientes} />
    </div>
  );
}

/** One desk row. The signal lives HERE, on the person standing in front of you:
 *  días restantes when the package is nearly out, the refusal + charge rail when
 *  it is gone, and a return note when they have been away. */
const DeskRow = React.memo(function DeskRow({
  cliente: c,
  presente,
  bloqueado,
  cobrado,
  onTap,
  onCobrar,
}: {
  cliente: RosterClient;
  presente: boolean;
  bloqueado: boolean;
  cobrado: boolean;
  onTap: (id: string, tier: Tier, cobrado: boolean) => void;
  onCobrar: (id: string) => void;
}) {
  const tier = cobrado ? "vigente" : tierDe(c);
  const ausente = esAusente(c);
  const col = TIER_COLOR[tier];

  const rail = !cobrado && (bloqueado || (presente && tier === "cobrar"));
  const nota = !cobrado && presente && tier === "vigente" && ausente;

  const railTitulo =
    c.diasRest < 0
      ? `Venció hace ${dLabel(-c.diasRest)}`
      : tier === "sinSaldo"
        ? "Sin clases · 0 restantes"
        : `Le quedan ${dLabel(c.diasRest)}`;
  const railSub =
    tier === "sinSaldo"
      ? `No puede entrar. Renovar ${c.paquete}.`
      : `Está aquí ahora mismo. ${c.paquete}.`;

  return (
    <div style={{ borderBottom: "1px solid var(--line)" }}>
      <div
        onClick={() => onTap(c.id, cobrado ? "vigente" : tierDe(c), cobrado)}
        className="forge-pressable flex w-full select-none items-center"
        style={{
          gap: 14,
          padding: "12px 22px",
          cursor: "pointer",
          background: presente ? "var(--yellow-soft)" : "transparent",
          transition: "background-color 180ms cubic-bezier(.32,.72,0,1)",
          opacity: tier === "sinSaldo" && !presente ? 0.62 : 1,
        }}
      >
        <Avatar initial={c.inicial} size={40} accent={presente} />
        <div className="min-w-0 flex-1">
          <div className="uppercase font-semibold" style={{ fontSize: 14, letterSpacing: 0.4, color: "var(--fg)" }}>
            {c.nombre}
          </div>
          <div className="flex flex-wrap items-center" style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3, gap: 5 }}>
            <span>
              <Tnum>{c.clasesRestLabel}</Tnum> cl
            </span>
            <span style={{ color: "var(--muted-soft)" }}>·</span>
            {cobrado ? (
              // A charge in this session RESETS the row's story: showing the old
              // "venció hace 44 d" next to a paid member would be the same lie
              // this variant exists to remove.
              <span className="uppercase font-bold" style={{ color: "var(--green)", letterSpacing: 0.5 }}>
                COBRADO · PAQUETE NUEVO
              </span>
            ) : (
              <>
                <span className="uppercase font-bold" style={{ color: col, letterSpacing: 0.5 }}>
                  {c.diasRest < 0
                    ? `VENCIÓ HACE ${-c.diasRest} D`
                    : tier === "sinSaldo"
                      ? "SIN CLASES"
                      : `VENCE EN ${c.diasRest} D`}
                </span>
                {ausente && (
                  <>
                    <span style={{ color: "var(--muted-soft)" }}>·</span>
                    <span className="uppercase font-bold" style={{ color: "var(--warning)", letterSpacing: 0.5 }}>
                      SIN VENIR {c.diasSinVenir} D
                    </span>
                  </>
                )}
              </>
            )}
          </div>
        </div>
        <div
          className="flex shrink-0 items-center justify-center"
          style={{
            width: 28,
            height: 28,
            background: presente ? "var(--yellow)" : "transparent",
            border: `1.5px solid ${presente ? "var(--yellow)" : bloqueado ? "var(--warning)" : "var(--muted-soft)"}`,
          }}
        >
          {presente ? (
            <Icon name="check" size={16} color="var(--yellow-fg)" />
          ) : bloqueado ? (
            <Icon name="minus" size={14} color="var(--warning)" />
          ) : null}
        </div>
      </div>

      {/* The charge rail: the reason and the remedy in one breath. */}
      {rail && (
        <div
          className="flex items-center"
          style={{
            gap: 12,
            padding: "11px 22px 13px",
            background: "var(--warning-soft)",
            borderTop: "1px solid var(--warning)",
          }}
        >
          <div className="min-w-0 flex-1">
            <div
              className="uppercase font-extrabold"
              style={{ fontSize: 11.5, letterSpacing: 0.7, color: "var(--warning)" }}
            >
              {railTitulo}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{railSub}</div>
          </div>
          <button
            onClick={() => onCobrar(c.id)}
            className="forge-pressable shrink-0 uppercase font-extrabold"
            style={{
              padding: "11px 16px",
              background: "var(--warning)",
              color: "var(--ink)",
              border: "none",
              fontSize: 12,
              letterSpacing: 1.3,
              cursor: "pointer",
            }}
          >
            COBRAR
          </button>
        </div>
      )}

      {/* Paid up, but they had stopped coming. Nothing to sell — just say it. */}
      {nota && (
        <div
          className="uppercase font-bold"
          style={{
            padding: "8px 22px 10px",
            background: "var(--sunk)",
            borderTop: "1px solid var(--line)",
            fontSize: 10.5,
            letterSpacing: 0.8,
            color: "var(--warning)",
          }}
        >
          Volvió · no venía desde hace <Tnum>{c.diasSinVenir}</Tnum> días
        </div>
      )}
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────
// The honest weakness, rendered where it actually lives: at the bottom of a
// 30-row list, below the fold, on the screen the operator uses during a class
// rush. Nobody scrolls here. That IS the finding.
// ─────────────────────────────────────────────────────────────────────────

function NoCruzanLaPuerta({ clientes }: { clientes: RosterClient[] }) {
  const nunca = clientes.filter((c) => c.diasSinVenir == null);
  const idos = clientes.filter((c) => c.diasSinVenir != null && c.diasSinVenir >= AUSENTE_DIAS);
  const total = nunca.length + idos.length;
  // Paid up and absent: the ONE cohort a check-in signal was supposed to catch,
  // and the one it structurally cannot — they are not checking in.
  const pagados = idos.filter((c) => tierDe(c) !== "sinSaldo");
  const muestra = [...pagados, ...nunca, ...idos.filter((c) => tierDe(c) === "sinSaldo")].slice(0, 8);

  return (
    <div style={{ marginTop: 28, background: "var(--sunk)", borderTop: "1px solid var(--line)" }}>
      <div style={{ padding: "18px 22px 4px" }}>
        <div className="flex items-baseline" style={{ gap: 8 }}>
          <Eyebrow style={{ color: "var(--muted-soft)" }}>NO CRUZAN LA PUERTA</Eyebrow>
          <Tnum style={{ fontSize: 12, fontWeight: 800, color: "var(--muted-soft)" }}>{total}</Tnum>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 8, lineHeight: 1.55 }}>
          Esta pantalla solo habla de quien se para enfrente. Estas <Tnum>{total}</Tnum> personas de{" "}
          <Tnum>{clientes.length}</Tnum> llevan 14 días o más sin venir — o nunca vinieron. Ninguna
          va a aparecer marcada, así que ninguna señal de esta pantalla las alcanza jamás.
        </div>
      </div>

      <div style={{ padding: "12px 0 4px" }}>
        {muestra.map((c) => {
          const vivo = tierDe(c) !== "sinSaldo";
          return (
            <div
              key={c.id}
              className="flex items-center"
              style={{ gap: 12, padding: "9px 22px", borderTop: "1px solid var(--line)" }}
            >
              <div className="min-w-0 flex-1">
                <div
                  className="uppercase"
                  style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: 0.3, color: vivo ? "var(--fg)" : "var(--muted)" }}
                >
                  {c.nombre}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--muted-soft)", marginTop: 2 }}>
                  {c.diasSinVenir == null ? (
                    "Nunca registró una asistencia"
                  ) : (
                    <>
                      Última visita hace <Tnum>{c.diasSinVenir}</Tnum> días
                    </>
                  )}
                </div>
              </div>
              <div className="shrink-0 uppercase font-bold" style={{ fontSize: 10, letterSpacing: 0.7, textAlign: "right" }}>
                {vivo ? (
                  <span style={{ color: "var(--warning)" }}>
                    PAGADO · <Tnum>{c.diasRest}</Tnum> D SIN USAR
                  </span>
                ) : (
                  <span style={{ color: "var(--muted-soft)" }}>SIN SALDO</span>
                )}
              </div>
            </div>
          );
        })}
        {total > muestra.length && (
          <div style={{ padding: "10px 22px 2px", fontSize: 11, color: "var(--muted-soft)" }}>
            +<Tnum>{total - muestra.length}</Tnum> más
          </div>
        )}
      </div>

      <div style={{ padding: "14px 22px 20px", fontSize: 11.5, color: "var(--muted)", lineHeight: 1.55 }}>
        Los de arriba en ámbar ya pagaron y su mes se está gastando solo — son el único
        riesgo de renovación que queda vivo, y son precisamente los que nunca van a
        activar una alerta en la puerta.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// DIRECTORIO — the minimum honest fix, and nothing else.
//
// Exactly two changes vs. today: (1) urgency has a FLOOR, so the 18 with
// nothing left stop wearing the loudest colour and the 4 who are actually
// expiring get `--warning` (7.9:1) instead of `--gold` (1.84:1); (2) the header
// PARTITIONS — the three counts sum to the total, on screen, instead of
// rendering 32 of 30.
//
// Deliberately NOT changed: the días-ascending default sort still puts the
// expired on top, and there is no absence marker here. Both are costs of this
// variant, named in the panel below.
// ─────────────────────────────────────────────────────────────────────────

function DirectorioView({
  clientes,
  query,
  onQuery,
}: {
  clientes: RosterClient[];
  query: string;
  onQuery: (v: string) => void;
}) {
  const [sort, setSort] = React.useState<"dias" | "nombre">("dias");

  const vigente = clientes.filter((c) => tierDe(c) === "vigente").length;
  const cobrar = clientes.filter((c) => tierDe(c) === "cobrar").length;
  const sinSaldo = clientes.length - vigente - cobrar;

  const lista = clientes
    .filter((c) => c.nombre.toLowerCase().includes(query.trim().toLowerCase()))
    .toSorted((a, b) => (sort === "dias" ? a.diasRest - b.diasRest : a.nombre.localeCompare(b.nombre)));
  const { visible } = useRevealedWindow(lista);

  return (
    <div>
      <div style={{ padding: "12px 22px 4px" }}>
        <H1 size={38}>CLIENTES</H1>
        {/* The partition, shown as arithmetic so it can be checked by eye. */}
        <div
          className="flex flex-wrap items-baseline"
          style={{ gap: 6, marginTop: 9, fontSize: 12, color: "var(--muted)" }}
        >
          <Tnum style={{ color: "var(--fg)", fontWeight: 800 }}>{clientes.length}</Tnum>
          <span style={{ color: "var(--muted-soft)" }}>=</span>
          <Tnum style={{ color: "var(--fg)", fontWeight: 700 }}>{vigente}</Tnum>
          <span>vigentes</span>
          <span style={{ color: "var(--muted-soft)" }}>+</span>
          <Tnum style={{ color: "var(--warning)", fontWeight: 700 }}>{cobrar}</Tnum>
          <span style={{ color: "var(--warning)" }}>por cobrar</span>
          <span style={{ color: "var(--muted-soft)" }}>+</span>
          <Tnum style={{ color: "var(--muted)", fontWeight: 700 }}>{sinSaldo}</Tnum>
          <span>sin saldo</span>
        </div>
      </div>

      <div style={{ padding: "14px 16px 0" }}>
        <Input icon="search" placeholder="Nombre o teléfono…" value={query} onChange={onQuery} />
      </div>

      <div className="flex items-center justify-between" style={{ padding: "14px 22px 6px" }}>
        <Eyebrow style={{ fontSize: 10 }}>
          {lista.length} {lista.length === 1 ? "CLIENTE" : "CLIENTES"}
        </Eyebrow>
        <div className="flex items-center">
          <span style={{ fontSize: 10, color: "var(--muted)", letterSpacing: 1, marginRight: 8 }}>ORDEN</span>
          {(
            [
              { k: "dias", l: "Días" },
              { k: "nombre", l: "A→Z" },
            ] as const
          ).map((s) => (
            <button
              key={s.k}
              onClick={() => setSort(s.k)}
              className="forge-pressable"
              style={{
                background: "transparent",
                border: "none",
                padding: "10px 8px",
                cursor: "pointer",
                color: sort === s.k ? "var(--yellow)" : "var(--muted)",
                fontWeight: 700,
                fontSize: 11,
                letterSpacing: 0.4,
              }}
            >
              <span
                style={{
                  borderBottom: "1.5px solid",
                  borderColor: sort === s.k ? "var(--yellow)" : "transparent",
                  paddingBottom: 2,
                }}
              >
                {s.l}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ paddingBottom: 8 }}>
        {visible.map((c) => {
          const tier = tierDe(c);
          const col = TIER_COLOR[tier];
          return (
            <div
              key={c.id}
              className="relative flex w-full items-center"
              style={{ gap: 14, padding: "14px 22px", borderBottom: "1px solid var(--line)" }}
            >
              {/* The accent bar now fires on the 4 actionable rows, not the 22. */}
              <span
                className="absolute"
                style={{ left: 0, top: 0, bottom: 0, width: 3, background: tier === "cobrar" ? col : "transparent" }}
              />
              <Avatar initial={c.inicial} size={42} />
              <div className="min-w-0 flex-1">
                <div
                  className="uppercase font-semibold"
                  style={{ fontSize: 14, letterSpacing: 0.4, color: tier === "sinSaldo" ? "var(--muted)" : "var(--fg)" }}
                >
                  {c.nombre}
                </div>
                <div
                  className="flex flex-wrap items-center uppercase"
                  style={{ fontSize: 11, color: "var(--muted)", marginTop: 3, gap: 6, letterSpacing: 0.4 }}
                >
                  <span>{c.paquete}</span>
                  {c.tel && (
                    <>
                      <span style={{ color: "var(--muted-soft)" }}>·</span>
                      <Tnum>{c.tel}</Tnum>
                    </>
                  )}
                </div>
              </div>
              <div className="shrink-0" style={{ textAlign: "right", minWidth: 56 }}>
                <div className="flex items-baseline justify-end" style={{ gap: 3 }}>
                  <Tnum className="font-extrabold" style={{ fontSize: 17, lineHeight: 1, color: col }}>
                    {c.diasRest}
                  </Tnum>
                  <span style={{ fontSize: 10, color: "var(--muted)" }}>{c.diasRest === 1 ? "día" : "días"}</span>
                </div>
                <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 4 }}>
                  <Tnum>{c.clasesRestLabel}</Tnum> cl
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────

function QueEstasViendo({ escala, clientes }: { escala: number; clientes: RosterClient[] }) {
  const cobrar = clientes.filter((c) => tierDe(c) === "cobrar").length;
  const inalcanzables = clientes.filter((c) => c.diasSinVenir == null || c.diasSinVenir >= AUSENTE_DIAS).length;

  const lineas = [
    <>
      <b style={{ color: "var(--fg)" }}>Mueve la señal a la puerta.</b> El operador marca asistencia
      7.9 veces por cada venta (#185) y nunca ha editado una ficha. Esta variante deja de esperar a que
      abra el directorio y le habla donde ya está.
    </>,
    <>
      <b style={{ color: "var(--fg)" }}>Decidir y cobrar en el mismo gesto.</b> Al marcar entrada la
      fila dice días restantes y ausencia, y si el paquete se acabó la entrada se <i>rechaza</i> y abre
      COBRAR ahí mismo — con la persona enfrente, no en una lista de pendientes.
    </>,
    <>
      <b style={{ color: "var(--fg)" }}>CLIENTES recibe solo el arreglo mínimo honesto:</b> urgencia
      con piso (vencido deja de compartir el rojo con quien vence en 2 días) y un encabezado que
      particiona de verdad — los tres números suman {clientes.length}, no {clientes.length + 2}.
    </>,
    <>
      <b style={{ color: "var(--warning)" }}>Lo que cuesta:</b> solo dispara con quien cruza la puerta.{" "}
      {inalcanzables} de {clientes.length} personas llevan 14+ días sin venir o nunca vinieron, y son
      invisibles aquí. Héctor — pagado, 12 días de valor sin usar, ausente 24 — es el único riesgo real
      de renovación y no aparece en <i>ninguna</i> de las dos pantallas.
    </>,
    <>
      <b style={{ color: "var(--warning)" }}>Y depende de un hábito:</b> si un día nadie pasa lista, no
      hay señal en todo el día; y solo {cobrar} de {clientes.length} filas tienen algo que cobrar, así
      que la mayoría de los turnos esta pantalla se ve idéntica a la de hoy.
    </>,
  ];

  return (
    <div style={{ borderTop: "1px solid var(--line)", background: "var(--surface)", padding: "20px 22px 32px" }}>
      <Eyebrow>QUÉ ESTÁS VIENDO</Eyebrow>
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
        {lineas.map((l, i) => (
          <div key={i} style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.6 }}>
            {l}
          </div>
        ))}
      </div>
      <div className="flex items-center" style={{ gap: 8, marginTop: 18 }}>
        <span style={{ fontSize: 10, letterSpacing: 1.1, color: "var(--muted-soft)", fontWeight: 700 }}>ESCALA</span>
        {[30, 200, 500].map((n) => (
          <a
            key={n}
            href={`/proto/b-desk?n=${n}`}
            className="font-extrabold"
            style={{
              padding: "6px 12px",
              border: `1px solid ${n === escala ? "var(--fg)" : "var(--line)"}`,
              background: n === escala ? "var(--fg)" : "transparent",
              color: n === escala ? "var(--canvas)" : "var(--fg)",
              fontSize: 11,
              textDecoration: "none",
            }}
          >
            {n}
          </a>
        ))}
      </div>
    </div>
  );
}
