import type { Cliente, Cobro, Paquete, Perfil, Plantilla } from "./types";

// Shared sample data ported from the prototype's data.jsx.
// Mexican names, Chihuahua (614) phone format, MXN. "Today" = 27 may 2026.

export const SEED_CLIENTES: Cliente[] = [
  { id: 1,  nombre: "Andrea Castro",     inicial: "AC", tel: "614 218 3401", paquete: "Ilimitado", clasesRest: "∞", totalClases: "∞", diasRest: 6,  vence: "02 jun", asistEsteMes: 14, ultima: "hoy 7:30",   estado: "activo" },
  { id: 2,  nombre: "Luis Hernández",    inicial: "LH", tel: "614 305 7762", paquete: "12 clases", clasesRest: 4,   totalClases: 12,  diasRest: 11, vence: "07 jun", asistEsteMes: 8,  ultima: "ayer 18:00", estado: "activo" },
  { id: 3,  nombre: "María López",       inicial: "ML", tel: "614 882 0913", paquete: "8 clases",  clasesRest: 1,   totalClases: 8,   diasRest: 3,  vence: "30 may", asistEsteMes: 7,  ultima: "lun 7:30",   estado: "por_vencer" },
  { id: 4,  nombre: "Carlos Ramírez",    inicial: "CR", tel: "614 156 4490", paquete: "Ilimitado", clasesRest: "∞", totalClases: "∞", diasRest: 22, vence: "18 jun", asistEsteMes: 11, ultima: "hoy 8:30",   estado: "activo" },
  { id: 5,  nombre: "Sofía Torres",      inicial: "ST", tel: "614 442 1108", paquete: "8 clases",  clasesRest: 6,   totalClases: 8,   diasRest: 17, vence: "13 jun", asistEsteMes: 2,  ultima: "mar 19:00",  estado: "activo" },
  { id: 6,  nombre: "Diego Méndez",      inicial: "DM", tel: "614 770 5523", paquete: "12 clases", clasesRest: 0,   totalClases: 12,  diasRest: 4,  vence: "31 may", asistEsteMes: 12, ultima: "mié 7:30",   estado: "sin_clases" },
  { id: 7,  nombre: "Valeria Solís",     inicial: "VS", tel: "614 901 3370", paquete: "8 clases",  clasesRest: 5,   totalClases: 8,   diasRest: 14, vence: "10 jun", asistEsteMes: 3,  ultima: "lun 18:00",  estado: "activo" },
  { id: 8,  nombre: "Paulina Domínguez", inicial: "PD", tel: "614 233 8865", paquete: "Ilimitado", clasesRest: "∞", totalClases: "∞", diasRest: 1,  vence: "28 may", asistEsteMes: 19, ultima: "hoy 6:30",   estado: "por_vencer" },
  { id: 9,  nombre: "Roberto Esquivel",  inicial: "RE", tel: "614 408 2245", paquete: "12 clases", clasesRest: 8,   totalClases: 12,  diasRest: 20, vence: "16 jun", asistEsteMes: 4,  ultima: "mar 7:30",   estado: "activo" },
  { id: 10, nombre: "Karla Vázquez",     inicial: "KV", tel: "614 117 9032", paquete: "8 clases",  clasesRest: 3,   totalClases: 8,   diasRest: 9,  vence: "05 jun", asistEsteMes: 5,  ultima: "mié 19:00",  estado: "activo" },
  { id: 11, nombre: "Jorge Núñez",       inicial: "JN", tel: "614 552 6671", paquete: "Ilimitado", clasesRest: "∞", totalClases: "∞", diasRest: 13, vence: "09 jun", asistEsteMes: 10, ultima: "hoy 8:30",   estado: "activo" },
  { id: 12, nombre: "Ana García",        inicial: "AG", tel: "614 660 4418", paquete: "12 clases", clasesRest: 9,   totalClases: 12,  diasRest: 23, vence: "19 jun", asistEsteMes: 3,  ultima: "lun 19:00",  estado: "activo" },
];

export const SEED_PAQUETES: Paquete[] = [
  { id: "8",    nombre: "8 clases",  precio: 750,  vigencia: "20 días",     desc: "Ideal para iniciar",  popular: false },
  { id: "12",   nombre: "12 clases", precio: 1100, vigencia: "25 días",     desc: "El más popular",      popular: true },
  { id: "ilim", nombre: "Ilimitado", precio: 1350, vigencia: "todo el mes", desc: "Sin límite de clases", popular: false },
];

export const SEED_PERFIL: Perfil = {
  nombre: "Coach JC",
  tel: "614 444 0028",
  negocio: "Forge Bootcamp",
  ciudad: "CUU",
};

export const SEED_COBRO: Cobro = {
  titular: "Juan Carlos Mendoza",
  banco: "BBVA",
  clabe: "012 320 00123456789 0",
  tarjeta: "4152 3138 0000 0000",
  metodos: { efectivo: true, transferencia: true, tarjeta: false },
};

export const SEED_PLANTILLAS: Plantilla[] = [
  {
    id: "recordatorio",
    label: "Recordatorio",
    sub: "Amable y motivador",
    body: "Hola {nombre} 👋\n\nAún te quedan {clases} de tu paquete (*{paquete}*), vence el {vence}.\n\n¡Te esperamos en el bootcamp! 💪🔥\n— Coach Forge",
  },
  {
    id: "renovar",
    label: "Invitar a renovar",
    sub: "Con precios",
    body: "Hola {nombre}, soy del coach de Forge Bootcamp.\n\nTu paquete vence en {dias} — ¿lo renovamos? 🔥\n\n📦 *Paquetes disponibles:*\n{precios}\n\nAvísame cuál te conviene y te lo apartamos. 💪",
  },
  {
    id: "ultima",
    label: "Última clase",
    sub: "Cuando queda 1",
    body: "Hola {nombre} 👋\n\nTe aviso que solo te queda *1 clase* de tu paquete y vence el {vence}.\n\nSi quieres seguir entrenando con nosotros, renovamos después de la próxima clase. 💪\n— Coach Forge",
  },
];

// Home / dashboard demo metrics (still hardcoded in the prototype).
export const HOY = {
  asistenciasHoy: 14,
  asistenciasAyer: 12,
  vigentes: 12,
  totalClientes: 14,
  ingresosSemana: 8950,
  ingresosMes: 32450,
  ventasMes: 26,
  asistMes: 312,
};
