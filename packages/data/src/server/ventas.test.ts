import { beforeEach, describe, expect, it } from "vitest";

import { crearVenta, type CrearVentaInput } from "./ventas";
import type { SupabaseServer } from "./supabase";

/**
 * The seam this exercises: `crearVenta` takes an injectable client (ADR-0001,
 * audit cluster 4), so the write ORCHESTRATION — the stacked saldo, the
 * object-spread guard on the `registrar_venta` args, the auth gate — is testable
 * with a hand-rolled fake. No supabase, no DB. We assert the RPC payload the DAL
 * hands the (separately smoke-tested, ADR-0005) transaction.
 */

interface FakeRows {
  paquetes?: Record<string, unknown>;
  /** The package CATALOG (getPaquetes awaits `.select().order()` → the list);
   *  distinct from `paquetes`, the single row `crearVenta` reads via `.eq().single()`. */
  paquetesList?: Record<string, unknown>[];
  clientes?: Record<string, unknown>;
  perfil?: Record<string, unknown> | null;
  /** The cobro row getCobro reads via `.maybeSingle()` (null when unconfigured). */
  cobro?: Record<string, unknown> | null;
  plantillas?: { id: string; nombre: string; body: string }[];
}

interface FakeClient {
  /** What `.rpc("registrar_venta", args)` was called with — the assertion target. */
  rpcCalls: { name: string; args: Record<string, unknown> }[];
  client: SupabaseServer;
}

/**
 * Minimal fake satisfying exactly the chain `crearVenta` walks:
 * `.from(t).select().eq().single()`, `.maybeSingle()`, an awaitable `.select()`
 * (for plantillas), `.rpc(name, args).single()`, and `.auth.getClaims()`. A
 * per-table query builder is a thenable so `await supabase.from(...).select(...)`
 * resolves to `{ data }`; `.single`/`.maybeSingle` resolve a single row.
 */
function makeFake(rows: FakeRows, opts: { sub?: string | null } = {}): FakeClient {
  const sub = opts.sub === undefined ? "op-1" : opts.sub;
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];

  const builder = (single: unknown, list: unknown[]) => {
    const b = {
      select: () => b,
      eq: () => b,
      is: () => b,
      order: () => b,
      single: async () => ({ data: single, error: null }),
      maybeSingle: async () => ({ data: single, error: null }),
      // Awaited directly (plantillas): resolve to the full row list.
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        resolve({ data: list, error: null }),
    };
    return b;
  };

  const client = {
    auth: {
      getClaims: async () => ({ data: sub ? { claims: { sub } } : null }),
    },
    from: (table: string) => {
      switch (table) {
        case "paquetes":
          // single (`.eq().single()`) = the package crearVenta is selling;
          // list (`.order()`, awaited by getPaquetes) = the catalog.
          return builder(rows.paquetes ?? null, rows.paquetesList ?? []);
        case "clientes":
          return builder(rows.clientes ?? null, []);
        case "perfil":
          return builder(rows.perfil ?? null, []);
        case "cobro":
          return builder(rows.cobro ?? null, []);
        case "plantillas":
          return builder(null, rows.plantillas ?? []);
        default:
          return builder(null, []);
      }
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return { single: async () => ({ data: { folio: 1001, cliente_id: "cli-1" }, error: null }) };
    },
  };

  return { rpcCalls, client: client as unknown as SupabaseServer };
}

// Package fixtures (DB shape: ilimitado → clases null; mes → vigencia_dias null).
const ILIMITADO = {
  nombre: "Ilimitado",
  clases: null,
  vigencia_tipo: "mes",
  vigencia_dias: null,
  precio: 1200,
};
const FINITO = {
  nombre: "8 clases",
  clases: 8,
  vigencia_tipo: "dias",
  vigencia_dias: 30,
  precio: 800,
};

const input = (over: Partial<CrearVentaInput> = {}): CrearVentaInput =>
  ({
    mode: "new",
    nuevoNombre: "Andrea Castro",
    nuevoTel: "614 218 3401",
    paqueteId: "p1",
    metodo: "efectivo",
    ...over,
  }) as CrearVentaInput;

const lastRpc = (f: FakeClient) => f.rpcCalls.at(-1)!;

