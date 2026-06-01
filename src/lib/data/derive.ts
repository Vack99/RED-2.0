// Pure cliente derivation (ADR-0002). Given a client's STORED facts + today +
// this month's attendance count, derive estado / vence / diasRest / clasesRest /
// inicial at read. No I/O, no Supabase — unit-tested in derive.test.ts. The DAL
// fetches rows and the attendance counts, then maps each through here.

import { derivarEstado, diasRestantes, forfeit } from "@/domain/rules";
import type { Clases, EstadoCliente } from "@/domain/types";
import { fmtShort } from "@/lib/date";
import { parseDay } from "@/lib/fecha";
import { iniciales } from "@/lib/format";

export interface ClienteFacts {
  id: string;
  nombre: string;
  tel: string;
  paquete_nombre: string | null;
  clases_restantes: number | null; // NULL = ilimitado
  vence: string | null; // 'YYYY-MM-DD'
}

export interface ClienteDerivado {
  id: string;
  nombre: string;
  tel: string;
  inicial: string;
  paquete: string;
  estado: EstadoCliente;
  diasRest: number;
  venceDisplay: string; // "16 jun" or "—"
  clasesRest: number | "ilimitado"; // after read-time forfeit
  clasesRestLabel: string; // "∞" / "5" / "0"
  asistEsteMes: number;
}

export function derivarCliente(
  c: ClienteFacts,
  hoy: Date,
  asistEsteMes: number,
): ClienteDerivado {
  const tienePaquete = !!c.paquete_nombre && c.vence !== null;
  const venceDate = c.vence ? parseDay(c.vence) : null;
  const diasRest = venceDate ? diasRestantes(venceDate, hoy) : 0;

  const clasesBase: Clases = c.clases_restantes === null ? "ilimitado" : c.clases_restantes;
  // forfeit at read (brief Q2): an expired package shows 0 classes; ilimitado untouched.
  const clasesRest: Clases = tienePaquete ? forfeit(clasesBase, diasRest) : 0;

  const estado: EstadoCliente = tienePaquete
    ? derivarEstado({ clases: clasesRest, dias: diasRest })
    : "sin_clases";

  return {
    id: c.id,
    nombre: c.nombre,
    tel: c.tel,
    inicial: iniciales(c.nombre),
    paquete: c.paquete_nombre ?? "Sin paquete",
    estado,
    diasRest,
    venceDisplay: venceDate ? fmtShort(venceDate) : "—",
    clasesRest,
    clasesRestLabel: clasesRest === "ilimitado" ? "∞" : String(clasesRest),
    asistEsteMes,
  };
}

export interface PaseClienteDTO {
  id: string;
  nombre: string;
  inicial: string;
  paquete: string;
  /** Remaining-classes label, e.g. "Ilimitado", "5 clases", "Sin paquete". */
  clasesLabel: string;
  diasRest: number;
  /** Active package expiring soon. Derived through derivarEstado (ADR-0002), so it
   *  tracks por_vencer's BOTH dimensions (días <= 5 OR clases <= 2) — never a
   *  hand-inlined day threshold that silently drops the clases dimension. */
  porVencer: boolean;
}

/**
 * The pase de lista's slim per-client projection. Derives through derivarCliente
 * so `porVencer` is exactly derivarEstado's `por_vencer`; the pase shares the
 * directory's single definition of "expiring" instead of re-coining a `<= 5`.
 */
export function derivarPaseCliente(c: ClienteFacts, hoy: Date): PaseClienteDTO {
  const d = derivarCliente(c, hoy, 0);
  const clasesLabel = !c.paquete_nombre
    ? "Sin paquete"
    : c.clases_restantes === null
      ? "Ilimitado"
      : `${c.clases_restantes} clase${c.clases_restantes === 1 ? "" : "s"}`;
  return {
    id: d.id,
    nombre: d.nombre,
    inicial: d.inicial,
    paquete: d.paquete,
    clasesLabel,
    diasRest: d.diasRest,
    porVencer: d.estado === "por_vencer",
  };
}
