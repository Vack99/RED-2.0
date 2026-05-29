# Forge — Structural Pass + Domain Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Forge frontend mock into a senior-grade, navigable, sectored codebase with a real, unit-tested pure domain core and one enforced architectural boundary — without implementing the Supabase backend.

**Architecture:** Route-colocated sectors (`src/app/(app)/<sector>/_components`), a pure `src/domain` core holding every business rule, a thin `src/lib/data` seam (mock today), and a shared `src/components/forge` UI kit. A single dependency-cruiser rule forbids `domain`/`lib` from importing `components`/`app`, run on every commit via a pre-commit hook. Behavior stays on mock data; the domain core is created and tested but wired into screens later, during the Supabase migration cycle.

**Tech Stack:** Next.js 16.2.6 (App Router) · TypeScript 5 · pnpm 11 · Vitest (new) · dependency-cruiser (new) · Husky (new). Source of truth: `docs/superpowers/specs/2026-05-29-forge-sector-architecture-design.md`.

**Conventions for the executor:**
- Package manager is **pnpm** — NEVER run `npm install` (it corrupts the pnpm layout). Use `pnpm add`, `pnpm exec`, `pnpm test`, `pnpm lint`.
- Commit messages end with the trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- The repo is on branch `master`; commit directly (solo repo, initial line of work).
- **Keep imports consolidated.** When a step adds a name to an `import ... from "./rules"` or `import type ... from "./types"`, merge it into that file's existing single import line at the top — don't add a second import statement from the same module. (The cumulative import line is shown in each step.)

---

## Phase 1 — Domain core (pure, test-driven)

### Task 1: Set up Vitest and the first rule (`stackPaquete`)

**Files:**
- Modify: `package.json` (scripts)
- Modify: `pnpm-workspace.yaml` (allowBuilds)
- Create: `vitest.config.ts`
- Create: `src/domain/types.ts`
- Create: `src/domain/rules.ts`
- Test: `src/domain/rules.test.ts`

- [ ] **Step 1: Install Vitest**

Run: `pnpm add -D vitest`

If pnpm prints `Ignored build scripts: esbuild` (or `ERR_PNPM_IGNORED_BUILDS`), add esbuild to the allow-list and reinstall. Edit `pnpm-workspace.yaml` to:

```yaml
# pnpm 11 build-script approval. pnpm blocks native postinstall scripts by
# default and writes this stub; setting each to `true` approves it so
# `pnpm install` / `pnpm run dev` don't halt on ERR_PNPM_IGNORED_BUILDS.
#   sharp        -> next/image optimization
#   unrs-resolver -> eslint import resolver (oxc)
#   esbuild      -> vitest's transpiler
allowBuilds:
  sharp: true
  unrs-resolver: true
  esbuild: true
```

Then run: `pnpm install`

- [ ] **Step 2: Verify Vitest is available**

Run: `pnpm exec vitest --version`
Expected: prints a version number (e.g. `3.x.x`).

- [ ] **Step 3: Create the Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Add test scripts**

Modify `package.json` `scripts` so it reads exactly:

```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest"
  },
```

(Note: `lint` gains the dependency-cruiser step in Task 6; leave it as `eslint .` for now.)

- [ ] **Step 5: Write the failing test**

Create `src/domain/rules.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { stackPaquete } from "./rules";

describe("stackPaquete", () => {
  it("adds classes and days onto the current package (brief Q5)", () => {
    expect(stackPaquete({ clases: 5, dias: 3 }, { clases: 8, dias: 20 })).toEqual({
      clases: 13,
      dias: 23,
    });
  });

  it("keeps classes ilimitado when the current package is ilimitado", () => {
    expect(
      stackPaquete({ clases: "ilimitado", dias: 10 }, { clases: 8, dias: 20 }),
    ).toEqual({ clases: "ilimitado", dias: 30 });
  });

  it("keeps classes ilimitado when the new package is ilimitado", () => {
    expect(
      stackPaquete({ clases: 5, dias: 3 }, { clases: "ilimitado", dias: 30 }),
    ).toEqual({ clases: "ilimitado", dias: 33 });
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm test`
Expected: FAIL — cannot resolve `./rules` / `stackPaquete` is not exported. (This proves the runner works.)

- [ ] **Step 7: Create the domain types**

Create `src/domain/types.ts`:

```ts
// ──────────────────────────────────────────────────────────────
// Forge domain types — the stack-agnostic vocabulary the rules
// operate on. Pure data shapes: NO React, NO Supabase, NO imports
// from src/components or src/app (enforced by .dependency-cruiser.cjs).
//
// These are the canonical domain types. The mock screens still use the
// legacy shapes in src/lib/data/types.ts; those converge onto these
// during the Supabase migration cycle (see docs/MIGRATION.md).
// ──────────────────────────────────────────────────────────────

/** A class count. Ilimitado packages have no numeric limit. */
export type Clases = number | "ilimitado";

/** A client's lifecycle state — DERIVED, never stored (ADR-0002). */
export type EstadoCliente = "activo" | "por_vencer" | "sin_clases";

/** Payment method. "pendiente" == "por pagar" (optional, brief Q7). */
export type MetodoPago = "efectivo" | "transferencia" | "tarjeta" | "pendiente";

/** Validity window: a fixed number of days, or the remainder of the
 *  purchase calendar month ("mes", used by Ilimitado — brief Q1). */
export type Vigencia = number | "mes";

/** What a client has left of their active package. */
export interface Saldo {
  /** Classes remaining (or "ilimitado"). */
  clases: Clases;
  /** Whole days remaining until the package expires (negative once expired). */
  dias: number;
}

/** The classes + days a freshly-bought package contributes. */
export interface CompraPaquete {
  clases: Clases;
  dias: number;
}

/** Tokens available to WhatsApp templates; each maps to a {token} in a
 *  template body. See renderPlantilla. */
export interface PlantillaContext {
  nombre?: string;
  clases?: string;
  vence?: string;
  dias?: string;
  precios?: string;
  datos_pago?: string;
}
```

