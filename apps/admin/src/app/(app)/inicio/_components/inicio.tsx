import type { Route } from "next";
import Link from "next/link";

import type { AsistenciasResumenHoy } from "@gym/data/server/asistencia";
import {
  CUBO_LABEL,
  CUBO_ORDEN,
  RECUPERACION_DIAS,
  RENOVACION_CLASES,
  RENOVACION_DIAS,
  type CuboRenovar,
} from "@gym/domain/lifecycle";
import type { Modo } from "@gym/domain/types";
import { Icon } from "@gym/ui/forge/icon";
import { Card, Eyebrow, Tnum } from "@gym/ui/forge/ui";

import { AsistenciasHoyHero } from "./asistencias-hoy-hero";
import type { DiaVM, TenseDia } from "./inicio-vm";

/**
 * The /inicio screen (#328) — a SERVER component on purpose: every block is a number
 * or a link, all clock/tz work already happened in page.tsx (fecha, the day-card
 * derivation), so shipping zero client JS here is what makes the SSR and hydration
 * renders identical by construction (rule 5 — no clock work on the client).
 *
 * Block order (spec #326 "Admin home"): header (date · gym name · account initial) →
 * day card (Cupo: ONE hero class carrying PASAR LISTA + the classes still ahead;
 * Lista: forced to the standalone PASE DE LISTA arm) → the 50/50 action pair (Cupo:
 * + Nuevo cliente / Apartar lugar; Lista: + Nuevo cliente alone, full width) →
 * MEMBRESÍAS (one merged renewal card, ONE combined-predicate link) → registros
 * online strip (hidden at 0). Every OTHER visual choice here is main's CURRENT skin
 * (`@gym/ui/forge/ui`'s uppercase Eyebrow/H1, `--ink`-on-`--yellow` primary, plain
 * bordered Card, no `rounded-*` classes) — the mobile-admin worktree's reskinned
 * primitives never cross (#328 kickoff handoff); only the STRUCTURE below is new.
 */

const HERO_EYEBROW: Record<TenseDia, { palabra: string; tono: string }> = {
  en_curso: { palabra: "EN CURSO", tono: "var(--gold)" },
  terminada: { palabra: "TERMINÓ", tono: "var(--muted-soft)" },
  proxima: { palabra: "A CONTINUACIÓN", tono: "var(--gold)" },
};

interface InicioScreenProps {
  modo: Modo;
  /** "SÁB 8 AGO" — fmtDiaAgenda, gym tz (server-formatted). */
  fecha: string;
  gymNombre: string;
  /** The gym's own initial, derived from the resolved gym — never a literal. */
  inicialCuenta: string;
  /** The Cupo day card (see inicio-vm): hero + the classes still ahead. Always `null`
   *  on Lista (the caller never even reads the schedule, ../reads.ts) and on Cupo
   *  whenever there is no hero left (day over, no classes, or a failed read). */
  dia: DiaVM | null;
  /** `/agenda?sesion=<próxima>` or plain `/agenda` when nothing is left today —
   *  unused on Lista, which never renders "Apartar lugar" at all. */
  apartarHref: Route;
  vigentes: number;
  total: number;
  nuevosOnline: number;
  porRenovar: { total: number; cubos: Record<CuboRenovar, number> };
  aunATiempo: { total: number };
  /** ASISTENCIAS · HOY hero counts (owner ruling 2026-09-01) — issued ONLY on Lista
   *  (`../reads.ts`'s `leerResumenAsistencias`, the mirror of `dia`'s Cupo-only read).
   *  Always `null` on Cupo, whose own class hero leads the day card instead. */
  asistenciasResumen: AsistenciasResumenHoy | null;
}

