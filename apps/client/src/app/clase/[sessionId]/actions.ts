"use server";

import { revalidatePath } from "next/cache";

import {
  toggleFavoritoTipo,
  type ToggleFavoritoResultado,
} from "@gym/data/server/clase-miembro";
import {
  cancelarReserva,
  reservarClase,
  type CancelarResultado,
  type ReservarResultado,
} from "@gym/data/server/reservas";

/**
 * Clase-detail server actions (slice #59). Thin seams over the atomic booking RPCs +
 * the favorite toggle. Booking / cancelling revalidate both /reservar (its week
 * re-derives live occupancy + the member's own flags) and this class page; the client
 * island owns navigation (→ /confirmada on book, → /reservar on cancel). Auth + tenant
 * scoping are enforced by RLS/the definer bodies inside each RPC.
 */
export async function reservarDesdeClaseAction(sessionId: string): Promise<ReservarResultado> {
  const result = await reservarClase(sessionId);
  if (result.ok) {
    revalidatePath("/reservar");
    revalidatePath(`/clase/${sessionId}`);
  }
  return result;
}

export async function cancelarDesdeClaseAction(sessionId: string): Promise<CancelarResultado> {
  const result = await cancelarReserva(sessionId);
  if (result.ok) {
    revalidatePath("/reservar");
    revalidatePath(`/clase/${sessionId}`);
  }
  return result;
}

/**
 * Toggle the member's favorite class type (the heart). On success revalidate /reservar so
 * the "Tu favorita" tag re-derives across the week + mis reservas; the client island
 * refreshes this page for the hero heart.
 */
export async function toggleFavoritoAction(classTypeId: string): Promise<ToggleFavoritoResultado> {
  const result = await toggleFavoritoTipo(classTypeId);
  if (result.ok) revalidatePath("/reservar");
  return result;
}