- [ ] **Step 8: Create the rules module with `stackPaquete`**

Create `src/domain/rules.ts`:

```ts
// ──────────────────────────────────────────────────────────────
// Forge domain rules — pure functions implementing the brief's
// business rules. NO side effects, NO I/O, NO React/Supabase.
// 100% unit-tested in rules.test.ts. This is the single home for
// "how the gym works"; screens/DAL call these, never reimplement them.
// ──────────────────────────────────────────────────────────────

import type { Clases, CompraPaquete, Saldo } from "./types";

/**
 * Buying a package early STACKS onto the current one (brief Q5):
 * classes add, days add. Ilimitado classes stay ilimitado.
 * Example: {clases:5, dias:3} + {clases:8, dias:20} => {clases:13, dias:23}.
 */
export function stackPaquete(actual: Saldo, nuevo: CompraPaquete): Saldo {
  const clases: Clases =
    actual.clases === "ilimitado" || nuevo.clases === "ilimitado"
      ? "ilimitado"
      : actual.clases + nuevo.clases;
  return { clases, dias: actual.dias + nuevo.dias };
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `pnpm test`
Expected: PASS — 3 passing tests in `stackPaquete`.

- [ ] **Step 10: Commit**

```bash
git add package.json pnpm-workspace.yaml vitest.config.ts src/domain pnpm-lock.yaml
git commit -m "feat(domain): add Vitest + stackPaquete stacking rule

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `calcVigenciaEnd` + `diasRestantes`

**Files:**
- Modify: `src/domain/rules.ts`
- Test: `src/domain/rules.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/domain/rules.test.ts`, replace the top `./rules` import line with (cumulative):

```ts
import { calcVigenciaEnd, diasRestantes, stackPaquete } from "./rules";
```

Then append these describe blocks to the end of the file:

```ts
describe("calcVigenciaEnd", () => {
  it("adds fixed days for an 8-class package (20 días)", () => {
    const end = calcVigenciaEnd(new Date(2026, 4, 13), 20); // 13 may
    expect([end.getFullYear(), end.getMonth(), end.getDate()]).toEqual([2026, 5, 2]); // 2 jun
  });

  it("adds fixed days for a 12-class package (25 días)", () => {
    const end = calcVigenciaEnd(new Date(2026, 4, 13), 25);
    expect([end.getFullYear(), end.getMonth(), end.getDate()]).toEqual([2026, 5, 7]); // 7 jun
  });

  it("runs Ilimitado to the last day of the purchase month (brief Q1)", () => {
    const end = calcVigenciaEnd(new Date(2026, 4, 13), "mes");
    expect([end.getFullYear(), end.getMonth(), end.getDate()]).toEqual([2026, 4, 31]); // 31 may
  });

  it("handles month-end for a short non-leap February", () => {
    const end = calcVigenciaEnd(new Date(2026, 1, 15), "mes");
    expect(end.getDate()).toBe(28);
  });
});

describe("diasRestantes", () => {
  it("counts whole days until vence", () => {
    expect(diasRestantes(new Date(2026, 4, 30), new Date(2026, 4, 27))).toBe(3);
  });
  it("is 0 on the vence day", () => {
    expect(diasRestantes(new Date(2026, 4, 27), new Date(2026, 4, 27))).toBe(0);
  });
  it("is negative once expired", () => {
    expect(diasRestantes(new Date(2026, 4, 25), new Date(2026, 4, 27))).toBe(-2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — `calcVigenciaEnd` / `diasRestantes` are not exported.

- [ ] **Step 3: Implement the functions**

In `src/domain/rules.ts`, replace the top type import line with (cumulative):

```ts
import type { Clases, CompraPaquete, Saldo, Vigencia } from "./types";
```

Then append these functions:

```ts
/**
 * End date of a package bought on `fechaCompra`. Fixed-day packages add
 * `vigencia` days; Ilimitado ("mes") runs to the last day of the purchase
 * calendar month (brief Q1). Returns a date at local midnight; the caller
 * owns the timezone of the input (Forge: America/Chihuahua).
 */
export function calcVigenciaEnd(fechaCompra: Date, vigencia: Vigencia): Date {
  const y = fechaCompra.getFullYear();
  const m = fechaCompra.getMonth();
  if (vigencia === "mes") {
    // Day 0 of next month == last day of this month.
    return new Date(y, m + 1, 0);
  }
  const end = new Date(y, m, fechaCompra.getDate());
  end.setDate(end.getDate() + vigencia);
  return end;
}

/**
 * Whole days from `hoy` until `vence` (negative once expired). Compared at
 * local-midnight granularity so partial days never miscount.
 */
