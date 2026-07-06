import "server-only";

import { cache } from "react";
import { z } from "zod";

import { calcVigenciaEnd } from "@gym/domain/rules";
import type { Vigencia } from "@gym/domain/types";
import { fmtShort, hoyEnZona } from "@gym/format";
import { createClient, type SupabaseServer } from "./supabase";

import { requireOperator } from "./_auth";
import { getOperatorGym } from "./gym";

export interface PaqueteDTO {
  id: string;
  nombre: string;
  /** Class grant, NULL = ilimitado. The editor sets this (1..30 or null) and the
   *  display `nombre` is DERIVED from it in-DB, so label and grant cannot drift. */
  clases: number | null;
  /** Display vigencia, e.g. "20 días" or "todo el mes". */
  vigencia: string;
  /** Expiry if bought today (fmtShort), e.g. "16 jun" — for the "Hasta …" hint. */
  hasta: string;
  precio: number;
  popular: boolean;
}

/** The operator's package catalog, ordered for display.
 *  `tz` is optional: when a caller (e.g. crearVenta) has ALREADY resolved the
 *  operator's gym timezone, pass it through to skip a second membership round
 *  trip — otherwise this resolves it itself via getOperatorGym.
 *  @returns the package list · best-effort: returns [] on error (error is not
 *  destructured, so any failure reads as an empty catalog). */
export const getPaquetes = cache(
  async (client?: SupabaseServer, tz?: string): Promise<PaqueteDTO[]> => {
    const supabase = client ?? (await createClient());
    const { data } = await supabase
      .from("paquetes")
      .select("id, nombre, clases, vigencia_tipo, vigencia_dias, precio, popular, orden")
      .order("orden");

    if (!data) return [];

    const zone = tz ?? (await getOperatorGym(supabase)).timezone;
    const hoy = hoyEnZona(zone);
    return data.map((p) => {
      const vigencia: Vigencia = p.vigencia_tipo === "mes" ? "mes" : (p.vigencia_dias ?? 0);
      return {
        id: p.id,
        nombre: p.nombre,
        clases: p.clases,
        vigencia: p.vigencia_tipo === "mes" ? "todo el mes" : `${p.vigencia_dias} días`,
        hasta: fmtShort(calcVigenciaEnd(hoy, vigencia)),
        precio: p.precio,
        popular: p.popular,
      };
    });
  },
);

/** A plan as the cuenta editor sees it: the money/grant truth (PaqueteDTO) + marketing-only copy
 *  (free-text, distinct from the grant-derived `nombre` per ADR-0007) + the ordered `plan_feature`
 *  labels. This is the EDITOR read; the sale path uses getPaquetes, whose fixed column list excludes
 *  every marketing column (PRD #36 (a): the sale path never reads the new columns). */
export interface PlanEditorDTO extends PaqueteDTO {
  code: string | null;
  name: string | null;
  subtitle: string | null;
  badge: string | null;
  cadence: string | null;
  features: string[];
}

/** The plan catalog for the cuenta editor: paquetes rows enriched with marketing copy + their ordered
 *  feature lists (one extra query, grouped in memory — no N+1). Deliberately separate from getPaquetes so
 *  the money path's read shape is untouched. Best-effort: returns [] when the paquetes read fails. */
export const getPlanesEditor = cache(
  async (client?: SupabaseServer, tz?: string): Promise<PlanEditorDTO[]> => {
    const supabase = client ?? (await createClient());
    const [{ data: rows }, { data: feats }] = await Promise.all([
      supabase
        .from("paquetes")
        .select(
          "id, nombre, clases, vigencia_tipo, vigencia_dias, precio, popular, orden, code, name, subtitle, badge, cadence",
        )
        .order("orden"),
      supabase.from("plan_feature").select("plan_id, label, orden").order("orden"),
    ]);

    if (!rows) return [];

    // Group the (globally orden-sorted) features by plan; within a plan they stay in ascending orden.
    const byPlan = new Map<string, string[]>();
    for (const f of feats ?? []) {
      const list = byPlan.get(f.plan_id) ?? [];
      list.push(f.label);
      byPlan.set(f.plan_id, list);
    }

    const zone = tz ?? (await getOperatorGym(supabase)).timezone;
    const hoy = hoyEnZona(zone);
    return rows.map((p) => {
      const vigencia: Vigencia = p.vigencia_tipo === "mes" ? "mes" : (p.vigencia_dias ?? 0);
      return {
        id: p.id,
        nombre: p.nombre,
        clases: p.clases,
        vigencia: p.vigencia_tipo === "mes" ? "todo el mes" : `${p.vigencia_dias} días`,
        hasta: fmtShort(calcVigenciaEnd(hoy, vigencia)),
        precio: p.precio,
        popular: p.popular,
        code: p.code,
        name: p.name,
        subtitle: p.subtitle,
        badge: p.badge,
        cadence: p.cadence,
        features: byPlan.get(p.id) ?? [],
      };
    });
  },
);

