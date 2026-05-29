import { TabBar } from "@/components/forge/tab-bar";

/**
 * App shell: a full-bleed, mobile-first phone-width column centered on a
 * subtle backdrop (no decorative device frame). <main> is the single
 * scroller; the bottom tab bar is pinned beneath it.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh w-full justify-center bg-backdrop">
      <div className="relative flex h-dvh w-full max-w-[440px] flex-col overflow-hidden bg-canvas sm:shadow-2xl">
        <main className="forge-scroll relative flex-1 overflow-y-auto">{children}</main>
        <TabBar />
      </div>
    </div>
  );
}