export function diasRestantes(vence: Date, hoy: Date): number {
  const a = new Date(vence.getFullYear(), vence.getMonth(), vence.getDate());
  const b = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS — all `calcVigenciaEnd` and `diasRestantes` tests green.

- [ ] **Step 5: Commit**

```bash
git add src/domain/rules.ts src/domain/rules.test.ts
git commit -m "feat(domain): add calcVigenciaEnd + diasRestantes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `derivarEstado`

**Files:**
- Modify: `src/domain/rules.ts`
- Test: `src/domain/rules.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/domain/rules.test.ts`, replace the top `./rules` import line with (cumulative):

```ts
import { calcVigenciaEnd, derivarEstado, diasRestantes, stackPaquete } from "./rules";
```

Then append this describe block to the end of the file:

```ts
describe("derivarEstado", () => {
  it("is activo with classes and time to spare", () => {
    expect(derivarEstado({ clases: 8, dias: 20 })).toBe("activo");
    expect(derivarEstado({ clases: "ilimitado", dias: 20 })).toBe("activo");
  });
  it("is por_vencer at <= 5 days left", () => {
    expect(derivarEstado({ clases: 8, dias: 5 })).toBe("por_vencer");
    expect(derivarEstado({ clases: "ilimitado", dias: 3 })).toBe("por_vencer");
  });
  it("is por_vencer at <= 2 classes left", () => {
    expect(derivarEstado({ clases: 2, dias: 20 })).toBe("por_vencer");
  });
  it("is sin_clases when out of classes", () => {
    expect(derivarEstado({ clases: 0, dias: 20 })).toBe("sin_clases");
  });
  it("is sin_clases when expired", () => {
    expect(derivarEstado({ clases: 5, dias: 0 })).toBe("sin_clases");
    expect(derivarEstado({ clases: 5, dias: -2 })).toBe("sin_clases");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — `derivarEstado` is not exported.

- [ ] **Step 3: Implement the function**

In `src/domain/rules.ts`, replace the top type import line with (cumulative):

```ts
import type { Clases, CompraPaquete, EstadoCliente, Saldo, Vigencia } from "./types";
```

Then append this function:

```ts
/**
 * Derive a client's lifecycle state from what's left (ADR-0002 — never
 * stored). Replaces the stored `estado` field and the three conflicting
 * threshold checks scattered across the mock screens.
 *  - sin_clases: expired (dias <= 0) OR out of classes (clases <= 0)
 *  - por_vencer: <= 5 days left OR <= 2 classes left (not ilimitado)
 *  - activo: otherwise
 */
export function derivarEstado(saldo: Saldo): EstadoCliente {
  const expirado = saldo.dias <= 0;
  const sinClases = saldo.clases !== "ilimitado" && saldo.clases <= 0;
  if (expirado || sinClases) return "sin_clases";

  const pocosDias = saldo.dias <= 5;
  const pocasClases = saldo.clases !== "ilimitado" && saldo.clases <= 2;
  if (pocosDias || pocasClases) return "por_vencer";

  return "activo";
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS — all `derivarEstado` tests green.

- [ ] **Step 5: Commit**

```bash
git add src/domain/rules.ts src/domain/rules.test.ts
git commit -m "feat(domain): add derivarEstado (activo/por_vencer/sin_clases)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `consumirClase` + `forfeit`

**Files:**
- Modify: `src/domain/rules.ts`
- Test: `src/domain/rules.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/domain/rules.test.ts`, replace the top `./rules` import line with (cumulative):

```ts
import { calcVigenciaEnd, consumirClase, derivarEstado, diasRestantes, forfeit, stackPaquete } from "./rules";
```

Then append these describe blocks to the end of the file:

```ts
describe("consumirClase", () => {
  it("subtracts one class", () => {
    expect(consumirClase(5)).toBe(4);
  });
  it("never goes below zero", () => {
    expect(consumirClase(1)).toBe(0);
    expect(consumirClase(0)).toBe(0);
  });
  it("never decrements ilimitado", () => {
    expect(consumirClase("ilimitado")).toBe("ilimitado");
  });
});

describe("forfeit", () => {
  it("forfeits remaining classes once expired (brief Q2)", () => {
    expect(forfeit(5, -1)).toBe(0);
  });
  it("keeps classes while still valid", () => {
    expect(forfeit(5, 3)).toBe(5);
  });
  it("leaves ilimitado untouched", () => {
    expect(forfeit("ilimitado", -1)).toBe("ilimitado");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — `consumirClase` / `forfeit` are not exported.

- [ ] **Step 3: Implement the functions**

Append to `src/domain/rules.ts`:

```ts
/**
 * Consume one class for an attendance. Same-day duplicate attendance is
 * allowed and each still consumes a class (brief Q6). Ilimitado is never
 * decremented; a limited count never goes below 0.
 */
export function consumirClase(clases: Clases): Clases {
  if (clases === "ilimitado") return "ilimitado";
  return Math.max(0, clases - 1);
}

/**
 * On expiry, remaining classes are FORFEITED (brief Q2): returns 0 once
 * `dias` <= 0. Ilimitado has no count to forfeit; otherwise unchanged.
 */
export function forfeit(clases: Clases, dias: number): Clases {
  if (clases === "ilimitado") return "ilimitado";
  return dias <= 0 ? 0 : clases;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS — all `consumirClase` and `forfeit` tests green.

- [ ] **Step 5: Commit**

```bash
git add src/domain/rules.ts src/domain/rules.test.ts
git commit -m "feat(domain): add consumirClase + forfeit

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `renderPlantilla`

**Files:**
- Modify: `src/domain/rules.ts`
- Test: `src/domain/rules.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/domain/rules.test.ts`, replace the top `./rules` import line with (cumulative):

```ts
import { calcVigenciaEnd, consumirClase, derivarEstado, diasRestantes, forfeit, renderPlantilla, stackPaquete } from "./rules";
```

Then append this describe block to the end of the file:

```ts
describe("renderPlantilla", () => {
  it("substitutes known tokens", () => {
    expect(
      renderPlantilla("Hola {nombre}, te quedan {clases}.", {
        nombre: "Andrea",
        clases: "5 clases",
      }),
    ).toBe("Hola Andrea, te quedan 5 clases.");
  });
  it("leaves unknown tokens intact so typos are visible", () => {
    expect(renderPlantilla("Saldo {desconocido}", {})).toBe("Saldo {desconocido}");
  });
  it("substitutes the datos_pago block", () => {
    expect(renderPlantilla("{datos_pago}", { datos_pago: "CLABE 123" })).toBe("CLABE 123");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — `renderPlantilla` is not exported.

- [ ] **Step 3: Implement the function**

In `src/domain/rules.ts`, replace the top type import line with (cumulative):

```ts
import type { Clases, CompraPaquete, EstadoCliente, PlantillaContext, Saldo, Vigencia } from "./types";
```

Then append this function:

```ts
/**
 * Render a WhatsApp template body by substituting {token} placeholders from
 * `ctx`. Unknown tokens are left intact so a typo is visible, not silently
 * blanked. The single home for message rendering — screens must not
 * hand-build message strings (replaces the two inline builders in the mock).
 */
export function renderPlantilla(body: string, ctx: PlantillaContext): string {
  return body.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = ctx[key as keyof PlantillaContext];
    return value ?? match;
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS — full suite green (stackPaquete, calcVigenciaEnd, diasRestantes, derivarEstado, consumirClase, forfeit, renderPlantilla).

- [ ] **Step 5: Commit**

```bash
git add src/domain/rules.ts src/domain/rules.test.ts
git commit -m "feat(domain): add renderPlantilla token substitution

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase 2 — Enforcement (the anti-rot boundary)

### Task 6: dependency-cruiser boundary rule

**Files:**
- Create: `.dependency-cruiser.cjs`
- Modify: `package.json` (lint script)

- [ ] **Step 1: Install dependency-cruiser**

Run: `pnpm add -D dependency-cruiser`
Expected: installs cleanly. (No native build scripts; if pnpm flags any, add them to `pnpm-workspace.yaml` allowBuilds and `pnpm install`.)

- [ ] **Step 2: Create the config**

Create `.dependency-cruiser.cjs`:

```cjs
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "domain-data-no-upward-ui",
      comment:
        "The domain core and data/lib layer must NEVER import UI or framework " +
        "code. Keeps the domain pure/testable and the data seam swappable " +
        "(ADR-0001/0002). If you hit this, the rule belongs in src/domain, not a screen.",
      severity: "error",
      from: { path: "^src/(domain|lib)" },
      to: { path: "^src/(components|app)" },
    },
    {
      name: "no-circular",
      comment: "Circular dependencies make the module graph impossible to reason about.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    // Resolve the @/* alias from tsconfig so import paths match the rules.
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
  },
};
// NOTE: `no-orphans` is intentionally omitted this phase — the freshly-created
// domain core is not yet wired into screens (that happens in the Supabase
// migration cycle). Enable it then, once everything has a caller.
```

- [ ] **Step 3: Wire it into the lint script**

Modify `package.json` `lint` script to:

```json
    "lint": "eslint . && depcruise src --config .dependency-cruiser.cjs",
```

- [ ] **Step 4: Run lint to verify the boundary is green**

Run: `pnpm lint`
Expected: PASS — eslint clean, and dependency-cruiser reports no violations (`no dependency violations found`). The domain core imports nothing inward and `src/lib/*` imports no UI, so the boundary already holds.

- [ ] **Step 5: Commit**

```bash
git add .dependency-cruiser.cjs package.json pnpm-lock.yaml
git commit -m "chore(arch): enforce domain/lib cannot import UI (dependency-cruiser)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Pre-commit hook

**Files:**
- Create: `.husky/pre-commit`
- Modify: `package.json` (prepare script, added by husky)

- [ ] **Step 1: Install Husky**

Run: `pnpm add -D husky`

- [ ] **Step 2: Initialize Husky**

Run: `pnpm exec husky init`
Expected: creates `.husky/pre-commit` (default content `npm test`) and adds `"prepare": "husky"` to `package.json`.

- [ ] **Step 3: Set the pre-commit command**

Overwrite `.husky/pre-commit` with exactly:

```sh
pnpm lint
```

(Husky v9 needs only the command — no shebang or sourcing. This runs eslint + the dependency-cruiser boundary on every commit, which is the anti-rot guarantee.)

- [ ] **Step 4: Verify the hook fires**

Run: `git add .husky/pre-commit package.json pnpm-lock.yaml && git commit -m "chore(arch): pre-commit hook runs pnpm lint (boundary guard)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`
Expected: the commit runs `pnpm lint` first (you'll see lint output), then succeeds with a clean tree.

---

## Phase 3 — Structural moves (route-colocate the screens)

### Task 8: Move screens into their route `_components`

**Files:**
- Move: `src/components/forge/screens/inicio.tsx` → `src/app/(app)/inicio/_components/inicio.tsx`
- Move: `src/components/forge/screens/asistencia.tsx` → `src/app/(app)/asistencia/_components/asistencia.tsx`
- Move: `src/components/forge/screens/clientes.tsx` → `src/app/(app)/clientes/_components/clientes.tsx`
- Move: `src/components/forge/screens/cliente-detalle.tsx` → `src/app/(app)/clientes/[id]/_components/cliente-detalle.tsx`
- Move: `src/components/forge/screens/vender.tsx` → `src/app/(app)/vender/_components/vender.tsx`
- Move: `src/components/forge/screens/cuenta.tsx` → `src/app/(app)/cuenta/_components/cuenta.tsx`
- Modify: each corresponding `src/app/(app)/<route>/page.tsx` (the screen import path only)

The screens import shared code via the `@/` alias (e.g. `@/components/forge/ui`, `@/lib/data/store`), which is unaffected by the move. Only each page's import of its screen changes. `_components` (underscore) folders are non-routable in Next 16.

- [ ] **Step 1: Move the five top-level screens**

Run:

```bash
mkdir -p "src/app/(app)/inicio/_components" "src/app/(app)/asistencia/_components" "src/app/(app)/clientes/_components" "src/app/(app)/vender/_components" "src/app/(app)/cuenta/_components"
git mv src/components/forge/screens/inicio.tsx "src/app/(app)/inicio/_components/inicio.tsx"
git mv src/components/forge/screens/asistencia.tsx "src/app/(app)/asistencia/_components/asistencia.tsx"
git mv src/components/forge/screens/clientes.tsx "src/app/(app)/clientes/_components/clientes.tsx"
git mv src/components/forge/screens/vender.tsx "src/app/(app)/vender/_components/vender.tsx"
git mv src/components/forge/screens/cuenta.tsx "src/app/(app)/cuenta/_components/cuenta.tsx"
```

- [ ] **Step 2: Move the client-detail screen**

Run:

```bash
mkdir -p "src/app/(app)/clientes/[id]/_components"
git mv src/components/forge/screens/cliente-detalle.tsx "src/app/(app)/clientes/[id]/_components/cliente-detalle.tsx"
```

- [ ] **Step 3: Update each page's import path**

In each route's `page.tsx`, change the screen import from the old `@/components/forge/screens/...` path to the colocated relative path. Open each `page.tsx` and update the one import line:

- `src/app/(app)/inicio/page.tsx`: `import { InicioScreen } from "./_components/inicio";`
- `src/app/(app)/asistencia/page.tsx`: `import { AsistenciaScreen } from "./_components/asistencia";`
- `src/app/(app)/clientes/page.tsx`: `import { ClientesScreen } from "./_components/clientes";`
- `src/app/(app)/clientes/[id]/page.tsx`: `import { ClienteDetalle } from "./_components/cliente-detalle";`
- `src/app/(app)/vender/page.tsx`: `import { VenderScreen } from "./_components/vender";`
- `src/app/(app)/cuenta/page.tsx`: `import { CuentaScreen } from "./_components/cuenta";`

(Keep the export names and JSX usage exactly as they were — only the import source changes. If any page imported a screen under a different local name, preserve that name.)

- [ ] **Step 4: Confirm the old screens directory is gone**

Run: `git status --short`
Expected: shows the renames (`R`) for the six screens and modifications (`M`) to the six pages; `src/components/forge/screens/` no longer exists.

- [ ] **Step 5: Verify the app still builds**

Run: `pnpm build`
Expected: build succeeds. (If — and only if — the build fails on `clientes/[id]` with an async-`params` error, that is a pre-existing Next 16 issue unrelated to the move: `await params` in that page per ADR-0001's note on async request APIs, then rebuild. Do not change any other behavior.)

- [ ] **Step 6: Verify the boundary still holds**

Run: `pnpm lint`
Expected: PASS. Screens now live under `src/app` and import `@/components` + `@/lib` downward — allowed. The boundary rule (`domain`/`lib` ✗→ `components`/`app`) is unaffected.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(arch): colocate screens under their route _components

Pure move — behavior unchanged, app still runs on mock data.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase 4 — Documentation (the map)

### Task 9: `CONTEXT.md` (es-MX domain glossary)

**Files:**
- Create: `CONTEXT.md`

- [ ] **Step 1: Create the glossary**

Create `CONTEXT.md`:

```markdown
# Forge — Domain Glossary (es-MX)

The ubiquitous language of the gym. Every domain noun maps to a TypeScript
type and a file, so a rename surfaces drift. Distilled from the client brief
(`docs/superpowers/specs/2026-05-27-forge-gym-admin-architecture.md`).

| Término | Significado | Dónde vive en el código |
|---|---|---|
| **cliente** | A gym member. | `Cliente` — `src/lib/data/types.ts` (→ `src/domain/types.ts` at migration) |
| **ficha** | A client's detail/profile screen. | `src/app/(app)/clientes/[id]/` |
| **paquete** | A class package: 8 clases / 12 clases / Ilimitado. | `Paquete` — `src/lib/data/types.ts` |
| **vigencia** | A package's validity window (días, or the calendar month for Ilimitado). | `Vigencia` + `calcVigenciaEnd` — `src/domain/` |
| **asistencia** / **pase de lista** | Recording that a client attended. | `src/app/(app)/asistencia/` |
| **venta** | Selling/renewing a package. | `src/app/(app)/vender/` |
| **recibo** | The sale receipt. | `src/app/(app)/vender/_components/` |
| **estado** | Derived lifecycle: `activo` / `por_vencer` / `sin_clases`. Never stored. | `EstadoCliente` + `derivarEstado` — `src/domain/` |
| **clases restantes** | Classes left (a number, or `ilimitado`). | `Clases` (`Saldo.clases`) — `src/domain/types.ts` |
| **stacking** | Buying a package early ADDS its classes + days onto the current one. | `stackPaquete` — `src/domain/rules.ts` |
| **forfeit** | Remaining classes are lost when the vigencia expires. | `forfeit` — `src/domain/rules.ts` |
| **plantilla** | A WhatsApp message template with `{token}` placeholders. | `renderPlantilla` — `src/domain/rules.ts` |
| **cobro** | Payment/bank details for transfers (titular, banco, CLABE). | `Cobro` — `src/lib/data/types.ts` |
| **por pagar** / **pendiente** | An optional unpaid sale. | `MetodoPago` `"pendiente"` — `src/domain/types.ts` |

**Flagged tension:** the brief marks phone *optional* (Q4), but WhatsApp retention is the app's reason to exist, so phone is treated as *required* in practice. Email and birthday are optional stored fields (brief Q4). Brand name is **"FORGE"** (Q10) — not "Forge Bootcamp" (a mock string to be removed).
```

- [ ] **Step 2: Commit**

```bash
git add CONTEXT.md
git commit -m "docs(arch): add es-MX domain glossary (CONTEXT.md)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: The three ADRs

**Files:**
- Create: `docs/adr/0001-supabase-rls-no-orm.md`
- Create: `docs/adr/0002-derived-not-stored.md`
- Create: `docs/adr/0003-stacking-forfeit-dates.md`

- [ ] **Step 1: Create ADR-0001**

Create `docs/adr/0001-supabase-rls-no-orm.md`:

```markdown
# ADR-0001 — Supabase + RLS, no ORM

**Status:** Accepted — 2026-05-29

## Context
Forge holds a single gym's private client data, operated by one person. The
stack is locked: Next.js 16 + Supabase. We need a security model and a data
shape that a solo dev (and AI agents) can audit easily.

## Decision
- Use **Supabase** for DB + auth. **RLS is the primary security boundary** —
  every table gets RLS enabled with policies keyed to `(select auth.uid())`.
- **No ORM.** Use `supabase-js` directly inside a `server-only` Data Access
  Layer (`src/lib/data/<sector>.ts`) that returns DTOs and calls `src/domain`
  rules. The DAL is the single place every DB touch lives (auditable).
- Auth via **`@supabase/ssr`** httpOnly cookie sessions; route-gating in
  **`proxy.ts`** — Next 16 renamed `middleware.ts` → `proxy.ts` (Node runtime
  only). Do not reintroduce `middleware.ts`.
- Authorize inside server code with `getClaims()` / `getUser()`, never
  `getSession()`.

## Consequences
- Reads happen in Server Components via the DAL; writes via thin Server Actions
  that re-auth, validate (Zod), and delegate to the DAL.
- Supabase is **not installed yet**: the exact client/cookie/auth API shapes
  (`createBrowserClient`/`createServerClient`, `getAll`/`setAll`) are
  verify-at-implementation, confirmed against `@supabase/ssr` when added.
- The cookie adapter must implement only `getAll`/`setAll` (not get/set/remove).
```

- [ ] **Step 2: Create ADR-0002**

Create `docs/adr/0002-derived-not-stored.md`:

```markdown
# ADR-0002 — Derived, not stored

**Status:** Accepted — 2026-05-29

## Context
The cloned mock stores `estado`, `vence`, `diasRest`, `asistEsteMes`, and
`inicial` as fields on the client record. These are projections of other
facts; storing them guarantees drift the moment any mutation happens (the
mock already patches `asistEsteMes + (asistHoy ? 1 : 0)` by hand).

## Decision
Persist only **stored facts** (id, nombre, tel, optional email/birthday,
purchase history, attendance rows). Compute **`estado`, `vence`, `diasRest`,
`asistEsteMes`, `inicial`** at read time via `src/domain` rules
(`derivarEstado`, `calcVigenciaEnd`, `diasRestantes`).

## Consequences
- One source of truth per projection; no dual-write bugs.
- The seed's stored projection fields are mock-only and are removed when the
  Supabase schema lands (see `docs/MIGRATION.md`).
- `src/domain/rules.ts` is the single home for these derivations and is unit-tested.
```

- [ ] **Step 3: Create ADR-0003**

Create `docs/adr/0003-stacking-forfeit-dates.md`:

```markdown
# ADR-0003 — Stacking, forfeit & the date model

**Status:** Accepted — 2026-05-29

## Context
The brief answers several domain questions (Q1, Q2, Q3, Q5, Q6) that define how
packages and attendance behave. The mock implements none of them and models
attendance as integer offsets from a hardcoded `DEMO_TODAY`, which cannot
represent arbitrary past dates — breaking the brief's "enter a week at once" need.

## Decision
- **Stacking (Q5):** buying a package early **adds** its classes and days onto
  the current package (additive, not a re-based window). `stackPaquete`.
- **Forfeit (Q2):** when the vigencia expires, remaining classes are forfeited.
  `forfeit`.
- **Classes-out (Q3):** reaching 0 classes ends the package (`sin_clases`).
- **Same-day duplicates (Q6):** allowed; each attendance consumes a class.
  `consumirClase`.
- **Ilimitado vigencia (Q1):** runs to the **end of the purchase calendar
  month**. `calcVigenciaEnd(date, "mes")`.
- **Date model:** attendance is stored as **absolute America/Chihuahua calendar
  dates** (one row per attendance), never offsets.

## Consequences
- These rules live in `src/domain/rules.ts`, unit-tested against the brief's
  worked examples.
- At migration, the absolute-date model replaces `VIG_END` and the
  offset-keyed `PaseGrid`, and unblocks bulk back-entry.
```

- [ ] **Step 4: Commit**

```bash
git add docs/adr
git commit -m "docs(arch): record ADRs 0001-0003 (supabase/rls, derived-not-stored, stacking)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: `ARCHITECTURE.md` + AGENTS.md sector map

**Files:**
- Create: `ARCHITECTURE.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Create ARCHITECTURE.md**

Create `ARCHITECTURE.md`:

```markdown
# Forge — Architecture Map

**Read this first.** Forge is a single-operator gym admin app (es-MX). The
folders below scream the domain; this page is the map.

## You are here → start reading
1. `CONTEXT.md` — the vocabulary.
2. `src/domain/` — the business rules (pure, tested). How the gym works.
3. `src/app/(app)/` — the screens, one folder per sector.
4. `src/lib/data/` — the data seam (mock today, Supabase later).
5. `docs/adr/` — why the structure is the way it is.

## Sectors
| Sector | Folder | Job | May import |
|---|---|---|---|
| inicio | `src/app/(app)/inicio` | Dashboard / home metrics | domain, lib, components |
| asistencia | `src/app/(app)/asistencia` | Pase de lista (attendance) | domain, lib, components |
| clientes | `src/app/(app)/clientes` | Roster + ficha (detail) | domain, lib, components |
| vender | `src/app/(app)/vender` | Venta + recibo (sell/renew) | domain, lib, components |
| cuenta | `src/app/(app)/cuenta` | Perfil + ajustes | domain, lib, components |
| **domain core** | `src/domain` | Business rules (pure) | **nothing in `src/`** |
| data seam | `src/lib/data` | Persistence (mock → Supabase) | domain |
| shared utils | `src/lib/{date,format,utils}` | Helpers | — |
| UI kit | `src/components/forge` | Visual primitives | lib/utils |

## The dependency arrow (enforced)
`components` (UI kit) + `lib/utils` ← used by ← `app` screens → call → `domain` + `lib/data`.
`lib/data` → `domain`. **`domain` imports nothing inward.** No screen imports another screen's `_components`; cross-sector composition happens at the route.

This direction is machine-enforced: `.dependency-cruiser.cjs` fails the build/commit if `src/domain` or `src/lib` imports `src/components` or `src/app`.

## Where do I add X?
- A business rule (how the gym works) → `src/domain/rules.ts` (+ a test in `rules.test.ts`).
- A new screen/page → `src/app/(app)/<sector>/page.tsx` (+ `_components/`).
- A reusable visual primitive → `src/components/forge`.
- A persisted entity / query → `src/lib/data` (the seam).
- A pure formatting/date helper → `src/lib/{format,date,utils}.ts`.
- A locked decision → a new `docs/adr/NNNN-*.md`.
```

- [ ] **Step 2: Add a sector map pointer to AGENTS.md**

Append to `AGENTS.md`:

```markdown

# Architecture

This repo follows a **sector-first** structure. **Read `ARCHITECTURE.md` first** —
it is the map (sectors, the enforced dependency arrow, and "where do I add X?").
Domain vocabulary is in `CONTEXT.md`; locked decisions are in `docs/adr/`.
The boundary `src/domain` + `src/lib` ✗→ `src/components` + `src/app` is enforced
by `.dependency-cruiser.cjs` and runs on every commit (`pnpm lint`).
```

- [ ] **Step 3: Verify lint still passes (docs don't break the boundary)**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add ARCHITECTURE.md AGENTS.md
git commit -m "docs(arch): add ARCHITECTURE.md map + AGENTS.md pointer

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: `src/lib/data/README.md` (the seam contract)

**Files:**
- Create: `src/lib/data/README.md`

- [ ] **Step 1: Create the seam README**

Create `src/lib/data/README.md`:

```markdown
# Data seam

The single boundary between screens and persistence. **Mock today
(localStorage), Supabase tomorrow — the hook shapes do not change.**

## Today (mock)
- `store.ts` — `createStore<T>(key, seed)` + `useStore` (React `useSyncExternalStore`)
  exposing per-aggregate hooks: `useClientes`, `usePaquetes`, `usePase`,
  `useAsistTimes`, `usePerfil`, `useCobro`, `usePlantillas`, plus non-reactive
  getters (`getClientes`, `getPaquetes`, `getCobro`).
- `seed.ts` — mock seed data. **Mock-only; deleted at migration.**
- `types.ts` — legacy mock types; converge onto `src/domain/types.ts`.

## The swap to Supabase (next cycle — ADR-0001)
1. Add `src/lib/supabase/{client,server}.ts` (`@supabase/ssr`).
2. Add `server-only` DAL modules per sector here (`clientes.ts`, `paquetes.ts`,
   `asistencia.ts`, `ventas.ts`) that query via `supabase-js`, shape DTOs, and
   call `src/domain` rules (e.g. `derivarEstado`, `stackPaquete`).
3. Reads move into Server Components calling the DAL; writes into Server Actions.
4. Keep the same hook/DTO shapes so screens change minimally.

**Rule:** nothing in this folder may import from `src/components` or `src/app`
(enforced by `.dependency-cruiser.cjs`).
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/data/README.md
git commit -m "docs(arch): document the data seam swap contract

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: `docs/MIGRATION.md` (the mock→real backlog)

**Files:**
- Create: `docs/MIGRATION.md`

- [ ] **Step 1: Create the migration backlog**

Create `docs/MIGRATION.md`:

```markdown
# Forge — Mock → Real Migration Backlog

The sequenced work to make Forge functional on Supabase. Feeds `/to-prd →
/to-issues → /to-goal`. Dependency order: **domain core first** (done — it is
pure and tested), then per sector. Wiring the tested `src/domain` rules into
screens happens here, through the DAL.

## Mock-isms to replace
| Artifact | Location | Replace with |
|---|---|---|
| Stored `estado`/`inicial`/`vence`/`asistEsteMes` | `lib/data/types.ts`, `seed.ts` | derived via `derivarEstado` / `calcVigenciaEnd` at read |
| `VIG_END` magic end-dates | `(app)/vender/_components/vender.tsx` | `calcVigenciaEnd` |
| `setTimeout(700)` fake sale + random folio | `(app)/vender/_components/vender.tsx` | real `crearVenta` Server Action; DB folio |
| `HOY` hardcoded metrics | `seed.ts` | `calcularResumenMes` over real ventas + asistencias |
| `HISTORIAL` / `PAGOS` inline arrays | `(app)/clientes/[id]/_components/cliente-detalle.tsx` | queries by `cliente_id` |
| `recientes` hardcoded list | `(app)/inicio/_components/inicio.tsx` | query: today's attendance |
| `PASE_SEED` / `ASIST_TIMES_SEED` + offset grid | `seed.ts`, `lib/date.ts` | `asistencia` rows with absolute Chihuahua-local dates |
| "Forge Bootcamp" string (~5 spots) | layout metadata, recibo, WA body, seed | "FORGE", stored once |

## Per-sector slices (tracer bullets: schema → DAL → action → screen)
1. **domain/** — DONE. Pure rules implemented + tested. Everything below wires these in.
2. **ventas** — Server Action calls `stackPaquete`, persists the `venta`, mutates
   the cliente (classes+days stacked), DB folio, then `updateTag('clientes','max')`. Receipt rendering stays.
3. **asistencia** — `togglePase` → Server Action inserting/soft-deleting an
   `asistencia` row (absolute date) + calling `consumirClase`. Bulk back-entry supported.
4. **clientes** — `estado`/`vence`/`diasRest`/`asistEsteMes` derived at read via the
   DAL calling domain rules; `HISTORIAL`/`PAGOS` → queries; reactivation keeps history.
5. **retencion** — `SEED_PLANTILLAS` → `plantilla` table; `renderPlantilla` substitutes
   real tokens; `waLink` prefixes `+52`.
6. **cuenta** — `HOY` → `calcularResumenMes`; sub-editors stay "próximamente" stubs.

## Prerequisites (next cycle, before slice 2)
- Install `@supabase/ssr` + `@supabase/supabase-js`; create `src/lib/supabase/{client,server}.ts`.
- Design the schema (clientes, paquetes, ventas, asistencias, plantillas, cobro, perfil) with RLS. `clientes` stores optional `email` + `birthday` (brief Q4); phone is required (the WhatsApp spine). See the design spec §8 (field reconciliations) and §11 (full Next 16 + Supabase API notes: `updateTag`, async request APIs, `@supabase/ssr` `getAll`/`setAll`, etc.).
- Add `proxy.ts` session refresh + a single-operator login.
```

- [ ] **Step 2: Commit**

```bash
git add docs/MIGRATION.md
git commit -m "docs(arch): add mock-to-real migration backlog

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Done criteria

- `pnpm test` — full domain suite green (7 functions).
- `pnpm lint` — eslint clean + dependency-cruiser boundary green.
- `pnpm build` — app compiles and still runs on mock data.
- Pre-commit hook runs `pnpm lint` on every commit.
- Structure matches `ARCHITECTURE.md`; every sector folder exists; `src/components/forge/screens/` is gone.
- Docs present: `CONTEXT.md`, `ARCHITECTURE.md`, `docs/adr/0001-0003`, `src/lib/data/README.md`, `docs/MIGRATION.md`.

**Next cycle:** hand `docs/MIGRATION.md` to `/to-prd` to slice the Supabase implementation (install Supabase, schema + RLS, DAL, Server Actions, wire the domain core into screens, auth).
```
