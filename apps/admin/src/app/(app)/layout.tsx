import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAdminHosts, getOperatorGyms } from "@gym/data/server/gym";
import { modo } from "@gym/domain/rules";
import { TabBar } from "@gym/ui/forge/tab-bar";

import { tabsPara } from "../../lib/tabs";
import { auditTenantInEffect } from "../../lib/tenant";
import { SinGimnasio } from "./_components/sin-gimnasio";
import { VariosGimnasios } from "./_components/varios-gimnasios";

// The admin app owns its nav table (brand-specific routes + labels); @gym/ui's
// TabBar is brand-neutral and receives it as a prop. With typedRoutes on, a
// renamed/typo'd href is a build error here (audit 2026-06-30). The table itself
// is now a pure function of mode (`tabsPara`, spec #326): AGENDA takes vender's
// slot on Cupo, VENDER takes it on Lista; vender stays reachable from the cliente
// ficha (RENOVAR) + the INICIO "nuevo cliente" quick action either way.

/**
 * App shell: a full-bleed, mobile-first phone-width column centered on a
 * subtle backdrop (no decorative device frame). <main> is the single
 * scroller; the bottom tab bar is pinned beneath it.
 *
 * The ONE staff gate for the whole `(app)` group (audit #19): `getOperatorGyms`
 * only returns staff memberships, so a signed-in member session (proxy.ts already
 * guarantees SOME authenticated session reaches here) resolves an empty list —
 * handled once here instead of every page repeating the check, and every page's own
 * `getOperatorGym()` call still resolves for free via its `cache()` memo.
 *
 * It is also where the tenant-in-effect reconciliation runs (#203/#212): the ONE place
 * that holds both the host-resolved tenant (`x-gym`) and the session's staff gyms. The
 * decision itself is pure and lives in `src/lib/tenant.ts`; this is the wiring.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const gyms = await getOperatorGyms().catch(() => []);
  const decision = await auditTenantInEffect(gyms);

  let contenido: React.ReactNode = children;
  const mostrarTabBar = decision.kind === "render";
  // The gym the request actually renders under — `decision.gym`'s slug is always one of
  // `gyms` in the "render" arm (decideTenant only ever names a slug it was given). Any other
  // arm never reaches the tab bar, so the "cupo" fallback below is never rendered — it only
  // keeps this a total function.
  const gymEnEfecto = decision.kind === "render" ? gyms.find((g) => g.slug === decision.gym) : undefined;
  const modoActivo = modo(gymEnEfecto?.bookingEnabled ?? true);

  if (decision.kind === "none") {
    contenido = <SinGimnasio />;
  } else if (decision.kind !== "render") {
    // Both remaining arms need the same server-derived host map. `redirect` is only ever
    // reached with exactly ONE staff gym, so gyms[0] IS the target — and that target is
    // the operator's own host, which then matches, so the next render is a plain one and
    // there is no loop. No admin host mapped → fall through to the chooser, which names
    // the gym "sin dirección asignada" instead of dead-ending.
    const hosts = await getAdminHosts(gyms.map((g) => g.id));
    const destino = decision.kind === "redirect" ? hosts[gyms[0].id] : undefined;
    // x-ruta is stamped by proxy.ts (#204) — it preserves the path across the host hop.
    if (destino) redirect(`https://${destino}${(await headers()).get("x-ruta") ?? ""}`);
    contenido = (
      <VariosGimnasios
        gimnasios={gyms.map((g) => ({
          slug: g.slug,
          nombre: g.brandName,
          host: hosts[g.id] ?? null,
        }))}
      />
    );
  }

  return (
    <div className="flex min-h-dvh w-full justify-center bg-backdrop">
      <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-canvas sm:max-w-[440px] sm:shadow-2xl">
        <main className="forge-scroll relative flex-1 overflow-y-auto">{contenido}</main>
        {mostrarTabBar && <TabBar items={tabsPara(modoActivo)} />}
      </div>
    </div>
  );
}
