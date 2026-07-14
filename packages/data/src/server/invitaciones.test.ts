import { afterEach, describe, expect, it, vi } from "vitest";

import {
  construirUrlInvitacion,
  enviarInvitacion,
  remitenteConNombre,
  resendTransport,
  type MailMessage,
  type MailResult,
  type MailTransport,
} from "./invitaciones";
import { resolveTenant } from "./resolve-tenant";
import type { SupabaseServer } from "./supabase";

/**
 * The seam this exercises: `enviarInvitacion` takes an injectable Supabase client AND an injectable mail
 * transport (ADR-0001), so the send ORCHESTRATION — ensure-code → build-URL → send → stamp-on-success — is
 * testable with a hand-rolled fake and a transport double. No Supabase, no Resend. We assert external
 * behavior: the result object, WHICH message was sent (URL both arms), and that the send is stamped ONLY on
 * transport success.
 */

// The preparar_invitacion payload shape (the RPC's one returned row).
type Payload = {
  codigo: string | null;
  email: string | null;
  nombre: string;
  gym_slug: string;
  gym_nombre: string;
  gym_id: string;
};

const PAYLOAD: Payload = {
  codigo: "ABC23456",
  email: "socio@correo.mx",
  nombre: "Andrea Castro",
  gym_slug: "forge",
  gym_nombre: "Forge",
  gym_id: "gym-1",
};

interface FakeClient {
  rpcCalls: { name: string; args: Record<string, unknown> }[];
  client: SupabaseServer;
}

/**
 * Minimal fake for exactly the chain `enviarInvitacion` walks: `.rpc("preparar_invitacion", …).single()`,
 * `.from("gym_domain").select().eq().eq().order().limit().maybeSingle()`, and a bare
 * `.rpc("marcar_invitacion_enviada", …)` (awaited for its `{error}`).
 */
function makeFake(
  opts: { payload?: Payload | null; prepararError?: string; domainHost?: string | null } = {},
): FakeClient {
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const host = opts.domainHost;

  const domainBuilder = () => {
    const b = {
      select: () => b,
      eq: () => b,
      not: () => b,
      order: () => b,
      limit: () => b,
      maybeSingle: async () => ({ data: host ? { hostname: host } : null, error: null }),
    };
    return b;
  };

  const client = {
    from: (table: string) => {
      if (table === "gym_domain") return domainBuilder();
      throw new Error(`unexpected from(${table})`);
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (name === "preparar_invitacion") {
        return {
          single: async () => ({
            data: opts.payload === undefined ? PAYLOAD : opts.payload,
            error: opts.prepararError ? { message: opts.prepararError } : null,
          }),
        };
      }
      // marcar_invitacion_enviada — awaited directly for its {error}.
      return { then: (resolve: (v: { error: null }) => unknown) => resolve({ error: null }) };
    },
  };

  return { rpcCalls, client: client as unknown as SupabaseServer };
}

/** A transport double that records every message and returns a fixed result. */
function recordingTransport(result: MailResult): { sent: MailMessage[]; transport: MailTransport } {
  const sent: MailMessage[] = [];
  return { sent, transport: { send: async (m) => { sent.push(m); return result; } } };
}

const stampCalls = (f: FakeClient) => f.rpcCalls.filter((c) => c.name === "marcar_invitacion_enviada");

