import { createClient } from "@gym/data/client";
import { Card } from "@gym/ui/forge/ui";

/**
 * The socio's landing — one trivial branded page. Its chrome (logo + tokens) is
 * the marca the proxy resolved; the Card recolors per brand off the injected
 * token block (surface + line). It also carries the phase's shared-Supabase
 * proof (ADR-0012 §5): the @gym/data browser factory INSTANTIATES against the
 * shared NEXT_PUBLIC_SUPABASE_* — instantiation only, no table/policy/query
 * (the schema + RLS land in Phase 3). Reaching this render proves the factory
 * constructed; `data-supabase-ready` surfaces its live query surface in the HTML.
 */
export default function Home() {
  const supabase = createClient();

  return (
    <main style={{ padding: 20 }}>
      <Card>
        <p style={{ margin: 0, fontWeight: 600 }}>Bienvenido a tu panel.</p>
        <p hidden data-supabase-ready={typeof supabase.from === "function"}>
          Supabase client instanciado.
        </p>
      </Card>
    </main>
  );
}
