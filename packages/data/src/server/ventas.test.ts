import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { crearVenta, crearVentaSchema, DuplicadoError, EMAIL_EN_USO_MSG, EmailEnUsoError } from "./ventas";
import type { SupabaseServer } from "./supabase";

/**
 * The seam this exercises: `crearVenta` takes an injectable client (ADR-0001,
 * audit cluster 4), so the write ORCHESTRATION — the arg-spread guard on the
 * `registrar_venta` args, the auth gate, the CLIENTE_DUPLICADO → DuplicadoError
 * surfacing — is testable with a hand-rolled fake. No supabase, no DB.
 *
 * Ruling C13/C6: the DAL sends ONLY identity + p_paquete_id + p_metodo + a
 * caller-supplied idempotency key. All money/saldo/vence math is re-derived
 * inside the RPC (pinned by the registrar_venta_stacking SQL suite); the recibo
 * reads the RPC's RETURNED clases_restantes/vence for display.
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
  /** Every table name passed to `.from(...)` — lets a test assert a table was
   *  (or was NOT) touched, e.g. a custom sale never reading `paquetes`. */
  fromCalls: string[];
  client: SupabaseServer;
}

/** The RPC's returned row shape (Task 4 contract). clases_restantes is NULL at
 *  runtime for ilimitado even though the generated type says `number`. */
const RPC_ROW = {
  folio: 1001,
  cliente_id: "cli-1",
  clases_restantes: 8,
  vence: "2026-12-31",
  paquete_nombre: "8 clases",
  monto: 800,
};

/**
 * Minimal fake satisfying exactly the chain `crearVenta` walks:
 * `.from(t).select().eq().single()`, `.maybeSingle()`, an awaitable `.select()`
 * (for plantillas), `.rpc(name, args).single()`, and `.auth.getClaims()`. The rpc
 * result is configurable so the CLIENTE_DUPLICADO path (an rpc `error`) is testable.
 */
function makeFake(
  rows: FakeRows,
  opts: { sub?: string | null; rpcData?: Record<string, unknown> | null; rpcError?: { message: string } } = {},
): FakeClient {
  const sub = opts.sub === undefined ? "op-1" : opts.sub;
  const rpcData = opts.rpcData === undefined ? RPC_ROW : opts.rpcData;
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const fromCalls: string[] = [];

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
      fromCalls.push(table);
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
      return {
        single: async () =>
          opts.rpcError ? { data: null, error: opts.rpcError } : { data: rpcData, error: null },
      };
    },
  };

  return { rpcCalls, fromCalls, client: client as unknown as SupabaseServer };
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

const KEY = "11111111-1111-4111-8111-111111111111";

const input = (over: Partial<RawVentaInput> = {}): RawVentaInput =>
  ({
    mode: "new",
    nuevoNombre: "Andrea Castro",
    nuevoTel: "614 218 3401",
    paquete: { tipo: "registrado", paqueteId: "p1" },
    metodo: "efectivo",
    idempotencyKey: KEY,
    ...over,
  }) as RawVentaInput;

const lastRpc = (f: FakeClient) => f.rpcCalls.at(-1)!;

