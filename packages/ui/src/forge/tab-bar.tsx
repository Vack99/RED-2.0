"use client";

import type { ComponentProps } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icon";

// Brand-neutral: the consuming app owns its route table and passes it in as
// `items`. `href` is exactly what next/link accepts (the typed Route union when
// typedRoutes is on), so the kit never hard-codes any one brand's routes
// (audit 2026-06-30).
export interface TabItem {
  href: ComponentProps<typeof Link>["href"];
  label: string;
  icon: IconName;
  primary?: boolean;
}

export function TabBar({ items }: { items: readonly TabItem[] }) {
  const pathname = usePathname();
  return (
    <nav
      className="relative z-[5] flex shrink-0 border-t border-line"
      style={{ background: "var(--tab-bg)", padding: "10px 4px 22px" }}
    >
      {items.map((it) => {
        const href = typeof it.href === "string" ? it.href : (it.href.pathname ?? "");
        const on = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={it.href}
            className="relative flex flex-1 flex-col items-center"
            style={{ gap: 4, padding: "4px 0" }}
          >
            {it.primary ? (
              <div
                // Only background + shadow actually change on activation; transition
                // just those (not `all`) so unrelated property changes never animate.
                className="flex items-center justify-center"
                style={{
                  width: 44,
                  height: 44,
                  marginTop: -12,
                  background: on ? "var(--yellow)" : "var(--surface)",
                  border: on ? "none" : "1px solid var(--line)",
                  boxShadow: on ? "0 8px 24px color-mix(in srgb, var(--yellow) 33%, transparent)" : "none",
                  transition:
                    "background-color 180ms cubic-bezier(.32,.72,0,1), box-shadow 180ms cubic-bezier(.32,.72,0,1)",
                }}
              >
                <Icon name={it.icon} size={22} color={on ? "var(--ink)" : "var(--muted)"} />
              </div>
            ) : (
              // Drive the active swap with one CSS color so both the icon (via
              // currentColor) and the label ease together with `transition-colors`.
              <span
                className="flex flex-col items-center transition-colors"
                style={{ gap: 4, color: on ? "var(--gold)" : "var(--muted)" }}
              >
                <Icon name={it.icon} size={20} color="currentColor" />
                <span
                  className="font-bold transition-colors"
                  style={{ fontSize: 9.5, letterSpacing: 1.2, color: on ? "var(--yellow)" : "var(--muted)" }}
                >
                  {it.label}
                </span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
