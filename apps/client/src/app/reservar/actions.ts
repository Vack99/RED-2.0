"use server";

import { revalidatePath } from "next/cache";

import { reservarClase, type ReservarResultado } from "@gym/data/server/reservas";

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
