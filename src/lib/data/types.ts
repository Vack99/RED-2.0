export type EstadoCliente = "activo" | "por_vencer" | "sin_clases";

/** Ilimitado packages use the "∞" sentinel for classes. */
export type ClasesRest = number | "∞";

export interface Cliente {
  id: number;
  nombre: string;
  inicial: string;
  tel: string;
  paquete: string;
  clasesRest: ClasesRest;
  totalClases: ClasesRest;
  diasRest: number;
  vence: string;
  asistEsteMes: number;
  ultima: string;
  estado: EstadoCliente;
}

export interface Paquete {
  id: string;
  nombre: string;
  precio: number;
  vigencia: string;
  desc?: string;
  popular?: boolean;
}

export interface Perfil {
  nombre: string;
  tel: string;
  negocio: string;
  ciudad: string;
}

export interface MetodosCobro {
  efectivo: boolean;
  transferencia: boolean;
  tarjeta: boolean;
}

export interface Cobro {
  titular: string;
  banco: string;
  clabe: string;
  tarjeta: string;
  metodos: MetodosCobro;
}

export interface Plantilla {
  id: string;
  label: string;
  sub?: string;
  body: string;
}

/** Per-client confirmation that today specifically is done. */
export type AsistenciaHoy = Record<number, { date: string; time: string }>;

/** Attendance grid keyed by day-offset → list of present client ids. */
export type PaseGrid = Record<number, number[]>;

export type MetodoPago = "efectivo" | "transferencia" | "tarjeta" | "pendiente";
