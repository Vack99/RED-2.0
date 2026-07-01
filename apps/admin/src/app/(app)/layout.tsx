import { TabBar, type TabItem } from "@gym/ui/forge/tab-bar";

// The admin app owns its nav table (brand-specific routes + labels); @gym/ui's
// TabBar is brand-neutral and receives it as a prop. With typedRoutes on, a
// renamed/typo'd href is a build error here (audit 2026-06-30).
const TABS: readonly TabItem[] = [
  { href: "/inicio", label: "INICIO", icon: "home" },
  { href: "/clientes", label: "CLIENTES", icon: "users" },
  { href: "/asistencia", label: "ASIST", icon: "check", primary: true },
  { href: "/vender", label: "+ VENTA", icon: "plus" },
  { href: "/cuenta", label: "CUENTA", icon: "user" },
];

/**
 * App shell: a full-bleed, mobile-first phone-width column centered on a
 * subtle backdrop (no decorative device frame). <main> is the single
 * scroller; the bottom tab bar is pinned beneath it.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh w-full justify-center bg-backdrop">
      <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-canvas sm:max-w-[440px] sm:shadow-2xl">
        <main className="forge-scroll relative flex-1 overflow-y-auto">{children}</main>
        <TabBar items={TABS} />
      </div>
    </div>
  );
}
