import { describe, expect, it } from "vitest";

import { addDays, hoyEnZona, instanteEnZona, toIsoDay } from "@gym/format";

import {
  actualizarCliente,
  getClienteFicha,
  getClientesLite,
  getClientesRoster,
  getRosterResumen,
  reenviarInvitacion,
} from "./clientes";
import type { MailMessage, MailResult, MailTransport } from "./invitaciones";
import type { SupabaseServer } from "./supabase";
import { EMAIL_EN_USO_MSG, EmailEnUsoError } from "./ventas";

/**
 * The seam: `actualizarCliente` takes an injectable client (ADR-0001), so the write
 * orchestration — zod validation, the auth gate, and the exact actualizar_cliente RPC payload —
 * is testable with a hand-rolled fake. No supabase, no DB. The RPC itself is smoke-tested against
 * the real schema in supabase/tests/actualizar_cliente_email_rules.sql (ADR-0005).
 */
interface FakeClient {
  rpcCalls: { name: string; args: Record<string, unknown> }[];
  client: SupabaseServer;
}

/** `actualizar_cliente`'s row — defaults to "no change, unclaimed" (the common nombre/tel-only edit).
 *  `rpcError` makes the RPC return that error instead of a row (the collision-mapping path). */
function makeFake(
  opts: {
    sub?: string | null;
    row?: { email_changed: boolean; unclaimed: boolean };
    rpcError?: { message: string };
  } = {},
): FakeClient {
  const sub = opts.sub === undefined ? "op-1" : opts.sub;
  const row = opts.row ?? { email_changed: false, unclaimed: true };
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const client = {
    auth: {
      getClaims: async () => ({ data: sub ? { claims: { sub } } : null }),
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return {
        single: async () =>
          opts.rpcError ? { data: null, error: opts.rpcError } : { data: row, error: null },
      };
    },
  };
  return { rpcCalls, client: client as unknown as SupabaseServer };
}

const valid = {
  clienteId: "11111111-1111-4111-8111-111111111111", // valid v4 UUID (version/variant bits set)
  nombre: "Andrea Castro",
  tel: "614 218 3401",
};