describe("crearVenta — write orchestration (injected fake)", () => {
  let fake: FakeClient;

  beforeEach(() => {
    fake = makeFake({ paquetes: ILIMITADO, plantillas: [{ id: "t1", nombre: "Recibo", body: "Hola {nombre}" }] });
  });

  it("omits the DEFAULT-NULL keys for a new ilimitado client (spread-guard, finding #3)", async () => {
    await crearVenta(input({ mode: "new" }), fake.client);

    const { name, args } = lastRpc(fake);
    expect(name).toBe("registrar_venta");

    // The object-spread guard must DROP every key whose value is null so the
    // RPC's DEFAULT NULL applies (ADR-0005) — no `null` into a `number?` param.
    expect(args).not.toHaveProperty("p_cliente_id"); // new client → no id
    expect(args).not.toHaveProperty("p_clases_restantes"); // ilimitado saldo
    expect(args).not.toHaveProperty("p_clases"); // ilimitado paquete
    expect(args).not.toHaveProperty("p_vigencia_dias"); // mes paquete

    // The 6 required + p_vence are always present.
    expect(Object.keys(args).sort()).toEqual(
      ["p_metodo", "p_monto", "p_nombre", "p_paquete_nombre", "p_tel", "p_vence", "p_vigencia_tipo"].sort(),
    );
  });

  it("includes the finite keys for an existing client + finite paquete", async () => {
    fake = makeFake({
      paquetes: FINITO,
      clientes: { id: "cli-1", nombre: "Andrea", tel: "614 000 0000", clases_restantes: 2, vence: null },
      plantillas: [{ id: "t1", nombre: "Recibo", body: "Hola {nombre}" }],
    });

    await crearVenta(input({ mode: "existing", clienteId: "cli-1" }), fake.client);

    const { args } = lastRpc(fake);
    expect(args).toHaveProperty("p_cliente_id", "cli-1");
    expect(args).toHaveProperty("p_clases", 8); // paquete clases (raw)
    expect(args).toHaveProperty("p_vigencia_dias", 30);
    // Stacked: an expired (vence null → 0 días) base forfeits, so 0 + 8 = 8.
    expect(args).toHaveProperty("p_clases_restantes", 8);
  });

  it("starts a brand-new finite client from an EMPTY saldo (the wiring bug, locked)", async () => {
    fake = makeFake({ paquetes: FINITO, plantillas: [{ id: "t1", nombre: "Recibo", body: "x" }] });

    await crearVenta(input({ mode: "new" }), fake.client);

    // A new finite buy's stacked clases == the paquete's clases (8), NOT
    // conflated with ilimitado (which would omit the key). Empty base + 8 = 8.
    expect(lastRpc(fake).args).toHaveProperty("p_clases_restantes", 8);
    expect(lastRpc(fake).args).toHaveProperty("p_clases", 8);
  });

  it("throws 'No autenticado' when getClaims returns no sub (requireOperator wired)", async () => {
    fake = makeFake({ paquetes: ILIMITADO }, { sub: null });

    await expect(crearVenta(input(), fake.client)).rejects.toThrow("No autenticado");
    expect(fake.rpcCalls).toHaveLength(0); // never reached the write
  });

  it("renders the recibo mensajes with the FULL token set resolved (clases/dias/precios/datos_pago)", async () => {
    fake = makeFake({
      paquetes: FINITO, // 8 clases, 30 días → new client saldo = 8 clases / 30 días
      paquetesList: [
        { id: "p1", nombre: "8 clases", vigencia_tipo: "dias", vigencia_dias: 30, precio: 800, popular: false, orden: 1 },
        { id: "p2", nombre: "Ilimitado", vigencia_tipo: "mes", vigencia_dias: null, precio: 1200, popular: true, orden: 2 },
      ],
      cobro: {
        titular: "Andrea Castro",
        banco: "BBVA",
        clabe: "012180001234567890",
        tarjeta: null,
        acepta_efectivo: true,
        acepta_transferencia: true,
        acepta_tarjeta: false,
      },
      plantillas: [
        {
          id: "t1",
          nombre: "Renovación",
          body: "Quedan {clases}, vence en {dias}.\nPrecios:\n{precios}\nPago:\n{datos_pago}",
        },
      ],
    });

    const res = await crearVenta(input({ mode: "new" }), fake.client);

    const texto = res.mensajes[0].texto;
    expect(texto).toContain("Quedan 8 clases");
    expect(texto).toContain("vence en 30 días");
    expect(texto).toContain("• 8 clases — $800");
    expect(texto).toContain("• Ilimitado — $1,200");
    expect(texto).toContain("BBVA");
    expect(texto).toContain("012180001234567890");
    // No literal placeholders survive.
    for (const tok of ["{clases}", "{dias}", "{precios}", "{datos_pago}"]) {
      expect(texto).not.toContain(tok);
    }
  });

  it("does not break the recibo when cobro/paquetes are unconfigured ({datos_pago} blank)", async () => {
    fake = makeFake({
      paquetes: FINITO,
      // no paquetesList, no cobro → fmtPrecios "" + fmtDatosPago(null)
      plantillas: [{ id: "t1", nombre: "Recibo", body: "Hola {nombre}.{datos_pago}{precios}" }],
    });

    const res = await crearVenta(input({ mode: "new" }), fake.client);
    expect(res.mensajes[0].texto).toBe("Hola Andrea."); // empty tokens render to nothing
  });
});
