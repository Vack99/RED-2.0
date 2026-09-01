import { describe, expect, it } from "vitest";

import type { SupabaseServer } from "@gym/data/server/supabase";

import { leerDia } from "./reads";

/**
 * #328 AC: "Lista: no agenda read is issued (assert at the data seam), ... the
 * agenda read is NEVER issued." A behavioural assertion on the derived `DiaVM`
 * (always null on Lista) would pass even if the code awaited-and-discarded a
 * schedule read it never needed — that is a WEAKER claim than "never touched the
 * client at all" (the round trip itself is the cost this AC guards against, #226-
 * style). This test sits beside `page.tsx`, not under `_components/`, for the same
 * reason `clientes/cross-seam.test.ts` does: the client-seam ESLint guard restricts
 * every `_components/**` file to type-only imports of `@gym/data/server/*`.
 *
 * The fake records every `auth`/`from`/`rpc` call and then throws — a Cupo call
 * that DOES touch the client still resolves (`leerDia` catches read failures and
 * degrades to the no-hero arm, same as a real failed read), so "did it throw" is
 * not the signal; "did it record a call" is.
 */
function fakeClienteQueCuenta(): { client: SupabaseServer; calls: string[] } {
  const calls: string[] = [];
  const client = {
    auth: {
      getClaims: async () => {
        calls.push("auth.getClaims");
        throw new Error("the fake never seeds a real session — recording the attempt is the point");
      },
    },
    from: (table: string) => {
      calls.push(`from:${table}`);
      throw new Error(`from(${table}) should never be reached without auth`);
    },
    rpc: (name: string) => {
      calls.push(`rpc:${name}`);
      throw new Error(`rpc(${name}) should never be reached without auth`);
    },
  };
  return { client: client as unknown as SupabaseServer, calls };
}

describe("leerDia — the data seam Lista must never touch (#328)", () => {
  const HOY_ISO = "2026-09-01";

  it("Lista: the Supabase client is NEVER called — the read is skipped, not discarded", async () => {
    const { client, calls } = fakeClienteQueCuenta();
    const lectura = await leerDia("lista", HOY_ISO, client);
    expect(calls).toEqual([]);
    expect(lectura).toEqual({ agenda: null, visitas: [] });
  });

  it("Cupo: the client IS reached — a failed round trip still degrades to the no-hero arm", async () => {
    const { client, calls } = fakeClienteQueCuenta();
    const lectura = await leerDia("cupo", HOY_ISO, client);
    expect(calls.length).toBeGreaterThan(0);
    expect(lectura).toEqual({ agenda: null, visitas: [] });
  });
});