describe("actualizarCliente — write orchestration (injected fake)", () => {
  it("sends the exact actualizar_cliente RPC payload (no email arm)", async () => {
    const fake = makeFake();
    await actualizarCliente(valid, fake.client);
    expect(fake.rpcCalls).toHaveLength(1);
    const { name, args } = fake.rpcCalls[0];
    expect(name).toBe("actualizar_cliente");
    expect(args).toEqual({
      p_cliente_id: "11111111-1111-4111-8111-111111111111",
      p_nombre: "Andrea Castro",
      p_tel: "614 218 3401",
    });
  });

  it("forwards p_email when a well-formed email is supplied", async () => {
    const fake = makeFake();
    await actualizarCliente({ ...valid, email: "socio@correo.mx" }, fake.client);
    expect(fake.rpcCalls[0].args).toMatchObject({ p_email: "socio@correo.mx" });
  });

  it("blank/whitespace-only email is 'no change' — never forwarded as ''", async () => {
    const fake = makeFake();
    await actualizarCliente({ ...valid, email: "   " }, fake.client);
    expect(fake.rpcCalls[0].args).not.toHaveProperty("p_email");
  });

  it("rejects a malformed email (zod .email()) before any write", async () => {
    const fake = makeFake();
    await expect(
      actualizarCliente({ ...valid, email: "no-arroba" }, fake.client),
    ).rejects.toThrow("Correo inválido");
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("rejects a too-short nombre (zod) before any write", async () => {
    const fake = makeFake();
    await expect(actualizarCliente({ ...valid, nombre: "Al" }, fake.client)).rejects.toThrow();
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("rejects an invalid (non-10-digit) tel before any write", async () => {
    const fake = makeFake();
    await expect(actualizarCliente({ ...valid, tel: "614 123" }, fake.client)).rejects.toThrow();
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("throws 'No autenticado' when getClaims returns no sub (requireOperator wired)", async () => {
    const fake = makeFake({ sub: null });
    await expect(actualizarCliente(valid, fake.client)).rejects.toThrow("No autenticado");
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("surfaces the RPC's email-collision raise as EmailEnUsoError (mirrors the vender path)", async () => {
    const fake = makeFake({ rpcError: { message: EMAIL_EN_USO_MSG } });
    const err = await actualizarCliente({ ...valid, email: "otra@x.mx" }, fake.client).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(EmailEnUsoError);
    expect((err as Error).message).toBe("Este correo ya pertenece a otro registro de este gym");
  });

  it("throws the generic error on any other RPC failure", async () => {
    const fake = makeFake({ rpcError: { message: "boom" } });
    await expect(actualizarCliente(valid, fake.client)).rejects.toThrow(
      "No se pudo actualizar el cliente",
    );
  });
});

/**
 * The invite-firing decision (issue #71 / design §3): `actualizarCliente` fires the SAME auto-invite
 * `enviarInvitacion` as the sale path, but ONLY when the RPC reports BOTH `email_changed` AND `unclaimed`
 * — never on an unchanged email, and never on a claimed row (the SQL guard also refuses that combination,
 * so `email_changed && !unclaimed` should not occur in practice; this proves the DAL respects the flags
 * regardless). A transport double is `enviarInvitacion`'s real second consumer (ADR-0001) — no test here
 * ever touches Resend.
 */
function makeInviteFake(row: { email_changed: boolean; unclaimed: boolean }): FakeClient {
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const client = {
    auth: { getClaims: async () => ({ data: { claims: { sub: "op-1" } } }) },
    from: (table: string) => {
      if (table !== "gym_domain") throw new Error(`unexpected from(${table})`);
      const b = {
        select: () => b,
        eq: () => b,
        not: () => b,
        order: () => b,
        limit: () => b,
        maybeSingle: async () => ({ data: { hostname: "app.forge.mx" }, error: null }),
      };
      return b;
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (name === "actualizar_cliente") return { single: async () => ({ data: row, error: null }) };
      if (name === "preparar_invitacion") {
        return {
          single: async () => ({
            data: {
              codigo: "ABC23456",
              email: "socio@correo.mx",
              nombre: "Andrea Castro",
              gym_slug: "forge",
              gym_nombre: "Forge",
              gym_id: "gym-1",
            },
            error: null,
          }),
        };
      }
      // marcar_invitacion_enviada
      return { then: (resolve: (v: { error: null }) => unknown) => resolve({ error: null }) };
    },
  };
  return { rpcCalls, client: client as unknown as SupabaseServer };
}

function recordingTransport(result: MailResult): { sent: MailMessage[]; transport: MailTransport } {
  const sent: MailMessage[] = [];
  return { sent, transport: { send: async (m) => { sent.push(m); return result; } } };
}

describe("actualizarCliente — auto-invite fires only on add/change + unclaimed", () => {
  it("email ADDED/CHANGED on an UNCLAIMED row -> fires the invite", async () => {
    const fake = makeInviteFake({ email_changed: true, unclaimed: true });
    const { sent, transport } = recordingTransport({ ok: true });

    const result = await actualizarCliente({ ...valid, email: "socio@correo.mx" }, fake.client, {
      transport,
    });

    expect(sent).toHaveLength(1);
    expect(result.invite).toEqual({ ok: true, email: "socio@correo.mx", codigo: "ABC23456" });
  });

  it("email UNCHANGED -> no invite, even though an email was supplied", async () => {
    const fake = makeInviteFake({ email_changed: false, unclaimed: true });
    const { sent, transport } = recordingTransport({ ok: true });

    const result = await actualizarCliente({ ...valid, email: "socio@correo.mx" }, fake.client, {
      transport,
    });

    expect(sent).toHaveLength(0);
    expect(result.invite).toBeNull();
    expect(fake.rpcCalls.map((c) => c.name)).not.toContain("preparar_invitacion");
  });

  it("row already CLAIMED -> no invite (the flags win even if email_changed were somehow true)", async () => {
    const fake = makeInviteFake({ email_changed: true, unclaimed: false });
    const { sent, transport } = recordingTransport({ ok: true });

    const result = await actualizarCliente({ ...valid, email: "socio@correo.mx" }, fake.client, {
      transport,
    });

    expect(sent).toHaveLength(0);
    expect(result.invite).toBeNull();
  });

  it("no email supplied at all -> no invite (nombre/tel-only edit)", async () => {
    const fake = makeInviteFake({ email_changed: false, unclaimed: true });
    const { sent, transport } = recordingTransport({ ok: true });

    const result = await actualizarCliente(valid, fake.client, { transport });

    expect(sent).toHaveLength(0);
    expect(result.invite).toBeNull();
  });

  it("a failed send is surfaced (never thrown) so the ficha can show a failure state", async () => {
    const fake = makeInviteFake({ email_changed: true, unclaimed: true });
    const { transport } = recordingTransport({ ok: false, error: "resend 500" });

    const result = await actualizarCliente({ ...valid, email: "socio@correo.mx" }, fake.client, {
      transport,
    });

    expect(result.invite).toEqual({ ok: false, motivo: "envio-fallido", error: "resend 500" });
  });
});

describe("reenviarInvitacion — REENVIAR re-sends the same code (injected fake + transport double)", () => {
  it("delegates to enviarInvitacion for the given clienteId", async () => {
    const fake = makeInviteFake({ email_changed: false, unclaimed: true });
    const { sent, transport } = recordingTransport({ ok: true });

    const result = await reenviarInvitacion("cli-desk", fake.client, { transport });

    expect(sent).toHaveLength(1);
    expect(result).toEqual({ ok: true, email: "socio@correo.mx", codigo: "ABC23456" });
    expect(fake.rpcCalls[0]).toEqual({
      name: "preparar_invitacion",
      args: { p_cliente_id: "cli-desk" },
    });
  });

  it("requires an operator session (requireOperator wired)", async () => {
    const rpcCalls: unknown[] = [];
    const client = {
      auth: { getClaims: async () => ({ data: null }) },
      rpc: (name: string, args: unknown) => {
        rpcCalls.push({ name, args });
        return { single: async () => ({ data: null, error: null }) };
      },
    } as unknown as SupabaseServer;

    await expect(reenviarInvitacion("cli-desk", client)).rejects.toThrow("No autenticado");
    expect(rpcCalls).toHaveLength(0);
  });
});

/**
 * The read seam: the roster/picker/dashboard readers take an injectable client
 * (ADR-0001). A hand-rolled query-builder fake captures every `.select()` string
 * and returns fixture rows, so we can prove the invite-state contract WITHOUT a DB:
 * the invite columns are selected and derived, and `claim_code` — a single-use bearer
 * credential (ADR-0015) — is NEVER selected into any query nor exposed on any DTO.
 */
interface Rows {
  clientes?: Record<string, unknown>[];
  gym_membership?: Record<string, unknown>[];
  gym?: Record<string, unknown>[];
  asistencias?: Record<string, unknown>[];
}

function makeReadFake(rows: Rows) {
  const selects: Record<string, string[]> = {};
  function builder(table: string, list: Record<string, unknown>[]) {
    let filtered = [...list];
    const b: Record<string, unknown> = {
      select: (cols: string) => {
        (selects[table] ??= []).push(cols);
        return b;
      },
      eq: (col: string, val: unknown) => {
        filtered = filtered.filter((r) => r[col] === val);
        return b;
      },
      in: (col: string, vals: unknown[]) => {
        filtered = filtered.filter((r) => vals.includes(r[col]));
        return b;
      },
      is: (col: string, val: unknown) => {
        filtered = filtered.filter((r) => r[col] === val);
        return b;
      },
      gte: () => b,
      order: () => b,
      limit: (n: number) => {
        filtered = filtered.slice(0, n);
        return b;
      },
      range: () => b,
      maybeSingle: () => Promise.resolve({ data: filtered[0] ?? null, error: null }),
      then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
        resolve({ data: filtered, error: null }),
    };
    return b;
  }
  const client = {
    auth: { getClaims: async () => ({ data: { claims: { sub: "op-1" } } }) },
    from: (table: string) => builder(table, rows[table as keyof Rows] ?? []),
  };
  return { selects, client: client as unknown as SupabaseServer };
}

// A live-shaped roster: one self-registered pending row (Door 2, no package) and one
// invited desk client with an active package. Both carry a claim_code the readers must
// never surface. `vence` is far future so the packaged row is deterministically active.
const FIXTURE_CLIENTES = [
  {
    id: "cli-online",
    gym_id: "g-1", // the readers are gym-scoped (spec §1.1) and this fake FILTERS .eq
    nombre: "Sofia Online",
    tel: "614 111 2222",
    paquete_nombre: null,
    clases_restantes: 0,
    vence: null,
    email: null,
    invitacion_enviada_at: null,
    auth_user_id: "auth-1",
    claim_code: "ABCD2345",
    // Self-registered, never charged: 0 ventas → primeraCompra true (#77).
    ventas: [{ count: 0 }],
  },
  {
    id: "cli-desk",
    gym_id: "g-1",
    nombre: "Ana Mostrador",
    tel: "614 333 4444",
    paquete_nombre: "8 clases",
    clases_restantes: 5,
    vence: "2099-12-31",
    email: "ana@mail.com",
    invitacion_enviada_at: "2026-07-08T03:00:00Z",
    auth_user_id: null,
    claim_code: "WXYZ6789",
    // Desk client with a sale on record → primeraCompra false.
    ventas: [{ count: 3 }],
  },
];

const OPERATOR_ROWS: Rows = {
  clientes: FIXTURE_CLIENTES,
  gym_membership: [{ gym_id: "g-1", role: "operator" }],
  gym: [{ id: "g-1", timezone: "America/Chihuahua" }],
  asistencias: [],
};

describe("invite-state readers — claim_code is never selected nor exposed", () => {
  it("getClientesRoster selects the invite columns, never claim_code, and derives the state", async () => {
    const fake = makeReadFake(OPERATOR_ROWS);
    const roster = await getClientesRoster(fake.client);

    const clientesSelect = fake.selects.clientes.join(" ");
    expect(clientesSelect).toContain("email");
    expect(clientesSelect).toContain("invitacion_enviada_at");
    expect(clientesSelect).toContain("auth_user_id");
    expect(clientesSelect).not.toContain("claim_code");
    // Nothing leaks the bearer credential onto the DTO, either.
    expect(JSON.stringify(roster)).not.toContain("claim_code");
    expect(JSON.stringify(roster)).not.toContain("ABCD2345");

    const online = roster.find((r) => r.id === "cli-online")!;
    expect(online.invitacion.estado).toBe("cuenta_activa");
    expect(online.invitacion.badge).toBe("Cuenta activa");
    expect(online.pendienteOnline).toBe(true);

    const desk = roster.find((r) => r.id === "cli-desk")!;
    expect(desk.invitacion.estado).toBe("invitacion_enviada");
    expect(desk.invitacion.badge).toBe("Invitada 7 jul"); // gym-local send date
    expect(desk.pendienteOnline).toBe(false);
  });

  it("getClientesLite carries email + invite badge for the picker, never claim_code", async () => {
    const fake = makeReadFake(OPERATOR_ROWS);
    const lite = await getClientesLite(fake.client);

    const clientesSelect = fake.selects.clientes.join(" ");
    expect(clientesSelect).not.toContain("claim_code");
    expect(clientesSelect).toContain("ventas(count)"); // primeraCompra embed (#77)
    expect(JSON.stringify(lite)).not.toContain("claim_code");

    const desk = lite.find((c) => c.id === "cli-desk")!;
    expect(desk.email).toBe("ana@mail.com"); // for the NUEVO soft duplicate warn
    expect(desk.invitacion.badge).toBe("Invitada 7 jul");
    expect(desk.primeraCompra).toBe(false); // 3 ventas on record

    const online = lite.find((c) => c.id === "cli-online")!;
    expect(online.primeraCompra).toBe(true); // never charged
  });

  it("getRosterResumen counts nuevosOnline (auth-linked, no active package)", async () => {
    const fake = makeReadFake(OPERATOR_ROWS);
    const resumen = await getRosterResumen(fake.client);
    expect(resumen.nuevosOnline).toBe(1); // only cli-online
    const clientesSelect = fake.selects.clientes.join(" ");
    expect(clientesSelect).not.toContain("claim_code");
  });
});

/**
 * C14: the clases gauge's `usadas` (attendedSincePurchase) must anchor at the venta
 * INSTANT, not just its gym-local calendar day. A check-in earlier the same day as a
 * renewal was already spent from the pre-renewal balance — counting it again against
 * the new package double-counts it. `getClienteFicha` needs a full fake (it touches
 * clientes/gym_membership/gym/asistencias/ventas + the best-effort perfil/plantillas/
 * paquetes/cobro reads), so this builds its own hand-rolled query-builder fake rather
 * than reusing makeReadFake's narrower Rows shape (ADR-0001 pattern, same discipline).
 */
describe("getClienteFicha — clases gauge anchors at the venta instant (C14)", () => {
  const TZ = "America/Chihuahua";

  // Fixtures are anchored to the REAL clock via the same helpers getClienteFicha
  // itself uses (hoyEnZona/instanteEnZona): the code computes its 30-day window
  // from `hoyEnZona(tz)` at run time, so a fixed calendar date would silently
  // migrate from the in-window branch to the head-count branch ~30 days after
  // being written. HOY_GYM = today's gym-local day; the venta is pinned at 12:00
  // gym-local so a before (09:00) / after (15:00) hora pair always exists.
  const HOY_GYM = hoyEnZona(TZ);
  const VENTA_DIA = toIsoDay(HOY_GYM);
  const VENTA_INSTANTE = instanteEnZona(HOY_GYM, "12:00", TZ).toISOString();
  // Deterministically OUTSIDE the 30-day window (head-count branch), same 12:00 anchor.
  const OLD_DIA_DATE = addDays(HOY_GYM, -60);
  const OLD_DIA = toIsoDay(OLD_DIA_DATE);
  const OLD_INSTANTE = instanteEnZona(OLD_DIA_DATE, "12:00", TZ).toISOString();

  const FICHA_CLIENTE = {
    id: "cli-ficha",
    nombre: "Diego Herrera",
    tel: "614 555 0100",
    paquete_nombre: "8 clases",
    clases_restantes: 5,
    vence: toIsoDay(addDays(HOY_GYM, 30)),
    created_at: "2026-01-01T00:00:00Z",
    email: null,
    invitacion_enviada_at: null,
    auth_user_id: null,
  };

  const FICHA_VENTA = {
    cliente_id: "cli-ficha",
    fecha: VENTA_INSTANTE,
    paquete_nombre: "8 clases",
    monto: 500,
    metodo: "efectivo",
    clases: 8,
    vigencia_tipo: "dias",
    vigencia_dias: 30,
  };

  function makeFichaFake(
    asistencias: Record<string, unknown>[],
    venta: Record<string, unknown> = FICHA_VENTA,
  ): { client: SupabaseServer; orCalls: string[] } {
    const orCalls: string[] = [];
    const rows: Record<string, Record<string, unknown>[]> = {
      clientes: [FICHA_CLIENTE],
      gym_membership: [{ gym_id: "g-1", role: "operator" }],
      gym: [{ id: "g-1", timezone: TZ }],
      asistencias,
      ventas: [venta],
      perfil: [],
      plantillas: [],
      paquetes: [],
      cobro: [],
    };

    function builder(table: string) {
      let filtered = [...(rows[table] ?? [])];
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (col: string, val: unknown) => {
          filtered = filtered.filter((r) => r[col] === val);
          return b;
        },
        in: (col: string, vals: unknown[]) => {
          filtered = filtered.filter((r) => vals.includes(r[col]));
          return b;
        },
        is: (col: string, val: unknown) => {
          filtered = filtered.filter((r) => r[col] === val);
          return b;
        },
        gte: (col: string, val: unknown) => {
          filtered = filtered.filter((r) => (r[col] as string) >= (val as string));
          return b;
        },
        // Records the filter string only (no row filtering): the head-count test
        // asserts the exact nested PostgREST filter the DAL builds, and the count
        // it feeds back is the rows surviving the eq/is filters.
        or: (filter: string) => {
          orCalls.push(filter);
          return b;
        },
        order: () => b,
        range: (from: number, to: number) => {
          filtered = filtered.slice(from, to + 1);
          return b;
        },
        limit: (n: number) => {
          filtered = filtered.slice(0, n);
          return b;
        },
        maybeSingle: () => Promise.resolve({ data: filtered[0] ?? null, error: null }),
        then: (resolve: (v: { data: unknown; error: null; count: number }) => unknown) =>
          resolve({ data: filtered, error: null, count: filtered.length }),
      };
      return b;
    }

    const client = {
      auth: { getClaims: async () => ({ data: { claims: { sub: "op-1" } } }) },
      from: (table: string) => builder(table),
    };
    return { client: client as unknown as SupabaseServer, orCalls };
  }

  it("excludes a same-day check-in that happened BEFORE the venta's gym-local time", async () => {
    const { client } = makeFichaFake([
      // Consumed BEFORE the 12:00 venta (gym-local) — already spent from the prior balance.
      {
        cliente_id: "cli-ficha",
        fecha: VENTA_DIA,
        hora: "09:00:00",
        consumio: true,
        deleted_at: null,
      },
      // Consumed AFTER the venta — the only row that should count against the new package.
      {
        cliente_id: "cli-ficha",
        fecha: VENTA_DIA,
        hora: "15:00:00",
        consumio: true,
        deleted_at: null,
      },
    ]);

    const ficha = await getClienteFicha("cli-ficha", client);

    expect(ficha?.clasesGauge?.usadas).toBe(1);
  });

  it("counts a null-hora (back-entry) same-day row — no recorded time to prove it preceded the venta", async () => {
    const { client } = makeFichaFake([
      { cliente_id: "cli-ficha", fecha: VENTA_DIA, hora: null, consumio: true, deleted_at: null },
    ]);

    const ficha = await getClienteFicha("cli-ficha", client);

    expect(ficha?.clasesGauge?.usadas).toBe(1);
  });

  it("old purchase predating the 30-day window: the head-count query carries the same instant anchor", async () => {
    const { client, orCalls } = makeFichaFake(
      [
        // Both rows predate the window, so the in-hand fetch (gte ventanaIso) drops
        // them; only the head-count query can see them — its count must feed usadas.
        { cliente_id: "cli-ficha", fecha: OLD_DIA, hora: "15:00:00", consumio: true, deleted_at: null },
        { cliente_id: "cli-ficha", fecha: OLD_DIA, hora: "16:00:00", consumio: true, deleted_at: null },
      ],
      { ...FICHA_VENTA, fecha: OLD_INSTANTE },
    );

    const ficha = await getClienteFicha("cli-ficha", client);

    // The exact nested PostgREST filter: strictly-later days, OR same-day at/after
    // the venta's gym-local time (null hora counted — no time to disprove).
    expect(orCalls).toEqual([
      `fecha.gt.${OLD_DIA},and(fecha.eq.${OLD_DIA},or(hora.gte.12:00:00,hora.is.null))`,
    ]);
    expect(ficha?.clasesGauge?.usadas).toBe(2);
  });
});
