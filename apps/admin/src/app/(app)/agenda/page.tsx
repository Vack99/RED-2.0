import { getAgendaSemana } from "@gym/data/server/agenda";
import { getClassTypes, getCoaches } from "@gym/data/server/catalog";
import { getOperatorGym } from "@gym/data/server/gym";
import {
  DOW,
  MON,
  fmtDiaAgenda,
  fmtNavegadorDia,
  fmtNavegadorSemana,
  fmtResumenDia,
  fmtResumenSemana,
  horaEnZona,
  hoyIsoEnZona,
  inicioSemana,
  parseDay,
  toIsoDay,
} from "@gym/format";
import { CUPO_OPTIONS, DURACION_OPTIONS, HORA_OPTIONS } from "@gym/ui/forge/agenda/fixtures";

import { AgendaScreen, type DiaVM, type StripDay } from "./_components/agenda";
import { toCardVM } from "./_components/session-vm";

/**
 * The Agenda sector (PRD #36 S7): one `getAgendaSemana(?d)` read feeds both DÍA and
 * SEMANA (DÍA slices one day; SEMANA groups the week — ADR-0010's materialized rows,
 * never read-time expansion). This server component resolves the gym tz once, builds
 * a fully-serializable view model (all six days' cards + navigator labels + editor
 * option sets), and hands it to the client orchestrator. Brand-neutral: every colour
 * lives in the primitives as `var(--*)`, so a RED host renders red with no code change.
 */

/** "15 – 20 JUN" (same month) / "30 JUN – 5 JUL" — the SEMANA navigator range. */
function rangoSemana(lunes: Date, sabado: Date): string {
  const dMon = MON[sabado.getMonth()];
  if (lunes.getMonth() === sabado.getMonth()) return `${lunes.getDate()} – ${sabado.getDate()} ${dMon}`;
  return `${lunes.getDate()} ${MON[lunes.getMonth()]} – ${sabado.getDate()} ${dMon}`;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { timezone: tz } = await getOperatorGym();
  const todayIso = hoyIsoEnZona(tz);
  const dParam = (await searchParams).d;
  const d = typeof dParam === "string" ? dParam : todayIso;

  const [semana, coaches, tipos] = await Promise.all([getAgendaSemana(d), getCoaches(), getClassTypes()]);

  const hoy = parseDay(todayIso);
  const lunesHoy = inicioSemana(hoy);

  const stripDays: StripDay[] = semana.dias.map((dia) => ({
    wd: DOW[dia.fecha.getDay()],
    dnum: String(dia.fecha.getDate()),
    iso: toIsoDay(dia.fecha),
  }));

  const dias: DiaVM[] = semana.dias.map((dia) => ({
    iso: toIsoDay(dia.fecha),
    dateLabel: fmtDiaAgenda(dia.fecha),
    navRel: fmtNavegadorDia(dia.fecha, hoy),
    summary: fmtResumenDia(dia.resumen.clases, dia.resumen.reservas),
    occupancyPct: dia.sesiones.length ? Math.round(dia.ratioOcupacion * 100) : null,
    cards: dia.sesiones.map((s) => toCardVM(s, horaEnZona(s.startsAt, tz))),
  }));

  const todayIndex = stripDays.findIndex((s) => s.iso === todayIso);
  const selectedFromParam = stripDays.findIndex((s) => s.iso === d);
  const initialSelectedIndex = selectedFromParam >= 0 ? selectedFromParam : 0;

  return (
    // No `key`: the orchestrator stays MOUNTED across week navigation so client
    // state (the DÍA/SEMANA toggle) survives ± week paging — PRD (f): in SEMANA
    // the arrows step weeks, they must not dump the operator back into DÍA. The
    // week reset is the orchestrator's own weekMondayIso reconcile.
    <AgendaScreen
      weekMondayIso={toIsoDay(semana.lunes)}
      stripDays={stripDays}
      todayIndex={todayIndex}
      initialSelectedIndex={initialSelectedIndex}
      dias={dias}
      weekNavLabel={rangoSemana(semana.dias[0].fecha, semana.dias[5].fecha)}
      weekNavRel={fmtNavegadorSemana(semana.lunes, lunesHoy)}
      weekFooter={fmtResumenSemana(semana.resumenSemana.ratioOcupacion)}
      coaches={coaches.map((c) => ({ id: c.id, label: c.label }))}
      tipos={tipos}
      horaOptions={HORA_OPTIONS}
      duracionOptions={DURACION_OPTIONS}
      cupoOptions={CUPO_OPTIONS}
    />
  );
}
