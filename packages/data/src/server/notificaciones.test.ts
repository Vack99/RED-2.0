import { describe, expect, it } from "vitest";

import { setNotificaciones } from "./notificaciones";
import type { SupabaseServer } from "./supabase";

/**
 * The notifications-preference seam takes an injectable client (ADR-0001), so its
 * orchestration — the boolean guard, the exact set_notificaciones payload, and the
 * typed ok/error mapping — is testable with a hand-rolled fake. The toggle's self-pin
 * + single-column write are proven against the real schema in
 * supabase/tests/notificaciones_toggle.sql.
 */
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

describe("setNotificaciones", () => {
  it("sends the exact set_notificaciones payload and maps the returned flag", async () => {
    const { client, calls } = makeFake(() => ({ data: false, error: null }));
    const result = await setNotificaciones(false, client);
    expect(result).toEqual({ ok: true, activadas: false });
    expect(calls).toEqual([{ name: "set_notificaciones", args: { p_enabled: false } }]);
  });

  it("maps the enabled path through as activadas true", async () => {
    const { client, calls } = makeFake(() => ({ data: true, error: null }));
    const result = await setNotificaciones(true, client);
    expect(result).toEqual({ ok: true, activadas: true });
    expect(calls).toEqual([{ name: "set_notificaciones", args: { p_enabled: true } }]);
  });

  it("surfaces the RPC raise message verbatim", async () => {
    const { client } = makeFake(() => ({ data: null, error: { message: "No autenticado" } }));
    const result = await setNotificaciones(true, client);
    expect(result).toEqual({ ok: false, error: "No autenticado" });
  });

  it("rejects a non-boolean before any RPC call", async () => {
    const { client, calls } = makeFake(() => ({ data: null, error: null }));
    const result = await setNotificaciones("nope", client);
    expect(result).toEqual({ ok: false, error: "Preferencia inválida" });
    expect(calls).toHaveLength(0);
  });
});
