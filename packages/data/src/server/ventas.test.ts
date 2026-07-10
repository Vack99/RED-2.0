import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { crearVenta, crearVentaSchema } from "./ventas";
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
      limit: () => b,
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
        // Slice #25: getOperatorGym's membership + gym lookups — default to
        // Forge's real zone, matching the shared supabase-fake.test-helper.
        case "gym_membership":
          return builder({ gym_id: "test-gym" }, []);
        case "gym":
          return builder({ timezone: "America/Chihuahua" }, []);
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

// The schema's INPUT type (pre-transform: plain-string ids) — crearVenta takes
// raw `unknown` and parses, branding the ids itself, so tests build raw input.
type RawVentaInput = z.input<typeof crearVentaSchema>;

const input = (over: Partial<RawVentaInput> = {}): RawVentaInput =>
  ({
    mode: "new",
    nuevoNombre: "Andrea Castro",
    nuevoTel: "614 218 3401",
    paqueteId: "p1",
    metodo: "efectivo",
    ...over,
  }) as RawVentaInput;

const lastRpc = (f: FakeClient) => f.rpcCalls.at(-1)!;

describe("crearVenta — write orchestration (injected fake)", () => {
  let fake: FakeClient;

  beforeEach(() => {
    fake = makeFake({ paquetes: ILIMITADO, plantillas: [{ id: "t1", nombre: "Recibo", body: "Hola {nombre}" }] });
  });

  it("sends only identity + paquete_id + metodo + an idempotency key for a new client (C13 re-derivation)", async () => {
    await crearVenta(input({ mode: "new" }), fake.client);

    const { name, args } = lastRpc(fake);
    expect(name).toBe("registrar_venta");

    // Ruling C13: client-computed saldo / price / vence are GONE — the RPC re-derives
    // them from the paquete row. The client sends only identity + paquete_id + metodo
    // + an idempotency key (C6).
    expect(args).not.toHaveProperty("p_cliente_id"); // new client → no id
    expect(args).not.toHaveProperty("p_clases_restantes");
    expect(args).not.toHaveProperty("p_monto");
    expect(args).not.toHaveProperty("p_vence");
    expect(args).not.toHaveProperty("p_email"); // none provided (spread-guard)

    expect(Object.keys(args).sort()).toEqual(
      ["p_idempotency_key", "p_metodo", "p_nombre", "p_paquete_id", "p_tel"].sort(),
    );
    expect(typeof args.p_idempotency_key).toBe("string"); // a fresh key per sale
  });

  it("sends p_cliente_id + paquete_id (no client saldo) for an existing-client sale", async () => {
    fake = makeFake({
      paquetes: FINITO,
      clientes: { id: "cli-1", nombre: "Andrea", tel: "614 000 0000", clases_restantes: 2, vence: "2020-01-01" },
      plantillas: [{ id: "t1", nombre: "Recibo", body: "Hola {nombre}" }],
    });

    await crearVenta(input({ mode: "existing", clienteId: "cli-1" }), fake.client);

    const { args } = lastRpc(fake);
    expect(args).toHaveProperty("p_cliente_id", "cli-1");
    expect(args).toHaveProperty("p_paquete_id", "p1");
    expect(args).toHaveProperty("p_metodo", "efectivo");
    // The RPC re-derives the stack in a locked txn — no saldo crosses the boundary.
    expect(args).not.toHaveProperty("p_clases_restantes");
    expect(args).not.toHaveProperty("p_clases");
    expect(args).not.toHaveProperty("p_vigencia_dias");
  });

  it("sends a new finite client's identity + paquete_id only (empty-base derivation now lives in the RPC)", async () => {
    fake = makeFake({ paquetes: FINITO, plantillas: [{ id: "t1", nombre: "Recibo", body: "x" }] });

    await crearVenta(input({ mode: "new" }), fake.client);

    // The wiring bug (a new finite buy must start from an EMPTY base, never conflated
    // with ilimitado) is now enforced structurally in registrar_venta + pinned by the
    // registrar_venta_stacking SQL suite. Here we only assert the payload shape.
    const { args } = lastRpc(fake);
    expect(args).toHaveProperty("p_paquete_id", "p1");
    expect(args).toHaveProperty("p_nombre", "Andrea Castro");
    expect(args).not.toHaveProperty("p_cliente_id");
    expect(args).not.toHaveProperty("p_clases_restantes");
  });

  // §3.4 — the optional email must NEVER block a sale. Forwarding a MALFORMED value proves it:
  // it is passed through as entered (it just won't match at claim time — the same harmless
  // outcome as omitting it), which also regression-guards against a `.email()` format check that
  // would throw a ZodError from the unguarded `crearVentaSchema.parse` and reject the whole sale.
  it("forwards the entered email as p_email without validating it (never blocks the sale)", async () => {
    await crearVenta(input({ mode: "new", nuevoEmail: "maria@" }), fake.client);
    expect(lastRpc(fake).args).toHaveProperty("p_email", "maria@");
  });

  it("omits p_email for a new client when no email is provided (spread-guard)", async () => {
    await crearVenta(input({ mode: "new" }), fake.client);
    expect(lastRpc(fake).args).not.toHaveProperty("p_email");
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
