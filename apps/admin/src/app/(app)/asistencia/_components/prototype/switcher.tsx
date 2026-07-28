"use client";

/* PROTOTYPE — throwaway (#89). Delete with the rest of _prototype/. */

import * as React from "react";
import { useRouter } from "next/navigation";

export interface VariantDef {
  k: string;
  name: string;
}

export function PrototypeSwitcher({ variants, current }: { variants: VariantDef[]; current: string }) {
  const router = useRouter();
  const idx = Math.max(
    0,
    variants.findIndex((v) => v.k === current),
  );

  const go = React.useCallback(
    (delta: number) => {
      const next = variants[(idx + delta + variants.length) % variants.length];
      router.replace(`/asistencia?variant=${next.k}`, { scroll: false });
    },
    [idx, router, variants],
  );

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  if (process.env.NODE_ENV === "production") return null;

  const actual = variants[idx];

  return (
    <div
      className="fixed left-1/2 flex items-center"
      style={{
        bottom: 86,
        transform: "translateX(-50%)",
        zIndex: 90,
        gap: 2,
        background: "#111",
        color: "#fff",
        border: "1px solid #444",
        borderRadius: 999,
        boxShadow: "0 8px 28px rgba(0,0,0,.55)",
        padding: 4,
      }}
    >
      <Arrow label="Variante anterior" onClick={() => go(-1)}>
        ‹
      </Arrow>
      <span
        style={{
          padding: "0 12px",
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: 0.6,
          whiteSpace: "nowrap",
        }}
      >
        {actual.k} — {actual.name}
      </span>
      <Arrow label="Variante siguiente" onClick={() => go(1)}>
        ›
      </Arrow>
    </div>
  );
}

function Arrow({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex items-center justify-center"
      style={{
        width: 30,
        height: 30,
        borderRadius: 999,
        background: "#2a2a2a",
        color: "#fff",
        border: "none",
        fontSize: 17,
        lineHeight: 1,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