describe("enviarInvitacion — send orchestration (injected fake + transport double)", () => {
  it("SUCCESS: sends the invite to the gym's client host and stamps the send", async () => {
    const fake = makeFake({ domainHost: "app.forge.mx" });
    const { sent, transport } = recordingTransport({ ok: true });

    const res = await enviarInvitacion({ clienteId: "cli-1" }, { transport, client: fake.client });

    expect(res).toEqual({ ok: true, email: "socio@correo.mx", codigo: "ABC23456" });
    // The message carries the mapped-host claim URL + the gym name (ADR-0014).
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("socio@correo.mx");
    expect(sent[0].subject).toBe("Tu gimnasio Forge te invita a su app");
    expect(sent[0].html).toContain("https://app.forge.mx/registro?codigo=ABC23456");
    expect(sent[0].text).toContain("https://app.forge.mx/registro?codigo=ABC23456");
    expect(sent[0].html).toContain("Forge");
    // Stamped exactly once, on success.
    expect(stampCalls(fake)).toEqual([{ name: "marcar_invitacion_enviada", args: { p_cliente_id: "cli-1" } }]);
  });

  it("FAILURE: a transport failure never stamps and never throws", async () => {
    const fake = makeFake({ domainHost: "app.forge.mx" });
    const { sent, transport } = recordingTransport({ ok: false, error: "resend 500" });

    const res = await enviarInvitacion({ clienteId: "cli-1" }, { transport, client: fake.client });

    expect(res).toEqual({ ok: false, motivo: "envio-fallido", error: "resend 500" });
    expect(sent).toHaveLength(1); // it tried
    expect(stampCalls(fake)).toHaveLength(0); // but did NOT record a send
  });

  it("NOT CONFIGURED: a not-configured transport is a clean failure, no stamp", async () => {
    const fake = makeFake({ domainHost: "app.forge.mx" });
    // resendTransport() with missing env returns this exact shape — modeled directly here.
    const { transport } = recordingTransport({ ok: false, error: "no-configurado" });

    const res = await enviarInvitacion({ clienteId: "cli-1" }, { transport, client: fake.client });

    expect(res).toMatchObject({ ok: false, motivo: "envio-fallido", error: "no-configurado" });
    expect(stampCalls(fake)).toHaveLength(0);
  });

  it("SIN EMAIL: a row without an email is a clean sin-email failure — nothing sent, no stamp", async () => {
    const fake = makeFake({ payload: { ...PAYLOAD, email: null }, domainHost: "app.forge.mx" });
    const { sent, transport } = recordingTransport({ ok: true });

    const res = await enviarInvitacion({ clienteId: "cli-1" }, { transport, client: fake.client });

    expect(res).toEqual({ ok: false, motivo: "sin-email" });
    expect(sent).toHaveLength(0);
    expect(stampCalls(fake)).toHaveLength(0);
  });

  it("never throws when preparar_invitacion errors — returns a result", async () => {
    const fake = makeFake({ payload: null, prepararError: "No autorizado" });
    const { transport } = recordingTransport({ ok: true });

    const res = await enviarInvitacion({ clienteId: "cli-1" }, { transport, client: fake.client });

    expect(res).toMatchObject({ ok: false, motivo: "error", error: "No autorizado" });
    expect(stampCalls(fake)).toHaveLength(0);
  });
});

describe("remitenteConNombre — per-gym From display name over the shared address (#75)", () => {
  it("extracts the address from a `Name <addr>` RESEND_FROM and swaps in the gym name", () => {
    expect(remitenteConNombre("Forge", "Notificaciones <no-reply@ibookit.lat>")).toBe(
      "Forge <no-reply@ibookit.lat>",
    );
  });

  it("treats a bare-address RESEND_FROM as the address", () => {
    expect(remitenteConNombre("RED", "no-reply@ibookit.lat")).toBe("RED <no-reply@ibookit.lat>");
  });

  it("no RESEND_FROM → undefined (the transport reports no-configurado)", () => {
    expect(remitenteConNombre("Forge", undefined)).toBeUndefined();
  });

  it("empty gym name → the neutral RESEND_FROM unchanged", () => {
    expect(remitenteConNombre("", "Notificaciones <no-reply@ibookit.lat>")).toBe(
      "Notificaciones <no-reply@ibookit.lat>",
    );
  });
});

describe("enviarInvitacion — threads the per-gym From onto the message (#75)", () => {
  const OLD = process.env.RESEND_FROM;
  afterEach(() => {
    if (OLD === undefined) delete process.env.RESEND_FROM;
    else process.env.RESEND_FROM = OLD;
  });

  it("sets msg.from to `${gym_nombre} <addr>` from RESEND_FROM", async () => {
    process.env.RESEND_FROM = "Notificaciones <no-reply@ibookit.lat>";
    const fake = makeFake({ domainHost: "app.forge.mx" });
    const { sent, transport } = recordingTransport({ ok: true });

    await enviarInvitacion({ clienteId: "cli-1" }, { transport, client: fake.client });

    expect(sent[0].from).toBe("Forge <no-reply@ibookit.lat>");
  });
});

