import * as React from "react";
import { Eyebrow } from "@gym/ui/forge/ui";

// THROWAWAY (variant E). The "QUÉ ESTÁS VIENDO" panel both E screens close
// with. The owner walks six surfaces back to back and will not remember which
// was which, so each one names what it does differently AND what it costs.
// A variant that hides its weakness is useless to a comparison.
export function Nota({ lines, volver }: { lines: React.ReactNode[]; volver: string }) {
  return (
    <div
      style={{
        marginTop: 30,
        padding: "18px 22px 34px",
        background: "var(--sunk)",
        borderTop: "1px solid var(--line)",
      }}
    >
      <Eyebrow>QUÉ ESTÁS VIENDO</Eyebrow>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
        {lines.map((l, i) => (
          <div
            key={i}
            className="flex"
            style={{ gap: 8, fontSize: 11.5, color: "var(--muted)", lineHeight: 1.55 }}
          >
            <span style={{ color: "var(--muted-soft)" }}>—</span>
            <span>{l}</span>
          </div>
        ))}
      </div>
      <div className="flex" style={{ gap: 18, marginTop: 20 }}>
        <a href="/proto" style={{ fontSize: 10.5, letterSpacing: 1.2, color: "var(--muted-soft)" }}>
          ← ÍNDICE
        </a>
        <a href={volver} style={{ fontSize: 10.5, letterSpacing: 1.2, color: "var(--muted-soft)" }}>
          {"↔ LA OTRA PANTALLA"}
        </a>
      </div>
    </div>
  );
}
