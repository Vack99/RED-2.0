"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icon";

interface TabItem {
  href: string;
  label: string;
  icon: IconName;
  primary?: boolean;
}

const TABS: TabItem[] = [
  { href: "/inicio", label: "INICIO", icon: "home" },
  { href: "/clientes", label: "CLIENTES", icon: "users" },
  { href: "/asistencia", label: "ASIST", icon: "check", primary: true },
  { href: "/vender", label: "+ VENTA", icon: "plus" },
  { href: "/cuenta", label: "CUENTA", icon: "user" },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav
      className="relative z-[5] flex shrink-0 border-t border-line"
      style={{ background: "var(--tab-bg)", padding: "10px 4px 22px" }}
    >
      {TABS.map((it) => {
        const on = pathname === it.href || pathname.startsWith(it.href + "/");
        return (
          <Link
            key={it.href}
            href={it.href}
            className="relative flex flex-1 flex-col items-center"
            style={{ gap: 4, padding: "4px 0" }}
          >
            {it.primary ? (
              <div
                className="flex items-center justify-center transition-all"
                style={{
                  width: 44,
                  height: 44,
                  marginTop: -12,
                  background: on ? "var(--yellow)" : "var(--surface)",
                  border: on ? "none" : "1px solid var(--line)",
                  boxShadow: on ? "0 8px 24px color-mix(in srgb, var(--yellow) 33%, transparent)" : "none",
                }}
              >
                <Icon name={it.icon} size={22} color={on ? "var(--ink)" : "var(--muted)"} />
              </div>
            ) : (
              <>
                <Icon name={it.icon} size={20} color={on ? "var(--gold)" : "var(--muted)"} />
                <span
                  className="font-bold"
                  style={{ fontSize: 9.5, letterSpacing: 1.2, color: on ? "var(--yellow)" : "var(--muted)" }}
                >
                  {it.label}
                </span>
              </>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
