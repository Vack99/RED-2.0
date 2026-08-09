import "server-only";

import { headers } from "next/headers";

import { getIdentidadLegalPublica } from "@gym/data/server/legal";
import { getContacto, type MarketingGym } from "@gym/data/server/marketing";
import { identidadDesde, urlAvisoIntegralDesde, type IdentidadLegalGym } from "@gym/domain/legal";
import { formatTelMx } from "@gym/format";

/**
 * The client app's per-tenant aviso de privacidad resolution (issue #256) — the ONE home for
 * "assemble this gym's `IdentidadLegalGym` from its public sources", shared by `/legal`,
 * `/registro` and `/activar/contrasena` so the three don't each hand-roll the same four-way
 * fetch. Reads via the ANON-scoped DAL regardless of session state (delta #5 of the task brief):
 * the aviso is public content, so a logged-in member's own session client is never used here —
 * `getIdentidadLegalPublica` and `getContacto` both default to `createAnonClient`.
 */

/** This request's own origin + `/legal` — the aviso's stable public URL (the
 *  `{{url_aviso_integral}}` merge field). Same `x-forwarded-proto`/`host` idiom already used by
 *  registro/actions.ts, entrar/actions.ts and activar/actions.ts for their auth-confirm links:
 *  every gym's client host already resolves to the CURRENT request, so no `gym_domain` lookup is
 *  needed in-request (unlike the emailed invite links, which run outside any request and
 *  therefore go through `construirUrlInvitacion` instead). */
async function urlAvisoIntegral(): Promise<string> {
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  return urlAvisoIntegralDesde(origin);
}

/** Assemble `gym`'s public `IdentidadLegalGym`: `gym_legal` + `gym.legal_name` (anon, gym-scoped),
 *  `gym_contact`'s whatsapp/email as the aviso's telefono/email_contacto (the gym-scoped, already
 *  public equivalent of #255's per-operator `perfil.tel` — see `identidadDesde`'s own doc comment
 *  for why that source doesn't work for a public document, run through `@gym/format`'s
 *  `formatTelMx` — review finding 5 — rather than a bare `+` prefix on the raw E.164 digits), and
 *  this request's own origin as the aviso's URL. Every field degrades to null on a missing/errored
 *  read (the DAL readers' own best-effort posture) — the caller's `identidadLegalCompleta` check
 *  is what decides whether to render the real aviso or the generic fallback, never a thrown page. */
export async function resolverIdentidadLegalPublica(gym: MarketingGym): Promise<IdentidadLegalGym> {
  const [identidadPublica, contacto, url] = await Promise.all([
    getIdentidadLegalPublica(gym.id),
    getContacto(gym.id),
    urlAvisoIntegral(),
  ]);
  return identidadDesde(
    identidadPublica,
    gym.brandName,
    contacto?.whatsapp ? formatTelMx(contacto.whatsapp) : null,
    contacto?.email ?? null,
    url,
  );
}
