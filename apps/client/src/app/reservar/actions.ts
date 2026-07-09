"use server";

import { revalidatePath } from "next/cache";

import {
  cancelarReserva,
  reservarClase,
  type CancelarResultado,
  type ReservarResultado,
} from "@gym/data/server/reservas";

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
