import { notFound } from "next/navigation";
import { Eyebrow, H1 } from "@gym/ui/forge/ui";

// apps/admin/src/app/proto/page.tsx — THROWAWAY, localhost-only (hard rule 2).
// Index of the five CLIENTES-directory alternatives built for map #180. Plain
// <a> tags (not next/link) on purpose: these routes don't all exist at once
// while variants are being built, and typedRoutes can't type a route that
// isn't there yet — this index must not fight that. `?n=` is the shared scale
// switcher (map #180: "judge any doctrine at 30 and at 500"); each variant's
// own page reads it and calls makeRoster(n) instead of ROSTER_30 directly.

const SCALES = [30, 200, 500] as const;

const SURFACES = [
  {
    href: "/proto/actual",
    label: "ACTUAL",
    desc: "Today's page, unchanged: diasRest-ascending sort, urgenciaCliente with no floor, the non-partitioning header. The control every other variant is judged against.",
  },
  {
    href: "/proto/a-tiers",
    label: "A · TIERS",
    desc: "A lifecycle-tier model over the same roster.",
  },
  {
    href: "/proto/b-desk",
    label: "B · DESK",
    desc: "A find-and-charge-fast desk view.",
  },
  {
    href: "/proto/c-inicio",
    label: "C · INICIO",
    desc: "The dashboard's retention tile, rebuilt to land somewhere true.",
  },
  {
    href: "/proto/d-ruido",
    label: "D · RUIDO",
    desc: "Same data, signal vs. noise made visible.",
  },
  {
    href: "/proto/e-ventana",
    label: "E · VENTANA — DIRECTORIO",
    desc: "What the vendors actually ship: one flat list, estado as a column, no sections. Screen 1 of 2.",
  },
  {
    // E's second screen carries ALL of its discrimination — the two bounded
    // tiles are the only place the 8 recoverable are told apart from the 10
    // past Fitco's day-16 horizon. Listing it separately because burying it in
    // a sibling's description is exactly how it went unseen.
    href: "/proto/e-ventana/inicio",
    label: "E · VENTANA — INICIO",
    desc: "Two bounded tiles (Por Renovar · Aún a Tiempo) low on the dashboard, where ÚLTIMAS ASISTENCIAS sits. Screen 2 of 2.",
  },
];

export default async function ProtoIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ n?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const sp = await searchParams;
  const n = SCALES.includes(Number(sp.n) as (typeof SCALES)[number]) ? sp.n! : "30";

  return (
    <div className="flex min-h-dvh w-full justify-center bg-backdrop">
      <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-canvas sm:max-w-[440px] sm:shadow-2xl">
        <main className="forge-scroll relative flex-1 overflow-y-auto">
          <div style={{ padding: "22px 22px 4px" }}>
            <Eyebrow>MAP #180 — PROTOTYPE</Eyebrow>
            <H1 size={34} style={{ marginTop: 6 }}>
              CLIENTES
            </H1>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8, lineHeight: 1.5 }}>
              Five takes on the directory, same fixture roster, same chrome. Judge them at scale
              too — this list is windowed and animated at 30 real members; the complaint compounds
              past that.
            </div>
          </div>

          <div style={{ padding: "20px 22px 4px" }}>
            <Eyebrow style={{ marginBottom: 8 }}>ESCALA</Eyebrow>
            <div className="flex" style={{ gap: 8 }}>
              {SCALES.map((scale) => {
                const on = String(scale) === n;
                return (
                  <a
                    key={scale}
                    href={`/proto?n=${scale}`}
                    className="flex flex-1 items-center justify-center font-extrabold"
                    style={{
                      padding: "10px 6px",
                      background: on ? "var(--fg)" : "transparent",
                      border: `1px solid ${on ? "var(--fg)" : "var(--line)"}`,
                      color: on ? "var(--canvas)" : "var(--fg)",
                      fontSize: 13,
                      letterSpacing: 0.4,
                      textDecoration: "none",
                    }}
                  >
                    {scale}
                  </a>
                );
              })}
            </div>
          </div>

          <div style={{ padding: "20px 22px 40px", display: "flex", flexDirection: "column", gap: 10 }}>
            {SURFACES.map((s) => (
              <a
                key={s.href}
                href={`${s.href}?n=${n}`}
                className="block"
                style={{
                  padding: "16px 16px",
                  background: "var(--surface)",
                  border: "1px solid var(--line)",
                  textDecoration: "none",
                }}
              >
                <div className="uppercase font-extrabold" style={{ fontSize: 13, letterSpacing: 0.8, color: "var(--fg)" }}>
                  {s.label}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6, lineHeight: 1.5 }}>{s.desc}</div>
              </a>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
