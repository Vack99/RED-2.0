import "server-only";

import { cache } from "react";
import { z } from "zod";

import { consumirClase } from "@/domain/rules";
import type { Clases } from "@/domain/types";
import { horaChihuahua, hoyIsoChihuahua } from "@/lib/fecha";
import { createClient } from "@/lib/supabase/server";

/**
 * Active attendance, as { "YYYY-MM-DD": clienteId[] }. Keyed by absolute
 * Chihuahua date (ADR-0003) — the offset grid is gone.
 */
export const getMarcadas = cache(async (): Promise<Record<string, string[]>> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("asistencias")
    .select("fecha, cliente_id")
    .is("deleted_at", null);

  if (!data) return {};

  const map: Record<string, string[]> = {};
  for (const row of data) {
    (map[row.fecha] ??= []).push(row.cliente_id);
  }
  return map;
});

export const togglePaseSchema = z.object({
  clienteId: z.string().min(1),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export interface TogglePaseResult {
  present: boolean;
  hora: string | null;
}

/**
 * Toggle a client's attendance for a given (absolute) day. Marking present
 * inserts a row and consumes a class (Ilimitado untouched; brief Q6 — same-day
 * duplicates each consume); unmarking soft-deletes the active row and restores a
 * class ONLY if one was actually consumed. Back-dated days are allowed (no time).
 */
export async function togglePase(raw: unknown): Promise<TogglePaseResult> {
  const input = togglePaseSchema.parse(raw);
  const supabase = await createClient();

  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) throw new Error("No autenticado");

  const { data: cliente, error: cErr } = await supabase
    .from("clientes")
    .select("id, clases_restantes")
    .eq("id", input.clienteId)
    .single();
  if (cErr || !cliente) throw new Error("Cliente no encontrado");

  const { data: activa } = await supabase
    .from("asistencias")
    .select("id, consumio")
    .eq("cliente_id", input.clienteId)
    .eq("fecha", input.fecha)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activa) {
    // Toggle OFF: soft-delete + restore a class iff this attendance took one.
    const { error: delErr } = await supabase
      .from("asistencias")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", activa.id);
    if (delErr) throw new Error("No se pudo deshacer la asistencia");

    if (activa.consumio && cliente.clases_restantes !== null) {
      await supabase
        .from("clientes")
        .update({ clases_restantes: cliente.clases_restantes + 1 })
        .eq("id", cliente.id);
    }
    return { present: false, hora: null };
  }

  // Toggle ON: consume a class (domain) + insert the attendance row.
  const saldo: Clases = cliente.clases_restantes === null ? "ilimitado" : cliente.clases_restantes;
  const consumido = consumirClase(saldo);
  const consumio = saldo !== "ilimitado" && saldo > 0; // a class actually came off
  const esHoy = input.fecha === hoyIsoChihuahua();
  const hora = esHoy ? horaChihuahua() : null;

  const { error: insErr } = await supabase.from("asistencias").insert({
    user_id: userId,
    cliente_id: cliente.id,
    fecha: input.fecha,
    hora,
    consumio,
  });
  if (insErr) throw new Error("No se pudo registrar la asistencia");

  if (consumio && consumido !== "ilimitado") {
    await supabase
      .from("clientes")
      .update({ clases_restantes: consumido })
      .eq("id", cliente.id);
  }

  return { present: true, hora };
}