/**
 * The edit payload's trust boundary (the Zod schema, not the client gate):
 * `clases` the real class grant — an integer 1..30, or null = ilimitado;
 * `precio` a positive integer (whole pesos, es-MX — no centavos in v1);
 * `popular` a boolean; `id` a uuid. There is NO `nombre` input: the display
 * label is DERIVED from `clases` in-DB ("{n} clases" / "1 clase" / "Ilimitado"),
 * so the label and the grant can never drift. `vigencia` stays absent (the RPC
 * hard-normalizes it to the 30-day invariant).
 */
export const actualizarPaqueteSchema = z.object({
  id: z.string().uuid(),
  precio: z.number().int().positive(),
  popular: z.boolean(),
  clases: z.number().int().min(1).max(30).nullable(),
});

/**
 * Edit an existing package's clases/precio/popular (owner-scoped via RLS). The
 * `actualizar_paquete` RPC is the single place the write happens (ADR-0005): it
 * DERIVES the display nombre from clases, enforces the single-favorite invariant
 * (promoting one demotes the others atomically), and hard-normalizes vigencia to
 * the 30-day invariant. Injectable (ADR-0001).
 *
 * `clases` is the nullable RPC arg (mirrors registrar_venta): a number is spread
 * in as `p_clases`, and null (ilimitado) OMITS the key so the RPC's DEFAULT NULL
 * applies — keeps the generated types honest, no `as any`. A derived-nombre
 * collision surfaces as a `paquetes_nombre_uq` unique violation (23505) and maps
 * to a friendly es-MX message.
 */
export async function actualizarPaquete(raw: unknown, client?: SupabaseServer): Promise<void> {
  const input = actualizarPaqueteSchema.parse(raw);
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const { error } = await supabase.rpc("actualizar_paquete", {
    p_id: input.id,
    p_precio: input.precio,
    p_popular: input.popular,
    ...(input.clases !== null && { p_clases: input.clases }),
  });
  if (error) {
    // paquetes_nombre_uq (user_id, nombre) → another package already derives to
    // this class count; friendly duplicate message. Gate on the CONSTRAINT NAME,
    // not the bare 23505 code: the single-favorite index (paquetes_one_popular)
    // is also a 23505 and must NOT be mislabeled as a duplicate-clases. Anything
    // else falls through to the generic message.
    const haystack = `${error.message ?? ""} ${error.details ?? ""}`;
    if (/paquetes_nombre_uq/.test(haystack)) {
      throw new Error("Ya tienes un paquete con esa cantidad de clases");
    }
    throw new Error("No se pudo actualizar el paquete");
  }
}

/**
 * The marketing-edit trust boundary. Every field is optional free-text that trims and defaults to "" —
 * an empty value clears the column (the RPC `nullif`s it). These are display-only strings, orthogonal to
 * the money/grant fields `actualizar_paquete` owns; keeping them in a SEPARATE RPC leaves the tested
 * money-path write untouched. There is NO path from `name` to the derived `nombre` (ADR-0007).
 */
export const actualizarPaqueteMarketingSchema = z.object({
  id: z.string().uuid(),
  code: z.string().trim().max(40).default(""),
  name: z.string().trim().max(60).default(""),
  subtitle: z.string().trim().max(120).default(""),
  badge: z.string().trim().max(24).default(""),
  cadence: z.string().trim().max(40).default(""),
});

/** Edit a plan's marketing copy (staff-scoped via RLS) through the `actualizar_paquete_marketing` RPC
 *  (ADR-0005). A per-gym code collision surfaces as paquetes_code_gym_uq (23505) → friendly message.
 *  Injectable (ADR-0001). */
export async function actualizarPaqueteMarketing(raw: unknown, client?: SupabaseServer): Promise<void> {
  const input = actualizarPaqueteMarketingSchema.parse(raw);
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const { error } = await supabase.rpc("actualizar_paquete_marketing", {
    p_id: input.id,
    p_code: input.code,
    p_name: input.name,
    p_subtitle: input.subtitle,
    p_badge: input.badge,
    p_cadence: input.cadence,
  });
  if (error) {
    const haystack = `${error.message ?? ""} ${error.details ?? ""}`;
    if (/paquetes_code_gym_uq/.test(haystack)) {
      throw new Error("Ya tienes un paquete con ese código");
    }
    throw new Error("No se pudo actualizar el paquete");
  }
}

/** The feature-list trust boundary: an ordered list of ≤12 labels (≤80 chars each); blanks are dropped,
 *  so the editor can send partially-filled rows. The array position IS the display order. */
export const setPlanFeaturesSchema = z.object({
  planId: z.string().uuid(),
  features: z
    .array(z.string().trim().max(80))
    .max(12)
    .transform((a) => a.filter((s) => s.length > 0)),
});

/** Replace a plan's whole ordered feature list (add/remove/reorder in one desired-state write) through
 *  the atomic `set_plan_features` RPC (ADR-0005). Injectable (ADR-0001). */
export async function setPlanFeatures(raw: unknown, client?: SupabaseServer): Promise<void> {
  const input = setPlanFeaturesSchema.parse(raw);
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const { error } = await supabase.rpc("set_plan_features", {
    p_plan_id: input.planId,
    p_labels: input.features,
  });
  if (error) throw new Error("No se pudieron guardar las características");
}
