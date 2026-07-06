import { describe, expect, it } from "vitest";

import { cancelarReserva, reservarClase } from "./reservas";
import type { SupabaseServer } from "./supabase";

/**
 * The booking DAL seam takes an injectable client (ADR-0001), so its orchestration —
 * the zod session-id guard, the exact reservar_clase payload, and the typed
 * ok/error mapping (RPC raise → member-facing message) — is testable with a
 * hand-rolled fake. The RPC's money math itself is proven against the real schema in
 * supabase/tests/reservar_clase_rules.sql.
 */

const UUID = "11111111-1111-4111-8111-111111111111";

function makeFake(rpc: (name: string, args: Record<string, unknown>) => { data: unknown; error: unknown }) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const client = {
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return Promise.resolve(rpc(name, args));
    },
  };
  return { client: client as unknown as SupabaseServer, calls };
}

describe("reservarClase", () => {
  it("sends the exact reservar_clase payload and maps the returned row (finite)", async () => {
    const { client, calls } = makeFake(() => ({
      data: [{ reservation_id: "res-1", clases_restantes: 4 }],
      error: null,
    }));
    const result = await reservarClase(UUID, client);
    expect(result).toEqual({ ok: true, reservationId: "res-1", clasesRestantes: 4 });
    expect(calls).toEqual([{ name: "reservar_clase", args: { p_session_id: UUID } }]);
  });

  it("maps a NULL balance (ilimitado) through as clasesRestantes null", async () => {
    const { client } = makeFake(() => ({
      data: [{ reservation_id: "res-2", clases_restantes: null }],
      error: null,
    }));
    const result = await reservarClase(UUID, client);
    expect(result).toEqual({ ok: true, reservationId: "res-2", clasesRestantes: null });
  });

  it("surfaces the RPC raise message verbatim (e.g. capacity block)", async () => {
    const { client } = makeFake(() => ({ data: null, error: { message: "Clase llena" } }));
    const result = await reservarClase(UUID, client);
    expect(result).toEqual({ ok: false, error: "Clase llena" });
  });

  it("rejects a non-uuid session id before any RPC call", async () => {
    const { client, calls } = makeFake(() => ({ data: null, error: null }));
    const result = await reservarClase("nope", client);
    expect(result).toEqual({ ok: false, error: "Sesión inválida" });
    expect(calls).toHaveLength(0);
  });

  it("returns a generic error when the RPC yields no row", async () => {
    const { client } = makeFake(() => ({ data: [], error: null }));
    const result = await reservarClase(UUID, client);
    expect(result).toEqual({ ok: false, error: "No se pudo reservar" });
  });
});

describe("cancelarReserva", () => {
  it("sends the exact cancelar_reserva payload and maps the refunded balance (finite)", async () => {
    const { client, calls } = makeFake(() => ({
      data: [{ reservation_id: "res-1", clases_restantes: 5 }],
      error: null,
    }));
    const result = await cancelarReserva(UUID, client);
    expect(result).toEqual({ ok: true, clasesRestantes: 5 });
    expect(calls).toEqual([{ name: "cancelar_reserva", args: { p_session_id: UUID } }]);
  });

  it("maps a NULL balance (ilimitado) through as clasesRestantes null", async () => {
    const { client } = makeFake(() => ({
      data: [{ reservation_id: "res-2", clases_restantes: null }],
      error: null,
    }));
    const result = await cancelarReserva(UUID, client);
    expect(result).toEqual({ ok: true, clasesRestantes: null });
  });

  it("surfaces the RPC raise message verbatim (e.g. after-start block)", async () => {
    const { client } = makeFake(() => ({ data: null, error: { message: "La clase ya comenzó" } }));
    const result = await cancelarReserva(UUID, client);
    expect(result).toEqual({ ok: false, error: "La clase ya comenzó" });
  });

  it("rejects a non-uuid session id before any RPC call", async () => {
    const { client, calls } = makeFake(() => ({ data: null, error: null }));
    const result = await cancelarReserva("nope", client);
    expect(result).toEqual({ ok: false, error: "Sesión inválida" });
    expect(calls).toHaveLength(0);
  });

  it("returns a generic error when the RPC yields no row", async () => {
    const { client } = makeFake(() => ({ data: [], error: null }));
    const result = await cancelarReserva(UUID, client);
    expect(result).toEqual({ ok: false, error: "No se pudo cancelar" });
  });
});
