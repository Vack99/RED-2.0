import { Skeleton } from "@gym/ui/forge/skeleton";
import { Eyebrow, H1 } from "@gym/ui/forge/ui";

/**
 * Route loading fallback mirroring vender.tsx — header, the CLIENTE/PAQUETE/MÉTODO
 * accordion (CLIENTE open by default), and the sticky TOTAL + COBRAR footer.
 */
export default function Loading() {
  return (
    <div className="bg-canvas">
      <div className="flex items-center justify-between" style={{ padding: "14px 22px 4px" }}>
        <Eyebrow>NUEVA VENTA</Eyebrow>
        <div style={{ width: 38 }} />
      </div>
      <div style={{ padding: "20px 22px 28px" }}>
        <H1 size={44}>
          NUEVA
          <br />
          VENTA
        </H1>
      </div>

      {/* Accordion */}
      <div>
        {/* CLIENTE — open by default */}
        <div style={{ borderTop: "1px solid var(--line)" }}>
          <div className="flex items-center justify-between" style={{ padding: 22, gap: 12 }}>
            <div className="flex min-w-0 flex-1 flex-col" style={{ gap: 6 }}>
              <div className="flex items-center" style={{ gap: 8 }}>
                <Eyebrow color="var(--yellow)">CLIENTE</Eyebrow>
              </div>
            </div>
            <Skeleton width={30} height={30} />
          </div>
          <div style={{ padding: "4px 22px 28px" }}>
            {/* NUEVO / EXISTENTE tabs — static, NUEVO active */}
            <div className="flex" style={{ marginBottom: 22, borderBottom: "1px solid var(--line)" }}>
              {(["NUEVO", "EXISTENTE"] as const).map((l, i) => (
                <span
                  key={l}
                  className="flex-1 font-bold"
                  style={{ padding: "10px 0", marginBottom: -1, textAlign: "center", borderBottom: `2px solid ${i === 0 ? "var(--yellow)" : "transparent"}`, color: i === 0 ? "var(--yellow)" : "var(--muted)", fontSize: 11, letterSpacing: 1.4 }}
                >
                  {l}
                </span>
              ))}
            </div>
            {/* nombre / tel / email inputs + hint + CONTINUAR */}
            <div className="flex flex-col" style={{ gap: 12 }}>
              <Skeleton height={48} />
              <Skeleton height={48} />
              {/* email input + its hint hug at gap 6, mirroring the real email wrapper */}
              <div className="flex flex-col" style={{ gap: 6 }}>
                <Skeleton height={48} />
                <Skeleton width={220} height={11} />
              </div>
              <Skeleton height={48} style={{ marginTop: 2 }} />
            </div>
          </div>
        </div>

        {/* PAQUETE + MÉTODO — collapsed, empty-hint shape */}
        {([
          { label: "PAQUETE", hint: "Elegir paquete", last: false },
          { label: "MÉTODO", hint: "Elegir método", last: true },
        ] as const).map((s) => (
          <div
            key={s.label}
            style={{ borderTop: "1px solid var(--line)", borderBottom: s.last ? "1px solid var(--line)" : "none" }}
          >
            <div className="flex items-center justify-between" style={{ padding: 22, gap: 12 }}>
              <div className="flex min-w-0 flex-1 flex-col" style={{ gap: 6 }}>
                <Eyebrow>{s.label}</Eyebrow>
                <span className="font-medium" style={{ fontSize: 14, color: "var(--muted)", letterSpacing: 0.2 }}>
                  {s.hint}
                </span>
              </div>
              <Skeleton width={30} height={30} />
            </div>
          </div>
        ))}

        <div style={{ height: 28 }} />
      </div>

      {/* Footer — TOTAL + COBRAR — sticky like the real footer so it pins bottom, not below the fold */}
      <div className="bg-canvas" style={{ position: "sticky", bottom: 0, zIndex: 1, borderTop: "1px solid var(--line)", padding: "18px 22px 22px" }}>
        <div className="flex items-baseline justify-between" style={{ marginBottom: 14 }}>
          <Eyebrow>TOTAL</Eyebrow>
          <Skeleton width={120} height={30} />
        </div>
        <Skeleton height={54} />
      </div>
    </div>
  );
}