export function InicioScreen({
  modo,
  fecha,
  gymNombre,
  inicialCuenta,
  dia,
  apartarHref,
  vigentes,
  total,
  nuevosOnline,
  porRenovar,
  aunATiempo,
  asistenciasResumen,
}: InicioScreenProps) {
  return (
    <div style={{ padding: "18px 22px 32px" }}>
      {/* Header — date · gym name · account initial (spec #326). No lockup here: the
          resolved gym's NAME is the identifying mark on this screen, not its logo. */}
      <div className="flex items-center justify-between">
        <span className="flex items-baseline" style={{ gap: 9 }}>
          <Tnum className="uppercase font-semibold" style={{ fontSize: 12, letterSpacing: 1, color: "var(--fg)" }}>
            {fecha}
          </Tnum>
          <Eyebrow style={{ fontSize: 10 }}>{gymNombre}</Eyebrow>
        </span>
        <Link
          href="/cuenta"
          aria-label="Cuenta"
          className="forge-hit forge-pressable flex items-center justify-center border border-line bg-surface font-extrabold"
          style={{ width: 34, height: 34, color: "var(--fg)", fontSize: 11, letterSpacing: 0.6 }}
        >
          {inicialCuenta}
        </Link>
      </div>

      {/* ASISTENCIAS · HOY — Lista only (owner ruling 2026-09-01, restoring what #328
          dropped). Sits at the TOP of the day card area, directly above the standalone
          PASE DE LISTA CTA below it. Cupo never renders this — its own class hero
          already leads the day card. */}
      {modo === "lista" && asistenciasResumen && (
        <AsistenciasHoyHero
          hoy={asistenciasResumen.hoy}
          ayer={asistenciasResumen.ayer}
          semana={asistenciasResumen.semana}
        />
      )}

      {/* Day card. Cupo with a hero: ONE class — live → ±90-nearest → next-upcoming —
          leads the card in its own tense, with the tense-matched count and the
          PASAR LISTA CTA attached to THAT class, and only the classes still ahead
          row below it. Every other case — Lista (forced), or Cupo with the day over /
          no classes / a failed schedule read — falls to the standalone PASE DE LISTA
          CTA below. */}
      {dia ? (
        <Card style={{ marginTop: 16, padding: dia.clases.length ? "18px 20px 4px" : "18px 20px" }}>
          <div className="flex items-baseline justify-between">
            <Eyebrow color={HERO_EYEBROW[dia.hero.tense].tono} style={{ fontSize: 10 }}>
              {HERO_EYEBROW[dia.hero.tense].palabra} · {dia.hero.hora}
            </Eyebrow>
            <Tnum style={{ fontSize: 12, color: "var(--muted)" }}>{dia.hero.cuenta}</Tnum>
          </div>
          <div style={{ marginTop: 6, fontSize: 22, fontWeight: 800, letterSpacing: -0.4, color: "var(--fg)" }}>
            {dia.hero.titulo}
            {dia.hero.coaches && (
              <span style={{ fontSize: 13, fontWeight: 400, color: "var(--muted)" }}> · Coach {dia.hero.coaches}</span>
            )}
          </div>
          {/* → the desk with the HERO class preselected — `?sesion=` is resolved
              SERVER-side into /asistencia's initial context (never a client-side
              selection). Every tense deep-links: a just-ended hero is exactly the
              stragglers-still-marking case the desk's own ±90 preselect serves. */}
          <Link
            href={`/asistencia?sesion=${dia.hero.id}` as Route}
            className="forge-pressable flex items-center justify-center uppercase font-extrabold"
            style={{
              marginTop: 12,
              padding: "13px 0",
              background: "var(--yellow)",
              color: "var(--ink)",
              fontSize: 13.5,
              letterSpacing: 1.2,
            }}
          >
            Pasar lista →
          </Link>
          {/* The classes still AHEAD, tappable into the Agenda. Every row is upcoming
              by construction, so the right slot is always its reservas/cupo — no
              ✓/attendance row can exist below the hero. */}
          {dia.clases.length > 0 && (
            <div style={{ marginTop: 14 }}>
              {dia.clases.map((r) => (
                <Link
                  key={r.id}
                  href={`/agenda?sesion=${r.id}` as Route}
                  className="forge-pressable flex items-baseline justify-between"
                  style={{ padding: "10px 0", borderTop: "1px solid var(--line)", color: "var(--fg)" }}
                >
                  <span className="flex items-baseline" style={{ gap: 12 }}>
                    <Tnum className="font-semibold" style={{ fontSize: 13 }}>{r.hora}</Tnum>
                    <span style={{ fontSize: 14 }}>{r.nombre}</span>
                  </span>
                  <Tnum style={{ fontSize: 12, color: "var(--muted)" }}>{r.cuenta}</Tnum>
                </Link>
              ))}
            </div>
          )}
        </Card>
      ) : (
        <Link
          href="/asistencia"
          className="forge-pressable flex items-center justify-center uppercase font-extrabold"
          style={{ marginTop: 16, padding: 17, background: "var(--yellow)", color: "var(--ink)", fontSize: 15, letterSpacing: 1.3 }}
        >
          Pase de lista →
        </Link>
      )}

      {/* 50/50 action pair — Cupo only; Lista collapses to + Nuevo cliente, full width,
          with no "Apartar lugar" and no agenda vocabulary anywhere on this screen. */}
      {modo === "cupo" ? (
        <div className="flex" style={{ marginTop: 8, gap: 8 }}>
          <Link
            href="/vender"
            className="forge-pressable flex flex-1 items-center justify-center uppercase font-extrabold"
            style={{ padding: "13px 0", border: "1px solid var(--fg)", color: "var(--fg)", fontSize: 12.5, letterSpacing: 1 }}
          >
            ＋ Nuevo cliente
          </Link>
          <Link
            href={apartarHref}
            className="forge-pressable flex flex-1 items-center justify-center border border-line bg-surface uppercase font-extrabold"
            style={{ padding: "13px 0", color: "var(--muted)", fontSize: 12.5, letterSpacing: 1 }}
          >
            Apartar lugar
          </Link>
        </div>
      ) : (
        <div style={{ marginTop: 8 }}>
          <Link
            href="/vender"
            className="forge-pressable flex items-center justify-center uppercase font-extrabold"
            style={{ padding: "13px 0", border: "1px solid var(--fg)", color: "var(--fg)", fontSize: 12.5, letterSpacing: 1 }}
          >
            ＋ Nuevo cliente
          </Link>
        </div>
      )}

      {/* MEMBRESÍAS — the vigentes/total ratio re-homes into the trailing slot. */}
      <div className="flex items-baseline justify-between" style={{ marginTop: 24, padding: "0 2px" }}>
        <Eyebrow style={{ fontSize: 10 }}>MEMBRESÍAS</Eyebrow>
        <Tnum className="uppercase font-semibold" style={{ fontSize: 10.5, letterSpacing: 1.2, color: "var(--muted)" }}>
          {vigentes} VIGENTES / {total}
        </Tnum>
      </div>

      <RenovarCard porRenovar={porRenovar} aunATiempo={aunATiempo} />

      {/* Registros online — hidden entirely at 0; a pendienteOnline row already sorts
          FIRST in the roster's ruled order, so plain /clientes?online=1 lands on them
          at the top of the list. */}
      {nuevosOnline > 0 && (
        <Link
          href={"/clientes?online=1" as Route}
          className="forge-pressable flex items-center justify-between"
          style={{
            marginTop: 10,
            padding: "13px 16px",
            gap: 12,
            border: "1px solid color-mix(in srgb, var(--gold) 35%, transparent)",
            background: "color-mix(in srgb, var(--gold) 10%, transparent)",
          }}
        >
          <span className="flex items-center" style={{ gap: 12 }}>
            <Icon name="user" size={16} color="var(--gold)" />
            <span>
              <span className="uppercase font-extrabold" style={{ fontSize: 12, letterSpacing: 0.6, color: "var(--fg)" }}>
                {nuevosOnline === 1 ? "1 registro nuevo en línea" : `${nuevosOnline} registros nuevos en línea`}
              </span>
              <span style={{ display: "block", marginTop: 2, fontSize: 10.5, color: "var(--muted)" }}>
                Cóbrales en mostrador como EXISTENTE
              </span>
            </span>
          </span>
          <Icon name="chev" size={14} color="var(--muted)" />
        </Link>
      )}
    </div>
  );
}

