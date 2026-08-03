"use client";

// apps/admin/src/app/proto/_components/shell.tsx — THROWAWAY (see ./page.tsx).
//
// Mirrors apps/admin/src/app/(app)/layout.tsx's frame (centered phone-width
// column, <main> as the single scroller, a pinned bottom tab bar) plus the
// AppBar every real screen renders as its own first child (e.g. clientes.tsx's
// <AppBar center="DIRECTORIO" .../>). Reproduced here once so every /proto
// variant gets IDENTICAL, faithful chrome instead of five hand-rolled copies.
//
// Cosmetic only, on purpose (hard rule 1 — this never touches the real app):
// no getOperatorGym, no auth gate, no real routing. CLIENTES is always the
// lit tab — every variant IS a clientes surface, so there is no "current
// pathname" to derive it from the way the real TabBar does.
//
// The AppBar is OPTIONAL (only rendered when `title` is passed): the `actual`
// baseline copies clientes.tsx verbatim, and that component already renders
// its OWN <AppBar> as its first child — passing `title` here too would stack
// a second, empty one above it. A NEW variant that doesn't own an AppBar of
// its own should pass `title`/`trailing` and skip rendering one itself.

import * as React from "react";
import { AppBar } from "@gym/ui/forge/ui";
import { Icon, type IconName } from "@gym/ui/forge/icon";

const TABS: { label: string; icon: IconName; primary?: boolean; active?: boolean }[] = [
  { label: "INICIO", icon: "home" },
  { label: "CLIENTES", icon: "users", active: true },
  { label: "ASIST", icon: "check", primary: true },
  { label: "AGENDA", icon: "cal" },
  { label: "CUENTA", icon: "user" },
];

function ProtoTabBar() {
  return (
    <nav
      className="relative z-[5] flex shrink-0 border-t border-line"
      style={{ background: "var(--tab-bg)", padding: "10px 4px 22px" }}
    >
      {TABS.map((t) => (
        <div key={t.label} className="relative flex flex-1 flex-col items-center" style={{ gap: 4, padding: "4px 0" }}>
          {t.primary ? (
            <div
              className="flex items-center justify-center"
              style={{ width: 44, height: 44, marginTop: -12, background: "var(--surface)", border: "1px solid var(--line)" }}
            >
              <Icon name={t.icon} size={22} color="var(--muted)" />
            </div>
          ) : (
            <span className="flex flex-col items-center" style={{ gap: 4, color: t.active ? "var(--gold)" : "var(--muted)" }}>
              <Icon name={t.icon} size={20} color="currentColor" />
              <span
                className="font-bold"
                style={{ fontSize: 9.5, letterSpacing: 1.2, color: t.active ? "var(--yellow)" : "var(--muted)" }}
              >
                {t.label}
              </span>
            </span>
          )}
        </div>
      ))}
    </nav>
  );
}

export function ProtoShell({
  title,
  trailing,
  children,
}: {
  /** The AppBar's centered eyebrow label (e.g. "DIRECTORIO"). */
  title?: React.ReactNode;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh w-full justify-center bg-backdrop">
      <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-canvas sm:max-w-[440px] sm:shadow-2xl">
        <main className="forge-scroll relative flex-1 overflow-y-auto">
          {title !== undefined && <AppBar center={title} trailing={trailing} />}
          {children}
        </main>
        <ProtoTabBar />
      </div>
    </div>
  );
}