describe("crearVenta — write orchestration (injected fake)", () => {
  let fake: FakeClient;

  beforeEach(() => {
    fake = makeFake({ paquetes: ILIMITADO, plantillas: [{ id: "t1", nombre: "Recibo", body: "Hola {nombre}" }] });
  });

  it("sends only identity + paquete_id + metodo + the idempotency key for a new client (C13 re-derivation)", async () => {
    await crearVenta(input({ mode: "new" }), fake.client);

    const { name, args } = lastRpc(fake);
    expect(name).toBe("registrar_venta");

    // Ruling C13: client-computed saldo / price / vence are GONE — the RPC re-derives
    // them. The client sends only identity + paquete_id + metodo + the idempotency key.
    expect(args).not.toHaveProperty("p_cliente_id"); // new client → no id
    expect(args).not.toHaveProperty("p_clases_restantes");
    expect(args).not.toHaveProperty("p_monto");
    expect(args).not.toHaveProperty("p_vence");
    expect(args).not.toHaveProperty("p_email"); // none provided (spread-guard)
    expect(args).not.toHaveProperty("p_forzar_nuevo"); // not overriding the dup guard

    expect(Object.keys(args).sort()).toEqual(
      ["p_idempotency_key", "p_metodo", "p_nombre", "p_paquete_id", "p_tel"].sort(),
    );
    expect(args.p_idempotency_key).toBe(KEY); // the caller's key, passed through
  });

  it("sends p_cliente_id + paquete_id (no client saldo) for an existing-client sale", async () => {
    fake = makeFake({
      paquetes: FINITO,
      clientes: { nombre: "Andrea", tel: "614 000 0000" },
      plantillas: [{ id: "t1", nombre: "Recibo", body: "Hola {nombre}" }],
    });

    await crearVenta(input({ mode: "existing", clienteId: "cli-1" }), fake.client);

    const { args } = lastRpc(fake);
    expect(args).toHaveProperty("p_cliente_id", "cli-1");
    expect(args).toHaveProperty("p_paquete_id", "p1");
    expect(args).toHaveProperty("p_metodo", "efectivo");
    // The RPC re-derives the stack in a locked txn — no saldo crosses the boundary.
    expect(args).not.toHaveProperty("p_clases_restantes");
    expect(args).not.toHaveProperty("p_vence");
  });

  it("sends a new finite client's identity + paquete_id only (empty-base derivation now lives in the RPC)", async () => {
    fake = makeFake({ paquetes: FINITO, plantillas: [{ id: "t1", nombre: "Recibo", body: "x" }] });

    await crearVenta(input({ mode: "new" }), fake.client);

    const { args } = lastRpc(fake);
    expect(args).toHaveProperty("p_paquete_id", "p1");
    expect(args).toHaveProperty("p_nombre", "Andrea Castro");
    expect(args).not.toHaveProperty("p_cliente_id");
    expect(args).not.toHaveProperty("p_clases_restantes");
  });

  it("passes the caller's idempotency key through unchanged, and a replay reuses the SAME key", async () => {
    const raw = input({ mode: "new", idempotencyKey: "abcabc00-0000-4000-8000-000000000001" });
    await crearVenta(raw, fake.client);
    await crearVenta(raw, fake.client); // a retry after an error keeps the same key — the point of C6

    expect(fake.rpcCalls).toHaveLength(2);
    expect(fake.rpcCalls[0].args.p_idempotency_key).toBe("abcabc00-0000-4000-8000-000000000001");
    expect(fake.rpcCalls[1].args.p_idempotency_key).toBe("abcabc00-0000-4000-8000-000000000001");
  });

  it("forwards p_forzar_nuevo only when the operator overrides the duplicate guard (D2)", async () => {
    await crearVenta(input({ mode: "new", forzarNuevo: true }), fake.client);
    expect(lastRpc(fake).args).toHaveProperty("p_forzar_nuevo", true);
  });

  it("surfaces the RPC's CLIENTE_DUPLICADO raise as DuplicadoError carrying the existing id (D2)", async () => {
    fake = makeFake(
      { paquetes: FINITO, plantillas: [{ id: "t1", nombre: "Recibo", body: "x" }] },
      { rpcError: { message: "CLIENTE_DUPLICADO:cli-existing-9" } },
    );

    const err = await crearVenta(input({ mode: "new" }), fake.client).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DuplicadoError);
    expect((err as DuplicadoError).existingId).toBe("cli-existing-9");
  });

  it("surfaces the RPC's backfill-email collision as EmailEnUsoError carrying the exact V13-pinned message (C7)", async () => {
    fake = makeFake(
      {
        paquetes: FINITO,
        clientes: { nombre: "Andrea", tel: "614 000 0000" },
        plantillas: [{ id: "t1", nombre: "Recibo", body: "x" }],
      },
      { rpcError: { message: EMAIL_EN_USO_MSG } },
    );

    const err = await crearVenta(
      input({ mode: "existing", clienteId: "cli-1", email: "otra@x.mx" }),
      fake.client,
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EmailEnUsoError);
    expect((err as Error).message).toBe("Este correo ya pertenece a otro registro de este gym");
  });

  it("rejects metodo 'pendiente' at schema parse — Por pagar is removed (C2)", () => {
    expect(() =>
      crearVentaSchema.parse({
        mode: "new",
        nuevoNombre: "Andrea Castro",
        nuevoTel: "614 218 3401",
        paquete: { tipo: "registrado", paqueteId: "p1" },
        metodo: "pendiente",
        idempotencyKey: KEY,
      } as unknown),
    ).toThrow();
  });

  // §3.4 — the optional email must NEVER block a sale. Forwarding a MALFORMED value proves it:
  // it is passed through as entered (it just won't match at claim time — the same harmless
  // outcome as omitting it), which also regression-guards against a `.email()` format check that
  // would throw a ZodError from the unguarded `crearVentaSchema.parse` and reject the whole sale.
  it("forwards the entered email as p_email without validating it (never blocks the sale)", async () => {
    await crearVenta(input({ mode: "new", email: "maria@" }), fake.client);
    expect(lastRpc(fake).args).toHaveProperty("p_email", "maria@");
  });

  it("forwards the entered email as p_email in existing mode too (C7 backfill on renewal)", async () => {
    fake = makeFake({
      paquetes: FINITO,
      clientes: { nombre: "Andrea", tel: "614 000 0000" },
      plantillas: [{ id: "t1", nombre: "Recibo", body: "x" }],
    });
    await crearVenta(input({ mode: "existing", clienteId: "cli-1", email: "nuevo@correo.mx" }), fake.client);
    expect(lastRpc(fake).args).toHaveProperty("p_email", "nuevo@correo.mx");
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
      paquetes: FINITO,
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
    // clases/dias come from the RPC's RETURNED clases_restantes/vence (RPC_ROW), not client math.
    expect(texto).toContain("Quedan 8 clases");
    expect(texto).toMatch(/vence en \d+ días/);
    expect(texto).toContain("• 8 clases — $800");
    expect(texto).toContain("• Ilimitado — $1,200");
    expect(texto).toContain("BBVA");
    expect(texto).toContain("012180001234567890");
    // No literal placeholders survive.
    for (const tok of ["{clases}", "{dias}", "{precios}", "{datos_pago}"]) {
      expect(texto).not.toContain(tok);
    }
  });

  it("maps a null RPC clases_restantes to Ilimitado in the recibo ctx (ilimitado renewal)", async () => {
    fake = makeFake(
      { paquetes: ILIMITADO, plantillas: [{ id: "t1", nombre: "Recibo", body: "Quedan {clases}" }] },
      { rpcData: { ...RPC_ROW, clases_restantes: null, paquete_nombre: "Ilimitado" } },
    );

    const res = await crearVenta(input({ mode: "new" }), fake.client);
    expect(res.mensajes[0].texto).toBe("Quedan clases ilimitadas"); // fmtClases("ilimitado")
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

describe("crearVenta — paquete personalizado", () => {
  it("rejects a custom package whose price is out of bounds", async () => {
    await expect(
      crearVenta({
        mode: "new",
        nuevoNombre: "Ana Ruiz",
        nuevoTel: "6141234567",
        paquete: { tipo: "personalizado", nombre: "Promo Verano", precio: 0, clases: 12, dias: 45 },
        metodo: "efectivo",
        idempotencyKey: KEY,
      }),
    ).rejects.toThrow();
  });

  it("rejects a custom package name shorter than 3 characters", async () => {
    await expect(
      crearVenta({
        mode: "new",
        nuevoNombre: "Ana Ruiz",
        nuevoTel: "6141234567",
        paquete: { tipo: "personalizado", nombre: "ab", precio: 750, clases: 12, dias: 45 },
        metodo: "efectivo",
        idempotencyKey: KEY,
      }),
    ).rejects.toThrow();
  });

  describe("a custom sale with an unlimited class grant", () => {
    let fake: FakeClient;
    let res: Awaited<ReturnType<typeof crearVenta>>;

    beforeEach(async () => {
      fake = makeFake(
        { plantillas: [{ id: "t1", nombre: "Recibo", body: "Hola {nombre}" }] },
        {
          rpcData: {
            folio: 1042,
            cliente_id: "c-1",
            clases_restantes: null,
            vence: "2026-08-25",
            paquete_nombre: "Promo Verano",
            monto: 750,
          },
        },
      );
      res = await crearVenta(
        input({
          paquete: { tipo: "personalizado", nombre: "Promo Verano", precio: 750, clases: null, dias: 45 },
        }),
        fake.client,
      );
    });

    it("sends the custom args to the RPC and derives ilimitado from a null class grant", () => {
      const { args } = lastRpc(fake);
      expect(args).toMatchObject({
        p_custom_nombre: "Promo Verano",
        p_custom_precio: 750,
        p_custom_ilimitado: true,
        p_custom_dias: 45,
      });
      expect(args.p_custom_clases).toBeUndefined();
      expect(args.p_paquete_id).toBeUndefined();
    });

    it("composes the recibo package block from the typed values — there is no paquetes row to read", () => {
      // The trap: a custom sale has no `paquetes` row. `undefined días` or a thrown
      // "Paquete no encontrado" both mean the receipt fell back to the row-read path.
      expect(res.paquete).toEqual({ nombre: "Promo Verano", vigencia: "45 días", precio: 750 });
    });

    it("skips the paquetes single-row display lookup for a custom sale", () => {
      // getPaquetes still reads the catalog for the recibo's {precios} token
      // (unconditional, independent of this sale's own package) — but the per-sale
      // `.eq(id).single()` display read this task makes conditional must not fire.
      expect(fake.fromCalls.filter((t) => t === "paquetes")).toHaveLength(1);
    });
  });

  it("still sends p_paquete_id for a registered plan", async () => {
    const fake = makeFake({ paquetes: FINITO, plantillas: [{ id: "t1", nombre: "Recibo", body: "x" }] });

    await crearVenta(input({ paquete: { tipo: "registrado", paqueteId: "p-1" } }), fake.client);

    const { args } = lastRpc(fake);
    expect(args.p_paquete_id).toBe("p-1");
    expect(args.p_custom_nombre).toBeUndefined();
  });
});