/**
 * The merged renewal card: the six-column bucket row (POR RENOVAR) and the AÚN A
 * TIEMPO row inside ONE card, with ONE footer link whose count is the COMBINED
 * vencimiento predicate — `porRenovar.total + aunATiempo.total`, the two disjoint
 * tiles `contarLifecycle` already splits (packages/domain/src/lifecycle.ts), so the
 * sum on this card is exactly that predicate's cardinality. The link carries BOTH
 * `renovar=1` and `atiempo=1`: Clientes' filter now ORs the two chips together
 * (`_components/clientes.tsx`, #328) instead of ANDing them (they are disjoint, so
 * the old AND always emptied), so this one link lands on the SAME union the number
 * promises — the number on this card is exactly the number of rows the tap opens.
 * Zero combined count renders the calm "todo al día" row and exposes NO link (a zero
 * is never tappable).
 */
function RenovarCard({
  porRenovar,
  aunATiempo,
}: {
  porRenovar: { total: number; cubos: Record<CuboRenovar, number> };
  aunATiempo: { total: number };
}) {
  const combinado = porRenovar.total + aunATiempo.total;
  return (
    <Card style={{ marginTop: 9, padding: "16px 18px 4px" }}>
      <div className="flex items-baseline justify-between">
        <span style={{ fontSize: 15, fontWeight: 700, color: "var(--fg)" }}>Por renovar</span>
        <Tnum className="font-extrabold" style={{ fontSize: 24, color: porRenovar.total > 0 ? "var(--gold)" : "var(--muted-soft)" }}>
          {porRenovar.total}
        </Tnum>
      </div>
      <div style={{ marginTop: 2, fontSize: 11, color: "var(--muted)" }}>
        Vencen en {RENOVACION_DIAS} días o menos, o les queda {RENOVACION_CLASES} clase o menos
      </div>

      {combinado === 0 ? (
        <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", padding: "12px 0", fontSize: 11.5, color: "var(--muted)" }}>
          Todo al día — nadie por renovar ni por recuperar.
        </div>
      ) : (
        <div className="grid" style={{ marginTop: 12, gridTemplateColumns: "repeat(6, 1fr)" }}>
          {CUBO_ORDEN.map((key) => {
            const n = porRenovar.cubos[key];
            const on = n > 0;
            return (
              <div key={key} style={{ textAlign: "center" }}>
                <Tnum className="font-extrabold" style={{ display: "block", fontSize: 16, color: on ? "var(--gold)" : "var(--muted-soft)" }}>
                  {n}
                </Tnum>
                <div
                  className="uppercase font-semibold"
                  style={{ marginTop: 1, fontSize: 8.5, letterSpacing: 0.7, whiteSpace: "nowrap", color: on ? "var(--muted)" : "var(--muted-soft)" }}
                >
                  {CUBO_LABEL[key]}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-baseline justify-between" style={{ marginTop: 13, borderTop: "1px solid var(--line)", paddingTop: 11, gap: 12 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--fg)" }}>
          Aún a tiempo{" "}
          <span style={{ fontSize: 11, fontWeight: 400, color: "var(--muted)" }}>
            · vencieron hace 1–{RECUPERACION_DIAS} días
          </span>
        </span>
        <Tnum className="font-extrabold" style={{ fontSize: 16, color: aunATiempo.total > 0 ? "var(--fg)" : "var(--muted-soft)" }}>
          {aunATiempo.total}
        </Tnum>
      </div>

      {combinado > 0 && (
        <Link
          href={"/clientes?renovar=1&atiempo=1" as Route}
          className="forge-pressable flex items-center justify-center uppercase font-extrabold"
          style={{ borderTop: "1px solid var(--line)", padding: "12px 0", fontSize: 11.5, letterSpacing: 0.8, color: "var(--gold)" }}
        >
          {combinado === 1 ? "Ver el 1 en Clientes →" : `Ver los ${combinado} en Clientes →`}
        </Link>
      )}
    </Card>
  );
}
