"use client";

/**
 * Re-mounts on every navigation, so each screen gets a subtle
 * enter animation (slide-in + fade) — the lightweight stand-in for the
 * prototype's push/pop transitions.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ animation: "forge-enter 260ms cubic-bezier(.32,.72,0,1) both" }}>
      {children}
    </div>
  );
}
