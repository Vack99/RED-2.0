# Coverage loop — the contract

**Goal:** `pnpm test:coverage` exits 0. That is the whole stop condition; it fails until
statements, branches, functions, and lines all hit 100% of the include set
(`vitest.config.ts` → `test.coverage`).

## Each iteration

```bash
pnpm test:coverage          # runs the suite + writes coverage/
node tools/coverage-worklist.mjs   # totals + remaining files, ranked by uncovered lines
```

Take the top file off the worklist, cover it, re-run. Do not skip ahead: the ranking is
by uncovered lines, so it is also roughly the ranking by risk.

## Scope (decided 2026-07-14, owner)

**In:** the `.ts` logic tier — 100 files. `packages/{domain,format,data,ui,brand}`,
`apps/*/src/**/*.ts` (server actions, proxies, route handlers, lib), `supabase/functions`,
`tools/guards`.

**Out, deliberately:** the 95 `.tsx` components and the Next.js page/layout tree. This repo
has no DOM test infra (no jsdom, no `@testing-library`) and every vitest project runs
`environment: "node"`. Also out: the generated `database.types.ts` and the Deno shell
`supabase/functions/**/index.ts` (imports Deno APIs, cannot load under node).

Both exclusions are stated in `vitest.config.ts` with their reasons. Adding component
coverage is a separate decision — do not smuggle it in by widening a glob.

## What counts as a test

A test that fails when the behavior is wrong. Not a test that merely executes the line.

The number is a proxy, and this loop is capable of gaming its own proxy. Specifically
banned:

- Calling a function and asserting nothing, or asserting only `not.toThrow()`.
- Asserting a mock was called, when the real contract is the value it returned or the row
  it wrote.
- Snapshotting current output to lock in whatever it happens to do today.
- Deleting or weakening an existing assertion to make a run go green.
- Widening `coverage.exclude` to make a hard file disappear. If a file genuinely should
  not be covered, say so and get it agreed — do not edit the glob and move on.

If covering a line requires contorting the test, that is a signal about the code, not the
test. Say so instead of contorting.

## 100% does NOT mean the database is covered

`packages/data` mocks the RPC boundary, so the 25 write RPCs are invisible to vitest **by
design** (AGENTS.md). A green 100% here says nothing about whether `registrar_venta`
stamps the right `gym_id`. That contract is proven only by `pnpm test:denial` against a
scratch project. Never report 100% as "fully covered" without this caveat.

## The v8 branch artifact escape hatch

The v8 provider counts TypeScript-downleveled constructs as branches: default parameters,
optional chaining (`?.`), nullish coalescing (`??`), and untaken `catch` paths. Some of
these are **genuinely unreachable** from a test — 13 files below already sit at 100% lines
and 100% functions while still carrying uncovered branches.

When a branch is provably unreachable (not merely inconvenient):

```ts
/* v8 ignore next -- <why it cannot be reached> */
```

The comment **must** carry a reason. An ignore without a justification is the same sin as
widening the exclude glob. If unreachable branches turn out to be widespread, the honest
fix is switching `coverage.provider` to `istanbul`, which models branches closer to the
source — raise that rather than papering over dozens of lines.

## Baseline (worktree `worktree-coverage-100`, from `main` @ dcfd9b3)

```
statements   75.77%  (1958/2584)
branches     68.23%  (1246/1826)
functions    77.33%  (471/609)
lines         77.2%  (1680/2176)

32/100 files at 100% · 68 remaining · 496 lines, 580 branches, 138 fns uncovered
```

The head of the queue is the untested **Next.js server actions** (`vender`, `registro`,
`reservar`, `agenda`, `asistencia`, `cuenta`, `contacto`, `entrar`) and both `proxy.ts`
tenant seams — the mutation entry points. That is where the risk actually is.

## Ground rules

- `pnpm test` stays ungated and fast (~4s); the pre-commit hook is untouched. Coverage is
  only ever read via `pnpm test:coverage`.
- Never weaken the 964 tests that already pass.
- Commit per file (or per tight cluster), so a bad test is one `git revert`, not an
  archaeology dig.
