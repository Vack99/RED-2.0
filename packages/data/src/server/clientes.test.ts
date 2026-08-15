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

  it("rejects a PARTIAL (non-10-digit) tel before any write", async () => {
    const fake = makeFake();
    await expect(actualizarCliente({ ...valid, tel: "614 123" }, fake.client)).rejects.toThrow();
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("blank tel CLEARS the phone (#190) — sends p_tel: null, never ''", async () => {
    const fake = makeFake();
    await actualizarCliente({ ...valid, tel: "   " }, fake.client);
    expect(fake.rpcCalls[0].args).toHaveProperty("p_tel", null);
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
 *
 * `.not()`/`.gte()`/`.or()` REALLY filter the seeded rows (not just record the call) —
 * getRosterResumen's vigentes/totalActivos counts (Fix 3, perf) are now built entirely
 * from these PostgREST filters (no row-derivation fallback), so the fake has to apply
 * them for real or a wrong predicate would pass silently.
 */
interface Rows {
  clientes?: Record<string, unknown>[];
  /** getOperatorGyms reads this with an embedded `gym(...)` FK join — one round trip,
   *  so each membership row carries its gym pre-joined rather than a second table. */
  gym_membership?: Record<string, unknown>[];
  /** The package catalog getPaquetes reads (#225: getRosterResumen/getClientesRoster
   *  need it for esPaseSuelto). Empty by default — every fixture without a drop-in
   *  package can omit this. */
  paquetes?: Record<string, unknown>[];
  /** `.rpc(fnName, args)` responses, keyed by function name — ventas_count_por_cliente /
   *  asistencias_mes_por_cliente / asistencias_ultima_visita_por_cliente all resolve directly
   *  (no `.single()`), mirroring the DAL. Row shape varies by function, so this is loose. */
  rpc?: Record<string, Record<string, unknown>[]>;
  /** Forces a named `.rpc()` call to resolve `{ data: null, error }` instead of its `rpc` fixture
   *  row (#226 F4) — proves an RPC failure surfaces as a THROW, never a silent "nobody visited". */
  rpcErrors?: Record<string, unknown>;
}

function makeReadFake(rows: Rows) {
  const selects: Record<string, string[]> = {};
  const rpcCalls: { name: string; args: unknown }[] = [];
  function builder(table: string, list: Record<string, unknown>[]) {
    let filtered = [...list];
    let headCount = false;
    const b: Record<string, unknown> = {
      select: (cols: string, opts?: { head?: boolean }) => {
        (selects[table] ??= []).push(cols);
        if (opts?.head) headCount = true;
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
      not: (col: string, _op: string, val: unknown) => {
        filtered = filtered.filter((r) => (val === null ? r[col] != null : r[col] !== val));
        return b;
      },
      gte: (col: string, val: unknown) => {
        filtered = filtered.filter((r) => r[col] != null && String(r[col]) >= String(val));
        return b;
      },
      // Mirrors PostgREST's `.or("col.op.val,col.op.val")` — an OR-group of simple
      // `is.null` / `gt.N` terms, ANDed with every filter already applied above.
      or: (expr: string) => {
        const terms = expr.split(",");
        filtered = filtered.filter((r) =>
          terms.some((term) => {
            const [col, op, val] = term.split(".");
            const v = r[col];
            if (op === "is") return val === "null" ? v == null : v === val;
            if (op === "gt") return typeof v === "number" && v > Number(val);
            return false;
          }),
        );
        return b;
      },
      order: () => b,
      limit: (n: number) => {
        filtered = filtered.slice(0, n);
        return b;
      },
      range: () => b,
      maybeSingle: () => Promise.resolve({ data: filtered[0] ?? null, error: null }),
      then: (resolve: (v: { data: unknown; error: null; count?: number }) => unknown) =>
        headCount
          ? resolve({ data: null, error: null, count: filtered.length })
          : resolve({ data: filtered, error: null }),
    };
    return b;
  }
  const client = {
    auth: { getClaims: async () => ({ data: { claims: { sub: "op-1" } } }) },
    from: (table: string) =>
      builder(table, (rows as Record<string, Record<string, unknown>[] | undefined>)[table] ?? []),
    rpc: (name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      if (rows.rpcErrors?.[name] !== undefined) {
        const error = rows.rpcErrors[name];
        return { then: (resolve: (v: { data: null; error: unknown }) => unknown) => resolve({ data: null, error }) };
      }
      const data = rows.rpc?.[name] ?? [];
      return { then: (resolve: (v: { data: unknown; error: null }) => unknown) => resolve({ data, error: null }) };
    },
  };
  return { selects, rpcCalls, client: client as unknown as SupabaseServer };
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
    created_at: "2026-05-02T05:00:00Z", // → 01 may in Chihuahua (UTC−6): the alta floor
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
    created_at: "2026-06-15T18:00:00Z",
  },
];

const OPERATOR_ROWS: Rows = {
  clientes: FIXTURE_CLIENTES,
  gym_membership: [
    { gym_id: "g-1", role: "operator", gym: { timezone: "America/Chihuahua", slug: "forge", brand_name: "Forge" } },
  ],
  rpc: {
    // Self-registered cli-online, never charged: 0 ventas → primeraCompra true (#77).
    // Desk client cli-desk has a sale on record → primeraCompra false. Rows missing
    // from the RPC result (neither here) fall back to 0 in the DAL.
    ventas_count_por_cliente: [{ cliente_id: "cli-desk", n: 3 }],
    asistencias_mes_por_cliente: [],
    // #226: cli-desk visited a class 2026-07-20 (a walk-in, consumio=false) and an
    // ACCESO LIBRE visit 2026-07-22 (consumio=true) — ultimaVisita is the LATER of the
    // two (any visit), ultimaVisitaConsumida is the earlier, CONSUMING one, proving the
    // roster wires both facts through rather than collapsing to a single "last visit".
    // cli-online is missing from the RPC result entirely → both facts fall back to null.
    asistencias_ultima_visita_por_cliente: [
      { cliente_id: "cli-desk", ultima_visita: "2026-07-22", ultima_visita_consumida: "2026-07-20" },
    ],
  },
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
    expect(online.veredicto.pendienteOnline).toBe(true);

    const desk = roster.find((r) => r.id === "cli-desk")!;
    expect(desk.invitacion.estado).toBe("invitacion_enviada");
    expect(desk.invitacion.badge).toBe("Invitada 7 jul"); // gym-local send date
    expect(desk.veredicto.pendienteOnline).toBe(false);

    // #226: the roster THREADS both last-visit facts from the aggregate RPC into the
    // veredicto — the AUSENTE clock (any visit) and the CLASES clock (consuming visits
    // only). Neither is a flat DTO field any more; `ausencia` is what a caller reads,
    // and it is present for both rows (cli-online is missing from the RPC result and
    // floors on its alta instead of reading "never absent" — #226 F5). The two axes'
    // numeric distinctness is pinned by the #229 F8 case further down.
    expect(desk.veredicto.ausencia).not.toBeNull();
    expect(online.veredicto.ausencia).not.toBeNull();

    // Perf (Fix 2): this month's attendance count comes from a grouped RPC in
    // Promise.all, not a whole-month asistencias row pull counted in JS.
    expect(fake.rpcCalls).toContainEqual(
      expect.objectContaining({ name: "asistencias_mes_por_cliente", args: { p_gym_id: "g-1", p_desde: expect.any(String) } }),
    );
    // #226: the last-visit aggregate is ONE extra call, not a per-row asistencias fetch.
    expect(fake.rpcCalls).toContainEqual({
      name: "asistencias_ultima_visita_por_cliente",
      args: { p_gym_id: "g-1" },
    });
  });

  it("getClientesRoster throws on an asistencias_ultima_visita_por_cliente RPC error (#226 F4) — never silently reads the whole gym as ausente", async () => {
    const fake = makeReadFake({
      ...OPERATOR_ROWS,
      rpcErrors: { asistencias_ultima_visita_por_cliente: { message: "boom" } },
    });
    await expect(getClientesRoster(fake.client)).rejects.toMatchObject({ message: "boom" });
  });

  it("getClientesLite carries email + invite badge for the picker, never claim_code", async () => {
    const fake = makeReadFake(OPERATOR_ROWS);
    const lite = await getClientesLite(fake.client);

    const clientesSelect = fake.selects.clientes.join(" ");
    expect(clientesSelect).not.toContain("claim_code");
    // Perf (Fix 1): no correlated `ventas(count)` embed on the roster select — the
    // count comes from a grouped RPC call, fired alongside the select.
    expect(clientesSelect).not.toContain("ventas(count)");
    expect(fake.rpcCalls).toContainEqual({
      name: "ventas_count_por_cliente",
      args: { p_gym_id: "g-1" },
    });
    expect(JSON.stringify(lite)).not.toContain("claim_code");

    const desk = lite.find((c) => c.id === "cli-desk")!;
    expect(desk.email).toBe("ana@mail.com"); // for the NUEVO soft duplicate warn
    expect(desk.invitacion.badge).toBe("Invitada 7 jul");
    expect(desk.primeraCompra).toBe(false); // 3 ventas on record (RPC-supplied)

    const online = lite.find((c) => c.id === "cli-online")!;
    expect(online.primeraCompra).toBe(true); // missing from the RPC result → 0 ventas
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
 * #225: vigentes/total now come from fetching every cliente row and running each
 * through derivarCliente/derivarEstado — the SAME predicate the #223 lifecycle
 * engine and the directory header read, never a parallel `.gte()`/`.or()` restatement
 * of the bands (the pre-#225 shape drifted from derivarEstado the moment its bands
 * changed — the exact "two live meanings of a band" bug this ticket kills). This
 * fixture exercises the estado boundary + the pase-suelto exemption:
 *  - vigente-1: far-future vence, plenty of clases.
 *  - vigente-2-close: vence 3 days out, few clases — pre-#225 this was "por_vencer"
 *    and excluded from vigentes; that split is retired, so it counts now too.
 *  - vencido-1: vence in the past — FECHA WINS (A2), never "sin_clases".
 *  - sin-paquete-1: no package at all — distinct from sin_clases (#225).
 *  - pase-suelto-1: a spent one-off pass (0 clases, days remaining) — esPaseSuelto
 *    exempts the classes axis, so it's vigente, not sin_clases.
 */
describe("getRosterResumen — vigentes/total from the shared lifecycle-engine predicate (#225)", () => {
  const TZ = "America/Chihuahua";
  const HOY = hoyEnZona(TZ);

  // #229: getRosterResumen now reads created_at (the alta floor for the ausente
  // badge/AÚN A TIEMPO clock) — every row needs it or fechaEnZona throws on an
  // undefined timestamp. A fixed far-past date keeps every row's `alta` well
  // outside AUSENTE_DIAS/RECUPERACION_DIAS so it never perturbs this describe
  // block's vigentes/total/nuevosOnline assertions.
  const RESUMEN_CLIENTES = [
    {
      id: "vigente-1",
      gym_id: "g-1",
      paquete_nombre: "Ilimitado",
      clases_restantes: null, // ilimitado — never excluded by the clases leg
      vence: toIsoDay(addDays(HOY, 30)),
      auth_user_id: null,
      email: null,
      invitacion_enviada_at: null,
      created_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "vigente-2-close",
      gym_id: "g-1",
      paquete_nombre: "8 clases",
      clases_restantes: 5,
      vence: toIsoDay(addDays(HOY, 3)), // was "por_vencer" pre-#225 — now counts as vigente
      auth_user_id: null,
      email: null,
      invitacion_enviada_at: null,
      created_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "vencido-1",
      gym_id: "g-1",
      paquete_nombre: "8 clases",
      clases_restantes: 5,
      vence: toIsoDay(addDays(HOY, -10)), // dias < 0 → vencido, never sin_clases (A2)
      auth_user_id: null,
      email: null,
      invitacion_enviada_at: null,
      created_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "sin-paquete-1",
      gym_id: "g-1",
      paquete_nombre: null,
      clases_restantes: null,
      vence: null,
      auth_user_id: null,
      email: null,
      invitacion_enviada_at: null,
      created_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "pase-suelto-1",
      gym_id: "g-1",
      paquete_nombre: "1 clase",
      clases_restantes: 0, // spent — its NORMAL end state after one visit
      vence: toIsoDay(addDays(HOY, 20)), // still inside its own validity window
      auth_user_id: null,
      email: null,
      invitacion_enviada_at: null,
      created_at: "2026-01-01T00:00:00Z",
    },
  ];

  const PAQUETES_CATALOG = [
    { id: "p1", gym_id: "g-1", nombre: "Ilimitado", clases: null, vigencia_tipo: "mes", vigencia_dias: null, precio: 1200, popular: false, orden: 1 },
    { id: "p2", gym_id: "g-1", nombre: "8 clases", clases: 8, vigencia_tipo: "dias", vigencia_dias: 30, precio: 800, popular: false, orden: 2 },
    { id: "p3", gym_id: "g-1", nombre: "1 clase", clases: 1, vigencia_tipo: "dias", vigencia_dias: 30, precio: 150, popular: false, orden: 3 },
  ];

  it("vigentes counts every not-vencido, not-out-of-classes row — the por_vencer split is retired (#225)", async () => {
    const fake = makeReadFake({
      clientes: RESUMEN_CLIENTES,
      paquetes: PAQUETES_CATALOG,
      gym_membership: [
        { gym_id: "g-1", role: "operator", gym: { timezone: TZ, slug: "forge", brand_name: "Forge" } },
      ],
    });

    const resumen = await getRosterResumen(fake.client);

    expect(resumen.vigentes).toBe(3); // vigente-1 + vigente-2-close + pase-suelto-1
    expect(resumen.total).toBe(5); // the whole roster — never "totalActivos" (#225)
    expect(resumen.nuevosOnline).toBe(0); // no auth-linked rows in this fixture
  });
});

/**
 * #228: INICIO's POR RENOVAR tile reads `porRenovar` straight off this same read —
 * no second roster fetch. The seam where these counts are COMPUTED (this function,
 * via contarLifecycle) is where the sum invariant is proven: the day + clases
 * buckets always sum to the headline, at a fixture that exercises every bucket AND
 * the rows that must be EXCLUDED (vencido, sin_paquete/pendienteOnline, too-far
 * vigente) so a fresh online arrival never also reads as a renewal risk.
 */
describe("getRosterResumen — porRenovar buckets sum to the headline (#228)", () => {
  const TZ = "America/Chihuahua";
  const HOY = hoyEnZona(TZ);

  // #229: getRosterResumen now reads created_at (the alta floor) — every row
  // needs it or fechaEnZona throws on an undefined timestamp. A fixed far-past
  // date keeps every row's `alta` well outside AUSENTE_DIAS/RECUPERACION_DIAS
  // so it never perturbs this describe block's porRenovar/vigentes/total
  // assertions.
  const PORRENOVAR_CLIENTES = [
    {
      id: "renovar-hoy",
      gym_id: "g-1",
      paquete_nombre: "8 clases",
      clases_restantes: 8,
      vence: toIsoDay(HOY), // dias === 0 → the "hoy" bucket
      auth_user_id: null,
      email: null,
      invitacion_enviada_at: null,
      created_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "renovar-manana",
      gym_id: "g-1",
      paquete_nombre: "8 clases",
      clases_restantes: 8,
      vence: toIsoDay(addDays(HOY, 1)), // the "manana" bucket
      auth_user_id: null,
      email: null,
      invitacion_enviada_at: null,
      created_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "renovar-clases-bound",
      gym_id: "g-1",
      paquete_nombre: "8 clases",
      clases_restantes: 1, // clases-bound (<= RENOVACION_CLASES) even with days to spare
      vence: toIsoDay(addDays(HOY, 18)), // outside every día bucket — only the clases arm
      auth_user_id: null,
      email: null,
      invitacion_enviada_at: null,
      created_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "renovar-sin-clases",
      gym_id: "g-1",
      paquete_nombre: "8 clases",
      clases_restantes: 0, // sin_clases (days remain) — also clases-bound
      vence: toIsoDay(addDays(HOY, 20)),
      auth_user_id: null,
      email: null,
      invitacion_enviada_at: null,
      created_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "vencido-excluded",
      gym_id: "g-1",
      paquete_nombre: "8 clases",
      clases_restantes: 5,
      vence: toIsoDay(addDays(HOY, -3)), // vencido — never POR RENOVAR (FECHA WINS)
      auth_user_id: null,
      email: null,
      invitacion_enviada_at: null,
      created_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "vigente-lejos",
      gym_id: "g-1",
      paquete_nombre: "8 clases",
      clases_restantes: 8,
      vence: toIsoDay(addDays(HOY, 60)), // well outside RENOVACION_DIAS — not renewal-due
      auth_user_id: null,
      email: null,
      invitacion_enviada_at: null,
      created_at: "2026-01-01T00:00:00Z",
    },
    {
      // A same-day online arrival with no package: pendienteOnline, never also
      // POR RENOVAR — one person cannot get two verdicts on this screen (#228 AC).
      id: "pendiente-online",
      gym_id: "g-1",
      paquete_nombre: null,
      clases_restantes: null,
      vence: null,
      auth_user_id: "auth-online-1",
      email: null,
      invitacion_enviada_at: null,
      created_at: "2026-01-01T00:00:00Z",
    },
    {
      // #228 opus review F5: a spent one-off pass (0 clases, its NORMAL end state
      // after one visit) — esPaseSuelto exempts the CLASES axis entirely, so this
      // must stay OUT of porRenovar's clases bucket and stay vigente (never
      // sin_clases), even though clases_restantes reads 0 exactly like
      // renovar-sin-clases above.
      id: "pase-suelto-gastado",
      gym_id: "g-1",
      paquete_nombre: "Clase Individual",
      clases_restantes: 0,
      vence: toIsoDay(addDays(HOY, 20)), // still inside its own validity window
      auth_user_id: null,
      email: null,
      invitacion_enviada_at: null,
      created_at: "2026-01-01T00:00:00Z",
    },
  ];

  const PAQUETES_CATALOG = [
    { id: "p1", gym_id: "g-1", nombre: "8 clases", clases: 8, vigencia_tipo: "dias", vigencia_dias: 30, precio: 800, popular: false, orden: 1 },
    { id: "p2", gym_id: "g-1", nombre: "Clase Individual", clases: 1, vigencia_tipo: "dias", vigencia_dias: 30, precio: 150, popular: false, orden: 2 },
  ];

  it("buckets sum exactly to the headline and exclude vencido/sin_paquete/out-of-window rows", async () => {
    const fake = makeReadFake({
      clientes: PORRENOVAR_CLIENTES,
      paquetes: PAQUETES_CATALOG,
      gym_membership: [
        { gym_id: "g-1", role: "operator", gym: { timezone: TZ, slug: "forge", brand_name: "Forge" } },
      ],
    });

    const resumen = await getRosterResumen(fake.client);

    // hoy + manana + 2 clases-bound — pase-suelto-gastado's spent clases (also 0,
    // like renovar-sin-clases) do NOT add a 3rd clases-bucket row (#228 F5).
    expect(resumen.porRenovar.total).toBe(4);
    expect(resumen.porRenovar.cubos).toEqual({
      hoy: 1,
      manana: 1,
      dosATres: 0,
      cuatroACinco: 0,
      seisOMas: 0,
      clases: 2,
    });
    const sumaCubos = Object.values(resumen.porRenovar.cubos).reduce((a, b) => a + b, 0);
    expect(sumaCubos).toBe(resumen.porRenovar.total); // the sum invariant, at the seam that computes it

    // sin_paquete rows have no live package, so `porRenovar` is false — a
    // pendienteOnline fresh arrival is never double-counted into POR RENOVAR.
    expect(resumen.nuevosOnline).toBe(1);

    // #228 opus review F5 — pase-suelto blinding: a spent one-off pass (0 clases,
    // inside its own días window) is exempt from the CLASES axis entirely, so it
    // stays VIGENTE (never sin_clases) and OUT of porRenovar, unlike
    // renovar-sin-clases (same 0 clases, but a real membership package).
    expect(resumen.vigentes).toBe(5); // hoy + manana + clases-bound + lejos + pase-suelto-gastado
    expect(resumen.total).toBe(8);
  });
});

/**
 * #229: `getClientesRoster` threads every fact the tile + the ausencia need
 * (`auth_user_id`, both visit clocks, alta) into the ONE `derivarVeredicto` call each
 * row gets, and the verdict rides on `ClienteRosterDTO`. `HOY`/relative offsets (not
 * fixed calendar dates) keep this self-consistent regardless of when the suite runs —
 * the same pattern the RESUMEN_CLIENTES/PORRENOVAR_CLIENTES fixtures above already
 * use. `created_at` is pinned at noon UTC so the Chihuahua-local calendar day always
 * matches the UTC one (no midnight-rollover drift across the -6h offset).
 */
describe("getClientesRoster — #229: tile + ausencia on the row's own veredicto", () => {
  const TZ = "America/Chihuahua";
  const HOY = hoyEnZona(TZ);

  const CLIENTES_229 = [
    {
      id: "recuperable",
      gym_id: "g-1",
      nombre: "Recuperable Cliente",
      tel: null,
      paquete_nombre: "8 clases",
      clases_restantes: 0,
      vence: toIsoDay(addDays(HOY, -5)), // vencido 5 días — inside the 1-15 recovery window
      auth_user_id: null, // no app account — required for the tile
      email: null,
      invitacion_enviada_at: null,
      created_at: `${toIsoDay(addDays(HOY, -10))}T12:00:00Z`, // alta 10 días — under AUSENTE_DIAS
    },
    {
      id: "con-cuenta",
      gym_id: "g-1",
      nombre: "Con Cuenta",
      tel: null,
      paquete_nombre: "8 clases",
      clases_restantes: 0,
      vence: toIsoDay(addDays(HOY, -5)), // same window as recuperable…
      auth_user_id: "auth-1", // …but HAS an app account — the client app already nudges them
      email: null,
      invitacion_enviada_at: null,
      created_at: `${toIsoDay(addDays(HOY, -10))}T12:00:00Z`,
    },
    {
      id: "vigente-ausente",
      gym_id: "g-1",
      nombre: "Vigente Ausente",
      tel: null,
      paquete_nombre: "8 clases",
      clases_restantes: 8,
      vence: toIsoDay(addDays(HOY, 30)), // comfortably vigente — neither tile
      auth_user_id: null,
      email: null,
      invitacion_enviada_at: null,
      created_at: `${toIsoDay(addDays(HOY, -30))}T12:00:00Z`, // alta 30 días, never visited (bought, never came)
    },
  ];

  const GYM_MEMBERSHIP = [
    { gym_id: "g-1", role: "operator", gym: { timezone: TZ, slug: "forge", brand_name: "Forge" } },
  ];

  it("stamps AÚN A TIEMPO tile membership, excluding the app-account holder", async () => {
    const fake = makeReadFake({ clientes: CLIENTES_229, gym_membership: GYM_MEMBERSHIP });
    const roster = await getClientesRoster(fake.client);

    expect(roster.find((r) => r.id === "recuperable")!.veredicto.tile).toBe("aun_a_tiempo");
    expect(roster.find((r) => r.id === "con-cuenta")!.veredicto.tile).toBeNull();
    expect(roster.find((r) => r.id === "vigente-ausente")!.veredicto.tile).toBeNull();
  });

  it("stamps the ausencia (numeral + badge decision), floored on alta when never visited (A9)", async () => {
    const fake = makeReadFake({ clientes: CLIENTES_229, gym_membership: GYM_MEMBERSHIP });
    const roster = await getClientesRoster(fake.client);

    const ausente = roster.find((r) => r.id === "vigente-ausente")!;
    expect(ausente.veredicto.ausencia).toEqual({ dias: 30, ausente: true });

    const recuperable = roster.find((r) => r.id === "recuperable")!;
    // alta only 10 días ago — under AUSENTE_DIAS, so the fact holds but the badge doesn't.
    expect(recuperable.veredicto.ausencia).toEqual({ dias: 10, ausente: false });
  });

  it("#229 opus review F8: feeds ultima_visita — never ultima_visita_consumida — into the ausencia axis; built so swapping the two RPC columns fails", async () => {
    const CLIENTE_DISTINTO = [
      {
        id: "eje-distinto",
        gym_id: "g-1",
        nombre: "Eje Distinto",
        tel: null,
        paquete_nombre: "8 clases",
        clases_restantes: 0, // sin_clases — date-valid, clases exhausted (a real clases-arm clock exists)
        vence: toIsoDay(addDays(HOY, 20)),
        auth_user_id: null,
        email: null,
        invitacion_enviada_at: null,
        created_at: `${toIsoDay(addDays(HOY, -200))}T12:00:00Z`,
      },
    ];
    const fake = makeReadFake({
      clientes: CLIENTE_DISTINTO,
      gym_membership: GYM_MEMBERSHIP,
      rpc: {
        asistencias_ultima_visita_por_cliente: [
          {
            cliente_id: "eje-distinto",
            // Distinct on purpose (mirrors the #226 FIXTURE_CLIENTES precedent: a
            // later NON-consuming walk-in vs. the earlier CONSUMING class visit).
            ultima_visita: toIsoDay(addDays(HOY, -3)), // the ausente/badge axis
            ultima_visita_consumida: toIsoDay(addDays(HOY, -10)), // the clases-clock axis
          },
        ],
      },
    });
    const roster = await getClientesRoster(fake.client);
    const row = roster.find((r) => r.id === "eje-distinto")!;

    // The two axes land in two DIFFERENT fields of the same veredicto, so a wiring
    // swap can't hide: the badge's numeral is ALWAYS ultima_visita's axis (3 días),
    // and a sin_clases row's `diasDesdeFin` is ALWAYS the CONSUMING visit's (10) —
    // feeding either RPC column into the other's slot flips both assertions.
    expect(row.veredicto.ausencia).toEqual({ dias: 3, ausente: false }); // 3 < AUSENTE_DIAS
    expect(row.veredicto.estado).toBe("sin_clases");
    expect(row.veredicto.diasDesdeFin).toBe(10);
  });
});

/**
 * #229: INICIO's AÚN A TIEMPO tile reads `aunATiempo` straight off this same read
 * (getRosterResumen) — no second roster fetch, one new aggregate call. This is the
 * seam where the count is COMPUTED (via contarLifecycle over the FULL engine's
 * output), proving the account-holder exclusion holds at the read that actually
 * powers the tile, not just at the pure engine layer (already covered by
 * packages/domain/src/lifecycle.test.ts).
 */
describe("getRosterResumen — #229: aunATiempo from the SAME asistencias_ultima_visita_por_cliente aggregate (#226)", () => {
  const TZ = "America/Chihuahua";
  const HOY = hoyEnZona(TZ);

  const CLIENTES_AUN_A_TIEMPO = [
    {
      id: "recuperable",
      gym_id: "g-1",
      paquete_nombre: "8 clases",
      clases_restantes: 0,
      vence: toIsoDay(addDays(HOY, -5)),
      auth_user_id: null,
      email: null,
      invitacion_enviada_at: null,
      created_at: `${toIsoDay(addDays(HOY, -10))}T12:00:00Z`,
    },
    {
      id: "con-cuenta",
      gym_id: "g-1",
      paquete_nombre: "8 clases",
      clases_restantes: 0,
      vence: toIsoDay(addDays(HOY, -5)),
      auth_user_id: "auth-1",
      email: null,
      invitacion_enviada_at: null,
      created_at: `${toIsoDay(addDays(HOY, -10))}T12:00:00Z`,
    },
    {
      id: "largo-muerto",
      gym_id: "g-1",
      paquete_nombre: "8 clases",
      clases_restantes: 0,
      vence: toIsoDay(addDays(HOY, -44)), // past día 16 — out of both tiles
      auth_user_id: null,
      email: null,
      invitacion_enviada_at: null,
      created_at: `${toIsoDay(addDays(HOY, -400))}T12:00:00Z`,
    },
  ];

  const GYM_MEMBERSHIP = [
    { gym_id: "g-1", role: "operator", gym: { timezone: TZ, slug: "forge", brand_name: "Forge" } },
  ];

  it("counts aunATiempo via the ONE new aggregate, excluding the account holder and the long-dead", async () => {
    const fake = makeReadFake({ clientes: CLIENTES_AUN_A_TIEMPO, gym_membership: GYM_MEMBERSHIP });
    const resumen = await getRosterResumen(fake.client);

    expect(resumen.aunATiempo.total).toBe(1); // recuperable only
    expect(fake.rpcCalls).toContainEqual({
      name: "asistencias_ultima_visita_por_cliente",
      args: { p_gym_id: "g-1" },
    });
  });

  it("throws on an asistencias_ultima_visita_por_cliente RPC error — never silently reads zero absence (#226 F4 precedent)", async () => {
    const fake = makeReadFake({
      clientes: CLIENTES_AUN_A_TIEMPO,
      gym_membership: GYM_MEMBERSHIP,
      rpcErrors: { asistencias_ultima_visita_por_cliente: { message: "boom" } },
    });
    await expect(getRosterResumen(fake.client)).rejects.toMatchObject({ message: "boom" });
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
    // fecha = the effective/sold day; created_at = the real write instant the clases
    // gauge now anchors on (spec §D3/C2). Equal here (a non-backdated sale).
    fecha: VENTA_INSTANTE,
    created_at: VENTA_INSTANTE,
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
      // #97: brand_name is the injected negocio fallback, now pre-joined onto the membership.
      gym_membership: [
        { gym_id: "g-1", role: "operator", gym: { timezone: TZ, slug: "forge", brand_name: "Forge" } },
      ],
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

  it("counts a booked visit (consumio=false) — #173: reservar_clase already charged it at booking, not attendance", async () => {
    const { client } = makeFichaFake([
      // A booking flips class_session_id + charges the balance at reservar_clase time, so the
      // resulting asistencia is written consumio=false. Gating this count on consumio=true (the
      // pre-#173 bug) dropped every booked visit, undercounting the gauge's "usadas".
      { cliente_id: "cli-ficha", fecha: VENTA_DIA, hora: "18:00:00", consumio: false, deleted_at: null },
    ]);

    const ficha = await getClienteFicha("cli-ficha", client);

    expect(ficha?.clasesGauge?.usadas).toBe(1);
  });

  it("excludes a perdonada row — the second record of one cooldown-paired arrival, not a real second visit", async () => {
    const { client } = makeFichaFake([
      { cliente_id: "cli-ficha", fecha: VENTA_DIA, hora: "18:00:00", consumio: true, deleted_at: null },
      { cliente_id: "cli-ficha", fecha: VENTA_DIA, hora: "18:01:00", consumio: false, perdonada: true, deleted_at: null },
    ]);

    const ficha = await getClienteFicha("cli-ficha", client);

    expect(ficha?.clasesGauge?.usadas).toBe(1);
  });

  it("old purchase predating the 30-day window: the head-count query carries the same instant anchor", async () => {
    const { client, orCalls } = makeFichaFake(
      [
        // Both rows predate the window, so the in-hand fetch (gte ventanaIso) drops
        // them; only the head-count query can see them — its count must feed usadas.
        { cliente_id: "cli-ficha", fecha: OLD_DIA, hora: "15:00:00", consumio: true, perdonada: false, deleted_at: null },
        { cliente_id: "cli-ficha", fecha: OLD_DIA, hora: "16:00:00", consumio: true, perdonada: false, deleted_at: null },
      ],
      { ...FICHA_VENTA, fecha: OLD_INSTANTE, created_at: OLD_INSTANTE },
    );

    const ficha = await getClienteFicha("cli-ficha", client);

    // The exact nested PostgREST filter: strictly-later days, OR same-day at/after
    // the venta's gym-local time (null hora counted — no time to disprove).
    expect(orCalls).toEqual([
      `fecha.gt.${OLD_DIA},and(fecha.eq.${OLD_DIA},or(hora.gte.12:00:00,hora.is.null))`,
    ]);
    expect(ficha?.clasesGauge?.usadas).toBe(2);
  });

  // Paquete-swap spec §4: `ClienteFichaDTO.paquetes` is the SAME catalog read already fetched
  // for the `{precios}` plantilla token (line 417 in clientes.ts) — zero extra I/O. This proves
  // the read is threaded onto the DTO, not silently dropped after `fmtPrecios` consumes it.
  it("threads the gym's package catalog onto the DTO as `paquetes` — zero extra I/O", async () => {
    // Inlined rather than makeFichaFake (which hard-codes `paquetes: []`): only the `paquetes`
    // row list differs from that helper's fixtures.
    const rows: Record<string, Record<string, unknown>[]> = {
      clientes: [FICHA_CLIENTE],
      gym_membership: [
        { gym_id: "g-1", role: "operator", gym: { timezone: TZ, slug: "forge", brand_name: "Forge" } },
      ],
      asistencias: [],
      ventas: [FICHA_VENTA],
      perfil: [],
      plantillas: [],
      paquetes: [
        { id: "pq-1", nombre: "8 clases", clases: 8, vigencia_tipo: "dias", vigencia_dias: 30, precio: 800, popular: false, orden: 1 },
        { id: "pq-2", nombre: "Ilimitado", clases: null, vigencia_tipo: "mes", vigencia_dias: null, precio: 1200, popular: true, orden: 2 },
      ],
      cobro: [],
    };
    function builder(table: string) {
      let filtered = [...(rows[table] ?? [])];
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        in: () => b,
        is: () => b,
        gte: () => b,
        or: () => b,
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
    const paquetesClient = {
      auth: { getClaims: async () => ({ data: { claims: { sub: "op-1" } } }) },
      from: (table: string) => builder(table),
    } as unknown as SupabaseServer;

    const ficha = await getClienteFicha("cli-ficha", paquetesClient);

    expect(ficha?.paquetes).toEqual([
      expect.objectContaining({ id: "pq-1", nombre: "8 clases", clases: 8, precio: 800 }),
      expect.objectContaining({ id: "pq-2", nombre: "Ilimitado", clases: null, precio: 1200 }),
    ]);
  });
});
