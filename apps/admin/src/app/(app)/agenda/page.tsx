import { redirect } from "next/navigation";

import { HORIZONTE_SEMANAS, getAgendaSemana } from "@gym/data/server/agenda";
import { getClassTypes, getCoaches } from "@gym/data/server/catalog";
import { getOperatorGym } from "@gym/data/server/gym";
import { modo } from "@gym/domain/rules";
import {
  DOW,
  MON,
  addDays,
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
import { resolverDiaSesion } from "./_components/resolver-sesion";
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
  const gym = await getOperatorGym();
  // Lista has no schedule (spec #326): a typed/stale `/agenda` URL redirects server-side
  // to `/inicio`, before any agenda read runs — no flash, no wasted reads.
  if (modo(gym.bookingEnabled) === "lista") redirect("/inicio");

  const tz = gym.timezone;
  const todayIso = hoyIsoEnZona(tz);
  const params = await searchParams;
  const dParam = params.d;
  const d = typeof dParam === "string" ? dParam : todayIso;
  // `?sesion=<id>` (#328) — the /inicio hero/peek deep link. Never changes WHICH week
  // is fetched (that stays `?d=`/today, above): inicio only ever links today's own
  // sessions, so the week that read already loads is always the right one — this is
  // resolved against it below, once semana is in hand, purely to pick the DAY within it.
  const sesionParam = typeof params.sesion === "string" ? params.sesion : undefined;

  const [semana, coaches, tipos] = await Promise.all([getAgendaSemana(d), getCoaches(), getClassTypes()]);

  const hoy = parseDay(todayIso);
  const lunesHoy = inicioSemana(hoy);
  // Past the materialization horizon the read comes back empty because nothing has been
  // GENERATED there yet — the same shape as a week with no classes, and the reason the
  // empty state has to say which one it is (#243).
  const fueraDeHorizonte = semana.lunes.getTime() > addDays(lunesHoy, HORIZONTE_SEMANAS * 7).getTime();

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

  // The deep-linked session's own day, resolved against the ids of THIS loaded week
  // only (resolverDiaSesion) — a stale/foreign-week `sesion` id resolves to null and
  // is ignored, falling back to the ordinary `?d=`/today selection below.
  const diaDeSesion = resolverDiaSesion(
    semana.dias.map((dia) => ({ iso: toIsoDay(dia.fecha), ids: dia.sesiones.map((s) => s.id) })),
    sesionParam,
  );
  const sesionInicial = diaDeSesion ? (sesionParam ?? null) : null;

  const todayIndex = stripDays.findIndex((s) => s.iso === todayIso);
  const selectedFromParam = stripDays.findIndex((s) => s.iso === (diaDeSesion ?? d));
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
      fueraDeHorizonte={fueraDeHorizonte}
      sesionInicial={sesionInicial}
      coaches={coaches.map((c) => ({ id: c.id, label: c.label }))}
      tipos={tipos}
      horaOptions={HORA_OPTIONS}
      duracionOptions={DURACION_OPTIONS}
      cupoOptions={CUPO_OPTIONS}
    />
  );
}
