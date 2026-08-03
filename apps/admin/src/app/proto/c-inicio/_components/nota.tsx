import * as React from "react";
import { Eyebrow } from "@gym/ui/forge/ui";

// THROWAWAY (variant C). The "QUÉ ESTÁS VIENDO" panel both C screens close
// with — the owner walks five surfaces back to back and will not remember which
// was which, so each one names what it does differently AND what it costs.
export function Nota({ lines }: { lines: React.ReactNode[] }) {
  return (
    <div
      style={{
        margin: "26px 16px 8px",
        padding: "14px 16px 16px",
        background: "var(--sunk)",
        border: "1px solid var(--line)",
      }}
    >
      <Eyebrow>QUÉ ESTÁS VIENDO</Eyebrow>
      <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 10 }}>
        {lines.map((l, i) => (
          <div key={i} className="flex" style={{ gap: 8, fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5 }}>
            <span style={{ color: "var(--muted-soft)" }}>—</span>
            <span>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
