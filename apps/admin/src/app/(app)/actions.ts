"use server";

import { headers } from "next/headers";

import { aceptarAcuerdo } from "@gym/data/server/legal";
import { getOperatorGym } from "@gym/data/server/gym";
import {
  ANEXO_TRATAMIENTO_DATOS_DOCUMENTO,
  ANEXO_TRATAMIENTO_DATOS_TEXTO,
  ANEXO_TRATAMIENTO_DATOS_VERSION,
} from "@gym/domain/legal";

/**
 * Actions that belong to the `(app)` layout gate itself, not to any one sector.
 *
 * `aceptarAnexoAction` is the Gate 0.1 click-wrap gate's write (#254). It takes NO client
 * arguments on purpose: the gym is re-resolved server-side via `getOperatorGym` (host-aware,
 * the SAME resolution the layout used to decide the gate is showing — ADR-0012, a gym is
 * never a client field), and `documento`/`version`/`contenido` are the server-side constants
 * from `@gym/domain/legal` — never anything the browser could send. `ip`/`user-agent` are
 * captured HERE from the real request headers, never trusted from the browser (binding
 * decision, #253 review round 1). An absent/empty `x-forwarded-for` resolves to `null`, never
 * `''` — the `ip` column's check constraint rejects an empty string — the same `|| null` idiom
 * `apps/client`'s `contacto`/`activar` actions already use.
 *
 * `aceptar_acuerdo` itself is owner-gated (`has_role(gym,'owner')`, SECURITY DEFINER) — an
 * operator calling this is refused by the RPC, exactly like every other owner-only path in
 * this codebase; nothing here re-checks the role client-side, since the UI never renders an
 * ACEPTAR button for a non-owner in the first place (`AnexoPendiente`).
 */
export async function aceptarAnexoAction(): Promise<void> {
  const gym = await getOperatorGym();
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || null;
  const userAgent = h.get("user-agent");

  await aceptarAcuerdo({
    gymId: gym.id,
    documento: ANEXO_TRATAMIENTO_DATOS_DOCUMENTO,
    version: ANEXO_TRATAMIENTO_DATOS_VERSION,
    contenido: ANEXO_TRATAMIENTO_DATOS_TEXTO,
    ip,
    userAgent,
  });
}