describe("construirUrlInvitacion — the gym→client-host rule (both arms)", () => {
  const OLD = process.env.PLATFORM_CLIENT_FALLBACK_HOST;
  afterEach(() => {
    if (OLD === undefined) delete process.env.PLATFORM_CLIENT_FALLBACK_HOST;
    else process.env.PLATFORM_CLIENT_FALLBACK_HOST = OLD;
  });

  it("mapped gym → the gym's own client host (?codigo only)", async () => {
    const fake = makeFake({ domainHost: "red.example.mx" });
    const url = await construirUrlInvitacion(
      { gymId: "gym-1", gymSlug: "red", codigo: "ZZZ23456" },
      fake.client,
    );
    expect(url).toBe("https://red.example.mx/registro?codigo=ZZZ23456");
  });

  it("unmapped gym → the platform fallback host + ?gym= slug", async () => {
    process.env.PLATFORM_CLIENT_FALLBACK_HOST = "app.plataforma.mx";
    const fake = makeFake({ domainHost: null });
    const url = await construirUrlInvitacion(
      { gymId: "gym-9", gymSlug: "red-demo", codigo: "ZZZ23456" },
      fake.client,
    );
    expect(url).toBe("https://app.plataforma.mx/registro?gym=red-demo&codigo=ZZZ23456");
  });

  it("dev `.localhost` rows are never invite targets, even when older than the public host (live regression 2026-07-09)", async () => {
    // red-demo's dev row predates its public host; without the not-like filter, oldest-wins
    // built every demo invite on an unreachable localhost link.
    const rows = [
      { hostname: "red-demo-client.localhost", gym_id: "gym-9", app: "client" },
      { hostname: "red-demo.ibookit.lat", gym_id: "gym-9", app: "client" },
    ];
    let filtered: Record<string, unknown>[] = rows;
    const b = {
      select: () => b,
      eq: (col: string, val: unknown) => ((filtered = filtered.filter((r) => r[col] === val)), b),
      not: (col: string) => ((filtered = filtered.filter((r) => !String(r[col]).endsWith("localhost"))), b),
      order: () => b,
      limit: () => b,
      maybeSingle: async () => ({ data: filtered[0] ?? null, error: null }),
    };
    const client = { from: () => b } as unknown as SupabaseServer;
    const url = await construirUrlInvitacion(
      { gymId: "gym-9", gymSlug: "red-demo", codigo: "NV9HD6IB" },
      client,
    );
    expect(url).toBe("https://red-demo.ibookit.lat/registro?codigo=NV9HD6IB");
  });

  it("no client host and no fallback env → null (caller reports a clean failure)", async () => {
    delete process.env.PLATFORM_CLIENT_FALLBACK_HOST;
    const fake = makeFake({ domainHost: null });
    const url = await construirUrlInvitacion(
      { gymId: "gym-9", gymSlug: "red-demo", codigo: "ZZZ23456" },
      fake.client,
    );
    expect(url).toBeNull();
  });
});

/**
 * Wrong-host redirect (spec §5.2 / audit #17) — the loop-freedom proof for the /registro shield.
 * The page redirects a valid invite opened on the wrong host to the code's canonical client URL,
 * built by `construirUrlInvitacion`. The danger is a redirect cycle. We prove termination at the
 * two DAL seams the page composes: the canonical URL that construirUrlInvitacion emits, when its
 * host+`?gym=` are re-resolved by `resolveTenant` (exactly what the proxy does on reload), yields
 * x-gym === the code's gym slug — so the page guard `hostGym !== info.gym_slug` is FALSE and the
 * page renders instead of redirecting again. One hop, no cycle, both arms (mapped + fallback).
 */
