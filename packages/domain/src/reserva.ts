// ──────────────────────────────────────────────────────────────
// La RESERVABILIDAD del socio — UNA CLASE → UN VEREDICTO. One entry point,
// `derivarReservabilidad`, takes what the member surface knows about a session
// (its derived estado, whether the member already holds it) plus the member's
// saldo, and returns the WHOLE booking verdict: the ONE gate that binds
// (`motivo`), whether the CTA is live (`reservable`), and — only when it is —
// which consent/urgency line goes above it (`aviso`). Pure, derived-at-read
// (ADR-0002): nothing here is stored.
//
// It exists because the cascade was written twice — the week's summary sheet
// (`apps/client/.../reservar/_components/reservar-semana.tsx`) and the class
// page's CTA (`apps/client/.../clase/[sessionId]/_components/clase-detalle.tsx`)
// each re-decided "can this member book this class", and the two had drifted:
// the sheet let `miReserva` outrank a class that already started, the class page
// never showed the #89 "usará otra de tus clases" nota, and the week CARD locked
// on a lapsed vigencia but not on a spent balance — a green "Reservar" the sheet
// retracted one tap later. Assembly lives here now; a surface states the facts
// and renders one verdict, and there is no second place to disagree.
//
// THE REFEREE IS `reservar_clase` (supabase/functions-canonical/reservar_clase.sql).
// This verdict is a PREVIEW of that RPC's refusal, so the precedence is its
// precedence, not a taste call:
//
//  · TERMINADA WINS over everything, `reservada` included: the RPC raises
//    'La clase ya comenzó' (`v_starts <= now()`) BEFORE it ever looks for an
//    existing reservation, and `cancelar_reserva` closes at the same instant —
//    so a past class the member booked reads "ya pasó", never a live "cancela"
//    or "ya tienes tu lugar" the server would refuse.
//  · RESERVADA then outranks the saldo/cupo gates. This is the ONE deliberate
//    departure from the RPC's own order, and it is not a contradiction: those
//    gates describe a booking the member is trying to MAKE, and this member
//    already holds the spot. What they need is the cancel affordance, not a
//    "renueva tu paquete" they cannot act on for a class they are already in.
//  · DESHABILITADA sits between them, and that placement is the ruling: a gym
//    that switched bookings off still lets a member CANCEL one they already
//    hold (the RPC agrees — `cancelar_reserva` has no such gate), but it
//    outranks every refusal below, because "this gym does not take
//    reservations" is a truer sentence than "renew your package".
//  · VENCIDO before LLENA before SIN CLASES. The RPC checks 'Paquete vencido'
//    first (both arms of it), and refuses finite AND ilimitado alike (#118 E4).
//    It then checks 'Sin clases disponibles' BEFORE 'Clase llena'; the preview
//    deliberately keeps the opposite order for the last two, because a full
//    class is not something buying a package fixes — telling a spent member to
//    "compra un paquete" for a class with no seats would be a worse lie than
//    the refusal they will actually hit.
//
// KNOWN GAP, on purpose: the RPC has a SECOND expiry arm this verdict cannot
// preview — `v_vence < v_sesion_fecha` (reservar_clase.sql), which refuses a
// session scheduled AFTER the package's vigencia even while the package is live
// today. `vencido` here is the saldo's date-only flag (`getSaldoMiembro`), so a
// member whose paquete lapses mid-week still sees a green "Reservar" on Friday
// and dead-ends in the RPC. Closing it needs the session's gym-local day and the
// member's `vence` on both DTOs — a behaviour change, filed rather than smuggled
// in here.
// ──────────────────────────────────────────────────────────────

import type { EstadoSesion } from "./types";

/** The ONE gate that binds a member's attempt to book this session — never a
 *  set, always the first that fires in the precedence above. `libre` is the
 *  only bookable value. Each non-`libre` member names the `raise exception`
 *  literal `reservar_clase` would answer with. */
export type MotivoReserva =
  /** 'La clase ya comenzó'. */
  | "terminada"
  /** 'Ya reservaste esta clase' — here, the member's own held spot. */
  | "reservada"
  /** 'Reservas deshabilitadas' — the GYM takes no bookings at all (`gym.booking_enabled`). */
  | "deshabilitada"
  /** 'Paquete vencido' — finite AND ilimitado (#118 E4). */
  | "vencido"
  /** 'Clase llena'. */
  | "llena"
  /** 'Sin clases disponibles'. */
  | "sin_clases"
  /** Nothing binds: the RPC would take this booking. */
  | "libre";

