import { getOperatorGym } from "@gym/data/server/gym";
import { TabBar, type TabItem } from "@gym/ui/forge/tab-bar";

import { SinGimnasio } from "./_components/sin-gimnasio";

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
 * The ONE staff gate for the whole `(app)` group (audit #19): `getOperatorGym`
 * now requires a staff role, so a signed-in member session (proxy.ts already
 * guarantees SOME authenticated session reaches here) throws — caught once
 * here instead of every page repeating the check, and every page's own
 * `getOperatorGym()` call still resolves for free via its `cache()` memo.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const esStaff = await getOperatorGym()
    .then(() => true)
    .catch(() => false);

  return (
    <div className="flex min-h-dvh w-full justify-center bg-backdrop">
      <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-canvas sm:max-w-[440px] sm:shadow-2xl">
        <main className="forge-scroll relative flex-1 overflow-y-auto">
          {esStaff ? children : <SinGimnasio />}
        </main>
        {esStaff && <TabBar items={TABS} />}
      </div>
    </div>
  );
}
