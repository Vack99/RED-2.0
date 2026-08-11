import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getAdminHosts, getOperatorGyms } from "@gym/data/server/gym";
import { getAcuerdoAceptado } from "@gym/data/server/legal";
import { Icon } from "@gym/ui/forge/icon";
import { TabBar, type TabItem } from "@gym/ui/forge/tab-bar";
import { ANEXO_TRATAMIENTO_DATOS_DOCUMENTO, ANEXO_TRATAMIENTO_DATOS_VERSION } from "@gym/domain/legal";

import { auditTenantInEffect } from "../../lib/tenant";
import { SinGimnasio } from "./_components/sin-gimnasio";
import { VariosGimnasios } from "./_components/varios-gimnasios";

// The admin app owns its nav table (brand-specific routes + labels); @gym/ui's
// TabBar is brand-neutral and receives it as a prop. With typedRoutes on, a
// renamed/typo'd href is a build error here (audit 2026-06-30).
const TABS: readonly TabItem[] = [
  { href: "/inicio", label: "INICIO", icon: "home" },
  { href: "/clientes", label: "CLIENTES", icon: "users" },
  { href: "/asistencia", label: "ASIST", icon: "check", primary: true },
  // AGENDA takes vender's slot (PRD #36 h); vender stays reachable from the
  // cliente ficha (RENOVAR) + the INICIO "nuevo cliente" quick action.
  { href: "/agenda", label: "AGENDA", icon: "cal" },
  { href: "/cuenta", label: "CUENTA", icon: "user" },
];

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
 *
 * Once the tenant-in-effect is settled (`decision.kind === "render"`), it also drives the Gate
 * 0.1 click-wrap NOTICE (#254, demoted to non-blocking by owner ruling 2026-08-10 pending #258's
 * abogado review of the draft text): a gym whose current Anexo de Tratamiento de Datos version
 * is unaccepted no longer loses `children` — the OWNER (the only role `aceptar_acuerdo` accepts
 * from) sees a slim banner above the page linking to the accept form at `/cuenta/anexo`; any
 * other staff role sees nothing, since they can't act on it anyway. This runs AFTER the tenant
 * reconciliation on purpose: the gate is per-gym, so it needs the settled gym-in-effect, not the
 * raw membership list.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const gyms = await getOperatorGyms().catch(() => []);
  const decision = await auditTenantInEffect(gyms);

  let contenido: React.ReactNode = children;
  let mostrarAnexoBanner = false;
  const mostrarTabBar = decision.kind === "render";

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
  } else {
    // decision.gym is the SLUG the tenant reconciliation settled on (never an id) — the same
    // pick getOperatorGym() itself makes host-first, so `gym` here IS the gym the render-case
    // pages resolve. #254: whether THIS gym has accepted the CURRENT Anexo version now only
    // decides the banner, never whether `children` renders.
    const gym = gyms.find((g) => g.slug === decision.gym) ?? gyms[0];
    const aceptado = await getAcuerdoAceptado(
      gym.id,
      ANEXO_TRATAMIENTO_DATOS_DOCUMENTO,
      ANEXO_TRATAMIENTO_DATOS_VERSION,
    );
    mostrarAnexoBanner = !aceptado && gym.role === "owner";
  }

  return (
    <div className="flex min-h-dvh w-full justify-center bg-backdrop">
      <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-canvas sm:max-w-[440px] sm:shadow-2xl">
        {mostrarAnexoBanner && (
          <Link
            href="/cuenta/anexo"
            className="flex shrink-0 items-center"
            style={{ gap: 8, padding: "10px 16px", background: "var(--yellow-soft)", borderBottom: "1px solid var(--yellow)" }}
          >
            <Icon name="alert" size={14} color="var(--gold)" />
            <span className="min-w-0 flex-1 truncate" style={{ fontSize: 12, fontWeight: 600, color: "var(--fg)" }}>
              Anexo de Tratamiento de Datos pendiente
            </span>
            <span className="shrink-0 uppercase font-bold" style={{ fontSize: 10.5, letterSpacing: 0.6, color: "var(--gold)" }}>
              Revisar y aceptar
            </span>
          </Link>
        )}
        <main className="forge-scroll relative flex-1 overflow-y-auto">{contenido}</main>
        {mostrarTabBar && <TabBar items={TABS} />}
      </div>
    </div>
  );
}
