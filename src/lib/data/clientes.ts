import "server-only";

import { cache } from "react";

import { diasRestantes, renderPlantilla } from "@/domain/rules";
import { DOW, fmtShort } from "@/lib/date";
import { fechaChihuahua, hoyChihuahua, parseDay, toIsoDay } from "@/lib/fecha";
import { firstName, iniciales, pesos } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { derivarCliente, type ClienteDerivado } from "./derive";

export interface ClienteLiteDTO {
  id: string;
  nombre: string;
  tel: string;
  inicial: string;
  /** Active package label, or "Sin paquete". */
  paqueteLabel: string;
}

/** Minimal roster for the venta client-picker, ordered by name. */
export const getClientesLite = cache(async (): Promise<ClienteLiteDTO[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("clientes")
    .select("id, nombre, tel, paquete_nombre")
    .order("nombre");

  if (!data) return [];

  return data.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    tel: c.tel,
    inicial: iniciales(c.nombre),
    paqueteLabel: c.paquete_nombre ?? "Sin paquete",
  }));
});

export interface PaseClienteDTO {
  id: string;
  nombre: string;
  inicial: string;
  paquete: string;
  /** Remaining-classes label, e.g. "Ilimitado", "5 clases", "Sin paquete". */
  clasesLabel: string;
  diasRest: number;
  /** Active package expiring soon (derived, ADR-0002). */
  porVencer: boolean;
}

/** Roster for the pase de lista, with derived saldo display (ADR-0002). */
export const getClientesParaPase = cache(async (): Promise<PaseClienteDTO[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("clientes")
    .select("id, nombre, paquete_nombre, clases_restantes, vence")
    .order("nombre");

  if (!data) return [];

  const hoy = hoyChihuahua();
  return data.map((c) => {
    const diasRest = c.vence ? diasRestantes(parseDay(c.vence), hoy) : 0;
    const clasesLabel = !c.paquete_nombre
      ? "Sin paquete"
      : c.clases_restantes === null
        ? "Ilimitado"
        : `${c.clases_restantes} clase${c.clases_restantes === 1 ? "" : "s"}`;
    return {
      id: c.id,
      nombre: c.nombre,
      inicial: iniciales(c.nombre),
      paquete: c.paquete_nombre ?? "Sin paquete",
      clasesLabel,
      diasRest,
      porVencer: !!c.paquete_nombre && diasRest > 0 && diasRest <= 5,
    };
  });
});

function monthStartIso(hoy: Date): string {
  return toIsoDay(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
}

/** Full roster, derived-at-read with this month's attendance count per client. */
export const getClientesRoster = cache(async (): Promise<ClienteDerivado[]> => {
  const supabase = await createClient();
  const hoy = hoyChihuahua();

  const [clientesRes, asistRes] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, nombre, tel, paquete_nombre, clases_restantes, vence")
      .order("nombre"),
    supabase
      .from("asistencias")
      .select("cliente_id")
      .is("deleted_at", null)
      .gte("fecha", monthStartIso(hoy)),
  ]);

  const clientes = clientesRes.data;
  if (!clientes) return [];

  const counts: Record<string, number> = {};
  for (const a of asistRes.data ?? []) counts[a.cliente_id] = (counts[a.cliente_id] ?? 0) + 1;

  return clientes.map((c) => derivarCliente(c, hoy, counts[c.id] ?? 0));
});

function metodoLabel(m: string): string {
  return m === "pendiente" ? "Por pagar" : m.charAt(0).toUpperCase() + m.slice(1);
}

export interface FichaAsistencia {
  dDisplay: string;
  hora: string | null;
  today: boolean;
}
export interface FichaPago {
  fechaDisplay: string;
  paquete: string;
  montoDisplay: string;
  metodo: string;
}
export interface ClienteFichaDTO {
  cliente: ClienteDerivado;
  totalClases: number | null;
  dayDenom: number;
  compradoDisplay: string;
  altaDisplay: string;
  presentHoy: boolean;
  horaHoy: string | null;
  historial: FichaAsistencia[];
  pagos: FichaPago[];
  ventasCount: number;
  waText: string;
  hoyIso: string;
  vecinos: { prevId: string | null; nextId: string | null };
}