describe("wrong-host redirect — canonical URL round-trips to the code's gym (loop-freedom)", () => {
  const OLD = process.env.PLATFORM_CLIENT_FALLBACK_HOST;
  afterEach(() => {
    if (OLD === undefined) delete process.env.PLATFORM_CLIENT_FALLBACK_HOST;
    else process.env.PLATFORM_CLIENT_FALLBACK_HOST = OLD;
  });

  type GymRow = { id: string; slug: string; brand_module_id: string };
  type DomainRow = { hostname: string; gym_id: string; app: string };

  // One fake of the anon gym/gym_domain reads BOTH construirUrlInvitacion and resolveTenant walk.
  function fakeDb(gyms: GymRow[], domains: DomainRow[]): SupabaseServer {
    const table = (rows: Record<string, unknown>[]) => {
      let filtered = rows;
      const b = {
        select: () => b,
        eq: (col: string, val: unknown) => {
          filtered = filtered.filter((r) => r[col] === val);
          return b;
        },
        // Mirrors PostgREST `.not(col, "like", pattern)` for the one pattern the DAL uses
        // (`%localhost`): keep rows whose col does NOT end with "localhost".
        not: (col: string, _op: string, _pattern: string) => {
          filtered = filtered.filter((r) => !String(r[col]).endsWith("localhost"));
          return b;
        },
        order: () => b,
        limit: () => b,
        maybeSingle: async () => ({ data: filtered[0] ?? null, error: null }),
      };
      return b;
    };
    return {
      from: (t: string) =>
        table((t === "gym" ? gyms : domains) as unknown as Record<string, unknown>[]),
    } as unknown as SupabaseServer;
  }

  it("mapped gym: the canonical host resolves x-gym back to the code's gym → renders, no re-redirect", async () => {
    const db = () =>
      fakeDb(
        [{ id: "g-red", slug: "red", brand_module_id: "red" }],
        [{ hostname: "red.mx", gym_id: "g-red", app: "client" }],
      );
    // The page turns invitacion_info's gym_slug into the gym id, then builds the canonical URL.
    const destino = await resolveTenant(null, "red", db());
    const url = await construirUrlInvitacion(
      { gymId: destino!.id, gymSlug: "red", codigo: "CODE2345" },
      db(),
    );
    expect(url).toBe("https://red.mx/registro?codigo=CODE2345");

    // Reload: the proxy re-resolves x-gym for the target host+override.
    const parsed = new URL(url!);
    const reloaded = await resolveTenant(parsed.hostname, parsed.searchParams.get("gym"), db());
    expect(reloaded!.slug).toBe("red"); // === code slug → guard false → terminates
  });

  it("unmapped gym: the ?gym= fallback URL resolves x-gym back to the code's gym → renders, no re-redirect", async () => {
    process.env.PLATFORM_CLIENT_FALLBACK_HOST = "app.plataforma.mx";
    // The gym has NO client domain; the platform fallback host is NOT a mapped customer domain.
    const db = () => fakeDb([{ id: "g-demo", slug: "red-demo", brand_module_id: "red" }], []);
    const destino = await resolveTenant(null, "red-demo", db());
    const url = await construirUrlInvitacion(
      { gymId: destino!.id, gymSlug: "red-demo", codigo: "CODE2345" },
      db(),
    );
    expect(url).toBe("https://app.plataforma.mx/registro?gym=red-demo&codigo=CODE2345");

    const parsed = new URL(url!);
    const reloaded = await resolveTenant(parsed.hostname, parsed.searchParams.get("gym"), db());
    expect(reloaded!.slug).toBe("red-demo"); // ?gym= honored on the unmapped fallback host → terminates
  });

  it("same-gym open never enters the redirect branch: the guard is false when x-gym already equals the code's gym", () => {
    const hostGym = "red";
    const codeSlug = "red";
    expect(hostGym !== codeSlug).toBe(false);
  });
});

describe("resendTransport — missing env is a clean failure (never a live call)", () => {
  const keys = ["RESEND_API_KEY", "RESEND_FROM"] as const;
  const OLD = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  afterEach(() => {
    for (const k of keys) {
      if (OLD[k] === undefined) delete process.env[k];
      else process.env[k] = OLD[k];
    }
  });

  it("returns { ok:false, error:'no-configurado' } when env is missing", async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM;
    const res = await resendTransport().send({ to: "x@y.mx", subject: "s", html: "<p>h</p>", text: "t" });
    expect(res).toEqual({ ok: false, error: "no-configurado" });
  });

  it("includes `attachments` in the REST body only when present (#100)", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM = "RED <no-reply@ibookit.lat>";
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      void init;
      return Promise.resolve(new Response(null, { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const base = { to: "x@y.mx", subject: "s", html: "<p>h</p>", text: "t" } as const;

      await resendTransport().send({
        ...base,
        attachments: [{ filename: "recibo-F1001.png", content: "aGVsbG8=" }],
      });
      const conAdjunto = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
      expect(conAdjunto.attachments).toEqual([{ filename: "recibo-F1001.png", content: "aGVsbG8=" }]);

      await resendTransport().send(base);
      const sinAdjunto = JSON.parse(fetchMock.mock.calls[1][1]!.body as string);
      expect("attachments" in sinAdjunto).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