/** The line above a LIVE booking CTA — non-null exactly when `reservable`.
 *  Priority: the charge-consent nota outranks the cupo urgency (a member about
 *  to spend a second class that day needs to know that more than they need to
 *  know the class is filling up). */
export type AvisoReserva =
  /** #89 W3: the member already holds another booking that gym-local day, so
   *  THIS one spends a second class. Finite plans only — an ilimitado member
   *  spends nothing, so there is no consent to take. */
  | "otra_ese_dia"
  /** `casi_lleno`: few seats left. */
  | "casi_llena"
  /** Ilimitado — the booking costs no class. */
  | "ilimitado"
  /** A finite plan spends exactly one class on this booking. */
  | "consume_una";

/** The member's plan balance as both booking surfaces already read it
 *  (`SaldoMiembroDTO` — packages/data/src/server/agenda-miembro.ts) — structurally
 *  assignable, so a caller passes the DTO straight through with no re-shaping pass
 *  where the two could diverge. */
export interface SaldoSocio {
  /** `clases_restantes IS NULL` (ADR-0004). */
  ilimitado: boolean;
  /** Classes left on a finite plan; null for ilimitado. */
  clasesRestantes: number | null;
  /** Vigencia lapsed as of the gym's today (`vence < hoy`). */
  vencido: boolean;
  /** The GYM takes member bookings at all (`gym.booking_enabled`). A gym-level fact, carried on
   *  this object because it is the one both booking surfaces already hold — see the precedence
   *  note above for where it binds. */
  reservasHabilitadas: boolean;
}

/** What a surface knows about ONE session, for ONE member. */
export interface HechosReserva {
  /** The session's derived state ladder value (`derivarEstadoSesion`). */
  estado: EstadoSesion;
  /** The member already holds an ACTIVE booking for this session. */
  miReserva: boolean;
  saldo: SaldoSocio;
  /** The member already holds another active booking on this session's
   *  gym-local day (#89 W3). Only ever moves the `aviso`, never `reservable`:
   *  a second same-day class is allowed, it just costs a second class. */
  otraEseDia: boolean;
}

/** The WHOLE booking verdict for one session + one member. JSON-serializable by
 *  construction, so it crosses a server→client boundary unchanged. A DISCRIMINATED
 *  union on `motivo`, so "an aviso exists exactly when the CTA is live" is a fact the
 *  compiler holds — a surface cannot read `aviso` off a refusal, and cannot forget to
 *  render one on a live CTA. `reservable` rides along so no consumer restates the
 *  comparison. */
export type VeredictoReserva =
  | { motivo: Exclude<MotivoReserva, "libre">; reservable: false; aviso: null }
  | { motivo: "libre"; reservable: true; aviso: AvisoReserva };

/** Whether a finite plan has nothing left to spend. Ilimitado never binds here —
 *  `reservar_clase`'s consume is `if v_clases is not null`, so a null balance
 *  passes the gate untouched. */
function sinClases(saldo: SaldoSocio): boolean {
  return !saldo.ilimitado && (saldo.clasesRestantes ?? 0) <= 0;
}

function derivarAviso(hechos: HechosReserva): AvisoReserva {
  if (hechos.otraEseDia && !hechos.saldo.ilimitado) return "otra_ese_dia";
  if (hechos.estado === "casi_lleno") return "casi_llena";
  return hechos.saldo.ilimitado ? "ilimitado" : "consume_una";
}

/**
 * One session's WHOLE booking verdict for one member. Pure — no I/O, no clock
 * (`estado` and `saldo.vencido` arrive already derived against the gym's tz).
 *
 * Every member surface (the week card, the summary sheet, the class page's CTA)
 * renders THIS verdict; none derives its own copy of any part of it.
 */
export function derivarReservabilidad(hechos: HechosReserva): VeredictoReserva {
  const motivo: MotivoReserva =
    hechos.estado === "termino"
      ? "terminada"
      : hechos.miReserva
        ? "reservada"
        : !hechos.saldo.reservasHabilitadas
          ? "deshabilitada"
          : hechos.saldo.vencido
            ? "vencido"
            : hechos.estado === "lleno"
              ? "llena"
              : sinClases(hechos.saldo)
                ? "sin_clases"
                : "libre";

  return motivo === "libre"
    ? { motivo, reservable: true, aviso: derivarAviso(hechos) }
    : { motivo, reservable: false, aviso: null };
}