/** Everything the ficha (client detail) renders, derived-at-read. */
export const getClienteFicha = cache(async (id: string): Promise<ClienteFichaDTO | null> => {
  const supabase = await createClient();
  const hoy = hoyChihuahua();
  const hoyIso = toIsoDay(hoy);

  const { data: c } = await supabase
    .from("clientes")
    .select("id, nombre, tel, paquete_nombre, clases_restantes, vence, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!c) return null;

  const [asistRes, ventasRes, idsRes, perfilRes] = await Promise.all([
    supabase
      .from("asistencias")
      .select("fecha, hora")
      .eq("cliente_id", id)
      .is("deleted_at", null)
      .gte("fecha", monthStartIso(hoy))
      .order("fecha", { ascending: false }),
    supabase
      .from("ventas")
      .select("fecha, paquete_nombre, monto, metodo, clases, vigencia_tipo, vigencia_dias")
      .eq("cliente_id", id)
      .order("fecha", { ascending: false }),
    supabase.from("clientes").select("id").order("nombre"),
    supabase.from("perfil").select("negocio").maybeSingle(),
  ]);

  const asistMes = asistRes.data ?? [];
  const historial: FichaAsistencia[] = asistMes
    .filter((a) => a.fecha !== hoyIso)
    .map((a) => {
      const d = parseDay(a.fecha);
      return {
        dDisplay: `${DOW[d.getDay()].toLowerCase()} ${d.getDate()}`,
        hora: a.hora ? a.hora.slice(0, 5) : null,
        today: false,
      };
    });
  const presentHoy = asistMes.some((a) => a.fecha === hoyIso);
  const horaHoy = asistMes.find((a) => a.fecha === hoyIso)?.hora?.slice(0, 5) ?? null;

  const ventas = ventasRes.data ?? [];
  const pagos: FichaPago[] = ventas.map((v) => ({
    fechaDisplay: fmtShort(fechaChihuahua(v.fecha)),
    paquete: v.paquete_nombre,
    montoDisplay: pesos(v.monto),
    metodo: metodoLabel(v.metodo),
  }));

  const latest = ventas[0];
  const totalClases = latest?.clases ?? null;
  const dayDenom = latest ? (latest.vigencia_tipo === "mes" ? 30 : (latest.vigencia_dias ?? 30)) : 30;
  const compradoDisplay = latest ? fmtShort(fechaChihuahua(latest.fecha)) : "—";
  const altaDisplay = fmtShort(fechaChihuahua(c.created_at));

  const derivado = derivarCliente(c, hoy, asistMes.length);

  const negocio = perfilRes.data?.negocio?.trim() || "FORGE";
  const waBody = `Hola {nombre} 👋 Aún tienes {clases} de tu paquete (*{paquete}*), vence el {vence}. ¡Te esperamos! 💪 — ${negocio}`;
  const waText = renderPlantilla(waBody, {
    nombre: firstName(c.nombre),
    clases: derivado.clasesRest === "ilimitado" ? "clases ilimitadas" : `${derivado.clasesRest} clases`,
    paquete: derivado.paquete,
    vence: derivado.venceDisplay,
  });

  const order = (idsRes.data ?? []).map((x) => x.id);
  const idx = order.indexOf(id);
  const vecinos = {
    prevId: idx > 0 ? order[idx - 1] : null,
    nextId: idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null,
  };

  return {
    cliente: derivado,
    totalClases,
    dayDenom,
    compradoDisplay,
    altaDisplay,
    presentHoy,
    horaHoy,
    historial,
    pagos,
    ventasCount: ventas.length,
    waText,
    hoyIso,
    vecinos,
  };
});
