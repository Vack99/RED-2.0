"use server";

import { revalidatePath } from "next/cache";

import {
  cancelarReserva,
  reservarClase,
  type CancelarResultado,
  type ReservarResultado,
} from "@gym/data/server/reservas";
import { setNotificaciones, type NotificacionesResultado } from "@gym/data/server/notificaciones";

/**
 * Book a class (slice #57). Thin server action over the `reservar_clase` money-path
 * RPC — the DAL owns validation + the typed result; the RPC owns the atomic consume
 * + guards. On success, revalidate /reservar so the week behind the confirmed sheet
 * re-derives live occupancy + the member's own "Reservada" flag from the DB (never a
 * client-side spots--). Auth + tenant scoping are enforced by RLS inside the RPC.
 */
export async function reservarClaseAction(sessionId: string): Promise<ReservarResultado> {
  const result = await reservarClase(sessionId);
  if (result.ok) revalidatePath("/reservar");
  return result;
}

/**
 * Cancel a booking (slice #58). Thin server action over the `cancelar_reserva`
 * money-path RPC — the DAL owns validation + the typed result; the RPC owns the atomic
 * before-start guard, guarded cancelada flip, and finite refund. On success, revalidate
 * /reservar so the week re-derives live occupancy (the freed spot) and the member's own
 * "Reservada" flags from the DB. Auth + tenant scoping are enforced by RLS inside the RPC.
 */
export async function cancelarReservaAction(sessionId: string): Promise<CancelarResultado> {
  const result = await cancelarReserva(sessionId);
  if (result.ok) revalidatePath("/reservar");
  return result;
}

/**
 * Persist the member's notifications PREFERENCE (slice #62). Thin server action over the
 * self-scoped `set_notificaciones` DEFINER toggle — a preference only, no delivery channel.
 * On success, revalidate /reservar so the persisted flag re-reads on the next SSR (the
 * overlay toggles optimistically; this makes the truth durable across sessions/devices).
 * Auth + own-row scoping are enforced inside the RPC.
 */
export async function setNotificacionesAction(enabled: boolean): Promise<NotificacionesResultado> {
  const result = await setNotificaciones(enabled);
  if (result.ok) revalidatePath("/reservar");
  return result;
}
